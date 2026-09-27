import { z } from "zod";
import { TradeQuote } from "./trades";

/** Launch modes: the Creator's first buy in the launch transaction itself, and an airdrop paid from that first buy. */

const base58 = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "must be a base58 address");
const raw = z.string().regex(/^\d+$/, "must be a whole number of raw units");
const positiveRaw = z.string().regex(/^[1-9]\d*$/, "must be a whole number of raw units, more than zero");

/** Wallets one airdrop may pay; its payments are split over as many transactions as they need. */
export const AIRDROP_MAX_RECIPIENTS = 200;

export const AirdropRecipient = z.object({
  wallet: base58,
  /** Coins this wallet gets, raw units. */
  amount: positiveRaw,
});
export type AirdropRecipient = z.infer<typeof AirdropRecipient>;

export const AirdropRecipients = z
  .array(AirdropRecipient)
  .min(1, "an airdrop needs at least one wallet")
  .max(AIRDROP_MAX_RECIPIENTS, `an airdrop pays at most ${AIRDROP_MAX_RECIPIENTS} wallets`)
  .refine((list) => new Set(list.map((r) => r.wallet)).size === list.length, "each wallet may appear only once");
export type AirdropRecipients = z.infer<typeof AirdropRecipients>;

/** Launch-form fields for the launch modes; multipart carries the airdrop list as JSON text. */
export const LaunchModeFields = z.object({
  /** Quote Asset the Creator spends on a first buy inside the launch transaction, raw units. */
  firstBuy: z.union([positiveRaw, z.literal("")]).optional().transform((v) => v || undefined),
  /** JSON array of `{ wallet, amount }`, paid from the first buy's coins once the coin has launched. */
  airdrop: z
    .union([z.string(), z.literal("")])
    .optional()
    .transform((text, ctx) => {
      if (!text) return undefined;
      try {
        return JSON.parse(text) as unknown;
      } catch {
        ctx.addIssue({ code: "custom", message: "airdrop must be a JSON list of { wallet, amount }" });
        return z.NEVER;
      }
    })
    .pipe(AirdropRecipients.optional()),
});

/** What a launch with these modes will do, fixed when it is prepared. */
export const LaunchModesSummary = z.object({
  /** The first buy, exact: it is the curve's first trade and lands in the launch transaction. Null without one. */
  firstBuy: TradeQuote.nullable(),
  /** The airdrop, paid from the first buy's coins in separate transactions once the coin has launched. */
  airdrop: z
    .object({
      recipients: z.number().int(),
      /** Coins it gives away in total, raw units. */
      amount: raw,
      /** Transactions it takes. */
      transactions: z.number().int(),
      /** SOL the Creator's wallet pays for it: rent for each wallet's new coin account plus network fees, lamports. */
      costLamports: raw,
    })
    .nullable(),
});
export type LaunchModesSummary = z.infer<typeof LaunchModesSummary>;

export const FirstBuyQuoteQuery = z.object({
  /** The Quote Asset the coin would pair with; see GET /v1/quotes. */
  quoteMint: base58,
  /** Quote Asset a first buy would spend, raw units. */
  firstBuy: positiveRaw,
});
export type FirstBuyQuoteQuery = z.infer<typeof FirstBuyQuoteQuery>;

/** What a first buy of a given amount gets on a new curve. */
export const FirstBuyQuote = z.object({ firstBuy: TradeQuote });
export type FirstBuyQuote = z.infer<typeof FirstBuyQuote>;

/** Unpaid; handed out in a transaction that can still land; or paid, with the transaction that paid it. */
export const AirdropPaymentStatus = z.enum(["unpaid", "sending", "paid"]);
export type AirdropPaymentStatus = z.infer<typeof AirdropPaymentStatus>;

export const AirdropStatus = z.object({
  mint: base58,
  creator: base58,
  /** Coins the airdrop gives away in total, raw units. */
  amount: raw,
  /** Coins already paid, raw units. */
  paid: raw,
  recipients: z.array(
    AirdropRecipient.extend({
      status: AirdropPaymentStatus,
      signature: z.string().nullable(),
    }),
  ),
});
export type AirdropStatus = z.infer<typeof AirdropStatus>;

export const PreparedAirdrop = z.object({
  /** Base64 unsigned v0 transactions; the Creator's wallet signs every one and sends them. */
  transactions: z.array(z.string()).min(1),
  /** None of these transactions can land after this block height. */
  lastValidBlockHeight: z.number().int(),
  /** Wallets these transactions pay. */
  recipients: z.number().int(),
});
export type PreparedAirdrop = z.infer<typeof PreparedAirdrop>;
