import { Hono } from "hono";
import { AnnounceCreatorLadder } from "@launchpad/contract";
import type { AppEnv } from "../env";
import { announceLadder, ladderPage, ladderVersion, ladderVersions } from "../fees/ladder";

/** The Creator Ladder's versions, public (ADR 0020): with the Ledger and a coin's recorded tiers, enough to redo any Creator's share. */
export const ladderRoutes = new Hono<AppEnv>();

ladderRoutes.get("/creator-ladder", async (c) => c.json(await ladderPage(c.get("db"))));

/**
 * Operator: announces the next version of the Creator Ladder. Its shares and its Active Days must climb, and it takes
 * effect no sooner than a fee change's lead time after the announcement and later than every earlier version, so what
 * a Creator is paid never moves unannounced and the versions are one line in time. A coin keeps every tier it has
 * already been recorded on, whatever the new version asks.
 */
export const operatorLadderRoutes = new Hono<AppEnv>();

operatorLadderRoutes.post("/creator-ladder", async (c) => {
  const body = AnnounceCreatorLadder.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "invalid creator ladder", details: body.error.issues }, 400);
  const db = c.get("db");
  const lead = c.get("cfg").feeChangeLeadSeconds;
  const now = new Date();
  const effectiveAt = new Date(body.data.effectiveAt);
  if (effectiveAt.getTime() < now.getTime() + lead * 1000)
    return c.json({ error: `A Creator Ladder takes effect no sooner than ${lead} seconds after it is announced, like a fee change.` }, 422);
  const latest = (await ladderVersions(db)).at(-1)!;
  if (effectiveAt.getTime() <= latest.effectiveAt.getTime())
    return c.json({ error: `Version ${latest.version} takes effect at ${latest.effectiveAt.toISOString()}; the next must take effect after it.` }, 422);
  return c.json(ladderVersion(await announceLadder(db, body.data, effectiveAt, now)), 201);
});
