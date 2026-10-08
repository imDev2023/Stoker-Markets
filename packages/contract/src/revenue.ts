import { z } from "zod";
import { QuoteRef } from "./quotes";

/**
 * Platform revenue and the Ledger: what the Fee Collector has claimed into the operations wallet and swept out to the
 * treasury, each movement tied to its transaction. Amounts are raw units of the asset named next to them.
 */

const base58 = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "must be a base58 address");
/** An integer amount in raw units (no decimals applied), as a decimal string. */
const raw = z.string().regex(/^\d+$/, "must be a whole number of raw units");

/**
 * What a Ledger entry records.
 * - `platform_fee`: the Platform Fee claimed from LaunchLab's vault for one Quote Asset, paid by every curve trade.
 * - `pool_fee`: a graduated coin's CPMM pool creator fee, which the platform collects after Graduation (ADR 0009).
 * - `fee_key`: the LP fees of a graduated pool's locked liquidity, collected with its Fee Key, in both of the pool's tokens.
 * - `sweep`: revenue moved from the operations wallet to the treasury (ADR 0004).
 * - `creator_forward`: a Creator's share of that revenue, paid from the operations wallet to the Creator (ADR 0009).
 * - `burn`: SOL spent on the Platform Token and the Platform Token destroyed, two entries of one transaction.
 * - `flywheel`: the same for a top Launch the Flywheel rule picked.
 * - `arweave_top_up`: SOL sent from the operations wallet to ArDrive Turbo for upload credits (#44).
 * - `metadata_upload`: what one Launch's permanent metadata cost in those credits, in lamports at the SOL price Turbo
 *   quoted when it was uploaded; keyed by the launch transaction, one entry per item (image, metadata JSON) that was
 *   not free. No SOL moves: the credits bought by a top-up are spent.
 * - `reward_sale`: a Reward Sale (ADR 0006, #43): a Reward Launch's collected tax sold into its own market for its
 *   Quote Asset, two entries of one transaction: the coins sold out of the operations wallet, and the Quote Asset it
 *   received, which is the holders' pot, not revenue.
 */
export const LedgerKind = z.enum(["platform_fee", "pool_fee", "fee_key", "sweep", "creator_forward", "burn", "flywheel", "arweave_top_up", "metadata_upload", "reward_sale"]);
export type LedgerKind = z.infer<typeof LedgerKind>;

/**
 * An asset revenue arrives in: a Quote Asset, or a graduated coin (a Fee Key pays out both of its pool's tokens).
 * Coins carry their image as `logo`. Quote Asset categories don't apply to coins, so there is none.
 */
export const RevenueAsset = QuoteRef.omit({ category: true, issuer: true });
export type RevenueAsset = z.infer<typeof RevenueAsset>;

export const LedgerEntry = z.object({
  signature: z.string(),
  /** Position among the entries of the same transaction. */
  index: z.number().int(),
  kind: LedgerKind,
  asset: RevenueAsset,
  amount: raw,
  /** Where it came from: a Platform Fee vault, a CPMM pool, or the operations wallet for a sweep. */
  source: base58,
  /** Where it went: the operations wallet, the treasury for a sweep, or the Creator for a Creator Forward. */
  destination: base58,
  /** The graduated coin whose pool paid it; null for the Platform Fee (one vault collects every Launch's) and sweeps. */
  launch: z.object({ mint: base58, symbol: z.string(), name: z.string() }).nullable(),
  slot: z.number().int(),
  time: z.iso.datetime(),
});
export type LedgerEntry = z.infer<typeof LedgerEntry>;

/** Newest first. `next` is the cursor for the page after this one (pass it as `before`); null on the last page. */
export const LedgerPage = z.object({ entries: z.array(LedgerEntry), next: z.string().nullable() });
export type LedgerPage = z.infer<typeof LedgerPage>;

export const LedgerQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  /** A `next` cursor from a previous page. */
  before: z.string().regex(/^\d+\.[1-9A-HJ-NP-Za-km-z]{64,88}\.\d+$/, "must be a cursor from a previous page").optional(),
  kind: LedgerKind.optional(),
});
export type LedgerQuery = z.infer<typeof LedgerQuery>;

/** Revenue collected in one asset, by stream. */
export const RevenueStreams = z.object({
  platformFee: raw,
  poolFee: raw,
  feeKey: raw,
  /** All three streams together. */
  total: raw,
});
export type RevenueStreams = z.infer<typeof RevenueStreams>;

export const RevenueTotal = RevenueStreams.extend({
  asset: RevenueAsset,
  /** Moved on to the treasury so far. */
  swept: raw,
  /** Forwarded to Creators so far (ADR 0009): their share of what was collected. */
  creatorForwarded: raw,
  /** Collected for Creators and not forwarded yet: still in the operations wallet, and not the platform's. */
  creatorPending: raw,
});
export type RevenueTotal = z.infer<typeof RevenueTotal>;

export const RevenueDay = z.object({
  /** A UTC calendar day, YYYY-MM-DD. */
  day: z.iso.date(),
  /** What each asset collected that day; assets with nothing that day are left out. */
  assets: z.array(RevenueStreams.extend({ asset: RevenueAsset })),
});
export type RevenueDay = z.infer<typeof RevenueDay>;

export const Revenue = z.object({
  /** The hot wallet every collection pays into (ADR 0004). */
  operationsWallet: base58,
  /** Where sweeps go; null until one is configured. */
  treasury: base58.nullable(),
  /** The operations wallet's SOL is swept once it holds more than this, in lamports... */
  sweepThresholdLamports: raw,
  /** ...down to this, which stays behind for network fees. */
  sweepFloatLamports: raw,
  /** All-time totals per asset, SOL first, then by ticker. */
  totals: z.array(RevenueTotal),
  /** Daily totals for the latest 30 days with revenue, newest first. */
  days: z.array(RevenueDay),
});
export type Revenue = z.infer<typeof Revenue>;

// ---------------------------------------------------------------------------------------------------------------------
// Operator: scheduled job runs.

export const JobName = z.enum(["quote-registry", "graduation-watch", "fee-collector", "creator-forward", "reward-tax-lock", "reward-rounds", "burn", "metadata-upload"]);
export type JobName = z.infer<typeof JobName>;

export const JobRun = z.object({
  id: z.string(),
  job: JobName,
  /** `skipped` when another run of the same job held its lease. */
  status: z.enum(["running", "succeeded", "failed", "skipped"]),
  startedAt: z.iso.datetime(),
  finishedAt: z.iso.datetime().nullable(),
  /** What the run did, in the job's own terms. */
  summary: z.unknown().nullable(),
  error: z.string().nullable(),
});
export type JobRun = z.infer<typeof JobRun>;

/** A transaction a job signed that has not landed, failed or expired yet. */
export const PendingJobTransaction = z.object({
  signature: z.string(),
  job: z.string(),
  purpose: z.string(),
  subject: z.string(),
  createdAt: z.iso.datetime(),
});
export type PendingJobTransaction = z.infer<typeof PendingJobTransaction>;

/** Newest first. */
export const JobRunList = z.object({ runs: z.array(JobRun), pending: z.array(PendingJobTransaction) });
export type JobRunList = z.infer<typeof JobRunList>;
