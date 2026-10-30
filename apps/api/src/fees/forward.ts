import { Connection, PublicKey, SendTransactionError, type Keypair } from "@solana/web3.js";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { creatorForwardInstructions, readTokenHoldings, signedTransaction, WSOL_MINT, type SweepToken } from "@launchpad/chain";
import { creatorForwards, ledgerEntries, type Db } from "@launchpad/db";
import type { Config } from "../env";
import { fetchRawTransaction } from "../indexer";
import { JobFailure } from "../jobs";
import { committedForwards, creatorShares, withheldGraduationFees } from "./creatorShares";
import { withholdGraduationFees, type Withheld } from "./graduationFee";
import { valuer } from "./value";

const WSOL = WSOL_MINT.toBase58();
const POLL_MS = 400;

export type ForwardDeps = { db: Db; cfg: Config; operations: Keypair };

type Outcome = "paid" | "failed" | "expired";

/** One forward the run sent, and how it ended. Amounts are strings: a summary is stored and logged as JSON. */
type Sent = { creator: string; mint: string; amount: string; signature: string; outcome: Outcome; error?: string };

export type ForwardSummary = {
  /** Forwards of earlier runs that were still in flight, now settled. */
  settled: { signature: string; outcome: Outcome }[];
  /** Graduation Fees withheld this run (ADR 0015), each out of what its coin's Creator was owed, before anything was sent. */
  graduationFees: Withheld[];
  sent: Sent[];
  /**
   * Creators owed something in an asset that is not yet worth the minimum, or SOL too little for an empty wallet to
   * hold; it waits and grows.
   */
  belowMinimum: number;
  /** What could not even be tried, such as an amount the wallet does not hold. */
  problems: string[];
};

/**
 * The Creator Forward (ADR 0009), run by its Cron Trigger right after the Fee Collector: pays every Creator what the
 * platform has collected for them and not forwarded yet, per Quote Asset, once it is worth the minimum. Each forward is
 * written down with its signature before it is sent, and what a Creator is owed counts every forward that landed or
 * may still land, so a run that dies half way, or is retried, never pays the same share twice. A landed forward goes
 * on the Ledger. One that fails does not stop the others; the run then fails with its summary, for the operator.
 * A graduated coin's Graduation Fee (ADR 0015) comes out first: what the Creator is owed on it is paid less the fee.
 */
export async function forwardCreatorShares({ db, cfg, operations }: ForwardDeps): Promise<ForwardSummary> {
  const connection = new Connection(cfg.rpcUrl, "confirmed");
  const ops = operations.publicKey;
  const summary: ForwardSummary = { settled: [], graduationFees: [], sent: [], belowMinimum: 0, problems: [] };

  // Anything an earlier run sent but could not see land is settled first; a Creator's asset still in flight waits.
  const busy = new Set<string>();
  for (const p of await db.select().from(creatorForwards).where(eq(creatorForwards.status, "sending"))) {
    const outcome = await settle(db, connection, ops, p);
    if (outcome) summary.settled.push({ signature: p.signature, outcome: outcome.outcome });
    else busy.add(`${p.creator} ${p.assetMint}`);
  }

  summary.graduationFees = await withholdGraduationFees(db, connection, ops);
  const [shares, committed, withheld, worth] = await Promise.all([
    creatorShares(db, { collectedOnly: true }),
    committedForwards(db),
    withheldGraduationFees(db),
    valuer(db, cfg.creatorForwardMinLamports),
  ]);
  const owed = shares
    .map((s) => ({ creator: s.creator, mint: s.mint, amount: s.curve + s.pool - (committed.get(`${s.creator} ${s.mint}`) ?? 0n) - (withheld.get(`${s.creator} ${s.mint}`) ?? 0n) }))
    .filter((o) => o.amount > 0n && !busy.has(`${o.creator} ${o.mint}`))
    // Asset by asset, the largest share first: the Ledger lists a run's forwards in the order they were paid, and a
    // Creator's address says nothing to a reader.
    .sort((a, b) => a.mint.localeCompare(b.mint) || (a.amount < b.amount ? 1 : a.amount > b.amount ? -1 : 0) || a.creator.localeCompare(b.creator));
  const tokenMints = [...new Set(owed.map((o) => o.mint).filter((m) => m !== WSOL))];
  const held = new Map((await readTokenHoldings(connection, ops, tokenMints.map((m) => new PublicKey(m)))).map((t) => [t.mint.toBase58(), t]));
  const revenue = await revenueHeld(db, tokenMints);
  // A wallet with no SOL at all can't receive less than an account's rent-exempt minimum: the transfer would fail.
  const solCreators = owed.filter((o) => o.mint === WSOL).map((o) => o.creator);
  const rentMinimum = BigInt(solCreators.length ? await connection.getMinimumBalanceForRentExemption(0, "confirmed") : 0);
  const lamportsOf = new Map<string, bigint>();
  for (let i = 0; i < solCreators.length; i += 100) {
    const batch = solCreators.slice(i, i + 100);
    const infos = await connection.getMultipleAccountsInfo(batch.map((c) => new PublicKey(c)), "confirmed");
    batch.forEach((c, j) => lamportsOf.set(c, BigInt(infos[j]?.lamports ?? 0)));
  }

  for (const o of owed) {
    if (!worth(o.mint, o.amount) || (o.mint === WSOL && (lamportsOf.get(o.creator) ?? 0n) + o.amount < rentMinimum)) {
      summary.belowMinimum++;
      continue;
    }
    let asset: SweepToken;
    if (o.mint === WSOL) {
      asset = { mint: WSOL_MINT, tokenProgram: PublicKey.default, decimals: 9, amount: o.amount };
    } else {
      // Only revenue is ever forwarded: the wallet's account of a token can also hold a Reward Round's pot.
      const token = held.get(o.mint);
      const available = token ? min(token.amount, revenue.get(o.mint) ?? 0n) : 0n;
      if (!token || available < o.amount) {
        summary.problems.push(`${o.creator} is owed ${o.amount} of ${o.mint}, but the operations wallet holds only ${available} of it as revenue`);
        continue;
      }
      token.amount -= o.amount;
      revenue.set(o.mint, (revenue.get(o.mint) ?? 0n) - o.amount);
      asset = { ...token, amount: o.amount };
    }
    summary.sent.push(await sendAndRecord(db, connection, operations, o.creator, asset));
  }

  const failed = [
    ...summary.sent.filter((s) => s.outcome !== "paid").map((s) => `forward to ${s.creator} of ${s.mint}: ${s.outcome}${s.error ? ` (${s.error})` : ""}`),
    ...summary.problems,
  ];
  if (failed.length) throw new JobFailure(failed.join("; "), summary);
  return summary;
}

const min = (a: bigint, b: bigint) => (a < b ? a : b);

/** Per token, the revenue the Ledger shows the operations wallet still holds: collected, less swept and forwarded. */
async function revenueHeld(db: Db, mints: string[]) {
  if (!mints.length) return new Map<string, bigint>();
  const rows = await db
    .select({
      mint: ledgerEntries.assetMint,
      amount: sql<string>`sum(case when ${ledgerEntries.kind} in ('sweep', 'creator_forward') then -${ledgerEntries.amount} else ${ledgerEntries.amount} end)::text`,
    })
    .from(ledgerEntries)
    .where(and(inArray(ledgerEntries.kind, ["platform_fee", "pool_fee", "fee_key", "sweep", "creator_forward"]), inArray(ledgerEntries.assetMint, mints), ne(ledgerEntries.assetMint, WSOL)))
    .groupBy(ledgerEntries.assetMint);
  return new Map(rows.map((r) => [r.mint, BigInt(r.amount)]));
}

/**
 * Signs, writes down, sends and waits for one forward. A transaction the node refuses is marked failed; one that never
 * lands before its blockhash expires, expired. Either frees the amount for the next run.
 */
async function sendAndRecord(db: Db, connection: Connection, operations: Keypair, creator: string, asset: SweepToken): Promise<Sent> {
  const ops = operations.publicKey;
  const mint = asset.mint.toBase58();
  const tx = await signedTransaction(connection, operations, creatorForwardInstructions(ops, new PublicKey(creator), asset));
  const base = { creator, mint, amount: asset.amount.toString(), signature: tx.signature };
  // The same instructions on the same blockhash sign to the same signature: a run right after a refused one meets its
  // own earlier forward here, and sends that one again instead of writing a second.
  const written = await db
    .insert(creatorForwards)
    .values({ signature: tx.signature, creator, assetMint: mint, assetDecimals: asset.decimals, amount: base.amount, lastValidBlockHeight: tx.lastValidBlockHeight })
    .onConflictDoNothing()
    .returning({ signature: creatorForwards.signature });
  if (written.length === 0) {
    const [again] = await db
      .update(creatorForwards)
      .set({ status: "sending", error: null, settledAt: null })
      .where(and(eq(creatorForwards.signature, tx.signature), eq(creatorForwards.status, "failed")))
      .returning({ signature: creatorForwards.signature });
    // Already paid or still in flight under this very signature: it is counted, and must not go out again.
    if (!again) return { ...base, outcome: "failed", error: "a forward with this signature is already recorded" };
  }
  try {
    await connection.sendRawTransaction(tx.serialized, { preflightCommitment: "confirmed" });
  } catch (e) {
    // Only a transaction the node refused (its preflight failed) is known not to have gone out. Anything else, such as
    // a dropped connection after the node took it, may still land, so it stays in flight for the next run to settle.
    if (!(e instanceof SendTransactionError)) throw e;
    await resolve(db, tx.signature, "failed", e.message);
    return { ...base, outcome: "failed", error: e.message };
  }
  for (;;) {
    const settled = await settle(db, connection, ops, { ...base, assetMint: mint, assetDecimals: asset.decimals, lastValidBlockHeight: tx.lastValidBlockHeight });
    if (settled) return { ...base, outcome: settled.outcome, ...(settled.error ? { error: settled.error } : {}) };
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

type InFlight = { signature: string; creator: string; assetMint: string; assetDecimals: number; amount: string; lastValidBlockHeight: number };

/**
 * Where one forward stands: paid (and on the Ledger), failed on-chain, expired unlanded, or null while it may still land.
 */
async function settle(db: Db, connection: Connection, ops: PublicKey, f: InFlight): Promise<{ outcome: Outcome; error?: string } | null> {
  const { value: [status] } = await connection.getSignatureStatuses([f.signature], { searchTransactionHistory: true });
  if (status?.err) {
    const error = JSON.stringify(status.err);
    await resolve(db, f.signature, "failed", error);
    return { outcome: "failed", error };
  }
  if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") {
    const raw = await fetchRawTransaction(connection.rpcEndpoint, f.signature);
    if (!raw) return null;
    const paidAt = new Date((raw.blockTime ?? Math.floor(Date.now() / 1000)) * 1000);
    // The Ledger entry first: if the run dies between the two writes, the forward is still `sending`, still counted,
    // and the next run finds the entry already there.
    await db
      .insert(ledgerEntries)
      .values({
        signature: f.signature, eventIndex: 0, kind: "creator_forward", assetMint: f.assetMint, assetDecimals: f.assetDecimals, amount: f.amount,
        source: ops.toBase58(), destination: f.creator, launchMint: null, slot: raw.slot, blockTime: paidAt,
      })
      .onConflictDoNothing();
    await db.update(creatorForwards).set({ status: "paid", error: null, paidAt, settledAt: sql`now()` }).where(eq(creatorForwards.signature, f.signature));
    return { outcome: "paid" };
  }
  if (!status && (await connection.getBlockHeight("confirmed")) > f.lastValidBlockHeight) {
    await resolve(db, f.signature, "expired");
    return { outcome: "expired" };
  }
  return null;
}

async function resolve(db: Db, signature: string, status: "failed" | "expired", error?: string) {
  await db.update(creatorForwards).set({ status, error: error ?? null, settledAt: sql`now()` }).where(eq(creatorForwards.signature, signature));
}
