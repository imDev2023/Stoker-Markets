import { Hono } from "hono";
import { AnnounceBudgetTable } from "@launchpad/contract";
import type { AppEnv } from "../env";
import { announceBudgetTable, budgetsPage, budgetVersions, tableVersion } from "../fees/budget";

/** The Budget Table's figures, public (ADR 0019): the Platform Net and what each row has been allotted, has spent and has left. */
export const budgetRoutes = new Hono<AppEnv>();

budgetRoutes.get("/budgets", async (c) => c.json(await budgetsPage(c.get("db"))));

/**
 * Operator: announces the next version of the Budget Table. Its shares must sum to 100%, and it takes effect no sooner
 * than a fee change's lead time after the announcement and later than every earlier version, so the division of the
 * platform's share never moves unannounced and the versions are one line in time.
 */
export const operatorBudgetRoutes = new Hono<AppEnv>();

operatorBudgetRoutes.post("/budget-table", async (c) => {
  const body = AnnounceBudgetTable.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "invalid budget table", details: body.error.issues }, 400);
  const db = c.get("db");
  const lead = c.get("cfg").feeChangeLeadSeconds;
  const now = new Date();
  const effectiveAt = new Date(body.data.effectiveAt);
  if (effectiveAt.getTime() < now.getTime() + lead * 1000)
    return c.json({ error: `A Budget Table takes effect no sooner than ${lead} seconds after it is announced, like a fee change.` }, 422);
  const latest = (await budgetVersions(db)).at(-1)!;
  if (effectiveAt.getTime() <= latest.effectiveAt.getTime())
    return c.json({ error: `Version ${latest.version} takes effect at ${latest.effectiveAt.toISOString()}; the next must take effect after it.` }, 422);
  return c.json(tableVersion(await announceBudgetTable(db, body.data.shares, effectiveAt, body.data.note ?? null, now)), 201);
});
