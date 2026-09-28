// A Reward Launch's promise: nobody can ever change its Reward Tax. LaunchLab's own authority holds the coin's
// transfer-fee-config authority until Graduation; the migration hands it to the PlatformConfig's fee-extension authority,
// our operations wallet, and this job gives it up for good the minute the Graduation is indexed.
import { Connection, PublicKey, type Keypair } from "@solana/web3.js";
import { AuthorityType, createSetAuthorityInstruction, getMint, getTransferFeeConfig, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { signedTransaction } from "@launchpad/chain";
import { graduations, launches, operatorAlerts, type Db } from "@launchpad/db";
import type { Config } from "./env";

export type RewardTaxLock = {
  /** Coins whose tax authority the operations wallet gave up in this run, with the transaction. */
  locked: { mint: string; signature: string }[];
  /** Coins whose tax authority was already gone: locked as of their Graduation. */
  alreadyLocked: string[];
  /** Coins whose tax authority is held by someone else, which the operator is alerted about. */
  unexpected: string[];
};

const POLL_MS = 400;

/**
 * Locks the Reward Tax of every graduated Reward Launch that isn't locked yet. Idempotent: it reads each mint's
 * authority from the chain, so a run that dies after sending finds the authority gone next time and records it.
 */
export async function lockRewardTaxes(db: Db, cfg: Config, operations: Keypair): Promise<RewardTaxLock> {
  const result: RewardTaxLock = { locked: [], alreadyLocked: [], unexpected: [] };
  const due = await db
    .select({ mint: launches.mint, symbol: launches.symbol, graduatedSignature: graduations.signature })
    .from(launches)
    .innerJoin(graduations, eq(graduations.mint, launches.mint))
    .where(and(isNotNull(launches.rewardTaxBps), isNull(launches.rewardTaxLockedSignature)));
  if (due.length === 0) return result;
  const connection = new Connection(cfg.rpcUrl, "confirmed");
  const ops = operations.publicKey;
  for (const coin of due) {
    const mint = new PublicKey(coin.mint);
    const config = getTransferFeeConfig(await getMint(connection, mint, "confirmed", TOKEN_2022_PROGRAM_ID));
    const authority = config?.transferFeeConfigAuthority ?? null;
    if (authority === null || authority.equals(PublicKey.default)) {
      await record(db, coin.mint, coin.graduatedSignature);
      result.alreadyLocked.push(coin.mint);
      continue;
    }
    if (!authority.equals(ops)) {
      await db
        .insert(operatorAlerts)
        .values({
          kind: "reward_tax_unlocked",
          subject: coin.mint,
          message: `${coin.symbol} (${coin.mint}) graduated but its Reward Tax authority is ${authority.toBase58()}, not the operations wallet, so it cannot be locked.`,
        })
        .onConflictDoNothing();
      result.unexpected.push(coin.mint);
      continue;
    }
    const tx = await signedTransaction(connection, operations, [
      createSetAuthorityInstruction(mint, ops, AuthorityType.TransferFeeConfig, null, [], TOKEN_2022_PROGRAM_ID),
    ]);
    await connection.sendRawTransaction(tx.serialized, { preflightCommitment: "confirmed" });
    for (;;) {
      const { value: [status] } = await connection.getSignatureStatuses([tx.signature]);
      if (status?.err) throw new Error(`locking the Reward Tax of ${coin.mint} failed: ${JSON.stringify(status.err)}`);
      if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") break;
      if ((await connection.getBlockHeight("confirmed")) > tx.lastValidBlockHeight) throw new Error(`locking the Reward Tax of ${coin.mint} expired unlanded`);
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
    await record(db, coin.mint, tx.signature);
    result.locked.push({ mint: coin.mint, signature: tx.signature });
  }
  return result;
}

async function record(db: Db, mint: string, signature: string) {
  await db
    .update(launches)
    .set({ rewardTaxLockedSignature: signature, rewardTaxLockedAt: sql`now()` })
    .where(and(eq(launches.mint, mint), isNull(launches.rewardTaxLockedSignature)));
}
