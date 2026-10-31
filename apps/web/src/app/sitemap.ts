import type { MetadataRoute } from "next";
import { LAUNCH_LIST_MAX } from "@launchpad/contract";
import { listLaunches, listQuotes } from "@/lib/api";
import { siteOrigin } from "@/lib/origin";
import { API_LINK, SITE_PAGES } from "@/lib/site";

/** The API pages its list by offset up to here, so a sitemap names the newest ten thousand coins. */
const COINS_MAX = 10_000;

/** Every coin, newest first, in as many pages of the list as it takes. */
async function everyCoin() {
  const mints: string[] = [];
  let offset: number | null = 0;
  while (offset !== null && offset < COINS_MAX) {
    const page = await listLaunches({ sort: "new", limit: LAUNCH_LIST_MAX, offset });
    mints.push(...page.launches.map((l) => l.mint));
    offset = page.nextOffset;
  }
  return mints;
}

/** The sections, every coin and every Quote Asset, at the origin the request came in on (#83). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [origin, coins, quotes] = await Promise.all([siteOrigin(), everyCoin(), listQuotes()]);
  const at = (path: string) => ({ url: `${origin}${path}` });
  return [
    at("/"),
    ...SITE_PAGES.map((p) => at(p.href)),
    at(API_LINK.href),
    ...coins.map((mint) => at(`/coin/${mint}`)),
    ...quotes.quotes.map((q) => at(`/assets/${q.mint}`)),
  ];
}
