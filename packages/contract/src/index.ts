import { z } from "zod";
import { LaunchMarket } from "./board";
import { GraduationTarget, QuoteRef } from "./quotes";
import { CurveProgress, Graduation, SolRouteSource } from "./trades";
import { LaunchModeFields, LaunchModesSummary, RewardTax } from "./launchModes";

/** The public API contract, shared by the API (which validates with it) and every client, including our web app. */

export * from "./quotes";
export * from "./trades";
export * from "./creatorEarnings";
export * from "./board";
export * from "./launchModes";
export * from "./revenue";
export * from "./rewards";
export * from "./burns";
export * from "./apiKeys";
export * from "./operator";

const base58 = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "must be a base58 address");
const optionalUrl = z.union([z.url({ protocol: /^https?$/ }).max(200), z.literal("")]).optional().transform((v) => v || undefined);

export const LAUNCH_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
export const LAUNCH_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;

/** Text fields of the launch form; the image travels alongside as a multipart file. */
export const PrepareLaunchFields = z.object({
  creator: base58,
  /** The Quote Asset's mint; see GET /v1/quotes. */
  quoteMint: base58,
  name: z.string().trim().min(1).max(32),
  symbol: z.string().trim().min(1).max(10).regex(/^[A-Za-z0-9$]+$/, "letters, digits and $ only"),
  description: z.string().trim().max(1000).default(""),
  website: optionalUrl,
  x: optionalUrl,
  telegram: optionalUrl,
}).extend(LaunchModeFields.shape);
export type PrepareLaunchFields = z.infer<typeof PrepareLaunchFields>;

export const PreparedLaunch = z.object({
  /** Base64 v0 transaction, already signed by the new mint; the Creator's wallet signs as fee payer and sends it. */
  transaction: z.string(),
  mint: base58,
  pool: base58,
  metadataUri: z.string(),
  lastValidBlockHeight: z.number().int(),
  /** Fixed in the transaction from the Quote Asset's price at the moment it was first prepared; a retry keeps it. */
  graduationTarget: GraduationTarget,
}).extend(LaunchModesSummary.shape);
export type PreparedLaunch = z.infer<typeof PreparedLaunch>;

export const LaunchSummary = z.object({
  mint: base58,
  pool: base58,
  creator: base58,
  quote: QuoteRef,
  name: z.string(),
  symbol: z.string(),
  metadataUri: z.string(),
  image: z.string().nullable(),
  description: z.string().nullable(),
  links: z.object({ website: z.string().nullable(), x: z.string().nullable(), telegram: z.string().nullable() }),
  /** Raw units of the Quote Asset, as a decimal string. */
  graduationTarget: z.string(),
  curve: CurveProgress,
  /** Set once Raydium has moved the Launch into its CPMM pool, where it trades from then on. */
  graduation: Graduation.nullable(),
  /** A Reward Launch's Reward Tax; null for a standard coin. */
  rewardTax: RewardTax.nullable(),
  market: LaunchMarket,
  createdSignature: z.string(),
  createdAt: z.iso.datetime(),
});
export type LaunchSummary = z.infer<typeof LaunchSummary>;

export const LaunchList = z.object({
  launches: z.array(LaunchSummary),
  /** The `offset` of the next page; null on the last page. */
  nextOffset: z.number().int().nullable(),
});
export type LaunchList = z.infer<typeof LaunchList>;

export const ApiError = z.object({ error: z.string(), details: z.unknown().optional() });
export type ApiError = z.infer<typeof ApiError>;

/** Client-visible platform facts, so clients never hard-code them. */
export const PlatformInfo = z.object({
  cluster: z.enum(["localnet", "devnet", "mainnet"]),
  rpcUrl: z.string(),
  /** Raydium's LaunchLab program on this cluster, for anyone building a transaction without our API. */
  launchlabProgram: base58,
  platformConfig: base58,
  /** Every Launch's Graduation Target is worth this much SOL, in lamports, at the moment it launches. */
  graduationTargetLamports: z.string(),
  platformFeeBps: z.number(),
  /** LaunchLab's on-chain creator fee on curve trades, as the chain has it: 0 on our platform (ADR 0009). */
  creatorFeeBps: z.number(),
  /** The creator fee of the CPMM config graduated pools use, which the platform collects after Graduation (1% on mainnet). */
  poolCreatorFeeBps: z.number(),
  /**
   * Raydium's own fee on a trade, which a trader pays on top of the platform's: on the curve the GlobalConfig's trade
   * fee (SOL's, the same on every GlobalConfig when checked), after Graduation the CPMM config's trade fee. A trader
   * pays `platformFeeBps + creatorFeeBps + raydiumFee.curveBps` on the curve and `poolCreatorFeeBps + raydiumFee.poolBps`
   * in the pool.
   */
  raydiumFee: z.object({ curveBps: z.number(), poolBps: z.number() }),
  /**
   * The Creator Forward (ADR 0009): what the platform pays a Creator, `shareBps` of what it collects on their coin's
   * trades on either venue. That is `curveBps` of every curve trade (out of the Platform Fee) and `poolBps` of every
   * pool trade (out of the pool creator fee at the rate of the CPMM config graduated pools use). Paid in the Quote
   * Asset once the amount owed is worth `minLamports`.
   */
  creatorForward: z.object({ shareBps: z.number().int(), curveBps: z.number(), poolBps: z.number(), minLamports: z.string() }),
  /** What a referred curve trade pays its referrer, in basis points, where the Quote Asset allows a share fee. */
  referralShareBps: z.number().int(),
  /** Where buys paid with SOL on a Launch paired with anything else get their Quote Asset; null when this deployment has no route. */
  solRoute: SolRouteSource.nullable(),
});
export type PlatformInfo = z.infer<typeof PlatformInfo>;

/** Something the operator must act on, such as a Launch whose curve sold out but that Raydium has not migrated. */
export const OperatorAlert = z.object({
  kind: z.enum(["graduation_stuck", "reward_tax_unlocked", "job_failed", "reward_round_stalled"]),
  /** What the alert is about: a Launch's mint, a job's name for `job_failed`, a round's id for `reward_round_stalled`. */
  subject: z.string(),
  message: z.string(),
  raisedAt: z.iso.datetime(),
  /** When the cause went away, such as the migration finally landing; null while it still needs attention. */
  resolvedAt: z.iso.datetime().nullable(),
});
export type OperatorAlert = z.infer<typeof OperatorAlert>;

export const OperatorAlertList = z.object({ alerts: z.array(OperatorAlert) });
export type OperatorAlertList = z.infer<typeof OperatorAlertList>;
