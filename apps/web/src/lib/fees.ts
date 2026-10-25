import type { PlatformInfo } from "@launchpad/contract";

/** A percentage for copy: at most three decimals, none it doesn't need. */
const pct = (bps: number) => Number((bps / 100).toFixed(3));

/**
 * What a Creator earns, from the platform facts the chain and the API give (ADR 0009): the platform's share of what it
 * collects on their coin's trades, on the curve out of the Platform Fee and after Graduation out of the pool's creator
 * fee, sent to their wallet. The chain's own Creator Fee is 0 on our platform; were the admin ever to set one, the
 * chain would pay it on top, so it is counted here.
 */
export function creatorEarnings(platform: PlatformInfo) {
  const curve = pct(platform.creatorFeeBps + platform.creatorForward.curveBps);
  const pool = pct(platform.creatorForward.poolBps);
  return {
    curve,
    pool,
    /** The share of what the platform collects that goes on to the Creator, in percent. */
    share: pct(platform.creatorForward.shareBps),
    /** "about 0.5% of every trade, on the curve and after graduation", or each figure when the two differ. */
    summary: curve === pool
      ? `~${curve}% of every trade, on the curve and after graduation`
      : `~${curve}% of every trade on the curve and ~${pool}% after graduation`,
  };
}

/** The Creator's share of one trade's Platform Fee, in raw units, as the Creator Forward counts it: rounded down. */
export function creatorShareOf(platform: PlatformInfo, platformFee: string) {
  return (BigInt(platformFee) * BigInt(platform.creatorForward.shareBps)) / 10_000n;
}

/**
 * What a trader pays on a trade, in percent, for the launch summary: the platform's fees and Raydium's own on the curve,
 * the pool's creator fee and Raydium's after Graduation, each from the chain through the platform facts.
 */
export function tradingFee(platform: PlatformInfo) {
  const curvePlatform = pct(platform.platformFeeBps + platform.creatorFeeBps);
  const curveRaydium = pct(platform.raydiumFee.curveBps);
  const poolPlatform = pct(platform.poolCreatorFeeBps);
  const poolRaydium = pct(platform.raydiumFee.poolBps);
  const curve = pct(platform.platformFeeBps + platform.creatorFeeBps + platform.raydiumFee.curveBps);
  const pool = pct(platform.poolCreatorFeeBps + platform.raydiumFee.poolBps);
  return {
    curve,
    pool,
    /** "1.25% of every trade, on the curve and after graduation", or each figure when the two differ. */
    summary: curve === pool ? `${curve}% of every trade, on the curve and after graduation` : `${curve}% of every trade on the curve, ${pool}% after graduation`,
    /** The split, for the note under it. */
    split: `${curvePlatform}% platform fee and ${curveRaydium}% Raydium on the curve, ${poolPlatform}% pool fee and ${poolRaydium}% Raydium after`,
  };
}
