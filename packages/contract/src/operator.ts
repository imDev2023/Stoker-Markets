import { z } from "zod";
import { JobRun } from "./revenue";

/**
 * The operator view and fee-change announcements (#22). The view is behind the operator token; announcements are public,
 * so a change to the fees every live curve pays never comes as a surprise.
 */

/** Everything at a glance, for support. */
export const OperatorOverview = z.object({
  launches: z.object({
    total: z.number().int(),
    byStatus: z.object({ live: z.number().int(), graduating: z.number().int(), graduated: z.number().int() }),
    /** Reward Launches among them. */
    reward: z.number().int(),
  }),
  rewardRounds: z.object({ paying: z.number().int(), paid: z.number().int() }),
  /** Buy-and-burn transactions so far. */
  burns: z.number().int(),
  /**
   * Permanent metadata (#44): Launches whose image and metadata JSON are on Arweave, and launched ones still waiting
   * for the Metadata Upload job (an item signed for a launch that never landed is neither).
   */
  metadataUploads: z.object({ uploaded: z.number().int(), pending: z.number().int() }),
  /** The latest run of each scheduled job. */
  jobs: z.array(JobRun),
  openAlerts: z.number().int(),
  /** The Platform Fee and Creator Fee as the chain has them now, in basis points. */
  fees: z.object({ platformFeeBps: z.number(), creatorFeeBps: z.number() }),
});
export type OperatorOverview = z.infer<typeof OperatorOverview>;

/** LaunchLab caps each of the platform's two fee rates; 10000 basis points is its 1e6 denominator's whole. */
export const FEE_BPS_MAX = 10_000;

/** Operator: announces a fee change. It applies to every live curve at once, so it takes effect no sooner than the lead time. */
export const AnnounceFeeChange = z.object({
  platformFeeBps: z.number().int().min(0).max(FEE_BPS_MAX),
  creatorFeeBps: z.number().int().min(0).max(FEE_BPS_MAX),
  effectiveAt: z.iso.datetime(),
  note: z.string().trim().max(500).optional(),
});
export type AnnounceFeeChange = z.infer<typeof AnnounceFeeChange>;

export const FeeAnnouncement = z.object({
  id: z.string(),
  platformFeeBps: z.number().int(),
  creatorFeeBps: z.number().int(),
  note: z.string().nullable(),
  announcedAt: z.iso.datetime(),
  effectiveAt: z.iso.datetime(),
  /** The `update_platform_config` transaction that applied it, once the admin has signed and sent it. */
  appliedSignature: z.string().nullable(),
  appliedAt: z.iso.datetime().nullable(),
});
export type FeeAnnouncement = z.infer<typeof FeeAnnouncement>;

/** Newest effective time first. */
export const FeeAnnouncementList = z.object({ announcements: z.array(FeeAnnouncement) });
export type FeeAnnouncementList = z.infer<typeof FeeAnnouncementList>;

/** Operator: asks for the transaction that applies an announced change, once its time has come. */
export const PrepareFeeChange = z.object({ id: z.string() });
export type PrepareFeeChange = z.infer<typeof PrepareFeeChange>;

/** The `update_platform_config` transaction for the cold admin key to sign (ADR 0004), unsigned, with its rates. */
export const PreparedFeeChange = z.object({
  id: z.string(),
  admin: z.string(),
  platformFeeBps: z.number().int(),
  creatorFeeBps: z.number().int(),
  /** Base64 legacy transaction; the admin signs as fee payer and sends it. */
  transaction: z.string(),
  lastValidBlockHeight: z.number().int(),
});
export type PreparedFeeChange = z.infer<typeof PreparedFeeChange>;
