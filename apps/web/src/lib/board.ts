import { LaunchSort, QuoteCategory, type MarketValue, type QuoteRef } from "@launchpad/contract";
import type { BoardQuery } from "./api";
import { quoteTicker } from "./format";

export const SORT_LABELS: Record<LaunchSort, string> = {
  new: "New",
  trending: "Trending",
  market_cap: "Market cap",
  graduation: "Near graduation",
};

export const CATEGORY_LABELS: Record<QuoteCategory, string> = {
  sol: "SOL",
  stablecoin: "Stablecoins",
  tokenized_stock: "Stocks",
  community: "Community",
};

export const DEFAULT_BOARD: BoardQuery = { sort: "new", category: null, quote: null };

const MINT = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** The board's query from the page's URL. Anything unknown falls back to the default, so an old or mangled link still shows coins. */
export function boardQueryFrom(params: Record<string, string | string[] | undefined>): BoardQuery {
  const one = (key: string) => {
    const v = params[key];
    return Array.isArray(v) ? v[0] : v;
  };
  const sort = LaunchSort.safeParse(one("sort"));
  const category = QuoteCategory.safeParse(one("category"));
  const quote = one("quote");
  return {
    sort: sort.success ? sort.data : DEFAULT_BOARD.sort,
    category: category.success ? category.data : null,
    quote: quote && MINT.test(quote) ? quote : null,
  };
}

/** The URL search string for a board query, leaving out defaults so the plain board stays at "/". */
export function boardSearch(q: BoardQuery) {
  const params = new URLSearchParams();
  if (q.sort !== DEFAULT_BOARD.sort) params.set("sort", q.sort);
  if (q.category) params.set("category", q.category);
  if (q.quote) params.set("quote", q.quote);
  const s = params.toString();
  return s ? `?${s}` : "";
}

export const isDefaultBoard = (q: BoardQuery) => !q.category && !q.quote && q.sort === DEFAULT_BOARD.sort;

const compact = (n: number) => n.toLocaleString("en-US", { notation: "compact", maximumSignificantDigits: 3 });

/**
 * A market figure in the most familiar terms available: US dollars, else SOL, else the Quote Asset itself when it has
 * no price. Compact, for a card: $1.23K, 45.6 SOL, 1.2M BULLWHALE.
 */
export function formatMarketValue(v: MarketValue, quote: Pick<QuoteRef, "mint" | "symbol">) {
  if (v.usd !== null) return v.usd.toLocaleString("en-US", { style: "currency", currency: "USD", notation: "compact", maximumSignificantDigits: 3 });
  if (v.sol !== null) return `${compact(v.sol)} SOL`;
  return `${compact(v.quote)} ${quoteTicker(quote)}`;
}
