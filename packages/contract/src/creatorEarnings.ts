import { z } from "zod";
import { CoinCreatorTier } from "./ladder";
import { CreatorEarningsDestination } from "./launchModes";
import { QuoteRef } from "./quotes";
import { RewardRoundSummary } from "./rewards";
import { CurveStatus, GraduationFee } from "./trades";

/**
 * Creator Earnings: what a Creator earns from the trades on their Launches, their share of what the platform collects
 * on them (half, and more of a graduated coin's pool fees as it climbs the Creator Ladder, ADR 0020), paid to the
 * Creator's wallet as Creator Forwards (ADR 0009) or, coin by coin, to the rule the Creator fixed at launch (ADR 0011):
 * the coin's holders, a buyback that burns, or a buyback that adds locked liquidity; per Quote Asset, per Launch, and
 * the public history of the payments. Amounts are raw units of the Quote Asset named next to them.
 */

const base58 = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "must be a base58 address");
/** An integer amount in raw units (no decimals applied), as a decimal string. */
const raw = z.string().regex(/^\d+$/, "must be a whole number of raw units");

/** A Creator's earnings in one Quote Asset. */
export const CreatorEarningsAsset = z.object({
  quote: QuoteRef,
  /**
   * Half of the Platform Fee of every indexed curve trade on this Creator's Launches, and their share of every pool
   * creator fee the platform has collected from their graduated pools: each collection at the tier its coin held then.
   */
  earned: raw,
  /** Graduation Fees withheld out of it (ADR 0015), in this Quote Asset, kept by the platform. */
  withheld: raw,
  /** What has been sent to the Creator's wallet, or is on its way. */
  forwarded: raw,
  /**
   * What was earned on the Creator's coins whose earnings go to a rule instead of the wallet (ADR 0011), less the
   * Graduation Fees withheld on those coins: paid out or spent by the rule, or waiting for its next run.
   */
  toRule: raw,
  /**
   * The rest, paid to the wallet once the platform has collected the fee it comes from and it is worth the minimum:
   * `earned` less `withheld`, `forwarded` and `toRule`.
   */
  pending: raw,
});
export type CreatorEarningsAsset = z.infer<typeof CreatorEarningsAsset>;

/** One of the Creator's Launches and what it has earned its Creator on each venue. */
export const CreatorLaunchEarnings = z.object({
  mint: base58,
  name: z.string(),
  symbol: z.string(),
  image: z.string().nullable(),
  quote: QuoteRef,
  status: CurveStatus,
  /** Half of the Platform Fee of its curve trades. */
  curve: raw,
  /** The Creator's share of the pool creator fee the platform has collected from its pool, each collection at the tier the coin held then. */
  pool: raw,
  /** Where this coin's earnings go, fixed at its launch (ADR 0011). */
  destination: CreatorEarningsDestination,
  /**
   * For a coin with a rule, what the rule has paid to holders or spent on buybacks so far, or has committed to; null
   * for a coin that pays the wallet, whose forwards are counted per Quote Asset.
   */
  applied: raw.nullable(),
  /** Where the coin stands on the Creator Ladder (ADR 0020): the first tier with no Active Days until it graduates. */
  tier: CoinCreatorTier,
  /** Its Graduation Fee (ADR 0015), once it has graduated with one: null before Graduation, and for a coin graduated before the fee existed. */
  graduationFee: GraduationFee.nullable(),
});
export type CreatorLaunchEarnings = z.infer<typeof CreatorLaunchEarnings>;

export const CreatorEarnings = z.object({
  creator: base58,
  /** SOL first, then the other Quote Assets in a stable order. */
  assets: z.array(CreatorEarningsAsset),
  /** Newest first. */
  launches: z.array(CreatorLaunchEarnings),
});
export type CreatorEarnings = z.infer<typeof CreatorEarnings>;

/** One Creator Forward: a payment of the Creator's share from the operations wallet, landed or on its way. */
export const CreatorForward = z.object({
  signature: z.string(),
  quote: QuoteRef,
  amount: raw,
  status: z.enum(["sending", "paid"]),
  /** When it landed; when it was sent, while it is on its way. */
  time: z.iso.datetime(),
});
export type CreatorForward = z.infer<typeof CreatorForward>;

/** Newest first. */
export const CreatorForwardList = z.object({ forwards: z.array(CreatorForward) });
export type CreatorForwardList = z.infer<typeof CreatorForwardList>;

/** A run of a coin's `burn` or `liquidity` rule (ADR 0011): one buyback transaction, landed or on its way. */
export const CreatorBuyback = z.object({
  signature: z.string(),
  kind: z.enum(["burn", "liquidity"]),
  /** Where the coin was bought: its curve, or its pool after Graduation. */
  venue: z.enum(["curve", "pool"]),
  status: z.enum(["sending", "landed"]),
  /** The Quote Asset it spent, raw units: the buy and, for liquidity, the Quote Asset paired with the coins. Null until it has landed. */
  spent: raw.nullable(),
  /** Coins it bought, raw units. Null until it has landed. */
  coins: raw.nullable(),
  /** Coins it destroyed, raw units: all it bought under the burn rule. Null for liquidity, and until it has landed. */
  burned: raw.nullable(),
  /**
   * Liquidity: the coins and the Quote Asset that went into the pool, the LP tokens locked, the locked position and its
   * Fee Key (the NFT the platform holds to collect the position's fees). Null for a burn, and until it has landed.
   */
  liquidity: z.object({ coins: raw, quote: raw, lpAmount: raw, feeKey: base58, lockedLiquidity: base58 }).nullable(),
  /** When it landed; when it was sent, while it is on its way. */
  time: z.iso.datetime(),
});
export type CreatorBuyback = z.infer<typeof CreatorBuyback>;

/**
 * Where one coin's Creator Earnings go and what has become of them (ADR 0011): `GET /v1/launches/:mint/earnings`.
 * Everything is in raw units of the coin's Quote Asset unless it says coins. A coin that pays the wallet has no rule,
 * so `applied` and `waiting` are null and the lists are empty: its Creator's forwards are counted per Quote Asset
 * across all their coins (`GET /v1/creators/:address/earnings`).
 */
export const CoinEarnings = z.object({
  mint: base58,
  destination: CreatorEarningsDestination,
  quote: QuoteRef,
  /** The Creator's share of what the platform has collected on this coin's trades so far. */
  collected: raw,
  /** The coin's Graduation Fee withheld out of it (ADR 0015). */
  withheld: raw,
  /** What the rule has paid out or spent, or has committed to (a round still paying, a buyback on its way). */
  applied: raw.nullable(),
  /** What waits for the rule's next run: `collected` less `withheld` and `applied`. */
  waiting: raw.nullable(),
  /**
   * What `waiting` must be worth, in lamports at the Quote Registry's price, before the rule runs: the Creator
   * Forward's minimum, or for `liquidity` the larger minimum of a locked position. Null for a coin that pays the wallet.
   */
  minLamports: raw.nullable(),
  /** `liquidity` before Graduation: true while the share waits for the coin's pool to exist. */
  waitsForGraduation: z.boolean(),
  /** `holders`: the earnings rounds, newest first, the latest ten. */
  rounds: z.array(RewardRoundSummary),
  /** `burn` and `liquidity`: the buybacks, newest first, the latest ten. */
  buybacks: z.array(CreatorBuyback),
  /** All-time totals of what has landed. */
  totals: z.object({
    /** `holders`: paid to holders, and the rounds that paid it. */
    paidToHolders: raw,
    rounds: z.number().int(),
    /** `burn` and `liquidity`: Quote Asset spent on buybacks, and how many landed. */
    spent: raw,
    buybacks: z.number().int(),
    /** `burn`: coins destroyed, raw units of the coin. */
    burned: raw,
    /** `liquidity`: coins and Quote Asset added to the pool, raw units of each. */
    coinsAdded: raw,
    quoteAdded: raw,
  }),
});
export type CoinEarnings = z.infer<typeof CoinEarnings>;
