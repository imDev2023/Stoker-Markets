// Creator Earnings and the Creator Forward (ADR 0009): a Creator earns half of what the platform collects on their
// coin's trades, about 0.5% of every trade on the curve (out of the 1.00% Platform Fee) and after Graduation (out of
// the pool creator fee), paid in the Quote Asset with nothing to claim; the chain itself pays the Creator nothing.
// Every forward is on the Ledger, a share under the minimum waits, and a failed or repeated run never pays the same
// share twice.
import { describe, expect, it } from "vitest";
import { Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID, calculateEpochFee, createTransferCheckedInstruction, getAssociatedTokenAddressSync, getMint, getTransferFeeConfig,
} from "@solana/spl-token";
import { cpmmCoder, launchlabPdas, WSOL_MINT } from "@launchpad/chain";
import { CPSWAP_CONFIG, LOCAL_QUOTES, localnetKeys, migrateCurve, mintLocalQuote } from "@launchpad/localnet";
import { FEE_COLLECTOR_CRON } from "@launchpad/stack";
import { CreatorEarnings, CreatorForwardList, JobRun, LedgerPage, OperatorAlertList, Revenue } from "@launchpad/contract";
import { freePort, startApi } from "@launchpad/stack";
import {
  SOL, coinsOf, connection, deliverWebhook, env, feeAt, feeRates, fundedWallet, getLaunch, graduationFeeIn, launch, launchedCoin, listQuotes, networkFee,
  platformInfo, quote, rawTransaction, solOf, tokenBalance, trade,
} from "./client";

const WSOL = WSOL_MINT.toBase58();
const USDC = LOCAL_QUOTES.USDC;
const TAXQ = LOCAL_QUOTES.TAXQ;
const SOL_QUOTE = expect.objectContaining({ mint: WSOL, symbol: "SOL", decimals: 9 });
const units = (n: number) => BigInt(Math.round(n * 1e6));
const ops = () => new PublicKey(env().platform.operationsWallet);
const api = (path: string, init?: RequestInit) => fetch(`${env().apiUrl}${path}`, init);
const operator = () => ({ authorization: `Bearer ${env().operatorToken}`, "content-type": "application/json" });

type Forward = { creator: string; mint: string; amount: string; signature: string; outcome: string; error?: string };
type Withheld = { mint: string; creator: string; assetMint: string; amount: string; lamports: string; settled: boolean };
type Summary = { settled: unknown[]; graduationFees: Withheld[]; sent: Forward[]; belowMinimum: number; problems: string[] };

/** Half of a trade's Platform Fee, rounded down: the Creator's share of it (ADR 0009). */
const halfOf = (platformFee: string) => BigInt(platformFee) / 2n;

/** Runs one job now, as the operator would; the run comes back whether it succeeded or failed. */
async function runJob(job: "fee-collector" | "creator-forward") {
  const res = await api(`/v1/operator/jobs/${job}`, { method: "POST", headers: operator() });
  return { status: res.status, run: JobRun.parse(await res.json()) };
}

/** The Fee Collector, then the Creator Forward, as their shared Cron Trigger runs them; returns what was forwarded. */
async function collectAndForward() {
  const collected = await runJob("fee-collector");
  expect(collected.status, JSON.stringify(collected.run)).toBe(200);
  const forwarded = await runJob("creator-forward");
  expect(forwarded.status, JSON.stringify(forwarded.run)).toBe(200);
  return (forwarded.run.summary as Summary).sent;
}

async function earnings(creator: PublicKey) {
  const res = await api(`/v1/creators/${creator.toBase58()}/earnings`);
  expect(res.status).toBe(200);
  return CreatorEarnings.parse(await res.json());
}

async function forwards(creator: PublicKey) {
  return CreatorForwardList.parse(await (await api(`/v1/creators/${creator.toBase58()}/forwards`)).json()).forwards;
}

async function ledgerForwards() {
  return LedgerPage.parse(await (await api("/v1/ledger?kind=creator_forward&limit=100")).json()).entries;
}

const alerts = async () => OperatorAlertList.parse(await (await api("/v1/operator/alerts", { headers: operator() })).json()).alerts;
const openAlert = async () => (await alerts()).find((a) => a.kind === "job_failed" && a.subject === "creator-forward" && a.resolvedAt === null);

/** What LaunchLab's Creator Fee vault for SOL holds for a Creator: nothing, on our platform, ever. */
const creatorVault = (creator: PublicKey) => tokenBalance(launchlabPdas(new PublicKey(env().platform.launchlab)).creatorFeeVault(creator, WSOL_MINT));

/** A coin launched by this Creator, indexed. */
async function coinOf(creator: Keypair, form?: Parameters<typeof launch>[1]) {
  const { prepared, signature } = await launch(creator, form);
  await deliverWebhook([signature]);
  return prepared.mint;
}

/** A buy on a coin's curve, indexed; returns the Creator's share of it, half of its Platform Fee. */
async function curveBuy(mint: string, amount: bigint, trader?: Keypair) {
  const t = await trade(trader ?? (await fundedWallet()), mint, "buy", amount);
  await deliverWebhook([t.signature]);
  // The chain pays the Creator nothing: the whole share is the platform's to forward.
  expect(t.quote.fees.creator).toBe("0");
  return halfOf(t.quote.fees.platform);
}

describe("the creator page", () => {
  it("shows what each Quote Asset and each coin earned, half of the Platform Fee its trades paid, newest coin first", async () => {
    const creator = await fundedWallet();
    const first = await coinOf(creator);
    const second = await coinOf(creator);
    const shares = [await curveBuy(first, SOL(0.1)), await curveBuy(second, SOL(0.2)), await curveBuy(first, SOL(0.05))];
    expect(shares[0]).toBe(feeAt(SOL(0.1), (await feeRates()).platform) / 2n);
    const earned = shares[0]! + shares[1]! + shares[2]!;

    const e = await earnings(creator.publicKey);
    expect(e.creator).toBe(creator.publicKey.toBase58());
    // Earned from the moment the trades are indexed; nothing is forwarded before the Fee Collector has run.
    expect(e.assets).toEqual([{ quote: SOL_QUOTE, earned: earned.toString(), withheld: "0", forwarded: "0", pending: earned.toString() }]);
    expect(e.launches.map((l) => [l.mint, l.curve, l.pool, l.status])).toEqual([
      [second, shares[1]!.toString(), "0", "live"],
      [first, (shares[0]! + shares[2]!).toString(), "0", "live"],
    ]);
    expect(e.launches[0]).toMatchObject({ name: expect.stringMatching(/^Tracer /), symbol: expect.stringMatching(/^T[A-Z0-9]{6}$/), quote: SOL_QUOTE, image: expect.stringContaining(second) });
    // There is nothing on-chain for the Creator to claim: their LaunchLab vault was never paid into.
    expect(await creatorVault(creator.publicKey)).toBe(0n);
  });

  it("shows nothing for a wallet that never launched here, and refuses what is not an address", async () => {
    const nobody = Keypair.generate().publicKey;
    expect(await earnings(nobody)).toEqual({ creator: nobody.toBase58(), assets: [], launches: [] });
    expect(await forwards(nobody)).toEqual([]);
    expect((await api("/v1/creators/not-an-address/earnings")).status).toBe(400);
    expect((await api("/v1/creators/not-an-address/forwards")).status).toBe(400);
  });

  it("keeps a coin paired with USDC apart, in USDC, beside the SOL one", async () => {
    const creator = await fundedWallet();
    const solCoin = await coinOf(creator);
    const usdcCoin = await coinOf(creator, { symbol: "USDK", quoteMint: USDC.toBase58(), exact: true });
    const earnedSol = await curveBuy(solCoin, SOL(0.1));
    const trader = await fundedWallet();
    await mintLocalQuote(connection(), USDC, trader.publicKey, units(50));
    const earnedUsdc = await curveBuy(usdcCoin, units(20), trader);
    expect(earnedUsdc).toBe(feeAt(units(20), (await feeRates()).platform) / 2n);

    const usdcQuote = expect.objectContaining({ mint: USDC.toBase58(), symbol: "USDC", decimals: 6 });
    const e = await earnings(creator.publicKey);
    expect(e.assets).toEqual([
      { quote: SOL_QUOTE, earned: earnedSol.toString(), withheld: "0", forwarded: "0", pending: earnedSol.toString() },
      { quote: usdcQuote, earned: earnedUsdc.toString(), withheld: "0", forwarded: "0", pending: earnedUsdc.toString() },
    ]);
    expect(e.launches.map((l) => [l.symbol, l.quote.mint, l.curve])).toEqual([
      ["USDK", USDC.toBase58(), earnedUsdc.toString()],
      [expect.stringMatching(/^T[A-Z0-9]{6}$/), WSOL, earnedSol.toString()],
    ]);
  });
});

describe("on the curve", () => {
  it("tells every client what the platform forwards, from the fees the chain has", async () => {
    const [platform, rates] = [await platformInfo(), await feeRates()];
    // Half of the Platform Fee on the curve; after Graduation, half of what the platform receives of the creator fee of
    // the CPMM config the PlatformConfig names: the fee less the share Raydium keeps at collection, both read from the chain.
    const config = await connection().getAccountInfo(CPSWAP_CONFIG, "confirmed");
    const { creator_fee_rate, creator_fee_share_rate } = cpmmCoder.accounts.decode("AmmConfig", config!.data) as {
      creator_fee_rate: { toNumber(): number }; creator_fee_share_rate: { toNumber(): number };
    };
    const poolBps = creator_fee_rate.toNumber() / 100;
    const shareBps = creator_fee_share_rate.toNumber() / 100;
    expect(platform.poolCreatorFeeShareBps).toBe(shareBps);
    expect(platform.creatorForward).toEqual({
      shareBps: 5000, curveBps: rates.platform / 2, poolBps: (poolBps * (10_000 - shareBps)) / 10_000 / 2, minLamports: env().creatorForwardMinLamports,
    });
    // Mainnet's config, which the local chain carries: 1% of which Raydium keeps 5%, so 0.475% reaches the Creator.
    expect(platform.creatorForward.poolBps).toBe(47.5);
    // 1.00% Platform Fee and no on-chain Creator Fee (ADR 0009): the Creator's ~0.5% is all forwarded.
    expect([rates.platform, rates.creator]).toEqual([100, 0]);
    expect(platform.creatorForward.curveBps).toBe(50);
  });

  it("earns half of every trade's Platform Fee once it is collected, pays it as plain SOL and records it on the Ledger", async () => {
    const { creator, mint } = await launchedCoin();
    const earned = (await curveBuy(mint, SOL(0.3))) + (await curveBuy(mint, SOL(0.2)));
    const rates = await feeRates();
    expect(earned).toBe(feeAt(SOL(0.3), rates.platform) / 2n + feeAt(SOL(0.2), rates.platform) / 2n);

    // Earned from the moment the trades are indexed, but not owed until the platform has collected the fee it comes from.
    const before = await earnings(creator.publicKey);
    expect(before.assets).toMatchObject([{ quote: { mint: WSOL }, earned: earned.toString(), forwarded: "0", pending: earned.toString() }]);
    expect(before.launches).toMatchObject([{ mint, curve: earned.toString(), pool: "0" }]);
    const early = await runJob("creator-forward");
    expect(early.status).toBe(200);
    expect((early.run.summary as Summary).sent.filter((f) => f.creator === creator.publicKey.toBase58())).toEqual([]);

    const held = await solOf(creator);
    const sent = await collectAndForward();
    const mine = sent.filter((f) => f.creator === creator.publicKey.toBase58());
    expect(mine).toEqual([{ creator: creator.publicKey.toBase58(), mint: WSOL, amount: earned.toString(), signature: expect.any(String), outcome: "paid" }]);
    // Nothing to claim and nothing to sign: the SOL is simply in the Creator's wallet.
    expect((await solOf(creator)) - held).toBe(earned);

    const entry = (await ledgerForwards()).find((e) => e.signature === mine[0]!.signature);
    expect(entry).toMatchObject({
      kind: "creator_forward", asset: { mint: WSOL, symbol: "SOL" }, amount: earned.toString(), source: ops().toBase58(), destination: creator.publicKey.toBase58(), launch: null,
    });
    expect(await forwards(creator.publicKey)).toEqual([
      { signature: mine[0]!.signature, quote: expect.objectContaining({ mint: WSOL }), amount: earned.toString(), status: "paid", time: entry!.time },
    ]);
    const after = await earnings(creator.publicKey);
    expect(after.assets[0]).toMatchObject({ earned: earned.toString(), forwarded: earned.toString(), pending: "0" });
    // The chain itself paid the Creator nothing along the way.
    expect(await creatorVault(creator.publicKey)).toBe(0n);
  });

  it("lets a share under the minimum wait, and pays it whole once it has grown past it", async () => {
    const { creator, mint } = await launchedCoin();
    // Half of a 1% fee on 0.015 SOL is 75,000 lamports, under the stack's 100,000 minimum (0.02 SOL would be exactly it).
    const small = await curveBuy(mint, SOL(0.015));
    expect(small).toBeLessThan(BigInt(env().creatorForwardMinLamports));
    const held = await solOf(creator);

    expect((await collectAndForward()).filter((f) => f.creator === creator.publicKey.toBase58())).toEqual([]);
    expect((await earnings(creator.publicKey)).assets[0]).toMatchObject({ earned: small.toString(), forwarded: "0", pending: small.toString() });
    expect(await solOf(creator)).toBe(held);
    // It is still in the operations wallet, set apart from the platform's revenue.
    const revenue = Revenue.parse(await (await api("/v1/revenue")).json());
    expect(BigInt(revenue.totals.find((t) => t.asset.mint === WSOL)!.creatorPending)).toBeGreaterThanOrEqual(small);

    const more = await curveBuy(mint, SOL(0.1));
    const sent = (await collectAndForward()).filter((f) => f.creator === creator.publicKey.toBase58());
    expect(sent).toMatchObject([{ amount: (small + more).toString(), outcome: "paid" }]);
    expect((await solOf(creator)) - held).toBe(small + more);
  });
});

describe("retries", () => {
  it("pays each share exactly once, however often and however concurrently the job runs", async () => {
    const { creator, mint } = await launchedCoin();
    const earned = await curveBuy(mint, SOL(0.25));
    const held = await solOf(creator);
    expect((await runJob("fee-collector")).status).toBe(200);

    // The Cron Trigger and two manual runs at the same moment: one holds the job's lease, the others step aside.
    const runs = await Promise.all([
      api(`/__scheduled?cron=${encodeURIComponent(FEE_COLLECTOR_CRON)}`),
      runJob("creator-forward"),
      runJob("creator-forward"),
    ]);
    expect(runs[0].ok).toBe(true);
    expect([runs[1].status, runs[2].status]).toEqual([200, 200]);
    await collectAndForward();
    await collectAndForward();

    expect((await solOf(creator)) - held).toBe(earned);
    expect((await forwards(creator.publicKey)).map((f) => [f.amount, f.status])).toEqual([[earned.toString(), "paid"]]);
    expect((await ledgerForwards()).filter((e) => e.destination === creator.publicKey.toBase58()).map((e) => e.amount)).toEqual([earned.toString()]);
  });

  it("raises an alert when a forward can't be paid, and pays it once when it can", async () => {
    const creator = await fundedWallet();
    const mint = await coinOf(creator, { quoteMint: USDC.toBase58(), symbol: "STUCK" });
    const trader = await fundedWallet();
    await mintLocalQuote(connection(), USDC, trader.publicKey, units(100));
    const earned = await curveBuy(mint, units(60), trader);
    expect((await runJob("fee-collector")).status).toBe(200);

    // The operations wallet's USDC goes missing before the forward runs (the hot wallet's own key moves it away).
    const { operations } = localnetKeys();
    const account = getAssociatedTokenAddressSync(USDC, ops());
    const missing = await tokenBalance(account);
    expect(missing).toBeGreaterThanOrEqual(earned);
    const elsewhere = await fundedWallet();
    await mintLocalQuote(connection(), USDC, elsewhere.publicKey, 1n);
    await sendAndConfirmTransaction(connection(), new Transaction().add(
      createTransferCheckedInstruction(account, USDC, getAssociatedTokenAddressSync(USDC, elsewhere.publicKey), ops(), missing, 6),
    ), [operations]);

    const failed = await runJob("creator-forward");
    expect(failed.status).toBe(500);
    expect(failed.run).toMatchObject({ status: "failed", error: expect.stringContaining(`${creator.publicKey.toBase58()} is owed ${earned} of ${USDC.toBase58()}`) });
    expect((failed.run.summary as Summary).sent.filter((f) => f.creator === creator.publicKey.toBase58())).toEqual([]);
    expect((await openAlert())?.message).toMatch(/creator-forward job failed/);
    expect(await tokenBalance(getAssociatedTokenAddressSync(USDC, creator.publicKey))).toBe(0n);
    expect((await earnings(creator.publicKey)).assets.find((a) => a.quote.mint === USDC.toBase58())).toMatchObject({ earned: earned.toString(), forwarded: "0", pending: earned.toString() });

    // The operator puts the money back; the next run pays the share once and the alert is over.
    await mintLocalQuote(connection(), USDC, ops(), missing);
    const retried = await runJob("creator-forward");
    expect(retried.status, JSON.stringify(retried.run)).toBe(200);
    expect((retried.run.summary as Summary).sent.filter((f) => f.creator === creator.publicKey.toBase58())).toMatchObject([{ mint: USDC.toBase58(), amount: earned.toString(), outcome: "paid" }]);
    expect((await runJob("creator-forward")).status).toBe(200);
    expect(await tokenBalance(getAssociatedTokenAddressSync(USDC, creator.publicKey))).toBe(earned);
    expect(await openAlert()).toBeUndefined();
  });

  it("is behind the operator token", async () => {
    expect((await api("/v1/operator/jobs/creator-forward", { method: "POST" })).status).toBe(401);
  });
});

/** What the platform receives of a pool's creator fee counter: Raydium keeps `poolCreatorFeeShareBps` of it, floored. */
async function received(counter: bigint) {
  const share = BigInt((await platformInfo()).poolCreatorFeeShareBps);
  return counter - (counter * share) / 10_000n;
}

describe("after Graduation", () => {

  /** A coin that sold out its curve and was migrated into its pool, open for swaps, all indexed. */
  async function graduatedCoin(quoteMint: PublicKey, buyout: bigint) {
    const creator = await fundedWallet();
    const { prepared, signature } = await launch(creator, { quoteMint: quoteMint.toBase58(), symbol: "GRAD" });
    await deliverWebhook([signature]);
    const trader = await fundedWallet(10);
    if (!quoteMint.equals(WSOL_MINT)) await mintLocalQuote(connection(), quoteMint, trader.publicKey, units(1_000));
    const bought = await trade(trader, prepared.mint, "buy", buyout);
    expect(bought.quote.completesCurve).toBe(true);
    expect(bought.quote.fees.creator).toBe("0");
    const migration = await migrateCurve(connection(), new PublicKey(prepared.pool));
    await deliverWebhook([bought.signature, migration.signature]);
    for (let i = 0; i < 40 && !(await quote(prepared.mint, { side: "buy", amount: "1000000" })).ok; i++) await new Promise((r) => setTimeout(r, 250));
    return { creator, mint: prepared.mint, pool: migration.pool, trader, onCurve: halfOf(bought.quote.fees.platform) };
  }

  it("keeps paying the Creator: half of the pool fee the platform collects, with the creator page showing where it came from", async () => {
    const coin = await graduatedCoin(WSOL_MINT, SOL(2));
    const held = await solOf(coin.creator);
    const buy = await trade(coin.trader, coin.mint, "buy", SOL(0.5));
    const sell = await trade(coin.trader, coin.mint, "sell", (await coinsOf(coin.mint, coin.trader)) / 4n);
    await deliverWebhook([buy.signature, sell.signature]);
    // After Graduation the pool's creator fee is the platform's to collect; the chain pays the Creator nothing there either.
    expect([buy.quote.venue, buy.quote.fees.creator, sell.quote.fees.creator]).toEqual(["pool", "0", "0"]);
    // Raydium keeps its share of the pool's creator fee at collection (5% on mainnet's config); the rest is the platform's.
    const poolFee = await received(BigInt(buy.quote.fees.platform) + BigInt(sell.quote.fees.platform));

    const sent = (await collectAndForward()).filter((f) => f.creator === coin.creator.publicKey.toBase58());
    const share = coin.onCurve + poolFee / 2n;
    // The coin graduated, so its Graduation Fee (ADR 0015) comes out of the share before it is paid.
    const fee = await graduationFeeIn(WSOL);
    expect(sent).toMatchObject([{ mint: WSOL, amount: (share - fee).toString(), outcome: "paid" }]);
    expect((await solOf(coin.creator)) - held).toBe(share - fee);

    const e = await earnings(coin.creator.publicKey);
    expect(e.launches).toMatchObject([{
      mint: coin.mint, status: "graduated", curve: coin.onCurve.toString(), pool: (poolFee / 2n).toString(),
      graduationFee: { lamports: fee.toString(), withheld: fee.toString(), paidLamports: fee.toString(), settledAt: expect.any(String) },
    }]);
    expect(e.assets[0]).toMatchObject({ earned: share.toString(), withheld: fee.toString(), forwarded: (share - fee).toString(), pending: "0" });
    // The platform keeps the other half, and all of the Fee Key's LP fees.
    const revenue = Revenue.parse(await (await api("/v1/revenue")).json());
    const solTotals = revenue.totals.find((t) => t.asset.mint === WSOL)!;
    expect(BigInt(solTotals.creatorForwarded)).toBeGreaterThanOrEqual(share);
    expect(BigInt(solTotals.total)).toBeGreaterThan(BigInt(solTotals.creatorForwarded) + BigInt(solTotals.creatorPending));
  });

  it("works for a Token-2022 Quote Asset with a transfer fee, on the curve and in the pool", async () => {
    const coin = await graduatedCoin(TAXQ, units(300));
    const buy = await trade(coin.trader, coin.mint, "buy", units(40));
    await deliverWebhook([buy.signature]);
    const collected = await runJob("fee-collector");
    expect(collected.status, JSON.stringify(collected.run)).toBe(200);
    // The issuer's fee is withheld from the pool fee on its way to the platform, so half of what arrived is the share.
    const poolFee = LedgerPage.parse(await (await api("/v1/ledger?kind=pool_fee&limit=100")).json()).entries.find((e) => e.launch?.mint === coin.mint)!;
    expect(poolFee.asset.mint).toBe(TAXQ.toBase58());
    expect(BigInt(poolFee.amount)).toBeLessThan(BigInt(buy.quote.fees.platform));
    // Less the Graduation Fee (ADR 0015), the fee's worth in TAXQ at the registry's price.
    const share = coin.onCurve + BigInt(poolFee.amount) / 2n - (await graduationFeeIn(TAXQ.toBase58()));

    const forwarded = await runJob("creator-forward");
    expect(forwarded.status, JSON.stringify(forwarded.run)).toBe(200);
    const sent = (forwarded.run.summary as Summary).sent.filter((f) => f.creator === coin.creator.publicKey.toBase58());
    expect(sent).toMatchObject([{ mint: TAXQ.toBase58(), amount: share.toString(), outcome: "paid" }]);
    // The Creator receives it less the issuer's fee, as on any transfer of the asset; the Ledger records what was sent.
    const mint = await getMint(connection(), TAXQ, "confirmed", TOKEN_2022_PROGRAM_ID);
    const withheld = calculateEpochFee(getTransferFeeConfig(mint)!, BigInt((await connection().getEpochInfo("confirmed")).epoch), share);
    expect(withheld).toBeGreaterThan(0n);
    expect(await tokenBalance(getAssociatedTokenAddressSync(TAXQ, coin.creator.publicKey, false, TOKEN_2022_PROGRAM_ID))).toBe(share - withheld);
    expect((await ledgerForwards()).find((e) => e.signature === sent[0]!.signature)).toMatchObject({ asset: { symbol: "TAXQ" }, amount: share.toString() });
    expect(await networkFee(sent[0]!.signature)).toBeGreaterThan(0n);
  });
});

describe("the Graduation Fee", () => {
  const ledgerFees = async () => LedgerPage.parse(await (await api("/v1/ledger?kind=graduation_fee&limit=100")).json()).entries;

  it("is fixed when the coin graduates, withheld from the Creator's next forward in the Quote Asset, and on the Ledger against the graduation", async () => {
    const creator = await fundedWallet();
    const { prepared, signature } = await launch(creator, { symbol: "GFEE" });
    await deliverWebhook([signature]);
    const trader = await fundedWallet(10);
    const buyout = await trade(trader, prepared.mint, "buy", SOL(2));
    expect(buyout.quote.completesCurve).toBe(true);
    const migration = await migrateCurve(connection(), new PublicKey(prepared.pool));
    await deliverWebhook([buyout.signature, migration.signature]);
    const onCurve = halfOf(buyout.quote.fees.platform);
    const fee = BigInt(env().graduationFeeLamports);
    expect(fee).toBeGreaterThan(0n);
    expect(onCurve).toBeGreaterThan(fee);

    // Fixed at the setting the moment the Graduation is indexed; nothing withheld before anything is collected.
    const unpaid = { lamports: fee.toString(), withheld: "0", paidLamports: "0", settledAt: null };
    expect((await getLaunch(prepared.mint)).launch!.graduation).toMatchObject({ signature: migration.signature, fee: unpaid });
    expect((await earnings(creator.publicKey)).launches).toMatchObject([{ mint: prepared.mint, graduationFee: unpaid }]);
    expect((await runJob("creator-forward")).status).toBe(200);
    expect((await ledgerFees()).filter((e) => e.launch?.mint === prepared.mint)).toEqual([]);

    // The Fee Collector claims the buyout's Platform Fee, and with the Creator's share collected the fee comes out of
    // it, before the sweep; the forward then pays the rest, as plain SOL.
    const held = await solOf(creator);
    const collected = await runJob("fee-collector");
    expect(collected.status, JSON.stringify(collected.run)).toBe(200);
    const withheld = (collected.run.summary as { graduationFees: Withheld[] }).graduationFees.filter((w) => w.mint === prepared.mint);
    expect(withheld).toEqual([{ mint: prepared.mint, creator: creator.publicKey.toBase58(), assetMint: WSOL, amount: fee.toString(), lamports: fee.toString(), settled: true }]);
    const forwarded = await runJob("creator-forward");
    expect(forwarded.status, JSON.stringify(forwarded.run)).toBe(200);
    expect((forwarded.run.summary as Summary).graduationFees.filter((w) => w.mint === prepared.mint)).toEqual([]);
    expect((forwarded.run.summary as Summary).sent.filter((f) => f.creator === creator.publicKey.toBase58())).toMatchObject([{ mint: WSOL, amount: (onCurve - fee).toString(), outcome: "paid" }]);
    expect((await solOf(creator)) - held).toBe(onCurve - fee);

    // One Ledger entry, keyed by the graduation's own transaction: the Creator's share to the platform, in SOL, with the coin.
    const entries = (await ledgerFees()).filter((e) => e.launch?.mint === prepared.mint);
    expect(entries).toEqual([{
      signature: migration.signature, index: 1000, kind: "graduation_fee", asset: expect.objectContaining({ mint: WSOL, symbol: "SOL" }), amount: fee.toString(),
      source: creator.publicKey.toBase58(), destination: ops().toBase58(), launch: { mint: prepared.mint, symbol: expect.stringMatching(/^GFEE/), name: expect.any(String) },
      slot: expect.any(Number), time: expect.any(String),
    }]);
    expect(entries[0]!.slot).toBeGreaterThanOrEqual((await rawTransaction(migration.signature)).slot);

    // The earnings say what was kept; the launch and the Ledger agree; the revenue page counts it as the platform's.
    const paid = { lamports: fee.toString(), withheld: fee.toString(), paidLamports: fee.toString(), settledAt: expect.any(String) };
    const e = await earnings(creator.publicKey);
    expect(e.assets[0]).toMatchObject({ earned: onCurve.toString(), withheld: fee.toString(), forwarded: (onCurve - fee).toString(), pending: "0" });
    expect(e.launches).toMatchObject([{ mint: prepared.mint, graduationFee: paid }]);
    expect((await getLaunch(prepared.mint)).launch!.graduation!.fee).toEqual(paid);
    const revenue = Revenue.parse(await (await api("/v1/revenue")).json());
    expect(BigInt(revenue.totals.find((t) => t.asset.mint === WSOL)!.graduationFee)).toBeGreaterThanOrEqual(fee);

    // Settled: another collection and forward withhold nothing more, and the Ledger keeps its one entry.
    const again = await runJob("fee-collector");
    expect(again.status).toBe(200);
    expect((again.run.summary as { graduationFees: Withheld[] }).graduationFees.filter((w) => w.mint === prepared.mint)).toEqual([]);
    expect((await runJob("creator-forward")).status).toBe(200);
    expect((await ledgerFees()).filter((e) => e.launch?.mint === prepared.mint)).toHaveLength(1);
  });

  it("never makes a forward negative: a fee larger than the share so far takes all of it, sends nothing, and waits for the next collection", async () => {
    // A coin graduated under a fee ten times the stack's, through a second API on the same database.
    const h = env();
    const bigFee = BigInt(h.graduationFeeLamports) * 10n;
    const creator = await fundedWallet();
    const { prepared, signature } = await launch(creator, { symbol: "GBIG" });
    await deliverWebhook([signature]);
    const trader = await fundedWallet(10);
    const buyout = await trade(trader, prepared.mint, "buy", SOL(2));
    expect(buyout.quote.completesCurve).toBe(true);
    await deliverWebhook([buyout.signature]);
    const migration = await migrateCurve(connection(), new PublicKey(prepared.pool));
    const other = await startApi({ port: await freePort(), databaseUrl: h.databaseUrl, vars: { ...h.apiVars, GRADUATION_FEE_LAMPORTS: bigFee.toString() } });
    try {
      const delivered = await fetch(`${other.url}/v1/webhooks/helius`, {
        method: "POST", headers: { "content-type": "application/json", authorization: h.webhookSecret }, body: JSON.stringify([await rawTransaction(migration.signature)]),
      });
      expect(delivered.ok).toBe(true);
    } finally {
      await other.stop();
    }
    for (let i = 0; i < 40 && !(await quote(prepared.mint, { side: "buy", amount: "1000000" })).ok; i++) await new Promise((r) => setTimeout(r, 250));
    const onCurve = halfOf(buyout.quote.fees.platform);
    expect(onCurve).toBeLessThan(bigFee);
    expect((await getLaunch(prepared.mint)).launch!.graduation!.fee).toEqual({ lamports: bigFee.toString(), withheld: "0", paidLamports: "0", settledAt: null });

    // The whole share so far goes toward the fee; the Creator is sent nothing and nothing goes below zero.
    const held = await solOf(creator);
    const sent = await collectAndForward();
    expect(sent.filter((f) => f.creator === creator.publicKey.toBase58())).toEqual([]);
    expect(await solOf(creator)).toBe(held);
    let e = await earnings(creator.publicKey);
    expect(e.assets[0]).toMatchObject({ earned: onCurve.toString(), withheld: onCurve.toString(), forwarded: "0", pending: "0" });
    expect(e.launches[0]!.graduationFee).toEqual({ lamports: bigFee.toString(), withheld: onCurve.toString(), paidLamports: onCurve.toString(), settledAt: null });

    // Pool trades bring in more for the Creator, and the next collection takes the rest of the fee, then pays what is left.
    const buy = await trade(trader, prepared.mint, "buy", SOL(3));
    await deliverWebhook([buy.signature]);
    const poolShare = (await received(BigInt(buy.quote.fees.platform))) / 2n;
    expect(poolShare).toBeGreaterThan(bigFee - onCurve);
    const more = (await collectAndForward()).filter((f) => f.creator === creator.publicKey.toBase58());
    expect(more).toMatchObject([{ mint: WSOL, amount: (onCurve + poolShare - bigFee).toString(), outcome: "paid" }]);
    expect((await solOf(creator)) - held).toBe(onCurve + poolShare - bigFee);
    e = await earnings(creator.publicKey);
    expect(e.assets[0]).toMatchObject({ earned: (onCurve + poolShare).toString(), withheld: bigFee.toString(), forwarded: (onCurve + poolShare - bigFee).toString(), pending: "0" });
    expect(e.launches[0]!.graduationFee).toEqual({ lamports: bigFee.toString(), withheld: bigFee.toString(), paidLamports: bigFee.toString(), settledAt: expect.any(String) });
    // Two withholdings, two entries on the one graduation transaction.
    expect((await ledgerFees()).filter((e) => e.launch?.mint === prepared.mint).map((e) => [e.index, e.amount]).sort()).toEqual([[1000, onCurve.toString()], [1001, (bigFee - onCurve).toString()]]);
  });
});

describe("the platform's own money", () => {
  it("counts no part of the Creators' share in the Burn and Flywheel budgets", async () => {
    const revenue = Revenue.parse(await (await api("/v1/revenue")).json());
    const prices = new Map((await listQuotes()).flatMap((q) => (q.price ? [[q.mint, { sol: q.price.sol, decimals: q.decimals }] as const] : [])));
    // Each asset's revenue less what was collected for Creators, forwarded or not, valued in SOL at the registry's price;
    // an asset without one (a graduated coin a Fee Key paid out) counts for nothing.
    let net = 0n;
    let creators = 0n;
    for (const t of revenue.totals) {
      const theirs = BigInt(t.creatorForwarded) + BigInt(t.creatorPending);
      const ours = BigInt(t.total) - theirs;
      expect(ours).toBeGreaterThanOrEqual(0n);
      creators += theirs;
      if (t.asset.mint === WSOL) net += ours;
      const price = prices.get(t.asset.mint);
      if (t.asset.mint === WSOL || !price) continue;
      const [whole, fraction = ""] = price.sol.split(".");
      net += (ours * BigInt(whole! + fraction) * 1_000_000_000n) / (10n ** BigInt(price.decimals) * 10n ** BigInt(fraction.length));
    }
    expect(creators).toBeGreaterThan(0n);
    const { budgets } = (await (await api("/v1/burns")).json()) as { budgets: { revenueLamports: string } };
    expect(BigInt(budgets.revenueLamports)).toBe(net);
  });
});
