// Search and share previews (#83): every page names itself (a title, a description, one canonical address) and carries
// the Open Graph and Twitter cards with a drawn image, so a link pasted on X or Telegram unfurls; the site has a sitemap,
// a robots file and its icons; and a coin's link unfurls with its own picture, name and pair.
import type { Page } from "@playwright/test";
import { Keypair } from "@solana/web3.js";
import { expect, fundedKeypair, launchViaApi, listLaunches, QUOTES, test } from "./fixtures";

const NVDAX = QUOTES.NVDAx.toBase58();
const SITE_TITLE = "Stoker · Launch a coin on Solana priced in the asset you pick";

/** A head tag's content, whether it is named with `name` or `property`. Streaming metadata is off, so every tag is in the head. */
const meta = (page: Page, key: string) => page.locator(`head meta[name="${key}"], head meta[property="${key}"]`);
const link = (page: Page, rel: string) => page.locator(`head link[rel="${rel}"]`);

/** The structured data a page carries, parsed. */
const jsonLd = (page: Page) =>
  page.locator('script[type="application/ld+json"]').evaluateAll((nodes) => nodes.map((n) => JSON.parse(n.textContent ?? "null") as Record<string, unknown>));

/** A PNG's size, from its header. */
const pngSize = (png: Buffer) => ({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) });

/**
 * The page's share image: named on its card, answered as a PNG of the Open Graph size. The image's path is checked and
 * fetched on the stack's own address: `next dev` names every file-based image at `localhost`, whatever the request's
 * host, where a production build resolves it against the page's `metadataBase`.
 */
async function shareCard(page: Page, base: string) {
  const named = await meta(page, "og:image").getAttribute("content");
  expect(named, "og:image").toBeTruthy();
  const url = new URL(named!);
  await expect(meta(page, "og:image:width")).toHaveAttribute("content", "1200");
  await expect(meta(page, "og:image:height")).toHaveAttribute("content", "630");
  // X reads its own tag; the same image serves it.
  await expect(meta(page, "twitter:image")).toHaveAttribute("content", named!);
  const res = await page.request.get(`${base}${url.pathname}${url.search}`);
  expect(res.status(), named!).toBe(200);
  expect(res.headers()["content-type"]).toBe("image/png");
  const png = await res.body();
  expect(pngSize(png)).toEqual({ width: 1200, height: 630 });
  return { path: url.pathname, png };
}

test("every page names itself, the home page with the proposition, the site's card and its structured data", async ({ page, stack }) => {
  const base = stack.webUrl!;
  await page.goto("/");
  await expect(page).toHaveTitle(SITE_TITLE);
  await expect(meta(page, "description")).toHaveAttribute("content", /^No one picks your pair\. You do\. Launch a coin on Solana/);
  // The home page's canonical address is the origin itself (Next writes "/" so).
  await expect(link(page, "canonical")).toHaveAttribute("href", base);
  await expect(meta(page, "og:title")).toHaveAttribute("content", SITE_TITLE);
  await expect(meta(page, "og:description")).toHaveAttribute("content", /^No one picks your pair/);
  await expect(meta(page, "og:url")).toHaveAttribute("content", base);
  await expect(meta(page, "og:site_name")).toHaveAttribute("content", "Stoker");
  await expect(meta(page, "og:type")).toHaveAttribute("content", "website");
  await expect(meta(page, "twitter:card")).toHaveAttribute("content", "summary_large_image");
  await expect(meta(page, "twitter:title")).toHaveAttribute("content", SITE_TITLE);
  // The icons: the ico for the browsers that want one, the SVG for the rest, the touch icon for a phone's home screen.
  await expect(link(page, "icon")).toHaveCount(3);
  await expect(link(page, "icon").nth(0)).toHaveAttribute("href", /\/favicon\.ico/);
  await expect(link(page, "icon").nth(1)).toHaveAttribute("href", /\/icon\.svg/);
  await expect(link(page, "apple-touch-icon")).toHaveAttribute("href", /\/apple-touch-icon\.png/);
  // The site's own card, drawn once for every page without one of its own.
  const site = await shareCard(page, base);
  expect(site.path).toMatch(/^\/opengraph-image/);
  expect(site.png).toMatchSnapshot("share-site.png");
  // The site and the organisation behind it, with the board as the site's search.
  const data = await jsonLd(page);
  expect(data.find((d) => d["@type"] === "WebSite")).toMatchObject({
    name: "Stoker",
    url: `${base}/`,
    potentialAction: { "@type": "SearchAction", target: { urlTemplate: `${base}/coins?q={search_term_string}` } },
  });
  expect(data.find((d) => d["@type"] === "Organization")).toMatchObject({ name: "Stoker", url: `${base}/`, logo: `${base}/icon.png`, email: "info@stoker.markets" });

  // The board's sorted and filtered views all point at the board.
  await page.goto("/coins?sort=market_cap&category=stablecoin");
  await expect(page).toHaveTitle("Coins · Stoker");
  await expect(link(page, "canonical")).toHaveAttribute("href", `${base}/coins`);
  await expect(meta(page, "og:url")).toHaveAttribute("content", `${base}/coins`);

  // The launch form has its own words; the pages that are a wallet's own or the operator's are nobody's to index.
  await page.goto("/launch");
  await expect(page).toHaveTitle("Stoke a coin · Stoker");
  await expect(meta(page, "description")).toHaveAttribute("content", /^Launch a coin on Solana priced in SOL/);
  await expect(link(page, "canonical")).toHaveAttribute("href", `${base}/launch`);
  for (const path of ["/creator", "/operator"]) {
    await page.goto(path);
    await expect(meta(page, "robots"), path).toHaveAttribute("content", /noindex/);
  }
});

test("a coin's link unfurls with its own picture, name and pair, and its page says where it sits", async ({ page, stack }) => {
  const base = stack.webUrl!;
  const creator = await fundedKeypair();
  const mint = await launchViaApi(creator, { name: "Share Card", symbol: "SHARE", description: "A coin whose link unfurls with its picture, its name and its pair." });
  const plain = await launchViaApi(creator, { name: "Plain Card", symbol: "PLAIN" });

  await page.goto(`/coin/${mint}`);
  await expect(page).toHaveTitle("SHARE / SOL · Stoker");
  await expect(meta(page, "description")).toHaveAttribute("content", "A coin whose link unfurls with its picture, its name and its pair.");
  await expect(link(page, "canonical")).toHaveAttribute("href", `${base}/coin/${mint}`);
  await expect(meta(page, "og:title")).toHaveAttribute("content", "SHARE / SOL · Stoker");
  await expect(meta(page, "og:url")).toHaveAttribute("content", `${base}/coin/${mint}`);
  const card = await shareCard(page, base);
  expect(card.path).toMatch(new RegExp(`^/coin/${mint}/opengraph-image`));
  expect(card.png).toMatchSnapshot("share-coin.png");
  expect((await jsonLd(page)).find((d) => d["@type"] === "BreadcrumbList")).toMatchObject({
    itemListElement: [
      { position: 1, name: "Home", item: `${base}/` },
      { position: 2, name: "Coins", item: `${base}/coins` },
      { position: 3, name: "SHARE / SOL", item: `${base}/coin/${mint}` },
    ],
  });
  // A crawler that reads the HTML alone finds the card in the head, whatever it calls itself.
  for (const agent of ["TelegramBot (like TwitterBot)", "Mozilla/5.0 (compatible; a reader)"]) {
    const html = await (await page.request.get(`/coin/${mint}`, { headers: { "user-agent": agent } })).text();
    expect(html.slice(0, html.indexOf("</head>")), agent).toContain('property="og:image"');
  }

  // A coin with no description of its own is described by its pair and its creator's cut.
  await page.goto(`/coin/${plain}`);
  await expect(meta(page, "description")).toHaveAttribute(
    "content",
    "Plain Card (PLAIN) trades on Stoker paired with SOL; its creator earns ~0.5% of every trade, every payment on the public ledger.",
  );

  // An asset's page: its own card is the site's, and it sits under Assets.
  await page.goto(`/assets/${NVDAX}`);
  await expect(page).toHaveTitle("NVDAx as a Quote Asset · Stoker");
  await expect(link(page, "canonical")).toHaveAttribute("href", `${base}/assets/${NVDAX}`);
  await expect(meta(page, "og:image")).toHaveAttribute("content", /\/opengraph-image/);
  await expect(meta(page, "og:image")).not.toHaveAttribute("content", /\/assets\//);
  expect((await jsonLd(page)).find((d) => d["@type"] === "BreadcrumbList")).toMatchObject({
    itemListElement: [{ position: 1, name: "Home" }, { position: 2, name: "Assets", item: `${base}/assets` }, { position: 3, name: "NVDAx", item: `${base}/assets/${NVDAX}` }],
  });

  // A coin that doesn't exist is a 404 nobody indexes: the HTML a crawler gets says so (Next's own `noindex` on a
  // not-found render, which carries the layout's metadata alone), the tab says which coin, and its card route answers
  // 404 too.
  const missing = Keypair.generate().publicKey.toBase58();
  const res = await page.goto(`/coin/${missing}`);
  expect(res?.status()).toBe(404);
  await expect(page).toHaveTitle("Coin not found · Stoker");
  const notFound = await (await page.request.get(`/coin/${missing}`)).text();
  expect(notFound.slice(0, notFound.indexOf("</head>"))).toMatch(/<meta name="robots" content="noindex/);
  expect((await page.request.get(`${base}${card.path.replace(mint, missing)}`)).status()).toBe(404);
});

test("the sitemap lists every section, coin and asset, the robots file names it, and the icons answer", async ({ page, stack }) => {
  const base = stack.webUrl!;
  const coins = await listLaunches();
  expect(coins.length).toBeGreaterThan(0);
  const sitemap = await page.request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  expect(sitemap.headers()["content-type"]).toMatch(/xml/);
  const xml = await sitemap.text();
  for (const path of ["/", "/coins", "/launch", "/curated", "/assets", "/rewards", "/burns", "/revenue", "/announcements", "/api"]) {
    expect(xml, path).toContain(`<loc>${base}${path}</loc>`);
  }
  for (const coin of coins) expect(xml, coin.symbol).toContain(`<loc>${base}/coin/${coin.mint}</loc>`);
  expect(xml).toContain(`<loc>${base}/assets/${NVDAX}</loc>`);
  expect(xml).not.toContain("/operator");
  expect(xml).not.toContain("/creator");

  const robots = await page.request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toBe(`User-Agent: *\nAllow: /\nDisallow: /operator\nDisallow: /creator\n\nSitemap: ${base}/sitemap.xml\n`);

  for (const [path, type] of [
    ["/favicon.ico", /^image\/(x-icon|vnd\.microsoft\.icon)/],
    ["/icon.svg", /^image\/svg\+xml/],
    ["/icon.png", /^image\/png/],
    ["/apple-touch-icon.png", /^image\/png/],
  ] as const) {
    const res = await page.request.get(path);
    expect(res.status(), path).toBe(200);
    expect(res.headers()["content-type"], path).toMatch(type);
  }
});
