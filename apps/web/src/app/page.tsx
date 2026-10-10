import { getBurns, getPlatform, getRevenue, listLaunches, listQuotes } from "@/lib/api";
import { landingFigures } from "@/lib/landing";
import { Hero } from "@/components/Hero";
import { Stats } from "@/components/Stats";
import { Trending } from "@/components/Trending";

/**
 * The home page is the landing (owner, 2026-10-08): the spacious, consumer-facing look, with the board one tap away at
 * /coins. The figures are left out rather than the page failing when one read is down.
 */
export default async function HomePage() {
  const [quotes, trending, platform, revenue, burns] = await Promise.all([
    listQuotes(),
    listLaunches({ sort: "trending", limit: 6 }),
    getPlatform(),
    getRevenue().catch(() => null),
    getBurns().catch(() => null),
  ]);
  return (
    <>
      <Hero quotes={quotes.quotes} platform={platform} />
      <Stats figures={landingFigures({ quotes: quotes.quotes, revenue, burns })} />
      <Trending launches={trending.launches} />
    </>
  );
}
