import type { PlatformInfo } from "@launchpad/contract";

/** A percentage for copy: at most three decimals, none it doesn't need. */
const pct = (bps: number) => Number((bps / 100).toFixed(3));

/**
 * A percentage said as "about", to one decimal: what the site repeats of a Creator's share (owner, 2026-10-25: about
 * 0.5% everywhere, the exact split in the launch summary's note alone). After Graduation the exact figure is 0.475% on
 * mainnet, since Raydium keeps 5% of the pool's creator fee.
 */
const about = (bps: number) => Number((bps / 100).toFixed(1));

/**
 * What a Creator earns, from the platform facts the chain and the API give (ADR 0009): the platform's share of what it
 * collects on their coin's trades, on the curve out of the Platform Fee and after Graduation out of the pool's creator
 * fee, sent to their wallet. The chain's own Creator Fee is 0 on our platform; were the admin ever to set one, the
 * chain would pay it on top, so it is counted here.
 */
export function creatorEarnings(platform: PlatformInfo) {
  const curve = about(platform.creatorFeeBps + platform.creatorForward.curveBps);
  const pool = about(platform.creatorForward.poolBps);
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
 * the pool's creator fee and Raydium's after Graduation, each from the chain through the platform facts. The note's
 * split is exact (owner, 2026-10-25): after Graduation Raydium also keeps its share of the pool's creator fee
 * (`poolCreatorFeeShareBps`, 5% on mainnet), so there it reads 0.3% to Raydium, 0.475% to the Creator and 0.475% to
 * the platform where the curve reads 0.25%, 0.5% and 0.5%.
 */
export function tradingFee(platform: PlatformInfo) {
  const curve = pct(platform.platformFeeBps + platform.creatorFeeBps + platform.raydiumFee.curveBps);
  const pool = pct(platform.poolCreatorFeeBps + platform.raydiumFee.poolBps);
  const who = (raydium: number, creator: number, platformKeeps: number) => `${pct(raydium)}% to Raydium, ${pct(creator)}% to you, ${pct(platformKeeps)}% to the platform`;
  const curveCreator = platform.creatorFeeBps + platform.creatorForward.curveBps;
  const onCurve = who(platform.raydiumFee.curveBps, curveCreator, platform.platformFeeBps - platform.creatorForward.curveBps);
  const raydiumShare = (platform.poolCreatorFeeBps * platform.poolCreatorFeeShareBps) / 10_000;
  const inPool = who(platform.raydiumFee.poolBps + raydiumShare, platform.creatorForward.poolBps, platform.poolCreatorFeeBps - raydiumShare - platform.creatorForward.poolBps);
  return {
    curve,
    pool,
    /** "1.25% of every trade, on the curve and after graduation", or each figure when the two differ. */
    summary: curve === pool ? `${curve}% of every trade, on the curve and after graduation` : `${curve}% of every trade on the curve, ${pool}% after graduation`,
    /** The split, for the note under it: one line when both venues split alike. */
    split: onCurve === inPool ? onCurve : `on the curve ${onCurve}; after graduation ${inPool}`,
  };
}
