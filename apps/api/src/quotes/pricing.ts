/**
 * Pricing: what each Quote Asset is worth, and the Graduation Target that makes. Prices come from a pluggable source
 * (Jupiter on mainnet, a static table on the local chain and devnet) and are kept exact: a Graduation Target is an integer
 * number of raw units, so floating point never touches it.
 */

/** A positive decimal as an exact fraction, `digits / 10^scale`. */
export type Decimal = { digits: bigint; scale: number };

/** Parses "1.5", "2.5e-7" or a JS number (which prints the same way); anything else, zero or negative is not a price. */
export function parseDecimal(value: string | number): Decimal | null {
  const text = typeof value === "number" ? (Number.isFinite(value) ? String(value) : "") : value.trim();
  const m = /^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(text);
  if (!m) return null;
  const fraction = m[2] ?? "";
  let digits = BigInt(m[1]! + fraction);
  let scale = fraction.length - Number(m[3] ?? 0);
  if (scale < 0) {
    digits *= 10n ** BigInt(-scale);
    scale = 0;
  }
  return digits > 0n ? { digits, scale } : null;
}

export function formatDecimal({ digits, scale }: Decimal) {
  if (scale === 0) return digits.toString();
  const s = digits.toString().padStart(scale + 1, "0");
  return `${s.slice(0, -scale)}.${s.slice(-scale)}`.replace(/\.?0+$/, "");
}

const RATIO_SCALE = 18;

/** a / b, to 18 decimal places. */
export function divide(a: Decimal, b: Decimal): Decimal {
  const digits = (a.digits * 10n ** BigInt(b.scale + RATIO_SCALE)) / (b.digits * 10n ** BigInt(a.scale));
  return { digits, scale: RATIO_SCALE };
}

const LAMPORTS_PER_SOL = 10n ** 9n;

/**
 * The raw units of a Quote Asset worth `lamports` of SOL: lamports / 1e9 * (SOL's USD price / the asset's USD price) * 10^decimals,
 * rounded to the nearest unit. The decimals are where a naive port goes wrong: 85 SOL is 85e9 raw units of SOL but
 * 12,750e6 raw units of a 6-decimal $1 stablecoin.
 */
export function graduationTargetRaw(lamports: bigint, decimals: number, quoteUsd: Decimal, solUsd: Decimal): bigint {
  const numerator = lamports * 10n ** BigInt(decimals) * solUsd.digits * 10n ** BigInt(quoteUsd.scale);
  const denominator = LAMPORTS_PER_SOL * quoteUsd.digits * 10n ** BigInt(solUsd.scale);
  return (numerator * 2n + denominator) / (2n * denominator);
}

/** Where Quote Asset prices and logos come from. */
export interface QuoteMarket {
  /** USD prices by mint, for the mints the source prices reliably. The rest are left out, never guessed. */
  usdPrices(mints: string[]): Promise<Map<string, Decimal>>;
  /** Logo URLs by mint, where the source knows one. */
  logos(mints: string[]): Promise<Map<string, string>>;
}

/** A fixed table of USD prices by mint (JSON), for chains with no market: the local chain and devnet. */
export function staticMarket(pricesJson: string): QuoteMarket {
  const table = new Map<string, Decimal>();
  for (const [mint, price] of Object.entries(JSON.parse(pricesJson || "{}") as Record<string, string>)) {
    const d = parseDecimal(price);
    if (!d) throw new Error(`QUOTE_PRICES_USD: ${mint} has an invalid price ${price}`);
    table.set(mint, d);
  }
  return {
    usdPrices: async (mints) => new Map(mints.flatMap((m) => (table.has(m) ? [[m, table.get(m)!] as const] : []))),
    logos: async () => new Map(),
  };
}

const JUPITER_PRICE_IDS_MAX = 50;
const JUPITER_TOKEN_IDS_MAX = 100;

/**
 * Jupiter's Price API v3, which leaves out tokens it can't price reliably, and its Tokens API v2 for logos.
 * Uses the keyed host when an API key is configured, the free one otherwise.
 */
export function jupiterMarket(apiKey: string | undefined): QuoteMarket {
  const host = apiKey ? "https://api.jup.ag" : "https://lite-api.jup.ag";
  const get = async (path: string) => {
    const res = await fetch(`${host}${path}`, { headers: apiKey ? { "x-api-key": apiKey } : {} });
    if (!res.ok) throw new Error(`Jupiter ${path.split("?")[0]} failed: ${res.status}`);
    return res.json();
  };
  return {
    async usdPrices(mints) {
      const out = new Map<string, Decimal>();
      for (let i = 0; i < mints.length; i += JUPITER_PRICE_IDS_MAX) {
        const body = (await get(`/price/v3?ids=${mints.slice(i, i + JUPITER_PRICE_IDS_MAX).join(",")}`)) as Record<
          string,
          { usdPrice?: number; scaledUiConfig?: { usdPricePrescaled?: number } } | null
        >;
        for (const [mint, p] of Object.entries(body ?? {})) {
          // Curves work in raw units, so a ScaledUiAmount mint (most xStocks) needs the price per unscaled unit.
          const price = parseDecimal(p?.scaledUiConfig?.usdPricePrescaled ?? p?.usdPrice ?? NaN);
          if (price) out.set(mint, price);
        }
      }
      return out;
    },
    async logos(mints) {
      const out = new Map<string, string>();
      for (let i = 0; i < mints.length; i += JUPITER_TOKEN_IDS_MAX) {
        const body = (await get(`/tokens/v2/search?query=${mints.slice(i, i + JUPITER_TOKEN_IDS_MAX).join(",")}`)) as { id: string; icon?: string }[];
        for (const t of body ?? []) if (t.icon && /^https:\/\//.test(t.icon)) out.set(t.id, t.icon);
      }
      return out;
    },
  };
}
