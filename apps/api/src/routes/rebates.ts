import { Hono } from "hono";
import { PublicKey } from "@solana/web3.js";
import { desc, eq, inArray, sql } from "drizzle-orm";
import type { RebatesPage, WalletRebates } from "@launchpad/contract";
import { rebates, rebateWeeks } from "@launchpad/db";
import { operationsKey, type AppEnv } from "../env";
import { budgets, budgetVersions, split } from "../fees/budget";
import { currentWeek } from "../rebates/engine";
import { rebatesOwed } from "../rebates/owed";

/** How many settled weeks, and how many of a wallet's rebates, a page carries: the latest. */
const PAGE = 52;

/** Volume rebates, public (ADR 0021): the program, the settled Rebate Weeks, and what any wallet has earned back. */
export const rebateRoutes = new Hono<AppEnv>();

rebateRoutes.get("/rebates", async (c) => {
  const db = c.get("db");
  const cfg = c.get("cfg");
  const now = new Date();
  const [{ inForce, upcoming }, row, owed, current, weeks, paid] = [
    split(await budgetVersions(db), now),
    (await budgets(db, now)).rows.rebates,
    await rebatesOwed(db),
    await currentWeek(db, cfg, operationsKey(c.env).publicKey, now),
    await db.select().from(rebateWeeks).orderBy(desc(rebateWeeks.weekStart)).limit(PAGE),
    await db
      .select({ weekStart: rebates.weekStart, lamports: sql<string>`sum(${rebates.amount})::text` })
      .from(rebates)
      .where(eq(rebates.status, "paid"))
      .groupBy(rebates.weekStart),
  ];
  const paidOf = new Map(paid.map((p) => [p.weekStart.getTime(), p.lamports]));
  const next = upcoming.find((t) => t.rebatesBps !== inForce.rebatesBps);
  const res: RebatesPage = {
    program: {
      shareBps: inForce.rebatesBps,
      upcoming: next ? { shareBps: next.rebatesBps, effectiveAt: next.effectiveAt.toISOString() } : null,
      weekSeconds: cfg.rebateWeekSeconds,
      minPayoutLamports: cfg.rebateMinLamports.toString(),
      current: current && {
        start: current.start.toISOString(), end: current.end.toISOString(), capBps: current.capBps, budgetLamports: current.budget.toString(),
        feesLamports: current.fees.toString(), potLamports: current.pot.toString(),
      },
      paidLamports: row.spent.toString(),
      waitingLamports: owed.toString(),
    },
    weeks: weeks.map((w) => ({
      start: w.weekStart.toISOString(), end: w.weekEnd.toISOString(), capBps: w.capBps, budgetLamports: w.budget, feesLamports: w.fees, potLamports: w.pot,
      traders: w.traders, creditedLamports: w.credited, paidLamports: paidOf.get(w.weekStart.getTime()) ?? "0", settledAt: w.settledAt.toISOString(),
    })),
  };
  return c.json(res);
});

rebateRoutes.get("/wallets/:address/rebates", async (c) => {
  const address = c.req.param("address");
  try {
    new PublicKey(address);
  } catch {
    return c.json({ error: "not a wallet address" }, 400);
  }
  const db = c.get("db");
  const [totals] = await db
    .select({
      waiting: sql<string>`coalesce(sum(${rebates.amount}) filter (where ${rebates.status} in ('waiting', 'sending')), 0)::text`,
      paid: sql<string>`coalesce(sum(${rebates.amount}) filter (where ${rebates.status} = 'paid'), 0)::text`,
    })
    .from(rebates)
    .where(eq(rebates.wallet, address));
  const mine = await db.select().from(rebates).where(eq(rebates.wallet, address)).orderBy(desc(rebates.weekStart)).limit(PAGE);
  const ends = mine.length
    ? await db.select({ start: rebateWeeks.weekStart, end: rebateWeeks.weekEnd }).from(rebateWeeks).where(inArray(rebateWeeks.weekStart, mine.map((r) => r.weekStart)))
    : [];
  const endOf = new Map(ends.map((w) => [w.start.getTime(), w.end]));
  const current = await currentWeek(db, c.get("cfg"), operationsKey(c.env).publicKey);
  const share = current?.shares.find((s) => s.wallet === address);
  const res: WalletRebates = {
    wallet: address,
    waitingLamports: totals!.waiting,
    paidLamports: totals!.paid,
    current: current && { feesLamports: (share?.fees ?? 0n).toString(), estimateLamports: (share?.amount ?? 0n).toString() },
    rebates: mine.map((r) => ({
      weekStart: r.weekStart.toISOString(), weekEnd: endOf.get(r.weekStart.getTime())!.toISOString(), feesLamports: r.fees, amountLamports: r.amount,
      status: r.status, signature: r.signature, paidAt: r.paidAt?.toISOString() ?? null,
    })),
  };
  return c.json(res);
});
