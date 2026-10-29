import type { BurnsPage, QuoteAsset, Revenue } from "@launchpad/contract";
import type { Figure } from "@/components/Stats";
import { ISSUER_LABELS } from "./board";

/** What the hero's card and the board call an asset, one or two words beside its ticker. */
export function quoteKind(q: Pick<QuoteAsset, "category" | "issuer">) {
  switch (q.category) {
    case "sol":
      return "Solana";
    case "stablecoin":
      return "stablecoin";
    case "tokenized_stock":
      return q.issuer ? ISSUER_LABELS[q.issuer] : "tokenized stock";
    case "rwa":
      return "real-world asset";
    case "wrapped":
      return "wrapped";
    case "defi":
      return "DeFi";
    case "leveraged":
      return "leveraged";
    case "collectible":
      return "collectible";
    case "meme":
      return "meme";
    case "community":
      return "community";
  }
}

/**
 * The assets the hero's strip shows: the deepest markets first, by the registry's liquidity (the order the launch
 * form's chooser uses too), and the rest in the registry's order when the registry has no depth for them, so a young
 * registry still fills the strip.
 */
export function deepestQuotes(launchable: QuoteAsset[], count = 8): QuoteAsset[] {
  return [...launchable]
    .sort((a, b) => (b.liquidityUsd ?? -1) - (a.liquidityUsd ?? -1))
    .slice(0, count);
}

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

/** A SOL figure for a headline: whole SOL with a thousands separator, two decimals under ten, compact above a million. */
export function formatSol(sol: number) {
  if (sol >= 1_000_000) return `${sol.toLocaleString("en-US", { notation: "compact", maximumSignificantDigits: 3 })} SOL`;
  return `${sol.toLocaleString("en-US", { maximumFractionDigits: sol < 10 ? 2 : 0 })} SOL`;
}

/**
 * The landing's figures, every one of them live from the API. A figure with nothing behind it yet is null and the
 * row leaves it out: a zero is never a headline (#131, after the research), the row simply grows as the platform does.
 */
export function landingFigures({ quotes, revenue, burns }: { quotes: QuoteAsset[]; revenue: Revenue | null; burns: BurnsPage | null }) {
  const launchable = quotes.filter((q) => q.launchable);
  const platformToken = burns?.burned.find((b) => b.coin.mint === burns.platformToken) ?? null;
  const burnedCoins = platformToken ? Number(platformToken.amount) / 10 ** platformToken.coin.decimals : 0;
  const toCreators = revenue ? sumInSol(revenue.totals.map((t) => ({ asset: t.asset, amount: t.creatorForwarded })), quotes) : 0;
  const onLedger = burns ? Number(burns.budgets.revenueLamports) / 1e9 : 0;
  const figures: Figure[] = [
    { value: launchable.length > 0 ? launchable.length.toLocaleString("en-US") : null, label: "assets to pair with" },
    { value: toCreators > 0 ? formatSol(toCreators) : null, label: "paid to creators", heat: true },
    {
      value: burnedCoins > 0 ? burnedCoins.toLocaleString("en-US", { notation: "compact", maximumSignificantDigits: 3 }) : null,
      label: `${platformToken?.coin.symbol ?? "STOKER"} burned`,
    },
    { value: onLedger > 0 ? formatSol(onLedger) : null, label: "revenue on the ledger" },
  ];
  return figures;
}
