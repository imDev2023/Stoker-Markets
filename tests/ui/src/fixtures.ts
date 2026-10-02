// What every UI test gets: the running stack, the web app as base URL, a funded wallet installed in the page, and a
// guard that fails the test on any browser error, since a console error is a bug a user would hit.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test as base, expect, type Page } from "@playwright/test";
import {
  Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, VersionedTransaction, sendAndConfirmTransaction,
} from "@solana/web3.js";
import { createAssociatedTokenAccountIdempotentInstruction, createTransferInstruction, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { LaunchList, PreparedAirdrop, PreparedCreatorFeeClaim, PreparedLaunch, PreparedTrade, type TradeSide } from "@launchpad/contract";
import { LOCAL_QUOTES, migrateCurve, mintLocalQuote } from "@launchpad/localnet";
import { swapThroughSolRoute } from "@launchpad/localnet/routes";
import { FEE_COLLECTOR_CRON, type StackEnv } from "@launchpad/stack";
import { installTestWallet, type TestWallet } from "./wallet";

export { expect };

/** The Quote Assets on the local chain; the stack prices SOL at 150 USD, USDC at 1, NVDAx at 180, JTO at 2.5 and TAXQ at 1, and not BULLWHALE. */
export const QUOTES = { SOL: new PublicKey("So11111111111111111111111111111111111111112"), ...LOCAL_QUOTES };

export const COIN_PNG = readFileSync(new URL("../fixtures/coin.png", import.meta.url));

export function stackEnv(): StackEnv {
  const raw = process.env.LAUNCHPAD_STACK;
  if (!raw) throw new Error("LAUNCHPAD_STACK is not set: run the suite through `pnpm test:ui` so the global setup starts the stack");
  return JSON.parse(raw) as StackEnv;
}

const connection = () => new Connection(stackEnv().rpcUrl, "confirmed");

export async function fund(to: PublicKey, sol = 5) {
  const conn = connection();
  const signature = await conn.requestAirdrop(to, sol * LAMPORTS_PER_SOL);
  await conn.confirmTransaction({ signature, ...(await conn.getLatestBlockhash("confirmed")) }, "confirmed");
}

export async function fundedKeypair(sol = 5, kp = Keypair.generate()) {
  await fund(kp.publicKey, sol);
  return kp;
}

/**
 * The Creator of the seeded coins. A fixed key, since the chain is new every run, so the visual tests can open the
 * Creator Fee page as that Creator.
 */
export const SEED_CREATOR = Keypair.fromSeed(new Uint8Array(32).fill(7));

/** A key that is the same on every run, so what it owns looks the same in every screenshot. */
export const fixedKeypair = (name: string) => Keypair.fromSeed(createHash("sha256").update(`launchpad ui tests: ${name}`).digest());

/** Leaves the wallet `keepSol`, as if its owner spent the rest elsewhere. */
export async function drain(wallet: Keypair, keepSol: number) {
  const conn = connection();
  const lamports = (await conn.getBalance(wallet.publicKey, "confirmed")) - keepSol * LAMPORTS_PER_SOL - 5_000;
  const transfer = SystemProgram.transfer({ fromPubkey: wallet.publicKey, toPubkey: Keypair.generate().publicKey, lamports });
  await sendAndConfirmTransaction(conn, new Transaction().add(transfer), [wallet], { commitment: "confirmed" });
}

export async function listLaunches() {
  return LaunchList.parse(await (await fetch(`${stackEnv().apiUrl}/v1/launches?limit=100`)).json()).launches;
}

export type LaunchFields = {
  name: string;
  symbol: string;
  /** Defaults to SOL. */
  quote?: keyof typeof QUOTES;
  description?: string;
  website?: string;
  x?: string;
  telegram?: string;
  /** Raw units of the Quote Asset. */
  firstBuy?: string;
  airdrop?: { wallet: string; amount: string }[];
};

/** What a wallet does with a transaction the API prepared: sign, send, wait for confirmation, then report it for indexing. */
async function signSendReport(prepared: { transaction: string; lastValidBlockHeight: number }, signer: Keypair) {
  const tx = VersionedTransaction.deserialize(Buffer.from(prepared.transaction, "base64"));
  tx.sign([signer]);
  const conn = connection();
  const signature = await conn.sendTransaction(tx);
  const result = await conn.confirmTransaction(
    { signature, blockhash: tx.message.recentBlockhash, lastValidBlockHeight: prepared.lastValidBlockHeight },
    "confirmed",
  );
  if (result.value.err) throw new Error(`transaction ${signature} failed: ${JSON.stringify(result.value.err)}`);
  await fetch(`${stackEnv().apiUrl}/v1/transactions/${signature}`, { method: "POST" });
  return signature;
}

/** Operator: allows a Creator wallet an airdrop at launch. Nobody may have one, or sees the option on the form, until then. */
export async function allowAirdrops(wallet: PublicKey) {
  const { apiUrl, operatorToken } = stackEnv();
  const res = await fetch(`${apiUrl}/v1/operator/airdrop-creators`, {
    method: "POST",
    headers: { authorization: `Bearer ${operatorToken}`, "content-type": "application/json" },
    body: JSON.stringify({ wallet: wallet.toBase58() }),
  });
  if (!res.ok) throw new Error(`allowing ${wallet.toBase58()} an airdrop failed: ${res.status} ${await res.text()}`);
}

/** Launches a coin the way any API client would: prepare, sign, send, report. */
export async function launchViaApi(creator: Keypair, { quote = "SOL", airdrop, ...fields }: LaunchFields) {
  const form = new FormData();
  form.set("creator", creator.publicKey.toBase58());
  form.set("quoteMint", QUOTES[quote].toBase58());
  for (const [k, v] of Object.entries(fields)) if (v) form.set(k, v);
  if (airdrop) {
    await allowAirdrops(creator.publicKey);
    form.set("airdrop", JSON.stringify(airdrop));
  }
  form.set("image", new Blob([COIN_PNG], { type: "image/png" }), "coin.png");
  const res = await fetch(`${stackEnv().apiUrl}/v1/launches/prepare`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`prepare failed: ${res.status} ${await res.text()}`);
  const prepared = PreparedLaunch.parse(await res.json());
  await signSendReport(prepared, creator);
  return prepared.mint;
}

/**
 * The trader who holds the seeded graduated coin, a fixed key like SEED_CREATOR, so a visual test can take coins from it
 * by transfer: a trade would move the pool and change what the next test sees.
 */
export const SEED_HOLDER = Keypair.fromSeed(new Uint8Array(32).fill(8));

/** Moves coins between wallets without trading, so no price or history changes. */
export async function giveCoins(from: Keypair, to: PublicKey, mint: string, amount: bigint) {
  const m = new PublicKey(mint);
  const source = getAssociatedTokenAddressSync(m, from.publicKey);
  const destination = getAssociatedTokenAddressSync(m, to);
  await sendAndConfirmTransaction(connection(), new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(from.publicKey, destination, to, m),
    createTransferInstruction(source, destination, from.publicKey, amount),
  ), [from], { commitment: "confirmed" });
}

/** Coins of `mint` a wallet holds, raw units. */
export async function coinBalance(owner: Keypair | PublicKey, mint: string) {
  const address = owner instanceof Keypair ? owner.publicKey : owner;
  const accounts = await connection().getParsedTokenAccountsByOwner(address, { mint: new PublicKey(mint) }, "confirmed");
  return accounts.value.reduce((sum, a) => sum + BigInt(a.account.data.parsed.info.tokenAmount.amount as string), 0n);
}

/**
 * Plays Raydium's crank: migrates a sold-out curve into its CPMM pool with the local chain's migrate wallet, reports the
 * migration, and waits until the pool accepts trades (a migrated pool opens a second later by the chain's clock).
 */
export async function graduate(mint: string) {
  const [launch] = (await listLaunches()).filter((l) => l.mint === mint);
  if (!launch) throw new Error(`no launch ${mint}`);
  const { signature } = await migrateCurve(connection(), new PublicKey(launch.pool));
  const reported = await fetch(`${stackEnv().apiUrl}/v1/transactions/${signature}`, { method: "POST" });
  if (!reported.ok) throw new Error(`reporting the migration failed: ${reported.status} ${await reported.text()}`);
  for (let i = 0; i < 40; i++) {
    const res = await fetch(`${stackEnv().apiUrl}/v1/launches/${mint}/quote?side=buy&amount=1000000`);
    if (res.ok) return signature;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`the pool of ${mint} never opened`);
}

/** Trades on a Launch the way any API client would: prepare, sign, send, report. `amount` is raw units of what is paid. */
export async function tradeViaApi(trader: Keypair, mint: string, side: TradeSide, amount: bigint, slippageBps = 100) {
  const res = await fetch(`${stackEnv().apiUrl}/v1/trades/prepare`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mint, trader: trader.publicKey.toBase58(), side, amount: amount.toString(), slippageBps }),
  });
  if (!res.ok) throw new Error(`prepare trade failed: ${res.status} ${await res.text()}`);
  const prepared = PreparedTrade.parse(await res.json());
  await signSendReport(prepared, trader);
  return prepared.quote;
}

/** Hands a wallet a non-SOL Quote Asset: the local chain's admin holds every cloned quote mint's authority. */
export async function fundQuote(owner: PublicKey, quote: Exclude<keyof typeof QUOTES, "SOL">, raw: bigint) {
  await mintLocalQuote(connection(), QUOTES[quote], owner, raw);
}

/**
 * Someone else swaps `lamports` of SOL for a Quote Asset in the local chain's SOL route pool for it, which makes the
 * Quote Asset dearer in SOL for a buy paid with SOL.
 */
export async function moveSolRoute(quote: "USDC" | "JTO", lamports: bigint) {
  const whale = await fundedKeypair(Number(lamports / BigInt(LAMPORTS_PER_SOL)) + 2);
  await swapThroughSolRoute(connection(), whale, QUOTES[quote], lamports);
}

/** Claims a Creator's Creator Fee in one Quote Asset the way any API client would. */
export async function claimViaApi(creator: Keypair, quote: keyof typeof QUOTES = "SOL") {
  const res = await fetch(`${stackEnv().apiUrl}/v1/creator-fees/prepare`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ creator: creator.publicKey.toBase58(), quoteMint: QUOTES[quote].toBase58() }),
  });
  if (!res.ok) throw new Error(`prepare claim failed: ${res.status} ${await res.text()}`);
  return signSendReport(PreparedCreatorFeeClaim.parse(await res.json()), creator);
}

/** The Creator's Creator Fee vault for a Quote Asset, derived the way the public docs describe, and what it holds on-chain. */
export async function creatorFeeVault(creator: PublicKey, quote: keyof typeof QUOTES = "SOL") {
  const program = new PublicKey(stackEnv().platform.launchlab);
  const [vault] = PublicKey.findProgramAddressSync([creator.toBuffer(), QUOTES[quote].toBuffer()], program);
  const balance = await connection().getTokenAccountBalance(vault, "confirmed").catch(() => null);
  return { vault, balance: BigInt(balance?.value.amount ?? 0) };
}

/** Runs the Fee Collector's Cron Trigger, as its hourly schedule would, and fails unless the run succeeded. */
export async function runFeeCollector() {
  const { apiUrl, operatorToken } = stackEnv();
  const res = await fetch(`${apiUrl}/__scheduled?cron=${encodeURIComponent(FEE_COLLECTOR_CRON)}`);
  const runs = (await (await fetch(`${apiUrl}/v1/operator/jobs?job=fee-collector`, { headers: { authorization: `Bearer ${operatorToken}` } })).json()) as {
    runs: { status: string; error: string | null }[];
  };
  if (!res.ok || runs.runs[0]?.status !== "succeeded") throw new Error(`the Fee Collector failed: ${res.status} ${JSON.stringify(runs.runs[0])}`);
}

export const solBalance = async (owner: PublicKey) => BigInt(await connection().getBalance(owner, "confirmed"));

/** Raw lamports as the site writes them: whole SOL with thousands separators, then every decimal that isn't a trailing zero. */
export function sol(lamports: bigint) {
  const whole = lamports / BigInt(LAMPORTS_PER_SOL);
  const fraction = (lamports % BigInt(LAMPORTS_PER_SOL)).toString().padStart(9, "0").replace(/0+$/, "");
  return `${whole.toLocaleString("en-US")}${fraction ? `.${fraction}` : ""}`;
}

/** Pays a launched coin's airdrop the way any API client would. */
export async function payAirdropViaApi(creator: Keypair, mint: string) {
  const res = await fetch(`${stackEnv().apiUrl}/v1/launches/${mint}/airdrop/prepare`, { method: "POST" });
  if (!res.ok) throw new Error(`airdrop prepare failed: ${res.status} ${await res.text()}`);
  const prepared = PreparedAirdrop.parse(await res.json());
  for (const transaction of prepared.transactions) await signSendReport({ transaction, lastValidBlockHeight: prepared.lastValidBlockHeight }, creator);
}

/** Nothing on the page may be wider than the viewport: a sideways scroll on a phone is a layout bug. */
export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const offenders = [...document.querySelectorAll("body *")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && (r.right > width + 0.5 || r.left < -0.5) && !el.closest(".visually-hidden, dialog:not([open])");
      })
      .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join(".")}`);
    return { scroll: document.documentElement.scrollWidth - width, offenders };
  });
  expect(overflow, "page content wider than the viewport").toEqual({ scroll: 0, offenders: [] });
}

/**
 * Text the page cuts short with an ellipsis: every name and ticker the contract allows must show in full.
 * Polled until the page settles, because a coin pair is fitted to its box by script: until the page hydrates (on a cold
 * `next dev` load that can come after the network is idle), and for a frame after each web font swaps in, the widest
 * tickers can still show cut. A pair that stays cut fails once the expect timeout runs out.
 */
export async function expectNoTruncatedText(page: Page) {
  const cut = () =>
    page.evaluate(() =>
      [...document.querySelectorAll("body *")]
        .filter((el) => !el.closest(".visually-hidden"))
        .filter((el) => getComputedStyle(el).textOverflow === "ellipsis" && el.scrollWidth > el.clientWidth + 1)
        .map((el) => `${el.textContent} (${el.scrollWidth}px in ${el.clientWidth}px)`),
    );
  await expect.poll(cut, { message: "text cut off with an ellipsis" }).toEqual([]);
}

export const test = base.extend<{
  stack: StackEnv;
  wallet: TestWallet;
  /** URLs a test expects to answer with an error status, which the browser logs to the console. */
  expectedHttpErrors: RegExp[];
  browserErrors: void;
}>({
  // eslint-disable-next-line no-empty-pattern
  stack: async ({}, use) => use(stackEnv()),
  baseURL: async ({ stack }, use) => use(stack.webUrl ?? undefined),
  wallet: async ({ page }, use) => use(await installTestWallet(page, await fundedKeypair())),
  // eslint-disable-next-line no-empty-pattern
  expectedHttpErrors: async ({}, use) => use([]),
  browserErrors: [
    async ({ page, expectedHttpErrors }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
      page.on("console", (m) => {
        // A page's own HTTP status (a 404 for a coin that doesn't exist) is asserted by the test, not treated as an error.
        // So is a status a test provokes on purpose.
        const url = m.location().url;
        const expected = m.text().startsWith("Failed to load resource") && (url === page.url() || expectedHttpErrors.some((re) => re.test(url)));
        if (m.type() === "error" && !expected) errors.push(`console: ${m.text()}`);
      });
      await use();
      expect(errors, "the browser reported errors").toEqual([]);
    },
    { auto: true },
  ],
});
