import { Connection, PublicKey, type Keypair, type TransactionInstruction } from "@solana/web3.js";
import { and, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import {
  feeKeyInstructions, findFeeKeys, platformFeeClaimInstructions, poolCreatorFeeInstructions, readPlatformFeeVaults, readPoolKeys,
  readTokenHoldings, signedTransaction, simulateFeeKeyCollection, sweepInstructions, WSOL_MINT, type FeeKey, type PoolKeys, type RevenueContext,
} from "@launchpad/chain";
import { feeKeys, graduations, jobTransactions, launches, ledgerEntries, quoteAssets, trades, type Db } from "@launchpad/db";
import type { Config } from "../env";
import { fetchRawTransaction } from "../indexer";
import { JobFailure } from "../jobs";
import { recordRevenue, revenueContext } from "./ledger";

const JOB = "fee-collector";
const WSOL = WSOL_MINT.toBase58();
const LAMPORTS_PER_SOL = 1_000_000_000n;

export type CollectorDeps = { db: Db; cfg: Config; operations: Keypair };

/** One transaction the run sent, and what it did. */
type Sent = { purpose: string; subject: string; signature: string; outcome: "landed" | "failed" | "expired"; entries: number; error?: string };

export type CollectorSummary = {
  /** Transactions of earlier runs that were still unresolved, now settled. */
  settled: { signature: string; outcome: string; entries: number }[];
  sent: Sent[];
  /** Fees found but left to grow, being worth less than the collection minimum. */
  leftToGrow: number;
  sweep: "not configured" | "nothing to sweep" | "swept";
  /** What could not even be tried, such as a Fee Key whose collection would not simulate. */
  problems: string[];
};

/**
 * The Fee Collector, run by its Cron Trigger: claims every revenue stream into the operations wallet, then sweeps the
 * wallet down to its float into the treasury (ADR 0004). Every transaction it signs is written down before it is sent
 * and recorded on the Ledger once it lands, so a run that dies half way, or is retried, never records anything twice
 * and never loses anything it moved. Streams:
 * - the Platform Fee vault of every Quote Asset our Launches trade against;
 * - the creator fee of every pool our Launches graduated into, where our platform is the pool creator;
 * - the LP fees of every Fee Key the operations wallet holds, for pools that have traded since their last collection.
 * A failed transaction does not stop the others; the run then fails with its summary, for the operator.
 */
export async function collectFees({ db, cfg, operations }: CollectorDeps): Promise<CollectorSummary> {
  const connection = new Connection(cfg.rpcUrl, "confirmed");
  const ops = operations.publicKey;
  const ctx = revenueContext(cfg, ops);
  const summary: CollectorSummary = { settled: [], sent: [], leftToGrow: 0, sweep: "nothing to sweep", problems: [] };

  // Anything an earlier run sent but could not see land is settled first, and nothing new is sent for it until it is.
  const { settled, busy } = await settlePending(db, connection, ctx);
  summary.settled = settled;
  const worth = await valuer(db, cfg.collectMinLamports);
  const send = async (purpose: string, subject: string, instructions: TransactionInstruction[]) => {
    if (busy.has(subject)) return false;
    summary.sent.push(await sendAndRecord(db, connection, ctx, operations, { purpose, subject, instructions }));
    return true;
  };

  // The Platform Fee: one vault per Quote Asset, shared by every Launch against it.
  const quoteMints = (await db.selectDistinct({ mint: launches.quoteMint }).from(launches).orderBy(launches.quoteMint))
    .map((r) => new PublicKey(r.mint));
  for (const v of await readPlatformFeeVaults(connection, cfg.launchlab, cfg.platformConfig, quoteMints)) {
    if (v.balance === 0n) continue;
    if (!worth(v.quoteMint.toBase58(), v.balance)) {
      summary.leftToGrow++;
      continue;
    }
    await send("platform_fee", v.vault.toBase58(), platformFeeClaimInstructions({
      program: cfg.launchlab, platformConfig: cfg.platformConfig, feeWallet: ops, quoteMint: v.quoteMint, quoteTokenProgram: v.quoteTokenProgram,
    }));
  }

  // After Graduation: each pool's creator fee, and its Fee Key's LP fees.
  const graduated = await db
    .select({ pool: graduations.pool, quoteMint: launches.quoteMint })
    .from(graduations)
    .innerJoin(launches, eq(launches.mint, graduations.mint))
    .orderBy(graduations.slot, graduations.pool);
  const quoteOf = new Map(graduated.map((g) => [g.pool, g.quoteMint]));
  const pools = await readPoolKeys(connection, graduated.map((g) => new PublicKey(g.pool)));
  for (const pool of pools) {
    if (!pool.creator.equals(ops) || pool.creatorFees.every((f) => f.isZero())) continue;
    if (!worth(quoteOf.get(pool.address.toBase58())!, quoteSide(pool, quoteOf).fee)) {
      summary.leftToGrow++;
      continue;
    }
    await send("pool_fee", pool.address.toBase58(), poolCreatorFeeInstructions(cfg.cpmm, pool, ops));
  }

  const keys = await feeKeysByPool(db, connection, cfg, ops, graduated.map((g) => g.pool));
  const traded = await poolsTradedSinceLastFeeKeyCollection(db, [...keys.keys()]);
  for (const pool of pools) {
    const key = keys.get(pool.address.toBase58());
    if (!key || !traded.has(pool.address.toBase58())) continue;
    const amounts = await simulateFeeKeyCollection(connection, ctx.programs, pool, key, ops).catch((e: Error) => e);
    if (amounts instanceof Error) {
      summary.problems.push(`fee_key ${pool.address.toBase58()}: ${amounts.message}`);
      continue;
    }
    const quote = quoteSide(pool, quoteOf);
    if (!worth(quote.mint, amounts[quote.index]!)) {
      if (amounts.some((a) => a > 0n)) summary.leftToGrow++;
      continue;
    }
    await send("fee_key", pool.address.toBase58(), feeKeyInstructions(ctx.programs, pool, key, ops));
  }

  if (!cfg.treasury) summary.sweep = "not configured";
  else if (await sweep(db, connection, cfg, cfg.treasury, operations, send)) summary.sweep = "swept";

  const failed = [
    ...summary.sent.filter((s) => s.outcome !== "landed").map((f) => `${f.purpose} ${f.subject}: ${f.outcome}${f.error ? ` (${f.error})` : ""}`),
    ...summary.problems,
  ];
  if (failed.length) throw new JobFailure(failed.join("; "), summary);
  return summary;
}

/** The pool's Quote Asset side: its position in the pool, its mint and the creator fee waiting on it. */
function quoteSide(pool: PoolKeys, quoteOf: Map<string, string>) {
  const mint = quoteOf.get(pool.address.toBase58())!;
  const index = pool.tokens[0].mint.toBase58() === mint ? 0 : 1;
  return { index, mint, fee: BigInt(pool.creatorFees[index].toString()) };
}

/**
 * Whether an amount of an asset is worth a collection: at least the minimum in SOL at the Quote Registry's latest price.
 * An asset without a price is collected whenever there is any, since there is no telling what it is worth.
 */
async function valuer(db: Db, minLamports: bigint) {
  const prices = new Map(
    (await db.select({ mint: quoteAssets.mint, priceSol: quoteAssets.priceSol, decimals: quoteAssets.decimals }).from(quoteAssets).where(isNotNull(quoteAssets.priceSol)))
      .map((q) => [q.mint, q]),
  );
  return (mint: string, amount: bigint) => {
    if (amount <= 0n) return false;
    if (mint === WSOL) return amount >= minLamports;
    const q = prices.get(mint);
    if (!q) return true;
    // amount / 10^decimals * priceSol SOL, compared in lamports without floating point.
    const [whole, fraction = ""] = q.priceSol!.split(".");
    const price = BigInt(whole! + fraction);
    const lamports = (amount * price * LAMPORTS_PER_SOL) / (10n ** BigInt(q.decimals) * 10n ** BigInt(fraction.length));
    return lamports >= minLamports;
  };
}

/**
 * The Fee Keys of the given pools, from what the operations wallet holds. A Fee Key is looked up on-chain once, when a
 * graduated pool has none on record, and remembered.
 */
async function feeKeysByPool(db: Db, connection: Connection, cfg: Config, ops: PublicKey, pools: string[]) {
  let known = await db.select().from(feeKeys);
  if (pools.some((p) => !known.some((k) => k.pool === p))) {
    const found = await findFeeKeys(connection, cfg.lock, ops, new Set(known.map((k) => k.nftMint)));
    if (found.length) {
      await db
        .insert(feeKeys)
        .values(found.map((k) => ({
          nftMint: k.nftMint.toBase58(), nftAccount: k.nftAccount.toBase58(), lockedLiquidity: k.lockedLiquidity.toBase58(), pool: k.pool.toBase58(),
        })))
        .onConflictDoNothing();
      known = await db.select().from(feeKeys);
    }
  }
  return new Map(
    known
      .filter((k) => pools.includes(k.pool))
      .map((k): [string, FeeKey] => [k.pool, {
        nftMint: new PublicKey(k.nftMint), nftAccount: new PublicKey(k.nftAccount), lockedLiquidity: new PublicKey(k.lockedLiquidity), pool: new PublicKey(k.pool),
      }]),
  );
}

/**
 * Pools whose Fee Key can have earned something: a locked LP earns only from swaps, so only pools with an indexed trade
 * after their latest Fee Key collection (or ever, before the first) are worth simulating.
 */
async function poolsTradedSinceLastFeeKeyCollection(db: Db, pools: string[]) {
  if (!pools.length) return new Set<string>();
  const rows = await db
    .select({ pool: graduations.pool })
    .from(graduations)
    .where(and(
      inArray(graduations.pool, pools),
      sql`exists (select 1 from ${trades} where ${trades.mint} = ${graduations.mint} and ${trades.venue} = 'pool' and ${trades.slot} > coalesce(
        (select max(${ledgerEntries.slot}) from ${ledgerEntries} where ${ledgerEntries.kind} = 'fee_key' and ${ledgerEntries.source} = ${graduations.pool}), 0))`,
    ));
  return new Set(rows.map((r) => r.pool));
}

/**
 * Sweeps the operations wallet into the treasury: its SOL down to the float once it holds more than the threshold, and
 * of every other token, the revenue the Ledger shows it collected and has not swept yet. Anything else the wallet holds
 * in that token (a Reward Round's harvested tax, say) stays. Tokens go in batches that fit a transaction.
 */
async function sweep(
  db: Db, connection: Connection, cfg: Config, treasury: PublicKey, operations: Keypair,
  send: (purpose: string, subject: string, ixs: TransactionInstruction[]) => Promise<boolean>,
) {
  const ops = operations.publicKey;
  const unswept = await db
    .select({
      mint: ledgerEntries.assetMint,
      amount: sql<string>`sum(case when ${ledgerEntries.kind} = 'sweep' then -${ledgerEntries.amount} else ${ledgerEntries.amount} end)::text`,
    })
    .from(ledgerEntries)
    .where(and(inArray(ledgerEntries.kind, ["platform_fee", "pool_fee", "fee_key", "sweep"]), ne(ledgerEntries.assetMint, WSOL)))
    .groupBy(ledgerEntries.assetMint)
    .orderBy(sql`min(${ledgerEntries.slot})`, ledgerEntries.assetMint);
  const owed = new Map(unswept.filter((r) => BigInt(r.amount) > 0n).map((r) => [r.mint, BigInt(r.amount)]));
  const held = await readTokenHoldings(connection, ops, [...owed.keys()].map((m) => new PublicKey(m)));
  const tokens = held
    .map((t) => ({ ...t, amount: t.amount < owed.get(t.mint.toBase58())! ? t.amount : owed.get(t.mint.toBase58())! }))
    .filter((t) => t.amount > 0n);
  const balance = BigInt(await connection.getBalance(ops, "confirmed"));
  const lamports = balance > cfg.sweepThresholdLamports ? balance - cfg.sweepFloatLamports : 0n;
  if (lamports === 0n && tokens.length === 0) return false;
  // SOL goes with the first batch of tokens. A token takes two instructions (open the treasury's account, transfer), and
  // four of them fit a transaction with room to spare.
  const batches = tokens.length ? Array.from({ length: Math.ceil(tokens.length / 4) }, (_, i) => tokens.slice(i * 4, i * 4 + 4)) : [[]];
  let sent = false;
  for (const [i, batch] of batches.entries())
    sent = (await send("sweep", treasury.toBase58(), sweepInstructions(ops, treasury, i === 0 ? lamports : 0n, batch))) || sent;
  return sent;
}

const POLL_MS = 400;

/**
 * Signs, writes down, sends and waits for one transaction, then records what it moved. A transaction that is rejected
 * before it reaches the chain is marked failed; one that never lands before its blockhash expires, expired.
 */
async function sendAndRecord(
  db: Db, connection: Connection, ctx: RevenueContext, signer: Keypair,
  t: { purpose: string; subject: string; instructions: TransactionInstruction[] },
): Promise<Sent> {
  const tx = await signedTransaction(connection, signer, t.instructions);
  const base = { purpose: t.purpose, subject: t.subject, signature: tx.signature };
  await db.insert(jobTransactions).values({ ...base, job: JOB, lastValidBlockHeight: tx.lastValidBlockHeight });
  try {
    await connection.sendRawTransaction(tx.serialized, { preflightCommitment: "confirmed" });
  } catch (e) {
    const error = (e as Error).message;
    await resolve(db, tx.signature, "failed", error);
    return { ...base, outcome: "failed", entries: 0, error };
  }
  for (;;) {
    const settled = await settle(db, connection, ctx, { signature: tx.signature, lastValidBlockHeight: tx.lastValidBlockHeight });
    if (settled) return { ...base, outcome: settled.outcome, entries: settled.entries, ...(settled.error ? { error: settled.error } : {}) };
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

/** Settles every transaction earlier runs left pending; returns what it settled and the subjects still in flight. */
async function settlePending(db: Db, connection: Connection, ctx: RevenueContext) {
  const pending = await db.select().from(jobTransactions).where(and(eq(jobTransactions.job, JOB), eq(jobTransactions.status, "pending")));
  const settled: CollectorSummary["settled"] = [];
  const busy = new Set<string>();
  for (const p of pending) {
    const s = await settle(db, connection, ctx, p);
    if (s) settled.push({ signature: p.signature, outcome: s.outcome, entries: s.entries });
    else busy.add(p.subject);
  }
  return { settled, busy };
}

/**
 * Where one sent transaction stands: landed (and recorded on the Ledger), failed on-chain, expired unlanded, or null while
 * it may still land.
 */
async function settle(db: Db, connection: Connection, ctx: RevenueContext, t: { signature: string; lastValidBlockHeight: number }) {
  const { value: [status] } = await connection.getSignatureStatuses([t.signature], { searchTransactionHistory: true });
  if (status?.err) {
    const error = JSON.stringify(status.err);
    await resolve(db, t.signature, "failed", error);
    return { outcome: "failed" as const, entries: 0, error };
  }
  if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") {
    const raw = await fetchRawTransaction(connection.rpcEndpoint, t.signature);
    if (!raw) return null;
    const entries = await recordRevenue(db, ctx, raw);
    await resolve(db, t.signature, "landed");
    return { outcome: "landed" as const, entries };
  }
  if (!status && (await connection.getBlockHeight("confirmed")) > t.lastValidBlockHeight) {
    await resolve(db, t.signature, "expired");
    return { outcome: "expired" as const, entries: 0 };
  }
  return null;
}

async function resolve(db: Db, signature: string, status: "landed" | "failed" | "expired", error?: string) {
  await db.update(jobTransactions).set({ status, error: error ?? null, resolvedAt: sql`now()` }).where(eq(jobTransactions.signature, signature));
}
