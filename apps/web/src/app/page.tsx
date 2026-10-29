import { getBurns, getPlatform, getRevenue, getStats, listLaunches, listQuotes } from "@/lib/api";
import { heroVariantFrom, landingFigures } from "@/lib/landing";
import { Hero } from "@/components/Hero";
import { Ideas } from "@/components/Ideas";
import { Invite } from "@/components/Invite";
import { Proof } from "@/components/Proof";
import { Stats } from "@/components/Stats";
import { Trending } from "@/components/Trending";

/**
 * The home page is the landing (owner, 2026-10-08), rebuilt in phase 2 of the rework (#133, after the research of
 * 2026-10-28): the hero with the product beside the slogan, a proof row, the figures as one row, one section per idea,
 * the most traded coins, and the invitation, then the full footer. Every figure is live and a read that is down leaves
 * its figure out rather than failing the page. `?hero=` shows one of the hero's visual candidates (src/lib/landing.ts).
 */
export default async function HomePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ hero }, quotes, trending, platform, revenue, burns, stats] = await Promise.all([
    searchParams,
    listQuotes(),
    listLaunches({ sort: "trending", limit: 6 }),
    getPlatform(),
    getRevenue().catch(() => null),
    getBurns().catch(() => null),
    getStats().catch(() => null),
  ]);
  const launchable = quotes.quotes.filter((q) => q.launchable);
  const empty = trending.launches.length === 0;
  return (
    <div className="landing">
      <Hero quotes={launchable} launches={trending.launches} variant={heroVariantFrom(hero)} />
      <Proof quotes={launchable} />
      <Stats figures={landingFigures({ quotes: quotes.quotes, stats, revenue, burns })} since={stats?.since ?? null} />
      <Ideas platform={platform} quotes={launchable} />
      {!empty && <Trending launches={trending.launches} />}
      <Invite empty={empty} />
    </div>
  );
}
