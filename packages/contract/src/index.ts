import { z } from "zod";

/** The public API contract, shared by the API (which validates with it) and every client, including our web app. */

const base58 = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "must be a base58 address");
const optionalUrl = z.union([z.url({ protocol: /^https?$/ }).max(200), z.literal("")]).optional().transform((v) => v || undefined);

export const LAUNCH_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
export const LAUNCH_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;

/** Text fields of the launch form; the image travels alongside as a multipart file. */
export const PrepareLaunchFields = z.object({
  creator: base58,
  name: z.string().trim().min(1).max(32),
  symbol: z.string().trim().min(1).max(10).regex(/^[A-Za-z0-9$]+$/, "letters, digits and $ only"),
  description: z.string().trim().max(1000).default(""),
  website: optionalUrl,
  x: optionalUrl,
  telegram: optionalUrl,
});
export type PrepareLaunchFields = z.infer<typeof PrepareLaunchFields>;

export const PreparedLaunch = z.object({
  /** Base64 v0 transaction, already signed by the new mint; the Creator's wallet signs as fee payer and sends it. */
  transaction: z.string(),
  mint: base58,
  pool: base58,
  metadataUri: z.string(),
  lastValidBlockHeight: z.number().int(),
});
export type PreparedLaunch = z.infer<typeof PreparedLaunch>;

export const LaunchSummary = z.object({
  mint: base58,
  pool: base58,
  creator: base58,
  quoteMint: base58,
  name: z.string(),
  symbol: z.string(),
  metadataUri: z.string(),
  image: z.string().nullable(),
  description: z.string().nullable(),
  links: z.object({ website: z.string().nullable(), x: z.string().nullable(), telegram: z.string().nullable() }),
  /** Raw units of the Quote Asset, as a decimal string. */
  graduationTarget: z.string(),
  createdSignature: z.string(),
  createdAt: z.iso.datetime(),
});
export type LaunchSummary = z.infer<typeof LaunchSummary>;

export const LaunchList = z.object({ launches: z.array(LaunchSummary) });
export type LaunchList = z.infer<typeof LaunchList>;

export const ApiError = z.object({ error: z.string(), details: z.unknown().optional() });
export type ApiError = z.infer<typeof ApiError>;

/** Client-visible platform facts, so clients never hard-code them. */
export const PlatformInfo = z.object({
  cluster: z.enum(["localnet", "devnet", "mainnet"]),
  rpcUrl: z.string(),
  platformConfig: base58,
  quoteMint: base58,
  graduationTarget: z.string(),
  platformFeeBps: z.number(),
  creatorFeeBps: z.number(),
});
export type PlatformInfo = z.infer<typeof PlatformInfo>;
