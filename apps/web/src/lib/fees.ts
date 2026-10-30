import type { PlatformInfo } from "@launchpad/contract";
import { formatUnits, SOL_DECIMALS } from "./format";

/**
 * Fee figures are shown in one place, the Fees page (owner, 2026-10-30), every one of them from `GET /v1/platform` and
 * never a constant; everywhere else the site says what a fee is for and links there. What is left here are the
 * helpers the pages share: amounts of a visitor's own trade, which stay where the trade is.
 */

/** A percentage for copy: at most three decimals, none it doesn't need. */
export const pct = (bps: number) => `${Number((bps / 100).toFixed(3))}%`;

/** The Creator's share of one trade's Platform Fee, in raw units, as the Creator Forward counts it: rounded down. */
export function creatorShareOf(platform: PlatformInfo, platformFee: string) {
  return (BigInt(platformFee) * BigInt(platform.creatorForward.shareBps)) / 10_000n;
}

/** The Graduation Fee as copy: "0.015 SOL", or null when the platform charges none. */
export function graduationFeeSol(platform: PlatformInfo) {
  return platform.graduationFeeLamports === "0" ? null : `${formatUnits(platform.graduationFeeLamports, SOL_DECIMALS, 4)} SOL`;
}
