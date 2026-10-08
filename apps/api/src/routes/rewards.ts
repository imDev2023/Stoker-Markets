import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { Connection, PublicKey } from "@solana/web3.js";
import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { WSOL_MINT } from "@launchpad/chain";
import {
  AnnounceRewardRules, REWARD_RULES_LEAD_SECONDS_MIN, REWARD_SALE_MAX_RESERVE_BPS, REWARD_SALE_SLIPPAGE_BPS, type CoinRewards, type MarketValue,
  type RewardLaunchStanding, type RewardPayoutAssetRef, type RewardRoundDetail, type RewardRoundInOverview, type RewardRoundSummary, type RewardRulesPage,
  type RewardRuleVersion, type RewardsOverview, type RewardValue, type WalletRewards,
} from "@launchpad/contract";
import { launches, launchMarkets, launchMetadata, quoteAssets, rewardPayouts, rewardRounds, rewardRules, type Db } from "@launchpad/db";
import { operationsKey, type AppEnv, type Config } from "../env";
import { toQuoteRef } from "../quotes/assets";
import { publishedRules, taxWaiting } from "../rewards/engine";
import { quotePot, salesOf } from "../rewards/sales";

/**
 * Reward Rounds, public: the rules every round follows (in force and announced), each Reward Launch's rounds and the tax
 * waiting for the next one, one round with every payout, and a wallet's own Holder Rewards, so "where are my rewards?"
 * answers itself.
 */
export const rewardRoutes = new Hono<AppEnv>();

const ruleVersion = (r: typeof rewardRules.$inferSelect): RewardRuleVersion => ({
  version: r.version,
  minHolding: r.minHolding,
  roundThreshold: r.roundThreshold,
  note: r.note,
  announcedAt: r.announcedAt.toISOString(),
  effectiveAt: r.effectiveAt.toISOString(),
});

/** The asset a round, or a coin's next round, pays in: the coin itself, or its Quote Asset by the registry's ticker. */
const payoutRef = (coin: { mint: string; symbol: string; decimals: number }, payoutMint: string, payoutDecimals: number, quoteSymbol: string | null): RewardPayoutAssetRef =>
  payoutMint === coin.mint
    ? { asset: "coin", mint: coin.mint, symbol: coin.symbol, decimals: coin.decimals }
    : { asset: "quote", mint: payoutMint, symbol: payoutMint === WSOL_MINT.toBase58() ? "SOL" : (quoteSymbol ?? `${payoutMint.slice(0, 4)}...`), decimals: payoutDecimals };

const roundSummary = (r: typeof rewardRounds.$inferSelect, payout: RewardPayoutAssetRef): RewardRoundSummary => ({
  id: r.id,
  mint: r.mint,
  rulesVersion: r.rulesVersion,
  status: r.status,
  snapshotSlot: r.snapshotSlot,
  payout,
  pot: r.pot,
  sold: r.sold,
  eligibleHolders: r.eligibleHolders,
  distributable: r.distributable,
  paid: r.paid,
  startedAt: r.startedAt.toISOString(),
  finishedAt: r.finishedAt?.toISOString() ?? null,
});

function address(value: string, what: string) {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) throw new HTTPException(400, { message: `invalid ${what}` });
  try {
    return new PublicKey(value);
  } catch {
    throw new HTTPException(400, { message: `invalid ${what}` });
  }
}

/** Postgres returns doubles computed from numerics as numbers or strings depending on the path; normalise to a number. */
const num = (v: number | string | null | undefined) => (v === null || v === undefined ? null : Number(v));

/** A launched coin's image, served by the API once its metadata is stored. */
const imageOf = (cfg: Config, mint: string, metadata: unknown) => (metadata ? `${cfg.publicApiUrl}/metadata/${mint}/image` : null);

/** The board's market cap: the coin's latest price times its supply, in the Quote Asset, SOL and USD. */
function marketCapOf(launch: { supply: string; decimals: number }, market: { price: number } | null, quote: { priceSol: string | null; priceUsd: string | null }): MarketValue | null {
  if (!market) return null;
  const cap = market.price * (Number(launch.supply) / 10 ** launch.decimals);
  return { quote: cap, sol: quote.priceSol === null ? null : cap * Number(quote.priceSol), usd: quote.priceUsd === null ? null : cap * Number(quote.priceUsd) };
}

/** `amount` raw units of a Payout Asset, each worth `unitSol` and `unitUsd` now. */
const valueOf = (amount: string, unitSol: number | string | null, unitUsd: number | string | null): RewardValue => ({
  sol: unitSol === null ? null : Number(amount) * Number(unitSol),
  usd: unitUsd === null ? null : Number(amount) * Number(unitUsd),
});

/**
 * Every round across every Reward Launch in one view, valued at each Payout Asset's price now (see RewardsOverview in
 * the contract): the totals, the Reward Launches ranked by what their rounds have paid, and the latest rounds.
 */
rewardRoutes.get("/rewards", async (c) => {
  const db = c.get("db");
  const cfg = c.get("cfg");
  // What one raw unit of a round's Payout Asset is worth now: a coin payout at the coin's latest price in its Quote
  // Asset times that asset's price, a Quote Asset payout at that asset's own registry price; null where there is none.
  const payoutQuote = alias(quoteAssets, "payout_quote");
  const unit = (quotePrice: SQL, payoutPrice: SQL) =>
    sql<number | null>`(case when ${rewardRounds.payoutMint} = ${launches.mint} then ${launchMarkets.price} * ${quotePrice} else ${payoutPrice} end) / power(10::double precision, ${rewardRounds.payoutDecimals})`;
  // Each round with what its landed payouts add up to, and its unit values.
  const valued = db.$with("valued").as(
    db
      .select({
        id: rewardRounds.id,
        mint: rewardRounds.mint,
        paid: sql<string>`coalesce(sum(${rewardPayouts.amount}) filter (where ${rewardPayouts.status} = 'paid'), 0)`.as("paid"),
        payouts: sql<number>`(count(*) filter (where ${rewardPayouts.status} = 'paid'))::int`.as("payouts"),
        unitSol: unit(sql`${quoteAssets.priceSol}::double precision`, sql`${payoutQuote.priceSol}::double precision`).as("unit_sol"),
        unitUsd: unit(sql`${quoteAssets.priceUsd}::double precision`, sql`${payoutQuote.priceUsd}::double precision`).as("unit_usd"),
      })
      .from(rewardRounds)
      .innerJoin(launches, eq(launches.mint, rewardRounds.mint))
      .leftJoin(rewardPayouts, eq(rewardPayouts.roundId, rewardRounds.id))
      .leftJoin(launchMarkets, eq(launchMarkets.mint, launches.mint))
      .leftJoin(quoteAssets, eq(quoteAssets.mint, launches.quoteMint))
      .leftJoin(payoutQuote, eq(payoutQuote.mint, rewardRounds.payoutMint))
      .groupBy(rewardRounds.id, launches.mint, launchMarkets.mint, quoteAssets.mint, payoutQuote.mint),
  );
  const worth = (amount: SQL | typeof valued.paid, per: typeof valued.unitSol) => sql`${amount}::double precision * ${per}`;

  const [totals, lastPaid, [wallets], standings] = await Promise.all([
    db
      .with(valued)
      .select({
        usd: sql<number | null>`sum(${worth(valued.paid, valued.unitUsd)})`,
        sol: sql<number | null>`sum(${worth(valued.paid, valued.unitSol)})`,
        unpriced: sql<number>`(count(*) filter (where ${valued.unitUsd} is null))::int`,
        payouts: sql<number>`coalesce(sum(${valued.payouts}), 0)::int`,
        rounds: sql<number>`(count(*) filter (where ${valued.payouts} > 0))::int`,
        launches: sql<number>`(count(distinct ${valued.mint}) filter (where ${valued.payouts} > 0))::int`,
      })
      .from(valued)
      .then((rows) => rows[0]!),
    db.select({ at: rewardPayouts.paidAt }).from(rewardPayouts).where(eq(rewardPayouts.status, "paid")).orderBy(desc(rewardPayouts.paidAt)).limit(1),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(
        db
          .select({ mint: rewardRounds.mint, wallet: rewardPayouts.wallet })
          .from(rewardPayouts)
          .innerJoin(rewardRounds, eq(rewardRounds.id, rewardPayouts.roundId))
          .where(eq(rewardPayouts.status, "paid"))
          .groupBy(rewardRounds.mint, rewardPayouts.wallet)
          .as("paid_wallets"),
      ),
    db
      .with(valued)
      .select({
        mint: valued.mint,
        paid: sql<string>`sum(${valued.paid})::text`,
        usd: sql<number | null>`sum(${worth(valued.paid, valued.unitUsd)})`,
        sol: sql<number | null>`sum(${worth(valued.paid, valued.unitSol)})`,
        rounds: sql<number>`(count(*) filter (where ${valued.payouts} > 0))::int`,
      })
      .from(valued)
      .groupBy(valued.mint)
      .having(sql`sum(${valued.payouts}) > 0`)
      .orderBy(sql`sum(${worth(valued.paid, valued.unitUsd)}) desc nulls last`, sql`sum(${valued.paid}) desc`)
      .limit(10),
  ]);

  const topMints = standings.map((s) => s.mint);
  const [details, walletsByMint] = topMints.length
    ? await Promise.all([
        db
          .select({ launch: launches, metadata: launchMetadata, quote: quoteAssets, market: launchMarkets })
          .from(launches)
          .innerJoin(quoteAssets, eq(quoteAssets.mint, launches.quoteMint))
          .leftJoin(launchMetadata, eq(launchMetadata.id, launches.mint))
          .leftJoin(launchMarkets, eq(launchMarkets.mint, launches.mint))
          .where(inArray(launches.mint, topMints)),
        db
          .select({ mint: rewardRounds.mint, wallets: sql<number>`count(distinct ${rewardPayouts.wallet})::int` })
          .from(rewardPayouts)
          .innerJoin(rewardRounds, eq(rewardRounds.id, rewardPayouts.roundId))
          .where(and(eq(rewardPayouts.status, "paid"), inArray(rewardRounds.mint, topMints)))
          .groupBy(rewardRounds.mint),
      ])
    : [[], []];
  const top = standings.flatMap((s): RewardLaunchStanding[] => {
    const d = details.find((r) => r.launch.mint === s.mint);
    if (!d) return [];
    const inQuote = d.launch.rewardPayout === "quote";
    return [{
      mint: s.mint,
      symbol: d.launch.symbol,
      name: d.launch.name,
      image: imageOf(cfg, s.mint, d.metadata),
      quote: toQuoteRef(d.quote),
      rewardTaxBps: d.launch.rewardTaxBps ?? 0,
      payout: payoutRef(d.launch, inQuote ? d.launch.quoteMint : d.launch.mint, inQuote ? d.quote.decimals : d.launch.decimals, d.quote.symbol),
      rounds: s.rounds,
      walletsPaid: walletsByMint.find((w) => w.mint === s.mint)?.wallets ?? 0,
      paid: s.paid,
      value: { sol: num(s.sol), usd: num(s.usd) },
      marketCap: marketCapOf(d.launch, d.market, d.quote),
    }];
  });

  const latest = await db
    .with(valued)
    .select({ round: rewardRounds, unitSol: valued.unitSol, unitUsd: valued.unitUsd, launch: launches, metadata: launchMetadata, quoteSymbol: quoteAssets.symbol })
    .from(rewardRounds)
    .innerJoin(valued, eq(valued.id, rewardRounds.id))
    .innerJoin(launches, eq(launches.mint, rewardRounds.mint))
    .leftJoin(launchMetadata, eq(launchMetadata.id, launches.mint))
    .leftJoin(quoteAssets, eq(quoteAssets.mint, launches.quoteMint))
    .orderBy(desc(rewardRounds.startedAt), desc(rewardRounds.id))
    .limit(20);
  const recent = latest.map((r): RewardRoundInOverview => ({
    ...roundSummary(r.round, payoutRef(r.launch, r.round.payoutMint, r.round.payoutDecimals, r.quoteSymbol)),
    symbol: r.launch.symbol,
    name: r.launch.name,
    image: imageOf(cfg, r.launch.mint, r.metadata),
    value: valueOf(r.round.distributable, r.unitSol, r.unitUsd),
  }));

  const res: RewardsOverview = {
    totals: {
      paidUsd: num(totals.usd) ?? 0,
      paidSol: num(totals.sol) ?? 0,
      unpricedRounds: totals.unpriced,
      payouts: totals.payouts,
      rounds: totals.rounds,
      lastPaidAt: lastPaid[0]?.at?.toISOString() ?? null,
      launchesPaid: totals.launches,
      walletsPaid: wallets?.n ?? 0,
    },
    top,
    recent,
  };
  return c.json(res);
});

rewardRoutes.get("/rewards/rules", async (c) => {
  const { inForce, upcoming } = await publishedRules(c.get("db"));
  const res: RewardRulesPage = { inForce: inForce ? ruleVersion(inForce) : null, upcoming: upcoming.map(ruleVersion) };
  return c.json(res);
});

/** A Reward Launch with what the engine needs to describe its rounds. */
async function rewardLaunch(db: Db, mint: string) {
  const [row] = await db
    .select({ launch: launches, quoteSymbol: quoteAssets.symbol, quoteDecimals: quoteAssets.decimals })
    .from(launches)
    .leftJoin(quoteAssets, eq(quoteAssets.mint, launches.quoteMint))
    .where(eq(launches.mint, mint))
    .limit(1);
  return row && row.launch.rewardTaxBps !== null ? row : null;
}

/** A Reward Launch's rounds, newest first, and what is waiting to be paid, read from the chain and, for a Quote Asset payout, from its sales. */
rewardRoutes.get("/launches/:mint/rewards", async (c) => {
  const mint = address(c.req.param("mint"), "mint");
  const db = c.get("db");
  const cfg = c.get("cfg");
  const row = await rewardLaunch(db, mint.toBase58());
  if (!row) return c.json({ error: "not a Reward Launch" }, 404);
  const { launch } = row;
  const inQuote = launch.rewardPayout === "quote";
  const payout = payoutRef(launch, inQuote ? launch.quoteMint : launch.mint, inQuote ? (row.quoteDecimals ?? 9) : launch.decimals, row.quoteSymbol);
  const rounds = await db.select().from(rewardRounds).where(eq(rewardRounds.mint, mint.toBase58())).orderBy(desc(rewardRounds.startedAt)).limit(50);
  const waiting = await taxWaiting(new Connection(cfg.rpcUrl, "confirmed"), operationsKey(c.env).publicKey, mint);
  const { inForce } = await publishedRules(db);
  const [pot, sales] = inQuote ? await Promise.all([quotePot(db, launch.mint), salesOf(db, launch.mint)]) : [waiting.held, null];
  const res: CoinRewards = {
    mint: mint.toBase58(),
    rewardTaxBps: launch.rewardTaxBps!,
    payout,
    waiting: {
      inAccounts: waiting.inAccounts.toString(), inMint: waiting.inMint.toString(), collected: waiting.held.toString(), total: waiting.total.toString(), pot: pot.toString(),
    },
    sales: sales && {
      maxReserveBps: REWARD_SALE_MAX_RESERVE_BPS,
      slippageBps: REWARD_SALE_SLIPPAGE_BPS,
      sold: sales.sold,
      proceeds: sales.proceeds,
      recent: sales.recent.map((s) => ({
        signature: s.signature, venue: s.venue, status: s.status, coins: s.coins, proceeds: s.proceeds, time: (s.blockTime ?? s.createdAt).toISOString(),
      })),
    },
    rules: inForce ? ruleVersion(inForce) : null,
    rounds: rounds.map((r) => roundSummary(r, payoutRef(launch, r.payoutMint, r.payoutDecimals, row.quoteSymbol))),
  };
  return c.json(res);
});

rewardRoutes.get("/rewards/rounds/:id", async (c) => {
  const id = c.req.param("id");
  if (!/^[0-9a-f-]{36}$/.test(id)) return c.json({ error: "not found" }, 404);
  const db = c.get("db");
  const [round] = await db.select().from(rewardRounds).where(eq(rewardRounds.id, id)).limit(1);
  if (!round) return c.json({ error: "not found" }, 404);
  const row = await rewardLaunch(db, round.mint);
  if (!row) return c.json({ error: "not found" }, 404);
  const payouts = await db.select().from(rewardPayouts).where(eq(rewardPayouts.roundId, id)).orderBy(desc(rewardPayouts.amount), asc(rewardPayouts.wallet));
  const res: RewardRoundDetail = {
    ...roundSummary(round, payoutRef(row.launch, round.payoutMint, round.payoutDecimals, row.quoteSymbol)),
    payouts: payouts.map((p) => ({ wallet: p.wallet, holding: p.holding, amount: p.amount, status: p.status, signature: p.status === "paid" ? p.signature : null, paidAt: p.paidAt?.toISOString() ?? null })),
  };
  return c.json(res);
});

/** Every Holder Reward a wallet was paid or is owed, across every Reward Launch, newest round first. */
rewardRoutes.get("/wallets/:address/rewards", async (c) => {
  const wallet = address(c.req.param("address"), "wallet address").toBase58();
  const rows = await c
    .get("db")
    .select({ payout: rewardPayouts, round: rewardRounds, symbol: launches.symbol, name: launches.name, decimals: launches.decimals, quoteSymbol: quoteAssets.symbol })
    .from(rewardPayouts)
    .innerJoin(rewardRounds, eq(rewardRounds.id, rewardPayouts.roundId))
    .innerJoin(launches, eq(launches.mint, rewardRounds.mint))
    .leftJoin(quoteAssets, eq(quoteAssets.mint, rewardRounds.payoutMint))
    .where(eq(rewardPayouts.wallet, wallet))
    .orderBy(desc(rewardRounds.startedAt))
    .limit(200);
  const res: WalletRewards = {
    wallet,
    rewards: rows.map((r) => ({
      round: r.round.id,
      mint: r.round.mint,
      symbol: r.symbol,
      name: r.name,
      decimals: r.decimals,
      payout: payoutRef({ mint: r.round.mint, symbol: r.symbol, decimals: r.decimals }, r.round.payoutMint, r.round.payoutDecimals, r.quoteSymbol),
      holding: r.payout.holding,
      amount: r.payout.amount,
      status: r.payout.status,
      signature: r.payout.status === "paid" ? r.payout.signature : null,
      paidAt: r.payout.paidAt?.toISOString() ?? null,
      snapshotSlot: r.round.snapshotSlot,
      roundStartedAt: r.round.startedAt.toISOString(),
    })),
  };
  return c.json(res);
});

/**
 * Operator: announces the next rules version. It takes effect no sooner than the lead time after the announcement, so
 * holders always see a change coming; a round opened before then follows the rules in force at its snapshot.
 */
export const operatorRewardRoutes = new Hono<AppEnv>();

operatorRewardRoutes.post("/rewards/rules", async (c) => {
  const body = AnnounceRewardRules.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "invalid rules", details: body.error.issues }, 400);
  const db = c.get("db");
  const cfg = c.get("cfg");
  const now = new Date();
  const effectiveAt = new Date(body.data.effectiveAt);
  const lead = Math.max(cfg.rewardRulesLeadSeconds, REWARD_RULES_LEAD_SECONDS_MIN);
  if (effectiveAt.getTime() < now.getTime() + lead * 1000)
    return c.json({ error: `Rules take effect no sooner than ${lead} seconds after they are announced, so holders see the change coming.` }, 422);
  const [latest] = await db.select({ version: sql<number>`coalesce(max(${rewardRules.version}), 0)::int` }).from(rewardRules);
  const [row] = await db
    .insert(rewardRules)
    .values({ version: latest!.version + 1, minHolding: body.data.minHolding, roundThreshold: body.data.roundThreshold, note: body.data.note ?? null, announcedAt: now, effectiveAt })
    .returning();
  return c.json(ruleVersion(row!), 201);
});
