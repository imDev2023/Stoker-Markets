import { z } from "zod";
import { QuoteCategory, QuoteIssuer, QuoteRef } from "./quotes";
import { CurveStatus } from "./trades";

/** Board discovery: sorting and filtering Launches, their market figures, the Quote Assets in use, and top holders. */

const base58 = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "must be a base58 address");
/** An integer amount in raw units (no decimals applied), as a decimal string. */
const raw = z.string().regex(/^\d+$/, "must be a whole number of raw units");

/**
 * - `new`: newest Launch first.
 * - `trending`: most traded over the last 24 hours, in SOL terms, then most recently traded.
 * - `market_cap`: largest market cap in SOL terms first; Launches paired with an unpriced Quote Asset come last.
 * - `graduation`: live curves closest to their Graduation Target first, then graduating, then graduated Launches.
 */
export const LAUNCH_SORTS = ["new", "trending", "market_cap", "graduation"] as const;
export const LaunchSort = z.enum(LAUNCH_SORTS);
export type LaunchSort = z.infer<typeof LaunchSort>;

export const LAUNCH_LIST_MAX = 100;
export const LAUNCH_SEARCH_MAX = 64;

/** Query string of GET /v1/launches. Filters combine; an unknown value is a 400, never silently ignored. */
export const LaunchListQuery = z.object({
  sort: LaunchSort.default("new"),
  /**
   * A search: Launches whose name or ticker contains it (any case), or whose mint address starts with it. Whitespace
   * around it is ignored, and an empty search is no filter.
   */
  q: z.string().trim().max(LAUNCH_SEARCH_MAX).optional(),
  /** Only Launches paired with this Quote Asset (its mint). */
  quote: base58.optional(),
  category: QuoteCategory.optional(),
  /** Only Launches paired with a tokenized stock from this issuer. */
  issuer: QuoteIssuer.optional(),
  status: CurveStatus.optional(),
  /** Only this Creator's Launches. */
  creator: base58.optional(),
  limit: z.coerce.number().int().min(1).max(LAUNCH_LIST_MAX).default(50),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
});
export type LaunchListQuery = z.infer<typeof LaunchListQuery>;

/** An amount in whole units of the Launch's Quote Asset, and what it is worth in SOL and USD at the latest Quote Asset prices. */
export const MarketValue = z.object({
  quote: z.number(),
  /** Null when the Quote Asset has no reliable price. */
  sol: z.number().nullable(),
  usd: z.number().nullable(),
});
export type MarketValue = z.infer<typeof MarketValue>;

/** A Launch's market figures, wherever its coin trades: on its curve, or in its pool after Graduation. */
export const LaunchMarket = z.object({
  /** Price of one whole coin in whole Quote Asset units after the latest trade; the curve's starting price before the first. */
  price: z.number().nullable(),
  /** Price times the coin's total supply; null only when there is no price. */
  marketCap: MarketValue.nullable(),
  /** Quote Asset traded over the last 24 hours, fees included. */
  volume24h: MarketValue.extend({ raw }),
  /**
   * How the price moved over the last 24 hours, as a fraction (0.12 is up 12%): the price now against the price after the
   * last trade of 24 hours ago, or, for a coin younger than that, against the curve's starting price. Null until the first
   * trade; 0 when nothing traded in the window.
   */
  change24h: z.number().nullable(),
  lastTradeAt: z.iso.datetime().nullable(),
});
export type LaunchMarket = z.infer<typeof LaunchMarket>;

/** The platform's own figures, for a landing or a dashboard: what has launched here, and what traded in the last day. */
export const PlatformStats = z.object({
  /** When the first coin launched here; null until one has. */
  since: z.iso.datetime().nullable(),
  launches: z.number().int(),
  graduated: z.number().int(),
  /**
   * Quote Assets traded over the last 24 hours across every coin, in SOL and USD at the Quote Registry's latest prices;
   * an asset without a price is left out of the sum. Null when no coin has traded.
   */
  volume24h: z.object({ sol: z.number().nullable(), usd: z.number().nullable() }),
});
export type PlatformStats = z.infer<typeof PlatformStats>;

/** A Quote Asset that at least one Launch is paired with, and how many are: what the board's Quote Asset filter offers. */
export const LaunchQuote = QuoteRef.extend({ launches: z.number().int() });
export type LaunchQuote = z.infer<typeof LaunchQuote>;

export const LaunchQuoteList = z.object({ quotes: z.array(LaunchQuote) });
export type LaunchQuoteList = z.infer<typeof LaunchQuoteList>;

/**
 * Who holds a coin, labelled where the holder is not a person: the Launch's curve holds the coins not sold yet, and after
 * Graduation its Raydium pool holds the coins it trades against. The platform's own wallets are labelled too: a graduated
 * coin's Fee Key pays out in the coin, so the operations wallet and the treasury can hold some.
 */
export const HolderKind = z.enum(["curve", "pool", "creator", "treasury", "operations", "holder"]);
export type HolderKind = z.infer<typeof HolderKind>;

export const Holder = z.object({
  /** The wallet or program authority that owns the coins, summed over its token accounts. */
  owner: base58,
  kind: HolderKind,
  amount: raw,
  /** Fraction of the supply, 0 to 1. */
  share: z.number(),
});
export type Holder = z.infer<typeof Holder>;

/** "sold": the Creator bought coins and now holds none. "none": the Creator never bought and holds none. */
export const CreatorHolding = z.object({
  address: base58,
  amount: raw,
  share: z.number(),
  status: z.enum(["holding", "sold", "none"]),
});
export type CreatorHolding = z.infer<typeof CreatorHolding>;

/** Read from the chain at `slot`: the largest holders first (the 20 largest token accounts, grouped by owner). */
export const HolderList = z.object({
  slot: z.number().int(),
  supply: raw,
  holders: z.array(Holder),
  creator: CreatorHolding,
});
export type HolderList = z.infer<typeof HolderList>;
