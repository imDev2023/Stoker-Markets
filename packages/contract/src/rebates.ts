import { z } from "zod";

/**
 * Volume rebates (ADR 0021): the Budget Table's `rebates` row (ADR 0019) paid back to traders. A Rebate Week's trades
 * are settled together once the week has ended: the row's budget is split among the traders in proportion to the
 * Platform Fees their trades paid, and a trader's rebates are paid in SOL once they reach the minimum payout.
 * Every amount is in lamports.
 */

const raw = z.string().regex(/^\d+$/, "must be a whole number of lamports");
const bps = z.number().int().min(0).max(10_000);

/** One settled Rebate Week. */
export const RebateWeek = z.object({
  start: z.iso.datetime(),
  end: z.iso.datetime(),
  /** The largest share the `rebates` row had in force during the week: the most of the fees paid a rebate may be. */
  capBps: bps,
  /** What the row had left when the week was settled, less the rebates of earlier weeks not yet paid. */
  budgetLamports: raw,
  /** The Platform Fees the week's earning trades paid, valued in SOL at the Quote Registry's prices at the settlement. */
  feesLamports: raw,
  /** What the week split: the budget, or the cap's share of the fees where that was less. */
  potLamports: raw,
  /** The wallets given a rebate. */
  traders: z.number().int(),
  /** What the rebates add up to; rounding leaves the pot's last lamports in the row. */
  creditedLamports: raw,
  /** How much of it has reached its wallets so far. */
  paidLamports: raw,
  settledAt: z.iso.datetime(),
});
export type RebateWeek = z.infer<typeof RebateWeek>;

/** The week being traded now, as it would be settled at this moment: an estimate, since the week is not over. */
export const CurrentRebateWeek = z.object({
  start: z.iso.datetime(),
  end: z.iso.datetime(),
  capBps: bps,
  budgetLamports: raw,
  feesLamports: raw,
  potLamports: raw,
});
export type CurrentRebateWeek = z.infer<typeof CurrentRebateWeek>;

/** The program as it stands. */
export const RebateProgram = z.object({
  /** The `rebates` row's share of the Platform Net in force, in basis points; 0 while the program is not running. */
  shareBps: bps,
  /** The next announced Budget Table that changes the row's share, and when it takes effect; null when none is announced. */
  upcoming: z.object({ shareBps: bps, effectiveAt: z.iso.datetime() }).nullable(),
  /** The length of a Rebate Week in seconds: 604,800, a UTC week from Monday, everywhere but a test stack. */
  weekSeconds: z.number().int(),
  /** What a wallet's waiting rebates must reach before they are paid. */
  minPayoutLamports: raw,
  /** Null while the row has no share in force: trades earn nothing then. */
  current: CurrentRebateWeek.nullable(),
  /** Everything paid so far, which is the Ledger's `rebate` entries. */
  paidLamports: raw,
  /** Rebates given and not paid yet: under the minimum, or in a payment that has not landed. */
  waitingLamports: raw,
});
export type RebateProgram = z.infer<typeof RebateProgram>;

/** `GET /v1/rebates`: the program and the settled weeks, the latest first. */
export const RebatesPage = z.object({ program: RebateProgram, weeks: z.array(RebateWeek) });
export type RebatesPage = z.infer<typeof RebatesPage>;

export const RebateStatus = z.enum(["waiting", "sending", "paid"]);
export type RebateStatus = z.infer<typeof RebateStatus>;

/** One wallet's rebate for one settled week. */
export const WalletRebate = z.object({
  weekStart: z.iso.datetime(),
  weekEnd: z.iso.datetime(),
  /** The Platform Fees the wallet's trades paid in the week, valued like the week's total. */
  feesLamports: raw,
  amountLamports: raw,
  /** `waiting` until the wallet's waiting rebates reach the minimum payout, `sending` while its payment is in flight. */
  status: RebateStatus,
  /** The payment's transaction, once one was sent; several weeks' rebates can share one. */
  signature: z.string().nullable(),
  paidAt: z.iso.datetime().nullable(),
});
export type WalletRebate = z.infer<typeof WalletRebate>;

/** `GET /v1/wallets/:address/rebates`: what a wallet has earned back, the latest week first. */
export const WalletRebates = z.object({
  wallet: z.string(),
  /** Given and not paid yet. */
  waitingLamports: raw,
  paidLamports: raw,
  /**
   * The week being traded now: the fees the wallet's trades have paid so far and what they would earn if the week were
   * settled at this moment. Null while the row has no share in force.
   */
  current: z.object({ feesLamports: raw, estimateLamports: raw }).nullable(),
  rebates: z.array(WalletRebate),
});
export type WalletRebates = z.infer<typeof WalletRebates>;
