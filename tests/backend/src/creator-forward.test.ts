// The Creator Forward (ADR 0007): a Creator earns about 0.5% of every trade on the curve and after Graduation. The chain
// pays the Creator Fee; the platform matches it out of its Platform Fee on the curve, and after Graduation forwards half
// of the pool creator fee it collects, in the Quote Asset, with nothing to claim. Every forward is on the Ledger, a share
// under the minimum waits, and a failed or repeated run never pays the same share twice.
import { describe, expect, it } from "vitest";
import { PublicKey, Transaction, sendAndConfirmTransaction, type Keypair } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID, calculateEpochFee, createTransferCheckedInstruction, getAssociatedTokenAddressSync, getMint, getTransferFeeConfig,
} from "@solana/spl-token";
import { cpmmCoder, WSOL_MINT } from "@launchpad/chain";
import { CPSWAP_CONFIG, LOCAL_QUOTES, localnetKeys, migrateCurve, mintLocalQuote } from "@launchpad/localnet";
import { FEE_COLLECTOR_CRON } from "@launchpad/stack";
import { CreatorFees, CreatorForwardList, JobRun, LedgerPage, OperatorAlertList, Revenue } from "@launchpad/contract";
import {
  SOL, coinsOf, connection, deliverWebhook, env, feeAt, feeRates, fundedWallet, launch, launchedCoin, listQuotes, networkFee, platformInfo, quote,
  solOf,
  tokenBalance, trade,
} from "./client";

const WSOL = WSOL_MINT.toBase58();
const USDC = LOCAL_QUOTES.USDC;
const TAXQ = LOCAL_QUOTES.TAXQ;
const units = (n: number) => BigInt(Math.round(n * 1e6));
const ops = () => new PublicKey(env().platform.operationsWallet);
const api = (path: string, init?: RequestInit) => fetch(`${env().apiUrl}${path}`, init);
const operator = () => ({ authorization: `Bearer ${env().operatorToken}`, "content-type": "application/json" });

type Forward = { creator: string; mint: string; amount: string; signature: string; outcome: string; error?: string };
type Summary = { settled: unknown[]; sent: Forward[]; belowMinimum: number; problems: string[] };

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

async function fees(creator: PublicKey) {
  return CreatorFees.parse(await (await api(`/v1/creators/${creator.toBase58()}/fees`)).json());
}

async function forwards(creator: PublicKey) {
  return CreatorForwardList.parse(await (await api(`/v1/creators/${creator.toBase58()}/forwards`)).json()).forwards;
}

async function ledgerForwards() {
  return LedgerPage.parse(await (await api("/v1/ledger?kind=creator_forward&limit=100")).json()).entries;
}

const alerts = async () => OperatorAlertList.parse(await (await api("/v1/operator/alerts", { headers: operator() })).json()).alerts;
const openAlert = async () => (await alerts()).find((a) => a.kind === "job_failed" && a.subject === "creator-forward" && a.resolvedAt === null);

/** A buy on a coin's curve, indexed; returns the Creator Fee the chain paid, which the platform matches. */
async function curveBuy(mint: string, amount: bigint, trader?: Keypair) {
  const t = await trade(trader ?? (await fundedWallet()), mint, "buy", amount);
  await deliverWebhook([t.signature]);
  return BigInt(t.quote.fees.creator);
}

describe("on the curve", () => {
  it("tells every client what the platform forwards, from the fees the chain has", async () => {
    const [platform, rates] = [await platformInfo(), await feeRates()];
    // The match equals the on-chain Creator Fee, so a Creator earns twice it in all: about 0.5% with ADR 0007's split.
    // After Graduation it is half of the creator fee of the CPMM config the PlatformConfig names, read from the chain.
    const config = await connection().getAccountInfo(CPSWAP_CONFIG, "confirmed");
    const { creator_fee_rate } = cpmmCoder.accounts.decode("AmmConfig", config!.data) as { creator_fee_rate: { toNumber(): number } };
    expect(platform.creatorForward).toEqual({
      curveBps: Math.min(rates.creator, rates.platform), poolShareBps: 5000, poolBps: creator_fee_rate.toNumber() / 100 / 2, minLamports: env().creatorForwardMinLamports,
    });
    expect([rates.platform, rates.creator]).toEqual([75, 25]);
    expect(rates.creator + platform.creatorForward.curveBps).toBe(50);
  });

  it("matches the Creator Fee of every trade once the Platform Fee is collected, pays it as plain SOL and records it on the Ledger", async () => {
    const { creator, mint } = await launchedCoin();
    const earned = (await curveBuy(mint, SOL(0.3))) + (await curveBuy(mint, SOL(0.2)));
    expect(earned).toBe(feeAt(SOL(0.3), (await feeRates()).creator) + feeAt(SOL(0.2), (await feeRates()).creator));

    // Earned from the moment the trades are indexed, but not owed until the platform has collected the fee it comes from.
    const before = await fees(creator.publicKey);
    expect(before.assets).toMatchObject([{ quote: { mint: WSOL }, earned: earned.toString(), forward: { earned: earned.toString(), forwarded: "0", pending: earned.toString() } }]);
    expect(before.launches).toMatchObject([{ mint, earned: earned.toString(), forward: { curve: earned.toString(), pool: "0" } }]);
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
    const after = await fees(creator.publicKey);
    expect(after.assets[0]!.forward).toEqual({ earned: earned.toString(), forwarded: earned.toString(), pending: "0" });
    // The on-chain Creator Fee is untouched by any of it: still in the Creator's vault, still theirs to claim.
    expect(after.assets[0]).toMatchObject({ claimable: earned.toString(), claimed: "0" });
  });

  it("lets a share under the minimum wait, and pays it whole once it has grown past it", async () => {
    const { creator, mint } = await launchedCoin();
    const small = await curveBuy(mint, SOL(0.02));
    expect(small).toBeLessThan(BigInt(env().creatorForwardMinLamports));
    const held = await solOf(creator);

    expect((await collectAndForward()).filter((f) => f.creator === creator.publicKey.toBase58())).toEqual([]);
    expect((await fees(creator.publicKey)).assets[0]!.forward).toEqual({ earned: small.toString(), forwarded: "0", pending: small.toString() });
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
    const { prepared, signature } = await launch(creator, { quoteMint: USDC.toBase58(), symbol: "STUCK" });
    await deliverWebhook([signature]);
    const trader = await fundedWallet();
    await mintLocalQuote(connection(), USDC, trader.publicKey, units(100));
    const earned = await curveBuy(prepared.mint, units(60), trader);
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
    expect((await fees(creator.publicKey)).assets.find((a) => a.quote.mint === USDC.toBase58())!.forward).toEqual({ earned: earned.toString(), forwarded: "0", pending: earned.toString() });

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
    const migration = await migrateCurve(connection(), new PublicKey(prepared.pool));
    await deliverWebhook([bought.signature, migration.signature]);
    for (let i = 0; i < 40 && !(await quote(prepared.mint, { side: "buy", amount: "1000000" })).ok; i++) await new Promise((r) => setTimeout(r, 250));
    return { creator, mint: prepared.mint, pool: migration.pool, trader, onCurve: BigInt(bought.quote.fees.creator) };
  }

  it("keeps paying the Creator: half of the pool fee the platform collects, with the Creator Fee page showing where it came from", async () => {
    const coin = await graduatedCoin(WSOL_MINT, SOL(2));
    const held = await solOf(coin.creator);
    const buy = await trade(coin.trader, coin.mint, "buy", SOL(0.5));
    const sell = await trade(coin.trader, coin.mint, "sell", (await coinsOf(coin.mint, coin.trader)) / 4n);
    await deliverWebhook([buy.signature, sell.signature]);
    // After Graduation the chain pays the Creator nothing: the pool's creator fee is the platform's to collect.
    expect([buy.quote.venue, buy.quote.fees.creator, sell.quote.fees.creator]).toEqual(["pool", "0", "0"]);
    const poolFee = BigInt(buy.quote.fees.platform) + BigInt(sell.quote.fees.platform);

    const sent = (await collectAndForward()).filter((f) => f.creator === coin.creator.publicKey.toBase58());
    const share = coin.onCurve + poolFee / 2n;
    expect(sent).toMatchObject([{ mint: WSOL, amount: share.toString(), outcome: "paid" }]);
    expect((await solOf(coin.creator)) - held).toBe(share);

    const f = await fees(coin.creator.publicKey);
    expect(f.launches).toMatchObject([{ mint: coin.mint, status: "graduated", earned: coin.onCurve.toString(), forward: { curve: coin.onCurve.toString(), pool: (poolFee / 2n).toString() } }]);
    expect(f.assets[0]!.forward).toEqual({ earned: share.toString(), forwarded: share.toString(), pending: "0" });
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
    const share = coin.onCurve + BigInt(poolFee.amount) / 2n;

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
