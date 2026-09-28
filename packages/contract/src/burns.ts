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

export const BurnsPage = z.object({
  /** Null until the operator names it, after Launch #1. */
  platformToken: base58.nullable(),
  shares: z.object({ burnBps: z.number().int(), flywheelBps: z.number().int(), flywheelTopN: z.number().int() }),
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
});
export type BurnsPage = z.infer<typeof BurnsPage>;

/** Operator: the Platform Token's mint. */
export const SetPlatformToken = z.object({ mint: base58 });
export type SetPlatformToken = z.infer<typeof SetPlatformToken>;
