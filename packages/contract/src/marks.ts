import { z } from "zod";
import { CandleInterval } from "./trades";

/**
 * Marks on a coin's chart (#160): who traded in each candle and which posts on X named the coin, so a visitor reads the
 * coin's story off the chart itself. Trade marks come from the indexed trades as they stand, nothing stored; mentions
 * are the posts the mentions job found while the coin traded.
 */

const base58 = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "must be a base58 address");
const raw = z.string().regex(/^\d+$/, "must be a whole number of raw units");

/** The most marks one candle carries: the chart library draws at most ten on a bar. */
export const MARKS_PER_CANDLE = 10;
/** The most trade marks one request answers, the latest candles' first. */
export const TRADE_MARKS_MAX = 2000;

/**
 * Why a wallet's trades are marked when the chart shows its key wallets: the visitor's own wallet, a wallet the operator
 * named after its X account, the coin's Creator, a wallet that bought in the Snipe Window (ADR 0013), or one of the
 * largest holders by their trades. Every trade is marked on request, most with no role.
 */
export const MARK_ROLES = ["you", "notable", "creator", "sniper", "holder"] as const;
export const MarkRole = z.enum(MARK_ROLES);
export type MarkRole = z.infer<typeof MarkRole>;

/** An X account, as a mark shows it. `avatarUrl` is our API's copy of the picture, null when none is cached. */
export const XAccount = z.object({
  handle: z.string(),
  name: z.string().nullable(),
  avatarUrl: z.string().nullable(),
});
export type XAccount = z.infer<typeof XAccount>;

/** One wallet's trades on one side in one candle. */
export const TradeMark = z.object({
  /** Start of the candle, in Unix seconds: the bar the mark sits on. */
  time: z.number().int(),
  wallet: base58,
  side: z.enum(["buy", "sell"]),
  /** How many trades the mark stands for. */
  trades: z.number().int().positive(),
  /** Coins bought or sold, and the Quote Asset paid or received with fees, raw units, summed over those trades. */
  baseAmount: raw,
  quoteAmount: raw,
  /** The coin's market cap right after the last of them (its price then times the supply), in whole Quote Asset units. */
  marketCap: z.number(),
  /** When the last of them landed, and its signature. */
  at: z.iso.datetime(),
  signature: z.string(),
  roles: z.array(MarkRole),
  /** The wallet's picture: its X picture when the wallet is a notable one with a picture, else its generated avatar. */
  avatarUrl: z.string(),
  /** The X account the wallet is known by, for a notable wallet; null otherwise. */
  x: XAccount.nullable(),
});
export type TradeMark = z.infer<typeof TradeMark>;

/** A post on X that named the coin. */
export const MentionMark = z.object({
  /** The candle the post falls in, in Unix seconds: the latest one at or before it was posted, or the first one. */
  time: z.number().int(),
  id: z.string(),
  /** The post on X. */
  url: z.string(),
  text: z.string(),
  postedAt: z.iso.datetime(),
  /** The coin's market cap when it was posted, in whole Quote Asset units; null before its first trade. */
  marketCap: z.number().nullable(),
  author: XAccount,
});
export type MentionMark = z.infer<typeof MentionMark>;

/**
 * Which marks to answer: those on the candles of `interval` that start from `from` to `to` (Unix seconds, both
 * inclusive), the key wallets' trades (`trades=key`, with `wallet` the visitor's own), every trade (`all`) or none, and
 * the mentions unless `mentions=false`.
 */
export const MarkQuery = z.object({
  interval: CandleInterval.default("5m"),
  from: z.coerce.number().int().nonnegative(),
  to: z.coerce.number().int().nonnegative(),
  trades: z.enum(["key", "all", "none"]).default("key"),
  mentions: z.enum(["true", "false"]).default("true"),
  wallet: base58.optional(),
});
export type MarkQuery = z.input<typeof MarkQuery>;

export const MarkList = z.object({
  interval: CandleInterval,
  trades: z.array(TradeMark),
  mentions: z.array(MentionMark),
});
export type MarkList = z.infer<typeof MarkList>;

/** An X handle without its @: letters, digits and underscores, at most 15. */
export const XHandle = z.string().trim().transform((h) => h.replace(/^@/, "")).pipe(z.string().regex(/^[A-Za-z0-9_]{1,15}$/, "an X handle: letters, digits and _, at most 15"));

/** A wallet the operator names after its owner's X account (#160); `avatarUrl` is a picture the API copies once. */
export const NotableWalletInput = z.object({
  wallet: base58,
  handle: XHandle,
  name: z.string().trim().min(1).max(50).optional(),
  avatarUrl: z.url({ protocol: /^https?$/ }).max(500).optional(),
});
export type NotableWalletInput = z.input<typeof NotableWalletInput>;

export const NotableWallet = z.object({
  wallet: base58,
  x: XAccount,
  addedAt: z.iso.datetime(),
});
export type NotableWallet = z.infer<typeof NotableWallet>;

export const NotableWalletList = z.object({ wallets: z.array(NotableWallet) });
export type NotableWalletList = z.infer<typeof NotableWalletList>;

/**
 * A wallet's generated avatar: two hues from its address, so the same wallet looks the same everywhere and two wallets
 * look different, with nothing fetched or stored. The site draws it as a gradient and the API serves it as an image.
 */
export function avatarHues(address: string): [number, number] {
  let a = 0;
  let b = 0;
  for (let i = 0; i < address.length; i++) {
    const c = address.charCodeAt(i);
    if (i % 2 === 0) a = (a * 31 + c) % 360;
    else b = (b * 37 + c) % 360;
  }
  return [a, (a + 40 + (b % 80)) % 360];
}
