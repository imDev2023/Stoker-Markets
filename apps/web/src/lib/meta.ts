import type { Metadata } from "next";
import { SITE_LINKS } from "./site";

/** The site's name, as every title ends and every share card says it. */
export const SITE_NAME = "Stoker";

/** The home page's title: the proposition, where every other page's title is its own name completed by the template. */
export const SITE_TITLE = "Stoker · Launch a coin on Solana priced in the asset you pick";

/** What search results and share previews say of a page that has no description of its own: the slogan and the lede. */
export const SITE_DESCRIPTION =
  "No one picks your pair. You do. Launch a coin on Solana priced in SOL, a stablecoin, a tokenized stock or any asset Raydium quotes; creators earn from every trade.";

/**
 * The Open Graph facts every page shares. Next replaces a nested metadata field whole when a page sets it, so a page's
 * `openGraph` must carry these again, which `pageMeta` does.
 */
export const SHARED_OPEN_GRAPH = { siteName: SITE_NAME, type: "website", locale: "en_US" } as const;

/** The Twitter card: the large image; the site's handle is the one the footer links to (a placeholder until the owner's). */
export const TWITTER_CARD = { card: "summary_large_image", site: SITE_LINKS.x.handle } as const;

/** The site's card, drawn by the app root's `opengraph-image.tsx`, as every page without a card of its own names it. */
export const SITE_CARD = { url: "/opengraph-image", width: 1200, height: 630, type: "image/png", alt: "Stoker. No one picks your pair. You do." } as const;

/**
 * A page's own name and address (#83): the title the layout's template completes, the description that search results
 * and share previews show, its canonical address (one per page, so the board's sorted and filtered views all point at
 * the board) and the same address on its Open Graph card. Paths are relative: the layout's `metadataBase` is the
 * origin the request came in on (src/lib/origin.ts), so every deployment names itself. A page nobody should index says
 * so on every cluster; the others inherit the layout's rule, which indexes mainnet alone.
 */
export function pageMeta(page: { path: string; title?: Metadata["title"]; description?: string; index?: boolean; card?: "site" | "own" }): Metadata {
  const { path, title, description, index = true, card = "site" } = page;
  return {
    ...(title === undefined ? {} : { title }),
    ...(description === undefined ? {} : { description }),
    alternates: { canonical: path },
    // A page's `openGraph` replaces the layout's whole, the root's drawn card included, so every page names the site's
    // card again; a page with a card of its own leaves the images unset, and its segment's `opengraph-image.tsx` fills
    // them (Next applies a segment's file only when the page named none).
    openGraph: { ...SHARED_OPEN_GRAPH, url: path, ...(card === "site" ? { images: [SITE_CARD] } : {}) },
    ...(index ? {} : { robots: { index: false, follow: false } }),
  };
}

/** A description cut to what a preview shows, at a word, with an ellipsis; a short one is returned as it is. */
export function clip(text: string, max = 300) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 40))}…`;
}

/** Where a page sits, for search engines: the trail from the home page to it, each step at the origin given. */
export function breadcrumbList(origin: string, trail: readonly (readonly [name: string, path: string])[]) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: trail.map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: `${origin}${path}` })),
  };
}
