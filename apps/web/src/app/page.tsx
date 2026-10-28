import type { Metadata } from "next";
import { getBurns, getPlatform, getRevenue, listLaunches, listQuotes } from "@/lib/api";
import { landingFigures } from "@/lib/landing";
import { pageMeta, SITE_DESCRIPTION, SITE_NAME } from "@/lib/meta";
import { siteOrigin } from "@/lib/origin";
import { SITE_LINKS } from "@/lib/site";
import { Hero } from "@/components/Hero";
import { JsonLd } from "@/components/JsonLd";
import { Stats } from "@/components/Stats";
import { Trending } from "@/components/Trending";

export const metadata: Metadata = pageMeta({ path: "/" });

/**
 * The home page is the landing (owner, 2026-10-08): the spacious, consumer-facing look, with the board one tap away at
 * /coins. The figures are left out rather than the page failing when one read is down. The `landing` class gives the
 * canvas its dot grid (globals.css).
 */
export default async function HomePage() {
  const [quotes, trending, platform, revenue, burns, origin] = await Promise.all([
    listQuotes(),
    listLaunches({ sort: "trending", limit: 6 }),
    getPlatform(),
    getRevenue().catch(() => null),
    getBurns().catch(() => null),
    siteOrigin(),
  ]);
  return (
    <div className="landing">
      {/* What the site is, for search engines (#83): the site with its coin search, and who is behind it. */}
      <JsonLd
        data={{
          "@type": "WebSite",
          name: SITE_NAME,
          url: `${origin}/`,
          description: SITE_DESCRIPTION,
          potentialAction: {
            "@type": "SearchAction",
            target: { "@type": "EntryPoint", urlTemplate: `${origin}/coins?q={search_term_string}` },
            "query-input": "required name=search_term_string",
          },
        }}
      />
      <JsonLd
        data={{
          "@type": "Organization",
          name: SITE_NAME,
          url: `${origin}/`,
          logo: `${origin}/icon.png`,
          email: SITE_LINKS.email,
          sameAs: [SITE_LINKS.x.href, SITE_LINKS.telegram.href, SITE_LINKS.github.href],
        }}
      />
      <Hero quotes={quotes.quotes} platform={platform} />
      <Stats figures={landingFigures({ quotes: quotes.quotes, revenue, burns })} />
      <Trending launches={trending.launches} />
    </div>
  );
}
