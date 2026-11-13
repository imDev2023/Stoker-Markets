import { z } from "zod";
import { RevenueAsset } from "./revenue";

/**
 * Burn and Flywheel: how platform revenue buys the Platform Token and the top Launches and burns them, on a public
 * schedule, every buy and burn on the Ledger.
 */

const base58 = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "must be a base58 address");
const raw = z.string().regex(/^\d+$/, "must be a whole number of raw units");

/** One buy-and-burn: the SOL it spent and the coins it destroyed, in one transaction. */
export const BurnEvent = z.object({
  signature: z.string(),
  /** `burn` is the Platform Token; `flywheel` a top Launch. */
  kind: z.enum(["burn", "flywheel"]),
  coin: RevenueAsset,
  lamports: raw,
  /** Coins burned, raw units. */
  amount: raw,
  slot: z.number().int(),
  time: z.iso.datetime(),
});
export type BurnEvent = z.infer<typeof BurnEvent>;

/**
 * Where a budget's buys go (#184, ADR 0006 amended): `burn` destroys every coin bought (the default), `liquidity` adds
 * them with SOL to the coin's own graduated pool and locks the LP tokens for good, the operations wallet keeping the
 * new position's Fee Key. An operator setting per budget, changed without a deploy.
 */
export const BUDGET_DESTINATIONS = ["burn", "liquidity"] as const;
export const BudgetDestination = z.enum(BUDGET_DESTINATIONS);
export type BudgetDestination = z.infer<typeof BudgetDestination>;

/** One addition of protocol-owned liquidity: the SOL a budget put into a coin's pool, and the locked position it opened. */
export const LiquidityAdditionEvent = z.object({
  signature: z.string(),
  /** The budget that paid for it: `burn` (the Platform Token) or `flywheel` (a top Launch). */
  kind: z.enum(["burn", "flywheel"]),
  coin: RevenueAsset,
  /** SOL that went into the pool: the buy and the half paired with what it bought. */
  lamports: raw,
  /** Coins that went into the pool, raw units. */
  amount: raw,
  /** The locked position's record in Raydium's lock program. */
  position: base58,
  /** The position's Fee Key, the NFT the operations wallet holds to collect its fees; null until it is on record. */
  feeKey: base58.nullable(),
  slot: z.number().int(),
  time: z.iso.datetime(),
});
export type LiquidityAdditionEvent = z.infer<typeof LiquidityAdditionEvent>;

export const BurnsPage = z.object({
  /** Null until the operator names it, after Launch #1. */
  platformToken: base58.nullable(),
  shares: z.object({ burnBps: z.number().int(), flywheelBps: z.number().int(), flywheelTopN: z.number().int() }),
  /** Where each budget's buys go right now. */
  destinations: z.object({ burn: BudgetDestination, flywheel: BudgetDestination }),
  /** The published rule, in words. */
  rule: z.string(),
  budgets: z.object({
    /** Every revenue entry on the Ledger, valued in SOL at the latest prices, in lamports. */
    revenueLamports: raw,
    burn: z.object({ spent: raw, available: raw }),
    flywheel: z.object({ spent: raw, available: raw }),
  }),
  /** Coins burned so far, per coin. */
  burned: z.array(z.object({ coin: RevenueAsset, amount: raw })),
  /** What the Flywheel rule picks right now. */
  nextFlywheel: z.array(z.object({ mint: base58, symbol: z.string() })),
  /** Newest first. */
  events: z.array(BurnEvent),
  /**
   * Protocol-owned liquidity: what the Burn and the Flywheel have added to their coins' pools as locked liquidity, all
   * time, and the additions newest first. The Fee Keys' collections come back as `fee_key` revenue.
   */
  liquidity: z.object({
    /** SOL put into locked liquidity so far, lamports. */
    lamports: raw,
    /** Additions so far. */
    count: z.number().int(),
    /** Distinct pools they went into. */
    pools: z.number().int(),
    /** The latest additions, newest first. */
    additions: z.array(LiquidityAdditionEvent),
  }),
});
export type BurnsPage = z.infer<typeof BurnsPage>;

/** Operator: the Platform Token's mint. */
export const SetPlatformToken = z.object({ mint: base58 });
export type SetPlatformToken = z.infer<typeof SetPlatformToken>;

/** Operator: where the Burn's and the Flywheel's buys go; a budget left out keeps its destination. */
export const SetBudgetDestinations = z
  .object({ burn: BudgetDestination.optional(), flywheel: BudgetDestination.optional() })
  .strict()
  .refine((d) => d.burn !== undefined || d.flywheel !== undefined, "name at least one budget");
export type SetBudgetDestinations = z.infer<typeof SetBudgetDestinations>;
