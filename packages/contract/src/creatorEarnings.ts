import { z } from "zod";
import { QuoteRef } from "./quotes";
import { CurveStatus, GraduationFee } from "./trades";

/**
 * Creator Earnings: what a Creator earns from the trades on their Launches, half of what the platform collects on
 * them, all of it paid to the Creator's wallet as Creator Forwards (ADR 0009); per Quote Asset, per Launch, and the
 * public history of the payments. Amounts are raw units of the Quote Asset named next to them.
 */

const base58 = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "must be a base58 address");
/** An integer amount in raw units (no decimals applied), as a decimal string. */
const raw = z.string().regex(/^\d+$/, "must be a whole number of raw units");

/** A Creator's earnings in one Quote Asset. */
export const CreatorEarningsAsset = z.object({
  quote: QuoteRef,
  /**
   * Half of the Platform Fee of every indexed curve trade on this Creator's Launches, and half of every pool creator
   * fee the platform has collected from their graduated pools.
   */
  earned: raw,
  /** Graduation Fees withheld out of it (ADR 0015), in this Quote Asset, kept by the platform. */
  withheld: raw,
  /** What has been sent to the Creator's wallet, or is on its way. */
  forwarded: raw,
  /** The rest, paid once the platform has collected the fee it comes from and it is worth the minimum. */
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
  /** Half of the pool creator fee the platform has collected from its pool. */
  pool: raw,
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
