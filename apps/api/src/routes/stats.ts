import { Hono } from "hono";
import { count, eq, sql } from "drizzle-orm";
import type { PlatformStats } from "@launchpad/contract";
import { graduations, launches, quoteAssets, trades } from "@launchpad/db";
import type { AppEnv } from "../env";

/**
 * The platform's figures in one read (#133, the landing's strip): what has launched here since the first coin, how many
 * have graduated, and the last day's volume across every coin in SOL and USD at the Quote Registry's latest prices.
 * Every figure comes from what the Indexer wrote; the money figures (revenue, what Creators were paid, what was burned)
 * are the Ledger's and stay on `/revenue` and `/burns`.
 */
export const statsRoutes = new Hono<AppEnv>();

statsRoutes.get("/stats", async (c) => {
  const db = c.get("db");
  const [[all], [grad], [day]] = await Promise.all([
    db.select({ since: sql<Date | string | null>`min(${launches.createdAt})`, launches: count() }).from(launches),
    db.select({ graduated: count() }).from(graduations),
    db
      .select({
        trades: count(),
        sol: sql<number | string | null>`sum(${trades.quoteAmount}::double precision / power(10::double precision, ${quoteAssets.decimals}) * ${quoteAssets.priceSol}::double precision)`,
        usd: sql<number | string | null>`sum(${trades.quoteAmount}::double precision / power(10::double precision, ${quoteAssets.decimals}) * ${quoteAssets.priceUsd}::double precision)`,
      })
      .from(trades)
      .innerJoin(launches, eq(launches.mint, trades.mint))
      .innerJoin(quoteAssets, eq(quoteAssets.mint, launches.quoteMint))
      .where(sql`${trades.blockTime} > now() - interval '24 hours'`),
  ]);
  const since = all!.since;
  const res: PlatformStats = {
    since: since === null ? null : new Date(since).toISOString(),
    launches: all!.launches,
    graduated: grad!.graduated,
    // A day with no trades is a volume of zero, not an unknown; a traded asset without a price leaves the sum partial.
    volume24h: day!.trades === 0 ? { sol: 0, usd: 0 } : { sol: day!.sol === null ? null : Number(day!.sol), usd: day!.usd === null ? null : Number(day!.usd) },
  };
  return c.json(res);
});
