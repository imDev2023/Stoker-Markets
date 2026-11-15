import { CREATOR_LOCK_LIMITS, type CreatorLockStatus, type CreatorLockTerms } from "@launchpad/contract";
import { formatDuration } from "./format";

/*
 * The Creator Lock (ADR 0023, #186, #211) as the site says it: the launch form's steps, the summary's sentence, the coin
 * page's mark and the badges. The lock's own size is the Creator's coins, not a fee of ours, so it may be shown wherever
 * the lock is (#211); fee figures stay on /fees.
 */

const DAY = 86_400;
const YEAR = 365 * DAY;

/**
 * The sizes the form offers, in basis points of the supply: steps of 5% up to a fifth, the largest ADR 0023 allows. A
 * Quote Asset whose cap falls between two steps offers the steps under it; one whose cap is under the first step offers
 * its cap alone; one with no room (0) offers none, and the form leaves the lock out.
 */
export const LOCK_SIZE_STEPS = [500, 1_000, 1_500, 2_000] as const;

export function lockSizes(capBps: number): number[] {
  const cap = Math.min(capBps, CREATOR_LOCK_LIMITS.maxBps);
  if (cap <= 0) return [];
  const steps = LOCK_SIZE_STEPS.filter((bps) => bps <= cap);
  return steps.length > 0 ? steps : [cap];
}

/**
 * The lock times the form offers, from the curve selling out until every locked coin is free: 7 days and 30 days, as the
 * owner first asked ("can we start by giving options of 7 days, 30 days etc?"), 14 days added on their review of #213,
 * then 90 days, 180 days and a year.
 */
export const LOCK_TIME_STEPS = [7 * DAY, 14 * DAY, 30 * DAY, 90 * DAY, 180 * DAY, YEAR] as const;

/**
 * How the coins come free within the lock time, as the form offers it: all at once when it ends (a cliff), or gradually
 * after the first 7 days (a 7-day cliff, then LaunchLab's linear unlock until the time ends), as the owner asked on their
 * review of #213. Gradually needs a time past those 7 days, so it never offers the 7 days alone.
 */
export type LockUnlock = "once" | "gradual";
export const GRADUAL_AFTER_SECONDS = 7 * DAY;

export function lockTimes(unlock: LockUnlock): number[] {
  return LOCK_TIME_STEPS.filter((seconds) => unlock === "once" || seconds > GRADUAL_AFTER_SECONDS);
}

/** The schedule the form sends for a lock time and how it unlocks: the cliff and the linear unlock, in seconds. */
export function lockSchedule(seconds: number, unlock: LockUnlock) {
  return unlock === "once"
    ? { cliffSeconds: seconds, unlockSeconds: 0 }
    : { cliffSeconds: GRADUAL_AFTER_SECONDS, unlockSeconds: seconds - GRADUAL_AFTER_SECONDS };
}

/** A lock's size as a share of the supply: 20%, 12.34%. */
export const lockShare = (bps: number) => `${(bps / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;

/** A span of a lock in words: 7 days, 1 year, 2 years, and in hours or less for a span under a day. */
export function lockTime(seconds: number) {
  if (seconds >= YEAR && seconds % YEAR === 0) return `${seconds / YEAR} year${seconds === YEAR ? "" : "s"}`;
  return formatDuration(seconds * 1000);
}

/** How the coins come free once the curve sells out, said after "Nothing unlocks until ...": the schedule in words. */
function schedule(terms: Pick<CreatorLockTerms, "cliffSeconds" | "unlockSeconds">) {
  if (terms.unlockSeconds === 0) return `all of it unlocks ${lockTime(terms.cliffSeconds)} after Graduation`;
  if (terms.cliffSeconds === 0) return `it unlocks evenly over the ${lockTime(terms.unlockSeconds)} after Graduation`;
  return `nothing unlocks for ${lockTime(terms.cliffSeconds)} after Graduation, then a little more unlocks every day until ${lockTime(terms.cliffSeconds + terms.unlockSeconds)} after it`;
}

/** The lock in one sentence, as the launch summary and the coin page's card say it before the coin has sold out. */
export function lockSentence(terms: Pick<CreatorLockTerms, "bps" | "cliffSeconds" | "unlockSeconds">) {
  const rest = schedule(terms);
  return `${lockShare(terms.bps)} of the supply is locked for the Creator; ${rest}.`;
}

/**
 * Where a lock stands, by the chain's clock at `asOf`: the curve still selling (the clock has not started), the cliff
 * running after the sell-out, the coins unlocking, or all of them unlocked.
 */
export type LockStage = "selling" | "cliff" | "unlocking" | "unlocked";

export function lockStage(status: Pick<CreatorLockStatus, "unlockStartsAt" | "unlockEndsAt" | "asOf">): LockStage {
  if (status.unlockStartsAt === null || status.unlockEndsAt === null) return "selling";
  const at = Date.parse(status.asOf);
  if (at < Date.parse(status.unlockStartsAt)) return "cliff";
  if (at < Date.parse(status.unlockEndsAt)) return "unlocking";
  return "unlocked";
}

/**
 * The share of the supply still locked: the lock less what has unlocked, by the Creator's share where the launch gave
 * one, or by the clock where it gave none (the coins then stay in LaunchLab's vault, unlocked or not).
 */
export function lockedShareBps(status: CreatorLockStatus): number {
  const { terms } = status;
  const amount = BigInt(terms.amount);
  if (amount === 0n) return 0;
  let unlocked: bigint;
  if (status.creatorShare) unlocked = BigInt(status.creatorShare.unlocked);
  else {
    const stage = lockStage(status);
    if (stage === "selling" || stage === "cliff") unlocked = 0n;
    else if (stage === "unlocked") unlocked = amount;
    else {
      const start = Date.parse(status.unlockStartsAt!);
      const span = Date.parse(status.unlockEndsAt!) - start;
      unlocked = span > 0 ? (amount * BigInt(Math.floor(Date.parse(status.asOf) - start))) / BigInt(span) : amount;
    }
  }
  const locked = amount > unlocked ? amount - unlocked : 0n;
  return Number((locked * BigInt(terms.bps) * 100n) / amount) / 100;
}

/** What reaches the Creator's wallet of a claim on a Reward Launch: the coin's Token-2022 fee withholds its Reward Tax, rounded up. */
export function receivedAfterTax(raw: bigint, rewardTaxBps: number | null) {
  if (!rewardTaxBps) return raw;
  const withheld = (raw * BigInt(rewardTaxBps) + 9_999n) / 10_000n;
  return raw - withheld;
}
