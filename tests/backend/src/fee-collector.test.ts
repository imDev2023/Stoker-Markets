// The Fee Collector: on its schedule it claims the platform's revenue into the operations wallet (the Platform Fee from
// LaunchLab's vaults, and after Graduation the pool creator fee and the Fee Key's LP fees), sweeps the wallet into the
// treasury (ADR 0004), and records every movement on the public Ledger. Tests trigger its Cron Trigger and check each
// Ledger entry against what moved on-chain. The same Cron Trigger then runs the Creator Forward (ADR 0009), which pays
// Creators their share of what was collected; the sweep leaves that share behind for it.
import { beforeAll, describe, expect, it } from "vitest";
import { PublicKey, type Keypair } from "@solana/web3.js";
import { ACCOUNT_SIZE, getAssociatedTokenAddressSync } from "@solana/spl-token";
import BN from "bn.js";
import { cpmmCoder, launchlabPdas, lockCoder, lockPdas, programsFor, WSOL_MINT } from "@launchpad/chain";
import { LOCAL_QUOTES, migrateCurve, mintLocalQuote } from "@launchpad/localnet";
import { FEE_COLLECTOR_CRON } from "@launchpad/stack";
import { BurnsPage, CoinRewards, HolderList, JobRun, JobRunList, LaunchList, LedgerPage, Revenue, type LedgerEntry } from "@launchpad/contract";
import {
  SOL, coinsOf, connection, deliverWebhook, env, feeAt, feeRates, fundedWallet, launch, launchedCoin, networkFee, quote, tokenBalance, trade,
} from "./client";

const programs = programsFor("localnet");
const WSOL = WSOL_MINT.toBase58();
const USDC = LOCAL_QUOTES.USDC;
const usdc = (n: number) => BigInt(Math.round(n * 1e6));
const ops = () => new PublicKey(env().platform.operationsWallet);

/**
 * SOL the operations wallet holds for the holders of Reward Launches paid in SOL (ADR 0006, #43): what their Reward
 * Sales brought in and no round has paid out yet. Other test files leave such pots behind; the sweep never takes them.
 */
async function rewardPots() {
  let pots = 0n;
  for (let offset: number | null = 0; offset !== null; ) {
    const page = LaunchList.parse(await (await fetch(`${env().apiUrl}/v1/launches?limit=100&offset=${offset}`)).json());
    for (const l of page.launches) {
      if (l.rewardTax?.payout !== "quote" || l.quote.mint !== WSOL) continue;
      const r = CoinRewards.parse(await (await fetch(`${env().apiUrl}/v1/launches/${l.mint}/rewards`)).json());
      pots += BigInt(r.sales!.proceeds) - r.rounds.reduce((paid, round) => paid + BigInt(round.paid), 0n);
    }
    offset = page.nextOffset;
  }
  return pots;
}
const treasury = () => new PublicKey(env().treasury);
const platformConfig = () => new PublicKey(env().platform.platformConfig);
const platformFeeVault = (quoteMint: PublicKey) => launchlabPdas(programs.launchlab).platformFeeVault(platformConfig(), quoteMint);
const lamportsOf = async (owner: PublicKey) => BigInt(await connection().getBalance(owner, "confirmed"));
const tokensOf = (owner: PublicKey, mint: PublicKey) => tokenBalance(getAssociatedTokenAddressSync(mint, owner, true));
const sum = (xs: bigint[]) => xs.reduce((a, b) => a + b, 0n);

/** Runs the Fee Collector's Cron Trigger and returns the run it recorded, as the operator sees it. */
async function runCollector() {
  const res = await fetch(`${env().apiUrl}/__scheduled?cron=${encodeURIComponent(FEE_COLLECTOR_CRON)}`);
  const [run] = (await jobRuns()).runs;
  expect(run, "the run's record").toBeDefined();
  if (!res.ok || run!.status !== "succeeded") throw new Error(`the Fee Collector failed: ${res.status} ${JSON.stringify(run)}`);
  return run!;
}

/** What the Creator Forward sent in the Cron Trigger's run just made, which must have succeeded. */
async function forwarded() {
  const [run] = (await jobRuns(env().operatorToken, "creator-forward")).runs;
  expect(run, "the Creator Forward's run").toMatchObject({ status: "succeeded" });
  return (run!.summary as { sent: Forward[] }).sent;
}

type Forward = { creator: string; mint: string; amount: string; signature: string; outcome: string };
const forwardedIn = (forwards: Forward[], mint: string) => sum(forwards.filter((f) => f.mint === mint).map((f) => BigInt(f.amount)));

async function jobRuns(token = env().operatorToken, job = "fee-collector") {
  const res = await fetch(`${env().apiUrl}/v1/operator/jobs?job=${job}`, { headers: { authorization: `Bearer ${token}` } });
  if (res.status === 401) return { status: 401, runs: [], pending: [] };
  return { status: res.status, ...JobRunList.parse(await res.json()) };
}

type Sent = { purpose: string; subject: string; signature: string; outcome: string; entries: number };
const sentBy = (run: JobRun) => (run.summary as { sent: Sent[] }).sent;

/** Every Ledger entry, newest first, following the cursor to the end. */
async function ledger(query: Record<string, string> = {}) {
  const entries: LedgerEntry[] = [];
  let before: string | null = null;
  do {
    const params = new URLSearchParams({ limit: "100", ...query, ...(before ? { before } : {}) });
    const page = LedgerPage.parse(await (await fetch(`${env().apiUrl}/v1/ledger?${params}`)).json());
    entries.push(...page.entries);
    before = page.next;
  } while (before);
  return entries;
}

const entriesOf = async (signatures: string[]) => (await ledger()).filter((e) => signatures.includes(e.signature));

async function revenue() {
  return Revenue.parse(await (await fetch(`${env().apiUrl}/v1/revenue`)).json());
}

/** What the platform has collected for Creators in one asset and not forwarded yet: shares still under the minimum. */
async function pendingForCreators(mint: PublicKey) {
  return BigInt((await revenue()).totals.find((t) => t.asset.mint === mint.toBase58())?.creatorPending ?? "0");
}

/**
 * What the operations wallet holds in a Quote Asset beyond what Creators are owed: the Burn's two-step buy (burn.test.ts)
 * leaves the Quote Asset its swap delivered beyond what the pool took, which is outside the Ledger and never swept.
 */
async function surplusOf(mint: PublicKey) {
  return (await tokensOf(ops(), mint)) - (await pendingForCreators(mint));
}

/** The creator fees a pool holds for its creator, per token in the pool's order. */
async function poolCreatorFees(pool: PublicKey) {
  const account = await connection().getAccountInfo(pool, "confirmed");
  const s = cpmmCoder.accounts.decode("PoolState", account!.data) as { token_0_mint: PublicKey; creator_fees_token_0: BN; creator_fees_token_1: BN };
  return { token0: s.token_0_mint, fees: [BigInt(s.creator_fees_token_0.toString()), BigInt(s.creator_fees_token_1.toString())] as const };
}

/** The pool's creator fee on the Quote Asset side. */
async function quoteCreatorFee(pool: PublicKey, quoteMint: PublicKey) {
  const p = await poolCreatorFees(pool);
  return p.token0.equals(quoteMint) ? p.fees[0] : p.fees[1];
}

/** A coin that sold out its curve and that Raydium's migrate wallet moved into its pool, open for swaps, all indexed. */
async function graduatedCoin(opts: { quoteMint?: PublicKey } = {}) {
  const quoteMint = opts.quoteMint ?? WSOL_MINT;
  const creator = await fundedWallet();
  const { prepared, signature } = await launch(creator, { quoteMint: quoteMint.toBase58(), symbol: "FEES" });
  await deliverWebhook([signature]);
  const trader = await fundedWallet(10);
  // The local Graduation Target is 1 SOL, which the stack prices at 150 USDC.
  if (!quoteMint.equals(WSOL_MINT)) await mintLocalQuote(connection(), quoteMint, trader.publicKey, usdc(1_000));
  const buyout = await trade(trader, prepared.mint, "buy", quoteMint.equals(WSOL_MINT) ? SOL(2) : usdc(200));
  expect(buyout.quote.completesCurve).toBe(true);
  const migration = await migrateCurve(connection(), new PublicKey(prepared.pool));
  await deliverWebhook([buyout.signature, migration.signature]);
  for (let i = 0; i < 40 && !(await quote(prepared.mint, { side: "buy", amount: "1000000" })).ok; i++) await new Promise((r) => setTimeout(r, 250));
  // The buyout is the coin's only curve trade, so half of its Platform Fee is all the Creator earned on the curve (ADR 0009).
  return { mint: prepared.mint, curve: new PublicKey(prepared.pool), pool: migration.pool, trader, quoteMint, creator, curveShare: BigInt(buyout.quote.fees.platform) / 2n };
}

/** Trades in a graduated coin's pool, indexed; returns the pool creator fees the trades paid. */
async function poolTrades(coin: { mint: string; trader: Keypair }, buy: bigint) {
  const b = await trade(coin.trader, coin.mint, "buy", buy);
  const s = await trade(coin.trader, coin.mint, "sell", (await coinsOf(coin.mint, coin.trader)) / 5n);
  await deliverWebhook([b.signature, s.signature]);
  return BigInt(b.quote.fees.platform) + BigInt(s.quote.fees.platform);
}

const networkFees = async (signatures: string[]) => sum(await Promise.all(signatures.map(networkFee)));

beforeAll(async () => {
  // Whatever earlier test files left to collect is collected, and the operations wallet swept, so each test here starts
  // from empty vaults and a wallet below the sweep threshold.
  await runCollector();
});

describe("the Platform Fee", () => {
  it("claims exactly what curve trades paid into the SOL vault, as plain SOL, and records it on the Ledger", async () => {
    // The Creator's First Buy, in the launch transaction, pays the Platform Fee like any curve trade.
    const creator = await fundedWallet();
    const launched = await launch(creator, { firstBuy: SOL(0.2).toString() });
    await deliverWebhook([launched.signature]);
    const mint = launched.prepared.mint;
    const trader = await fundedWallet();
    const trades = [await trade(trader, mint, "buy", SOL(0.4)), await trade(trader, mint, "buy", SOL(0.1))];
    trades.push(await trade(trader, mint, "sell", (await coinsOf(mint, trader)) / 2n));
    const paid = BigInt(launched.prepared.firstBuy!.fees.platform) + sum(trades.map((t) => BigInt(t.quote.fees.platform)));
    expect(BigInt(launched.prepared.firstBuy!.fees.platform)).toBe(feeAt(SOL(0.2), (await feeRates()).platform));
    await deliverWebhook(trades.map((t) => t.signature));
    // Half of each trade's Platform Fee is the Creator's (ADR 0009); the chain itself paid the Creator nothing.
    expect([launched.prepared.firstBuy!.fees.creator, ...trades.map((t) => t.quote.fees.creator)]).toEqual(["0", "0", "0", "0"]);
    const share = BigInt(launched.prepared.firstBuy!.fees.platform) / 2n + sum(trades.map((t) => BigInt(t.quote.fees.platform) / 2n));
    const creatorSol = await lamportsOf(creator.publicKey);
    const vault = platformFeeVault(WSOL_MINT);
    expect(await tokenBalance(vault)).toBe(paid);

    const before = await lamportsOf(ops());
    const run = await runCollector();
    const claims = sentBy(run).filter((s) => s.purpose === "platform_fee");
    expect(claims).toEqual([{ purpose: "platform_fee", subject: vault.toBase58(), signature: expect.any(String), outcome: "landed", entries: 1 }]);
    expect(await tokenBalance(vault)).toBe(0n);
    // The wrapped SOL the claim paid out was unwrapped in the same transaction.
    expect(await connection().getAccountInfo(getAssociatedTokenAddressSync(WSOL_MINT, ops()))).toBeNull();
    // The Creator's share then went on to the Creator, as plain SOL, in the same Cron Trigger.
    const forwards = await forwarded();
    expect(forwards).toEqual([{ creator: creator.publicKey.toBase58(), mint: WSOL, amount: share.toString(), signature: expect.any(String), outcome: "paid" }]);
    expect((await lamportsOf(creator.publicKey)) - creatorSol).toBe(share);
    expect((await lamportsOf(ops())) - before).toBe(paid - share - (await networkFees([...sentBy(run), ...forwards].map((s) => s.signature))));

    expect(await entriesOf([claims[0]!.signature])).toEqual([{
      signature: claims[0]!.signature, index: 0, kind: "platform_fee", asset: expect.objectContaining({ mint: WSOL, symbol: "SOL", decimals: 9 }),
      amount: paid.toString(), source: vault.toBase58(), destination: ops().toBase58(), launch: null, slot: expect.any(Number), time: expect.any(String),
    }]);
  });

  it("claims a USDC vault in USDC and sweeps it on to the treasury", async () => {
    const creator = await fundedWallet();
    const { prepared, signature } = await launch(creator, { quoteMint: USDC.toBase58(), symbol: "USDF" });
    await deliverWebhook([signature]);
    const trader = await fundedWallet();
    await mintLocalQuote(connection(), USDC, trader.publicKey, usdc(100));
    // Another test file's Reward Sales in USDC can leave the vault a Platform Fee too small to claim on its own; it is
    // claimed with this test's, and its Creator's share waits under the forward's minimum.
    const vault = platformFeeVault(USDC);
    const dust = await tokenBalance(vault);
    const buys = [await trade(trader, prepared.mint, "buy", usdc(40)), await trade(trader, prepared.mint, "buy", usdc(12.5))];
    await deliverWebhook(buys.map((t) => t.signature));
    const paid = sum(buys.map((t) => BigInt(t.quote.fees.platform)));
    const rates = await feeRates();
    expect(paid).toBe(feeAt(usdc(40), rates.platform) + feeAt(usdc(12.5), rates.platform));
    const share = sum(buys.map((t) => BigInt(t.quote.fees.platform) / 2n));
    expect(await tokenBalance(vault)).toBe(dust + paid);
    const inTreasury = await tokensOf(treasury(), USDC);
    const surplus = await surplusOf(USDC);
    const held = (await tokensOf(ops(), USDC)) - surplus;

    const run = await runCollector();
    const claim = sentBy(run).find((s) => s.purpose === "platform_fee" && s.subject === vault.toBase58())!;
    const sweep = sentBy(run).find((s) => s.purpose === "sweep")!;
    expect(await tokenBalance(vault)).toBe(0n);
    // The sweep left the Creator's share behind, and the Creator Forward paid it to the Creator in USDC.
    const forwards = await forwarded();
    const forward = forwards.find((f) => f.creator === creator.publicKey.toBase58())!;
    expect(forward).toMatchObject({ mint: USDC.toBase58(), amount: share.toString(), outcome: "paid" });
    expect(await tokensOf(creator.publicKey, USDC)).toBe(share);
    expect(await tokensOf(ops(), USDC)).toBe(surplus + (await pendingForCreators(USDC)));
    // Everything else went to the treasury: this test's fees less its Creator's share, when the vault started empty.
    const swept = held + dust + paid - forwardedIn(forwards, USDC.toBase58()) - (await pendingForCreators(USDC));
    if (dust === 0n) expect(swept).toBe(paid - share);
    expect((await tokensOf(treasury(), USDC)) - inTreasury).toBe(swept);

    const usdcRef = expect.objectContaining({ mint: USDC.toBase58(), symbol: "USDC", decimals: 6 });
    expect(await entriesOf([claim.signature, sweep.signature, forward.signature])).toEqual([
      expect.objectContaining({ signature: forward.signature, kind: "creator_forward", asset: usdcRef, amount: share.toString(), source: ops().toBase58(), destination: creator.publicKey.toBase58(), launch: null }),
      expect.objectContaining({ signature: sweep.signature, kind: "sweep", asset: usdcRef, amount: swept.toString(), source: ops().toBase58(), destination: treasury().toBase58() }),
      expect.objectContaining({ signature: claim.signature, kind: "platform_fee", asset: usdcRef, amount: (dust + paid).toString(), source: vault.toBase58() }),
    ]);
  });
});

describe("after Graduation", () => {
  it("collects the pool creator fee and the Fee Key's LP fees of a SOL pool, exactly as the chain pays them", async () => {
    const coin = await graduatedCoin();
    const paid = await poolTrades(coin, SOL(0.5));
    expect(await quoteCreatorFee(coin.pool, WSOL_MINT)).toBe(paid);
    const sol = await lamportsOf(ops());
    const coinsInTreasury = await tokensOf(treasury(), new PublicKey(coin.mint));

    const run = await runCollector();
    const sent = sentBy(run);
    const poolFee = sent.find((s) => s.purpose === "pool_fee" && s.subject === coin.pool.toBase58())!;
    const feeKey = sent.find((s) => s.purpose === "fee_key" && s.subject === coin.pool.toBase58())!;
    expect(poolFee).toMatchObject({ outcome: "landed", entries: 1 });
    // The Fee Key pays out both of the pool's tokens: SOL and the coin.
    expect(feeKey).toMatchObject({ outcome: "landed", entries: 2 });
    expect(await quoteCreatorFee(coin.pool, WSOL_MINT)).toBe(0n);

    const entries = await entriesOf([poolFee.signature, feeKey.signature]);
    const launch = { mint: coin.mint, symbol: "FEES", name: "Tracer" };
    const pool = coin.pool.toBase58();
    expect(entries.find((e) => e.kind === "pool_fee")).toMatchObject({ asset: { mint: WSOL }, amount: paid.toString(), source: pool, launch });
    const keySol = entries.find((e) => e.kind === "fee_key" && e.asset.mint === WSOL)!;
    const keyCoins = entries.find((e) => e.kind === "fee_key" && e.asset.mint === coin.mint)!;
    expect(keySol).toMatchObject({ source: pool, destination: ops().toBase58(), launch });
    expect(keyCoins).toMatchObject({ source: pool, launch, asset: { symbol: "FEES", decimals: 6, logo: expect.stringContaining(coin.mint) } });
    expect(BigInt(keySol.amount)).toBeGreaterThan(0n);
    expect(BigInt(keyCoins.amount)).toBeGreaterThan(0n);

    // Every lamport the operations wallet gained is on the Ledger, less the network fees and the rent of the two coin
    // accounts it opened: its own, where the Fee Key paid the coins, and the treasury's, where the sweep moved them on.
    // The curve's buyout paid a Platform Fee too, which the same run claimed.
    expect(sent.map((s) => s.purpose)).toEqual(["platform_fee", "pool_fee", "fee_key", "sweep"]);
    const platformFee = sum((await entriesOf([sent[0]!.signature])).map((e) => BigInt(e.amount)));
    const solIn = sum((await entriesOf(sent.map((s) => s.signature))).filter((e) => e.asset.mint === WSOL && e.kind !== "sweep").map((e) => BigInt(e.amount)));
    expect(solIn).toBe(platformFee + paid + BigInt(keySol.amount));
    const rent = BigInt(await connection().getMinimumBalanceForRentExemption(ACCOUNT_SIZE));
    // The Creator's share of it (ADR 0009) went on to the Creator: half of the curve's Platform Fee, and half of the pool fee.
    const forwards = await forwarded();
    expect(forwards).toEqual([
      { creator: coin.creator.publicKey.toBase58(), mint: WSOL, amount: (coin.curveShare + paid / 2n).toString(), signature: expect.any(String), outcome: "paid" },
    ]);
    expect((await lamportsOf(ops())) - sol).toBe(
      solIn - forwardedIn(forwards, WSOL) - (await networkFees([...sent, ...forwards].map((s) => s.signature))) - 2n * rent,
    );
    expect((await tokensOf(treasury(), new PublicKey(coin.mint))) - coinsInTreasury).toBe(BigInt(keyCoins.amount));
    expect(await tokensOf(ops(), new PublicKey(coin.mint))).toBe(0n);
    // The coin's holders name the treasury as the platform's, rather than as an unknown wallet.
    const { holders } = HolderList.parse(await (await fetch(`${env().apiUrl}/v1/launches/${coin.mint}/holders`)).json());
    expect(holders).toContainEqual(expect.objectContaining({ owner: treasury().toBase58(), kind: "treasury", amount: keyCoins.amount }));

    // The lock program counts what was collected against the locked LP.
    const record = await lockedLiquidity(coin.pool);
    expect(record.claimed).toBeGreaterThan(0n);
  });

  it("collects a USDC pool's creator fee and Fee Key in USDC", async () => {
    const coin = await graduatedCoin({ quoteMint: USDC });
    const paid = await poolTrades(coin, usdc(50));
    expect(await quoteCreatorFee(coin.pool, USDC)).toBe(paid);
    const inTreasury = await tokensOf(treasury(), USDC);
    const surplus = await surplusOf(USDC);

    const run = await runCollector();
    const sent = sentBy(run);
    expect(sent.map((s) => [s.purpose, s.outcome])).toEqual([
      ["platform_fee", "landed"], ["pool_fee", "landed"], ["fee_key", "landed"], ["sweep", "landed"],
    ]);
    const entries = await entriesOf(sent.map((s) => s.signature));
    expect(entries.find((e) => e.kind === "pool_fee")).toMatchObject({ asset: { symbol: "USDC" }, amount: paid.toString(), source: coin.pool.toBase58() });
    expect(entries.filter((e) => e.kind === "fee_key").map((e) => e.asset.mint).sort()).toEqual([coin.mint, USDC.toBase58()].sort());
    expect(await quoteCreatorFee(coin.pool, USDC)).toBe(0n);
    // Every USDC collected (the buyout's Platform Fee, the pool fee, the Fee Key's share) went on to the treasury in the
    // same run, but for the Creator's share: half of the curve's Platform Fee and half of the pool fee, which the Creator got.
    const usdcOf = (kinds: string[]) => sum(entries.filter((e) => e.asset.mint === USDC.toBase58() && kinds.includes(e.kind)).map((e) => BigInt(e.amount)));
    const share = coin.curveShare + paid / 2n;
    expect(usdcOf(["sweep"])).toBe(usdcOf(["platform_fee", "pool_fee", "fee_key"]) - share);
    expect((await tokensOf(treasury(), USDC)) - inTreasury).toBe(usdcOf(["sweep"]));
    expect((await forwarded()).find((f) => f.creator === coin.creator.publicKey.toBase58())).toMatchObject({ mint: USDC.toBase58(), amount: share.toString(), outcome: "paid" });
    expect(await tokensOf(coin.creator.publicKey, USDC)).toBe(share);
    expect(await tokensOf(ops(), USDC)).toBe(surplus + (await pendingForCreators(USDC)));
  });

  it("leaves a fee worth less than the collection minimum to grow, and collects it once it is worth it", async () => {
    const coin = await graduatedCoin();
    await runCollector(); // what the buyout and migration left behind
    const tiny = await trade(coin.trader, coin.mint, "buy", SOL(0.01));
    await deliverWebhook([tiny.signature]);
    const fee = BigInt(tiny.quote.fees.platform);
    expect(fee).toBeLessThan(BigInt(env().collectMinLamports));

    const skipped = await runCollector();
    expect(sentBy(skipped).filter((s) => s.subject === coin.pool.toBase58())).toEqual([]);
    expect((skipped.summary as { leftToGrow: number }).leftToGrow).toBeGreaterThan(0);
    expect(await quoteCreatorFee(coin.pool, WSOL_MINT)).toBe(fee);

    const big = await trade(coin.trader, coin.mint, "buy", SOL(0.2));
    await deliverWebhook([big.signature]);
    const collected = await runCollector();
    const poolFee = sentBy(collected).find((s) => s.purpose === "pool_fee" && s.subject === coin.pool.toBase58())!;
    expect((await entriesOf([poolFee.signature]))[0]).toMatchObject({ amount: (fee + BigInt(big.quote.fees.platform)).toString() });
  });
});

describe("the sweep", () => {
  it("moves the operations wallet's SOL above its float to the treasury once it holds more than the threshold", async () => {
    const threshold = BigInt(env().sweepThresholdLamports);
    const float = BigInt(env().sweepFloatLamports);
    // Revenue piles up past the threshold (an airdrop stands in for a busy day).
    const signature = await connection().requestAirdrop(ops(), Number(SOL(4)));
    await connection().confirmTransaction({ signature, ...(await connection().getLatestBlockhash("confirmed")) }, "confirmed");
    const held = await lamportsOf(ops());
    expect(held).toBeGreaterThan(threshold);
    const inTreasury = await lamportsOf(treasury());

    const run = await runCollector();
    const sweeps = sentBy(run).filter((s) => s.purpose === "sweep");
    expect(sweeps).toHaveLength(1);
    // SOL the Burn and Flywheel have not spent yet stays behind with the float (ADR 0006).
    const budgets = BurnsPage.parse(await (await fetch(`${env().apiUrl}/v1/burns`)).json()).budgets;
    const reserved = BigInt(budgets.burn.available) + BigInt(budgets.flywheel.available);
    // So does SOL owed to Creators (ADR 0009): what the Creator Forward then paid, and what still waits for its minimum.
    const forwards = await forwarded();
    expect(forwards.every((f) => f.mint === WSOL)).toBe(true);
    const waiting = await pendingForCreators(WSOL_MINT);
    // And so does the SOL that Reward Sales brought in for holders (ADR 0006): theirs, never revenue.
    const pots = await rewardPots();
    const owed = waiting + forwardedIn(forwards, WSOL) + pots;
    const [entry] = await entriesOf([sweeps[0]!.signature]);
    expect(entry).toMatchObject({ kind: "sweep", asset: { mint: WSOL }, amount: (held - float - reserved - owed).toString(), source: ops().toBase58(), destination: treasury().toBase58() });
    expect((await lamportsOf(treasury())) - inTreasury).toBe(held - float - reserved - owed);
    const left = await lamportsOf(ops());
    expect(left).toBe(float + reserved + waiting + pots - (await networkFees([sweeps[0]!, ...forwards].map((s) => s.signature))));
    expect(left - reserved - waiting - pots).toBeLessThan(threshold);
  });

  it("sweeps only a token's revenue, leaving anything else the wallet holds in it", async () => {
    // USDC the operations wallet holds for another reason, such as a Reward Round's payout float.
    const other = usdc(7);
    await mintLocalQuote(connection(), USDC, ops(), other);
    const creator = await fundedWallet();
    const { prepared, signature } = await launch(creator, { quoteMint: USDC.toBase58(), symbol: "KEEP" });
    await deliverWebhook([signature]);
    const trader = await fundedWallet();
    await mintLocalQuote(connection(), USDC, trader.publicKey, usdc(20));
    const bought = await trade(trader, prepared.mint, "buy", usdc(20));
    await deliverWebhook([bought.signature]);
    // The platform's part of the fee: the Creator's half of it is forwarded, never swept.
    const share = BigInt(bought.quote.fees.platform) / 2n;
    const fee = BigInt(bought.quote.fees.platform) - share;
    const inTreasury = await tokensOf(treasury(), USDC);
    const held = await tokensOf(ops(), USDC);

    const run = await runCollector();
    const sweep = sentBy(run).find((s) => s.purpose === "sweep")!;
    expect((await entriesOf([sweep.signature])).map((e) => [e.asset.mint, e.amount])).toEqual([[USDC.toBase58(), fee.toString()]]);
    expect((await tokensOf(treasury(), USDC)) - inTreasury).toBe(fee);
    expect((await forwarded()).find((f) => f.creator === creator.publicKey.toBase58())).toMatchObject({ amount: share.toString(), outcome: "paid" });
    expect(await tokensOf(ops(), USDC)).toBe(held);
  });

  it("leaves the wallet alone below the threshold", async () => {
    await runCollector();
    const run = await runCollector();
    expect(sentBy(run)).toEqual([]);
    expect(run.summary).toMatchObject({ sweep: "nothing to sweep" });
  });
});

describe("the Ledger", () => {
  it("records each collection exactly once, however often and however concurrently the job runs", async () => {
    const { mint, creator } = await launchedCoin();
    const trader = await fundedWallet();
    const t = await trade(trader, mint, "buy", SOL(0.3));
    await deliverWebhook([t.signature]);
    const before = await ledger();

    // A Cron Trigger and a manual run at the same moment: one holds the job's lease, the other steps aside.
    const [scheduled, manual] = await Promise.all([
      fetch(`${env().apiUrl}/__scheduled?cron=${encodeURIComponent(FEE_COLLECTOR_CRON)}`),
      fetch(`${env().apiUrl}/v1/operator/jobs/fee-collector`, { method: "POST", headers: { authorization: `Bearer ${env().operatorToken}` } }),
    ]);
    expect(scheduled.ok).toBe(true);
    expect(manual.ok).toBe(true);
    const [latest, earlier] = (await jobRuns()).runs;
    expect([latest!.status, earlier!.status].sort()).toEqual(["skipped", "succeeded"]);
    await runCollector();
    await runCollector();

    const after = await ledger();
    const added = after.filter((e) => !before.some((b) => b.signature === e.signature && b.index === e.index));
    // The collection, and the Creator's half of it forwarded once.
    expect(added.map((e) => [e.kind, e.amount, e.destination])).toEqual([
      ["creator_forward", (BigInt(t.quote.fees.platform) / 2n).toString(), creator.publicKey.toBase58()],
      ["platform_fee", t.quote.fees.platform, ops().toBase58()],
    ]);
    // No signature and position appears twice.
    expect(new Set(after.map((e) => `${e.signature}.${e.index}`)).size).toBe(after.length);
  });

  it("pages newest first with a cursor, and filters by kind", async () => {
    const all = await ledger();
    expect(all.length).toBeGreaterThan(3);
    const first = LedgerPage.parse(await (await fetch(`${env().apiUrl}/v1/ledger?limit=2`)).json());
    expect(first.entries).toEqual(all.slice(0, 2));
    const second = LedgerPage.parse(await (await fetch(`${env().apiUrl}/v1/ledger?limit=2&before=${first.next}`)).json());
    expect(second.entries).toEqual(all.slice(2, 4));
    expect(await ledger({ kind: "sweep" })).toEqual(all.filter((e) => e.kind === "sweep"));
    expect((await fetch(`${env().apiUrl}/v1/ledger?before=nonsense`)).status).toBe(400);
  });

  it("adds up to the revenue totals, per asset and per day", async () => {
    const [entries, r] = [await ledger(), await revenue()];
    expect(r).toMatchObject({ operationsWallet: ops().toBase58(), treasury: treasury().toBase58(), sweepThresholdLamports: env().sweepThresholdLamports });
    const total = (mint: string, kind: string) => sum(entries.filter((e) => e.asset.mint === mint && e.kind === kind).map((e) => BigInt(e.amount)));
    // Revenue streams only: the sweep moves revenue on, the Creator Forward pays Creators their share, the Burn and Flywheel
    // spend it, and a Reward Sale's proceeds are the holders'.
    const mints = [...new Set(entries.filter((e) => ["platform_fee", "pool_fee", "fee_key"].includes(e.kind)).map((e) => e.asset.mint))];
    expect(r.totals.map((t) => t.asset.mint).sort()).toEqual(mints.sort());
    expect(r.totals[0]!.asset.mint).toBe(WSOL);
    for (const t of r.totals) {
      const streams = { platformFee: total(t.asset.mint, "platform_fee"), poolFee: total(t.asset.mint, "pool_fee"), feeKey: total(t.asset.mint, "fee_key") };
      expect(t).toEqual({
        asset: expect.objectContaining({ mint: t.asset.mint }),
        platformFee: streams.platformFee.toString(),
        poolFee: streams.poolFee.toString(),
        feeKey: streams.feeKey.toString(),
        total: (streams.platformFee + streams.poolFee + streams.feeKey).toString(),
        swept: total(t.asset.mint, "sweep").toString(),
        creatorForwarded: total(t.asset.mint, "creator_forward").toString(),
        creatorPending: expect.stringMatching(/^\d+$/),
      });
    }
    // Everything here happened today, so today's totals are the all-time totals.
    expect(r.days).toHaveLength(1);
    expect(r.days[0]!.day).toBe(new Date().toISOString().slice(0, 10));
    expect(r.days[0]!.assets).toEqual(r.totals.map((t) => ({ asset: t.asset, platformFee: t.platformFee, poolFee: t.poolFee, feeKey: t.feeKey, total: t.total })));
  });
});

describe("the operator's view of the job", () => {
  it("is behind the operator token", async () => {
    expect((await jobRuns("wrong")).status).toBe(401);
    expect((await fetch(`${env().apiUrl}/v1/operator/jobs/fee-collector`, { method: "POST" })).status).toBe(401);
  });

  it("lists every run with what it did, and nothing left pending", async () => {
    const { runs, pending } = await jobRuns();
    expect(runs.length).toBeGreaterThan(5);
    expect(runs.every((r) => r.job === "fee-collector" && ["succeeded", "skipped"].includes(r.status))).toBe(true);
    expect(pending).toEqual([]);
  });
});

async function lockedLiquidity(pool: PublicKey) {
  const lock = programs.lock;
  const accounts = await connection().getProgramAccounts(lock, { commitment: "confirmed", filters: [{ memcmp: { offset: 64, bytes: pool.toBase58() } }] });
  expect(accounts).toHaveLength(1);
  const s = lockCoder.accounts.decode("LockedCpLiquidityState", accounts[0]!.account.data) as { claimed_lp_amount: BN; fee_nft_mint: PublicKey };
  expect(accounts[0]!.pubkey.equals(lockPdas(lock).lockedLiquidity(s.fee_nft_mint))).toBe(true);
  return { claimed: BigInt(s.claimed_lp_amount.toString()) };
}
