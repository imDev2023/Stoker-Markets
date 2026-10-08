import { z } from "zod";
import { MarketValue } from "./board";
import { RewardPayoutAsset } from "./launchModes";
import { QuoteRef } from "./quotes";

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

/** One published version of the rules every Reward Round follows. */
export const RewardRuleVersion = z.object({
  version: z.number().int(),
  /** The least a wallet must hold at the snapshot to be paid, raw units of the coin. */
  minHolding: raw,
  /** A round runs once at least this much tax has collected, raw units of the coin. */
  roundThreshold: raw,
  note: z.string().nullable(),
  announcedAt: z.iso.datetime(),
  /** From when rounds follow this version; a round follows the version in force at its snapshot. */
  effectiveAt: z.iso.datetime(),
});
export type RewardRuleVersion = z.infer<typeof RewardRuleVersion>;

export const RewardRulesPage = z.object({ inForce: RewardRuleVersion.nullable(), upcoming: z.array(RewardRuleVersion) });
export type RewardRulesPage = z.infer<typeof RewardRulesPage>;

/** Operator: the next rules version, effective at least the lead time after now. */
export const AnnounceRewardRules = z.object({
  minHolding: raw,
  roundThreshold: raw,
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
  /** The slot the holders were snapshotted at. */
  snapshotSlot: z.number().int(),
  payout: RewardPayoutAssetRef,
  /** What the round pays out, raw units of the Payout Asset: the collected tax, or what the Reward Sales brought in. */
  pot: raw,
  /** For a Quote Asset payout, the coins of tax sold for the pot; null for a coin payout. */
  sold: raw.nullable(),
  eligibleHolders: z.number().int(),
  /** What the payouts add up to (rounding leaves the pot's last units for the next round). */
  distributable: raw,
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
      snapshotSlot: z.number().int(),
      roundStartedAt: z.iso.datetime(),
    }),
  ),
});
export type WalletRewards = z.infer<typeof WalletRewards>;

/** An amount of a Payout Asset in SOL and USD at the asset's price now; both null when the registry has no price for it. */
export const RewardValue = z.object({ sol: z.number().nullable(), usd: z.number().nullable() });
export type RewardValue = z.infer<typeof RewardValue>;

/** A Reward Launch in the overview's ranking: what its rounds have paid, to how many wallets, and where its market stands. */
export const RewardLaunchStanding = z.object({
  mint: base58,
  symbol: z.string(),
  name: z.string(),
  image: z.string().nullable(),
  quote: QuoteRef,
  rewardTaxBps: z.number().int(),
  payout: RewardPayoutAssetRef,
  /** Rounds that have paid at least one holder. */
  rounds: z.number().int(),
  /** Wallets this Launch's rounds have paid at least once. */
  walletsPaid: z.number().int(),
  /** Paid to holders so far, raw units of the Payout Asset. */
  paid: raw,
  value: RewardValue,
  marketCap: MarketValue.nullable(),
});
export type RewardLaunchStanding = z.infer<typeof RewardLaunchStanding>;

export const RewardRoundInOverview = RewardRoundSummary.extend({
  symbol: z.string(),
  name: z.string(),
  image: z.string().nullable(),
  /** What the round pays out (`distributable`) at the Payout Asset's price now. */
  value: RewardValue,
});
export type RewardRoundInOverview = z.infer<typeof RewardRoundInOverview>;

/**
 * Every Reward Launch's rounds in one view. A coin payout is valued at the coin's latest price in its Quote Asset times
 * that asset's price, a Quote Asset payout at the asset's price, both as the registry has them now, never as they were
 * when the payout landed; a Payout Asset the registry can't price is counted but not valued.
 */
export const RewardsOverview = z.object({
  totals: z.object({
    /** Every payout that landed, over the Payout Assets with a price. */
    paidUsd: z.number(),
    paidSol: z.number(),
    /** Rounds whose Payout Asset has no price now, so their payouts are in neither total. */
    unpricedRounds: z.number().int(),
    /** Payouts that landed, across every round. */
    payouts: z.number().int(),
    /** Rounds that have paid at least one holder. */
    rounds: z.number().int(),
    lastPaidAt: z.iso.datetime().nullable(),
    /** Reward Launches whose rounds have paid at least one holder. */
    launchesPaid: z.number().int(),
    /** Wallets paid, counted once per Reward Launch. */
    walletsPaid: z.number().int(),
  }),
  /** Reward Launches by what their rounds have paid, valued now, the most first; one with no price ranks by its raw amount, after the valued ones. */
  top: z.array(RewardLaunchStanding),
  /** The latest rounds across every Reward Launch, newest first. */
  recent: z.array(RewardRoundInOverview),
});
export type RewardsOverview = z.infer<typeof RewardsOverview>;
