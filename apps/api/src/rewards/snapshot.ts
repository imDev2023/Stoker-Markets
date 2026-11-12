// A Reward Round's snapshot (ADR 0006, ADR 0022), the same for either source of round: who holds the coin now, what
// each wallet's balance counts for by its Holding Lots, and each one's payout out of the pot. It reads the chain and
// the lots and writes nothing: only a Holding Check changes the lots (`checks.ts`), so a round never changes what the
// next check finds, and two rounds of one coin (its tax and its Creator's earnings) never race over them.
import type { Connection, PublicKey } from "@solana/web3.js";
import type { rewardRules, Db } from "@launchpad/db";
import type { Config } from "../env";
import { lotsOf } from "./checks";
import { eligibleHolders, readCoinAccounts } from "./holders";
import { roundPayouts, type RoundPayouts } from "./weights";

export type RoundSnapshot = RoundPayouts & {
  /** The slot the holders were read at. */
  slot: number;
  /** Wallets holding at least the rules' minimum, whether or not their share of the pot came to a whole unit. */
  eligible: number;
  /** What the payouts add up to. */
  distributable: bigint;
};

/**
 * Snapshots a coin's holders for a round that pays `pot` at `now` under `rules`, the version in force then: every
 * wallet holding at least the rules' minimum, each one's Weighted Holding from its balance and its lots as the last
 * Holding Check left them, weighed by the version's steps at `now`, and the payouts that follow. The treasury, where
 * one is set, is an eligible holder whose coins always count once. `tokenProgram` is named by a caller that knows it
 * (a Reward Launch is always Token-2022); otherwise the mint's own program is read from the chain.
 */
export async function snapshotRound(
  { db, connection, cfg, operationsWallet }: { db: Db; connection: Connection; cfg: Config; operationsWallet: PublicKey },
  mint: PublicKey, tokenProgram: PublicKey | undefined, rules: typeof rewardRules.$inferSelect, pot: bigint, now: Date,
): Promise<RoundSnapshot> {
  const slot = await connection.getSlot("confirmed");
  const holders = eligibleHolders(await readCoinAccounts(connection, mint, tokenProgram), operationsWallet, BigInt(rules.minHolding));
  const lots = holders.length ? await lotsOf(db, mint.toBase58()) : new Map();
  const weighing = { steps: rules.holdingWeights, at: now, daySeconds: cfg.holdingDaySeconds, flatWallet: cfg.treasury?.toBase58() ?? null };
  const { weightedTotal, payouts } = roundPayouts(holders, lots, weighing, pot);
  return { slot, eligible: holders.length, weightedTotal, payouts, distributable: payouts.reduce((s, p) => s + BigInt(p.amount), 0n) };
}
