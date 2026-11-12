// Volume rebates (#196, ADR 0021): the Budget Table's `rebates` row paid back to traders. A Rebate Week's trades are
// settled together once the week has ended: what the row has left is split among the traders in proportion to the
// Platform Fees their trades paid, never more than the row's own share of those fees, the platform's own wallets left
// out. A wallet's rebates wait until they reach the minimum payout and are then paid in one SOL transfer, every
// payment on the Ledger and counted as the row's spending. A trade made while the row has no share earns nothing.
// A Rebate Week lasts thirty seconds on this stack (`harness.ts`), so a week ends while the test watches.
import { afterAll, describe, expect, it } from "vitest";
import type { Keypair, PublicKey } from "@solana/web3.js";
import { WSOL_MINT } from "@launchpad/chain";
import { localnetKeys } from "@launchpad/localnet";
import { BudgetsPage, JobRun, LedgerPage, RebatesPage, WalletRebates, type BudgetShares } from "@launchpad/contract";
import { SOL, connection, deliverWebhook, env, fundedWallet, launch, rawTransaction, solOf, trade } from "./client";

const WSOL = WSOL_MINT.toBase58();
const TIMEOUT = 240_000;
const api = (path: string, init?: RequestInit) => fetch(`${env().apiUrl}${path}`, init);
const operator = () => ({ authorization: `Bearer ${env().operatorToken}`, "content-type": "application/json" });
const program = async () => RebatesPage.parse(await (await api("/v1/rebates")).json());
const walletPage = async (wallet: PublicKey | string) => WalletRebates.parse(await (await api(`/v1/wallets/${wallet.toString()}/rebates`)).json());
const row = async () => BudgetsPage.parse(await (await api("/v1/budgets")).json()).rows.find((r) => r.row === "rebates")!;
const announce = (shares: BudgetShares, effectiveAt: Date, note?: string) =>
  api("/v1/operator/budget-table", { method: "POST", headers: operator(), body: JSON.stringify({ shares, effectiveAt: effectiveAt.toISOString(), note }) });

/** The first Budget Table, which every other file runs under, and the one this file trades under: a fifth to rebates. */
const FIRST: BudgetShares = { burn: 6000, flywheel: 500, rebates: 0, referrals: 0, integrators: 0, treasury: 3500 };
// (The owner's plan takes the share from the Burn; here it comes from the treasury, so the other files' Burn and
// Flywheel figures stand whenever they run.)
const SHARE_BPS = 2000;
const WITH_REBATES: BudgetShares = { ...FIRST, rebates: SHARE_BPS, treasury: 1500 };

const lead = () => env().feeChangeLeadSeconds * 1000;
const weekMs = () => env().rebateWeekSeconds * 1000;
/** 1970-01-05, the epoch's first Monday, which every Rebate Week is counted from. */
const ANCHOR = 4 * 86_400_000;
const weekOf = (ms: number) => Math.floor((ms - ANCHOR) / weekMs());
const startOf = (week: number) => new Date(ANCHOR + week * weekMs());
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The chain's clock, which dates every trade and Ledger entry; it need not agree with the wall clock. */
async function chainTime() {
  const time = await connection().getBlockTime(await connection().getSlot("confirmed"));
  return (time ?? Math.floor(Date.now() / 1000)) * 1000;
}

async function announceable() {
  return new Date(Math.max(Date.now(), await chainTime()) + lead() + 2_000);
}

async function inForce(effectiveAt: Date) {
  while (!(Date.now() > effectiveAt.getTime() + 1_000 && (await chainTime()) > effectiveAt.getTime() + 1_000)) await sleep(500);
}

/** Waits for a week that has only just begun by the chain's clock, so a few trades fit inside it, and returns it. */
async function freshWeek() {
  for (;;) {
    const now = await chainTime();
    if (now - startOf(weekOf(now)).getTime() < weekMs() / 4) return weekOf(now);
    await sleep(500);
  }
}

/** Waits until a week is over for the wall clock and for the chain's. */
async function over(week: number) {
  const end = startOf(week + 1).getTime();
  while (!(Date.now() > end + 1_000 && (await chainTime()) > end + 1_000)) await sleep(500);
}

/** A buy on a coin's curve, indexed: the week its block fell in and the Platform Fee it paid, in lamports. */
async function buy(trader: Keypair, mint: string, lamports: bigint) {
  const bought = await trade(trader, mint, "buy", lamports);
  expect(bought.quote.venue).toBe("curve");
  await deliverWebhook([bought.signature]);
  return { week: weekOf((await rawTransaction(bought.signature)).blockTime! * 1000), fee: BigInt(bought.quote.fees.platform) };
}

/** A SOL-paired coin on its curve, indexed, with nothing bought yet. */
async function coin(symbol: string) {
  const { prepared, signature } = await launch(await fundedWallet(), { symbol });
  await deliverWebhook([signature]);
  return prepared.mint;
}

async function collect() {
  const res = await api("/v1/operator/jobs/fee-collector", { method: "POST", headers: operator() });
  expect(res.status, await res.clone().text()).toBe(200);
}

type Summary = {
  settled: { signature: string; outcome: string }[];
  weeks: { start: string; pot: string; traders: number }[];
  paid: { signature: string; wallets: number; lamports: string }[];
  belowMinimum: number;
  inFlight: number;
  problems: string[];
};

/** Runs the rebates job now, as the operator would. */
async function settle() {
  const res = await api("/v1/operator/jobs/rebates", { method: "POST", headers: operator() });
  const run = JobRun.parse(await res.json());
  expect(res.status, JSON.stringify(run)).toBe(200);
  return run.summary as Summary;
}

/** The Ledger's `rebate` entries, newest first. */
async function payments() {
  return LedgerPage.parse(await (await api("/v1/ledger?kind=rebate&limit=100")).json()).entries;
}

const settledWeek = async (week: number) => (await program()).weeks.find((w) => w.start === startOf(week).toISOString());

/** Whatever this file announced, the first table is in force again when it ends, for every later file. */
let restored = true;
afterAll(async () => {
  if (restored) return;
  const back = await announceable();
  expect((await announce(FIRST, back, "volume rebates end")).status).toBe(201);
  await inForce(back);
});

describe("volume rebates", () => {
  let big: Keypair;
  let small: Keypair;
  let early: Keypair;
  const ops = localnetKeys().operations;
  const min = () => BigInt(env().rebateMinLamports);
  let smallFirst = 0n;

  it("are published, and a trade earns nothing while the row has no share", { timeout: TIMEOUT }, async () => {
    const before = await program();
    expect(before.program).toMatchObject({ shareBps: 0, upcoming: null, weekSeconds: env().rebateWeekSeconds, minPayoutLamports: env().rebateMinLamports, current: null });

    [big, small, early] = [await fundedWallet(10), await fundedWallet(10), await fundedWallet(10)];
    await buy(early, await coin("ERLY"), SOL(0.5));
    await collect();
    await settle();
    expect(await walletPage(early.publicKey)).toMatchObject({ wallet: early.publicKey.toBase58(), waitingLamports: "0", paidLamports: "0", current: null, rebates: [] });

    expect((await api("/v1/wallets/not-an-address/rebates")).status).toBe(400);
    expect((await api("/v1/operator/jobs/rebates", { method: "POST" })).status).toBe(401);
  });

  it("split a week's budget by the fees each trader paid, under the cap, and pay what reaches the minimum", { timeout: TIMEOUT }, async () => {
    // A curve holds 1 SOL on this stack, so the larger trader buys on two coins and every coin stays on its curve.
    const [coinA, coinA2, coinB] = [await coin("RBTA"), await coin("RBTA"), await coin("RBTB")];
    const from = await announceable();
    restored = false;
    expect((await announce(WITH_REBATES, from, "volume rebates go live")).status).toBe(201);
    expect((await program()).program).toMatchObject({ shareBps: 0, upcoming: { shareBps: SHARE_BPS, effectiveAt: from.toISOString() } });
    await inForce(from);

    const week = await freshWeek();
    const [first, second] = [await buy(big, coinA, SOL(0.8)), await buy(big, coinA2, SOL(0.8))];
    const bought = { big: { fee: first.fee + second.fee }, small: await buy(small, coinB, SOL(0.25)), ops: await buy(ops, coinB, SOL(0.2)) };
    expect([first.week, second.week, bought.small.week, bought.ops.week]).toEqual([week, week, week, week]);
    const fees = bought.big.fee + bought.small.fee;

    // The week as it stands, before it is over: the fees so far, the platform's own trade left out.
    const during = await program();
    expect(during.program).toMatchObject({ shareBps: SHARE_BPS, upcoming: null });
    expect(during.program.current).toMatchObject({ start: startOf(week).toISOString(), end: startOf(week + 1).toISOString(), capBps: SHARE_BPS, feesLamports: fees.toString() });
    expect((await walletPage(big.publicKey)).current).toMatchObject({ feesLamports: bought.big.fee.toString() });
    expect((await walletPage(ops.publicKey)).current).toMatchObject({ feesLamports: "0", estimateLamports: "0" });

    // The fees are collected, which is what gives the row its budget. The week is not over: nothing of it is settled.
    await collect();
    await settle();
    expect(await settledWeek(week)).toBeUndefined();

    await over(week);
    const budget = BigInt((await row()).availableLamports!) - BigInt((await program()).program.waitingLamports);
    expect(budget).toBeGreaterThan(0n);
    const [bigBefore, spentBefore, paidBefore] = [await solOf(big), BigInt((await row()).spentLamports!), (await payments()).length];
    const run = await settle();
    expect(run.problems).toEqual([]);

    // The week: the budget, or the row's share of the fees where that is less, split by the fees each wallet paid.
    const cap = (fees * BigInt(SHARE_BPS)) / 10_000n;
    const pot = budget < cap ? budget : cap;
    const share = (fee: bigint) => (pot * fee) / fees;
    smallFirst = share(bought.small.fee);
    expect(await settledWeek(week)).toMatchObject({
      end: startOf(week + 1).toISOString(), capBps: SHARE_BPS, budgetLamports: budget.toString(), feesLamports: fees.toString(), potLamports: pot.toString(), traders: 2,
      creditedLamports: (share(bought.big.fee) + smallFirst).toString(), paidLamports: share(bought.big.fee).toString(),
    });
    expect(share(bought.big.fee)).toBeGreaterThanOrEqual(min());
    expect(smallFirst).toBeGreaterThan(0n);
    expect(smallFirst).toBeLessThan(min());

    // The larger rebate reached the minimum and was paid in SOL, on the Ledger, out of the row's budget.
    expect(run.paid).toHaveLength(1);
    expect(run.paid[0]).toMatchObject({ wallets: 1, lamports: share(bought.big.fee).toString() });
    expect((await solOf(big)) - bigBefore).toBe(share(bought.big.fee));
    const ledger = await payments();
    expect(ledger).toHaveLength(paidBefore + 1);
    expect(ledger[0]).toMatchObject({
      signature: run.paid[0]!.signature, index: 0, kind: "rebate", amount: share(bought.big.fee).toString(), source: ops.publicKey.toBase58(),
      destination: big.publicKey.toBase58(), launch: null,
    });
    expect(ledger[0]!.asset.mint).toBe(WSOL);
    expect(BigInt((await row()).spentLamports!) - spentBefore).toBe(share(bought.big.fee));
    const paid = await walletPage(big.publicKey);
    expect(paid).toMatchObject({ waitingLamports: "0", paidLamports: share(bought.big.fee).toString() });
    expect(paid.rebates).toHaveLength(1);
    expect(paid.rebates[0]).toMatchObject({
      weekStart: startOf(week).toISOString(), weekEnd: startOf(week + 1).toISOString(), feesLamports: bought.big.fee.toString(),
      amountLamports: share(bought.big.fee).toString(), status: "paid", signature: run.paid[0]!.signature,
    });
    expect(paid.rebates[0]!.paidAt).not.toBeNull();

    // The smaller one waits, still the row's to pay; the platform's own wallet and the trade before the share earned nothing.
    const waiting = await walletPage(small.publicKey);
    expect(waiting).toMatchObject({ waitingLamports: smallFirst.toString(), paidLamports: "0" });
    expect(waiting.rebates).toMatchObject([{ amountLamports: smallFirst.toString(), status: "waiting", signature: null, paidAt: null }]);
    expect(run.belowMinimum).toBeGreaterThanOrEqual(1);
    expect(BigInt((await program()).program.waitingLamports)).toBeGreaterThanOrEqual(smallFirst);
    expect((await walletPage(ops.publicKey)).rebates).toEqual([]);
    expect((await walletPage(early.publicKey)).rebates).toEqual([]);

    // A second run finds the week settled and the payment made: nothing is given or paid twice.
    const again = await settle();
    expect(again).toMatchObject({ paid: [], problems: [] });
    expect(again.weeks.find((w) => w.start === startOf(week).toISOString())).toBeUndefined();
    expect((await solOf(big)) - bigBefore).toBe(share(bought.big.fee));
    expect(await payments()).toHaveLength(paidBefore + 1);
  });

  it("keep a rebate under the minimum waiting, and pay it with a later week's in one transfer", { timeout: TIMEOUT }, async () => {
    const [coinC, coinD] = [await coin("RBTC"), await coin("RBTD")];
    const week = await freshWeek();
    const [one, two] = [await buy(small, coinC, SOL(0.8)), await buy(small, coinD, SOL(0.8))];
    expect([one.week, two.week]).toEqual([week, week]);
    const bought = { fee: one.fee + two.fee };
    await collect();
    await over(week);
    // What the row has left is not all the week's to give: the rebate still waiting from the first week is spoken for.
    const budget = BigInt((await row()).availableLamports!) - BigInt((await program()).program.waitingLamports);
    const [before, paidBefore] = [await solOf(small), (await payments()).length];
    const run = await settle();
    expect(run.problems).toEqual([]);

    const cap = (bought.fee * BigInt(SHARE_BPS)) / 10_000n;
    const second = budget < cap ? budget : cap;
    expect(await settledWeek(week)).toMatchObject({ budgetLamports: budget.toString(), feesLamports: bought.fee.toString(), potLamports: second.toString(), traders: 1, creditedLamports: second.toString() });
    expect(smallFirst + second).toBeGreaterThanOrEqual(min());

    // Both weeks' rebates left in one transfer, under one signature, as one Ledger entry.
    expect(run.paid).toHaveLength(1);
    expect(run.paid[0]).toMatchObject({ wallets: 1, lamports: (smallFirst + second).toString() });
    expect((await solOf(small)) - before).toBe(smallFirst + second);
    const ledger = await payments();
    expect(ledger).toHaveLength(paidBefore + 1);
    expect(ledger[0]).toMatchObject({ signature: run.paid[0]!.signature, kind: "rebate", amount: (smallFirst + second).toString(), destination: small.publicKey.toBase58() });
    const page = await walletPage(small.publicKey);
    expect(page).toMatchObject({ waitingLamports: "0", paidLamports: (smallFirst + second).toString() });
    expect(page.rebates.map((r) => [r.amountLamports, r.status, r.signature])).toEqual([
      [second.toString(), "paid", run.paid[0]!.signature],
      [smallFirst.toString(), "paid", run.paid[0]!.signature],
    ]);

    // The share ends. A trade after it earns nothing, and what the row was given and has not paid stays its own.
    const back = await announceable();
    expect((await announce(FIRST, back, "volume rebates end")).status).toBe(201);
    await inForce(back);
    restored = true;
    const late = await buy(big, coinC, SOL(0.05));
    await collect();
    await over(late.week);
    await settle();
    const after = await walletPage(big.publicKey);
    expect(after.rebates).toHaveLength(1);
    expect((await program()).program).toMatchObject({ shareBps: 0 });
  });
});
