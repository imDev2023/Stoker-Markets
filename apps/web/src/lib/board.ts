import { LaunchSort, QuoteCategory, QuoteIssuer, type MarketValue, type QuoteRef } from "@launchpad/contract";
import type { BoardQuery } from "./api";
import { quoteTicker } from "./format";

export const SORT_LABELS: Record<LaunchSort, string> = {
  market_cap: "Market cap",
  new: "Newest",
  trending: "24h volume",
  graduation: "Near graduation",
};

/** The sorts in the order the toolbar shows them. */
export const SORT_ORDER: LaunchSort[] = ["market_cap", "new", "trending", "graduation"];

export const CATEGORY_LABELS: Record<QuoteCategory, string> = {
  sol: "Solana",
  stablecoin: "Currencies",
  tokenized_stock: "Stocks",
  community: "Custom",
};

export const ISSUER_LABELS: Record<QuoteIssuer, string> = {
  xstocks: "xStocks",
  prestocks: "PreStocks",
  backpack: "Backpack",
};

/**
 * The "Paired with" chips: a stock issuer, or a category for everything that has no issuer. A chip sets one of the two
 * filters and clears the other; "All" clears both.
 */
export type PairedChip = { label: string; category: QuoteCategory | null; issuer: QuoteIssuer | null };
export const PAIRED_CHIPS: PairedChip[] = [
  { label: "All", category: null, issuer: null },
  ...(Object.keys(ISSUER_LABELS) as QuoteIssuer[]).map((issuer) => ({ label: ISSUER_LABELS[issuer], category: null, issuer })),
  ...(["stablecoin", "sol", "community"] as const).map((category) => ({ label: CATEGORY_LABELS[category], category, issuer: null })),
];

/** Whether a Quote Asset is within the chosen chip: by issuer when one is chosen, else by category, else always. */
export function inChip(q: Pick<QuoteRef, "category" | "issuer">, query: Pick<BoardQuery, "category" | "issuer">) {
  if (query.issuer) return q.issuer === query.issuer;
  if (query.category) return q.category === query.category;
  return true;
}

export const DEFAULT_BOARD: BoardQuery = { sort: "market_cap", category: null, issuer: null, quote: null, q: "" };

const MINT = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export const SEARCH_MAX = 64;

/** The board's query from the page's URL. Anything unknown falls back to the default, so an old or mangled link still shows coins. */
export function boardQueryFrom(params: Record<string, string | string[] | undefined>): BoardQuery {
  const one = (key: string) => {
    const v = params[key];
    return Array.isArray(v) ? v[0] : v;
  };
  const sort = LaunchSort.safeParse(one("sort"));
  const category = QuoteCategory.safeParse(one("category"));
  const issuer = QuoteIssuer.safeParse(one("issuer"));
  const quote = one("quote");
  return {
    sort: sort.success ? sort.data : DEFAULT_BOARD.sort,
    // An issuer is finer than a category, so a link naming both keeps the issuer.
    category: category.success && !issuer.success ? category.data : null,
    issuer: issuer.success ? issuer.data : null,
    quote: quote && MINT.test(quote) ? quote : null,
    q: (one("q") ?? "").trim().slice(0, SEARCH_MAX),
  };
}

/** The URL search string for a board query, leaving out defaults so the plain board stays at "/". */
export function boardSearch(q: BoardQuery) {
  const params = new URLSearchParams();
  if (q.sort !== DEFAULT_BOARD.sort) params.set("sort", q.sort);
  if (q.issuer) params.set("issuer", q.issuer);
  else if (q.category) params.set("category", q.category);
  if (q.quote) params.set("quote", q.quote);
  if (q.q) params.set("q", q.q);
  const s = params.toString();
  return s ? `?${s}` : "";
}

export const isDefaultBoard = (q: BoardQuery) => !q.category && !q.issuer && !q.quote && !q.q && q.sort === DEFAULT_BOARD.sort;

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
