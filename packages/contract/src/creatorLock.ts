import { z } from "zod";
import { CreatorLockTerms } from "./launchModes";

/** A coin's Creator Lock as the chain has it (ADR 0023, #186), and claiming what has unlocked of it. */

const base58 = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "must be a base58 address");
const raw = z.string().regex(/^\d+$/, "must be a whole number of raw units");

/**
 * A coin's Creator Lock, read from the chain at `asOf` (`GET /v1/launches/{mint}/lock`). LaunchLab holds the coins in
 * the curve's own vault, through Graduation and after it, and pays them only to the wallet they were given to: the
 * Creator's, in every launch our API builds. Nothing unlocks for the cliff after the curve sells out, then the coins
 * unlock evenly over the unlock time; a claim also needs the coin to have graduated.
 */
export const CreatorLockStatus = z.object({
  mint: base58,
  creator: base58,
  terms: CreatorLockTerms,
  /** The curve's state: the clock starts at the buy that sells it out, and a claim waits for `graduated`. */
  curve: z.enum(["live", "graduating", "graduated"]),
  /** When the cliff ends and the coins start to unlock; null while the curve still sells, since a coin that never sells out never unlocks. */
  unlockStartsAt: z.iso.datetime().nullable(),
  /** When the last coin has unlocked; null while the curve still sells. */
  unlockEndsAt: z.iso.datetime().nullable(),
  /** The chain's time the unlocked figures are counted at. */
  asOf: z.iso.datetime(),
  /**
   * The Creator's share of the lock, all of it in a launch our API builds; null when the launch gave the Creator none
   * (a launch made without our API can give its locked coins to another wallet, or to none, which strands them).
   */
  creatorShare: z
    .object({
      /** The coins given to the Creator's wallet, raw units. */
      amount: raw,
      /** What has unlocked of them by `asOf`, claimed or not. */
      unlocked: raw,
      /** What the Creator has claimed. */
      claimed: raw,
      /** What a claim would pay now: unlocked and not claimed, and 0 before Graduation, when a claim can't land. */
      claimable: raw,
    })
    .nullable(),
  /** Coins of the lock still in LaunchLab's vault, raw units: the lock less what the Creator has claimed. */
  stillLocked: raw,
  /**
   * A Reward Launch's Reward Tax in basis points, which a claim pays like any transfer of the coin: the holders receive
   * that share of what the Creator claims. Null for a standard coin.
   */
  rewardTaxBps: z.number().int().nullable(),
});
export type CreatorLockStatus = z.infer<typeof CreatorLockStatus>;

/** Body of `POST /v1/launches/{mint}/lock/claim`: the wallet claiming, which signs and pays for the claim itself (ADR 0003). */
export const CreatorLockClaimRequest = z.object({ wallet: base58 });
export type CreatorLockClaimRequest = z.infer<typeof CreatorLockClaimRequest>;

export const PreparedCreatorLockClaim = z.object({
  /** Base64 unsigned v0 transaction; the wallet signs it as fee payer and sends it. */
  transaction: z.string(),
  lastValidBlockHeight: z.number().int(),
  /** Coins the claim takes out of the lock, raw units: at least this many, since more may unlock before it lands. */
  amount: raw,
  /** Of those, what reaches the wallet after a Reward Launch's Reward Tax; the same as `amount` for a standard coin. */
  received: raw,
});
export type PreparedCreatorLockClaim = z.infer<typeof PreparedCreatorLockClaim>;
