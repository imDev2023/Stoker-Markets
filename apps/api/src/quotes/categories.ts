import { WSOL_MINT, type QuoteMintInfo } from "@launchpad/chain";
import type { QuoteCategory } from "@launchpad/contract";

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
 * Tokenized-stock issuers, by the authorities they keep over their mints (from the spike's scan of mainnet's GlobalConfigs):
 * Backed xStocks, Backpack Securities and PreStocks. A mint whose freeze authority or permanent delegate is one of these is
 * the issuer's stock token, so a new stock the issuer lists is recognised without a code change.
 */
const STOCK_ISSUER_AUTHORITIES = new Set([
  "JDq14BWvqCRFNu1krb12bcRpbGtJZ1FLEakMw6FdxJNs", // xStocks freeze authority
  "5aMNNLQJwAEeoemTEMkv5NVjqKwvvefRYCQ5Z67HFvEq", // xStocks permanent delegate
  "2cVYpagTt7ZGc3mmTXBa7fAznUtx5DUu6aCq8uVDaf4a", // Backpack Securities
  "WV9PJN7XTmTLVwbutCLFxp8TyePee6Xq5mRq6Fti5Wc", // PreStocks
]);

/**
 * Names prove nothing here either: the spike's name-based scan counted a pump.fun coin called "GoPro - Backpack Securities"
 * (AjdE84...pump, no authorities) as a stock. By its authorities it is a community token, which is what it is.
 */
export function quoteCategory(m: Pick<QuoteMintInfo, "mint" | "freezeAuthority" | "permanentDelegate">): QuoteCategory {
  if (m.mint.equals(WSOL_MINT)) return "sol";
  if (STABLECOINS.has(m.mint.toBase58())) return "stablecoin";
  const issuer = [m.freezeAuthority, m.permanentDelegate].some((a) => a && STOCK_ISSUER_AUTHORITIES.has(a.toBase58()));
  return issuer ? "tokenized_stock" : "community";
}
