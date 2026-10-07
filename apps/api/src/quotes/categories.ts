import { WSOL_MINT, type QuoteMintInfo } from "@launchpad/chain";
import type { QuoteCategory, QuoteIssuer } from "@launchpad/contract";

/**
 * Stablecoins by mint address: a name or ticker proves nothing, since anyone can call a token "USD".
 * The fiat stablecoins among mainnet's GlobalConfigs (USDC, USDT, USD1, EURC; "DUSD" is a pump.fun coin), plus Circle's
 * devnet USDC. A new one needs adding here when Raydium gives it a GlobalConfig.
 */
const STABLECOINS = new Set([
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // USDT
  "USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB", // USD1
  "HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr", // EURC
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU", // devnet USDC
]);

/**
 * Tokenized-stock issuers, by the authorities they keep over their mints (from the spike's scan of mainnet's GlobalConfigs,
 * Tessera's read live on 2026-10-07): Backed xStocks, Backpack Securities, PreStocks and Tessera. A mint whose freeze
 * authority or permanent delegate is one of these is the issuer's stock token, so a new stock the issuer lists is
 * recognised without a code change. Another issuer's stocks count as community tokens until its authorities are added
 * here. "Sunrise", shown elsewhere as a group of its own, is the partner that brings Backpack Securities' stocks to Solana:
 * the same mints under the same authorities, so no issuer of its own.
 */
const STOCK_ISSUER_AUTHORITIES = new Map<string, QuoteIssuer>([
  ["JDq14BWvqCRFNu1krb12bcRpbGtJZ1FLEakMw6FdxJNs", "xstocks"], // xStocks freeze authority
  ["5aMNNLQJwAEeoemTEMkv5NVjqKwvvefRYCQ5Z67HFvEq", "xstocks"], // xStocks permanent delegate
  ["2cVYpagTt7ZGc3mmTXBa7fAznUtx5DUu6aCq8uVDaf4a", "backpack"], // Backpack Securities, freeze authority and permanent delegate
  ["WV9PJN7XTmTLVwbutCLFxp8TyePee6Xq5mRq6Fti5Wc", "prestocks"], // PreStocks
  ["7n2PNcDXVDMK2m8dyV9cVPNY7p4jM4ZMHv7TzfibEt8o", "tessera"], // Tessera freeze authority (tOpenAI, tKalshi)
]);

/**
 * Leveraged tokens and collectibles can't be told by an authority: Hylo's 3x tokens have a different mint authority each
 * and no freeze authority, and the collectible tokens have no authority at all. Pinned by mint address like the
 * stablecoins; a new one needs adding here when Raydium gives it a GlobalConfig.
 */
const LEVERAGED = new Set([
  "4sWNB8zGWHkh6UnmwiEtzNxL4XrN7uK9tosbESbJFfVs", // Hylo 3x Leveraged SOL (xSOL)
  "2zCo6bUowJMvr89ajxuWsPadAqJ2F9akCkxumNsSdgsL", // Hylo 3x Leveraged BTC (xBTC)
  "7ga6rtE9qSb3wdEiDCpTu2kHqoGVfT52jD8ign1rYTvx", // Hylo 3x Leveraged HYPE (xHYPE)
]);
const COLLECTIBLES = new Set([
  "SV151D5pjygAKA8aJJcKzm4wFnRX5G92Fye94jQJk7g", // SV151: a reserve of Pokémon Scarlet & Violet 151 packs (Dynamic Assets)
  "HeeBovJNKd27tQ6xkeP1dfSyTr8LyLwhJz9wfFTbPLEX", // HEEBOO: fan collectibles (heeboo.com)
]);

type MintAuthorities = Pick<QuoteMintInfo, "mint" | "freezeAuthority" | "permanentDelegate">;

/** The stock issuer whose authority is on the mint, or null when no known issuer's is. */
export function quoteIssuer(m: MintAuthorities): QuoteIssuer | null {
  for (const a of [m.freezeAuthority, m.permanentDelegate]) {
    const issuer = a && STOCK_ISSUER_AUTHORITIES.get(a.toBase58());
    if (issuer) return issuer;
  }
  return null;
}

/**
 * Names prove nothing here either: the spike's name-based scan counted a pump.fun coin called "GoPro - Backpack Securities"
 * (AjdE84...pump, no authorities) as a stock. By its authorities it is a community token, which is what it is.
 */
export function quoteCategory(m: MintAuthorities): QuoteCategory {
  if (m.mint.equals(WSOL_MINT)) return "sol";
  const mint = m.mint.toBase58();
  if (STABLECOINS.has(mint)) return "stablecoin";
  if (LEVERAGED.has(mint)) return "leveraged";
  if (COLLECTIBLES.has(mint)) return "collectible";
  return quoteIssuer(m) ? "tokenized_stock" : "community";
}
