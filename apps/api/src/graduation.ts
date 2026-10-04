import { Connection, PublicKey } from "@solana/web3.js";
import { and, eq, isNull, sql } from "drizzle-orm";
import { loadCurve } from "@launchpad/chain";
import { curves, graduations, launches, operatorAlerts, type Db } from "@launchpad/db";
import type { Config } from "./env";
import { fetchRawTransaction, indexAccountHistory, indexTransactions } from "./indexer";

export type GraduationWatch = {
  /** Launches found migrated on-chain whose migration the Indexer had missed, now indexed. */
  recovered: string[];
  /** Launches newly alerted as stuck: sold out past the threshold with no migration. */
  alerted: string[];
  /** Pool trades of newly graduated Launches that the webhook had not delivered, now indexed from the pool's history. */
  backfilled: { mint: string; trades: number }[];
};

// How far back through a curve's transactions to look for a migration the webhook never delivered.
const BACKFILL_SIGNATURES = 50;

/**
 * The scheduled graduation watch. Raydium's crank migrates a sold-out curve within seconds, and only it can (we cannot
 * migrate our own curves), so a Launch still waiting past the threshold needs the operator. Before alerting, the chain
 * is asked: if the curve did migrate and only the webhook missed it, the migration is indexed instead.
 */
export async function watchGraduations(db: Db, cfg: Config, now = new Date()): Promise<GraduationWatch> {
  const cutoff = new Date(now.getTime() - cfg.graduationAlertAfterSeconds * 1000);
  const waiting = await db
    .select({ mint: launches.mint, curve: launches.pool, symbol: launches.symbol, completedAt: curves.completedAt, updatedAt: curves.updatedAt })
    .from(curves)
    .innerJoin(launches, eq(launches.mint, curves.mint))
    .leftJoin(graduations, eq(graduations.mint, curves.mint))
    .where(and(eq(curves.status, "graduating"), isNull(graduations.mint), sql`coalesce(${curves.completedAt}, ${curves.updatedAt}) < ${cutoff.toISOString()}::timestamptz`));

  const result: GraduationWatch = { recovered: [], alerted: [], backfilled: [] };
  const connection = new Connection(cfg.rpcUrl, "confirmed");
  await backfillPools(db, cfg, connection, now, result);
  if (waiting.length === 0) return result;
  for (const w of waiting) {
    const curve = await loadCurve(connection, new PublicKey(w.curve));
    if (curve?.status === "graduated" && (await backfillMigration(db, cfg, connection, w.curve))) {
      result.recovered.push(w.mint);
      continue;
    }
    const since = w.completedAt ?? w.updatedAt;
    const minutes = Math.max(1, Math.round((now.getTime() - since.getTime()) / 60_000));
    const message =
      curve?.status === "graduated"
        ? `${w.symbol} (${w.mint}) migrated on-chain but its migration could not be found to index. Check the Indexer.`
        : `${w.symbol} (${w.mint}) sold out its curve ${minutes} min ago and Raydium has not migrated it. Only Raydium's crank can; contact Raydium.`;
    const raised = await db
      .insert(operatorAlerts)
      .values({ kind: "graduation_stuck", subject: w.mint, message })
      .onConflictDoNothing()
      .returning({ subject: operatorAlerts.subject });
    if (raised.length > 0) result.alerted.push(w.mint);
  }
  await notifyPending(db, cfg);
  return result;
}

/**
 * Sends every open alert that has not reached the alert webhook yet; one that fails is tried again next run. An alert is
 * claimed (marked notified) before it is posted and released if the post fails, so two runs never post it twice.
 */
export async function notifyPending(db: Db, cfg: Config) {
  const pending = await db
    .select()
    .from(operatorAlerts)
    .where(and(isNull(operatorAlerts.notifiedAt), isNull(operatorAlerts.resolvedAt)));
  for (const a of pending) {
    const claimed = await db
      .update(operatorAlerts)
      .set({ notifiedAt: sql`now()` })
      .where(and(eq(operatorAlerts.kind, a.kind), eq(operatorAlerts.subject, a.subject), isNull(operatorAlerts.notifiedAt)))
      .returning({ subject: operatorAlerts.subject });
    if (claimed.length === 0) continue;
    if (await notify(cfg, a)) continue;
    await db
      .update(operatorAlerts)
      .set({ notifiedAt: null })
      .where(and(eq(operatorAlerts.kind, a.kind), eq(operatorAlerts.subject, a.subject)));
  }
}

/**
 * The pool backfill. A webhook takes minutes to start delivering a newly added address (a pool trade a minute after
 * Graduation never arrived on devnet), so until `POOL_BACKFILL_SECONDS` after a Graduation was indexed, every run reads
 * what the new pool did since the last pass and indexes it. The pass that finds the window over is the last: it closes
 * the backfill, and the pool's trades arrive through the webhook alone from then on. Indexing is idempotent, so a trade
 * the webhook did deliver is counted once.
 */
async function backfillPools(db: Db, cfg: Config, connection: Connection, now: Date, result: GraduationWatch) {
  const open = await db
    .select({ mint: graduations.mint, pool: graduations.pool, until: graduations.backfilledUntil, indexedAt: graduations.indexedAt })
    .from(graduations)
    .where(isNull(graduations.backfillClosedAt))
    .orderBy(graduations.slot);
  for (const g of open) {
    const last = now.getTime() - g.indexedAt.getTime() >= cfg.poolBackfillSeconds * 1000;
    const { newest, indexed, complete } = await indexAccountHistory(db, cfg, connection, new PublicKey(g.pool), g.until);
    // A pass cut short by a transaction the node could not serve yet leaves the backfill open for the next run.
    await db
      .update(graduations)
      .set({ backfilledUntil: newest, ...(last && complete ? { backfillClosedAt: now } : {}) })
      .where(eq(graduations.mint, g.mint));
    if (indexed.traded > 0) result.backfilled.push({ mint: g.mint, trades: indexed.traded });
  }
}

/** Looks through a curve's recent transactions for its migration and indexes it; true if the Launch is now graduated. */
async function backfillMigration(db: Db, cfg: Config, connection: Connection, curve: string) {
  const signatures = await connection.getSignaturesForAddress(new PublicKey(curve), { limit: BACKFILL_SIGNATURES }, "confirmed");
  for (const s of signatures) {
    if (s.err) continue;
    const raw = await fetchRawTransaction(cfg.rpcUrl, s.signature);
    if (raw && (await indexTransactions(db, cfg, [raw])).graduated > 0) return true;
  }
  return false;
}

/** An alert goes to the Worker's logs, and to the alert webhook when one is configured; true once it is delivered. */
async function notify(cfg: Config, alert: { kind: string; subject: string; message: string; raisedAt: Date }) {
  console.error(`operator alert: ${alert.message}`);
  if (!cfg.alertWebhookUrl) return true;
  const body = { kind: alert.kind, subject: alert.subject, message: alert.message, raisedAt: alert.raisedAt.toISOString() };
  const res = await fetch(cfg.alertWebhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    // `text` and `content` are what Slack-style and Discord webhooks display.
    body: JSON.stringify({ text: alert.message, content: alert.message, alert: body }),
  }).catch((e: Error) => e);
  if (res instanceof Error || !res.ok) {
    console.error(`operator alert webhook failed: ${res instanceof Error ? res.message : res.status}`);
    return false;
  }
  return true;
}
