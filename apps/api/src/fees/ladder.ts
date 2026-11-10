// The Creator Ladder (ADR 0020): the Creator's share of a graduated coin's pool creator fee climbs with the coin's
// Active Days. This is the one place a tier's share is read and a coin's tier is recorded; `creatorShares.ts` computes
// every share from here.
import type { Connection } from "@solana/web3.js";
import { asc, eq, inArray, sql, type SQL } from "drizzle-orm";
import {
  CREATOR_SHARE_FLOOR_BPS, type AnnounceCreatorLadder, type CoinCreatorTier, type CreatorLadderPage, type CreatorLadderVersion, type CreatorTierNumber,
  type PublishedCreatorLadder,
} from "@launchpad/contract";
import { creatorLadders, creatorTiers, graduations, launches, ledgerEntries, trades, type Db } from "@launchpad/db";

export type CreatorLadder = typeof creatorLadders.$inferSelect;

/** A version's three tiers, lowest first: the first is the floor, from the coin's launch. */
export const tiersOf = (l: CreatorLadder): CreatorLadderVersion["tiers"] => [
  { tier: 1, activeDays: 0, shareBps: CREATOR_SHARE_FLOOR_BPS },
  { tier: 2, activeDays: l.secondActiveDays, shareBps: l.secondBps },
  { tier: 3, activeDays: l.topActiveDays, shareBps: l.topBps },
];

export const ladderVersion = (l: CreatorLadder): CreatorLadderVersion => ({
  version: l.version, tiers: tiersOf(l), activeDayFloorBps: l.activeDayFloorBps, note: l.note, announcedAt: l.announcedAt.toISOString(),
  effectiveAt: l.effectiveAt.toISOString(),
});

/** Every version there is, in the order they take effect, which is also their order by number. */
export async function ladderVersions(db: Db): Promise<CreatorLadder[]> {
  const all = await db.select().from(creatorLadders).orderBy(asc(creatorLadders.effectiveAt), asc(creatorLadders.version));
  if (!all.length) throw new Error("no Creator Ladder: the first version is missing (migration 0026_creator_ladder)");
  return all;
}

/**
 * The versions that have taken effect by `now`, oldest first, and those announced for later. The first version is in
 * force from the first lamport, whatever its own time says: there was never a time without a ladder.
 */
export function split(all: CreatorLadder[], now = new Date()) {
  const inEffect = all.filter((l, i) => i === 0 || l.effectiveAt <= now);
  return { inForce: inEffect.at(-1)!, upcoming: all.slice(inEffect.length) };
}

/** The ladder as published on `GET /v1/platform`: the version in force and any announced for later. */
export async function publishedLadder(db: Db, now = new Date()): Promise<PublishedCreatorLadder> {
  const { inForce, upcoming } = split(await ladderVersions(db), now);
  return { inForce: ladderVersion(inForce), upcoming: upcoming.map(ladderVersion) };
}

/** `GET /v1/creator-ladder`: every version, and which is in force. */
export async function ladderPage(db: Db, now = new Date()): Promise<CreatorLadderPage> {
  const all = await ladderVersions(db);
  return { versions: all.map(ladderVersion), inForce: split(all, now).inForce.version };
}

/** Writes the next version; the route has checked its lead time and its place after every earlier version. */
export async function announceLadder(db: Db, rule: AnnounceCreatorLadder, effectiveAt: Date, now: Date) {
  const [latest] = await db.select({ version: sql<number>`coalesce(max(${creatorLadders.version}), 0)::int` }).from(creatorLadders);
  const [row] = await db
    .insert(creatorLadders)
    .values({
      version: latest!.version + 1, secondBps: rule.secondBps, secondActiveDays: rule.secondActiveDays, topBps: rule.topBps,
      topActiveDays: rule.topActiveDays, activeDayFloorBps: rule.activeDayFloorBps, note: rule.note ?? null, announcedAt: now, effectiveAt,
    })
    .returning();
  return row!;
}

/**
 * The Creator's share of one pool creator fee collection, in basis points, as SQL over a row of `ledger_entries`: the
 * share of the tier its coin held when the collection landed (the highest tier recorded in an earlier slot; the first
 * without one), under the ladder version in force at the collection's block time. Never under the floor: a collection
 * no version covers earns half, as every collection did before the ladder (ADR 0009).
 */
export const poolShareBps: SQL = sql`coalesce((
  select case coalesce((select max(ct.tier) from ${creatorTiers} ct where ct.mint = ${ledgerEntries.launchMint} and ct.reached_slot < ${ledgerEntries.slot}), 1)
    when 3 then cl.top_bps when 2 then cl.second_bps else ${CREATOR_SHARE_FLOOR_BPS}::int end
  from ${creatorLadders} cl
  where cl.version = 1 or cl.effective_at <= ${ledgerEntries.blockTime}
  order by cl.version desc limit 1), ${CREATOR_SHARE_FLOOR_BPS}::int)`;

/**
 * Every graduated coin's Active Days so far (all of them, or the given coins'): the days, `daySeconds` long and counted
 * from the epoch (UTC days in production), on which the indexed trades in its pool came to at least `floorBps` of the
 * coin's own Graduation Target, in its Quote Asset. A coin with none is absent. The floor is the one in force now,
 * applied to every day since Graduation.
 */
export async function activeDays(db: Db, daySeconds: number, floorBps: number, mints?: string[]) {
  if (mints && !mints.length) return new Map<string, number>();
  // The length goes into the text, not as a parameter: the same expression is selected and grouped by, and Postgres
  // only sees the two as one when they read the same.
  if (!Number.isInteger(daySeconds) || daySeconds <= 0) throw new Error(`an Active Day must be a whole number of seconds above zero (got ${daySeconds})`);
  const day = sql`floor(extract(epoch from ${trades.blockTime}) / ${sql.raw(String(daySeconds))})`;
  const active = db
    .select({ mint: trades.mint, day: day.as("day") })
    .from(trades)
    .innerJoin(launches, eq(launches.mint, trades.mint))
    .where(sql`${trades.venue} = 'pool'${mints ? sql` and ${inArray(trades.mint, mints)}` : sql``}`)
    .groupBy(trades.mint, day, launches.graduationTarget)
    .having(sql`sum(${trades.quoteAmount}) * 10000 >= ${launches.graduationTarget} * ${floorBps}::int`)
    .as("active");
  const rows = await db.select({ mint: active.mint, days: sql<number>`count(*)::int` }).from(active).groupBy(active.mint);
  return new Map(rows.map((r) => [r.mint, r.days]));
}

/** The tier a count of Active Days reaches under a version. */
export function tierFor(l: CreatorLadder, days: number): CreatorTierNumber {
  return days >= l.topActiveDays ? 3 : days >= l.secondActiveDays ? 2 : 1;
}

/** One tier a coin reached in a run, as a job summary carries it. */
export type TierReached = { mint: string; tier: number; activeDays: number };

/**
 * Records every tier a graduated coin has newly reached under the ladder in force (ADR 0020), run by the Fee Collector
 * before it collects: the pool fees it collects next land in a later slot than the one written here, so they already
 * earn the new tier's share, and nothing collected earlier moves. A row is written once and never changed, so a coin's
 * tier only ever climbs, whatever a later version asks of a coin that has not reached it yet.
 */
export async function recordCreatorTiers(db: Db, connection: Connection, daySeconds: number, now = new Date()): Promise<TierReached[]> {
  const { inForce } = split(await ladderVersions(db), now);
  const [days, held] = await Promise.all([
    activeDays(db, daySeconds, inForce.activeDayFloorBps),
    db.select({ mint: creatorTiers.mint, tier: sql<number>`max(${creatorTiers.tier})::int` }).from(creatorTiers).groupBy(creatorTiers.mint),
  ]);
  const holds = new Map(held.map((h) => [h.mint, h.tier]));
  const due: TierReached[] = [];
  for (const [mint, count] of [...days].sort(([a], [b]) => a.localeCompare(b)))
    for (let tier = (holds.get(mint) ?? 1) + 1; tier <= tierFor(inForce, count); tier++) due.push({ mint, tier, activeDays: count });
  if (!due.length) return [];
  const slot = await connection.getSlot("confirmed");
  const written = await db
    .insert(creatorTiers)
    .values(due.map((d) => ({ ...d, ladderVersion: inForce.version, reachedSlot: slot, reachedAt: now })))
    .onConflictDoNothing()
    .returning({ mint: creatorTiers.mint, tier: creatorTiers.tier, activeDays: creatorTiers.activeDays });
  return written;
}

/**
 * Where each of the given coins stands on the ladder: the tier it holds, its Active Days counted now, and the next tier
 * under the version in force. A coin that has not graduated is on the first tier with no Active Days.
 */
export async function coinTiers(db: Db, daySeconds: number, mints: string[], now = new Date()): Promise<Map<string, CoinCreatorTier>> {
  if (!mints.length) return new Map();
  const { inForce } = split(await ladderVersions(db), now);
  const [days, rows, graduated] = await Promise.all([
    activeDays(db, daySeconds, inForce.activeDayFloorBps, mints),
    db.select().from(creatorTiers).where(inArray(creatorTiers.mint, mints)).orderBy(asc(creatorTiers.tier)),
    db.select({ mint: graduations.mint }).from(graduations).where(inArray(graduations.mint, mints)),
  ]);
  const held = new Map(rows.map((r) => [r.mint, r]));
  const tiers = tiersOf(inForce);
  const live = new Set(graduated.map((g) => g.mint));
  return new Map(mints.map((mint) => {
    const row = held.get(mint);
    const tier = (row?.tier ?? 1) as CreatorTierNumber;
    const next = tiers.find((t) => t.tier === tier + 1);
    return [mint, {
      tier, activeDays: live.has(mint) ? (days.get(mint) ?? 0) : 0, reachedAt: row?.reachedAt.toISOString() ?? null,
      next: next ? { tier: next.tier, activeDays: next.activeDays } : null,
    }];
  }));
}
