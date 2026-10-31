import { headers } from "next/headers";

/**
 * The origin this request came in on, for every address a page gives out about itself: its canonical link, its share
 * card's address, the sitemap (#83). Read from the request rather than set per deployment, so the rehearsal on its own
 * hostnames, the apex it holds until go-live, and a local stack on its port each name themselves and never each other.
 * Behind Cloudflare every host is served over HTTPS; a local host is plain HTTP.
 */
export async function siteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("host") ?? "localhost:3100";
  const proto = h.get("x-forwarded-proto") ?? (/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}
