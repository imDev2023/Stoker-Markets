import { z } from "zod";

/**
 * Trading a Launch's coin: quotes, prepared trade transactions, trade history, price candles and curve progress.
 * A coin trades on its curve until Graduation and in its Raydium CPMM pool after, through the same endpoints.
 */

const base58 = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "must be a base58 address");
/** An integer amount in raw units (no decimals applied), as a decimal string. */
const raw = z.string().regex(/^\d+$/, "must be a whole number of raw units");

export const TradeSide = z.enum(["buy", "sell"]);
export type TradeSide = z.infer<typeof TradeSide>;

/** Live: trading on the curve. Graduating: sold out, waiting for Raydium to move it to a CPMM pool. Graduated: moved. */
export const CurveStatus = z.enum(["live", "graduating", "graduated"]);
export type CurveStatus = z.infer<typeof CurveStatus>;

/** Where a trade happens: the Launch's curve before Graduation, its Raydium CPMM pool after. */
export const TradeVenue = z.enum(["curve", "pool"]);
export type TradeVenue = z.infer<typeof TradeVenue>;

export const SLIPPAGE_MAX_BPS = 5_000;

export const TradeQuoteQuery = z.object({
  side: TradeSide,
  /** What the trader pays, in raw units: Quote Asset for a buy, coins for a sell. */
  amount: z.string().regex(/^[1-9]\d*$/, "must be a whole number of raw units, more than zero"),
  /** How far below the quoted output the trade may still fill, in basis points. */
  slippageBps: z.coerce.number().int().min(0).max(SLIPPAGE_MAX_BPS).default(100),
});
export type TradeQuoteQuery = z.infer<typeof TradeQuoteQuery>;

export const PrepareTradeRequest = TradeQuoteQuery.extend({ mint: base58, trader: base58 });
export type PrepareTradeRequest = z.infer<typeof PrepareTradeRequest>;

/**
 * Every fee a trade pays, in raw units of the Quote Asset. The one exception is a sell in the pool, where the pool takes
 * Raydium's fee from the coins sold, so `raydium` is in the coin's raw units.
 * On the curve: Raydium's protocol fee, our Platform Fee and the Creator Fee. In the pool: the pool's trade fee and its
 * creator fee, which is our platform's because the platform creates every graduated pool (ADR 0001); `creator` is 0.
 */
export const TradeFees = z.object({
  raydium: raw,
  platform: raw,
  creator: raw,
});
export type TradeFees = z.infer<typeof TradeFees>;

/** The rate behind each fee, in basis points of the amount it is taken from. */
export const TradeFeeRates = z.object({ raydium: z.number(), platform: z.number(), creator: z.number() });
export type TradeFeeRates = z.infer<typeof TradeFeeRates>;

export const TradeQuote = z.object({
  venue: TradeVenue,
  side: TradeSide,
  /** What the trader pays: Quote Asset including fees for a buy, coins for a sell. Less than asked when a buy takes the rest of the curve. */
  amountIn: raw,
  /** What the trader receives at the current price: coins for a buy, Quote Asset after fees for a sell. */
  amountOut: raw,
  /** The least the trade pays out; below this it fails on-chain and nothing moves. */
  minAmountOut: raw,
  slippageBps: z.number().int(),
  fees: TradeFees,
  feeBps: TradeFeeRates,
  /** Price of one whole coin in whole Quote Asset units, before and after the trade. */
  priceBefore: z.number(),
  priceAfter: z.number(),
  /** The buy takes every coin left on the curve, which starts Graduation. Always false in the pool. */
  completesCurve: z.boolean(),
});
export type TradeQuote = z.infer<typeof TradeQuote>;

export const PreparedTrade = z.object({
  /** Base64 unsigned v0 transaction; the trader's wallet signs it as fee payer and sends it. */
  transaction: z.string(),
  lastValidBlockHeight: z.number().int(),
  quote: TradeQuote,
});
export type PreparedTrade = z.infer<typeof PreparedTrade>;

export const Trade = z.object({
  signature: z.string(),
  venue: TradeVenue,
  trader: base58,
  side: TradeSide,
  /** Coins bought or sold, raw units. */
  baseAmount: raw,
  /** Quote Asset paid including fees (buy) or received after fees (sell), raw units. */
  quoteAmount: raw,
  fees: TradeFees,
  /** Price of one whole coin in whole Quote Asset units after the trade. */
  price: z.number(),
  time: z.iso.datetime(),
});
export type Trade = z.infer<typeof Trade>;

export const TradeList = z.object({ trades: z.array(Trade) });
export type TradeList = z.infer<typeof TradeList>;

export const CANDLE_INTERVALS = ["1m", "5m", "15m", "1h", "4h", "1d"] as const;
export const CandleInterval = z.enum(CANDLE_INTERVALS);
export type CandleInterval = z.infer<typeof CandleInterval>;

/** Open, high, low and close prices of one interval, in whole Quote Asset units per whole coin. */
export const Candle = z.object({
  /** Start of the interval, in Unix seconds. */
  time: z.number().int(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  /** Quote Asset traded in the interval, fees included, raw units. */
  volume: raw,
});
export type Candle = z.infer<typeof Candle>;

export const CandleList = z.object({ interval: CandleInterval, candles: z.array(Candle) });
export type CandleList = z.infer<typeof CandleList>;

/** Where a Launch's curve stands, from its latest indexed trade and its migration. */
export const CurveProgress = z.object({
  status: CurveStatus,
  /** Quote Asset raised toward the Graduation Target so far, raw units, fees excluded. */
  raised: raw,
  /** Price of one whole coin in whole Quote Asset units after the latest curve trade; null before the first trade. */
  price: z.number().nullable(),
  /** When the buy that sold the curve out landed; null while the curve is live. */
  completedAt: z.iso.datetime().nullable(),
});
export type CurveProgress = z.infer<typeof CurveProgress>;

/** A graduated Launch's Raydium CPMM pool. */
export const Graduation = z.object({
  pool: base58,
  /** Raydium's migration of the curve into the pool. */
  signature: z.string(),
  graduatedAt: z.iso.datetime(),
  /** Price of one whole coin in whole Quote Asset units after the latest pool trade; null before the first. */
  price: z.number().nullable(),
});
export type Graduation = z.infer<typeof Graduation>;
