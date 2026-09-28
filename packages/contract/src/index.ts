import { z } from "zod";
import { LaunchMarket } from "./board";
import { GraduationTarget, QuoteRef } from "./quotes";
import { CurveProgress, Graduation } from "./trades";
import { LaunchModeFields, LaunchModesSummary } from "./launchModes";

/** The public API contract, shared by the API (which validates with it) and every client, including our web app. */

export * from "./quotes";
export * from "./trades";
export * from "./creatorFees";
export * from "./board";
export * from "./launchModes";
export * from "./revenue";

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
  creatorFeeBps: z.number(),
});
export type PlatformInfo = z.infer<typeof PlatformInfo>;

/** Something the operator must act on, such as a Launch whose curve sold out but that Raydium has not migrated. */
export const OperatorAlert = z.object({
  kind: z.enum(["graduation_stuck"]),
  /** What the alert is about: a Launch's mint for `graduation_stuck`. */
  subject: z.string(),
  message: z.string(),
  raisedAt: z.iso.datetime(),
  /** When the cause went away, such as the migration finally landing; null while it still needs attention. */
  resolvedAt: z.iso.datetime().nullable(),
});
export type OperatorAlert = z.infer<typeof OperatorAlert>;

export const OperatorAlertList = z.object({ alerts: z.array(OperatorAlert) });
export type OperatorAlertList = z.infer<typeof OperatorAlertList>;
