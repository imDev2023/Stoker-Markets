import { z } from "zod";
import { QuoteRef } from "./quotes";
import { CurveStatus } from "./trades";

/**
 * The Creator Fee: what a Creator has earned and can claim, per Quote Asset, the claim transaction, and the public
 * history of claims; and the Creator Forward, the part of a Creator's earnings the platform pays (ADR 0007). Amounts are raw units of the Quote Asset named next to them.
 */

const base58 = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "must be a base58 address");
/** An integer amount in raw units (no decimals applied), as a decimal string. */
const raw = z.string().regex(/^\d+$/, "must be a whole number of raw units");

/** A Creator's Creator Fee in one Quote Asset. */
export const CreatorFeeAsset = z.object({
  quote: QuoteRef,
  /** The on-chain vault the Creator Fee collects in, one per Creator and Quote Asset. */
  vault: base58,
  /**
   * What the vault holds right now, read from the chain: exactly what a claim pays out. The vault is shared by every
   * Launch of this Creator against this Quote Asset on any LaunchLab platform, so it can hold more than `earned`.
   */
  claimable: raw,
  /** Creator Fee paid by trades on this Creator's Launches on our platform. */
  earned: raw,
  /** Everything this Creator has claimed from the vault, per the claim history. */
  claimed: raw,
  /**
   * The Creator Forward in this Quote Asset (ADR 0007): what the platform pays the Creator from its own revenue, with
   * nothing to claim. `earned` counts every indexed curve trade and every pool fee the platform has collected;
   * `forwarded` is what has been sent to the Creator's wallet; `pending` is the rest, paid once the platform has
   * collected it and it is worth the minimum.
   */
  forward: z.object({ earned: raw, forwarded: raw, pending: raw }),
});
export type CreatorFeeAsset = z.infer<typeof CreatorFeeAsset>;

/** One of the Creator's Launches and what it has earned its Creator, from the chain and from the Creator Forward. */
export const CreatorLaunchEarnings = z.object({
  mint: base58,
  name: z.string(),
  symbol: z.string(),
  image: z.string().nullable(),
  quote: QuoteRef,
  status: CurveStatus,
  /** Creator Fee the chain paid on this Launch's curve trades. */
  earned: raw,
  /** The Creator Forward this Launch earned: the match on its curve trades, and its share of collected pool fees. */
  forward: z.object({ curve: raw, pool: raw }),
});
export type CreatorLaunchEarnings = z.infer<typeof CreatorLaunchEarnings>;

export const CreatorFees = z.object({
  creator: base58,
  assets: z.array(CreatorFeeAsset),
  /** Newest first. */
  launches: z.array(CreatorLaunchEarnings),
});
export type CreatorFees = z.infer<typeof CreatorFees>;

export const CreatorFeeClaim = z.object({
  signature: z.string(),
  quote: QuoteRef,
  amount: raw,
  time: z.iso.datetime(),
});
export type CreatorFeeClaim = z.infer<typeof CreatorFeeClaim>;

/** Newest first. */
export const CreatorFeeClaimList = z.object({ claims: z.array(CreatorFeeClaim) });
export type CreatorFeeClaimList = z.infer<typeof CreatorFeeClaimList>;

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

export const PrepareCreatorFeeClaimRequest = z.object({ creator: base58, quoteMint: base58 });
export type PrepareCreatorFeeClaimRequest = z.infer<typeof PrepareCreatorFeeClaimRequest>;

export const PreparedCreatorFeeClaim = z.object({
  /** Base64 unsigned v0 transaction; the Creator's wallet signs it as fee payer and sends it. */
  transaction: z.string(),
  lastValidBlockHeight: z.number().int(),
  quote: QuoteRef,
  /** What the vault held when the transaction was built; the claim pays out whatever it holds when it lands. */
  amount: raw,
  /** SOL is paid out as plain SOL rather than left wrapped. */
  unwrapped: z.boolean(),
});
export type PreparedCreatorFeeClaim = z.infer<typeof PreparedCreatorFeeClaim>;
