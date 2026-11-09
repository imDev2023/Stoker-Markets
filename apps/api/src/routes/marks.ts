import { Hono } from "hono";
import { eq, sql } from "drizzle-orm";
import {
  MARK_ROLES, MARKS_PER_CANDLE, MarkQuery, NotableWalletInput, TRADE_MARKS_MAX, type MarkList, type MarkRole, type MentionMark,
  type NotableWallet, type NotableWalletList, type TradeMark, type XAccount,
} from "@launchpad/contract";
import { launches, notableWallets, type Db } from "@launchpad/db";
import type { AppEnv } from "../env";
import { copyPicture, notableAvatarKey, notableAvatarUrl, walletAvatarUrl, xAvatarUrl } from "../pictures";
import { BUCKET } from "./trades";

/**
 * The marks on a coin's chart (#160): one per wallet, side and candle for the key wallets' trades (or every trade), and
 * one per post on X that named the coin. Computed from the indexed trades on each request, as the candles are.
 */
export const markRoutes = new Hono<AppEnv>();

/** The largest holders by their trades whose trades are marked by default. */
const TOP_HOLDERS = 10;
const BUCKET_SECONDS: Record<keyof typeof BUCKET, number> = { "1m": 60, "5m": 300, "15m": 900, "1h": 3600, "4h": 14_400, "1d": 86_400 };

const rank = (roles: MarkRole[]) => Math.min(MARK_ROLES.length, ...roles.map((r) => MARK_ROLES.indexOf(r)));

markRoutes.get("/launches/:mint/marks", async (c) => {
  const query = MarkQuery.safeParse(c.req.query());
  if (!query.success) return c.json({ error: "invalid marks request", details: query.error.issues }, 400);
  const q = query.data;
  if (q.to < q.from) return c.json({ error: "to must not be before from" }, 400);
  const db = c.get("db");
  const cfg = c.get("cfg");
  const [launch] = await db
    .select({ mint: launches.mint, creator: launches.creator, supply: launches.supply, decimals: launches.decimals, createdSlot: launches.createdSlot })
    .from(launches)
    .where(eq(launches.mint, c.req.param("mint")))
    .limit(1);
  if (!launch) return c.json({ error: "launch not found" }, 404);

  const wholeSupply = Number(launch.supply) / 10 ** launch.decimals;
  // The bucket width comes from the fixed map, never from the request, so it is safe to inline.
  const bucket = (column: string) => sql.raw(`date_bin(interval '${BUCKET[q.interval]}', ${column}, timestamptz '1970-01-01 00:00:00+00')`);
  const from = sql`to_timestamp(${q.from}::double precision)`;
  // A candle that starts at `to` holds trades until the next one starts.
  const until = sql`to_timestamp(${q.to + BUCKET_SECONDS[q.interval]}::double precision)`;

  const [tradeMarks, mentions] = await Promise.all([
    q.trades === "none" ? [] : marksOfTrades(),
    q.mentions === "false" ? [] : marksOfMentions(),
  ]);
  const res: MarkList = { interval: q.interval, trades: tradeMarks, mentions };
  return c.json(res);

  async function marksOfTrades(): Promise<TradeMark[]> {
    const roles = await keyWallets(db, launch!, cfg.snipeWindowSlots, q.wallet);
    const notable = await notables(db, launch!.mint, cfg.publicApiUrl);
    for (const w of notable.keys()) roles.set(w, [...(roles.get(w) ?? []), "notable"]);
    const keyOnly = q.trades === "key";
    if (keyOnly && roles.size === 0) return [];
    const traders = keyOnly ? sql`and trader in (${sql.join([...roles.keys()].map((w) => sql`${w}`), sql`, `)})` : sql``;
    const rows = await db.execute<{
      time: string; trader: string; side: "buy" | "sell"; n: number; base: string; quote: string; price: number; at: string; signature: string;
    }>(sql`
      select extract(epoch from ${bucket("block_time")})::bigint as time, trader, side, count(*)::int as n,
        sum(base_amount)::text as base, sum(quote_amount)::text as quote,
        (array_agg(price_after order by slot desc, signature desc, event_index desc))[1] as price,
        max(block_time) as at,
        (array_agg(signature order by slot desc, signature desc, event_index desc))[1] as signature
      from trades
      where mint = ${launch!.mint} and block_time >= ${from} and block_time < ${until} ${traders}
      group by ${bucket("block_time")}, trader, side
      order by ${bucket("block_time")} desc
      limit ${TRADE_MARKS_MAX * MARKS_PER_CANDLE}`);
    const byCandle = new Map<number, TradeMark[]>();
    for (const r of rows) {
      const time = Number(r.time);
      const own = roles.get(r.trader) ?? [];
      const x = notable.get(r.trader) ?? null;
      const mark: TradeMark = {
        time,
        wallet: r.trader,
        side: r.side,
        trades: r.n,
        baseAmount: r.base,
        quoteAmount: r.quote,
        marketCap: r.price * wholeSupply,
        at: new Date(r.at).toISOString(),
        signature: r.signature,
        roles: MARK_ROLES.filter((role) => own.includes(role)),
        avatarUrl: x?.avatarUrl ?? walletAvatarUrl(cfg.publicApiUrl, r.trader),
        x,
      };
      byCandle.set(time, [...(byCandle.get(time) ?? []), mark]);
    }
    // A candle carries the marks the library can draw: the key wallets first, then the largest trades.
    const kept = [...byCandle.entries()]
      .sort(([a], [b]) => b - a)
      .flatMap(([, marks]) =>
        marks
          .sort((a, b) => rank(a.roles) - rank(b.roles) || (BigInt(b.quoteAmount) > BigInt(a.quoteAmount) ? 1 : BigInt(b.quoteAmount) < BigInt(a.quoteAmount) ? -1 : 0))
          .slice(0, MARKS_PER_CANDLE),
      )
      .slice(0, TRADE_MARKS_MAX);
    return kept.sort((a, b) => a.time - b.time || rank(a.roles) - rank(b.roles));
  }

  async function marksOfMentions(): Promise<MentionMark[]> {
    // A post sits on the candle it falls in. Candles exist only where the coin traded, so that is the latest candle at or
    // before the post, or the first candle for a post made before the coin's first trade.
    const rows = await db.execute<{
      bar: string; tweet_id: string; url: string; text: string; posted_at: string; market_cap: number | null;
      author_id: string; author_handle: string; author_name: string | null; author_avatar: boolean;
    }>(sql`
      select * from (
        select m.*, extract(epoch from coalesce(
          (select ${bucket("t.block_time")} from trades t where t.mint = m.mint and t.block_time <= m.posted_at order by t.block_time desc limit 1),
          (select ${bucket("t.block_time")} from trades t where t.mint = m.mint order by t.block_time asc limit 1)
        ))::bigint as bar
        from coin_mentions m
        where m.mint = ${launch!.mint}
      ) placed
      where bar >= ${q.from} and bar <= ${q.to}
      order by posted_at asc`);
    const perCandle = new Map<number, number>();
    const marks: MentionMark[] = [];
    for (const r of rows) {
      const time = Number(r.bar);
      const n = perCandle.get(time) ?? 0;
      if (n >= MARKS_PER_CANDLE) continue;
      perCandle.set(time, n + 1);
      marks.push({
        time,
        id: r.tweet_id,
        url: r.url,
        text: r.text,
        postedAt: new Date(r.posted_at).toISOString(),
        marketCap: r.market_cap,
        author: { handle: r.author_handle, name: r.author_name, avatarUrl: r.author_avatar ? xAvatarUrl(cfg.publicApiUrl, r.author_id) : null },
      });
    }
    return marks;
  }
});

/**
 * The wallets marked by default, each with why: the Creator, the Snipe Window's buyers (ADR 0013, as Bundle Radar counts
 * them), the largest holders by their trades, and the visitor's own wallet.
 */
async function keyWallets(db: Db, launch: { mint: string; creator: string; createdSlot: number }, windowSlots: number, you: string | undefined) {
  const rows = await db.execute<{ wallet: string; role: MarkRole }>(sql`
    select ${launch.creator} as wallet, 'creator' as role
    union all
    select distinct trader, 'sniper' from trades
      where mint = ${launch.mint} and side = 'buy' and trader <> ${launch.creator}
        and slot >= ${launch.createdSlot} and slot <= ${launch.createdSlot + windowSlots}
    union all
    (select trader, 'holder' from trades where mint = ${launch.mint}
      group by trader
      having sum(case when side = 'buy' then base_amount else -base_amount end) > 0
      order by sum(case when side = 'buy' then base_amount else -base_amount end) desc
      limit ${TOP_HOLDERS})`);
  const roles = new Map<string, MarkRole[]>();
  for (const r of rows) roles.set(r.wallet, [...(roles.get(r.wallet) ?? []), r.role]);
  if (you) roles.set(you, [...(roles.get(you) ?? []), "you"]);
  return roles;
}

/** The notable wallets that traded this coin, with the X account each is known by. */
async function notables(db: Db, mint: string, publicApiUrl: string) {
  const rows = await db.execute<{ wallet: string; handle: string; name: string | null; avatar: boolean }>(sql`
    select n.wallet, n.handle, n.name, n.avatar from notable_wallets n
    where exists (select 1 from trades t where t.mint = ${mint} and t.trader = n.wallet)`);
  return new Map<string, XAccount>(
    rows.map((r) => [r.wallet, { handle: r.handle, name: r.name, avatarUrl: r.avatar ? notableAvatarUrl(publicApiUrl, r.wallet) : null }]),
  );
}

/** The notable wallets (#160), read, added or changed, and removed by the operator. */
export const operatorMarkRoutes = new Hono<AppEnv>();

function toNotable(r: typeof notableWallets.$inferSelect, publicApiUrl: string): NotableWallet {
  return {
    wallet: r.wallet,
    x: { handle: r.handle, name: r.name, avatarUrl: r.avatar ? notableAvatarUrl(publicApiUrl, r.wallet) : null },
    addedAt: r.addedAt.toISOString(),
  };
}

operatorMarkRoutes.get("/notable-wallets", async (c) => {
  const rows = await c.get("db").select().from(notableWallets).orderBy(notableWallets.handle);
  const res: NotableWalletList = { wallets: rows.map((r) => toNotable(r, c.get("cfg").publicApiUrl)) };
  return c.json(res);
});

/** Adds a wallet, or replaces what is known of it; a picture is copied once, and refused when it can't be read as one. */
operatorMarkRoutes.post("/notable-wallets", async (c) => {
  const body = NotableWalletInput.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "invalid notable wallet", details: body.error.issues }, 400);
  const { wallet, handle, name, avatarUrl } = body.data;
  const cfg = c.get("cfg");
  const avatar = avatarUrl ? await copyPicture(c.env.METADATA_BUCKET, notableAvatarKey(wallet), avatarUrl, cfg.cluster) : false;
  if (avatarUrl && !avatar) return c.json({ error: "the picture could not be read: give an https address of a PNG, JPEG, GIF or WebP under 1 MB" }, 400);
  if (!avatarUrl) await c.env.METADATA_BUCKET.delete(notableAvatarKey(wallet));
  const values = { wallet, handle, name: name ?? null, avatar };
  const [row] = await c
    .get("db")
    .insert(notableWallets)
    .values(values)
    .onConflictDoUpdate({ target: notableWallets.wallet, set: { handle, name: values.name, avatar } })
    .returning();
  return c.json(toNotable(row!, cfg.publicApiUrl));
});

operatorMarkRoutes.delete("/notable-wallets/:wallet", async (c) => {
  const wallet = c.req.param("wallet");
  const [row] = await c.get("db").delete(notableWallets).where(eq(notableWallets.wallet, wallet)).returning();
  if (!row) return c.json({ error: "not a notable wallet" }, 404);
  await c.env.METADATA_BUCKET.delete(notableAvatarKey(wallet));
  return c.json(toNotable(row, c.get("cfg").publicApiUrl));
});
