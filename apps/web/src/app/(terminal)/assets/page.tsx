import type { Metadata } from "next";
import { pageMeta } from "@/lib/meta";
import { listLaunchQuotes, listQuotes } from "@/lib/api";
import { assetsQueryFrom } from "@/lib/assets";
import { AssetDirectory } from "@/components/AssetDirectory";

export const metadata: Metadata = pageMeta({
  path: "/assets",
  title: "Assets",
  description: "Every asset a coin on Stoker can be priced in, grouped by what it is: stocks, stablecoins, wrapped coins, DeFi tokens, memes and more.",
});

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** The assets page (ADR 0010): the whole Quote Registry, grouped, searched and filtered, with how many coins each asset has. */
export default async function AssetsPage({ searchParams }: Props) {
  const [query, { quotes }, { quotes: inUse }] = await Promise.all([searchParams.then(assetsQueryFrom), listQuotes(), listLaunchQuotes()]);
  return <AssetDirectory quotes={quotes} inUse={inUse} initialQuery={query} />;
}
