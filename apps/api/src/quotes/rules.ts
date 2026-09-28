/**
 * How a price-dependent Graduation Target is enforced on-chain (ADR 0005): each Quote Asset's curve rule accepts a band
 * around the target at the latest price, and the Quote Registry refresh moves the band when the price drifts.
 * SOL needs no price, so its rule pins the target exactly.
 */

import BN from "bn.js";
import { closedLaunchConstraints, graduationBandOf, sameConstraints, standardLaunchConstraints, type RuleConstraint } from "@launchpad/chain";

export type Band = { min: bigint; max: bigint };

const BPS = 10_000n;
/** Launches may raise up to 10% more or less than the target at the latest price. */
const BAND_BPS = 1_000n;
/** The refresh moves a band once the target drifts 2.5% from its centre, so a launch built just before still lands inside. */
const RECENTRE_BPS = 250n;
/** Below this a raw target loses precision to rounding (0.005%) and the curve trades in coarse steps. */
const MIN_TARGET_RAW = 10_000n;
const U64_MAX = 2n ** 64n - 1n;

export function bandAround(target: bigint, exact: boolean): Band {
  if (exact) return { min: target, max: target };
  return { min: (target * (BPS - BAND_BPS)) / BPS, max: (target * (BPS + BAND_BPS)) / BPS };
}

export function needsRecentre(current: Band, target: bigint) {
  const centre = (current.min + current.max) / 2n;
  const drift = target > centre ? target - centre : centre - target;
  return drift * BPS > centre * RECENTRE_BPS;
}

const contains = (b: Band, target: bigint) => b.min <= target && target <= b.max;

export function bandOf(constraints: RuleConstraint[] | null): Band | null {
  const band = constraints && graduationBandOf(constraints);
  return band ? { min: BigInt(band.min.toString()), max: BigInt(band.max.toString()) } : null;
}

const launchConstraints = (b: Band) => standardLaunchConstraints({ min: new BN(b.min.toString()), max: new BN(b.max.toString()) });

/**
 * The constraints a Quote Asset's rule should have now, or null when the rule on-chain can stay as it is.
 * `current` is the rule's group today (null when there is no rule account, which LaunchLab treats as no restriction at all),
 * `target` the Graduation Target at the latest price (null without a reliable price), `exact` true for SOL.
 */
export function ruleUpdate(current: RuleConstraint[] | null, target: bigint | null, exact: boolean): RuleConstraint[] | null {
  if (target === null || !targetFits(target)) {
    const closed = closedLaunchConstraints();
    return current && sameConstraints(current, closed) ? null : closed;
  }
  const band = bandOf(current);
  const keep = band && sameConstraints(current!, launchConstraints(band)) &&
    (exact ? band.min === target && band.max === target : !needsRecentre(band, target));
  return keep ? null : launchConstraints(bandAround(target, exact));
}

/** Whether the curve can hold a Graduation Target: large enough to be precise, small enough to fit a u64 with its band. */
export const targetFits = (target: bigint) => target >= MIN_TARGET_RAW && bandAround(target, false).max <= U64_MAX;

/** Why a Quote Asset can't be launched against right now, written for the Creator; null when it can. */
export function launchBlocker(ticker: string, target: bigint | null, band: Band | null): string | null {
  if (target === null) return `No reliable price for ${ticker} yet, so its Graduation Target can't be set.`;
  if (target < MIN_TARGET_RAW) return `${ticker} is priced too high for a Graduation Target the curve can track precisely.`;
  if (!targetFits(target)) return `${ticker} is priced too low for its Graduation Target to fit on-chain.`;
  if (!band) return `Launches against ${ticker} open once its launch rules are set on-chain. Try again in a few minutes.`;
  if (!contains(band, target)) return `${ticker}'s price moved since its launch rules were last set. Try again in a few minutes.`;
  return null;
}
