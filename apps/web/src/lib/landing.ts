import type { BurnsPage, PlatformStats, QuoteAsset, Revenue } from "@launchpad/contract";
import type { Figure } from "@/components/Stats";
import { ISSUER_LABELS } from "./board";

/** What the landing and the board call one asset's kind, in sentence case: one label grammar from one source. */
export function quoteKind(q: Pick<QuoteAsset, "category" | "issuer">) {
  switch (q.category) {
    case "sol":
      return "Solana";
    case "stablecoin":
      return "Stablecoin";
    case "tokenized_stock":
      return q.issuer ? ISSUER_LABELS[q.issuer] : "Tokenized stock";
    case "rwa":
      return "Real-world asset";
    case "wrapped":
      return "Wrapped";
    case "defi":
      return "DeFi";
    case "leveraged":
      return "Leveraged";
    case "collectible":
      return "Collectible";
    case "meme":
      return "Meme";
    case "community":
      return "Community";
  }
}

/** The deepest markets first, by the registry's liquidity; assets the registry has no depth for keep their order. */
export function deepestQuotes(launchable: QuoteAsset[], count = 8): QuoteAsset[] {
  return [...launchable].sort((a, b) => (b.liquidityUsd ?? -1) - (a.liquidityUsd ?? -1)).slice(0, count);
}

/**
 * The hero's visual candidates (#133; the owner picks by elimination on the real site, `?hero=`): the board's top rows,
 * live; the pair mark cycling through the assets a coin is priced in; the ring at size; the stoke (the ring heating
 * from coal in a slow loop, asked for by the owner on 2026-10-29); the stoke with the pair cycle under it; and the three
 * the owner asked for on 2026-10-30 with the right side made live: the pair picker (name, ticker and the asset, which
 * opens the launch form filled), the most traded coin's real trade panel, and Jupiter's swap, which the owner picked
 * on 2026-10-30 (`swap`, the default) with the rows as their second choice (`rows` stands in when the Plugin's script
 * can't load, and shows the cycle until the first coin launches).
 */
export const HERO_VARIANTS = ["rows", "cycle", "ring", "stoke", "stoke-cycle", "picker", "trade", "swap"] as const;
export type HeroVariant = (typeof HERO_VARIANTS)[number];
export const heroVariantFrom = (value: string | string[] | undefined): HeroVariant =>
  (HERO_VARIANTS as readonly string[]).includes(typeof value === "string" ? value : "") ? (value as HeroVariant) : "swap";

/**
 * The recommended few ahead of the hundreds (docs/design/layout.md): SOL, the deepest stablecoin and the deepest stock,
 * which the registry's order (deepest first) picks out. The launch form's chooser and the hero's pair picker lead with them.
 */
export function recommendedQuotes(quotes: QuoteAsset[]): QuoteAsset[] {
  const first = (category: QuoteAsset["category"]) => quotes.find((q) => q.category === category && q.launchable);
  return [first("sol"), first("stablecoin"), first("tokenized_stock")].filter((q): q is QuoteAsset => q !== undefined);
}

/** The tickers the cycle leads with, one of each kind the lede names: the money, then the stocks. */
const PROOF_TICKERS = ["SOL", "USDC", "NVDAx", "SPYx", "TSLAx"] as const;

/**
 * The assets that prove the lede (#133; the proof row that showed them under the hero was removed by the owner on
 * 2026-10-30, and the cycle still turns through them): SOL, USDC and three xStocks by ticker, then the deepest meme,
 * each only where this chain's registry has it; a young registry (devnet quotes two assets) fills in with its deepest
 * markets instead, so the list is never short and never a promise the chain can't keep.
 */
export function proofQuotes(launchable: QuoteAsset[], count = 6): QuoteAsset[] {
  const bySymbol = new Map(launchable.map((q) => [q.symbol, q]));
  const picks = PROOF_TICKERS.map((t) => bySymbol.get(t)).filter((q): q is QuoteAsset => q !== undefined);
  const meme = deepestQuotes(launchable.filter((q) => q.category === "meme"), 1)[0];
  if (meme) picks.push(meme);
  for (const q of deepestQuotes(launchable, count)) if (picks.length < count && !picks.includes(q)) picks.push(q);
  return picks.slice(0, count);
}

/** The assets the hero's pair cycles through: SOL, USDC, NVDAx and SPYx where the registry has them, else the deepest. */
export const cycleQuotes = (launchable: QuoteAsset[]) => proofQuotes(launchable, 4).filter((q) => q.category !== "meme").slice(0, 4);

/** Raw amounts of several assets, added up in SOL at the registry's latest prices; an asset without a price is left out. */
export function sumInSol(entries: { asset: { mint: string; decimals: number }; amount: string }[], quotes: QuoteAsset[]) {
  const price = new Map(quotes.map((q) => [q.mint, q.price ? Number(q.price.sol) : null]));
  let sol = 0;
  for (const e of entries) {
    const p = price.get(e.asset.mint);
    if (p == null) continue;
    sol += (Number(e.amount) / 10 ** e.asset.decimals) * p;
  }
  return sol;
}

/** A SOL amount for a headline figure, without its unit: two decimals under ten, whole SOL to 9,999, compact from there (12.3K), so a figure is never more than five characters. */
export function formatSolFigure(sol: number) {
  if (sol >= 10_000) return sol.toLocaleString("en-US", { notation: "compact", maximumSignificantDigits: 3 });
  return sol.toLocaleString("en-US", { maximumFractionDigits: sol < 10 ? 2 : 0 });
}

/** A SOL figure for copy: the amount and its unit. */
export const formatSol = (sol: number) => `${formatSolFigure(sol)} SOL`;

const whole = (n: number) => n.toLocaleString("en-US");

/**
 * The landing's figures, every one live from the API, in the order they are shown. A figure with nothing behind it yet
 * is null and the strip leaves it out: a zero is never a headline (#131), so a new platform shows its assets alone and
 * the strip grows as the platform does. The money moving to Creators is the one figure in the heat.
 */
export function landingFigures({
  quotes, stats, revenue, burns,
}: { quotes: QuoteAsset[]; stats: PlatformStats | null; revenue: Revenue | null; burns: BurnsPage | null }) {
  const launchable = quotes.filter((q) => q.launchable);
  const platformToken = burns?.burned.find((b) => b.coin.mint === burns.platformToken) ?? null;
  const burnedCoins = platformToken ? Number(platformToken.amount) / 10 ** platformToken.coin.decimals : 0;
  const toCreators = revenue ? sumInSol(revenue.totals.map((t) => ({ asset: t.asset, amount: t.creatorForwarded })), quotes) : 0;
  const onLedger = burns ? Number(burns.budgets.revenueLamports) / 1e9 : 0;
  const traded = stats?.volume24h.sol ?? 0;
  const figures: Figure[] = [
    { value: launchable.length > 0 ? whole(launchable.length) : null, label: "assets to pair with" },
    { value: stats && stats.launches > 0 ? whole(stats.launches) : null, label: "coins launched" },
    { value: stats && stats.graduated > 0 ? whole(stats.graduated) : null, label: "graduated" },
    { value: traded > 0 ? formatSolFigure(traded) : null, unit: "SOL", label: "traded in 24h" },
    { value: toCreators > 0 ? formatSolFigure(toCreators) : null, unit: "SOL", label: "paid to creators", heat: true },
    { value: onLedger > 0 ? formatSolFigure(onLedger) : null, unit: "SOL", label: "revenue on the ledger" },
    {
      value: burnedCoins > 0 ? burnedCoins.toLocaleString("en-US", { notation: "compact", maximumSignificantDigits: 3 }) : null,
      unit: platformToken?.coin.symbol ?? "STOKER",
      label: "burned",
    },
  ];
  return figures;
}
