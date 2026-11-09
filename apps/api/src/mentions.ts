import { sql } from "drizzle-orm";
import type { Db } from "@launchpad/db";
import type { Config } from "./env";
import { copyPicture, xAvatarKey } from "./pictures";

/**
 * The mentions job (#160, ADR 0018): for each coin that traded lately, one search of X through twitterapi.io for posts
 * naming its mint address, its ticker as a cashtag or its page's link, since the last search; each post found is stored
 * once with the coin's market cap when it was posted, and its author's picture is copied to our bucket. A coin is
 * searched only while it trades, at most `coinsMax` a run, so the cost follows activity and has a ceiling. Nothing is
 * called without the key, nothing moves on-chain and nothing reaches the Ledger.
 */

/** Each search reaches this far before the last one, so a post X indexed late is still found; a post is stored once. */
const OVERLAP_SECONDS = 120;
/** A post's text is kept to this length; the mark shows the start of it and links to the whole post. */
const TEXT_MAX = 1000;
/** A 429 or a server error is tried again this many times, waiting a little longer each time. */
const ATTEMPTS = 3;
const RETRY_MAX_MS = 5_000;
const REQUEST_TIMEOUT_MS = 15_000;

type Tweet = {
  id?: string;
  url?: string;
  text?: string;
  createdAt?: string;
  author?: { id?: string; userName?: string; name?: string; profilePicture?: string };
};

export type MentionsSummary = {
  searched: number;
  found: number;
  /** Coins the run did not reach because twitterapi.io kept answering 429; the next run searches them first. */
  rateLimited: number;
  /** Coins whose search was refused (a 400, or a server error after the retries), each with the status. */
  failed: { mint: string; status: number }[];
  /** Why nothing was searched, when nothing could be. */
  reason?: string;
};

/** A ticker that X reads as a cashtag: a letter, then letters or digits. */
const CASHTAG = /^[A-Za-z][A-Za-z0-9]{0,9}$/;

/** The search for one coin's posts since `since` (Unix seconds). */
export function mentionQuery(coin: { mint: string; symbol: string }, webOrigin: string, since: number) {
  const host = new URL(webOrigin).host;
  const terms = [`"${coin.mint}"`, `url:"${host}/coin/${coin.mint}"`];
  if (CASHTAG.test(coin.symbol)) terms.push(`$${coin.symbol}`);
  return `(${terms.join(" OR ")}) since_time:${since}`;
}

class Stop extends Error {}

export async function pollMentions(deps: { db: Db; cfg: Config; bucket: R2Bucket }): Promise<MentionsSummary> {
  const { db, cfg, bucket } = deps;
  const m = cfg.mentions;
  const summary: MentionsSummary = { searched: 0, found: 0, rateLimited: 0, failed: [] };
  if (!m) return { ...summary, reason: "TWITTERAPI_API_KEY is not set: nothing was searched" };

  // The coins that traded within the window, the ones searched longest ago first (never searched counts as longest), then
  // the most recently traded, so a run cut short by a 429 leaves the next one to start where it stopped.
  const coins = await db.execute<{ mint: string; symbol: string; supply: string; decimals: number; since: string }>(sql`
    select l.mint, l.symbol, l.supply::text as supply, l.decimals,
      extract(epoch from coalesce(p.polled_at, l.created_at))::bigint::text as since
    from launches l
    join (select mint, max(block_time) as last from trades
          where block_time > now() - make_interval(secs => ${m.activeSeconds}) group by mint) t on t.mint = l.mint
    left join mention_polls p on p.mint = l.mint
    order by p.polled_at asc nulls first, t.last desc
    limit ${m.coinsMax}`);

  const pictures = new Map<string, boolean>();
  for (const [i, coin] of coins.entries()) {
    const started = new Date();
    const since = Math.max(0, Number(coin.since) - OVERLAP_SECONDS);
    let tweets: Tweet[];
    try {
      tweets = await search(m.apiUrl, m.apiKey, mentionQuery(coin, cfg.webOrigin, since));
    } catch (e) {
      if (e instanceof RateLimited) {
        summary.rateLimited = coins.length - i;
        break;
      }
      if (e instanceof Refused) {
        summary.failed.push({ mint: coin.mint, status: e.status });
        continue;
      }
      throw e;
    }
    summary.searched++;
    const wholeSupply = Number(coin.supply) / 10 ** coin.decimals;
    for (const t of tweets) {
      const author = t.author;
      const postedAt = t.createdAt ? new Date(t.createdAt) : null;
      if (!t.id || !/^\d+$/.test(t.id) || !author?.id || !/^\d+$/.test(author.id) || !author.userName || !postedAt || Number.isNaN(postedAt.getTime())) continue;
      if (!pictures.has(author.id))
        pictures.set(author.id, author.profilePicture ? await copyPicture(bucket, xAvatarKey(author.id), author.profilePicture, cfg.cluster) : false);
      const url = t.url && /^https:\/\/(x|twitter)\.com\//.test(t.url) ? t.url : `https://x.com/${author.userName}/status/${t.id}`;
      const posted = postedAt.toISOString();
      const inserted = await db.execute(sql`
        insert into coin_mentions (mint, tweet_id, url, text, author_id, author_handle, author_name, author_avatar, posted_at, market_cap)
        values (${coin.mint}, ${t.id}, ${url}, ${(t.text ?? "").slice(0, TEXT_MAX)}, ${author.id}, ${author.userName}, ${author.name ?? null},
          ${pictures.get(author.id)!}, ${posted}::timestamptz,
          coalesce(
            (select price_after from trades where mint = ${coin.mint} and block_time <= ${posted}::timestamptz order by slot desc, event_index desc limit 1),
            (select price_before from trades where mint = ${coin.mint} order by slot asc, event_index asc limit 1)
          ) * ${wholeSupply}::double precision)
        on conflict do nothing
        returning tweet_id`);
      summary.found += inserted.length;
    }
    await db.execute(sql`
      insert into mention_polls (mint, polled_at) values (${coin.mint}, ${started.toISOString()}::timestamptz)
      on conflict (mint) do update set polled_at = excluded.polled_at`);
  }
  return summary;
}

class RateLimited extends Stop {}
class Refused extends Stop {
  constructor(readonly status: number) {
    super(`twitterapi.io answered ${status}`);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * One page of the latest posts matching `query` (up to twenty). A 429 or a server error is tried again; a 402 (out of
 * credits), 401 or 403 (the key) fails the run, so the operator is alerted rather than the job retrying for nothing.
 */
async function search(apiUrl: string, apiKey: string, query: string): Promise<Tweet[]> {
  const url = `${apiUrl}/twitter/tweet/advanced_search?${new URLSearchParams({ query, queryType: "Latest" })}`;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { "x-api-key": apiKey }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (res.ok) {
      const body = (await res.json()) as { tweets?: Tweet[] };
      return Array.isArray(body.tweets) ? body.tweets : [];
    }
    if (res.status === 402) throw new Error("twitterapi.io answered 402: its credits have run out, so no coin's mentions are searched until they are topped up");
    if (res.status === 401 || res.status === 403) throw new Error(`twitterapi.io answered ${res.status}: TWITTERAPI_API_KEY is not accepted`);
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable) throw new Refused(res.status);
    if (attempt >= ATTEMPTS) throw res.status === 429 ? new RateLimited() : new Refused(res.status);
    const after = Number(res.headers.get("retry-after"));
    await sleep(Math.min(RETRY_MAX_MS, Number.isFinite(after) && after > 0 ? after * 1000 : 500 * 2 ** attempt));
  }
}
