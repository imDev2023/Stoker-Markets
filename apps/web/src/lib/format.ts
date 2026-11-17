import type { QuoteRef } from "@launchpad/contract";

/** A Quote Asset's ticker from the Quote Registry, or its short mint address when the mint has no metadata. */
export function quoteTicker(quote: Pick<QuoteRef, "mint" | "symbol">) {
  return quote.symbol ?? shortAddress(quote.mint);
}

const WSOL_MINT = "So11111111111111111111111111111111111111112";
/** SOL's decimals: lamports per SOL is 10^9. */
export const SOL_DECIMALS = 9;

/** SOL is paid from and to the wallet's own balance; every other Quote Asset from a token account. */
export function isSol(quote: Pick<QuoteRef, "mint">) {
  return quote.mint === WSOL_MINT;
}

/**
 * Every new Launch's coin has 6 decimals and a supply of 1 trillion: the launch shape our curve rules pin on-chain
 * (`LAUNCH_SHAPE`, ADR 0005, #166). It is the launch form's figure alone: a coin launched on an earlier shape keeps its
 * own supply, so anything about a launched coin reads the API's figures (its market cap, its holders' supply).
 */
export const COIN_DECIMALS = 6;
export const COIN_SUPPLY = 1_000_000_000_000;

/** A share of the supply (0 to 1) as a percentage: two decimals below 1%, one above, and "<0.01%" for a trace. */
export function formatShare(share: number) {
  const pct = share * 100;
  if (pct > 0 && pct < 0.01) return "<0.01%";
  return `${pct.toFixed(pct < 1 ? 2 : 1)}%`;
}

/**
 * A raw amount as a share of a coin's supply, the way the launch summary writes a First Buy's (`supplyShare` on the
 * launch form): whole hundredths of a percent, cut and never rounded up, and "<0.01%" for a trace. Whatever repeats a
 * figure the summary promised uses this, so the two never differ by a rounding (#221).
 */
export function formatSupplyShare(raw: bigint, supply: bigint) {
  const basisPoints = Number((raw * 10_000n) / supply);
  if (raw > 0n && basisPoints === 0) return "<0.01%";
  return `${(basisPoints / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
}

export function shortAddress(address: string) {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

/** Formats a raw amount with the given decimals, trimming trailing zeros. A negative amount keeps its sign in front. */
export function formatUnits(raw: string, decimals: number, maxFraction = 4) {
  const signed = BigInt(raw);
  const n = signed < 0n ? -signed : signed;
  const base = 10n ** BigInt(decimals);
  const whole = n / base;
  const fraction = (n % base).toString().padStart(decimals, "0").slice(0, maxFraction).replace(/0+$/, "");
  return `${signed < 0n ? "-" : ""}${whole.toLocaleString("en-US")}${fraction ? `.${fraction}` : ""}`;
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

/** A date and time in UTC, so the server and every browser render the same text. */
export function formatUtc(iso: string) {
  return `${new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC`;
}

/** A UTC calendar day (YYYY-MM-DD) as people write it: Sep 28, 2026. */
export function formatUtcDay(day: string) {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "UTC" });
}

/** A span of time in its largest whole unit, as people say it: 7 days, 3 hours, 45 seconds. */
export function formatDuration(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  const unit = (n: number, name: string) => `${n} ${name}${n === 1 ? "" : "s"}`;
  if (s < 60) return unit(s, "second");
  if (s < 3600) return unit(Math.round(s / 60), "minute");
  if (s < 86_400) return unit(Math.round(s / 3600), "hour");
  return unit(Math.round(s / 86_400), "day");
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
