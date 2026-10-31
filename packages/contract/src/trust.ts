import { z } from "zod";

/**
 * The trust figures of a coin (#41, ADR 0013): what a buyer checks before buying, every one computed from the indexed
 * trades and the chain, so anyone can recompute it. Labels inform; none stops a trade.
 */

const base58 = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "must be a base58 address");
/** An integer amount in raw units (no decimals applied), as a decimal string. */
const raw = z.string().regex(/^\d+$/, "must be a whole number of raw units");

/** A wallet other than the Creator that bought inside the Snipe Window: the launch's slot and the few after it. */
export const Sniper = z.object({
  wallet: base58,
  /** Slots after the launch's the wallet's first buy landed in; 0 is the launch's own slot, where a bundled buy lands. */
  slotsAfterLaunch: z.number().int(),
  /** Coins bought inside the window, raw units, and as a fraction of the supply. */
  bought: raw,
  boughtShare: z.number(),
  /** Coins held by the wallet's trades here since launch (bought minus sold, never below zero); a transfer out is not a trade. */
  held: raw,
  heldShare: z.number(),
  /** How many other wallets paid exactly the same amount inside the window, which is what one bundle's wallets do; 0 when none. */
  sameAmountAs: z.number().int(),
});
export type Sniper = z.infer<typeof Sniper>;

/** Bundle Radar: who bought in the first slots after launch, and what they hold now. */
export const Snipers = z.object({
  /** The window: the launch's slot and this many after it (`SNIPE_WINDOW_SLOTS`). */
  windowSlots: z.number().int(),
  /** Every sniper, largest buy first; the Creator's own buys are never counted. */
  wallets: z.array(Sniper),
  /** The snipers' buys inside the window, and what they still hold by their trades here, as fractions of the supply. */
  boughtShare: z.number(),
  heldShare: z.number(),
  /** Wallets that bought in the launch's own slot: only a bundle lands beside the launch. */
  inLaunchSlot: z.number().int(),
  /** Wallets whose buy matched another's amount to the raw unit. */
  sameAmount: z.number().int(),
});
export type Snipers = z.infer<typeof Snipers>;

/** The Creator's record here, from the indexed launches and trades. */
export const CreatorRecord = z.object({
  address: base58,
  /** Coins this wallet has launched here, this one included, and how many of them graduated. */
  launches: z.number().int(),
  graduated: z.number().int(),
  /** The Creator's First Buy at launch, raw units and as a fraction of the supply; null when the launch had none. */
  firstBuy: z.object({ amount: raw, share: z.number() }).nullable(),
});
export type CreatorRecord = z.infer<typeof CreatorRecord>;

export const LaunchTrust = z.object({
  mint: base58,
  /** The coin's total supply, raw units: what every share here is a fraction of. */
  supply: raw,
  creator: CreatorRecord,
  snipers: Snipers,
});
export type LaunchTrust = z.infer<typeof LaunchTrust>;
