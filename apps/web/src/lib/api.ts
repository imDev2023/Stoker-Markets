import {
  AirdropStatus, ApiError, BurnsPage, CandleList, CoinRewards, CreatorFeeClaimList, CreatorFees, FeeAnnouncement, FeeAnnouncementList, FirstBuyQuote,
  HolderList, LaunchList, LaunchQuoteList, LaunchSummary, LedgerPage, OperatorAlertList, OperatorOverview, PlatformInfo, PreparedAirdrop,
  PreparedCreatorFeeClaim, PreparedFeeChange, PreparedLaunch, PreparedTrade, QuoteAssetList, Revenue, RewardRoundDetail, RewardRulesPage, TradeList,
  TradeQuote, WalletRewards,
  type AnnounceFeeChange, type CandleInterval, type CurveStatus, type LaunchSort, type PrepareCreatorFeeClaimRequest, type PrepareTradeRequest,
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

/** What a first buy of `firstBuy` raw Quote Asset units gets on a new coin, less its Reward Tax on a Reward Launch. */
export async function getLaunchQuote(quoteMint: string, firstBuy: string, rewardTax: number | null, signal?: AbortSignal) {
  const query = new URLSearchParams({ quoteMint, firstBuy, ...(rewardTax ? { rewardTax: String(rewardTax) } : {}) });
  return read(await fetch(`${API_URL}/v1/launch-quote?${query}`, { cache: "no-store", signal }), FirstBuyQuote);
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
  const query = new URLSearchParams({ side: q.side, amount: q.amount, slippageBps: String(q.slippageBps), payWith: q.payWith });
  if (q.referrer) query.set("referrer", q.referrer);
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

/** Platform revenue per asset and per day, summed from the Ledger. */
export async function getRevenue() {
  return read(await fetch(`${API_URL}/v1/revenue`, { cache: "no-store" }), Revenue);
}

/** A page of the Ledger, newest first; pass the previous page's `next` to go further back. */
export async function listLedger(before?: string | null) {
  const query = new URLSearchParams({ limit: "25", ...(before ? { before } : {}) });
  return read(await fetch(`${API_URL}/v1/ledger?${query}`, { cache: "no-store" }), LedgerPage);
}

/** A Reward Launch's Holder Rewards: tax waiting, rules and rounds; null for a standard coin. */
export async function getCoinRewards(mint: string): Promise<CoinRewards | null> {
  const res = await fetch(`${API_URL}/v1/launches/${encodeURIComponent(mint)}/rewards`, { cache: "no-store" });
  if (res.status === 404) return null;
  return read(res, CoinRewards);
}

/** Burn and Flywheel: shares, rule, budgets and every buy and burn so far. */
export async function getBurns() {
  return read(await fetch(`${API_URL}/v1/burns`, { cache: "no-store" }), BurnsPage);
}

export async function getRewardRules() {
  return read(await fetch(`${API_URL}/v1/rewards/rules`, { cache: "no-store" }), RewardRulesPage);
}

export async function getRewardRound(id: string): Promise<RewardRoundDetail | null> {
  const res = await fetch(`${API_URL}/v1/rewards/rounds/${encodeURIComponent(id)}`, { cache: "no-store" });
  if (res.status === 404) return null;
  return read(res, RewardRoundDetail);
}

/** A wallet's Holder Rewards across every Reward Launch; null if the address isn't a valid wallet address. */
export async function getWalletRewards(wallet: string): Promise<WalletRewards | null> {
  const res = await fetch(`${API_URL}/v1/wallets/${encodeURIComponent(wallet)}/rewards`, { cache: "no-store" });
  if (res.status === 400) return null;
  return read(res, WalletRewards);
}

/** Tells the API about a confirmed launch, trade or claim so it shows up without waiting for the webhook. */
export async function reportTransaction(signature: string) {
  await fetch(`${API_URL}/v1/transactions/${signature}`, { method: "POST" }).catch(() => undefined);
}

/** Every announced Platform Fee or Creator Fee change, newest effective time first; public, so none comes as a surprise. */
export async function listAnnouncements() {
  return read(await fetch(`${API_URL}/v1/announcements`, { cache: "no-store" }), FeeAnnouncementList);
}

// The operator view, behind the operator token, which the operator's browser keeps for the session only.
const operator = (token: string, body?: unknown) => ({
  method: body === undefined ? "GET" : "POST",
  headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
  body: body === undefined ? undefined : JSON.stringify(body),
  cache: "no-store" as const,
});

export async function getOperatorOverview(token: string) {
  return read(await fetch(`${API_URL}/v1/operator/overview`, operator(token)), OperatorOverview);
}

export async function listOperatorAlerts(token: string) {
  return read(await fetch(`${API_URL}/v1/operator/alerts`, operator(token)), OperatorAlertList);
}

export async function announceFeeChange(token: string, body: AnnounceFeeChange) {
  return read(await fetch(`${API_URL}/v1/operator/fees/announce`, operator(token, body)), FeeAnnouncement);
}

export async function prepareFeeChange(token: string, id: string) {
  return read(await fetch(`${API_URL}/v1/operator/fees/prepare`, operator(token, { id })), PreparedFeeChange);
}

export async function runOperatorJob(token: string, job: "quote-registry" | "fee-collector" | "reward-rounds" | "burn") {
  const res = await fetch(`${API_URL}/v1/operator/jobs/${job}`, operator(token, {}));
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok && res.status === 401) throw new ApiRequestError("unauthorized", 401);
  return body as { status: string; error: string | null };
}
