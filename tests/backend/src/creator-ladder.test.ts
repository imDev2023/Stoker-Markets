// The Creator Ladder (#188, ADR 0020): every coin starts on the first Creator Tier, half of what the platform collects
// on it, on the curve and after Graduation. A graduated coin climbs by its Active Days, the days on which its pool
// traded at least a set part of its Graduation Target, and each pool fee collection is shared at the tier the coin held
// when it landed: nothing collected earlier moves, and a tier never falls. The ladder is versioned and announced ahead.
// The Fee Collector counts the days and records the tiers before it collects, and every page reads what it counted.
// An Active Day lasts ten seconds on this stack (`harness.ts`), so a coin climbs while the test watches.
import { afterAll, describe, expect, it } from "vitest";
import { PublicKey } from "@solana/web3.js";
import { WSOL_MINT } from "@launchpad/chain";
import { migrateCurve } from "@launchpad/localnet";
import {
  CreatorEarnings, CreatorLadderPage, CreatorLadderVersion, JobRun, LedgerPage, PlatformInfo, type AnnounceCreatorLadder, type LedgerEntry,
} from "@launchpad/contract";
import {
  SOL, connection, deliverWebhook, env, fundedWallet, getLaunch, graduationFeeIn, launch, quote, rawTransaction, solOf, trade,
} from "./client";

const WSOL = WSOL_MINT.toBase58();
const api = (path: string, init?: RequestInit) => fetch(`${env().apiUrl}${path}`, init);
const operator = () => ({ authorization: `Bearer ${env().operatorToken}`, "content-type": "application/json" });
const published = async () => PlatformInfo.parse(await (await api("/v1/platform")).json()).creatorForward.ladder;
const page = async () => CreatorLadderPage.parse(await (await api("/v1/creator-ladder")).json());
type Rule = Omit<AnnounceCreatorLadder, "effectiveAt" | "note">;
const announce = (rule: Rule, effectiveAt: Date, note?: string) =>
  api("/v1/operator/creator-ladder", { method: "POST", headers: operator(), body: JSON.stringify({ ...rule, effectiveAt: effectiveAt.toISOString(), note }) });

/** The first ladder (owner, 2026-11-10; the migration writes it): 60% after 15 Active Days, 70% after 30, a day at 1% of the Graduation Target. */
const FIRST: Rule = { secondBps: 6000, secondActiveDays: 15, topBps: 7000, topActiveDays: 30, activeDayFloorBps: 100 };
const tiersOf = (rule: Rule) => [
  { tier: 1, activeDays: 0, shareBps: 5000 },
  { tier: 2, activeDays: rule.secondActiveDays, shareBps: rule.secondBps },
  { tier: 3, activeDays: rule.topActiveDays, shareBps: rule.topBps },
];
/**
 * The ladder this file climbs: two and three Active Days, each a day on which the pool traded the coin's whole
 * Graduation Target. No other file's coin trades that much in its pool twice, so none climbs while this is in force.
 */
const QUICK: Rule = { secondBps: 6000, secondActiveDays: 2, topBps: 7000, topActiveDays: 3, activeDayFloorBps: 10_000 };

const lead = () => env().feeChangeLeadSeconds * 1000;
const dayMs = () => env().activeDaySeconds * 1000;

/** The chain's clock, which dates a trade and a Ledger entry; it need not agree with the wall clock. */
async function chainTime() {
  const time = await connection().getBlockTime(await connection().getSlot("confirmed"));
  return new Date((time ?? Math.floor(Date.now() / 1000)) * 1000);
}

/** A time far enough ahead to be announced, by the wall clock and by the chain's. */
async function announceable() {
  return new Date(Math.max(Date.now(), (await chainTime()).getTime()) + lead() + 2_000);
}

/** Waits until a version has taken effect for the API and every entry the chain now writes falls under it. */
async function inForce(effectiveAt: Date) {
  for (;;) {
    if (Date.now() > effectiveAt.getTime() + 1_000 && (await chainTime()).getTime() > effectiveAt.getTime() + 1_000) return;
    await new Promise((r) => setTimeout(r, 500));
  }
}

/** Runs the Fee Collector now, as the operator would, and returns the Creator Tiers it recorded. */
async function collect() {
  const res = await api("/v1/operator/jobs/fee-collector", { method: "POST", headers: operator() });
  const run = JobRun.parse(await res.json());
  expect(res.status, JSON.stringify(run)).toBe(200);
  return (run.summary as { tiers: { mint: string; tier: number; activeDays: number }[] }).tiers;
}

/** Every pool creator fee collected from a coin's pool in SOL, oldest first, from the public Ledger. */
async function poolFees(mint: string) {
  const found: LedgerEntry[] = [];
  for (let before: string | null = null; ; ) {
    const res: LedgerPage = LedgerPage.parse(await (await api(`/v1/ledger?kind=pool_fee&limit=100${before ? `&before=${encodeURIComponent(before)}` : ""}`)).json());
    found.push(...res.entries.filter((e) => e.launch?.mint === mint && e.asset.mint === WSOL));
    if (!res.next) break;
    before = res.next;
  }
  return found.reverse();
}

const shareOf = (entry: LedgerEntry, bps: number) => (BigInt(entry.amount) * BigInt(bps)) / 10_000n;

async function earnings(creator: PublicKey) {
  return CreatorEarnings.parse(await (await api(`/v1/creators/${creator.toBase58()}/earnings`)).json());
}

/** A SOL-paired coin that sold out its curve and was migrated into its pool, open for swaps, all indexed. */
async function graduatedCoin() {
  const creator = await fundedWallet();
  const { prepared, signature } = await launch(creator, { symbol: "CLMB" });
  await deliverWebhook([signature]);
  const trader = await fundedWallet(30);
  const bought = await trade(trader, prepared.mint, "buy", SOL(2));
  expect(bought.quote.completesCurve).toBe(true);
  const migration = await migrateCurve(connection(), new PublicKey(prepared.pool));
  await deliverWebhook([bought.signature, migration.signature]);
  for (let i = 0; i < 40 && !(await quote(prepared.mint, { side: "buy", amount: "1000000" })).ok; i++) await new Promise((r) => setTimeout(r, 250));
  const target = BigInt((await getLaunch(prepared.mint)).launch!.graduationTarget);
  return { creator, mint: prepared.mint, trader, onCurve: BigInt(bought.quote.fees.platform) / 2n, target };
}

/**
 * A buy in the coin's pool, indexed, in a later Active Day than `after` (the day index of an earlier trade): waits for
 * the chain's clock to enter a new day first. Returns the day the buy landed in.
 */
async function poolBuy(coin: { mint: string; trader: Awaited<ReturnType<typeof fundedWallet>> }, amount: bigint, after: number | null) {
  const dayOf = (time: number) => Math.floor(time / dayMs());
  while (after !== null && dayOf((await chainTime()).getTime()) <= after) await new Promise((r) => setTimeout(r, 500));
  const bought = await trade(coin.trader, coin.mint, "buy", amount);
  expect(bought.quote.venue).toBe("pool");
  await deliverWebhook([bought.signature]);
  return dayOf((await rawTransaction(bought.signature)).blockTime! * 1000);
}

const standing = async (mint: string) => (await getLaunch(mint)).launch!.graduation!.creatorTier!;

/** Whatever this file announced, the first ladder's rule is in force again when it ends, for every later file. */
let restored = true;
afterAll(async () => {
  if (restored) return;
  const back = await announceable();
  expect((await announce(FIRST, back, "the first ladder again")).status).toBe(201);
  await inForce(back);
});

describe("the Creator Ladder", () => {
  it("is published with its three tiers: half from the launch, then the shares and Active Days that climb from it", async () => {
    const ladder = await published();
    expect(ladder.upcoming).toEqual([]);
    expect(ladder.inForce).toMatchObject({ tiers: tiersOf(FIRST), activeDayFloorBps: FIRST.activeDayFloorBps });
    const all = await page();
    expect(all.inForce).toBe(ladder.inForce.version);
    expect(all.versions.at(-1)).toEqual(ladder.inForce);
    expect(all.versions[0]).toMatchObject({ version: 1, tiers: tiersOf(FIRST), activeDayFloorBps: 100, note: "first ladder" });
    // The first tier is the Creator Forward's own figure, on the curve and in the pool alike.
    const platform = PlatformInfo.parse(await (await api("/v1/platform")).json());
    expect(platform.creatorForward.shareBps).toBe(ladder.inForce.tiers[0]!.shareBps);
  });

  it("refuses a ladder that does not climb, one announced inside the lead time, and anyone but the operator", async () => {
    const later = new Date(Date.now() + lead() + 60_000);
    // The second tier must sit above the first's half, and the top above the second, never past the whole fee.
    for (const broken of [
      { ...FIRST, secondBps: 5000 }, { ...FIRST, topBps: 6000 }, { ...FIRST, topBps: 10_001 }, { ...FIRST, topActiveDays: 15 },
      { ...FIRST, secondActiveDays: 0 }, { ...FIRST, activeDayFloorBps: 0 }, { ...FIRST, activeDayFloorBps: 10_001 },
    ]) {
      const res = await announce(broken, later);
      expect(res.status, JSON.stringify(broken)).toBe(400);
    }
    const tooSoon = await announce(FIRST, new Date(Date.now() + lead() - 1_500));
    expect(tooSoon.status).toBe(422);
    expect(((await tooSoon.json()) as { error: string }).error).toMatch(/no sooner than/);
    expect((await api("/v1/operator/creator-ladder", { method: "POST", body: "{}" })).status).toBe(401);
    expect((await published()).upcoming).toEqual([]);
  });
});

describe("a graduated coin", () => {
  it("climbs by its Active Days: each pool fee collection is shared at the tier the coin held then, and a tier never falls", { timeout: 300_000 }, async () => {
    const coin = await graduatedCoin();
    const before = await page();
    // Graduated, with no pool trade yet: on the first tier, like every coin from its launch.
    expect(await standing(coin.mint)).toEqual({ tier: 1, activeDays: 0, reachedAt: null, next: { tier: 2, activeDays: FIRST.secondActiveDays } });

    const from = await announceable();
    restored = false;
    const announced = await announce(QUICK, from, "a quick ladder");
    expect(announced.status, await announced.clone().text()).toBe(201);
    const quick = CreatorLadderVersion.parse(await announced.json());
    expect(quick).toMatchObject({ version: before.versions.at(-1)!.version + 1, tiers: tiersOf(QUICK), activeDayFloorBps: 10_000, note: "a quick ladder" });
    // Announced, not in force: every client sees it coming.
    expect(await published()).toMatchObject({ inForce: { version: before.inForce }, upcoming: [quick] });
    // A version must take effect after every earlier one.
    expect((await announce(FIRST, new Date(from.getTime() - 500))).status).toBe(422);
    await inForce(from);
    expect(await published()).toMatchObject({ inForce: quick, upcoming: [] });

    // A day on which the pool traded less than the floor (here the coin's whole Graduation Target) is not an Active Day.
    const whole = (coin.target * 11n) / 10n;
    let day = await poolBuy(coin, coin.target / 20n, null);
    expect((await collect()).filter((t) => t.mint === coin.mint)).toEqual([]);
    expect(await standing(coin.mint)).toMatchObject({ tier: 1, activeDays: 0, next: { tier: 2, activeDays: 2 } });

    // One Active Day: still the first tier, so this collection is shared in half. The count is the Fee Collector's:
    // indexing the trade alone moves nothing.
    day = await poolBuy(coin, whole, day);
    expect((await standing(coin.mint)).activeDays).toBe(0);
    expect((await collect()).filter((t) => t.mint === coin.mint)).toEqual([]);
    expect(await standing(coin.mint)).toMatchObject({ tier: 1, activeDays: 1, reachedAt: null });

    // The second Active Day reaches the second tier: the Fee Collector records it, then collects at its share.
    day = await poolBuy(coin, whole, day);
    expect((await collect()).filter((t) => t.mint === coin.mint)).toEqual([{ mint: coin.mint, tier: 2, activeDays: 2 }]);
    expect(await standing(coin.mint)).toMatchObject({ tier: 2, activeDays: 2, reachedAt: expect.any(String), next: { tier: 3, activeDays: 3 } });

    // The third reaches the top.
    day = await poolBuy(coin, whole, day);
    expect((await collect()).filter((t) => t.mint === coin.mint)).toEqual([{ mint: coin.mint, tier: 3, activeDays: 3 }]);
    expect(await standing(coin.mint)).toMatchObject({ tier: 3, activeDays: 3, next: null });

    // Four collections, each at the tier the coin held when it landed: nothing collected earlier moved.
    const fees = await poolFees(coin.mint);
    expect(fees).toHaveLength(4);
    const climbed = shareOf(fees[0]!, 5000) + shareOf(fees[1]!, 5000) + shareOf(fees[2]!, 6000) + shareOf(fees[3]!, 7000);
    let e = await earnings(coin.creator.publicKey);
    expect(e.launches).toMatchObject([{ mint: coin.mint, curve: coin.onCurve.toString(), pool: climbed.toString(), tier: { tier: 3, activeDays: 3, next: null } }]);

    // The Creator Forward pays exactly that, less the coin's Graduation Fee.
    const held = await solOf(coin.creator);
    const forward = await api("/v1/operator/jobs/creator-forward", { method: "POST", headers: operator() });
    expect(forward.status, await forward.clone().text()).toBe(200);
    const fee = await graduationFeeIn(WSOL);
    expect((await solOf(coin.creator)) - held).toBe(coin.onCurve + climbed - fee);

    // The first ladder's rule again, which asks thirty Active Days of the top tier: the coin keeps the tier it reached,
    // and its next collection is shared at the top tier's share of the version then in force.
    const back = await announceable();
    expect((await announce(FIRST, back, "the first ladder again")).status).toBe(201);
    await inForce(back);
    restored = true;
    expect((await published()).inForce).toMatchObject({ tiers: tiersOf(FIRST), activeDayFloorBps: 100 });
    await poolBuy(coin, whole, day);
    expect((await collect()).filter((t) => t.mint === coin.mint)).toEqual([]);
    // On the top tier a coin is no longer counted: its Active Days stay the three that reached it.
    expect(await standing(coin.mint)).toMatchObject({ tier: 3, activeDays: 3, next: null });
    const after = await poolFees(coin.mint);
    expect(after).toHaveLength(5);
    e = await earnings(coin.creator.publicKey);
    expect(e.launches[0]!.pool).toBe((climbed + shareOf(after[4]!, FIRST.topBps)).toString());
  });

  it("stays on the first tier on the curve, with no Active Days to count", async () => {
    const creator = await fundedWallet();
    const { prepared, signature } = await launch(creator);
    await deliverWebhook([signature]);
    const bought = await trade(await fundedWallet(), prepared.mint, "buy", SOL(0.2));
    await deliverWebhook([bought.signature]);
    expect((await getLaunch(prepared.mint)).launch!.graduation).toBeNull();
    const second = (await published()).inForce.tiers[1]!;
    const e = await earnings(creator.publicKey);
    expect(e.launches).toMatchObject([{ mint: prepared.mint, status: "live", tier: { tier: 1, activeDays: 0, reachedAt: null, next: { tier: 2, activeDays: second.activeDays } } }]);
  });
});
