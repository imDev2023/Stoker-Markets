import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { Connection, PublicKey } from "@solana/web3.js";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { WSOL_MINT } from "@launchpad/chain";
import {
  AnnounceRewardRules, HOLDING_WEIGHT_ONCE_BPS, REWARD_RULES_LEAD_SECONDS_MIN, REWARD_SALE_MAX_RESERVE_BPS, REWARD_SALE_SLIPPAGE_BPS, type CoinRewards,
  type RewardPayoutAssetRef, type RewardRoundDetail, type RewardRoundSummary, type RewardRulesPage, type RewardRuleVersion, type WalletHolding, type WalletRewards,
} from "@launchpad/contract";
import { launches, quoteAssets, rewardPayouts, rewardRounds, rewardRules, type Db } from "@launchpad/db";
import { operationsKey, type AppEnv } from "../env";
import { latestCheck, lotsOf } from "../rewards/checks";
import { publishedRules, rulesInForce, taxWaiting } from "../rewards/engine";
import { lotWeightBps } from "../rewards/weights";
import { quotePot, salesOf } from "../rewards/sales";
import { burnsOf } from "../rewards/burns";

/**
 * Reward Rounds, public: the rules every round follows (in force and announced), each Reward Launch's rounds and the tax
 * waiting for the next one, one round with every payout, a wallet's own Holder Rewards, so "where are my rewards?"
 * answers itself, and a wallet's Holding Lots of a coin, which are what its next round weighs it by (ADR 0022).
 */
export const rewardRoutes = new Hono<AppEnv>();

const ruleVersion = (r: typeof rewardRules.$inferSelect): RewardRuleVersion => ({
  version: r.version,
  minHolding: r.minHolding,
  roundThreshold: r.roundThreshold,
  holdingWeights: r.holdingWeights,
  note: r.note,
  announcedAt: r.announcedAt.toISOString(),
  effectiveAt: r.effectiveAt.toISOString(),
});

/** The asset a round, or a coin's next round, pays in: the coin itself, or its Quote Asset by the registry's ticker. */
export const payoutRef = (coin: { mint: string; symbol: string; decimals: number }, payoutMint: string, payoutDecimals: number, quoteSymbol: string | null): RewardPayoutAssetRef =>
  payoutMint === coin.mint
    ? { asset: "coin", mint: coin.mint, symbol: coin.symbol, decimals: coin.decimals }
    : { asset: "quote", mint: payoutMint, symbol: payoutMint === WSOL_MINT.toBase58() ? "SOL" : (quoteSymbol ?? `${payoutMint.slice(0, 4)}...`), decimals: payoutDecimals };

export const roundSummary = (r: typeof rewardRounds.$inferSelect, payout: RewardPayoutAssetRef): RewardRoundSummary => ({
  id: r.id,
  mint: r.mint,
  rulesVersion: r.rulesVersion,
  status: r.status,
  source: r.source,
  snapshotSlot: r.snapshotSlot,
  payout,
  pot: r.pot,
  sold: r.sold,
  eligibleHolders: r.eligibleHolders,
  distributable: r.distributable,
  weightedTotal: r.weightedTotal,
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

rewardRoutes.get("/rewards/rules", async (c) => {
  const { inForce, upcoming } = await publishedRules(c.get("db"));
  const res: RewardRulesPage = { inForce: inForce ? ruleVersion(inForce) : null, upcoming: upcoming.map(ruleVersion), holdingDaySeconds: c.get("cfg").holdingDaySeconds };
  return c.json(res);
});

/** A Launch with what it takes to describe its rounds. */
async function roundLaunch(db: Db, mint: string) {
  const [row] = await db
    .select({ launch: launches, quoteSymbol: quoteAssets.symbol, quoteDecimals: quoteAssets.decimals })
    .from(launches)
    .leftJoin(quoteAssets, eq(quoteAssets.mint, launches.quoteMint))
    .where(eq(launches.mint, mint))
    .limit(1);
  return row ?? null;
}

/** A Reward Launch, the same way. */
async function rewardLaunch(db: Db, mint: string) {
  const row = await roundLaunch(db, mint);
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
  // The rounds that paid out Reward Tax: a round of the Creator's earnings (ADR 0011) is on the coin's earnings.
  const rounds = await db
    .select()
    .from(rewardRounds)
    .where(and(eq(rewardRounds.mint, mint.toBase58()), eq(rewardRounds.source, "tax")))
    .orderBy(desc(rewardRounds.startedAt))
    .limit(50);
  const waiting = await taxWaiting(new Connection(cfg.rpcUrl, "confirmed"), operationsKey(c.env).publicKey, mint);
  const { inForce } = await publishedRules(db);
  const [pot, sales] = inQuote ? await Promise.all([quotePot(db, launch.mint), salesOf(db, launch.mint)]) : [waiting.held, null];
  const burns = await burnsOf(db, launch.mint);
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
    burn: {
      bps: launch.rewardBurnBps ?? 0,
      burned: burns.burned,
      recent: burns.recent.map((b) => ({ signature: b.signature, coins: b.amount, time: b.blockTime.toISOString() })),
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
  // Any coin can have a round: a standard coin whose Creator Earnings go to its holders has earnings rounds.
  const row = await roundLaunch(db, round.mint);
  if (!row) return c.json({ error: "not found" }, 404);
  const payouts = await db.select().from(rewardPayouts).where(eq(rewardPayouts.roundId, id)).orderBy(desc(rewardPayouts.amount), asc(rewardPayouts.wallet));
  const res: RewardRoundDetail = {
    ...roundSummary(round, payoutRef(row.launch, round.payoutMint, round.payoutDecimals, row.quoteSymbol)),
    payouts: payouts.map((p) => ({
      wallet: p.wallet, holding: p.holding, weightedHolding: p.weightedHolding, amount: p.amount, status: p.status, signature: p.status === "paid" ? p.signature : null,
      paidAt: p.paidAt?.toISOString() ?? null,
    })),
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
      source: r.round.source,
      holding: r.payout.holding,
      weightedHolding: r.payout.weightedHolding,
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
 * A wallet's Holding Lots of a coin (ADR 0022), as the coin's latest Holding Check left them, each with the weight its
 * coins have now under the rules in force, and what they add up to. A coin that can have no round is never checked,
 * and a wallet the last check saw nothing in has no lots: both answer with none. The treasury's lots are shown as they
 * are, and each counts once.
 */
rewardRoutes.get("/launches/:mint/holdings/:wallet", async (c) => {
  const mint = address(c.req.param("mint"), "mint").toBase58();
  const wallet = address(c.req.param("wallet"), "wallet address").toBase58();
  const db = c.get("db");
  const cfg = c.get("cfg");
  const [launch] = await db.select({ mint: launches.mint }).from(launches).where(eq(launches.mint, mint)).limit(1);
  if (!launch) return c.json({ error: "not found" }, 404);
  const now = new Date();
  const [rules, check, byWallet] = await Promise.all([rulesInForce(db, now), latestCheck(db, mint), lotsOf(db, mint, wallet)]);
  const flat = cfg.treasury?.toBase58() === wallet;
  const lots = (byWallet.get(wallet) ?? []).map((l) => ({
    amount: l.amount, since: l.since, weightBps: flat ? HOLDING_WEIGHT_ONCE_BPS : lotWeightBps(rules.holdingWeights, l.since, now, cfg.holdingDaySeconds),
  }));
  const held = lots.reduce((s, l) => s + l.amount, 0n);
  const weighted = lots.reduce((s, l) => s + l.amount * BigInt(l.weightBps), 0n);
  const res: WalletHolding = {
    mint,
    wallet,
    check: check && { checkedAt: check.checkedAt.toISOString(), slot: check.slot },
    held: held.toString(),
    lots: lots.map((l) => ({ amount: l.amount.toString(), since: l.since.toISOString(), weightBps: l.weightBps })),
    weightedHolding: weighted.toString(),
    weightBps: held === 0n ? HOLDING_WEIGHT_ONCE_BPS : Number(weighted / held),
    flat,
    rulesVersion: rules.version,
  };
  return c.json(res);
});

/**
 * Operator: announces the next rules version. It takes effect no sooner than the lead time after the announcement, so
 * holders always see a change coming; a round opened before then follows the rules in force at its snapshot. A version
 * states all of its rules, the Holding Weight's steps among them (ADR 0022): the empty list is said, never left out.
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
    .values({
      version: latest!.version + 1, minHolding: body.data.minHolding, roundThreshold: body.data.roundThreshold, holdingWeights: body.data.holdingWeights,
      note: body.data.note ?? null, announcedAt: now, effectiveAt,
    })
    .returning();
  return c.json(ruleVersion(row!), 201);
});
