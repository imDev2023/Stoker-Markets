import type { Metadata } from "next";
import { getBurns, getHolders, getLaunch, getPlatform, getRevenue, listLedger, listQuotes } from "@/lib/api";
import { StatsDashboard } from "@/components/StatsDashboard";

export const metadata: Metadata = {
  title: "Stats",
  description: "The platform's coin and the revenue behind it: revenue annualized, what the Burn has bought back and burned, every burn on-chain, and the Ledger.",
};

/** The Stats page: every read on its own, so one that is down leaves its figure out rather than failing the page. */
export default async function StatsPage() {
  const [platform, quotes, revenue, burns, ledger] = await Promise.all([
    getPlatform(),
    listQuotes().then((q) => q.quotes).catch(() => []),
    getRevenue().catch(() => null),
    getBurns().catch(() => null),
    listLedger().catch(() => null),
  ]);
  const mint = burns?.platformToken ?? null;
  const token = mint
    ? await getLaunch(mint)
        .then(async (launch) => (launch ? { launch, holders: await getHolders(mint).catch(() => null) } : null))
        .catch(() => null)
    : null;
  return <StatsDashboard platform={platform} quotes={quotes} revenue={revenue} burns={burns} ledger={ledger} token={token} />;
}
