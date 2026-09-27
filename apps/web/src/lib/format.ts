const WSOL = "So11111111111111111111111111111111111111112";

/** Quote Asset tickers. SOL is the only Quote Asset until the Quote Registry lands. */
export function quoteSymbol(mint: string) {
  return mint === WSOL ? "SOL" : `${mint.slice(0, 4)}…`;
}

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

export function timeAgo(iso: string, now = Date.now()) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function explorerUrl(kind: "tx" | "address", value: string, cluster: string) {
  const suffix = cluster === "mainnet" ? "" : cluster === "devnet" ? "?cluster=devnet" : "?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A8899";
  return `https://explorer.solana.com/${kind}/${value}${suffix}`;
}
