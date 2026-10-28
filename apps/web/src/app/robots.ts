import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/origin";

/**
 * Crawlers may read every page but the operator's and a Creator's own (both `noindex` as well), and are told where
 * the sitemap is. Off mainnet every page says `noindex` itself (the root layout), which is what keeps the rehearsal's
 * coins out of search; a page that can be read can carry that word, where a blocked one could not.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const origin = await siteOrigin();
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/operator", "/creator"] },
    sitemap: `${origin}/sitemap.xml`,
  };
}
