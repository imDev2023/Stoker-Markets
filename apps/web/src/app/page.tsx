import { getBurns, getPlatform, getRevenue, getStats, listLaunches, listQuotes } from "@/lib/api";
import { heroVariantFrom, landingFigures } from "@/lib/landing";
import { Hero } from "@/components/Hero";
import { Ideas } from "@/components/Ideas";
import { Invite } from "@/components/Invite";
import { Promise as TeamPromise } from "@/components/Promise";
import { Stats } from "@/components/Stats";
import { Trending } from "@/components/Trending";

/**
 * The home page is the landing (owner, 2026-10-08), rebuilt in phase 2 of the rework (#133, after the research of
 * 2026-10-28): the hero with the product beside the slogan (the live rows; the proof row under it was removed by the
 * owner on 2026-10-30, the day Jupiter's swap was picked as the hero and then given a section of its own, `/swap`), the
 * figures as one row, one section per idea, the most traded coins, the team's promise (owner, 2026-10-31), and the
 * invitation, then the full footer. Every figure is live and a read that is down leaves
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
      <Hero quotes={launchable} launches={trending.launches} variant={heroVariantFrom(hero)} platform={platform} />
      <Stats figures={landingFigures({ quotes: quotes.quotes, stats, revenue, burns })} since={stats?.since ?? null} />
      <Ideas platform={platform} quotes={launchable} />
      {!empty && <Trending launches={trending.launches} />}
      <TeamPromise />
      <Invite empty={empty} />
    </div>
  );
}
