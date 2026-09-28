import {
  ApiError, CandleList, LaunchList, LaunchSummary, PlatformInfo, PreparedLaunch, PreparedTrade, TradeList, TradeQuote,
  type CandleInterval, type PrepareTradeRequest, type TradeQuoteQuery,
} from "@launchpad/contract";

/** The web app is a client of the public API like any other; it never builds transactions itself (ADR 0003). */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8791").replace(/\/$/, "");

async function read<T>(res: Response, schema: { parse: (v: unknown) => T }): Promise<T> {
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = ApiError.safeParse(body);
    throw new Error(err.success ? err.data.error : `Request failed (${res.status})`);
  }
  return schema.parse(body);
}

export async function getPlatform() {
  return read(await fetch(`${API_URL}/v1/platform`, { cache: "no-store" }), PlatformInfo);
}

export async function listLaunches() {
  return read(await fetch(`${API_URL}/v1/launches?limit=60`, { cache: "no-store" }), LaunchList);
}

export async function getLaunch(mint: string): Promise<LaunchSummary | null> {
  const res = await fetch(`${API_URL}/v1/launches/${encodeURIComponent(mint)}`, { cache: "no-store" });
  if (res.status === 404) return null;
  return read(res, LaunchSummary);
}

export async function prepareLaunch(form: FormData) {
  return read(await fetch(`${API_URL}/v1/launches/prepare`, { method: "POST", body: form }), PreparedLaunch);
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

/** Tells the API about a confirmed launch or trade so it shows up without waiting for the webhook. */
export async function reportTransaction(signature: string) {
  await fetch(`${API_URL}/v1/transactions/${signature}`, { method: "POST" }).catch(() => undefined);
}
