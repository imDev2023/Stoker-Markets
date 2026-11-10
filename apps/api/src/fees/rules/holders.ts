// The `holders` rule (ADR 0011): a coin's Creator Earnings are paid to its holders, pro rata in the Quote Asset. A run
// opens one Reward Round of source `earnings` with the coin's pot; the Reward Engine pays it, like any round.
import { PublicKey } from "@solana/web3.js";
import { and, eq } from "drizzle-orm";
import { rewardPayouts, rewardRounds } from "@launchpad/db";
import { rulesInForce } from "../../rewards/engine";
import { eligibleHolders, proRataPayouts, readCoinAccounts } from "../../rewards/holders";
import type { RulePot } from "../creatorShares";
import type { RuleDeps, Skipped } from "./types";

/** A round this run opened, as the job's summary carries it. */
export type DividendRound = { mint: string; round: string; holders: number; amount: string };

/**
 * Opens an earnings round for the coin with at most `amount` of its Quote Asset: a snapshot of every eligible holder
 * under the Reward Round rules in force, and each one's pro-rata payout, written in one database transaction. Skipped,
 * with the reason, while an earlier earnings round of the coin is still paying, or when nobody is eligible.
 *
 * Of the rules only the minimum holding applies: the threshold a tax round opens on is counted in coins of tax, and
 * this pot is the Creator's share, which the caller has already found worth a run. The coin may be a standard one or a
 * Reward Launch's, so its accounts are read under whichever token program its mint lives in. A Reward Launch may have
 * a tax round paying at the same moment; that round has its own pot and does not hold this one up.
 *
 * The round commits its payouts the moment it is written: every one that is paid, in flight or still to be sent counts
 * against the coin's pot (`rulePots`), so the next run opens nothing on the same share. What the rounding leaves, and
 * any payout the Reward Engine has to return, stays in the pot for the next round. A coin never has two earnings
 * rounds paying at once: a run opens none while one is paying, and the Creator Forward job's lease keeps two runs from
 * opening one each.
 */
export async function openDividendRound({ db, operations, connection }: RuleDeps, pot: RulePot, amount: bigint, now: Date): Promise<DividendRound | Skipped> {
  const [paying] = await db
    .select({ id: rewardRounds.id })
    .from(rewardRounds)
    .where(and(eq(rewardRounds.mint, pot.mint), eq(rewardRounds.source, "earnings"), eq(rewardRounds.status, "paying")))
    .limit(1);
  if (paying) return { skipped: `earnings round ${paying.id} is still paying` };

  const rules = await rulesInForce(db, now);
  const slot = await connection.getSlot("confirmed");
  const holders = eligibleHolders(await readCoinAccounts(connection, new PublicKey(pot.mint)), operations.publicKey, BigInt(rules.minHolding));
  if (!holders.length) return { skipped: "no wallet holds enough of the coin to be paid" };
  const id = crypto.randomUUID();
  const payouts = proRataPayouts(holders, amount).map((p) => ({ roundId: id, ...p }));
  if (!payouts.length) return { skipped: "the pot is too small to pay any holder a whole unit" };
  const distributable = payouts.reduce((s, p) => s + BigInt(p.amount), 0n);

  await db.transaction(async (tx) => {
    await tx.insert(rewardRounds).values({
      id, mint: pot.mint, rulesVersion: rules.version, status: "paying", source: "earnings", snapshotSlot: slot,
      // The Quote Asset, SOL as the wrapped-SOL mint: the Reward Engine pays that as plain SOL.
      payoutMint: pot.quoteMint, payoutDecimals: pot.quoteDecimals, pot: amount.toString(), sold: null, eligibleHolders: payouts.length,
      distributable: distributable.toString(), startedAt: now,
    });
    await tx.insert(rewardPayouts).values(payouts);
  });
  return { mint: pot.mint, round: id, holders: payouts.length, amount: distributable.toString() };
}
