import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { Connection, PublicKey, type ParsedAccountData } from "@solana/web3.js";
import { and, asc, count, desc, eq, sql, type SQL } from "drizzle-orm";
import { cpmmPdas, launchlabPdas, programsFor } from "@launchpad/chain";
import {
  LaunchListQuery, type Holder, type HolderKind, type HolderList, type LaunchList, type LaunchQuoteList, type LaunchSummary,
  type MarketValue,
} from "@launchpad/contract";
import { curves, graduations, launches, launchMarkets, launchMetadata, quoteAssets, trades, type Db } from "@launchpad/db";
import type { AppEnv, Config } from "../env";
import { toQuoteRef } from "../quotes/assets";
import { curveProgress } from "./trades";

/** The read API for Launches: the board's sorted and filtered list, one Launch, the Quote Assets in use, and holders. */
export const launchRoutes = new Hono<AppEnv>();

type Filters = Omit<LaunchListQuery, "limit" | "offset" | "sort"> & { mint?: string };

/**
 * The Launches matching `filters`, each with its market figures, in `sort` order.
 * Every figure comes from what the Indexer wrote, whatever the venue: the status from the Launch's curve and Graduation, the
 * price from its latest trade on the curve or in its pool (launch_markets), the volume from its trades, and SOL and USD
 * values from the Quote Registry's prices.
 */
async function queryLaunches(db: Db, filters: Filters, sort: LaunchListQuery["sort"] = "new", limit = 1, offset = 0) {
  const volume = db.$with("volume").as(
    db
      .select({ mint: trades.mint, raw: sql<string>`sum(${trades.quoteAmount})`.as("raw") })
      .from(trades)
      .where(sql`${trades.blockTime} > now() - interval '24 hours'`)
      .groupBy(trades.mint),
  );
  // Graduated once Raydium has migrated it (the same rule as curveProgress); otherwise the curve's status, live until it
  // sells out. A Launch nobody has traded yet has no curve row.
  const status = sql<string>`case when ${graduations.mint} is not null then 'graduated' else coalesce(${curves.status}, 'live') end`;
  const whole = (raw: SQL | typeof launches.supply, decimals: SQL | typeof launches.decimals) =>
    sql`(${raw}::double precision / power(10::double precision, ${decimals}))`;
  const capQuote = sql`(${launchMarkets.price} * ${whole(launches.supply, launches.decimals)})`;
  const volRaw = sql`coalesce(${volume.raw}, 0)`;
  const volQuote = whole(volRaw, sql`${quoteAssets.decimals}`);
  const inSol = (v: SQL) => sql<number | null>`${v} * ${quoteAssets.priceSol}::double precision`;
  const inUsd = (v: SQL) => sql<number | null>`${v} * ${quoteAssets.priceUsd}::double precision`;
  const progress = sql`coalesce(${curves.realQuote}, 0) / nullif(${launches.graduationTarget}, 0)`;

  const order: Record<LaunchListQuery["sort"], SQL[]> = {
    new: [],
    trending: [sql`${inSol(volQuote)} desc nulls last`, sql`${launchMarkets.lastTradeAt} desc nulls last`],
    market_cap: [sql`${inSol(capQuote)} desc nulls last`],
    graduation: [sql`case ${status} when 'live' then 0 when 'graduating' then 1 else 2 end`, sql`${progress} desc nulls last`],
  };
  const where = and(
    filters.mint ? eq(launches.mint, filters.mint) : undefined,
    filters.quote ? eq(launches.quoteMint, filters.quote) : undefined,
    filters.category ? eq(quoteAssets.category, filters.category) : undefined,
    filters.status ? sql`${status} = ${filters.status}` : undefined,
    filters.creator ? eq(launches.creator, filters.creator) : undefined,
  );

  return db
    .with(volume)
    .select({
      launch: launches,
      metadata: launchMetadata,
      curve: curves,
      graduation: graduations,
      quote: quoteAssets,
      market: launchMarkets,
      capQuote: sql<number | null>`${capQuote}`,
      capSol: inSol(capQuote),
      capUsd: inUsd(capQuote),
      volRaw: sql<string>`${volRaw}::text`,
      volQuote: sql<number>`${volQuote}`,
      volSol: inSol(volQuote),
      volUsd: inUsd(volQuote),
    })
    .from(launches)
    .leftJoin(launchMetadata, eq(launchMetadata.id, launches.mint))
    .leftJoin(curves, eq(curves.mint, launches.mint))
    .leftJoin(graduations, eq(graduations.mint, launches.mint))
    .leftJoin(launchMarkets, eq(launchMarkets.mint, launches.mint))
    .leftJoin(volume, eq(volume.mint, launches.mint))
    // Amounts need the Quote Asset's decimals, so a Launch shows once the registry lists its Quote Asset. Every Launch the API
    // built already is; only one sent straight to a GlobalConfig newer than the last refresh waits for the next one.
    .innerJoin(quoteAssets, eq(quoteAssets.mint, launches.quoteMint))
    .where(where)
    .orderBy(...order[sort], desc(launches.createdSlot), asc(launches.mint))
    .limit(limit)
    .offset(offset);
}

type Row = Awaited<ReturnType<typeof queryLaunches>>[number];

/** Postgres returns doubles computed from numerics as numbers or strings depending on the path; normalise to a number. */
const num = (v: number | string | null) => (v === null ? null : Number(v));

function toSummary(cfg: Config, r: Row): LaunchSummary {
  const l = r.launch;
  const m = r.metadata;
  const cap: MarketValue | null = r.capQuote === null ? null : { quote: num(r.capQuote)!, sol: num(r.capSol), usd: num(r.capUsd) };
  return {
    mint: l.mint,
    pool: l.pool,
    creator: l.creator,
    quote: toQuoteRef(r.quote),
    name: l.name,
    symbol: l.symbol,
    metadataUri: l.metadataUri,
    image: m ? `${cfg.publicApiUrl}/metadata/${l.mint}/image` : null,
    description: m?.description ?? null,
    links: { website: m?.website ?? null, x: m?.x ?? null, telegram: m?.telegram ?? null },
    graduationTarget: l.graduationTarget,
    curve: curveProgress(r.curve, r.graduation !== null),
    graduation: r.graduation && {
      pool: r.graduation.pool,
      signature: r.graduation.signature,
      graduatedAt: r.graduation.graduatedAt.toISOString(),
      price: r.graduation.price,
    },
    market: {
      price: r.market?.price ?? null,
      marketCap: cap,
      volume24h: { raw: r.volRaw, quote: num(r.volQuote)!, sol: num(r.volSol), usd: num(r.volUsd) },
      lastTradeAt: r.market?.lastTradeAt?.toISOString() ?? null,
    },
    createdSignature: l.createdSignature,
    createdAt: l.createdAt.toISOString(),
  };
}

/** The board: every Launch, sorted and filtered (see LaunchListQuery), a page at a time. */
launchRoutes.get("/launches", async (c) => {
  const query = LaunchListQuery.safeParse(c.req.query());
  if (!query.success) return c.json({ error: "invalid launch list query", details: query.error.issues }, 400);
  const { sort, limit, offset, ...filters } = query.data;
  const rows = await queryLaunches(c.get("db"), filters, sort, limit + 1, offset);
  const body: LaunchList = {
    launches: rows.slice(0, limit).map((r) => toSummary(c.get("cfg"), r)),
    nextOffset: rows.length > limit ? offset + limit : null,
  };
  return c.json(body);
});

/** The Quote Assets Launches are paired with, most used first: the choices a Quote Asset filter can offer. */
launchRoutes.get("/launches/quotes", async (c) => {
  const launchCount = count(launches.mint);
  const rows = await c
    .get("db")
    .select({ quote: quoteAssets, launches: launchCount })
    .from(launches)
    .innerJoin(quoteAssets, eq(quoteAssets.mint, launches.quoteMint))
    .groupBy(quoteAssets.mint)
    .orderBy(desc(launchCount), sql`${quoteAssets.symbol} asc nulls last`, asc(quoteAssets.mint));
  const body: LaunchQuoteList = { quotes: rows.map((r) => ({ ...toQuoteRef(r.quote), launches: r.launches })) };
  return c.json(body);
});

launchRoutes.get("/launches/:mint", async (c) => {
  const [row] = await queryLaunches(c.get("db"), { mint: c.req.param("mint") });
  if (!row) return c.json({ error: "launch not found" }, 404);
  return c.json(toSummary(c.get("cfg"), row));
});

/** How many of the largest token accounts the chain reports: getTokenLargestAccounts returns at most 20. */
const HOLDER_ACCOUNTS = 20;

/**
 * The coin's top holders and the Creator's holding, read from the chain rather than summed from indexed trades: balances
 * also move by plain transfers, airdrops and Reward Tax, none of which are trades. Program-owned holdings are labelled by
 * their owner, the curve's vault authority before Graduation and the CPMM pool authority after, so the list stays right as
 * the coins move from the curve to the pool.
 */
launchRoutes.get("/launches/:mint/holders", async (c) => {
  const cfg = c.get("cfg");
  const [launch] = await c
    .get("db")
    .select({ mint: launches.mint, creator: launches.creator })
    .from(launches)
    .where(eq(launches.mint, c.req.param("mint")))
    .limit(1);
  if (!launch) return c.json({ error: "launch not found" }, 404);
  const mint = new PublicKey(launch.mint);
  const creator = new PublicKey(launch.creator);
  const connection = new Connection(cfg.rpcUrl, "confirmed");

  const [largest, supply, creatorAccounts, [bought]] = await Promise.all([
    connection.getTokenLargestAccounts(mint, "confirmed"),
    connection.getTokenSupply(mint, "confirmed"),
    connection.getParsedTokenAccountsByOwner(creator, { mint }, "confirmed"),
    c.get("db")
      .select({ n: count() })
      .from(trades)
      .where(and(eq(trades.mint, launch.mint), eq(trades.trader, launch.creator), eq(trades.side, "buy"))),
  ]).catch((e: unknown) => {
    console.error("reading holders failed", e);
    throw new HTTPException(503, { message: "Couldn't read this coin's holders from the chain. Try again in a moment." });
  });
  const accounts = largest.value.filter((a) => a.amount !== "0").slice(0, HOLDER_ACCOUNTS);
  const parsed = await connection.getMultipleParsedAccounts(accounts.map((a) => a.address), { commitment: "confirmed" });

  const total = BigInt(supply.value.amount);
  const share = (amount: bigint) => (total === 0n ? 0 : Number((amount * 1_000_000_000n) / total) / 1_000_000_000);
  const labels = new Map<string, HolderKind>([
    [launchlabPdas(cfg.launchlab).authority.toBase58(), "curve"],
    [cpmmPdas(programsFor(cfg.cluster).cpmm).authority.toBase58(), "pool"],
    [launch.creator, "creator"],
  ]);
  const byOwner = new Map<string, bigint>();
  accounts.forEach((a, i) => {
    const data = parsed.value[i]?.data as ParsedAccountData | undefined;
    const owner = (data?.parsed as { info?: { owner?: string } } | undefined)?.info?.owner;
    if (owner) byOwner.set(owner, (byOwner.get(owner) ?? 0n) + BigInt(a.amount));
  });
  const holders: Holder[] = [...byOwner]
    .sort(([, a], [, b]) => (a === b ? 0 : a > b ? -1 : 1))
    .map(([owner, amount]) => ({ owner, kind: labels.get(owner) ?? "holder", amount: amount.toString(), share: share(amount) }));

  const held = creatorAccounts.value.reduce((sum, a) => sum + BigInt((a.account.data.parsed as { info: { tokenAmount: { amount: string } } }).info.tokenAmount.amount), 0n);
  const body: HolderList = {
    slot: largest.context.slot,
    supply: total.toString(),
    holders,
    creator: {
      address: launch.creator,
      amount: held.toString(),
      share: share(held),
      status: held > 0n ? "holding" : (bought?.n ?? 0) > 0 ? "sold" : "none",
    },
  };
  return c.json(body);
});
