import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { Connection, PublicKey } from "@solana/web3.js";
import { asc, desc, eq, sql } from "drizzle-orm";
import {
  AnnounceRewardRules, REWARD_RULES_LEAD_SECONDS_MIN, type CoinRewards, type RewardRoundDetail, type RewardRoundSummary, type RewardRulesPage,
  type RewardRuleVersion, type WalletRewards,
} from "@launchpad/contract";
import { launches, rewardPayouts, rewardRounds, rewardRules } from "@launchpad/db";
import { operationsKey, type AppEnv } from "../env";
import { publishedRules, taxWaiting } from "../rewards/engine";

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

const roundSummary = (r: typeof rewardRounds.$inferSelect): RewardRoundSummary => ({
  id: r.id,
  mint: r.mint,
  rulesVersion: r.rulesVersion,
  status: r.status,
  snapshotSlot: r.snapshotSlot,
  pot: r.pot,
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

rewardRoutes.get("/rewards/rules", async (c) => {
  const { inForce, upcoming } = await publishedRules(c.get("db"));
  const res: RewardRulesPage = { inForce: inForce ? ruleVersion(inForce) : null, upcoming: upcoming.map(ruleVersion) };
  return c.json(res);
});

/** A Reward Launch's rounds, newest first, and what is waiting to be paid, read from the chain. */
rewardRoutes.get("/launches/:mint/rewards", async (c) => {
  const mint = address(c.req.param("mint"), "mint");
  const db = c.get("db");
  const cfg = c.get("cfg");
  const [launch] = await db.select({ rewardTaxBps: launches.rewardTaxBps }).from(launches).where(eq(launches.mint, mint.toBase58())).limit(1);
  if (!launch || launch.rewardTaxBps === null) return c.json({ error: "not a Reward Launch" }, 404);
  const rounds = await db.select().from(rewardRounds).where(eq(rewardRounds.mint, mint.toBase58())).orderBy(desc(rewardRounds.startedAt)).limit(50);
  const waiting = await taxWaiting(new Connection(cfg.rpcUrl, "confirmed"), operationsKey(c.env).publicKey, mint);
  const { inForce } = await publishedRules(db);
  const res: CoinRewards = {
    mint: mint.toBase58(),
    rewardTaxBps: launch.rewardTaxBps,
    waiting: { inAccounts: waiting.inAccounts.toString(), inMint: waiting.inMint.toString(), collected: waiting.held.toString(), total: waiting.total.toString() },
    rules: inForce ? ruleVersion(inForce) : null,
    rounds: rounds.map(roundSummary),
  };
  return c.json(res);
});

rewardRoutes.get("/rewards/rounds/:id", async (c) => {
  const id = c.req.param("id");
  if (!/^[0-9a-f-]{36}$/.test(id)) return c.json({ error: "not found" }, 404);
  const db = c.get("db");
  const [round] = await db.select().from(rewardRounds).where(eq(rewardRounds.id, id)).limit(1);
  if (!round) return c.json({ error: "not found" }, 404);
  const payouts = await db.select().from(rewardPayouts).where(eq(rewardPayouts.roundId, id)).orderBy(desc(rewardPayouts.amount), asc(rewardPayouts.wallet));
  const res: RewardRoundDetail = {
    ...roundSummary(round),
    payouts: payouts.map((p) => ({ wallet: p.wallet, holding: p.holding, amount: p.amount, status: p.status, signature: p.status === "paid" ? p.signature : null, paidAt: p.paidAt?.toISOString() ?? null })),
  };
  return c.json(res);
});

/** Every Holder Reward a wallet was paid or is owed, across every Reward Launch, newest round first. */
rewardRoutes.get("/wallets/:address/rewards", async (c) => {
  const wallet = address(c.req.param("address"), "wallet address").toBase58();
  const rows = await c
    .get("db")
    .select({ payout: rewardPayouts, round: rewardRounds, symbol: launches.symbol, name: launches.name, decimals: launches.decimals })
    .from(rewardPayouts)
    .innerJoin(rewardRounds, eq(rewardRounds.id, rewardPayouts.roundId))
    .innerJoin(launches, eq(launches.mint, rewardRounds.mint))
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
