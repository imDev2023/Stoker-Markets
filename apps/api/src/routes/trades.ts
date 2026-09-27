import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { Connection, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { desc, eq, sql } from "drizzle-orm";
import { curvePrice, loadCurve, minAmountOut, prepareTrade, quoteTrade } from "@launchpad/chain";
import {
  CandleInterval, PrepareTradeRequest, TradeQuoteQuery, type CandleList, type CurveProgress, type PreparedTrade, type TradeList,
  type TradeQuote,
} from "@launchpad/contract";
import { curves, launches, trades, type Db } from "@launchpad/db";
import type { AppEnv, Config } from "../env";

/** Trading on a Launch's curve: quotes and unsigned trade transactions (ADR 0003), plus the indexed trade history and candles. */
export const tradeRoutes = new Hono<AppEnv>();

/** A quote at the curve's current state, for showing what a trade would do before the trader commits. */
tradeRoutes.get("/launches/:mint/quote", async (c) => {
  const query = TradeQuoteQuery.safeParse(c.req.query());
  if (!query.success) return c.json({ error: "invalid quote request", details: query.error.issues }, 400);
  const { quote } = await quoteOnCurve(c.get("db"), c.get("cfg"), c.req.param("mint"), query.data);
  return c.json(quote);
});

/** The trade transaction for the trader's wallet to sign, with the quote it was built from. */
tradeRoutes.post("/trades/prepare", async (c) => {
  const body = PrepareTradeRequest.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "invalid trade request", details: body.error.issues }, 400);
  const cfg = c.get("cfg");
  const { connection, curve, quote } = await quoteOnCurve(c.get("db"), cfg, body.data.mint, body.data);
  const prepared = await prepareTrade(connection, {
    program: cfg.launchlab,
    curve,
    trader: new PublicKey(body.data.trader),
    side: quote.side,
    amountIn: new BN(quote.amountIn),
    minAmountOut: new BN(quote.minAmountOut),
  });
  const res: PreparedTrade = { ...prepared, quote };
  return c.json(res);
});

tradeRoutes.get("/launches/:mint/trades", async (c) => {
  const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 50) || 50, 1), 100);
  const rows = await c
    .get("db")
    .select()
    .from(trades)
    .where(eq(trades.mint, c.req.param("mint")))
    .orderBy(desc(trades.slot), desc(trades.signature), desc(trades.eventIndex))
    .limit(limit);
  const res: TradeList = {
    trades: rows.map((t) => ({
      signature: t.signature,
      trader: t.trader,
      side: t.side,
      baseAmount: t.baseAmount,
      quoteAmount: t.quoteAmount,
      fees: { raydium: t.protocolFee, platform: t.platformFee, creator: t.creatorFee },
      price: t.priceAfter,
      time: t.blockTime.toISOString(),
    })),
  };
  return c.json(res);
});

const BUCKET: Record<CandleInterval, string> = {
  "1m": "1 minute", "5m": "5 minutes", "15m": "15 minutes", "1h": "1 hour", "4h": "4 hours", "1d": "1 day",
};
const MAX_CANDLES = 500;

/** Price candles built from indexed trades. Each opens at the price before its first trade, so candles join up. */
tradeRoutes.get("/launches/:mint/candles", async (c) => {
  const interval = CandleInterval.safeParse(c.req.query("interval") ?? "5m");
  if (!interval.success) return c.json({ error: "interval must be one of 1m, 5m, 15m, 1h, 4h, 1d" }, 400);
  // The bucket width comes from the fixed map above, never from the request, so it is safe to inline.
  const bucket = sql.raw(`date_bin(interval '${BUCKET[interval.data]}', block_time, timestamptz '1970-01-01 00:00:00+00')`);
  const rows = await c.get("db").execute<{ time: string; open: number; close: number; max: number; min: number; volume: string }>(sql`
    select extract(epoch from ${bucket})::bigint as time,
      (array_agg(price_before order by slot, signature, event_index))[1] as open,
      (array_agg(price_after order by slot desc, signature desc, event_index desc))[1] as close,
      max(price_after) as max,
      min(price_after) as min,
      sum(quote_amount)::text as volume
    from ${trades}
    where mint = ${c.req.param("mint")}
    group by ${bucket}
    order by ${bucket} desc
    limit ${MAX_CANDLES}`);
  const res: CandleList = {
    interval: interval.data,
    candles: [...rows].reverse().map((r) => ({
      time: Number(r.time),
      open: r.open,
      high: Math.max(r.open, r.max),
      low: Math.min(r.open, r.min),
      close: r.close,
      volume: r.volume,
    })),
  };
  return c.json(res);
});

/** Curve progress for a Launch summary; a Launch nobody has traded yet has raised nothing and has no traded price. */
export function curveProgress(row: typeof curves.$inferSelect | null): CurveProgress {
  return row ? { status: row.status, raised: row.realQuote, price: row.price } : { status: "live", raised: "0", price: null };
}

async function quoteOnCurve(db: Db, cfg: Config, mint: string, r: TradeQuoteQuery) {
  const [launch] = await db.select({ pool: launches.pool }).from(launches).where(eq(launches.mint, mint)).limit(1);
  if (!launch) throw new HTTPException(404, { message: "launch not found" });
  const connection = new Connection(cfg.rpcUrl, "confirmed");
  const curve = await loadCurve(connection, new PublicKey(launch.pool));
  if (!curve) throw new Error(`launch ${mint} has no curve account at ${launch.pool}`);
  if (curve.status !== "live") throw new HTTPException(409, { message: "this coin's curve has sold out, so it no longer trades on the curve" });
  const amount = new BN(r.amount);
  if (r.side === "sell" && amount.gt(curve.reserves.realBase)) throw new HTTPException(400, { message: "amount is more than the curve has sold" });
  const t = quoteTrade(curve.reserves, curve.rates, r.side, amount);
  if (t.amountOut.isZero()) throw new HTTPException(400, { message: "amount is too small to trade" });
  const quote: TradeQuote = {
    side: r.side,
    amountIn: t.amountIn.toString(),
    amountOut: t.amountOut.toString(),
    minAmountOut: minAmountOut(t.amountOut, r.slippageBps).toString(),
    slippageBps: r.slippageBps,
    fees: { raydium: t.fees.protocol.toString(), platform: t.fees.platform.toString(), creator: t.fees.creator.toString() },
    priceBefore: curvePrice(curve.reserves, curve.baseDecimals, curve.quoteDecimals),
    priceAfter: curvePrice(t.after, curve.baseDecimals, curve.quoteDecimals),
    completesCurve: t.after.realBase.eq(t.after.totalBaseSell),
  };
  return { connection, curve, quote };
}
