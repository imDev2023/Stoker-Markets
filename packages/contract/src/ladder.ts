import { z } from "zod";

/**
 * The Creator Ladder (ADR 0020): the Creator's share of what the platform collects on a coin climbs with the coin.
 * Every coin starts on the first Creator Tier, half (ADR 0009), on the curve and after Graduation. A graduated coin
 * reaches the second and the top tier by its Active Days: the days on which its pool traded at least a set part of the
 * coin's own Graduation Target. A higher tier raises the Creator's share of the pool creator fee collected from then
 * on; a coin's tier only ever climbs. The ladder is versioned and announced ahead, like the Budget Table (ADR 0019).
 */

const bps = z.number().int().min(0).max(10_000);

/**
 * The first tier's share, in basis points: half of what the platform collects on the coin (ADR 0009), the floor the
 * owner settled on 2026-11-09. On the curve it is the only share there is.
 */
export const CREATOR_SHARE_FLOOR_BPS = 5_000;

/** The three Creator Tiers, lowest first. */
export const CREATOR_TIERS = [1, 2, 3] as const;
export const CreatorTierNumber = z.union([z.literal(1), z.literal(2), z.literal(3)]);
export type CreatorTierNumber = z.infer<typeof CreatorTierNumber>;

/** One tier of a ladder version. */
export const LadderTier = z.object({
  tier: CreatorTierNumber,
  /** The Active Days that reach it; 0 for the first tier, which every coin is on from its launch. */
  activeDays: z.number().int().min(0),
  /** The Creator's share of a pool creator fee collection on this tier, in basis points of what arrives. */
  shareBps: bps,
});
export type LadderTier = z.infer<typeof LadderTier>;

/** One published version of the ladder. */
export const CreatorLadderVersion = z.object({
  version: z.number().int(),
  /** The three tiers, lowest first. */
  tiers: z.array(LadderTier).length(CREATOR_TIERS.length),
  /** The least a pool must trade in a day for the day to be an Active Day, in basis points of the coin's Graduation Target. */
  activeDayFloorBps: bps,
  note: z.string().nullable(),
  announcedAt: z.iso.datetime(),
  /** The first version is in force from the first lamport, whatever its own time says. */
  effectiveAt: z.iso.datetime(),
});
export type CreatorLadderVersion = z.infer<typeof CreatorLadderVersion>;

/** The ladder as published on `GET /v1/platform`: the version in force and any announced for later, soonest first. */
export const PublishedCreatorLadder = z.object({ inForce: CreatorLadderVersion, upcoming: z.array(CreatorLadderVersion) });
export type PublishedCreatorLadder = z.infer<typeof PublishedCreatorLadder>;

/** `GET /v1/creator-ladder`: every version there is, oldest first, those announced for later included. */
export const CreatorLadderPage = z.object({ versions: z.array(CreatorLadderVersion), inForce: z.number().int() });
export type CreatorLadderPage = z.infer<typeof CreatorLadderPage>;

/**
 * Operator: the next version. The shares climb from the floor (above half, the top above the second, never past the
 * whole fee) and so do the Active Days. It takes effect no sooner than the fee change's lead time after it is
 * announced, and after every earlier version.
 */
export const AnnounceCreatorLadder = z
  .object({
    secondBps: bps,
    secondActiveDays: z.number().int().min(1),
    topBps: bps,
    topActiveDays: z.number().int().min(2),
    activeDayFloorBps: z.number().int().min(1).max(10_000),
    effectiveAt: z.iso.datetime(),
    note: z.string().trim().max(200).optional(),
  })
  .refine((l) => l.secondBps > CREATOR_SHARE_FLOOR_BPS && l.topBps > l.secondBps, {
    message: `the shares must climb: the second tier above ${CREATOR_SHARE_FLOOR_BPS} basis points (the first tier's half) and the top tier above the second`,
  })
  .refine((l) => l.topActiveDays > l.secondActiveDays, { message: "the top tier must take more Active Days than the second" });
export type AnnounceCreatorLadder = z.infer<typeof AnnounceCreatorLadder>;

/** Where one coin stands on the ladder. */
export const CoinCreatorTier = z.object({
  /** The tier the coin holds: the highest it has been recorded on, which never falls. */
  tier: CreatorTierNumber,
  /** The coin's Active Days so far, counted with the floor in force now; 0 before Graduation. */
  activeDays: z.number().int().min(0),
  /** When the tier it holds was recorded; null on the first tier. */
  reachedAt: z.iso.datetime().nullable(),
  /** The next tier and the Active Days that reach it under the ladder in force; null on the top tier. */
  next: z.object({ tier: CreatorTierNumber, activeDays: z.number().int() }).nullable(),
});
export type CoinCreatorTier = z.infer<typeof CoinCreatorTier>;
