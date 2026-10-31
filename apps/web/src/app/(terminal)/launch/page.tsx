import type { Metadata } from "next";
import { pageMeta } from "@/lib/meta";
import { getPlatform, listQuotes } from "@/lib/api";
import { LaunchForm } from "@/components/LaunchForm";

export const metadata: Metadata = pageMeta({ path: "/launch", title: "Stoke a coin", description: "Launch a coin on Solana priced in SOL, a stablecoin, a tokenized stock or any asset Raydium quotes: its name and picture, its pair, the launch type and a first buy, in one transaction your wallet signs." });

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** An asset's page links here with `?quote=<mint>`, so the form opens on that asset; anything else is ignored. */
function quoteFrom(params: Record<string, string | string[] | undefined>) {
  const quote = params.quote;
  return typeof quote === "string" && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(quote) ? quote : null;
}

/** The landing's pair picker (#133, candidate F) carries a name and a ticker too, within the form's own limits; anything else is dropped. */
function textFrom(params: Record<string, string | string[] | undefined>, key: "name" | "symbol") {
  const value = params[key];
  if (typeof value !== "string") return "";
  return key === "name" ? value.trim().slice(0, 32) : value.toUpperCase().replace(/[^A-Z0-9$]/g, "").slice(0, 10);
}

export default async function LaunchPage({ searchParams }: Props) {
  const [platform, { quotes }, params] = await Promise.all([getPlatform(), listQuotes(), searchParams]);
  return <LaunchForm platform={platform} quotes={quotes} initialQuote={quoteFrom(params)} initialName={textFrom(params, "name")} initialSymbol={textFrom(params, "symbol")} />;
}
