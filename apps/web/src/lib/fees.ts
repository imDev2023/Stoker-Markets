import type { PlatformInfo } from "@launchpad/contract";

/** A percentage for copy: at most three decimals, none it doesn't need. */
const pct = (bps: number) => Number((bps / 100).toFixed(3));

/**
 * What a Creator earns, from the platform facts the chain and the API give (ADR 0007): on the curve the Creator Fee the
 * chain pays plus what the platform forwards; after Graduation, the platform's forward out of the pool's creator fee.
 */
export function creatorEarnings(platform: PlatformInfo) {
  const curve = pct(platform.creatorFeeBps + platform.creatorForward.curveBps);
  const pool = pct(platform.creatorForward.poolBps);
  return {
    /** Paid by the chain on every curve trade, into the Creator's vault. */
    chain: pct(platform.creatorFeeBps),
    /** Forwarded by the platform on every curve trade. */
    forward: pct(platform.creatorForward.curveBps),
    curve,
    pool,
    /** The share of the pool's creator fee the platform sends on, in percent. */
    poolShare: pct(platform.creatorForward.poolShareBps),
    /** "about 0.5% of every trade, on the curve and after graduation", or each figure when the two differ. */
    summary: curve === pool
      ? `~${curve}% of every trade, on the curve and after graduation`
      : `~${curve}% of every trade on the curve and ~${pool}% after graduation`,
  };
}
