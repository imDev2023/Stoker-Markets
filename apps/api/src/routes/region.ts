import { Hono } from "hono";
import { RegionGatesView, type Region } from "@launchpad/contract";
import type { AppEnv } from "../env";
import { regionGates, regionOf, saveRegionGates, visitorCountry } from "../region";

/** The region gate as the visitor sees it (#131): asked from the browser, so the edge reads the visitor's own address. */
export const regionRoutes = new Hono<AppEnv>();

regionRoutes.get("/region", async (c) => {
  const res: Region = regionOf(visitorCountry(c.req.raw, c.get("cfg")), await regionGates(c.get("db")));
  // One visitor's answer, never a shared cache's: the next visitor is somewhere else.
  return c.json(res, 200, { "cache-control": "private, no-store" });
});

/** The table behind it, read and replaced whole by the operator. */
export const operatorRegionRoutes = new Hono<AppEnv>();

operatorRegionRoutes.get("/region-gates", async (c) => {
  const res: RegionGatesView = { gates: await regionGates(c.get("db")) };
  return c.json(res);
});

operatorRegionRoutes.put("/region-gates", async (c) => {
  const body = RegionGatesView.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "invalid region gates", details: body.error.issues }, 400);
  const res: RegionGatesView = { gates: await saveRegionGates(c.get("db"), body.data.gates) };
  return c.json(res);
});
