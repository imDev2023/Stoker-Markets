// The Holding Weight (ADR 0022) as arithmetic alone, with no database and no chain in it: how a coin's Holding Lots are
// brought in step with what its wallets hold at a Holding Check, what a wallet's balance counts for at a Reward Round's
// snapshot (its Weighted Holding), and how a round's pot is split by those. Every amount is a bigint of raw units, and
// a weight is whole basis points, so nothing here ever rounds but a payout, which rounds down.
import { HOLDING_WEIGHT_ONCE_BPS, type HoldingWeightStep } from "@launchpad/contract";
import type { Holder } from "./holders";

/** An amount of a coin a wallet was first seen holding at one Holding Check, with that check's time. */
export type Lot = { since: Date; amount: bigint };

/** What a Holding Check writes to bring a coin's lots in step with its wallets' balances. */
export type LotChanges = {
  /** A wallet holds more than its lots add up to: the difference is a new lot, since this check. */
  opened: { wallet: string; amount: bigint }[];
  /** A lot partly sold or sent away, with what is left of it. */
  reduced: { wallet: string; since: Date; amount: bigint }[];
  /** A lot with nothing left of it. */
  removed: { wallet: string; since: Date }[];
};

const ONCE = BigInt(HOLDING_WEIGHT_ONCE_BPS);
const oldestFirst = (lots: Lot[]) => [...lots].sort((a, b) => a.since.getTime() - b.since.getTime());
const sum = (lots: Lot[]) => lots.reduce((s, l) => s + l.amount, 0n);

/**
 * What a Holding Check changes: for each wallet, what it holds now against what its lots add up to. More is a new lot.
 * Less comes off the newest lots first, each removed once nothing is left of it, so the coins a wallet keeps keep their
 * age. The same is nothing at all. A wallet that holds nothing any more is absent from `balances` and loses every lot.
 */
export function reconcileLots(lots: Map<string, Lot[]>, balances: Map<string, bigint>): LotChanges {
  const changes: LotChanges = { opened: [], reduced: [], removed: [] };
  for (const wallet of new Set([...lots.keys(), ...balances.keys()])) {
    const own = lots.get(wallet) ?? [];
    const held = balances.get(wallet) ?? 0n;
    const recorded = sum(own);
    if (held > recorded) changes.opened.push({ wallet, amount: held - recorded });
    let excess = recorded - held;
    for (const lot of oldestFirst(own).reverse()) {
      if (excess <= 0n) break;
      if (lot.amount <= excess) {
        changes.removed.push({ wallet, since: lot.since });
        excess -= lot.amount;
      } else {
        changes.reduced.push({ wallet, since: lot.since, amount: lot.amount - excess });
        excess = 0n;
      }
    }
  }
  return changes;
}

/**
 * What a coin of a lot counts for at `at`, in basis points: once until the lot is as old as a step asks, counted in
 * Holding Days by the clock (`afterDays * daySeconds` since the lot's `since`), then the weight of the longest step it
 * has reached. With no steps every coin counts once.
 */
export function lotWeightBps(steps: HoldingWeightStep[], since: Date, at: Date, daySeconds: number): number {
  const ageMs = at.getTime() - since.getTime();
  let weight = HOLDING_WEIGHT_ONCE_BPS;
  for (const step of steps) if (ageMs >= step.afterDays * daySeconds * 1000 && step.weightBps > weight) weight = step.weightBps;
  return weight;
}

/** How a snapshot weighs: the steps of the rules version in force, the snapshot's time and the length of a Holding Day. */
export type Weighing = {
  steps: HoldingWeightStep[];
  at: Date;
  daySeconds: number;
  /** The wallet whose every coin always counts once, whatever its lots: the treasury; null where none is set. */
  flatWallet: string | null;
};

/**
 * A wallet's Weighted Holding: its balance at the snapshot with each coin counted at its Holding Weight, raw units
 * times basis points. The lots, as the last Holding Check left them, are taken oldest first up to the balance, so what
 * the wallet sold since that check comes off its newest lots; each lot taken counts at its step's weight, and whatever
 * the wallet holds beyond its lots, bought since the check, counts once. A flat wallet's balance counts once.
 */
export function weightedHolding(wallet: string, balance: bigint, lots: Lot[], weighing: Weighing): bigint {
  if (wallet === weighing.flatWallet) return balance * ONCE;
  let left = balance;
  let weighted = 0n;
  for (const lot of oldestFirst(lots)) {
    if (left === 0n) break;
    const taken = lot.amount < left ? lot.amount : left;
    weighted += taken * BigInt(lotWeightBps(weighing.steps, lot.since, weighing.at, weighing.daySeconds));
    left -= taken;
  }
  return weighted + left * ONCE;
}

/** A round's payouts as they are written, and what its holders' Weighted Holdings add up to. */
export type RoundPayouts = {
  /** Every holder's Weighted Holding added up, those whose share rounded to nothing among them: what a payout is a share of. */
  weightedTotal: bigint;
  payouts: { wallet: string; holding: string; weightedHolding: string; amount: string }[];
};

/**
 * From a round's snapshot to its payouts, for either source of round: each holder's share of the pot in proportion to
 * its Weighted Holding, `pot * weightedHolding / weightedTotal`, rounded down. A share that rounds to nothing is no
 * payout at all, and what the rounding leaves stays in the pot for the next round. With no steps every Weighted
 * Holding is the holding counted once, and the payouts are pro rata of the holdings to the unit.
 */
export function roundPayouts(holders: Holder[], lots: Map<string, Lot[]>, weighing: Weighing, pot: bigint): RoundPayouts {
  const weighed = holders.map((h) => ({ ...h, weighted: weightedHolding(h.wallet, h.amount, lots.get(h.wallet) ?? [], weighing) }));
  const weightedTotal = weighed.reduce((s, h) => s + h.weighted, 0n);
  if (weightedTotal === 0n) return { weightedTotal, payouts: [] };
  const payouts = weighed
    .map((h) => ({ wallet: h.wallet, holding: h.amount.toString(), weightedHolding: h.weighted.toString(), amount: ((pot * h.weighted) / weightedTotal).toString() }))
    .filter((p) => p.amount !== "0");
  return { weightedTotal, payouts };
}
