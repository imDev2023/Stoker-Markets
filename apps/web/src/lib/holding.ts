import { HOLDING_WEIGHT_ONCE_BPS, type HoldingWeightStep, type RewardRulesPage, type RewardRuleVersion, type WalletHolding } from "@launchpad/contract";

/**
 * The Holding Weight (ADR 0022) as the site writes it. Holders see the rule under the name Diamond Hands; a weight is
 * always a multiple (1x, 1.5x, 2x) worked out from the API's basis points, and every step and figure shown is the
 * API's: nothing here knows what the steps are.
 */

/** Where the Rewards page explains the rule; a round's page and a coin's card link here. */
export const DIAMOND_HANDS_HREF = "/rewards#diamond-hands";

/** A weight in basis points as a multiple: 10000 is "1x", 15000 "1.5x", 18333 "1.83x". Cut to two decimals, never rounded up. */
export function weightMultiple(bps: number) {
  const whole = Math.floor(bps / HOLDING_WEIGHT_ONCE_BPS);
  const hundredths = Math.floor((bps % HOLDING_WEIGHT_ONCE_BPS) / (HOLDING_WEIGHT_ONCE_BPS / 100));
  const fraction = String(hundredths).padStart(2, "0").replace(/0+$/, "");
  return `${whole}${fraction ? `.${fraction}` : ""}x`;
}

/** A step's wait as people say it: "1 day", "30 days". A Holding Day is a day wherever the site is read. */
export const days = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;

/** Whether a payout counted for more than once: its Weighted Holding is above its holding counted once. */
export function countedMore(payout: { holding: string; weightedHolding: string }) {
  return BigInt(payout.weightedHolding) > BigInt(payout.holding) * BigInt(HOLDING_WEIGHT_ONCE_BPS);
}

/** A payout's weight as one figure, in basis points: its Weighted Holding over its holding, rounded down. */
export function payoutWeightBps(payout: { holding: string; weightedHolding: string }) {
  const holding = BigInt(payout.holding);
  return holding === 0n ? HOLDING_WEIGHT_ONCE_BPS : Number(BigInt(payout.weightedHolding) / holding);
}

const sameSteps = (a: readonly HoldingWeightStep[], b: readonly HoldingWeightStep[]) =>
  a.length === b.length && a.every((step, i) => step.afterDays === b[i]!.afterDays && step.weightBps === b[i]!.weightBps);

/**
 * What the Rewards page has to say about the rule: the steps in force, if the version in force has any, and every
 * announced version that changes them, each with the steps it brings (none when it ends the rule). Null while no
 * version with steps is in force or announced, when the page says nothing of it.
 */
export function diamondHands(rules: RewardRulesPage): { inForce: RewardRuleVersion | null; changes: RewardRuleVersion[] } | null {
  const inForce = rules.inForce && rules.inForce.holdingWeights.length > 0 ? rules.inForce : null;
  const changes: RewardRuleVersion[] = [];
  let before = rules.inForce?.holdingWeights ?? [];
  for (const version of rules.upcoming) {
    if (!sameSteps(version.holdingWeights, before)) changes.push(version);
    before = version.holdingWeights;
  }
  return inForce || changes.length > 0 ? { inForce, changes } : null;
}

/** A version's steps in one line, for the list of announced changes: "1.5x after 7 days, 2x after 30 days". */
export const stepsLine = (steps: readonly HoldingWeightStep[]) => steps.map((s) => `${weightMultiple(s.weightBps)} after ${days(s.afterDays)}`).join(", ");

/**
 * A wallet's Holding Lots gathered by what they count for now, the heaviest first: how many coins count at each weight,
 * how many lots that is, and since when the oldest of them were seen in the wallet.
 */
export function lotsByWeight(lots: WalletHolding["lots"]) {
  const groups = new Map<number, { weightBps: number; amount: bigint; since: string; lots: number }>();
  for (const lot of lots) {
    const group = groups.get(lot.weightBps);
    if (!group) groups.set(lot.weightBps, { weightBps: lot.weightBps, amount: BigInt(lot.amount), since: lot.since, lots: 1 });
    else {
      group.amount += BigInt(lot.amount);
      group.lots += 1;
      if (lot.since < group.since) group.since = lot.since;
    }
  }
  return [...groups.values()].sort((a, b) => b.weightBps - a.weightBps);
}
