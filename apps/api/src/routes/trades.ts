import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { Connection, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { desc, eq, sql } from "drizzle-orm";
import {
  curvePrice, graduationPoolAddress, loadCurve, loadPool, minAmountOut, poolSides, preparePoolTrade, prepareRoutedBuy, prepareTrade,
  quotePoolTrade, quoteTrade, RATE_DENOMINATOR, routedLimits, splitSlippage, TransactionTooLargeError, transferFeeBps, WSOL_MINT,
  type PreparedTrade as ChainPreparedTrade, type RoutedMarket,
} from "@launchpad/chain";
import {
  CandleInterval, PrepareTradeRequest, TradeQuoteQuery, type CandleList, type CurveProgress, type PreparedTrade, type Referral, type TradeList,
  type TradeQuote, type TradeSide,
} from "@launchpad/contract";
import { curves, launches, quoteAssets, trades, type Db } from "@launchpad/db";
import { solRoutes, type AppEnv, type Bindings, type Config } from "../env";
import { referralShare } from "../quotes/assets";

/**
 * Trading a Launch's coin: quotes and unsigned trade transactions (ADR 0003), plus the indexed trade history and candles.
 * The same endpoints serve the curve before Graduation and the Raydium CPMM pool after.
 */
export const tradeRoutes = new Hono<AppEnv>();

/** A quote at the market's current state, for showing what a trade would do before the trader commits. */
tradeRoutes.get("/launches/:mint/quote", async (c) => {
  const query = TradeQuoteQuery.safeParse(c.req.query());
  if (!query.success) return c.json({ error: "invalid quote request", details: query.error.issues }, 400);
  const { quote } = await quoteMarket(c.env, c.get("db"), c.get("cfg"), c.req.param("mint"), query.data);
  return c.json(quote);
});

/** The trade transaction for the trader's wallet to sign, with the quote it was built from. */
tradeRoutes.post("/trades/prepare", async (c) => {
  const body = PrepareTradeRequest.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "invalid trade request", details: body.error.issues }, 400);
  const { quote, prepare } = await quoteMarket(c.env, c.get("db"), c.get("cfg"), body.data.mint, body.data);
  const res: PreparedTrade = { ...(await prepare(new PublicKey(body.data.trader))), quote };
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
      venue: t.venue,
      trader: t.trader,
      side: t.side,
      baseAmount: t.baseAmount,
      quoteAmount: t.quoteAmount,
      fees: { raydium: t.protocolFee, platform: t.platformFee, creator: t.creatorFee },
      price: t.priceAfter,
      time: t.blockTime.toISOString(),
      referral: t.referrer ? { referrer: t.referrer, fee: t.shareFee } : null,
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

/**
 * Curve progress for a Launch summary. A Launch nobody has traded yet has raised nothing and has no traded price; one
 * Raydium has migrated is graduated whatever the last indexed curve trade said.
 */
export function curveProgress(row: typeof curves.$inferSelect | null, graduated: boolean): CurveProgress {
  const status = graduated ? "graduated" : (row?.status ?? "live");
  return {
    status,
    raised: row?.realQuote ?? "0",
    price: row?.price ?? null,
    completedAt: status === "live" ? null : (row?.completedAt?.toISOString() ?? null),
  };
}

/** Basis points from a rate in the 1e6 denominator LaunchLab and CPMM share. */
const bps = (rate: BN) => (Number(rate.toString()) * 10_000) / RATE_DENOMINATOR;

/** A program-side limit as the wallet would see it: scaled by what the quote's full amount lost to its transfer fee. */
function walletSide(limit: BN, programAmount: BN, walletAmount: BN) {
  return programAmount.isZero() || programAmount.eq(walletAmount) ? limit : limit.mul(walletAmount).div(programAmount);
}

const feeBps = (fee: { bps: number } | null) => fee?.bps ?? 0;

type Market = { quote: TradeQuote; prepare: (trader: PublicKey) => Promise<ChainPreparedTrade> };

/** A trade priced where the coin trades now, before any slippage limit is put on it. */
type VenueQuote = {
  priced: Omit<TradeQuote, "minAmountOut" | "slippageBps" | "route">;
  /** The figure the program checks the slippage limit against: what the trader actually receives, on the curve and in the pool alike. */
  limitFrom: BN;
  /** Builds the trade on its own, paid from and to the trader's wallet. */
  prepare: (trader: PublicKey, amountIn: BN, minAmountOut: BN) => Promise<ChainPreparedTrade>;
};

/** The referral a quote was asked for with, resolved against where the coin trades: the rate the trade pays, if any. */
type ReferralPlan = { referrer: PublicKey; rate: BN; referral: Referral };

/** Where the coin trades now, able to price a trade of any size there. */
type Venue = {
  market: RoutedMarket;
  quoteMint: PublicKey;
  quoteTokenProgram: PublicKey;
  /** What a referral would pay here: the share fee applies on the curve, where the Quote Asset's GlobalConfig allows one. */
  referral: (referrer: PublicKey) => ReferralPlan;
  price: (side: TradeSide, amount: BN, referral: ReferralPlan | null) => VenueQuote;
};

/**
 * Prices a trade where the coin trades now, read from the chain rather than the index so a lagging webhook never sends
 * a trade to the wrong place: the curve while it is live, the Raydium CPMM pool once Raydium has migrated it. A buy paid
 * with SOL on a Launch paired with anything else goes through the SOL route first.
 */
async function quoteMarket(env: Bindings, db: Db, cfg: Config, mint: string, r: TradeQuoteQuery): Promise<Market> {
  const [launch] = await db
    .select({ pool: launches.pool, quoteSymbol: quoteAssets.symbol })
    .from(launches)
    .leftJoin(quoteAssets, eq(quoteAssets.mint, launches.quoteMint))
    .where(eq(launches.mint, mint))
    .limit(1);
  if (!launch) throw new HTTPException(404, { message: "launch not found" });
  const connection = new Connection(cfg.rpcUrl, "confirmed");
  const symbol = launch.quoteSymbol ?? `${launch.pool.slice(0, 4)}...`;
  const venue = await venueOf(connection, cfg, mint, new PublicKey(launch.pool), symbol);
  const amount = new BN(r.amount);
  const referral = r.referrer ? venue.referral(new PublicKey(r.referrer)) : null;

  if (r.payWith === "sol" && r.side === "sell")
    throw new HTTPException(400, { message: "Only a buy can be paid with SOL; a sell pays out the coin's Quote Asset." });
  if (r.payWith === "sol" && !venue.quoteMint.equals(WSOL_MINT)) return routedMarket(connection, env, cfg, venue, symbol, amount, r.slippageBps, referral);

  const { priced, limitFrom, prepare } = venue.price(r.side, amount, referral);
  const limit = minAmountOut(limitFrom, r.slippageBps);
  const quote: TradeQuote = {
    ...priced,
    // Shown as what reaches the wallet at that limit, which is the limit itself less any transfer fee on it.
    minAmountOut: walletSide(limit, limitFrom, new BN(priced.amountOut)).toString(),
    slippageBps: r.slippageBps,
    route: null,
  };
  return { quote, prepare: (trader) => prepare(trader, new BN(quote.amountIn), limit) };
}

/** A referral as a quote reports it, and the rate the trade pays, when it applies. */
function referralPlan(cfg: Config, referrer: PublicKey, maxShareFeeRate: BN, reason: string | null): ReferralPlan {
  const share = reason ? { allowed: false, bps: 0 } : referralShare(cfg, maxShareFeeRate.toNumber());
  const rate = new BN(share.allowed ? (share.bps * RATE_DENOMINATOR) / 10_000 : 0);
  return {
    referrer,
    rate,
    referral: { referrer: referrer.toBase58(), applies: share.allowed, bps: share.bps, fee: "0", reason: share.allowed ? null : reason },
  };
}

async function venueOf(connection: Connection, cfg: Config, mint: string, curveAddress: PublicKey, quoteSymbol: string): Promise<Venue> {
  const curve = await loadCurve(connection, curveAddress);
  if (!curve) throw new Error(`launch ${mint} has no curve account at ${curveAddress.toBase58()}`);

  if (curve.status === "graduating")
    throw new HTTPException(409, {
      message: "This coin's curve has sold out and Raydium is moving it to its pool. Trading opens there in a few seconds.",
    });

  if (curve.status === "graduated") {
    const pool = await loadPool(connection, await graduationPoolAddress(connection, cfg.cpmm, curve));
    if (!pool) throw new Error(`launch ${mint} is migrated but has no pool`);
    if (!pool.swapEnabled) throw new HTTPException(409, { message: "Raydium has paused trading in this coin's pool." });
    if (pool.chainTime < pool.openTime) throw new HTTPException(409, { message: "This coin's pool opens in a moment. Try again in a few seconds." });
    const { quote } = poolSides(pool, curve.baseMint);
    return {
      market: { venue: "pool", cpmm: cfg.cpmm, pool, baseMint: curve.baseMint, baseTokenProgram: curve.baseTokenProgram },
      quoteMint: quote.mint,
      quoteTokenProgram: quote.program,
      referral: (referrer) => referralPlan(cfg, referrer, new BN(0), "This coin trades in its Raydium pool now, which pays no referral fee."),
      price: (side, amount, referral) => {
        const t = quotePoolTrade(pool, curve.baseMint, side, amount);
        if (t.amountOut.isZero()) throw new HTTPException(400, { message: "amount is too small to trade" });
        const { base } = poolSides(pool, curve.baseMint);
        return {
          priced: {
            venue: "pool",
            side,
            amountIn: t.amountIn.toString(),
            amountOut: t.amountOut.toString(),
            fees: { raydium: t.fees.protocol.toString(), platform: t.fees.platform.toString(), creator: t.fees.creator.toString() },
            feeBps: { raydium: bps(pool.rates.trade), platform: bps(pool.rates.creator), creator: 0 },
            transferFees: { quote: t.transferFees.quote.toString(), base: t.transferFees.base.toString() },
            transferFeeBps: { quote: feeBps(quote.transferFee), base: feeBps(base.transferFee) },
            priceBefore: t.priceBefore,
            priceAfter: t.priceAfter,
            completesCurve: false,
            referral: referral?.referral ?? null,
          },
          // cp-swap checks the limit against what the trader receives, transfer fee already withheld.
          limitFrom: t.amountOut,
          prepare: (trader, amountIn, min) =>
            preparePoolTrade(connection, { cpmm: cfg.cpmm, pool, baseMint: curve.baseMint, trader, side, amountIn, minAmountOut: min }),
        };
      },
    };
  }

  return {
    market: { venue: "curve", program: cfg.launchlab, curve },
    quoteMint: curve.quoteMint,
    quoteTokenProgram: curve.quoteTokenProgram,
    referral: (referrer) =>
      referralPlan(cfg, referrer, curve.maxShareFeeRate, curve.maxShareFeeRate.isZero() ? `${quoteSymbol}'s LaunchLab config allows no referral fee.` : null),
    price: (side, amount, referral) => {
      if (side === "sell" && amount.gt(curve.reserves.realBase)) throw new HTTPException(400, { message: "amount is more than the curve has sold" });
      const rates = { ...curve.rates, share: referral?.rate ?? new BN(0) };
      const t = quoteTrade(curve.reserves, rates, side, amount, { quote: curve.quoteTransferFee, base: curve.baseTransferFee });
      if (t.amountOut.isZero()) throw new HTTPException(400, { message: "amount is too small to trade" });
      return {
        priced: {
          venue: "curve",
          side,
          amountIn: t.amountIn.toString(),
          amountOut: t.amountOut.toString(),
          fees: { raydium: t.fees.protocol.toString(), platform: t.fees.platform.toString(), creator: t.fees.creator.toString() },
          feeBps: { raydium: bps(curve.rates.protocol), platform: bps(curve.rates.platform), creator: bps(curve.rates.creator) },
          transferFees: { quote: t.transferFees.quote.toString(), base: t.transferFees.base.toString() },
          transferFeeBps: { quote: feeBps(curve.quoteTransferFee), base: feeBps(curve.baseTransferFee) },
          priceBefore: curvePrice(curve.reserves, curve.baseDecimals, curve.quoteDecimals),
          priceAfter: curvePrice(t.after, curve.baseDecimals, curve.quoteDecimals),
          completesCurve: t.after.realBase.eq(t.after.totalBaseSell),
          referral: referral ? { ...referral.referral, fee: t.fees.share.toString() } : null,
        },
        // LaunchLab, like cp-swap, checks the limit against what reaches the wallet, the transfer fee already withheld
        // (proven on the fork: a limit set at the pre-fee figure fails with ExceededSlippage).
        limitFrom: t.amountOut,
        prepare: (trader, amountIn, min) =>
          prepareTrade(connection, {
            program: cfg.launchlab, curve, trader, side, amountIn, minAmountOut: min,
            referral: referral && !referral.rate.isZero() ? { referrer: referral.referrer, rate: referral.rate } : null,
          }),
      };
    },
  };
}

/**
 * A buy paid with `lamports` of SOL. The trade spends the Quote Asset that SOL buys right now (less, when the buy takes
 * the rest of the curve), and the route buys exactly that much. The trader's slippage is split between the two.
 */
async function routedMarket(
  connection: Connection, env: Bindings, cfg: Config, venue: Venue, symbol: string, lamports: BN, slippageBps: number, referral: ReferralPlan | null,
): Promise<Market> {
  const routes = solRoutes(env, cfg, connection);
  if (!routes) throw new HTTPException(422, { message: `Paying with SOL isn't available here. Pay in ${symbol} instead.` });
  if ((await transferFeeBps(connection, venue.quoteMint, venue.quoteTokenProgram)) > 0)
    throw new HTTPException(422, {
      message: `${symbol} charges a fee on every transfer, so it can't be bought with SOL in the same transaction yet. Pay in ${symbol} instead.`,
    });
  const noRoute = () => new HTTPException(422, { message: `There's no SOL route to ${symbol} right now. Pay in ${symbol} instead.` });
  const unavailable = (e: unknown) => {
    console.error("SOL route source failed", e);
    return new HTTPException(503, { message: "The SOL route is unavailable right now. Try again in a minute." });
  };
  const bought = await routes.exactIn(venue.quoteMint, lamports).catch((e: unknown) => Promise.reject(unavailable(e)));
  if (!bought) throw noRoute();
  if (bought.isZero()) throw new HTTPException(400, { message: "amount is too small to trade" });
  const { priced, limitFrom } = venue.price("buy", bought, referral);
  const quoteAmount = new BN(priced.amountIn);
  const split = splitSlippage(slippageBps);
  const plan = await routes.exactOut(venue.quoteMint, quoteAmount, split.route).catch((e: unknown) => Promise.reject(unavailable(e)));
  if (!plan) throw noRoute();
  const { minCoins } = routedLimits(plan.solIn, limitFrom, split);
  const quote: TradeQuote = {
    ...priced,
    minAmountOut: walletSide(minCoins, limitFrom, new BN(priced.amountOut)).toString(),
    slippageBps,
    route: {
      source: plan.source,
      via: plan.via,
      solIn: plan.solIn.toString(),
      maxSolIn: plan.maxSolIn.toString(),
      quoteOut: quoteAmount.toString(),
      fee: plan.fee?.toString() ?? null,
      feeBps: plan.feeBps,
      slippageBps: split,
    },
  };
  return {
    quote,
    prepare: (trader) =>
      prepareRoutedBuy(connection, {
        trader,
        market: venue.market,
        quoteMint: venue.quoteMint,
        quoteTokenProgram: venue.quoteTokenProgram,
        quoteAmount,
        minAmountOut: minCoins,
        swap: plan.swap,
        // Our own shared accounts are in the Platform Lookup Table; the swap brings any tables its route needs.
        lookupTables: [cfg.lookupTable],
        referral: referral && !referral.rate.isZero() ? { referrer: referral.referrer, rate: referral.rate } : null,
      }).catch((e: unknown) => {
        if (e instanceof TransactionTooLargeError)
          throw new HTTPException(422, { message: `This SOL route doesn't fit in one transaction. Pay in ${symbol} instead.` });
        throw e;
      }),
  };
}
