import { z } from "zod";
import { RewardPayoutAsset } from "./launchModes";

/**
 * What a Reward Round pays out (ADR 0011): `tax`, a Reward Launch's collected Reward Tax, or `earnings`, the Creator's
 * share of platform revenue on a coin whose Creator Earnings go to its holders, always in the Quote Asset. The two have
 * separate pots, and a coin may have one round of each paying at a time.
 */
export const RewardRoundSource = z.enum(["tax", "earnings"]);
export type RewardRoundSource = z.infer<typeof RewardRoundSource>;

/**
 * Reward Rounds: how a Reward Launch's collected Reward Tax reaches its holders, all public: the rules in force, each
 * round's snapshot and payouts, Reward Sales where the Payout Asset is the Quote Asset, and any wallet's own Holder
 * Rewards. Holdings and the rules are raw units of the coin; a pot and its payouts are raw units of the Payout Asset.
 */

const base58 = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "must be a base58 address");
const raw = z.string().regex(/^\d+$/, "must be a whole number of raw units");

/** A rules change takes effect no sooner than this after it is announced, so holders always see it coming. */
export const REWARD_RULES_LEAD_SECONDS_MIN = 60;

/**
 * The bounds of a Reward Sale (ADR 0006, #43): one slice per coin per run of the Reward Engine, at most this share of the
 * coins the market holds against the Quote Asset (about 1% of price on a constant-product market), sold with this
 * slippage limit under its quote so a worse fill fails whole.
 */
export const REWARD_SALE_MAX_RESERVE_BPS = 50;
export const REWARD_SALE_SLIPPAGE_BPS = 100;

/** The asset a round pays in: the coin itself or its Quote Asset. SOL is the wrapped-SOL mint, paid as plain SOL. */
export const RewardPayoutAssetRef = z.object({
  asset: RewardPayoutAsset,
  mint: base58,
  symbol: z.string(),
  decimals: z.number().int(),
});
export type RewardPayoutAssetRef = z.infer<typeof RewardPayoutAssetRef>;

/** What a coin counts for in a Reward Round until its Holding Lot has reached a step: once, in basis points. */
export const HOLDING_WEIGHT_ONCE_BPS = 10_000;
/** The most a step of the Holding Weight may count a coin for: five times (ADR 0022). */
export const HOLDING_WEIGHT_MAX_BPS = 50_000;
/** The most steps one rules version may carry. */
export const HOLDING_WEIGHT_STEPS_MAX = 6;

/**
 * One step of the Holding Weight (ADR 0022): a coin whose Holding Lot is at least `afterDays` Holding Days old counts
 * `weightBps` in a Reward Round, 15000 being one and a half times. A coin counts once until its lot reaches the first step.
 */
export const HoldingWeightStep = z.object({
  afterDays: z.number().int().min(1).max(3650),
  weightBps: z.number().int().gt(HOLDING_WEIGHT_ONCE_BPS).max(HOLDING_WEIGHT_MAX_BPS),
});
export type HoldingWeightStep = z.infer<typeof HoldingWeightStep>;

/**
 * A rules version's steps, shortest first: each step longer and heavier than the one before, at most
 * `HOLDING_WEIGHT_STEPS_MAX` of them. The empty list is the rule without a Holding Weight: every coin counts once.
 */
export const HoldingWeights = z
  .array(HoldingWeightStep)
  .max(HOLDING_WEIGHT_STEPS_MAX)
  .superRefine((steps, ctx) => {
    steps.forEach((step, i) => {
      const before = steps[i - 1];
      if (!before) return;
      if (step.afterDays <= before.afterDays) ctx.addIssue({ code: "custom", path: [i, "afterDays"], message: "each step must come after more days than the one before" });
      if (step.weightBps <= before.weightBps) ctx.addIssue({ code: "custom", path: [i, "weightBps"], message: "each step must weigh more than the one before" });
    });
  });
export type HoldingWeights = z.infer<typeof HoldingWeights>;

/** One published version of the rules every Reward Round follows. */
export const RewardRuleVersion = z.object({
  version: z.number().int(),
  /** The least a wallet must hold at the snapshot to be paid, raw units of the coin. */
  minHolding: raw,
  /** A round runs once at least this much tax has collected, raw units of the coin. */
  roundThreshold: raw,
  /** The Holding Weight's steps, shortest first; empty when every coin counts once (ADR 0022). */
  holdingWeights: HoldingWeights,
  note: z.string().nullable(),
  announcedAt: z.iso.datetime(),
  /** From when rounds follow this version; a round follows the version in force at its snapshot. */
  effectiveAt: z.iso.datetime(),
});
export type RewardRuleVersion = z.infer<typeof RewardRuleVersion>;

export const RewardRulesPage = z.object({
  inForce: RewardRuleVersion.nullable(),
  upcoming: z.array(RewardRuleVersion),
  /**
   * How long a Holding Day is on this deployment, in seconds: a step's `afterDays` counts these, and a coin's Holding
   * Check happens once in each. 86,400, a UTC day, everywhere but a test stack.
   */
  holdingDaySeconds: z.number().int(),
});
export type RewardRulesPage = z.infer<typeof RewardRulesPage>;

/**
 * Operator: the next rules version, effective at least the lead time after now. A version states all of its rules, so
 * `holdingWeights` is named every time, the empty list included: no version drops the weights by leaving them out.
 */
export const AnnounceRewardRules = z.object({
  minHolding: raw,
  roundThreshold: raw,
  holdingWeights: HoldingWeights,
  effectiveAt: z.iso.datetime(),
  note: z.string().trim().max(200).optional(),
});
export type AnnounceRewardRules = z.infer<typeof AnnounceRewardRules>;

/** Paying: payouts still going out. Paid: every holder has been paid. */
export const RewardRoundStatus = z.enum(["paying", "paid"]);
export type RewardRoundStatus = z.infer<typeof RewardRoundStatus>;

export const RewardRoundSummary = z.object({
  id: z.string(),
  mint: base58,
  rulesVersion: z.number().int(),
  status: RewardRoundStatus,
  source: RewardRoundSource,
  /** The slot the holders were snapshotted at. */
  snapshotSlot: z.number().int(),
  payout: RewardPayoutAssetRef,
  /**
   * What the round pays out, raw units of the Payout Asset: the collected tax, or what the Reward Sales brought in; for
   * an `earnings` round, the Creator's share collected on the coin and not yet paid out.
   */
  pot: raw,
  /** For a Quote Asset payout, the coins of tax sold for the pot; null for a coin payout. */
  sold: raw.nullable(),
  eligibleHolders: z.number().int(),
  /** What the payouts add up to (rounding leaves the pot's last units for the next round). */
  distributable: raw,
  /**
   * The Weighted Holdings of every wallet in the snapshot added up, raw units of the coin times basis points: a payout
   * is `pot * weightedHolding / weightedTotal`, rounded down. Null for a round from before the Holding Weight (ADR
   * 0022), whose payouts are pro rata of their holdings.
   */
  weightedTotal: raw.nullable(),
  /** What has been paid so far. */
  paid: raw,
  startedAt: z.iso.datetime(),
  finishedAt: z.iso.datetime().nullable(),
});
export type RewardRoundSummary = z.infer<typeof RewardRoundSummary>;

/**
 * `returned`: a SOL payout under an account's rent-exempt minimum to a wallet holding no SOL, which no transaction can
 * land; its amount stays in the pot for the next round.
 */
export const RewardPayoutStatus = z.enum(["unpaid", "sending", "paid", "returned"]);
export type RewardPayoutStatus = z.infer<typeof RewardPayoutStatus>;

export const RewardPayout = z.object({
  wallet: base58,
  /** What the wallet held at the snapshot. */
  holding: raw,
  /**
   * The wallet's Weighted Holding at the snapshot (ADR 0022): each coin it held counted at its Holding Weight, raw
   * units times basis points, so a holding of 5 counted once is "50000".
   */
  weightedHolding: raw,
  amount: raw,
  status: RewardPayoutStatus,
  /** The transaction that paid it; null until it has. */
  signature: z.string().nullable(),
  paidAt: z.iso.datetime().nullable(),
});
export type RewardPayout = z.infer<typeof RewardPayout>;

export const RewardRoundDetail = RewardRoundSummary.extend({ payouts: z.array(RewardPayout) });
export type RewardRoundDetail = z.infer<typeof RewardRoundDetail>;

export const RewardSaleStatus = z.enum(["sending", "landed", "failed", "expired"]);
export type RewardSaleStatus = z.infer<typeof RewardSaleStatus>;

/** One Reward Sale: a bounded sell of collected tax into the coin's own market for the Quote Asset. */
export const RewardSale = z.object({
  signature: z.string(),
  venue: z.enum(["curve", "pool"]),
  status: RewardSaleStatus,
  /** Coins sold, raw units. */
  coins: raw,
  /** Quote Asset received, raw units; null until the sale has landed. */
  proceeds: raw.nullable(),
  time: z.iso.datetime(),
});
export type RewardSale = z.infer<typeof RewardSale>;

/** A Reward Launch's rewards: what waits for the next round (from the chain), the rules, and its rounds, newest first. */
export const CoinRewards = z.object({
  mint: base58,
  rewardTaxBps: z.number().int(),
  payout: RewardPayoutAssetRef,
  waiting: z.object({
    /** Withheld in holders' accounts, not yet harvested to the mint. */
    inAccounts: raw,
    /** Harvested to the mint, not yet withdrawn. */
    inMint: raw,
    /** Withdrawn to the platform's account of the coin: waiting for a round, or for a Reward Sale on a Quote Asset payout. */
    collected: raw,
    total: raw,
    /** What the next round pays out so far, raw units of the Payout Asset: `collected` for a coin payout, the unpaid sale proceeds for a Quote Asset payout. */
    pot: raw,
  }),
  /** Reward Sales, for a Quote Asset payout: the bounds, the totals, and the latest sales, newest first. Null for a coin payout. */
  sales: z
    .object({
      maxReserveBps: z.number().int(),
      slippageBps: z.number().int(),
      /** Coins sold and Quote Asset received by every landed sale, raw units. */
      sold: raw,
      proceeds: raw,
      recent: z.array(RewardSale),
    })
    .nullable(),
  rules: RewardRuleVersion.nullable(),
  rounds: z.array(RewardRoundSummary),
});
export type CoinRewards = z.infer<typeof CoinRewards>;

/** Every Holder Reward of one wallet across every Reward Launch, newest round first. */
export const WalletRewards = z.object({
  wallet: base58,
  rewards: z.array(
    RewardPayout.omit({ wallet: true }).extend({
      round: z.string(),
      mint: base58,
      /** The coin: its ticker, name and decimals (the holding is in it). */
      symbol: z.string(),
      name: z.string(),
      decimals: z.number().int(),
      /** What the payout is in. */
      payout: RewardPayoutAssetRef,
      /** Whether the round paid out Reward Tax or the Creator's earnings. */
      source: RewardRoundSource,
      snapshotSlot: z.number().int(),
      roundStartedAt: z.iso.datetime(),
    }),
  ),
});
export type WalletRewards = z.infer<typeof WalletRewards>;

/**
 * One wallet's Holding Lots of one coin (ADR 0022), as the coin's latest Holding Check left them: what a Reward Round
 * opened now would weigh, before whatever the wallet has bought or sold since that check. The lots are published as
 * they are now, never as they were at a past round; a round's own page carries the result.
 */
export const WalletHolding = z.object({
  mint: base58,
  wallet: base58,
  /** The coin's latest Holding Check; null for a coin never checked, which is every coin that can have no Reward Round. */
  check: z.object({ checkedAt: z.iso.datetime(), slot: z.number().int() }).nullable(),
  /** What the lots add up to: what the wallet held at that check, raw units of the coin. */
  held: raw,
  /** The lots, oldest first. */
  lots: z.array(
    z.object({
      amount: raw,
      /** The time of the Holding Check that first saw these coins in the wallet, where their age runs from. */
      since: z.iso.datetime(),
      /** What each of these coins counts for now, under the rules in force: 10000 is once. */
      weightBps: z.number().int(),
    }),
  ),
  /** The lots, each counted at its weight: raw units times basis points. */
  weightedHolding: raw,
  /** The wallet's weight as one figure: `weightedHolding / held`, rounded down; 10000 when it holds nothing. */
  weightBps: z.number().int(),
  /** Whether every coin of this wallet always counts once, whatever its lots: true for the treasury. */
  flat: z.boolean(),
  /** The rules version the lots were weighed under: the one in force now. */
  rulesVersion: z.number().int(),
});
export type WalletHolding = z.infer<typeof WalletHolding>;
