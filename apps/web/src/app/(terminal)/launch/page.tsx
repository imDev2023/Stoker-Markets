import type { Metadata } from "next";
import { getPlatform, listQuotes } from "@/lib/api";
import { LaunchForm } from "@/components/LaunchForm";

export const metadata: Metadata = { title: "Stoke a coin" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** An asset's page links here with `?quote=<mint>`, so the form opens on that asset; anything else is ignored. */
function quoteFrom(params: Record<string, string | string[] | undefined>) {
  const quote = params.quote;
  return typeof quote === "string" && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(quote) ? quote : null;
}

export default async function LaunchPage({ searchParams }: Props) {
  const [platform, { quotes }, params] = await Promise.all([getPlatform(), listQuotes(), searchParams]);
  return <LaunchForm platform={platform} quotes={quotes} initialQuote={quoteFrom(params)} />;
}
