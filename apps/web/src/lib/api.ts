import {
  AirdropStatus, ApiError, CandleList, CreatorFeeClaimList, CreatorFees, FirstBuyQuote, HolderList, LaunchList, LaunchQuoteList,
  LaunchSummary, PlatformInfo, PreparedAirdrop, PreparedCreatorFeeClaim, PreparedLaunch, PreparedTrade, QuoteAssetList, TradeList, TradeQuote,
  type CandleInterval, type CurveStatus, type LaunchSort, type PrepareCreatorFeeClaimRequest, type PrepareTradeRequest,
  type QuoteCategory, type TradeQuoteQuery,
} from "@launchpad/contract";

/** The web app is a client of the public API like any other; it never builds transactions itself (ADR 0003). */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8791").replace(/\/$/, "");

/** An error answer from the API, with its HTTP status so callers can tell a refusal from a failure. */
export class ApiRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function read<T>(res: Response, schema: { parse: (v: unknown) => T }): Promise<T> {
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = ApiError.safeParse(body);
    throw new ApiRequestError(err.success ? err.data.error : `Request failed (${res.status})`, res.status);
  }
  return schema.parse(body);
}

export async function getPlatform() {
  return read(await fetch(`${API_URL}/v1/platform`, { cache: "no-store" }), PlatformInfo);
}

export async function listQuotes() {
  return read(await fetch(`${API_URL}/v1/quotes`, { cache: "no-store" }), QuoteAssetList);
}

/** How many coins the board shows at once. */
export const BOARD_SIZE = 60;

/** The board's sort and filters, as both the API and the page's URL take them. */
export type BoardQuery = { sort: LaunchSort; category: QuoteCategory | null; quote: string | null };

export async function listLaunches(q: Partial<BoardQuery> & { status?: CurveStatus; limit?: number } = {}, signal?: AbortSignal) {
  const query = new URLSearchParams({ limit: String(q.limit ?? BOARD_SIZE) });
  for (const key of ["sort", "category", "quote", "status"] as const) {
    const value = q[key];
    if (value) query.set(key, value);
  }
  return read(await fetch(`${API_URL}/v1/launches?${query}`, { cache: "no-store", signal }), LaunchList);
}

/** The Quote Assets Launches are paired with, most used first. */
export async function listLaunchQuotes() {
  return read(await fetch(`${API_URL}/v1/launches/quotes`, { cache: "no-store" }), LaunchQuoteList);
}

/** Top holders and the Creator's holding, read from the chain by the API. */
export async function getHolders(mint: string) {
  return read(await fetch(`${API_URL}/v1/launches/${encodeURIComponent(mint)}/holders`, { cache: "no-store" }), HolderList);
}

export async function getLaunch(mint: string): Promise<LaunchSummary | null> {
  const res = await fetch(`${API_URL}/v1/launches/${encodeURIComponent(mint)}`, { cache: "no-store" });
  if (res.status === 404) return null;
  return read(res, LaunchSummary);
}

export async function prepareLaunch(form: FormData) {
  return read(await fetch(`${API_URL}/v1/launches/prepare`, { method: "POST", body: form }), PreparedLaunch);
}

/** Prepares an earlier launch again, for the same coin address; a 409 means that coin has already launched. */
export async function retryLaunch(mint: string) {
  return read(await fetch(`${API_URL}/v1/launches/${encodeURIComponent(mint)}/prepare`, { method: "POST" }), PreparedLaunch);
}

/** What a first buy of `firstBuy` raw Quote Asset units gets on a new coin. */
export async function getLaunchQuote(quoteMint: string, firstBuy: string, signal?: AbortSignal) {
  return read(await fetch(`${API_URL}/v1/launch-quote?${new URLSearchParams({ quoteMint, firstBuy })}`, { cache: "no-store", signal }), FirstBuyQuote);
}

/** A coin's airdrop and which wallets it has paid; null if the coin has none. */
export async function getAirdrop(mint: string): Promise<AirdropStatus | null> {
  const res = await fetch(`${API_URL}/v1/launches/${encodeURIComponent(mint)}/airdrop`, { cache: "no-store" });
  if (res.status === 404) return null;
  return read(res, AirdropStatus);
}

export async function prepareAirdrop(mint: string) {
  return read(await fetch(`${API_URL}/v1/launches/${encodeURIComponent(mint)}/airdrop/prepare`, { method: "POST" }), PreparedAirdrop);
}

export async function getQuote(mint: string, q: TradeQuoteQuery, signal?: AbortSignal) {
  const query = new URLSearchParams({ side: q.side, amount: q.amount, slippageBps: String(q.slippageBps) });
  return read(await fetch(`${API_URL}/v1/launches/${encodeURIComponent(mint)}/quote?${query}`, { cache: "no-store", signal }), TradeQuote);
}

export async function prepareTrade(body: PrepareTradeRequest) {
  return read(
    await fetch(`${API_URL}/v1/trades/prepare`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    PreparedTrade,
  );
}

export async function listTrades(mint: string) {
  return read(await fetch(`${API_URL}/v1/launches/${encodeURIComponent(mint)}/trades?limit=50`, { cache: "no-store" }), TradeList);
}

export async function getCandles(mint: string, interval: CandleInterval) {
  return read(await fetch(`${API_URL}/v1/launches/${encodeURIComponent(mint)}/candles?interval=${interval}`, { cache: "no-store" }), CandleList);
}

/** A Creator's Creator Fee per Quote Asset and per Launch; null if the address isn't a valid wallet address. */
export async function getCreatorFees(creator: string): Promise<CreatorFees | null> {
  const res = await fetch(`${API_URL}/v1/creators/${encodeURIComponent(creator)}/fees`, { cache: "no-store" });
  if (res.status === 400) return null;
  return read(res, CreatorFees);
}

export async function listCreatorFeeClaims(creator: string) {
  return read(await fetch(`${API_URL}/v1/creators/${encodeURIComponent(creator)}/claims?limit=100`, { cache: "no-store" }), CreatorFeeClaimList);
}

export async function prepareCreatorFeeClaim(body: PrepareCreatorFeeClaimRequest) {
  return read(
    await fetch(`${API_URL}/v1/creator-fees/prepare`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    PreparedCreatorFeeClaim,
  );
}

/** Tells the API about a confirmed launch, trade or claim so it shows up without waiting for the webhook. */
export async function reportTransaction(signature: string) {
  await fetch(`${API_URL}/v1/transactions/${signature}`, { method: "POST" }).catch(() => undefined);
}
