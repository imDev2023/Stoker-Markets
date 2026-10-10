import type { BurnsPage, QuoteAsset, Revenue } from "@launchpad/contract";
import { ISSUER_LABELS } from "./board";

/** What the hero's card calls an asset, one or two words beside its ticker. */
export function quoteKind(q: Pick<QuoteAsset, "category" | "issuer">) {
  switch (q.category) {
    case "sol":
      return "Solana";
    case "stablecoin":
      return "stablecoin";
    case "tokenized_stock":
      return q.issuer ? ISSUER_LABELS[q.issuer] : "tokenized stock";
    case "leveraged":
      return "leveraged";
    case "collectible":
      return "collectible";
    case "community":
      return "community";
  }
}

/**
 * The assets the hero's card names: SOL, a stablecoin, two tokenized stocks from different issuers and a leveraged
 * token, each the first the registry lists of its kind; whatever kind is missing is filled from the rest, so a young
 * registry still fills the card.
 */
export function featuredQuotes(launchable: QuoteAsset[], count = 5): QuoteAsset[] {
  const picked: QuoteAsset[] = [];
  const take = (match: (q: QuoteAsset) => boolean) => {
    const q = launchable.find((c) => !picked.includes(c) && match(c));
    if (q) picked.push(q);
  };
  take((q) => q.category === "sol");
  take((q) => q.category === "stablecoin");
  take((q) => q.category === "tokenized_stock");
  take((q) => q.category === "tokenized_stock" && q.issuer !== picked[picked.length - 1]?.issuer);
  take((q) => q.category === "leveraged");
  for (const q of launchable) {
    if (picked.length >= count) break;
    if (!picked.includes(q)) picked.push(q);
  }
  return picked.slice(0, count);
}

/** The kinds the card has not named, as words for its last line: the other stock issuers, then the other categories. */
export function otherKinds(launchable: QuoteAsset[], featured: QuoteAsset[]): string[] {
  const named = new Set(featured.map(quoteKind));
  const kinds: string[] = [];
  for (const q of launchable) {
    const kind = quoteKind(q);
    const word = q.category === "collectible" ? "collectibles" : q.category === "community" ? "community tokens" : kind;
    if (!named.has(kind) && !kinds.includes(word)) kinds.push(word);
  }
  return kinds;
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

/** The landing's four figures, every one of them live from the API. */
export function landingFigures({ quotes, revenue, burns }: { quotes: QuoteAsset[]; revenue: Revenue | null; burns: BurnsPage | null }) {
  const launchable = quotes.filter((q) => q.launchable);
  const platformToken = burns?.burned.find((b) => b.coin.mint === burns.platformToken) ?? null;
  const burnedCoins = platformToken ? Number(platformToken.amount) / 10 ** platformToken.coin.decimals : 0;
  return [
    { value: launchable.length.toLocaleString("en-US"), label: "assets to pair with" },
    {
      value: formatSol(revenue ? sumInSol(revenue.totals.map((t) => ({ asset: t.asset, amount: t.creatorForwarded })), quotes) : 0),
      label: "paid to creators",
      heat: true,
    },
    {
      value: burnedCoins.toLocaleString("en-US", { notation: "compact", maximumSignificantDigits: 3 }),
      label: `${platformToken?.coin.symbol ?? "STOKER"} burned`,
    },
    { value: formatSol(burns ? Number(burns.budgets.revenueLamports) / 1e9 : 0), label: "revenue on the ledger" },
  ];
}
