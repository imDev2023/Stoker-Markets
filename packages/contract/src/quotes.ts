import { z } from "zod";

/** Asset Pairing: the Quote Assets a Launch can be paired with, as the Quote Registry lists them. */

const base58 = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "must be a base58 address");
const rawAmount = z.string().regex(/^\d+$/, "must be a raw integer amount");

/** A Graduation Target in both terms: raw units of the Quote Asset, and the SOL it was worth, in lamports, when it was set. */
export const GraduationTarget = z.object({ raw: rawAmount, lamports: rawAmount });
export type GraduationTarget = z.infer<typeof GraduationTarget>;

/**
 * The kinds of Quote Asset the board filters by and the assets page groups by (ADR 0010). SOL; a stablecoin; a tokenized
 * stock (a mint whose freeze authority or permanent delegate belongs to a known stock issuer: xStocks, PreStocks, Tessera,
 * Backpack); a real-world asset that is not a stock (gold, silver); a coin of another chain wrapped on Solana (BTC, ETH,
 * BNB); a DeFi protocol's token, staked SOL included; one of Hylo's leveraged tokens; a collectible; a meme coin; and
 * everything else, a community token. Read from the mint's address and authorities and from Jupiter's token tags, never
 * from a name.
 */
export const QUOTE_CATEGORIES = ["sol", "stablecoin", "tokenized_stock", "rwa", "wrapped", "defi", "leveraged", "collectible", "meme", "community"] as const;
export const QuoteCategory = z.enum(QUOTE_CATEGORIES);
export type QuoteCategory = z.infer<typeof QuoteCategory>;

/**
 * Which issuer a tokenized stock comes from, read from the authorities it keeps over the mint; the board's "Paired with"
 * chips are finer than the category for stocks. Null for every Quote Asset that is not a tokenized stock.
 */
export const QUOTE_ISSUERS = ["xstocks", "prestocks", "tessera", "backpack"] as const;
export const QuoteIssuer = z.enum(QUOTE_ISSUERS);
export type QuoteIssuer = z.infer<typeof QuoteIssuer>;

/**
 * The kinds of Quote Risk Label. From the mint: its issuer's power to freeze wallets, move tokens, pause transfers, add
 * a transfer hook or freeze new accounts by default, a transfer fee (current or scheduled), and balances shown through a
 * multiplier or with interest. From the token list: not verified, and low or unknown liquidity.
 */
export const QUOTE_LABEL_KINDS = [
  "freeze", "permanent_delegate", "pausable", "transfer_hook", "default_frozen", "transfer_fee", "scaled_balance", "interest_bearing",
  "unverified", "low_liquidity",
] as const;
export const QuoteLabelKind = z.enum(QUOTE_LABEL_KINDS);
export type QuoteLabelKind = z.infer<typeof QuoteLabelKind>;

/** A Quote Risk Label: one fact about a Quote Asset, written for people, with where it was read from. It informs; it never blocks. */
export const QuoteLabel = z.object({
  kind: QuoteLabelKind,
  /** `caution` for a power someone holds over the asset or its holders, `info` for a fact about how it trades. */
  severity: z.enum(["caution", "info"]),
  /** Short enough for a chip: "Can freeze wallets", "1% transfer fee". */
  title: z.string(),
  /** A sentence or two on what it means for a Creator or trader. */
  detail: z.string(),
  /** Where the fact was read: the mint on-chain, or the token list by name. */
  source: z.string(),
});
export type QuoteLabel = z.infer<typeof QuoteLabel>;

/** Enough about a Quote Asset to show an amount in it: every Launch carries one. */
export const QuoteRef = z.object({
  mint: base58,
  /** Null when the mint has no on-chain metadata; show a short mint address instead. */
  symbol: z.string().nullable(),
  name: z.string().nullable(),
  decimals: z.number().int(),
  logo: z.string().nullable(),
  category: QuoteCategory,
  issuer: QuoteIssuer.nullable(),
});
export type QuoteRef = z.infer<typeof QuoteRef>;

export const QuoteAsset = QuoteRef.extend({
  globalConfig: base58,
  /** SPL Token or Token-2022 program id. */
  tokenProgram: base58,
  /** Decimal strings; null when there is no reliable price. `usd` is also null when SOL itself has no USD price. */
  price: z.object({ sol: z.string(), usd: z.string().nullable(), at: z.iso.datetime() }).nullable(),
  /** What a Launch paired with this asset raises to graduate, at the latest price; null without a price. */
  graduationTarget: GraduationTarget.nullable(),
  launchable: z.boolean(),
  /** Why the asset can't be launched against right now, written for the Creator; null when it can. */
  reason: z.string().nullable(),
  /**
   * The referral share fee on curve trades paired with this asset: allowed where its GlobalConfig lets a trade name a
   * share fee (SOL's does, most don't), and the rate a referred trade pays its referrer, in basis points of the trade.
   */
  referralShare: z.object({ allowed: z.boolean(), bps: z.number().int() }),
  /**
   * The asset's liquidity in US dollars across the markets the token list routes through, as of the last refresh; null
   * when the list doesn't know the mint. How prominent an asset is: the launch form's chooser lists the deepest first.
   */
  liquidityUsd: z.number().nullable(),
  /**
   * Its Quote Risk Labels, cautions first: null until the Quote Registry refresh has checked the mint, an empty list
   * when there is nothing to flag. Never a reason to refuse a launch or a trade.
   */
  labels: z.array(QuoteLabel).nullable(),
});
export type QuoteAsset = z.infer<typeof QuoteAsset>;

export const QuoteAssetList = z.object({ quotes: z.array(QuoteAsset) });
export type QuoteAssetList = z.infer<typeof QuoteAssetList>;
