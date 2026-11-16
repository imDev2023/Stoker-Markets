// The Reward Burn (#183, ADR 0006 amended): a Reward Launch whose Creator fixed a share at launch has that share of every
// harvested Reward Tax burned before anything is sold or paid. The burn rides in the transaction that withdraws the
// tax to the operations wallet, so the wallet never holds the burned share for a moment and a withdrawal never lands
// without its burn. Like every job transaction it is written down before it is sent (`job_transactions`) and settled by
// its signature: a run that dies leaves it for the next run, which records what landed on the Ledger as a `reward_burn`
// entry and collects nothing more of that coin while it may still land, so no harvest is ever burned twice.
//
// The Reward Liquidity (#214) rides in the same transaction: its share of the harvest moves from the wallet's associated
// account, which holds the holders' pot, to the Reward Liquidity's own coin account (`liquidityCoinAccount`, "reward"),
// where it waits for an addition to the coin's pool (`liquidity.ts`). Every Token-2022 transfer withholds the coin's tax
// in the receiving account, so the same transaction withdraws what the transfer withheld straight back into that
// account, which only the withdraw authority, the operations wallet, can do: the kept share pays no tax for the move.
import { Connection, PublicKey, SendTransactionError, type Keypair } from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction, createBurnCheckedInstruction, createTransferCheckedInstruction,
  createWithdrawWithheldTokensFromAccountsInstruction, createWithdrawWithheldTokensFromMintInstruction, getAccountLenForMint,
  getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID, unpackMint,
} from "@solana/spl-token";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { liquidityCoinAccount, openSeededTokenAccount, signedTransaction } from "@launchpad/chain";
import { jobTransactions, ledgerEntries, type Db } from "@launchpad/db";
import { BURN_DESTINATION, decodeBurn } from "../burn/decode";
import { fetchRawTransaction } from "../indexer";

const JOB = "reward-rounds";
/** The Ledger kind of a Reward Burn. */
const PURPOSE = "reward_burn";
/**
 * The purpose a withdrawal that burns or keeps a share is written down under. Withdrawals of the Reward Burn alone,
 * before the Reward Liquidity, went under `reward_burn`; both are settled the same way.
 */
const SPLIT = "reward_split";
const SPLIT_PURPOSES = [PURPOSE, SPLIT];
const POLL_MS = 400;

/**
 * One withdrawal that burned or kept a share, as the job summary reports it; amounts as strings, since a summary is
 * JSON. `burned` is what the Reward Burn destroyed, `kept` what the Reward Liquidity moved to its own account.
 */
export type BurnReport = { mint: string; signature: string; burned: string; kept: string; outcome: "landed" | "expired" };

/**
 * The share of a harvest the Reward Burn or the Reward Liquidity takes, rounded down: never more than the share, so
 * holders never get less than theirs.
 */
export function rewardBurnShare(harvest: bigint, bps: number) {
  return (harvest * BigInt(bps)) / 10_000n;
}

/**
 * Withdraws the mint's withheld tax to the operations wallet's account of the coin, burns `burn` coins of it and moves
 * `keep` coins of it to the Reward Liquidity's own account, tax-free, in one transaction written down before it is
 * sent. Both are shares of what the run read in the mint; anything harvested to the mint between that read and the
 * withdrawal goes to the holders whole. Waits until the transaction has landed or expired, and throws when it failed; a
 * run that dies while it waits leaves it for the next run's settlement.
 */
export async function withdrawAndBurn(
  db: Db, connection: Connection, operations: Keypair, coin: { mint: string; decimals: number }, burn: bigint, keep = 0n,
): Promise<BurnReport> {
  const ops = operations.publicKey;
  const mint = new PublicKey(coin.mint);
  const account = getAssociatedTokenAddressSync(mint, ops, false, TOKEN_2022_PROGRAM_ID);
  const tx = await signedTransaction(connection, operations, [
    createAssociatedTokenAccountIdempotentInstruction(ops, account, ops, mint, TOKEN_2022_PROGRAM_ID),
    createWithdrawWithheldTokensFromMintInstruction(mint, account, ops, [], TOKEN_2022_PROGRAM_ID),
    ...(burn > 0n ? [createBurnCheckedInstruction(account, mint, ops, burn, coin.decimals, [], TOKEN_2022_PROGRAM_ID)] : []),
    ...(keep > 0n ? await keepInstructions(connection, ops, mint, account, keep, coin.decimals) : []),
  ]);
  const report = { mint: coin.mint, signature: tx.signature, burned: burn.toString(), kept: keep.toString() };
  await db
    .insert(jobTransactions)
    .values({ signature: tx.signature, job: JOB, purpose: SPLIT, subject: coin.mint, lastValidBlockHeight: tx.lastValidBlockHeight })
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
      return { ...report, outcome: settled.outcome, burned: settled.burned ?? report.burned, kept: settled.outcome === "landed" ? report.kept : "0" };
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
    .where(and(eq(jobTransactions.job, JOB), inArray(jobTransactions.purpose, SPLIT_PURPOSES), eq(jobTransactions.subject, mint), eq(jobTransactions.status, "pending")));
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
  // A withdrawal that only kept a share for the pool burned nothing, and nothing of it goes on the Ledger.
  if (decoded.amount === 0n) return 0n;
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

/**
 * The account a coin's tax is kept in for its pool, the Reward Liquidity's and a Liquidity Launch's alike (#215), and
 * the instructions that open it when it is not there yet (none when it is).
 */
export async function liquidityAccount(connection: Connection, ops: PublicKey, mint: PublicKey) {
  const account = await liquidityCoinAccount(ops, mint, TOKEN_2022_PROGRAM_ID, "reward");
  const [held = null, mintInfo = null] = await connection.getMultipleAccountsInfo([account.address, mint], "confirmed");
  if (!mintInfo) throw new Error(`the coin's mint ${mint.toBase58()} does not exist`);
  // An address that holds lamports and nothing else is not an account yet: someone only sent it SOL.
  const open = [];
  if (!held || held.data.length === 0) {
    const space = getAccountLenForMint(unpackMint(mint, mintInfo, TOKEN_2022_PROGRAM_ID));
    const rent = await connection.getMinimumBalanceForRentExemption(space, "confirmed");
    open.push(...openSeededTokenAccount({ owner: ops, address: account.address, seed: account.seed, mint, tokenProgram: TOKEN_2022_PROGRAM_ID, space, rent, lamports: held?.lamports ?? 0 }));
  } else if (!held.owner.equals(TOKEN_2022_PROGRAM_ID)) {
    throw new Error(`the address of the Reward Liquidity's coin account, ${account.address.toBase58()}, is taken by something else`);
  }
  return { address: account.address, open };
}

/**
 * Moves `keep` coins from the wallet's associated account to the Reward Liquidity's own account, opening it first when
 * it is not there yet, then withdraws the tax the transfer withheld in that account back into it.
 */
async function keepInstructions(connection: Connection, ops: PublicKey, mint: PublicKey, from: PublicKey, keep: bigint, decimals: number) {
  const account = await liquidityAccount(connection, ops, mint);
  return [
    ...account.open,
    createTransferCheckedInstruction(from, mint, account.address, ops, keep, decimals, [], TOKEN_2022_PROGRAM_ID),
    createWithdrawWithheldTokensFromAccountsInstruction(mint, account.address, ops, [], [account.address], TOKEN_2022_PROGRAM_ID),
  ];
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
