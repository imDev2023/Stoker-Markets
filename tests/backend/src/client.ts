// What a client of the platform does: call the public API, sign with a wallet, send to the chain.
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { inject } from "vitest";
import {
  LaunchList, LaunchSummary, PlatformInfo, PreparedLaunch, PreparedTrade, QuoteAssetList, TradeList, type PayWith, type TradeSide,
} from "@launchpad/contract";
import { WSOL_MINT, type RawTransaction } from "@launchpad/chain";
import { QUOTE_REGISTRY_CRON } from "@launchpad/stack";

export const env = () => inject("harness");
export const connection = () => new Connection(env().rpcUrl, "confirmed");

/** A valid 1x1 PNG. */
export const PNG = Uint8Array.from(
  Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360f8ffff3f0005fe02fea7d6a9840000000049454e44ae426082", "hex"),
);

export async function fundedWallet(sol = 5) {
  const kp = Keypair.generate();
  const conn = connection();
  const sig = await conn.requestAirdrop(kp.publicKey, sol * LAMPORTS_PER_SOL);
  await conn.confirmTransaction({ signature: sig, ...(await conn.getLatestBlockhash("confirmed")) }, "confirmed");
  return kp;
}

export type LaunchForm = {
  creator: string;
  /** Defaults to SOL. */
  quoteMint?: string;
  name?: string;
  symbol?: string;
  description?: string;
  website?: string;
  x?: string;
  telegram?: string;
  image?: { bytes: Uint8Array; type: string } | null;
  /** Quote Asset raw units. */
  firstBuy?: string;
  /** Basis points, as the form sends it: "100", "300" or "500". */
  rewardTax?: string;
  /** A Reward Launch's Payout Asset, "coin" or "quote"; the API takes "coin" when left out. */
  rewardPayout?: string;
  /** Sent as the JSON text the multipart form carries; a string is sent as it is. */
  airdrop?: { wallet: string; amount: string }[] | string;
  /** Leaves the Creator off the operator's airdrop list, to see the API refuse; otherwise `prepare` allows a Creator who sends an airdrop. */
  unlisted?: boolean;
  /**
   * Sends `name` and `symbol` exactly as given. Otherwise a four-character tag is added to both, so that the files that
   * launch "PAYS" or "Board Sold" from one fresh wallet after another are not refused as copies of each other by Copy
   * Protection inside the stack's window; the tag keeps a five-letter ticker within the ten the form allows.
   */
  exact?: boolean;
};

/** Operator: allows a Creator wallet an airdrop at launch; nobody may have one until then. */
export async function allowAirdrops(wallet: string) {
  const res = await fetch(`${env().apiUrl}/v1/operator/airdrop-creators`, {
    method: "POST",
    headers: { authorization: `Bearer ${env().operatorToken}`, "content-type": "application/json" },
    body: JSON.stringify({ wallet }),
  });
  if (!res.ok) throw new Error(`allowing ${wallet} an airdrop failed: ${res.status} ${await res.text()}`);
}

/** Six letters and digits no other launch of this process gets, short enough for a ticker beside a one-letter prefix. */
export function uniqueTag() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => alphabet[b % alphabet.length]).join("");
}

export async function prepare(form: LaunchForm) {
  const body = new FormData();
  const { airdrop, unlisted, exact, ...rest } = form;
  if (airdrop !== undefined && !unlisted) await allowAirdrops(form.creator);
  // A name and ticker of their own for each launch: Copy Protection refuses a second coin with a launched coin's name or
  // ticker for the test stack's window, and every test's launches would otherwise be copies of the first.
  const tag = uniqueTag();
  const fields = { name: `Tracer ${tag}`, symbol: `T${tag}`, description: "A tracer bullet", quoteMint: WSOL_MINT.toBase58(), ...rest };
  if (!exact) {
    const short = tag.slice(0, 4);
    // An empty name or ticker stays empty: a test that sends one wants it refused.
    if (rest.name) fields.name = `${rest.name} ${short}`;
    if (rest.symbol) fields.symbol = `${rest.symbol}${short.slice(0, Math.max(0, 10 - rest.symbol.length))}`;
  }
  for (const [k, v] of Object.entries(fields)) if (typeof v === "string") body.set(k, v);
  if (airdrop !== undefined) body.set("airdrop", typeof airdrop === "string" ? airdrop : JSON.stringify(airdrop));
  const image = form.image === undefined ? { bytes: PNG, type: "image/png" } : form.image;
  if (image) body.set("image", new Blob([image.bytes], { type: image.type }), "logo.png");
  return fetch(`${env().apiUrl}/v1/launches/prepare`, { method: "POST", body });
}

export type TransactionOutcome = { signature: string; err: { InstructionError?: [number, unknown] } | null };

/**
 * Waits for a sent transaction and says how it ended. web3.js's `confirmTransaction` reports a failure two ways: as
 * `value.err` when the failure arrives on its subscription, and as a rejection with the raw error object when the
 * transaction had already failed by the time it looked (always the case on a chain as fast as Surfpool); either way the
 * error is returned here, without the extra keys some RPCs add to it.
 */
export async function confirmOutcome(conn: Connection, signature: string, blockhash: string, lastValidBlockHeight: number): Promise<TransactionOutcome> {
  try {
    const result = await conn.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
    return { signature, err: normalizeError(result.value.err) };
  } catch (e) {
    if (e && typeof e === "object" && !(e instanceof Error) && "InstructionError" in e) return { signature, err: normalizeError(e) };
    throw e;
  }
}

function normalizeError(err: unknown): TransactionOutcome["err"] {
  if (!err || typeof err !== "object") return err ? (err as TransactionOutcome["err"]) : null;
  const { InstructionError } = err as { InstructionError?: [number, unknown] };
  return InstructionError ? { InstructionError } : (err as TransactionOutcome["err"]);
}

/** Sends a signed transaction without the RPC's preflight, so a failing one lands on-chain and charges its fee. */
export async function sendLanding(p: { transaction: string; lastValidBlockHeight: number }, signer: Keypair): Promise<TransactionOutcome> {
  const tx = VersionedTransaction.deserialize(Buffer.from(p.transaction, "base64"));
  tx.sign([signer]);
  const conn = connection();
  const signature = await conn.sendTransaction(tx, { skipPreflight: true });
  return confirmOutcome(conn, signature, tx.message.recentBlockhash, p.lastValidBlockHeight);
}

/** The wallet side: add the signer's signature to a transaction the API prepared and send it. */
export async function signAndSend(prepared: { transaction: string; lastValidBlockHeight: number }, signer: Keypair) {
  const tx = VersionedTransaction.deserialize(Buffer.from(prepared.transaction, "base64"));
  tx.sign([signer]);
  const conn = connection();
  const signature = await conn.sendTransaction(tx);
  await conn.confirmTransaction(
    { signature, blockhash: tx.message.recentBlockhash, lastValidBlockHeight: prepared.lastValidBlockHeight },
    "confirmed",
  );
  return signature;
}

export async function launch(creator: Keypair, form: Omit<LaunchForm, "creator"> = {}) {
  const res = await prepare({ creator: creator.publicKey.toBase58(), ...form });
  if (!res.ok) throw new Error(`prepare failed: ${res.status} ${await res.text()}`);
  const prepared = PreparedLaunch.parse(await res.json());
  const signature = await signAndSend(prepared, creator);
  return { prepared, signature };
}

/** The transaction exactly as a Helius raw webhook delivers it (the RPC `getTransaction` JSON encoding). */
export async function rawTransaction(signature: string): Promise<RawTransaction> {
  const res = await fetch(env().rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getTransaction",
      params: [signature, { encoding: "json", commitment: "confirmed", maxSupportedTransactionVersion: 0 }],
    }),
  });
  const body = (await res.json()) as { result: RawTransaction | null };
  if (!body.result) throw new Error(`transaction ${signature} not found`);
  return body.result;
}

export async function deliverWebhook(signatures: string[], authorization = env().webhookSecret) {
  const txs = await Promise.all(signatures.map(rawTransaction));
  return fetch(`${env().apiUrl}/v1/webhooks/helius`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization },
    body: JSON.stringify(txs),
  });
}

export async function listLaunches() {
  const res = await fetch(`${env().apiUrl}/v1/launches`);
  return LaunchList.parse(await res.json()).launches;
}

export async function getLaunch(mint: string) {
  const res = await fetch(`${env().apiUrl}/v1/launches/${mint}`);
  return { status: res.status, launch: res.ok ? LaunchSummary.parse(await res.json()) : null };
}

/** Runs the Worker's scheduled handler as its Cron Trigger would: the Quote Registry refresh. */
export async function refreshQuoteRegistry() {
  const res = await fetch(`${env().apiUrl}/__scheduled?cron=${encodeURIComponent(QUOTE_REGISTRY_CRON)}`);
  if (!res.ok) throw new Error(`refresh failed: ${res.status} ${await res.text()}`);
}

export async function listQuotes() {
  const res = await fetch(`${env().apiUrl}/v1/quotes`);
  return QuoteAssetList.parse(await res.json()).quotes;
}

type TradeBody = { mint: string; trader: string; side: TradeSide; amount: string; slippageBps?: number; payWith?: PayWith };

export function prepareTrade(body: TradeBody) {
  return fetch(`${env().apiUrl}/v1/trades/prepare`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function prepared(trader: Keypair, mint: string, side: TradeSide, amount: bigint, slippageBps = 100) {
  const res = await prepareTrade({ mint, trader: trader.publicKey.toBase58(), side, amount: amount.toString(), slippageBps });
  if (!res.ok) throw new Error(`prepare trade failed: ${res.status} ${await res.text()}`);
  return PreparedTrade.parse(await res.json());
}

/** What a trader does: ask the API for the trade, sign it in the wallet, send it. */
export async function trade(trader: Keypair, mint: string, side: TradeSide, amount: bigint, slippageBps = 100) {
  const p = await prepared(trader, mint, side, amount, slippageBps);
  return { quote: p.quote, signature: await signAndSend(p, trader) };
}

/** A token account's balance in raw units; zero if the account doesn't exist. */
export async function tokenBalance(account: PublicKey) {
  const res = await connection().getTokenAccountBalance(account, "confirmed").catch(() => null);
  return BigInt(res?.value.amount ?? 0);
}

export const solOf = async (owner: Keypair) => BigInt(await connection().getBalance(owner.publicKey, "confirmed"));

export async function networkFee(signature: string) {
  const tx = await connection().getTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
  return BigInt(tx!.meta!.fee);
}

export const SOL = (n: number) => BigInt(Math.round(n * LAMPORTS_PER_SOL));

/** The platform facts every client reads, the fee rates as the chain has them among them. */
export async function platformInfo() {
  return PlatformInfo.parse(await (await fetch(`${env().apiUrl}/v1/platform`)).json());
}

/**
 * The curve's Platform Fee and Creator Fee in basis points, as the chain has them now. Tests work fee amounts out from
 * these, never from constants, so a change to the split (ADR 0007, or an announced fee change) needs no test edits.
 */
export async function feeRates() {
  const p = await platformInfo();
  return { platform: p.platformFeeBps, creator: p.creatorFeeBps };
}

/** A fee of `bps` basis points on an amount, rounded up as LaunchLab rounds it. */
export const feeAt = (amount: bigint, bps: number) => (amount * BigInt(Math.round(bps * 100)) + 999_999n) / 1_000_000n;

/**
 * The Graduation Fee (ADR 0015) in raw units of a Quote Asset, as the API values it: the stack's `GRADUATION_FEE_LAMPORTS`
 * at the Quote Registry's price, rounded up so it covers the fee; lamports for SOL itself. `lamports` overrides the
 * stack's fee for a coin graduated under another setting.
 */
export async function graduationFeeIn(mint: string, lamports = BigInt(env().graduationFeeLamports)) {
  if (mint === WSOL_MINT.toBase58()) return lamports;
  const q = (await listQuotes()).find((q) => q.mint === mint);
  if (!q?.price) throw new Error(`${mint} has no price to value the Graduation Fee in`);
  const [whole, fraction = ""] = q.price.sol.split(".");
  const divisor = BigInt(whole! + fraction) * 1_000_000_000n;
  return (lamports * 10n ** BigInt(q.decimals) * 10n ** BigInt(fraction.length) + divisor - 1n) / divisor;
}

/** A coin launched through the API and indexed, ready to trade. */
export async function launchedCoin() {
  const creator = await fundedWallet();
  const { prepared, signature } = await launch(creator);
  await deliverWebhook([signature]);
  return { creator, mint: prepared.mint, pool: new PublicKey(prepared.pool) };
}

export function quote(mint: string, query: Record<string, string>) {
  return fetch(`${env().apiUrl}/v1/launches/${mint}/quote?${new URLSearchParams(query)}`);
}

export const coinsOf = (mint: string, owner: Keypair) => tokenBalance(getAssociatedTokenAddressSync(new PublicKey(mint), owner.publicKey));

export async function trades(mint: string) {
  return TradeList.parse(await (await fetch(`${env().apiUrl}/v1/launches/${mint}/trades`)).json()).trades;
}
