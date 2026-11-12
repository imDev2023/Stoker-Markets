// The Holding Weight (#199, ADR 0022): in a Reward Round a coin kept longer counts for more, coin by coin. Once in every
// Holding Day the Reward Engine reads a coin's accounts and brings its Holding Lots in step with what each wallet holds
// (the Holding Check); a round's snapshot weighs each wallet's balance by its lots under the steps of the rules version
// in force, and pays `pot * weightedHolding / weightedTotal`. A sell takes the newest coins first, coins that arrive
// from another wallet are new there, and the treasury always counts once.
//
// A Holding Day lasts ten seconds on this stack (`harness.ts`) and a rules change needs a minute's notice, so this file
// announces a version with steps once, waits it in, and ends on a plain version again: every other file works its
// payouts out pro rata by hand, and none may ever run under a version with steps.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction, createTransferCheckedInstruction, getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  CoinEarnings, HOLDING_WEIGHT_MAX_BPS, HOLDING_WEIGHT_STEPS_MAX, JobRun, RewardRoundDetail, RewardRuleVersion, RewardRulesPage, WalletHolding, type HoldingWeightStep,
  type TradeSide,
} from "@launchpad/contract";
import { SOL, connection, deliverWebhook, env, fundedWallet, launch, launchedCoin, solOf, tokenBalance, trade } from "./client";

const api = (path: string, init?: RequestInit) => fetch(`${env().apiUrl}${path}`, init);
const operator = () => ({ authorization: `Bearer ${env().operatorToken}`, "content-type": "application/json" });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sum = (xs: bigint[]) => xs.reduce((a, b) => a + b, 0n);
const dayMs = () => env().holdingDaySeconds * 1000;
const leadMs = () => 60_000;
const ONCE = 10_000n;

/**
 * The steps this file announces: one and a half times after one Holding Day, twice after five. Every lot opened before
 * the announcement is past the last step once the version is in force, a minute later, and a lot opened during a test
 * stays under it for fifty seconds, so the two are told apart without a race.
 */
const QUICK: HoldingWeightStep[] = [{ afterDays: 1, weightBps: 15_000 }, { afterDays: 5, weightBps: 20_000 }];

type Checks = { day: number; checked: { mint: string; wallets: number; opened: number; reduced: number; removed: number }[]; leftForLater: number };
type EngineSummary = { holdingChecks: Checks; opened: { mint: string; round: string; holders: number; amount: string }[]; finished: string[] };
type ForwardSummary = { rules: { dividends: { mint: string; round: string; holders: number; amount: string }[]; skipped: { mint: string; reason: string }[] } };

/** Runs one job now, as the operator would; it must succeed. Every job here works on the whole stack, not on one coin. */
async function runJob(job: "fee-collector" | "creator-forward" | "reward-rounds") {
  const res = await api(`/v1/operator/jobs/${job}`, { method: "POST", headers: operator() });
  const run = JobRun.parse(await res.json());
  expect(res.status, JSON.stringify(run)).toBe(200);
  expect(run.status, JSON.stringify(run)).toBe("succeeded");
  return run;
}

/** Every Reward Engine run of this file, with the Holding Day it fell in and the coins it checked. */
const runs: Checks[] = [];
/** The Reward Engine: the Holding Checks due, then the rounds. */
async function engine() {
  const summary = (await runJob("reward-rounds")).summary as EngineSummary;
  runs.push(summary.holdingChecks);
  return summary;
}
const collect = () => runJob("fee-collector");
const forward = async () => (await runJob("creator-forward")).summary as ForwardSummary;

/** Waits until the wall clock is inside Holding Day `day`, or past it. */
async function untilDay(day: number) {
  const wait = day * dayMs() + 50 - Date.now();
  if (wait > 0) await sleep(wait);
}

/**
 * Runs the engine until it checks `mint` in a Holding Day after `after`, and returns that day. A run checks a bounded
 * number of coins, and on this stack every coin other files left behind is due again every ten seconds, so the coin may
 * wait a run; a run that left nothing for later and did not check the coin found it checked for its day already.
 */
async function nextCheck(mint: string, after: number) {
  for (let tries = 0; tries < 40; tries++) {
    await untilDay(after + 1);
    const { holdingChecks } = await engine();
    const mine = holdingChecks.checked.find((c) => c.mint === mint);
    if (mine && holdingChecks.day > after) return { day: holdingChecks.day, ...mine };
    if (mine || holdingChecks.leftForLater === 0) after = Math.max(after, holdingChecks.day);
  }
  throw new Error(`no Holding Check of ${mint} after day ${after}`);
}

const rulesPage = async () => RewardRulesPage.parse(await (await api("/v1/rewards/rules")).json());
const roundDetail = async (id: string) => RewardRoundDetail.parse(await (await api(`/v1/rewards/rounds/${id}`)).json());
const holding = async (mint: string, wallet: PublicKey) => WalletHolding.parse(await (await api(`/v1/launches/${mint}/holdings/${wallet.toBase58()}`)).json());
const announce = (body: Record<string, unknown>) => api("/v1/operator/rewards/rules", { method: "POST", headers: operator(), body: JSON.stringify(body) });

/** Announces a rules version as early as the lead time allows and returns it. */
async function announced(rules: { minHolding: string; roundThreshold: string }, holdingWeights: HoldingWeightStep[], note: string, notBefore = 0) {
  const effectiveAt = new Date(Math.max(Date.now() + leadMs() + 2_000, notBefore));
  const res = await announce({ ...rules, holdingWeights, effectiveAt: effectiveAt.toISOString(), note });
  expect(res.status, await res.clone().text()).toBe(201);
  return RewardRuleVersion.parse(await res.json());
}

/** Waits until a version is the one in force. */
async function inForce(version: RewardRuleVersion) {
  const wait = new Date(version.effectiveAt).getTime() + 1_000 - Date.now();
  if (wait > 0) await sleep(wait);
  expect((await rulesPage()).inForce).toEqual(version);
}

/** A trade, indexed. */
async function traded(trader: Keypair, mint: string, side: TradeSide, amount: bigint) {
  const t = await trade(trader, mint, side, amount);
  await deliverWebhook([t.signature]);
  return t;
}

/** Hands coins to another wallet, the sender paying for its coin account. */
async function giveCoins(from: Keypair, mint: string, to: PublicKey, amount: bigint, program = TOKEN_PROGRAM_ID) {
  const m = new PublicKey(mint);
  const destination = getAssociatedTokenAddressSync(m, to, false, program);
  const tx = new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(from.publicKey, destination, to, m, program),
    createTransferCheckedInstruction(getAssociatedTokenAddressSync(m, from.publicKey, false, program), m, destination, from.publicKey, amount, 6, [], program),
  );
  await sendAndConfirmTransaction(connection(), tx, [from], { commitment: "confirmed" });
}

/** What a lot's coins count for at `at` under this file's steps, worked out here from the lot's `since` alone. */
function weightAt(since: string, at: Date, steps = QUICK) {
  const age = at.getTime() - new Date(since).getTime();
  let weight = ONCE;
  for (const s of steps) if (age >= s.afterDays * dayMs()) weight = BigInt(s.weightBps);
  return weight;
}

/**
 * A wallet's Weighted Holding as ADR 0022 defines it, worked out here: the lots oldest first up to the balance, each at
 * its weight, and whatever the wallet holds beyond them once.
 */
function weigh(balance: bigint, lots: { amount: string; since: string }[], at: Date, steps = QUICK) {
  let left = balance;
  let weighted = 0n;
  for (const lot of lots) {
    const taken = BigInt(lot.amount) < left ? BigInt(lot.amount) : left;
    weighted += taken * weightAt(lot.since, at, steps);
    left -= taken;
  }
  return weighted + left * ONCE;
}

/** Every payout of a round is its wallet's share of the pot by Weighted Holding, rounded down, from the round's own page. */
function expectPayoutsFollowTheRoundsPage(detail: RewardRoundDetail) {
  const pot = BigInt(detail.pot);
  const total = BigInt(detail.weightedTotal!);
  expect(sum(detail.payouts.map((p) => BigInt(p.weightedHolding)))).toBe(total);
  for (const p of detail.payouts) expect(BigInt(p.amount), p.wallet).toBe((pot * BigInt(p.weightedHolding)) / total);
  expect(sum(detail.payouts.map((p) => BigInt(p.amount)))).toBe(BigInt(detail.distributable));
}
const payoutOf = (detail: RewardRoundDetail, wallet: PublicKey) => detail.payouts.find((p) => p.wallet === wallet.toBase58())!;

/** The plain rules every other file runs under: the version in force when this file starts. */
let plain: RewardRuleVersion;
/** The version with steps, announced before the tests and in force a minute later. */
let quick: RewardRuleVersion;
/** DIAM: a standard coin whose Creator Earnings go to its holders. No round ever moves its coins, so its lots are this file's alone to move. */
let dividendCoin: string;
/** HODL: a Reward Launch that pays its tax out in the coin itself. */
let taxCoin: string;
/** A coin that can have no round: it is never checked. */
let plainCoin: string;
let keeper: Keypair, mover: Keypair, friend: Keypair, oldHolder: Keypair;
const treasury = () => new PublicKey(env().treasury);
const classic = (mint: string, wallet: PublicKey) => tokenBalance(getAssociatedTokenAddressSync(new PublicKey(mint), wallet));
const taxed = (mint: string, wallet: PublicKey) => tokenBalance(getAssociatedTokenAddressSync(new PublicKey(mint), wallet, false, TOKEN_2022_PROGRAM_ID));
/** The Holding Day of a coin's latest check, as this file's engine runs saw it; -1 before its first. */
const lastCheckDay = (mint: string) => runs.findLast((r) => r.checked.some((c) => c.mint === mint))?.day ?? -1;
/** Runs the engine until the coin's next Holding Check, in a later Holding Day than its last. */
const checkedAgain = (mint: string) => nextCheck(mint, lastCheckDay(mint));
/** The dividend coin's first check's time, where its first lots' age runs from. */
let firstCheck: string;
const lotsOf = (h: WalletHolding) => h.lots.map((l) => [l.amount, l.since]);

beforeAll(async () => {
  plain = (await rulesPage()).inForce!;
  expect(plain.holdingWeights).toEqual([]);
  [keeper, mover, friend, oldHolder] = await Promise.all([fundedWallet(3), fundedWallet(3), fundedWallet(1), fundedWallet(3)]);
  plainCoin = (await launchedCoin()).mint;
  const dividend = await launch(await fundedWallet(), { symbol: "DIAM", earningsDestination: "holders" });
  const tax = await launch(await fundedWallet(), { symbol: "HODL", rewardTax: "500", rewardPayout: "coin" });
  await deliverWebhook([dividend.signature, tax.signature]);
  [dividendCoin, taxCoin] = [dividend.prepared.mint, tax.prepared.mint];
  await traded(keeper, dividendCoin, "buy", SOL(0.05));
  await traded(mover, dividendCoin, "buy", SOL(0.05));
  await traded(oldHolder, taxCoin, "buy", SOL(0.1));
  // The treasury holds the Reward Launch's coin from the start, like any long holder.
  await giveCoins(oldHolder, taxCoin, treasury(), (await taxed(taxCoin, oldHolder.publicKey)) / 5n, TOKEN_2022_PROGRAM_ID);

  // The first Holding Check of each coin: every coin held now starts its age here, before any weight is announced.
  await nextCheck(dividendCoin, -1);
  const first = await holding(dividendCoin, keeper.publicKey);
  firstCheck = first.check!.checkedAt;
  expect(lotsOf(first)).toEqual([[(await classic(dividendCoin, keeper.publicKey)).toString(), firstCheck]]);
  if (lastCheckDay(taxCoin) < 0) await nextCheck(taxCoin, -1);

  quick = await announced(plain, QUICK, "holding-weight.test.ts: quick steps");
  expect(quick).toMatchObject({ holdingWeights: QUICK, minHolding: plain.minHolding, roundThreshold: plain.roundThreshold });
  // Announced, not in force: every holder sees the steps coming, with the length of the day they are counted in.
  const page = await rulesPage();
  expect(page.inForce).toEqual(plain);
  expect(page.upcoming).toContainEqual(quick);
  expect(page.holdingDaySeconds).toBe(env().holdingDaySeconds);
}, 240_000);

afterAll(async () => {
  // Whatever happened above, a version without steps is in force when this file ends, and none with steps is waiting:
  // every other file's rounds are pro rata.
  if (!plain) return;
  const page = await rulesPage();
  const weighted = [...(page.inForce ? [page.inForce] : []), ...page.upcoming].filter((r) => r.holdingWeights.length > 0);
  const latestPlain = [...(page.inForce ? [page.inForce] : []), ...page.upcoming].filter((r) => r.holdingWeights.length === 0 && r.minHolding === plain.minHolding && r.roundThreshold === plain.roundThreshold);
  const lastWeighted = Math.max(0, ...weighted.map((r) => new Date(r.effectiveAt).getTime()));
  let last = latestPlain.filter((r) => new Date(r.effectiveAt).getTime() > lastWeighted).at(0);
  if (weighted.length && !last) last = await announced(plain, [], "holding-weight.test.ts: the plain rules again", lastWeighted + 1_000);
  if (last && new Date(last.effectiveAt).getTime() > Date.now()) await inForce(last);
  expect((await rulesPage()).inForce!.holdingWeights).toEqual([]);

  // The dividend coin's pot is left under the minimum, so no later file's Creator Forward opens a round on it and moves
  // the operations wallet's SOL (`fee-collector.test.ts` asserts it to the lamport).
  for (let i = 0; i < 4; i++) {
    await collect();
    await forward();
    await engine();
    const earnings = CoinEarnings.parse(await (await api(`/v1/launches/${dividendCoin}/earnings`)).json());
    if (BigInt(earnings.waiting ?? "0") < BigInt(env().creatorForwardMinLamports) && earnings.rounds.every((r) => r.status === "paid")) break;
  }
  // Every engine run above also sold a slice of tax for each Quote Asset payout coin other files left, each sale
  // leaving a little Platform Fee in the SOL vault; `fee-collector.test.ts` starts from an empty one, so one buy whose
  // fee is worth claiming, and a collection, which takes whatever is there (as `earnings-holders.test.ts` does).
  await traded(await fundedWallet(), plainCoin, "buy", SOL(0.02));
  await collect();
}, 240_000);

describe("the Holding Check", () => {
  it("records what each wallet holds as a Holding Lot, once in a Holding Day, and publishes a wallet's lots", { timeout: 240_000 }, async () => {
    const held = await classic(dividendCoin, mover.publicKey);
    const first = await holding(dividendCoin, mover.publicKey);
    expect(first).toEqual({
      mint: dividendCoin, wallet: mover.publicKey.toBase58(), check: { checkedAt: expect.any(String), slot: expect.any(Number) }, held: held.toString(),
      lots: [{ amount: held.toString(), since: firstCheck, weightBps: 10_000 }], weightedHolding: (held * ONCE).toString(), weightBps: 10_000, flat: false,
      rulesVersion: plain.version,
    });

    // The engine runs again and again inside one Holding Day: only the day's first run checks the coin.
    const twice = () => [...new Set(runs.map((r) => r.day))].find((day) => runs.filter((r) => r.day === day).length >= 2 && runs.some((r) => r.day === day && r.checked.some((c) => c.mint === dividendCoin)));
    for (let i = 0; i < 20 && twice() === undefined; i++) await engine();
    expect(twice()).toBeDefined();
    for (const mint of [dividendCoin, taxCoin]) {
      const days = runs.filter((r) => r.checked.some((c) => c.mint === mint)).map((r) => r.day);
      expect(days.length).toBeGreaterThan(0);
      expect(new Set(days).size, `${mint} was checked twice in one Holding Day`).toBe(days.length);
    }
    // Nothing moved, so the later checks wrote no lot: the coins' age still runs from the first.
    expect(lotsOf(await holding(dividendCoin, mover.publicKey))).toEqual([[held.toString(), firstCheck]]);

    // A wallet that holds nothing has no lots; a coin that can have no round is never checked; an unknown coin is not found.
    const stranger = Keypair.generate().publicKey;
    expect(await holding(dividendCoin, stranger)).toMatchObject({ held: "0", lots: [], weightedHolding: "0", weightBps: 10_000, flat: false });
    expect(await holding(plainCoin, mover.publicKey)).toMatchObject({ check: null, held: "0", lots: [] });
    expect((await api(`/v1/launches/${stranger.toBase58()}/holdings/${mover.publicKey.toBase58()}`)).status).toBe(404);
    expect((await api(`/v1/launches/${dividendCoin}/holdings/not-a-wallet`)).status).toBe(400);
  });

  it("opens a new lot for coins bought on a later day, takes a sell off the newest lot, and starts coins sent to another wallet again there", { timeout: 240_000 }, async () => {
    const [old] = (await holding(dividendCoin, mover.publicKey)).lots;
    // A buy on a later day: the coins it brought are a lot of their own, since the check that first saw them.
    await traded(mover, dividendCoin, "buy", SOL(0.02));
    const bought = (await classic(dividendCoin, mover.publicKey)) - BigInt(old!.amount);
    await checkedAgain(dividendCoin);
    const second = await holding(dividendCoin, mover.publicKey);
    expect(lotsOf(second)).toEqual([[old!.amount, old!.since], [bought.toString(), second.check!.checkedAt]]);
    expect(new Date(second.lots[1]!.since).getTime()).toBeGreaterThan(new Date(old!.since).getTime());
    expect(second.held).toBe((BigInt(old!.amount) + bought).toString());

    // A partial sell: the newest lot is reduced, the older one untouched.
    const sold = bought / 3n;
    await traded(mover, dividendCoin, "sell", sold);
    await checkedAgain(dividendCoin);
    const afterSell = await holding(dividendCoin, mover.publicKey);
    expect(lotsOf(afterSell)).toEqual([[old!.amount, old!.since], [(bought - sold).toString(), second.lots[1]!.since]]);

    // Coins sent to another wallet: more than the newest lot holds, so it goes whole and the older lot gives the rest.
    // In the receiving wallet they are new coins, since the check that first saw them there.
    const given = bought - sold + BigInt(old!.amount) / 4n;
    await giveCoins(mover, dividendCoin, friend.publicKey, given);
    await checkedAgain(dividendCoin);
    const afterGift = await holding(dividendCoin, mover.publicKey);
    expect(lotsOf(afterGift)).toEqual([[(BigInt(old!.amount) - BigInt(old!.amount) / 4n).toString(), old!.since]]);
    const received = await holding(dividendCoin, friend.publicKey);
    expect(lotsOf(received)).toEqual([[given.toString(), received.check!.checkedAt]]);
    expect(received.check).toEqual(afterGift.check);
    // The wallet that never moved still has its one lot, as old as the first check.
    expect(lotsOf(await holding(dividendCoin, keeper.publicKey))).toEqual([[(await classic(dividendCoin, keeper.publicKey)).toString(), firstCheck]]);
  });
});

describe("the Reward Round rules", () => {
  it("refuse steps that are missing, out of order, no heavier than once, above the cap or too many", async () => {
    const later = new Date(Date.now() + 3_600_000).toISOString();
    const rules = { minHolding: plain.minHolding, roundThreshold: plain.roundThreshold, effectiveAt: later };
    // A version states all of its rules: leaving the steps out is refused, where the empty list would be taken.
    expect((await announce(rules)).status).toBe(400);
    const many = Array.from({ length: HOLDING_WEIGHT_STEPS_MAX + 1 }, (_, i) => ({ afterDays: i + 1, weightBps: 11_000 + i * 1_000 }));
    for (const broken of [
      [{ afterDays: 2, weightBps: 15_000 }, { afterDays: 1, weightBps: 20_000 }],
      [{ afterDays: 1, weightBps: 15_000 }, { afterDays: 1, weightBps: 20_000 }],
      [{ afterDays: 1, weightBps: 20_000 }, { afterDays: 2, weightBps: 15_000 }],
      [{ afterDays: 1, weightBps: 15_000 }, { afterDays: 2, weightBps: 15_000 }],
      [{ afterDays: 1, weightBps: 10_000 }],
      [{ afterDays: 1, weightBps: HOLDING_WEIGHT_MAX_BPS + 1 }],
      [{ afterDays: 0, weightBps: 15_000 }],
      [{ afterDays: 1.5, weightBps: 15_000 }],
      [{ afterDays: 1 }],
      many,
      "none",
    ]) {
      const res = await announce({ ...rules, holdingWeights: broken });
      expect(res.status, JSON.stringify(broken)).toBe(400);
    }
    // Steps in order are still held to the lead time, and to the operator.
    const tooSoon = await announce({ ...rules, holdingWeights: QUICK, effectiveAt: new Date(Date.now() + 1_000).toISOString() });
    expect(tooSoon.status).toBe(422);
    expect((await api("/v1/operator/rewards/rules", { method: "POST", body: JSON.stringify({ ...rules, holdingWeights: QUICK }) })).status).toBe(401);
    // Nothing of that was written: the one version waiting with steps is the one this file announced.
    const waiting = [...(await rulesPage()).upcoming, (await rulesPage()).inForce!].filter((r) => r.holdingWeights.length > 0);
    expect(waiting).toEqual([quick]);
  });
});

describe("a Reward Round under a version with steps", () => {
  it("pays a Reward Launch's tax by Weighted Holding: a long holder more per coin than a new one, the treasury once, each payout from the round's own page", { timeout: 240_000 }, async () => {
    await inForce(quick);
    // A new holder buys now; the long holder and the treasury have held since before the steps were announced.
    const newHolder = await fundedWallet(3);
    await traded(newHolder, taxCoin, "buy", SOL(0.05));
    const run = await engine();
    const opened = run.opened.find((o) => o.mint === taxCoin);
    expect(opened, JSON.stringify(run)).toBeDefined();
    expect(run.finished).toContain(opened!.round);
    const detail = await roundDetail(opened!.round);
    expect(detail).toMatchObject({ source: "tax", status: "paid", rulesVersion: quick.version, eligibleHolders: 3 });
    expectPayoutsFollowTheRoundsPage(detail);

    // Each Weighted Holding is the wallet's balance at the snapshot weighed by its lots, which this run's own Holding
    // Check, if it made one, had brought up to date before the round opened.
    const at = new Date(detail.startedAt);
    const [long, fresh, flat] = [payoutOf(detail, oldHolder.publicKey), payoutOf(detail, newHolder.publicKey), payoutOf(detail, treasury())];
    const longLots = (await holding(taxCoin, oldHolder.publicKey)).lots;
    expect(longLots[0]!.since).toBe((await holding(taxCoin, treasury())).lots[0]!.since);
    // The long holder's first lot is past the last step, so it counts twice; what it was paid in earlier rounds is younger.
    expect(weightAt(longLots[0]!.since, at)).toBe(20_000n);
    expect(BigInt(long.weightedHolding)).toBe(weigh(BigInt(long.holding), longLots, at));
    expect(BigInt(long.weightedHolding)).toBeGreaterThan(BigInt(long.holding) * 15_000n);
    // The new holder's coins count once, whether this run's check saw them (a lot of no age) or not (no lot at all).
    expect(BigInt(fresh.weightedHolding)).toBe(weigh(BigInt(fresh.holding), (await holding(taxCoin, newHolder.publicKey)).lots, at));
    expect(BigInt(fresh.weightedHolding)).toBe(BigInt(fresh.holding) * ONCE);
    // So the long holder is paid more per coin than the new one.
    expect(BigInt(long.amount) * BigInt(fresh.holding)).toBeGreaterThan(BigInt(fresh.amount) * BigInt(long.holding));

    // The treasury's lots are as old as the long holder's, and every coin of it counts once all the same.
    const treasuryHolding = await holding(taxCoin, treasury());
    expect(treasuryHolding).toMatchObject({ flat: true, weightBps: 10_000, weightedHolding: (BigInt(treasuryHolding.held) * ONCE).toString() });
    expect(treasuryHolding.lots.length).toBeGreaterThan(0);
    expect(treasuryHolding.lots.every((l) => l.weightBps === 10_000)).toBe(true);
    expect(BigInt(flat.weightedHolding)).toBe(BigInt(flat.holding) * ONCE);
    expect(BigInt(long.amount) * BigInt(flat.holding)).toBeGreaterThan(BigInt(flat.amount) * BigInt(long.holding));
    // A holder's own page of lots says what it weighs now: the long holder's weight as one figure is above once.
    const longNow = await holding(taxCoin, oldHolder.publicKey);
    expect(longNow).toMatchObject({ flat: false, rulesVersion: quick.version });
    expect(longNow.lots[0]!.weightBps).toBe(20_000);
    expect(longNow.weightBps).toBe(Number(BigInt(longNow.weightedHolding) / BigInt(longNow.held)));
    expect(longNow.weightBps).toBeGreaterThan(15_000);
  });

  it("weighs a coin's Creator Earnings round the same way, counting coins bought since the last check once and taking coins sold since off the newest lot", { timeout: 240_000 }, async () => {
    // The Creator's share of every trade so far is collected: the coin's pot, which the next Creator Forward pays out.
    await collect();
    // The mover buys again, and the next Holding Check sees it: an old lot and a new one.
    await traded(mover, dividendCoin, "buy", SOL(0.03));
    await checkedAgain(dividendCoin);
    const before = { mover: await holding(dividendCoin, mover.publicKey), keeper: await holding(dividendCoin, keeper.publicKey), friend: await holding(dividendCoin, friend.publicKey) };
    expect(before.mover.lots).toHaveLength(2);
    const [old, recent] = before.mover.lots;
    expect(before.keeper.lots.map((l) => l.since)).toEqual([firstCheck]);

    // From here to the round's snapshot the engine does not run, so there is no Holding Check: what happens now is seen
    // by the snapshot alone. The mover sells the whole new lot and a quarter of the old one, the keeper buys more, and
    // a wallet that never held the coin buys.
    const sold = BigInt(recent!.amount) + BigInt(old!.amount) / 4n;
    await traded(mover, dividendCoin, "sell", sold);
    await traded(keeper, dividendCoin, "buy", SOL(0.02));
    const late = await fundedWallet(3);
    await traded(late, dividendCoin, "buy", SOL(0.02));
    const dividends = (await forward()).rules.dividends.filter((d) => d.mint === dividendCoin);
    expect(dividends).toHaveLength(1);
    const detail = await roundDetail(dividends[0]!.round);
    expect(detail).toMatchObject({ source: "earnings", status: "paying", rulesVersion: quick.version, eligibleHolders: 4 });
    expectPayoutsFollowTheRoundsPage(detail);
    const at = new Date(detail.startedAt);
    // The round opened while the new lot was still under the last step, so the two lots weigh differently.
    expect(weightAt(old!.since, at)).toBe(20_000n);
    expect(weightAt(recent!.since, at)).toBeLessThan(20_000n);

    // The mover: what it sold since the check came off the newest lot, so every coin it still holds is an old one.
    const moverPayout = payoutOf(detail, mover.publicKey);
    expect(BigInt(moverPayout.holding)).toBe(BigInt(before.mover.held) - sold);
    expect(BigInt(moverPayout.weightedHolding)).toBe(BigInt(moverPayout.holding) * 20_000n);
    // The keeper: its old lot counts twice, and what it bought since the check counts once.
    const keeperPayout = payoutOf(detail, keeper.publicKey);
    const keeperLot = BigInt(before.keeper.lots[0]!.amount);
    expect(BigInt(keeperPayout.holding)).toBeGreaterThan(keeperLot);
    expect(BigInt(keeperPayout.weightedHolding)).toBe(keeperLot * 20_000n + (BigInt(keeperPayout.holding) - keeperLot) * ONCE);
    // The wallet that bought after the check has no lot at all: every coin counts once.
    const latePayout = payoutOf(detail, late.publicKey);
    expect(BigInt(latePayout.weightedHolding)).toBe(BigInt(latePayout.holding) * ONCE);
    // The wallet the coins were sent to weighs by the one lot it has, as old as the check that first saw it.
    const friendPayout = payoutOf(detail, friend.publicKey);
    expect(BigInt(friendPayout.weightedHolding)).toBe(weigh(BigInt(friendPayout.holding), before.friend.lots, at));
    // And every one of them by the same rule, from the lots as the check left them.
    for (const [wallet, lots] of [[mover, before.mover.lots], [keeper, before.keeper.lots]] as const)
      expect(BigInt(payoutOf(detail, wallet.publicKey).weightedHolding)).toBe(weigh(BigInt(payoutOf(detail, wallet.publicKey).holding), lots, at));

    // The snapshot wrote nothing to the lots: only a Holding Check does.
    expect(lotsOf(await holding(dividendCoin, mover.publicKey))).toEqual(lotsOf(before.mover));
    expect((await holding(dividendCoin, late.publicKey)).lots).toEqual([]);

    // The Reward Engine pays the round as written, in SOL.
    const sol = await solOf(late);
    const paid = await engine();
    expect(paid.finished).toContain(detail.id);
    expect((await solOf(late)) - sol).toBe(BigInt(latePayout.amount));
    expect((await roundDetail(detail.id)).payouts.every((p) => p.status === "paid")).toBe(true);
  });
});

describe("a Reward Round under a version without steps", () => {
  it("is plainly pro rata again, to the unit, whatever the lots say", { timeout: 240_000 }, async () => {
    const back = await announced(plain, [], "holding-weight.test.ts: the plain rules again");
    expect(back.holdingWeights).toEqual([]);
    await inForce(back);
    const newcomer = await fundedWallet(3);
    await traded(newcomer, taxCoin, "buy", SOL(0.05));
    const run = await engine();
    const opened = run.opened.find((o) => o.mint === taxCoin);
    expect(opened, JSON.stringify(run)).toBeDefined();
    const detail = await roundDetail(opened!.round);
    expect(detail).toMatchObject({ source: "tax", rulesVersion: back.version });
    // The long holder's lots are older than ever, and count once like everyone's.
    expect((await holding(taxCoin, oldHolder.publicKey)).lots.every((l) => l.weightBps === 10_000)).toBe(true);
    const pot = BigInt(detail.pot);
    const total = sum(detail.payouts.map((p) => BigInt(p.holding)));
    expect(detail.payouts.length).toBeGreaterThanOrEqual(4);
    expect(detail.weightedTotal).toBe((total * ONCE).toString());
    for (const p of detail.payouts) {
      expect(p.weightedHolding, p.wallet).toBe((BigInt(p.holding) * ONCE).toString());
      expect(BigInt(p.amount), p.wallet).toBe((pot * BigInt(p.holding)) / total);
    }
    expect(payoutOf(detail, newcomer.publicKey)).toBeDefined();
  });
});
