import { QuoteCategory, QuoteIssuer, type QuoteAsset, type QuoteMarket, type QuoteRef } from "@launchpad/contract";
import { CATEGORY_LABELS, CATEGORY_ORDER, ISSUER_LABELS, inChip } from "./board";
import { formatPrice, formatUnits, SOL_DECIMALS } from "./format";

/** The assets page (ADR 0010): every Quote Asset the registry quotes, grouped by what it is, searched and filtered. */

/** One line under each group's heading on the assets page: what belongs in it, in the site's words. */
export const CATEGORY_NOTES: Record<QuoteCategory, string> = {
  sol: "Solana's own coin, the pairing most coins start with.",
  stablecoin: "Dollar and euro stablecoins.",
  tokenized_stock: "Shares and funds as tokens, each from the issuer named beside it.",
  wrapped: "Coins of other chains wrapped on Solana: BTC, ETH, BNB.",
  defi: "Tokens of Solana's protocols and infrastructure, staked SOL among them.",
  rwa: "Real-world assets other than stocks: gold, silver.",
  leveraged: "Hylo's leveraged tokens: three times the move of SOL, BTC or HYPE.",
  collectible: "Tokens backed by collectibles held in reserve.",
  meme: "Meme coins, as Jupiter's token list recognises them.",
  community: "Every other asset Raydium quotes: launchpad coins and the long tail.",
};

export type AssetsQuery = { category: QuoteCategory | null; issuer: QuoteIssuer | null; q: string; page: number };
export const DEFAULT_ASSETS: AssetsQuery = { category: null, issuer: null, q: "", page: 1 };
export const ASSETS_SEARCH_MAX = 64;
/** Rows a page of the directory shows (#135): mainnet quotes some six hundred assets, which no one list should be. */
export const ASSETS_PAGE = 50;

/** The page's query from its URL, like the board's: anything unknown falls back to the default, so an old link still shows assets. */
export function assetsQueryFrom(params: Record<string, string | string[] | undefined>): AssetsQuery {
  const one = (key: string) => {
    const v = params[key];
    return Array.isArray(v) ? v[0] : v;
  };
  const category = QuoteCategory.safeParse(one("category"));
  const issuer = QuoteIssuer.safeParse(one("issuer"));
  const page = Number(one("page"));
  return {
    category: category.success && !issuer.success ? category.data : null,
    issuer: issuer.success ? issuer.data : null,
    q: (one("q") ?? "").trim().slice(0, ASSETS_SEARCH_MAX),
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

export function assetsSearch(q: AssetsQuery) {
  const params = new URLSearchParams();
  if (q.issuer) params.set("issuer", q.issuer);
  else if (q.category) params.set("category", q.category);
  if (q.q) params.set("q", q.q);
  if (q.page > 1) params.set("page", String(q.page));
  const s = params.toString();
  return s ? `?${s}` : "";
}

/**
 * One page of the directory (#135): the assets in their groups, cut to `ASSETS_PAGE` rows, so a group that straddles
 * two pages shows its heading on both with its whole count. `total` is every row the query matched, for the pager.
 */
export function pageOfAssets<T extends Pick<QuoteAsset, "category">>(groups: AssetGroup<T>[], page: number) {
  const total = groups.reduce((n, g) => n + g.assets.length, 0);
  const pages = Math.max(1, Math.ceil(total / ASSETS_PAGE));
  const current = Math.min(page, pages);
  const start = (current - 1) * ASSETS_PAGE;
  const end = start + ASSETS_PAGE;
  let at = 0;
  const shown = groups.flatMap((g) => {
    const from = Math.max(start - at, 0);
    const to = Math.min(end - at, g.assets.length);
    at += g.assets.length;
    return from < to ? [{ ...g, count: g.assets.length, assets: g.assets.slice(from, to) }] : [];
  });
  return { shown, total, pages, page: current, from: total === 0 ? 0 : start + 1, to: Math.min(end, total) };
}

/** A USD amount for a liquidity column: compact, three figures, so a column of six hundred reads at a glance. */
export function formatCompactUsd(usd: number) {
  return usd.toLocaleString("en-US", { style: "currency", currency: "USD", notation: "compact", maximumSignificantDigits: 3 });
}

/**
 * Filters Quote Assets by ticker, name or mint address, closest ticker matches first, otherwise keeping the order given.
 * The launch form's picker and the assets page share it, so the same search finds the same asset in both.
 */
export function searchQuotes<T extends Pick<QuoteRef, "mint" | "symbol" | "name">>(quotes: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return quotes;
  const rank = (a: T) => {
    const ticker = (a.symbol ?? "").toLowerCase();
    if (ticker === q || a.mint.toLowerCase() === q) return 0;
    if (ticker.startsWith(q)) return 1;
    if (ticker.includes(q) || (a.name ?? "").toLowerCase().includes(q) || a.mint.toLowerCase().startsWith(q)) return 2;
    return -1;
  };
  return quotes
    .map((a, i) => ({ a, i, r: rank(a) }))
    .filter((x) => x.r >= 0)
    .sort((x, y) => x.r - y.r || x.i - y.i)
    .map((x) => x.a);
}

/** The assets that match a query: within the chip, then the search. */
export function filterAssets<T extends Pick<QuoteAsset, "mint" | "symbol" | "name" | "category" | "issuer">>(quotes: T[], query: AssetsQuery): T[] {
  return searchQuotes(quotes.filter((q) => inChip(q, query)), query.q);
}

export type AssetGroup<T> = { category: QuoteCategory; label: string; note: string; assets: T[] };

/** The assets in their groups, in the site's order, groups with nothing in them left out. */
export function groupAssets<T extends Pick<QuoteAsset, "category">>(quotes: T[]): AssetGroup<T>[] {
  return CATEGORY_ORDER.flatMap((category) => {
    const assets = quotes.filter((q) => q.category === category);
    return assets.length ? [{ category, label: CATEGORY_LABELS[category], note: CATEGORY_NOTES[category], assets }] : [];
  });
}

/** The category's name, with the issuer's for a tokenized stock: "Stocks · xStocks". */
export function assetKind(q: Pick<QuoteAsset, "category" | "issuer">) {
  return q.issuer ? `${CATEGORY_LABELS[q.category]} · ${ISSUER_LABELS[q.issuer]}` : CATEGORY_LABELS[q.category];
}

const TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

export function tokenProgramName(program: string) {
  return program === TOKEN_2022 ? "Token-2022" : "SPL Token";
}

/** A USD price as the registry has it: dollars and cents from a dollar up, four significant digits below. */
export function formatUsd(usd: string) {
  const n = Number(usd);
  return n >= 1 ? n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }) : `$${formatPrice(n)}`;
}

/** What a coin paired with the asset raises to graduate, in the asset and in the SOL it is worth: "12,750 USDC (85 SOL)". */
export function graduationInWords(q: Pick<QuoteAsset, "graduationTarget" | "decimals" | "symbol" | "mint">) {
  if (!q.graduationTarget) return null;
  const ticker = q.symbol ?? `${q.mint.slice(0, 4)}…${q.mint.slice(-4)}`;
  const amount = formatUnits(q.graduationTarget.raw, q.decimals, BigInt(q.graduationTarget.raw) >= 10n ** BigInt(q.decimals) ? 2 : 4);
  return { amount: `${amount} ${ticker}`, sol: `${formatUnits(q.graduationTarget.lamports, SOL_DECIMALS, 2)} SOL` };
}

/** The market chart's title (#124): the ticker and where TradingView quotes it, "NVDA on NASDAQ" or "SOLUSD across exchanges". */
export function marketTitle(m: QuoteMarket) {
  return m.venue === "CRYPTO" ? `${m.ticker} across exchanges` : `${m.ticker} on ${m.venue}`;
}

/** What the chart shows for an asset of this kind, in a sentence; a tokenized stock's says why its price and the stock's can part. */
export function marketNote(ticker: string, category: QuoteCategory) {
  switch (category) {
    case "tokenized_stock":
      return `What ${ticker} tracks, as TradingView charts it. The stock trades in market hours and ${ticker} on Solana around the clock, so the two can part between sessions.`;
    case "wrapped":
      return `What ${ticker} wraps, as TradingView charts it.`;
    default:
      return `${ticker}'s own market, as TradingView charts it.`;
  }
}

/** TradingView's own chart of the market, offered when its widget can't load here. */
export function marketChartUrl(m: QuoteMarket) {
  return `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(m.symbol)}`;
}
