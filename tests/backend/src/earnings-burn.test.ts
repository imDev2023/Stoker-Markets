// A coin whose Creator Earnings burn (ADR 0011): the Creator's share of what the platform collects on the coin buys
// the coin in its own market, on the curve before Graduation and in its pool after, and burns exactly what it bought,
// in one transaction. Every buyback is on the Ledger and among the coin's trades, the Creator's wallet is paid nothing,
// and the rule spends only its own coin's pot. The buy on the curve is LaunchLab's exact-out buy, whose arithmetic is
// proven here against the program first, to the unit.
import { afterAll, describe, expect, it } from "vitest";
import { Keypair, PublicKey, type TransactionInstruction } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction, createTransferCheckedInstruction, getAccount,
  getAssociatedTokenAddressSync, getMint, getTransferFeeAmount, getTransferFeeConfig,
} from "@solana/spl-token";
import BN from "bn.js";
import {
  buyExactOutInstructions, decodeTransaction, loadCurve, programsFor, quoteBuyExactOut, quoteTrade, signedTransaction, WSOL_MINT,
} from "@launchpad/chain";
import { CoinEarnings, CreatorEarnings, CreatorForwardList, JobRun, LedgerPage, type LedgerEntry } from "@launchpad/contract";
import { LOCAL_QUOTES, TAXED_QUOTE_FEE_BPS, migrateCurve, mintLocalQuote } from "@launchpad/localnet";
import {
  SOL, connection, deliverWebhook, env, fundedWallet, getLaunch, graduationFeeIn, launch, quote, rawTransaction, solOf, tokenBalance, trade, trades,
} from "./client";

const WSOL = WSOL_MINT.toBase58();
const USDC = LOCAL_QUOTES.USDC;
const TAXQ = LOCAL_QUOTES.TAXQ;
/** Where burned coins are recorded as having gone on the Ledger: nowhere, the system program's address standing in. */
const BURNED = PublicKey.default.toBase58();
const units = (n: number) => BigInt(Math.round(n * 1e6));
const big = (n: BN) => BigInt(n.toString());
const ops = () => new PublicKey(env().platform.operationsWallet);
const api = (path: string, init?: RequestInit) => fetch(`${env().apiUrl}${path}`, init);
const operator = () => ({ authorization: `Bearer ${env().operatorToken}`, "content-type": "application/json" });
const programs = () => ({ launchlab: new PublicKey(env().platform.launchlab), cpmm: programsFor("localnet").cpmm });

/** Half of a trade's Platform Fee, rounded down: the Creator's share of it (ADR 0009). */
const halfOf = (platformFee: string) => BigInt(platformFee) / 2n;
/** What a Token-2022 transfer fee of `bps` withholds from a transfer of `amount`, rounded up as the token program does. */
const withheld = (amount: bigint, bps: number) => (amount * BigInt(bps) + 9_999n) / 10_000n;

type Buyback = { mint: string; kind: string; venue: string; signature: string; outcome: string; spent: string | null; coins: string | null; error?: string };
type Rules = { buybacks: Buyback[]; belowMinimum: number; skipped: { mint: string; reason: string }[]; problems: string[] };

/** Every coin this file gave the rule, for the last collection of the file. */
const burning: string[] = [];

async function runJob(job: "fee-collector" | "creator-forward" | "reward-rounds") {
  const res = await api(`/v1/operator/jobs/${job}`, { method: "POST", headers: operator() });
  return JobRun.parse(await res.json());
}

/**
 * The Creator Forward job, which applies every coin's rule after its wallet forwards: what it did for this coin. The
 * job covers every coin on the stack and fails as a whole when another file's coin has a problem, so only what it says
 * about this coin is judged here.
 */
async function forward(mint: string) {
  const run = await runJob("creator-forward");
  const rules = (run.summary as { rules?: Rules } | null)?.rules;
  if (!rules) throw new Error(`the Creator Forward job gave no summary of its rules: ${JSON.stringify(run)}`);
  expect(rules.problems.filter((p) => p.includes(mint)), JSON.stringify(run)).toEqual([]);
  return { buybacks: rules.buybacks.filter((b) => b.mint === mint), skipped: rules.skipped.filter((s) => s.mint === mint) };
}

/** The Fee Collector: claims the Platform Fee vaults and the pools' fees, after which a Creator's share is the rule's. */
const collect = () => runJob("fee-collector");

async function coinEarnings(mint: string) {
  const res = await api(`/v1/launches/${mint}/earnings`);
  expect(res.status).toBe(200);
  return CoinEarnings.parse(await res.json());
}

/** The Ledger's two entries of one buyback, found by paging back through the burns of every coin on the stack. */
async function ledgerOf(signature: string) {
  const found: LedgerEntry[] = [];
  let before: string | null = null;
  do {
    const page: LedgerPage = LedgerPage.parse(await (await api(`/v1/ledger?kind=creator_burn&limit=100${before ? `&before=${before}` : ""}`)).json());
    found.push(...page.entries.filter((e) => e.signature === signature));
    before = page.next;
  } while (before && found.length < 2);
  return found.sort((a, b) => a.index - b.index);
}

const supplyOf = async (mint: string, program = TOKEN_PROGRAM_ID) => (await getMint(connection(), new PublicKey(mint), "confirmed", program)).supply;

/** A coin launched with its Creator Earnings pointed at the burn, indexed. */
async function burnCoin(creator: Keypair, form: Parameters<typeof launch>[1] = {}) {
  const { prepared, signature } = await launch(creator, { symbol: "BRN", ...form, earningsDestination: "burn" });
  await deliverWebhook([signature]);
  burning.push(prepared.mint);
  return { mint: prepared.mint, curve: new PublicKey(prepared.pool) };
}

/** A buy on a coin's curve through the API, indexed; returns the Creator's share of it, half of its Platform Fee. */
async function curveBuy(mint: string, amount: bigint, trader?: Keypair) {
  const t = await trade(trader ?? (await fundedWallet()), mint, "buy", amount);
  await deliverWebhook([t.signature]);
  return halfOf(t.quote.fees.platform);
}

/** A wallet with SOL and, for a coin paired with anything else, plenty of that Quote Asset. */
async function traderWith(quoteMint: PublicKey) {
  const trader = await fundedWallet(10);
  if (!quoteMint.equals(WSOL_MINT)) await mintLocalQuote(connection(), quoteMint, trader.publicKey, units(2_000));
  return trader;
}

/**
 * What a landed transaction took from `owner` in the Quote Asset, read from its own token balances: for SOL, which the
 * transaction wraps and unwraps inside itself, what everyone else's wrapped SOL gained; otherwise what left the owner's
 * accounts of the asset, any transfer fee of its issuer included.
 */
async function quoteTaken(signature: string, owner: PublicKey, quoteMint: PublicKey) {
  const { meta } = await rawTransaction(signature);
  const sum = (balances: NonNullable<NonNullable<typeof meta>["preTokenBalances"]>, own: boolean) =>
    balances.filter((b) => b.mint === quoteMint.toBase58() && (b.owner === owner.toBase58()) === own).reduce((s, b) => s + BigInt(b.uiTokenAmount.amount), 0n);
  const [pre, post] = [meta!.preTokenBalances ?? [], meta!.postTokenBalances ?? []];
  return quoteMint.equals(WSOL_MINT) ? sum(post, false) - sum(pre, false) : sum(pre, true) - sum(post, true);
}

/** Signs and sends instructions as a wallet would, with the node's preflight, and waits for them to land. */
async function send(signer: Keypair, instructions: TransactionInstruction[]) {
  const conn = connection();
  const tx = await signedTransaction(conn, signer, instructions);
  await conn.sendRawTransaction(tx.serialized, { preflightCommitment: "confirmed" });
  for (;;) {
    const { value: [status] } = await conn.getSignatureStatuses([tx.signature]);
    if (status?.err) throw new Error(`transaction ${tx.signature} failed on-chain: ${JSON.stringify(status.err)}`);
    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") return tx.signature;
    if ((await conn.getBlockHeight("confirmed")) > tx.lastValidBlockHeight) throw new Error(`transaction ${tx.signature} expired unlanded`);
    await new Promise((r) => setTimeout(r, 300));
  }
}

/** A migrated pool refuses swaps for its first second; the API quotes it once it has opened. */
async function poolOpen(mint: string) {
  for (let i = 0; i < 60; i++) {
    if ((await quote(mint, { side: "buy", amount: "1000000" })).ok) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("the pool never opened");
}

/**
 * Runs the Creator Forward job, which must send one buyback for the coin out of the `waiting` in its pot, and checks
 * what every landed buyback must show, whatever its venue; returns what it spent and burned.
 */
async function buyback(coin: { mint: string; quoteMint: PublicKey; venue: "curve" | "pool"; market: PublicKey; waiting: bigint; program?: PublicKey }) {
  const supply = await supplyOf(coin.mint, coin.program);
  const ran = await forward(coin.mint);
  expect(ran.skipped).toEqual([]);
  expect(ran.buybacks).toEqual([{
    mint: coin.mint, kind: "burn", venue: coin.venue, signature: expect.any(String), outcome: "landed", spent: expect.stringMatching(/^\d+$/), coins: expect.stringMatching(/^\d+$/),
  }]);
  const [sent] = ran.buybacks;
  const [spent, burned] = [BigInt(sent!.spent!), BigInt(sent!.coins!)];
  // Every coin bought is gone from the supply, and nothing else is.
  expect(burned).toBeGreaterThan(0n);
  expect(supply - (await supplyOf(coin.mint, coin.program))).toBe(burned);
  // Within the pot, and all of it but the slippage allowance; what the Ledger says was spent is what the chain took.
  expect(spent).toBeLessThanOrEqual(coin.waiting);
  expect(spent).toBeGreaterThanOrEqual((coin.waiting * 98n) / 100n);
  expect(await quoteTaken(sent!.signature, ops(), coin.quoteMint)).toBe(spent);
  const launchOf = { mint: coin.mint, symbol: expect.any(String), name: expect.any(String) };
  expect(await ledgerOf(sent!.signature)).toMatchObject([
    { index: 0, kind: "creator_burn", asset: { mint: coin.quoteMint.toBase58() }, amount: spent.toString(), source: ops().toBase58(), destination: coin.market.toBase58(), launch: launchOf },
    { index: 1, kind: "creator_burn", asset: { mint: coin.mint }, amount: burned.toString(), source: ops().toBase58(), destination: BURNED, launch: launchOf },
  ]);
  // The buy is a trade of the coin like anyone's, made by the operations wallet.
  const listed = (await trades(coin.mint)).find((t) => t.signature === sent!.signature);
  expect(listed).toMatchObject({ venue: coin.venue, trader: ops().toBase58(), side: "buy" });
  return { signature: sent!.signature, spent, burned, listed: listed! };
}

afterAll(async () => {
  // A rule runs for every coin on the stack whenever any file runs the Creator Forward, and a buyback moves the
  // operations wallet's balance, which other files measure. One more collection and forward here spends what this
  // file's last buybacks brought back to its coins, so all that is left of their pots is far under the minimum.
  if (!burning.length) return;
  await collect();
  await runJob("creator-forward");
});

describe("LaunchLab's exact-out buy", () => {
  const pairings: [string, Parameters<typeof launch>[1], PublicKey][] = [
    ["a coin paired with SOL", {}, WSOL_MINT],
    ["a coin paired with USDC", { quoteMint: USDC.toBase58() }, USDC],
    ["a coin paired with a Quote Asset that has a transfer fee", { quoteMint: TAXQ.toBase58() }, TAXQ],
    ["a Reward Launch, whose coin has a transfer fee of its own", { rewardTax: "300" }, WSOL_MINT],
    ["a Reward Launch paired with a Quote Asset that has a transfer fee", { rewardTax: "500", quoteMint: TAXQ.toBase58() }, TAXQ],
  ];

  it.each(pairings)("takes and delivers exactly what the math says, to the unit: %s", async (_label, form, quoteMint) => {
    const conn = connection();
    const creator = await fundedWallet();
    const { prepared, signature } = await launch(creator, form);
    await deliverWebhook([signature]);
    const [mint, pool] = [new PublicKey(prepared.mint), new PublicKey(prepared.pool)];
    const trader = await traderWith(quoteMint);
    // Some trading first, so the reserves are not the round numbers of a new curve.
    await trade(trader, prepared.mint, "buy", quoteMint.equals(WSOL_MINT) ? 137_654_321n : 13_765_432n);

    const curve = (await loadCurve(conn, pool))!;
    const fees = { quote: curve.quoteTransferFee, base: curve.baseTransferFee };
    const asked = new BN("23456789012345677");
    const math = quoteBuyExactOut(curve.reserves, curve.rates, asked, fees)!;
    // Large enough that every fee is far from a rounding artefact.
    expect(big(math.fees.platform)).toBeGreaterThan(10_000n);
    expect(math.amountOut.eq(asked)).toBe(true);
    // The inverse of a buy that spends: spending what the exact buy costs buys at least as many coins.
    expect(quoteTrade(curve.reserves, curve.rates, "buy", math.amountIn, fees).amountOut.gte(asked)).toBe(true);

    const account = getAssociatedTokenAddressSync(mint, trader.publicKey, false, curve.baseTokenProgram);
    const held = async () => {
      const a = await getAccount(conn, account, "confirmed", curve.baseTokenProgram);
      return { amount: a.amount, withheld: getTransferFeeAmount(a)?.withheldAmount ?? 0n };
    };
    const before = await held();
    const buy = (maxAmountIn: BN) => buyExactOutInstructions(conn, { program: programs().launchlab, curve, trader: trader.publicKey, amountOut: asked, maxAmountIn });
    // One unit under what the math says the buy takes, and the program refuses it (ExceededSlippage, 6004).
    await expect(send(trader, await buy(math.amountIn.subn(1)))).rejects.toThrow(/0x1774/);
    const landed = await send(trader, await buy(math.amountIn));

    // What left the wallet, any transfer fee of the Quote Asset included, and what reached it, the coin's own withheld.
    expect(await quoteTaken(landed, trader.publicKey, quoteMint)).toBe(big(math.amountIn));
    const after = await held();
    expect(after.amount - before.amount).toBe(big(asked));
    expect(after.withheld - before.withheld).toBe(big(math.transferFees.base));
    expect(big(math.programAmountOut)).toBe(big(asked) + big(math.transferFees.base));
    // The curve itself, and the fees the program says it charged.
    const now = (await loadCurve(conn, pool))!;
    expect([big(now.reserves.realBase), big(now.reserves.realQuote)]).toEqual([big(math.after.realBase), big(math.after.realQuote)]);
    const event = decodeTransaction(await rawTransaction(landed), programs()).find((e) => e.kind === "trade");
    if (event?.kind !== "trade") throw new Error("the buy emitted no trade event");
    expect({ protocol: big(event.fees.protocol), platform: big(event.fees.platform), creator: big(event.fees.creator), share: big(event.fees.share) }).toEqual({
      protocol: big(math.fees.protocol), platform: big(math.fees.platform), creator: big(math.fees.creator), share: big(math.fees.share),
    });
    // The program's event counts the coins the curve paid out and the Quote Asset that reached it.
    expect(big(event.amountOut)).toBe(big(math.programAmountOut));
    expect(big(event.amountIn)).toBe(big(math.amountIn) - big(math.transferFees.quote));
  });

  it("gives what is left when asked for more than the curve has, which is why a burn never trusts the number it asked for", async () => {
    const conn = connection();
    const creator = await fundedWallet();
    const { prepared, signature } = await launch(creator);
    await deliverWebhook([signature]);
    const trader = await fundedWallet(10);
    const curve = (await loadCurve(conn, new PublicKey(prepared.pool)))!;
    const left = curve.reserves.totalBaseSell.sub(curve.reserves.realBase);
    // The math refuses to price it; the program fills it short instead of failing.
    expect(quoteBuyExactOut(curve.reserves, curve.rates, left.addn(1))).toBeNull();
    const sent = await send(trader, await buyExactOutInstructions(conn, { program: programs().launchlab, curve, trader: trader.publicKey, amountOut: left.addn(1), maxAmountIn: new BN(SOL(5).toString()) }));
    await deliverWebhook([sent]);
    expect(await tokenBalance(getAssociatedTokenAddressSync(new PublicKey(prepared.mint), trader.publicKey))).toBe(big(left));
    expect((await loadCurve(conn, new PublicKey(prepared.pool)))!.status).toBe("graduating");
  });
});

describe("a coin whose Creator Earnings burn", () => {
  it("buys the coin on its curve with the Creator's collected share and burns it, pays the wallet nothing, and compounds", async () => {
    const creator = await fundedWallet();
    const { mint, curve } = await burnCoin(creator);
    expect((await getLaunch(mint)).launch!.earningsDestination).toBe("burn");
    const earned = (await curveBuy(mint, SOL(0.3))) + (await curveBuy(mint, SOL(0.2)));

    // Earned from the moment the trades are indexed, but the rule's only once the platform has collected the fees.
    expect(await coinEarnings(mint)).toMatchObject({
      mint, destination: "burn", quote: { mint: WSOL }, collected: "0", withheld: "0", applied: "0", waiting: "0", minLamports: env().creatorForwardMinLamports,
      waitsForGraduation: false, rounds: [], buybacks: [], totals: { spent: "0", buybacks: 0, burned: "0" },
    });
    expect(await forward(mint)).toEqual({ buybacks: [], skipped: [] });

    await collect();
    expect(await coinEarnings(mint)).toMatchObject({ collected: earned.toString(), applied: "0", waiting: earned.toString() });
    const held = await solOf(creator);
    const supply = await supplyOf(mint);
    const first = await buyback({ mint, quoteMint: WSOL_MINT, venue: "curve", market: curve, waiting: earned });
    // On the curve the coins the buy delivered are the coins the trade lists, and what it paid is what was spent.
    expect(first.listed).toMatchObject({ baseAmount: first.burned.toString(), quoteAmount: first.spent.toString() });
    // The coins never passed through the wallet's own account of the coin: it has none.
    expect(await connection().getAccountInfo(getAssociatedTokenAddressSync(new PublicKey(mint), ops()), "confirmed")).toBeNull();

    // The coin's page says what became of the share, with the transaction.
    const left = earned - first.spent;
    expect(await coinEarnings(mint)).toMatchObject({
      collected: earned.toString(), withheld: "0", applied: first.spent.toString(), waiting: left.toString(),
      buybacks: [{
        signature: first.signature, kind: "burn", venue: "curve", status: "landed", spent: first.spent.toString(), coins: first.burned.toString(),
        burned: first.burned.toString(), liquidity: null,
      }],
      totals: { paidToHolders: "0", rounds: 0, spent: first.spent.toString(), buybacks: 1, burned: first.burned.toString(), coinsAdded: "0", quoteAdded: "0" },
    });
    // The Creator's wallet was sent nothing for this coin, and their page says where the share went instead. The
    // buyback's own Platform Fee earns the coin a share like any trade's.
    const own = halfOf(first.listed.fees.platform);
    expect(own).toBeGreaterThan(0n);
    expect(await solOf(creator)).toBe(held);
    expect(CreatorForwardList.parse(await (await api(`/v1/creators/${creator.publicKey.toBase58()}/forwards`)).json()).forwards).toEqual([]);
    const page = CreatorEarnings.parse(await (await api(`/v1/creators/${creator.publicKey.toBase58()}/earnings`)).json());
    expect(page.assets).toMatchObject([{ quote: { mint: WSOL }, earned: (earned + own).toString(), forwarded: "0", toRule: (earned + own).toString(), pending: "0" }]);
    expect(page.launches).toMatchObject([{ mint, destination: "burn", applied: first.spent.toString() }]);

    // A run right after has nothing new: what the slippage allowance left is under the minimum, so it waits.
    expect(left).toBeGreaterThan(0n);
    expect(left).toBeLessThan(BigInt(env().creatorForwardMinLamports));
    expect(await forward(mint)).toEqual({ buybacks: [], skipped: [] });
    expect(await coinEarnings(mint)).toMatchObject({ applied: first.spent.toString(), waiting: left.toString(), totals: { buybacks: 1 } });

    // The next collection brings back half of the buyback's own Platform Fee beside the share of a new trade, and the
    // rule spends it with what was waiting: it compounds.
    const more = await curveBuy(mint, SOL(0.4));
    await collect();
    const waiting = left + own + more;
    expect(await coinEarnings(mint)).toMatchObject({ collected: (earned + own + more).toString(), applied: first.spent.toString(), waiting: waiting.toString() });
    const second = await buyback({ mint, quoteMint: WSOL_MINT, venue: "curve", market: curve, waiting });
    const after = await coinEarnings(mint);
    expect(after.buybacks.map((b) => b.signature)).toEqual([second.signature, first.signature]);
    expect(after.totals).toMatchObject({ spent: (first.spent + second.spent).toString(), buybacks: 2, burned: (first.burned + second.burned).toString() });
    expect(supply - (await supplyOf(mint))).toBe(first.burned + second.burned);
    expect(await solOf(creator)).toBe(held);
  });

  it.each([
    ["USDC", USDC, 0],
    ["a Quote Asset with a transfer fee, which the buy pays out of the pot like the rest", TAXQ, TAXED_QUOTE_FEE_BPS],
  ] as const)("buys on the curve with the Quote Asset the wallet holds for the coin: %s", async (_label, quoteMint, feeBps) => {
    const creator = await fundedWallet();
    const { mint, curve } = await burnCoin(creator, { quoteMint: quoteMint.toBase58() });
    const earned = await curveBuy(mint, units(60), await traderWith(quoteMint));
    await collect();
    expect(await coinEarnings(mint)).toMatchObject({ quote: { mint: quoteMint.toBase58() }, collected: earned.toString(), waiting: earned.toString() });

    const done = await buyback({ mint, quoteMint, venue: "curve", market: curve, waiting: earned });
    // The trade lists what reached the curve; the issuer's fee on the way there, if the asset has one, was spent too.
    expect(done.listed.baseAmount).toBe(done.burned.toString());
    expect(done.spent - BigInt(done.listed.quoteAmount)).toBe(withheld(done.spent, feeBps));
    expect(await coinEarnings(mint)).toMatchObject({ applied: done.spent.toString(), waiting: (earned - done.spent).toString(), totals: { buybacks: 1, burned: done.burned.toString() } });
    // No SOL route and no wrapped SOL: the Creator was sent nothing, in any asset.
    expect(CreatorForwardList.parse(await (await api(`/v1/creators/${creator.publicKey.toBase58()}/forwards`)).json()).forwards).toEqual([]);
  });

  it.each([
    ["SOL", WSOL_MINT, SOL(2), SOL(0.5)],
    ["a Quote Asset with a transfer fee", TAXQ, units(300), units(40)],
  ] as const)("waits while Raydium moves the coin to its pool, then buys in the pool: %s", { timeout: 180_000 }, async (_label, quoteMint, buyout, poolBuy) => {
    const creator = await fundedWallet();
    const { mint, curve } = await burnCoin(creator, { quoteMint: quoteMint.toBase58() });
    const trader = await traderWith(quoteMint);
    const sold = await trade(trader, mint, "buy", buyout);
    expect(sold.quote.completesCurve).toBe(true);
    await deliverWebhook([sold.signature]);
    const onCurve = halfOf(sold.quote.fees.platform);

    // Sold out and not yet migrated: the share is collected and waits, and the run says why.
    await collect();
    expect(await coinEarnings(mint)).toMatchObject({ collected: onCurve.toString(), waiting: onCurve.toString() });
    expect(await forward(mint)).toEqual({ buybacks: [], skipped: [{ mint, reason: expect.stringMatching(/Raydium is moving the coin to its pool/) }] });
    expect(await coinEarnings(mint)).toMatchObject({ applied: "0", waiting: onCurve.toString(), buybacks: [] });

    const migration = await migrateCurve(connection(), curve);
    await deliverWebhook([migration.signature]);
    await poolOpen(mint);
    // Trading in the pool, whose creator fee the Fee Collector collects and the Creator shares in.
    const bought = await trade(trader, mint, "buy", poolBuy);
    await deliverWebhook([bought.signature]);
    await collect();
    const page = await coinEarnings(mint);
    // The coin's Graduation Fee came out of the pot before the rule ran (ADR 0015).
    expect(page.withheld).toBe((await graduationFeeIn(quoteMint.toBase58())).toString());
    const waiting = BigInt(page.waiting!);
    expect(waiting).toBe(BigInt(page.collected) - BigInt(page.withheld));
    expect(waiting).toBeGreaterThan(onCurve - BigInt(page.withheld));

    // The wallet's own account of the coin can hold coins that are not the rule's: the locked liquidity's fees in the
    // coin, between their collection and the sweep, or coins anyone sent there, as here. The burn takes none of them.
    const coin = new PublicKey(mint);
    const own = getAssociatedTokenAddressSync(coin, ops());
    const others = 123_456_789_012n;
    await send(trader, [
      createAssociatedTokenAccountIdempotentInstruction(trader.publicKey, own, ops(), coin),
      createTransferCheckedInstruction(getAssociatedTokenAddressSync(coin, trader.publicKey), coin, own, trader.publicKey, others, 6),
    ]);
    const kept = await tokenBalance(own);
    expect(kept).toBeGreaterThanOrEqual(others);
    const done = await buyback({ mint, quoteMint, venue: "pool", market: migration.pool, waiting });
    expect(await tokenBalance(own)).toBe(kept);
    // A pool trade lists what left the wallet and what reached it.
    expect(done.listed).toMatchObject({ baseAmount: done.burned.toString(), quoteAmount: done.spent.toString() });
    expect(await coinEarnings(mint)).toMatchObject({
      applied: done.spent.toString(), waiting: (waiting - done.spent).toString(),
      buybacks: [{ signature: done.signature, kind: "burn", venue: "pool", status: "landed", burned: done.burned.toString() }],
      totals: { spent: done.spent.toString(), buybacks: 1, burned: done.burned.toString() },
    });
  });

  it("burns a Reward Launch's coin, on the curve and in the pool, without touching the Reward Tax harvested for its holders", { timeout: 240_000 }, async () => {
    const TAX_BPS = 500;
    const creator = await fundedWallet();
    // Paid out in SOL: the tax harvested for the holders waits in the wallet's account of the coin, sold a slice per run.
    const { mint, curve } = await burnCoin(creator, { rewardTax: String(TAX_BPS), rewardPayout: "quote", symbol: "RWBRN" });
    const coin = new PublicKey(mint);
    const trader = await fundedWallet(10);
    await curveBuy(mint, SOL(0.5), trader);
    const own = getAssociatedTokenAddressSync(coin, ops(), false, TOKEN_2022_PROGRAM_ID);
    const taxInMint = async () => getTransferFeeConfig(await getMint(connection(), coin, "confirmed", TOKEN_2022_PROGRAM_ID))!.withheldAmount;
    const heldByWallet = async () => {
      const a = await getAccount(connection(), own, "confirmed", TOKEN_2022_PROGRAM_ID);
      return { amount: a.amount, withheld: getTransferFeeAmount(a)!.withheldAmount };
    };

    // The Reward Engine harvests the buy's tax into the wallet's account and sells one bounded slice of it; the rest
    // stays there, the holders' coins.
    await runJob("reward-rounds");
    const harvested = await heldByWallet();
    expect(harvested.amount).toBeGreaterThan(0n);
    await collect();
    let waiting = BigInt((await coinEarnings(mint)).waiting!);
    let inMint = await taxInMint();
    const onCurve = await buyback({ mint, quoteMint: WSOL_MINT, venue: "curve", market: curve, waiting, program: TOKEN_2022_PROGRAM_ID });
    // The curve paid out more than was burned: the buy's own Reward Tax, withheld on the way. The burn is exactly what
    // the buy delivered, and the tax is in the mint, where the Reward Engine collects it for the holders.
    const paidOut = BigInt(onCurve.listed.baseAmount);
    expect(onCurve.burned).toBe(paidOut - withheld(paidOut, TAX_BPS));
    expect((await taxInMint()) - inMint).toBe(withheld(paidOut, TAX_BPS));
    // The wallet's account of the coin is as it was: the harvested tax, to the coin.
    expect(await heldByWallet()).toEqual(harvested);

    // After Graduation the same rule buys in the pool.
    const sold = await trade(trader, mint, "buy", SOL(2));
    expect(sold.quote.completesCurve).toBe(true);
    const migration = await migrateCurve(connection(), curve);
    await deliverWebhook([sold.signature, migration.signature]);
    await poolOpen(mint);
    await deliverWebhook([(await trade(trader, mint, "buy", SOL(0.3))).signature]);
    await collect();
    waiting = BigInt((await coinEarnings(mint)).waiting!);
    inMint = await taxInMint();
    const before = await heldByWallet();
    const inPool = await buyback({ mint, quoteMint: WSOL_MINT, venue: "pool", market: migration.pool, waiting, program: TOKEN_2022_PROGRAM_ID });
    // A pool trade lists what reached the buyer, which is what was burned; the tax the pool's payout lost on the way
    // is the coin's rate on that payout, and went to the mint.
    expect(inPool.listed.baseAmount).toBe(inPool.burned.toString());
    const tax = (await taxInMint()) - inMint;
    expect(tax).toBe(withheld(inPool.burned + tax, TAX_BPS));
    expect(await heldByWallet()).toEqual(before);
    expect((await coinEarnings(mint)).totals).toMatchObject({ buybacks: 2, burned: (onCurve.burned + inPool.burned).toString(), spent: (onCurve.spent + inPool.spent).toString() });
  });
});
