// Volume rebates (#196, ADR 0021): the Budget Table's `rebates` row (ADR 0019) paid back to the traders whose fees made
// it. A Rebate Week's trades are settled together once the week has ended: what the row has left is split among the
// traders in proportion to the Platform Fees their trades paid, never more than the row's own share of those fees. A
// wallet's rebates wait until they reach the minimum payout and are then paid in one SOL transfer, written down with its
// transaction before it is sent and settled by it, every payment on the Ledger.
import { Connection, PublicKey, SendTransactionError, SystemProgram, type Keypair } from "@solana/web3.js";
import { and, asc, desc, eq, gte, inArray, isNotNull, lt, notInArray, or, sql } from "drizzle-orm";
import { signedTransaction, WSOL_MINT } from "@launchpad/chain";
import { BUDGET_TOTAL_BPS } from "@launchpad/contract";
import { launches, ledgerEntries, rebates, rebateWeeks, trades, type Db } from "@launchpad/db";
import type { Config } from "../env";
import { budgets, budgetVersions, split, type BudgetTable } from "../fees/budget";
import { lamportsWorth, quotePrices } from "../fees/value";
import { fetchRawTransaction } from "../indexer";
import { JobFailure } from "../jobs";
import { rebatesOwed } from "./owed";

export type RebateDeps = { db: Db; cfg: Config; operations: Keypair; now?: Date };

/** The Ledger kind a rebate payment is recorded under, which `budget.ts` counts as the row's spending. */
export const REBATE_KIND = "rebate";

const WSOL = WSOL_MINT.toBase58();
const POLL_MS = 400;
/** How often, a poll apart, a landed transaction is asked for before it is left for the next run to record. */
const LANDED_READS = 8;
/** SOL transfers per payment transaction. */
const PAYMENT_BATCH = 8;
/** Weeks settled per run: one in the ordinary course, more only after the job has been down. */
const WEEKS_PER_RUN = 8;
/** SOL the operations wallet keeps for network fees whatever it owes: a payment that would leave less is not sent. */
const FEE_RESERVE_LAMPORTS = 10_000_000n;
/** Rebates written per statement when a week is settled. */
const INSERT_CHUNK = 500;
/** 1970-01-05 00:00 UTC, the epoch's first Monday: every Rebate Week is counted from it, so a week runs Monday to Monday. */
const GRID_ANCHOR_MS = 4 * 86_400_000;

export const weekIndex = (ms: number, weekMs: number) => Math.floor((ms - GRID_ANCHOR_MS) / weekMs);
export const weekStart = (index: number, weekMs: number) => GRID_ANCHOR_MS + index * weekMs;

/** A stretch of time in which the `rebates` row has a share, so trades earn: from a version's start to the next one's. */
type Span = { from: number; to: number; shareBps: number };

/**
 * When trades earn, oldest first: under every Budget Table version that gives the `rebates` row a share, from the
 * moment it takes effect until the next version does. A trade made while the row has no share earns nothing, since
 * nothing was set aside on it (ADR 0019: a version's shares apply only to the net collected while it is in force).
 */
export function earningSpans(inEffect: BudgetTable[]): Span[] {
  return inEffect.flatMap((t, i) =>
    t.rebatesBps > 0 ? [{ from: t.effectiveAt.getTime(), to: inEffect[i + 1]?.effectiveAt.getTime() ?? Infinity, shareBps: t.rebatesBps }] : [],
  );
}

/** The weeks that have ended, hold some earning time and come after the last one settled, oldest first. */
function dueWeeks(spans: Span[], lastSettled: number | null, nowMs: number, weekMs: number, limit: number) {
  const due: number[] = [];
  let next = lastSettled === null ? -Infinity : lastSettled + 1;
  for (const s of spans) {
    const last = s.to === Infinity ? Infinity : weekIndex(s.to - 1, weekMs);
    for (let k = Math.max(weekIndex(s.from, weekMs), next); k <= last && weekStart(k, weekMs) + weekMs <= nowMs && due.length < limit; k++) {
      due.push(k);
      next = k + 1;
    }
  }
  return due;
}

export type WeekPlan = {
  start: Date;
  end: Date;
  /** The largest share the row had in force during the week: the most of the fees paid a rebate may be. */
  capBps: number;
  budget: bigint;
  /** The Platform Fees the week's earning trades paid, in lamports' worth. */
  fees: bigint;
  pot: bigint;
  /** Every wallet whose trades paid a fee, by address, with its rebate, which rounds to nothing while the pot is small. */
  shares: { wallet: string; fees: bigint; amount: bigint }[];
};

/**
 * The platform's own wallets, which earn no rebate: the operations wallet trades for the Burn, the Flywheel, the Reward
 * Sales and the Creators' buybacks, and a rebate to it, the treasury or the admin would only move the row's money back.
 */
export function platformWallets(cfg: Config, operations: PublicKey) {
  return [...new Set([operations, cfg.platformAdmin, ...(cfg.treasury ? [cfg.treasury] : [])].map((k) => k.toBase58()))];
}

/**
 * What a week gives each trader, from the indexed trades alone. Every trade of a coin, on its curve and in its pool, a
 * buy or a sell, counts by the Platform Fee it paid (after Graduation the pool's creator fee, which is the platform's,
 * ADR 0001), in its Quote Asset, valued in SOL at the Quote Registry's latest prices; an asset without a price counts
 * for nothing, as it does in the Platform Net. The pot is the budget, or the cap's share of the fees where that is
 * less, and a trader's rebate is the pot times their part of the fees, rounded down.
 */
async function planWeek(db: Db, excluded: string[], spans: Span[], index: number, weekMs: number, budget: bigint): Promise<WeekPlan> {
  const start = weekStart(index, weekMs);
  const end = start + weekMs;
  const earning = spans.map((s) => ({ from: Math.max(s.from, start), to: Math.min(s.to, end), shareBps: s.shareBps })).filter((s) => s.from < s.to);
  const capBps = earning.reduce((most, s) => Math.max(most, s.shareBps), 0);
  const plan: WeekPlan = { start: new Date(start), end: new Date(end), capBps, budget, fees: 0n, pot: 0n, shares: [] };
  if (!earning.length) return plan;
  const paid = await db
    .select({ wallet: trades.trader, mint: launches.quoteMint, amount: sql<string>`sum(${trades.platformFee})::text` })
    .from(trades)
    .innerJoin(launches, eq(launches.mint, trades.mint))
    .where(and(or(...earning.map((s) => and(gte(trades.blockTime, new Date(s.from)), lt(trades.blockTime, new Date(s.to))))), notInArray(trades.trader, excluded)))
    .groupBy(trades.trader, launches.quoteMint);
  const prices = await quotePrices(db);
  const feesOf = new Map<string, bigint>();
  for (const p of paid) {
    const worth = lamportsWorth(p.mint, BigInt(p.amount), prices.get(p.mint)) ?? 0n;
    if (worth > 0n) feesOf.set(p.wallet, (feesOf.get(p.wallet) ?? 0n) + worth);
  }
  for (const worth of feesOf.values()) plan.fees += worth;
  if (plan.fees === 0n) return plan;
  const cap = (plan.fees * BigInt(capBps)) / BigInt(BUDGET_TOTAL_BPS);
  plan.pot = budget < cap ? budget : cap;
  plan.shares = [...feesOf]
    .map(([wallet, fees]) => ({ wallet, fees, amount: (plan.pot * fees) / plan.fees }))
    .sort((a, b) => a.wallet.localeCompare(b.wallet));
  return plan;
}

/** What the row can give a week: what it has left, less the rebates of earlier weeks that are still to be paid. */
async function weekBudget(db: Db, now: Date) {
  const [{ rows }, owed] = [await budgets(db, now), await rebatesOwed(db)];
  return rows.rebates.available > owed ? rows.rebates.available - owed : 0n;
}

/**
 * The week being traded now as it would be settled at this moment, or null while the row gives its trades nothing.
 * An estimate: the week's later trades, the collections still to come and the prices at its settlement all move it.
 */
export async function currentWeek(db: Db, cfg: Config, operations: PublicKey, now = new Date()): Promise<WeekPlan | null> {
  const weekMs = cfg.rebateWeekSeconds * 1000;
  const index = weekIndex(now.getTime(), weekMs);
  const spans = earningSpans(split(await budgetVersions(db), now).inEffect);
  if (!spans.some((s) => s.from < weekStart(index + 1, weekMs) && s.to > weekStart(index, weekMs))) return null;
  return planWeek(db, platformWallets(cfg, operations), spans, index, weekMs, await weekBudget(db, now));
}

export type RebatesSummary = {
  /** Payments of earlier runs that were still in flight: landed and recorded, or back to waiting. */
  settled: { signature: string; outcome: "paid" | "returned" }[];
  /** The weeks this run settled. Amounts are strings: a summary is stored and logged as JSON. */
  weeks: { start: string; end: string; capBps: number; budget: string; fees: string; pot: string; traders: number; credited: string }[];
  /** The payments this run sent that landed. */
  paid: { signature: string; wallets: number; lamports: string }[];
  /** Wallets whose rebates are still under the minimum payout; they wait and grow. */
  belowMinimum: number;
  /** Payments sent and not yet seen to land; the next run settles them. */
  inFlight: number;
  problems: string[];
};

/**
 * One run, on the Fee Collector's schedule, right after it and the Creator Forward: settles the payments an earlier run
 * left in flight, then every Rebate Week that has ended and is not settled yet, the oldest first, then pays every
 * wallet whose waiting rebates reach the minimum, at most `maxWallets` of them. A week is over once both the wall clock
 * and the chain's, which dates every trade, have passed its end. A payment that fails does not stop the others; the
 * run then fails with its summary, for the operator.
 */
export async function runRebates({ db, cfg, operations, now = new Date() }: RebateDeps, maxWallets = 400): Promise<RebatesSummary> {
  const connection = new Connection(cfg.rpcUrl, "confirmed");
  const ops = operations.publicKey;
  const summary: RebatesSummary = { settled: [], weeks: [], paid: [], belowMinimum: 0, inFlight: 0, problems: [] };

  summary.settled = await settlePayments(db, connection, ops);

  const chainTime = await connection.getBlockTime(await connection.getSlot("confirmed"));
  const clock = new Date(Math.min(now.getTime(), (chainTime ?? Math.floor(now.getTime() / 1000)) * 1000));
  const weekMs = cfg.rebateWeekSeconds * 1000;
  const spans = earningSpans(split(await budgetVersions(db), clock).inEffect);
  const [latest] = await db.select({ start: rebateWeeks.weekStart }).from(rebateWeeks).orderBy(desc(rebateWeeks.weekStart)).limit(1);
  const excluded = platformWallets(cfg, ops);
  for (const index of dueWeeks(spans, latest ? weekIndex(latest.start.getTime(), weekMs) : null, clock.getTime(), weekMs, WEEKS_PER_RUN)) {
    const plan = await planWeek(db, excluded, spans, index, weekMs, await weekBudget(db, clock));
    // A rebate of nothing is not written: a week the row had no budget for gives none.
    const given = plan.shares.filter((s) => s.amount > 0n);
    const credited = given.reduce((sum, s) => sum + s.amount, 0n);
    // The week and its rebates are one write: a week is never on record without what it gave, or the other way round.
    await db.transaction(async (tx) => {
      await tx.insert(rebateWeeks).values({
        weekStart: plan.start, weekEnd: plan.end, capBps: plan.capBps, budget: plan.budget.toString(), fees: plan.fees.toString(), pot: plan.pot.toString(),
        traders: given.length, credited: credited.toString(),
      });
      for (let i = 0; i < given.length; i += INSERT_CHUNK)
        await tx.insert(rebates).values(
          given.slice(i, i + INSERT_CHUNK).map((s) => ({ weekStart: plan.start, wallet: s.wallet, fees: s.fees.toString(), amount: s.amount.toString() })),
        );
    });
    summary.weeks.push({
      start: plan.start.toISOString(), end: plan.end.toISOString(), capBps: plan.capBps, budget: plan.budget.toString(), fees: plan.fees.toString(),
      pot: plan.pot.toString(), traders: given.length, credited: credited.toString(),
    });
  }

  await payWaiting(db, cfg, connection, operations, maxWallets, summary);

  const [tally] = await db
    .select({
      below: sql<number>`(count(distinct ${rebates.wallet}) filter (where ${rebates.status} = 'waiting'))::int`,
      flying: sql<number>`(count(distinct ${rebates.signature}) filter (where ${rebates.status} = 'sending'))::int`,
    })
    .from(rebates)
    .where(inArray(rebates.status, ["waiting", "sending"]));
  summary.belowMinimum = tally!.below;
  summary.inFlight = tally!.flying;
  if (summary.problems.length) throw new JobFailure(summary.problems.join("; "), summary);
  return summary;
}

type Due = { wallet: string; amount: bigint };

/**
 * Pays every wallet whose waiting rebates together reach the minimum payout, the largest first, a few per transaction.
 * The wallet's waiting rebates are claimed with the transaction's signature before it goes out, so a run that dies
 * here leaves nothing the next one could pay twice. A batch the node refuses is sent again wallet by wallet, so that
 * one wallet that cannot be paid never holds up the others.
 */
async function payWaiting(db: Db, cfg: Config, connection: Connection, operations: Keypair, maxWallets: number, summary: RebatesSummary) {
  const total = sql<string>`sum(${rebates.amount})`;
  const due: Due[] = (
    await db
      .select({ wallet: rebates.wallet, amount: sql<string>`${total}::text` })
      .from(rebates)
      .where(eq(rebates.status, "waiting"))
      .groupBy(rebates.wallet)
      .having(sql`${total} >= ${cfg.rebateMinLamports.toString()}::numeric`)
      .orderBy(desc(total), asc(rebates.wallet))
      .limit(maxWallets)
  ).map((d) => ({ wallet: d.wallet, amount: BigInt(d.amount) }));
  if (!due.length) return;
  // A row's budget is counted in SOL at the latest prices, and revenue that arrived in other assets is not SOL in the
  // wallet: what it cannot pay now waits, and the operator hears of it.
  let spendable = BigInt(await connection.getBalance(operations.publicKey, "confirmed")) - FEE_RESERVE_LAMPORTS;
  for (let i = 0; i < due.length; i += PAYMENT_BATCH) {
    const batch = due.slice(i, i + PAYMENT_BATCH).sort((a, b) => a.wallet.localeCompare(b.wallet));
    const lamports = batch.reduce((sum, d) => sum + d.amount, 0n);
    if (lamports > spendable) {
      summary.problems.push(`the operations wallet holds too little SOL to pay ${due.length - i} wallets their rebates: ${spendable > 0n ? spendable : 0n} lamports to spend`);
      return;
    }
    spendable -= lamports;
    await payBatch(db, connection, operations, batch, summary);
  }
}

async function payBatch(db: Db, connection: Connection, operations: Keypair, batch: Due[], summary: RebatesSummary) {
  const ops = operations.publicKey;
  const wallets = batch.map((d) => d.wallet);
  const tx = await signedTransaction(
    connection, operations, batch.map((d) => SystemProgram.transfer({ fromPubkey: ops, toPubkey: new PublicKey(d.wallet), lamports: d.amount })),
  );
  const carried = eq(rebates.signature, tx.signature);
  const release = () => db.update(rebates).set({ status: "waiting", signature: null, sendableUntil: null }).where(and(carried, eq(rebates.status, "sending")));
  const claimed = await db
    .update(rebates)
    .set({ status: "sending", signature: tx.signature, sendableUntil: tx.lastValidBlockHeight })
    .where(and(eq(rebates.status, "waiting"), inArray(rebates.wallet, wallets)))
    .returning({ wallet: rebates.wallet, amount: rebates.amount });
  // The transaction was signed for what was waiting a moment ago; it goes out only if that is exactly what it claimed.
  const claimedOf = new Map<string, bigint>();
  for (const c of claimed) claimedOf.set(c.wallet, (claimedOf.get(c.wallet) ?? 0n) + BigInt(c.amount));
  if (batch.some((d) => claimedOf.get(d.wallet) !== d.amount)) {
    await release();
    throw new Error("another run is paying rebates");
  }
  try {
    await connection.sendRawTransaction(tx.serialized, { preflightCommitment: "confirmed" });
  } catch (e) {
    // Only a transaction the node refused is known not to have gone out. Anything else may still land, so its rebates
    // stay in flight for the next run to settle.
    if (!(e instanceof SendTransactionError)) throw e;
    await release();
    if (batch.length > 1) for (const one of batch) await payBatch(db, connection, operations, [one], summary);
    else summary.problems.push(`rebate of ${batch[0]!.amount} lamports to ${batch[0]!.wallet} was refused: ${e.message}`);
    return;
  }
  for (;;) {
    const { value: [status] } = await connection.getSignatureStatuses([tx.signature]);
    if (status?.err) {
      await release();
      summary.problems.push(`rebate payment ${tx.signature} failed on-chain: ${JSON.stringify(status.err)}`);
      return;
    }
    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") break;
    // Still unseen past its last block: the next run settles it, as landed or as expired.
    if ((await connection.getBlockHeight("confirmed")) > tx.lastValidBlockHeight) return;
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  const paid = await markPaid(db, connection, ops, tx.signature);
  if (paid) summary.paid.push({ signature: tx.signature, wallets: paid.wallets, lamports: paid.lamports.toString() });
}

/**
 * Records a landed payment: one `rebate` Ledger entry per wallet it paid, in the order of its transfers, then its
 * rebates marked paid. The entries first: a run that dies between the two finds the rebates still in flight and redoes
 * both, the entries already there. Until the node serves the transaction nothing is written and they stay in flight.
 */
async function markPaid(db: Db, connection: Connection, ops: PublicKey, signature: string) {
  let raw = null;
  for (let i = 0; i < LANDED_READS && !raw; i++) {
    raw = await fetchRawTransaction(connection.rpcEndpoint, signature);
    if (!raw) await new Promise((r) => setTimeout(r, POLL_MS));
  }
  if (!raw) return null;
  // The Ledger is append-only, so nothing goes on it that the transaction itself contradicts.
  if (raw.meta?.err) throw new Error(`rebate payment ${signature} is reported landed, but carries an error: ${JSON.stringify(raw.meta.err)}`);
  const carried = and(eq(rebates.signature, signature), eq(rebates.status, "sending"));
  const sent = await db
    .select({ wallet: rebates.wallet, amount: sql<string>`sum(${rebates.amount})::text` })
    .from(rebates)
    .where(carried)
    .groupBy(rebates.wallet)
    .orderBy(asc(rebates.wallet));
  if (!sent.length) return null;
  const paidAt = new Date((raw.blockTime ?? Math.floor(Date.now() / 1000)) * 1000);
  await db
    .insert(ledgerEntries)
    .values(
      sent.map((s, eventIndex) => ({
        signature, eventIndex, kind: REBATE_KIND, assetMint: WSOL, assetDecimals: 9, amount: s.amount, source: ops.toBase58(), destination: s.wallet,
        launchMint: null, slot: raw.slot, blockTime: paidAt,
      })),
    )
    .onConflictDoNothing();
  await db.update(rebates).set({ status: "paid", paidAt }).where(carried);
  return { wallets: sent.length, lamports: sent.reduce((sum, s) => sum + BigInt(s.amount), 0n) };
}

/** Payments sent by earlier runs: a landed one is recorded, a failed or expired one puts its rebates back to waiting. */
async function settlePayments(db: Db, connection: Connection, ops: PublicKey) {
  const inFlight = await db
    .select({ signature: rebates.signature, sendableUntil: rebates.sendableUntil })
    .from(rebates)
    .where(and(eq(rebates.status, "sending"), isNotNull(rebates.signature)))
    .groupBy(rebates.signature, rebates.sendableUntil);
  const out: RebatesSummary["settled"] = [];
  if (!inFlight.length) return out;
  const height = await connection.getBlockHeight("confirmed");
  for (const f of inFlight) {
    const signature = f.signature!;
    const { value: [status] } = await connection.getSignatureStatuses([signature], { searchTransactionHistory: true });
    if (status && !status.err && (status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized")) {
      if (await markPaid(db, connection, ops, signature)) out.push({ signature, outcome: "paid" });
    } else if (status?.err || (!status && f.sendableUntil !== null && height > f.sendableUntil)) {
      await db.update(rebates).set({ status: "waiting", signature: null, sendableUntil: null }).where(and(eq(rebates.signature, signature), eq(rebates.status, "sending")));
      out.push({ signature, outcome: "returned" });
    }
  }
  return out;
}
