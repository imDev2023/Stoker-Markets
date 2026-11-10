import type { CoinCreatorTier, CreatorLadderVersion, CreatorTierNumber, PlatformInfo } from "@launchpad/contract";
import { pct } from "./fees";

/**
 * The Creator Ladder in the site's words (ADR 0020), one source for the Fees page, the announcements, the coin page
 * and the Creator's own page. A share is a figure, so only the Fees page and the announcements show one (owner,
 * 2026-10-30); everywhere else a tier is named and its Active Days counted.
 */
export const TIER_NAMES: Record<CreatorTierNumber, string> = { 1: "First tier", 2: "Second tier", 3: "Top tier" };

/** A tier as the end of a sentence: "the second", "the top". */
const TOWARD: Record<CreatorTierNumber, string> = { 1: "the first", 2: "the second", 3: "the top" };

/** How far a coin is along its climb: "4 of 15 Active Days to the second", or its count alone on the top tier. */
export function tierProgress(t: CoinCreatorTier) {
  return t.next ? `${Math.min(t.activeDays, t.next.activeDays)} of ${t.next.activeDays} Active Days to ${TOWARD[t.next.tier]}` : `${t.activeDays} Active Days`;
}

/** What a pool trade pays the Creator on a tier, in basis points of the trade: the tier's share of the pool creator fee that arrives. */
export function poolBpsAt(platform: PlatformInfo, shareBps: number) {
  return (platform.poolCreatorFeeBps * (10_000 - platform.poolCreatorFeeShareBps) * shareBps) / 100_000_000;
}

/** A version's rule in one line, for the announcements and a version still to come. */
export function ladderLine(v: CreatorLadderVersion) {
  const [, second, top] = v.tiers;
  return `Second tier ${pct(second!.shareBps)} after ${second!.activeDays} Active Days, top tier ${pct(top!.shareBps)} after ${top!.activeDays}, a day counting from ${pct(v.activeDayFloorBps)} of the Graduation Target traded`;
}
