import type { QuoteRef } from "@launchpad/contract";

/** A Quote Asset's ticker from the Quote Registry, or its short mint address when the mint has no metadata. */
export function quoteTicker(quote: Pick<QuoteRef, "mint" | "symbol">) {
  return quote.symbol ?? shortAddress(quote.mint);
}

/** Decimals of the Quote Asset's raw units; SOL's 9 until the Quote Registry lands. */
export const QUOTE_DECIMALS = 9;
/** Every Launch's coin has 6 decimals and a supply of 1B: the launch shape our curve rules pin on-chain. */
export const COIN_DECIMALS = 6;
export const COIN_SUPPLY = 1_000_000_000;

export function shortAddress(address: string) {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

/** Formats a raw amount with the given decimals, trimming trailing zeros. */
export function formatUnits(raw: string, decimals: number, maxFraction = 4) {
  const n = BigInt(raw);
  const base = 10n ** BigInt(decimals);
  const whole = n / base;
  const fraction = (n % base).toString().padStart(decimals, "0").slice(0, maxFraction).replace(/0+$/, "");
  return `${whole.toLocaleString("en-US")}${fraction ? `.${fraction}` : ""}`;
}

/** Reads a decimal amount typed by a person into raw units; null if it isn't a positive amount with at most `decimals` places. */
export function parseUnits(text: string, decimals: number): bigint | null {
  const match = /^(\d*)(?:\.(\d*))?$/.exec(text.trim());
  if (!match || (!match[1] && !match[2])) return null;
  const fraction = match[2] ?? "";
  if (fraction.length > decimals) return null;
  const raw = BigInt((match[1] || "0") + fraction.padEnd(decimals, "0"));
  return raw > 0n ? raw : null;
}

/** A price to four significant digits, written out in full: prices on a young curve are tiny fractions of a SOL. */
export function formatPrice(price: number) {
  return price.toLocaleString("en-US", { maximumSignificantDigits: 4 });
}

const SUBSCRIPT = "₀₁₂₃₄₅₆₇₈₉";

/** The same price with its run of leading zeros counted in a subscript, 0.0₈2791 for 0.000000002791, so it fits an axis. */
export function formatPriceCompact(price: number) {
  const full = formatPrice(price);
  const match = /^0\.(0{4,})(\d+)$/.exec(full);
  if (!match) return full;
  const zeros = String(match[1]!.length).replace(/\d/g, (d) => SUBSCRIPT[Number(d)]!);
  return `0.0${zeros}${match[2]}`;
}

/** A raw amount for display where space is short: two decimals from 1 upward (70.83), four below (0.1275). */
export function formatAmount(raw: string, decimals: number) {
  return formatUnits(raw, decimals, BigInt(raw) >= 10n ** BigInt(decimals) ? 2 : 4);
}

export function timeAgo(iso: string, now = Date.now()) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** A local chain has no public explorer cluster, so the explorer is pointed at the platform's own RPC. */
export function explorerUrl(kind: "tx" | "address", value: string, platform: { cluster: string; rpcUrl: string }) {
  const suffix =
    platform.cluster === "mainnet"
      ? ""
      : platform.cluster === "devnet"
        ? "?cluster=devnet"
        : `?cluster=custom&customUrl=${encodeURIComponent(platform.rpcUrl)}`;
  return `https://explorer.solana.com/${kind}/${value}${suffix}`;
}
