import { Hono } from "hono";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { WSOL_MINT } from "@launchpad/chain";
import {
  JobName, LedgerQuery, type JobRunList, type LedgerKind, type LedgerPage, type Revenue, type RevenueStreams,
} from "@launchpad/contract";
import { jobRuns, jobTransactions, launches, ledgerEntries } from "@launchpad/db";
import { operationsKey, type AppEnv } from "../env";
import { creatorMoney, unforwarded } from "../fees/creatorShares";
import { revenueAssets } from "../fees/ledger";
import { toJobRun } from "../jobs";

/** Platform revenue in public: the Ledger, and totals per asset and per day. Every figure is a sum of Ledger entries. */
export const revenueRoutes = new Hono<AppEnv>();

const WSOL = WSOL_MINT.toBase58();
const REVENUE_DAYS = 30;

type StreamSums = { platform_fee?: bigint; pool_fee?: bigint; fee_key?: bigint };

function streams(s: StreamSums): RevenueStreams {
  const platformFee = s.platform_fee ?? 0n;
  const poolFee = s.pool_fee ?? 0n;
  const feeKey = s.fee_key ?? 0n;
  return { platformFee: platformFee.toString(), poolFee: poolFee.toString(), feeKey: feeKey.toString(), total: (platformFee + poolFee + feeKey).toString() };
}

revenueRoutes.get("/revenue", async (c) => {
  const db = c.get("db");
  const cfg = c.get("cfg");
  const [totals, daily, creators] = await Promise.all([
    db
      .select({ mint: ledgerEntries.assetMint, decimals: sql<number>`max(${ledgerEntries.assetDecimals})`, kind: ledgerEntries.kind, amount: sql<string>`sum(${ledgerEntries.amount})::text` })
      .from(ledgerEntries)
      .groupBy(ledgerEntries.assetMint, ledgerEntries.kind),
    db.execute<{ day: string; mint: string; decimals: number; kind: string; amount: string }>(sql`
      with daily as (
        select to_char(${ledgerEntries.blockTime} at time zone 'UTC', 'YYYY-MM-DD') as day, ${ledgerEntries.assetMint} as mint,
          max(${ledgerEntries.assetDecimals}) as decimals, ${ledgerEntries.kind} as kind, sum(${ledgerEntries.amount})::text as amount
        from ${ledgerEntries}
        where ${ledgerEntries.kind} <> 'sweep'
        group by 1, 2, 4
      )
      select * from daily where day in (select distinct day from daily order by day desc limit ${REVENUE_DAYS})`),
    creatorMoney(db),
  ]);
  const asset = await revenueAssets(db, cfg.publicApiUrl, new Map([...totals, ...daily].map((r) => [r.mint, Number(r.decimals)])));

  const byAsset = new Map<string, StreamSums & { sweep?: bigint; creator_forward?: bigint }>();
  for (const r of totals) byAsset.set(r.mint, { ...byAsset.get(r.mint), [r.kind]: BigInt(r.amount) });
  const collected = (s: StreamSums) => (s.platform_fee ?? 0n) + (s.pool_fee ?? 0n) + (s.fee_key ?? 0n);
  // SOL first, then by ticker: amounts in different assets don't compare.
  const label = (mint: string) => asset(mint).symbol ?? mint;
  const order = ([a]: [string, StreamSums], [b]: [string, StreamSums]) =>
    Number(b === WSOL) - Number(a === WSOL) || label(a).localeCompare(label(b), "en", { sensitivity: "base" }) || a.localeCompare(b);

  const days = new Map<string, Map<string, StreamSums>>();
  for (const r of daily) {
    const day = days.get(r.day) ?? new Map<string, StreamSums>();
    day.set(r.mint, { ...day.get(r.mint), [r.kind]: BigInt(r.amount) });
    days.set(r.day, day);
  }

  const ops = operationsKey(c.env).publicKey;
  const res: Revenue = {
    operationsWallet: ops.toBase58(),
    treasury: cfg.treasury?.toBase58() ?? null,
    sweepThresholdLamports: cfg.sweepThresholdLamports.toString(),
    sweepFloatLamports: cfg.sweepFloatLamports.toString(),
    totals: [...byAsset.entries()]
      .filter(([, s]) => collected(s) > 0n)
      .sort(order)
      .map(([mint, s]) => ({
        asset: asset(mint), ...streams(s), swept: (s.sweep ?? 0n).toString(),
        creatorForwarded: (s.creator_forward ?? 0n).toString(), creatorPending: unforwarded(creators, mint).toString(),
      })),
    days: [...days.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([day, assets]) => ({ day, assets: [...assets.entries()].sort(order).map(([mint, s]) => ({ asset: asset(mint), ...streams(s) })) })),
  };
  return c.json(res);
});

revenueRoutes.get("/ledger", async (c) => {
  const q = LedgerQuery.safeParse(c.req.query());
  if (!q.success) return c.json({ error: "invalid ledger query", details: q.error.issues }, 400);
  const { limit, before, kind } = q.data;
  const db = c.get("db");
  const [slot, signature, index] = before?.split(".") ?? [];
  const rows = await db
    .select({ e: ledgerEntries, symbol: launches.symbol, name: launches.name })
    .from(ledgerEntries)
    .leftJoin(launches, eq(launches.mint, ledgerEntries.launchMint))
    .where(sql`true
      ${kind ? sql`and ${ledgerEntries.kind} = ${kind}` : sql``}
      ${before ? sql`and (${ledgerEntries.slot}, ${ledgerEntries.signature}, ${ledgerEntries.eventIndex}) < (${Number(slot)}, ${signature}, ${Number(index)})` : sql``}`)
    .orderBy(desc(ledgerEntries.slot), desc(ledgerEntries.signature), desc(ledgerEntries.eventIndex))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const asset = await revenueAssets(db, c.get("cfg").publicApiUrl, new Map(page.map((r) => [r.e.assetMint, r.e.assetDecimals])));
  const last = page.at(-1)?.e;
  const res: LedgerPage = {
    entries: page.map(({ e, symbol, name }) => ({
      signature: e.signature,
      index: e.eventIndex,
      kind: e.kind as LedgerKind,
      asset: asset(e.assetMint),
      amount: e.amount,
      source: e.source,
      destination: e.destination,
      launch: e.launchMint && symbol !== null && name !== null ? { mint: e.launchMint, symbol, name } : null,
      slot: e.slot,
      time: e.blockTime.toISOString(),
    })),
    next: rows.length > limit && last ? `${last.slot}.${last.signature}.${last.eventIndex}` : null,
  };
  return c.json(res);
});

/** Operator: recent runs of the scheduled jobs, and any transaction a job sent that has not settled yet. */
export const operatorJobRoutes = new Hono<AppEnv>();

operatorJobRoutes.get("/jobs", async (c) => {
  const job = c.req.query("job");
  const name = job === undefined ? null : JobName.safeParse(job);
  if (name && !name.success) return c.json({ error: "unknown job" }, 400);
  const db = c.get("db");
  const [runs, pending] = await Promise.all([
    db
      .select()
      .from(jobRuns)
      .where(name?.success ? eq(jobRuns.job, name.data) : undefined)
      .orderBy(desc(jobRuns.startedAt))
      .limit(100),
    db.select().from(jobTransactions).where(inArray(jobTransactions.status, ["pending"])).orderBy(desc(jobTransactions.createdAt)),
  ]);
  const res: JobRunList = {
    runs: runs.map(toJobRun),
    pending: pending.map((p) => ({ signature: p.signature, job: p.job, purpose: p.purpose, subject: p.subject, createdAt: p.createdAt.toISOString() })),
  };
  return c.json(res);
});
