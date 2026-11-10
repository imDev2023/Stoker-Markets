// The `holders` rule (ADR 0011): a coin's Creator Earnings are paid to its holders, pro rata in the Quote Asset. A run
// opens one Reward Round of source `earnings` with the coin's pot; the Reward Engine pays it, like any round.
import type { RulePot } from "../creatorShares";
import type { RuleDeps, Skipped } from "./types";

/** A round this run opened, as the job's summary carries it. */
export type DividendRound = { mint: string; round: string; holders: number; amount: string };

/**
 * Opens an earnings round for the coin with at most `amount` of its Quote Asset: a snapshot of every eligible holder
 * under the Reward Round rules in force, and each one's pro-rata payout, written in one database transaction. Skipped,
 * with the reason, while an earlier earnings round of the coin is still paying, or when nobody is eligible.
 */
export async function openDividendRound(_deps: RuleDeps, _pot: RulePot, _amount: bigint, _now: Date): Promise<DividendRound | Skipped> {
  return { skipped: "the holders rule is not built yet" };
}
