// The Reward Burn (#183, ADR 0006 amended): a Reward Launch whose Creator fixed a share at launch has that share of every
// harvested Reward Tax burned before anything is sold or paid. The burn rides in the transaction that withdraws the
// tax to the operations wallet, so the wallet never holds the burned share for a moment and a withdrawal never lands
// without its burn. Like every job transaction it is written down before it is sent (`job_transactions`) and settled by
// its signature: a run that dies leaves it for the next run, which records what landed on the Ledger as a `reward_burn`
// entry and collects nothing more of that coin while it may still land, so no harvest is ever burned twice.
import { Connection, PublicKey, SendTransactionError, type Keypair } from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction, createBurnCheckedInstruction, createWithdrawWithheldTokensFromMintInstruction,
  getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import { and, desc, eq, sql } from "drizzle-orm";
import { signedTransaction } from "@launchpad/chain";
import { jobTransactions, ledgerEntries, type Db } from "@launchpad/db";
import { BURN_DESTINATION, decodeBurn } from "../burn/decode";
import { fetchRawTransaction } from "../indexer";

const JOB = "reward-rounds";
const PURPOSE = "reward_burn";
const POLL_MS = 400;

/** One Reward Burn as the job summary reports it; amounts as strings, since a summary is JSON. */
export type BurnReport = { mint: string; signature: string; burned: string; outcome: "landed" | "expired" };

/** The share of a harvest the Reward Burn takes, rounded down: never more than the share, so holders never get less than theirs. */
export function rewardBurnShare(harvest: bigint, bps: number) {
  return (harvest * BigInt(bps)) / 10_000n;
}

/**
 * Withdraws the mint's withheld tax to the operations wallet's account of the coin and burns `burn` coins of it, in one
 * transaction written down before it is sent. `burn` is the share of what the run read in the mint; anything harvested
 * to the mint between that read and the withdrawal goes to the holders whole. Waits until the transaction has landed or
 * expired, and throws when it failed; a run that dies while it waits leaves it for the next run's settlement.
 */
export async function withdrawAndBurn(
  db: Db, connection: Connection, operations: Keypair, coin: { mint: string; decimals: number }, burn: bigint,
): Promise<BurnReport> {
  const ops = operations.publicKey;
  const mint = new PublicKey(coin.mint);
  const account = getAssociatedTokenAddressSync(mint, ops, false, TOKEN_2022_PROGRAM_ID);
  const tx = await signedTransaction(connection, operations, [
    createAssociatedTokenAccountIdempotentInstruction(ops, account, ops, mint, TOKEN_2022_PROGRAM_ID),
    createWithdrawWithheldTokensFromMintInstruction(mint, account, ops, [], TOKEN_2022_PROGRAM_ID),
    createBurnCheckedInstruction(account, mint, ops, burn, coin.decimals, [], TOKEN_2022_PROGRAM_ID),
  ]);
  const report = { mint: coin.mint, signature: tx.signature, burned: burn.toString() };
  await db
    .insert(jobTransactions)
    .values({ signature: tx.signature, job: JOB, purpose: PURPOSE, subject: coin.mint, lastValidBlockHeight: tx.lastValidBlockHeight })
    .onConflictDoNothing();
  try {
    await connection.sendRawTransaction(tx.serialized, { preflightCommitment: "confirmed" });
  } catch (e) {
    // Only a transaction the node refused is known not to have gone out; anything else may still land and stays pending.
    if (!(e instanceof SendTransactionError)) throw e;
    await resolve(db, tx.signature, "failed", e.message);
    throw new Error(`Reward Burn ${tx.signature} was refused: ${e.message}`, { cause: e });
  }
  for (;;) {
    const settled = await settle(db, connection, ops, { signature: tx.signature, subject: coin.mint, lastValidBlockHeight: tx.lastValidBlockHeight });
    if (settled) {
      if (settled.outcome === "failed") throw new Error(`Reward Burn ${tx.signature} failed on-chain: ${settled.error}`);
      return { ...report, outcome: settled.outcome, burned: settled.burned ?? report.burned };
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

/**
 * Settles the coin's Reward Burns an earlier run left in flight. Returns what it settled, and whether one may still
 * land: while one may, the coin's tax is not collected again, or a late landing could burn a share of a later harvest.
 */
export async function settlePendingBurns(db: Db, connection: Connection, ops: PublicKey, mint: string) {
  const pending = await db
    .select()
    .from(jobTransactions)
    .where(and(eq(jobTransactions.job, JOB), eq(jobTransactions.purpose, PURPOSE), eq(jobTransactions.subject, mint), eq(jobTransactions.status, "pending")));
  const out = { landed: 0, failed: 0, expired: 0, inFlight: false };
  for (const p of pending) {
    const settled = await settle(db, connection, ops, p);
    if (settled) out[settled.outcome]++;
    else out.inFlight = true;
  }
  return out;
}

/** Where one Reward Burn stands: landed (and on the Ledger), failed on-chain, expired unlanded, or null while it may still land. */
async function settle(db: Db, connection: Connection, ops: PublicKey, t: { signature: string; subject: string; lastValidBlockHeight: number }) {
  const { value: [status] } = await connection.getSignatureStatuses([t.signature], { searchTransactionHistory: true });
  if (status?.err) {
    const error = JSON.stringify(status.err);
    await resolve(db, t.signature, "failed", error);
    return { outcome: "failed" as const, error, burned: null };
  }
  if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") {
    const burned = await recordRewardBurn(db, connection, ops, t.signature, new PublicKey(t.subject));
    if (burned === null) return null;
    await resolve(db, t.signature, "landed");
    return { outcome: "landed" as const, error: null, burned: burned.toString() };
  }
  if (!status && (await connection.getBlockHeight("confirmed")) > t.lastValidBlockHeight) {
    await resolve(db, t.signature, "expired");
    return { outcome: "expired" as const, error: null, burned: null };
  }
  return null;
}

/**
 * Records a landed Reward Burn on the Ledger: the coins its burn instruction destroyed, read back from the transaction,
 * from the operations wallet to the burn address, under the coin. Returns them, or null while the node does not serve
 * the transaction yet.
 */
async function recordRewardBurn(db: Db, connection: Connection, ops: PublicKey, signature: string, mint: PublicKey): Promise<bigint | null> {
  const raw = await fetchRawTransaction(connection.rpcEndpoint, signature);
  if (!raw) return null;
  const decoded = decodeBurn(raw, ops, mint);
  if (!decoded) throw new Error(`Reward Burn ${signature} could not be decoded`);
  await db
    .insert(ledgerEntries)
    .values({
      signature, eventIndex: 0, kind: PURPOSE, assetMint: mint.toBase58(), assetDecimals: decoded.decimals ?? 6, amount: decoded.amount.toString(),
      source: ops.toBase58(), destination: BURN_DESTINATION.toBase58(), launchMint: mint.toBase58(), slot: raw.slot,
      blockTime: new Date((raw.blockTime ?? Math.floor(Date.now() / 1000)) * 1000),
    })
    .onConflictDoNothing();
  return decoded.amount;
}

async function resolve(db: Db, signature: string, status: "landed" | "failed" | "expired", error?: string) {
  await db.update(jobTransactions).set({ status, error: error ?? null, resolvedAt: sql`now()` }).where(eq(jobTransactions.signature, signature));
}

/** A coin's Reward Burns as the Ledger has them: every coin burned so far, and the newest `limit` burns. */
export async function burnsOf(db: Db, mint: string, limit = 10) {
  const mine = and(eq(ledgerEntries.kind, PURPOSE), eq(ledgerEntries.launchMint, mint));
  const [totals] = await db.select({ burned: sql<string>`coalesce(sum(${ledgerEntries.amount}), 0)::text` }).from(ledgerEntries).where(mine);
  const recent = await db
    .select({ signature: ledgerEntries.signature, amount: ledgerEntries.amount, blockTime: ledgerEntries.blockTime })
    .from(ledgerEntries)
    .where(mine)
    .orderBy(desc(ledgerEntries.slot), desc(ledgerEntries.recordedAt))
    .limit(limit);
  return { burned: totals!.burned, recent };
}
