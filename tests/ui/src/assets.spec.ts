// The assets page (ADR 0010): every Quote Asset the registry quotes, grouped by kind, each with a page of its own where
// what is known about it sits under "Further information" and a launch button opens the form on it.
import { PlatformInfo } from "@launchpad/contract";
import { expect, fundedKeypair, launchViaApi, QUOTES, sol, test } from "./fixtures";

const NVDAX = QUOTES.NVDAx.toBase58();

test("the assets page groups every Quote Asset by kind, and a chip or a search narrows it", async ({ page }) => {
  await page.goto("/assets");
  const assets = page.getByRole("region", { name: "Assets" });
  await expect(page.getByRole("heading", { level: 1, name: "Assets" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Assets" })).toHaveAttribute("aria-current", "page");
  // The six local assets; BULLWHALE has no price, so it can't be launched against.
  await expect(assets.getByText("6 assets, 5 launchable")).toBeVisible();
  // Grouped in the site's order, each group with its count; a kind nothing is quoted in has no group.
  await expect(assets.getByRole("heading", { level: 2 })).toHaveText(["Solana 1", "Currencies 1", "Stocks 1", "DeFi 1", "Memes 1", "Community 1"]);
  const stock = assets.getByRole("list", { name: "Stocks assets" }).getByRole("listitem");
  await expect(stock).toHaveCount(1);
  await expect(stock).toContainText("NVDAx");
  await expect(stock).toContainText("Stocks · xStocks");
  await expect(stock).toContainText("$180.00");
  // The Graduation Target in the stock, at 150 USD a SOL and 180 USD a share.
  await expect(stock).toContainText(/[\d.,]+ NVDAx/);
  await expect(stock).toContainText("Launchable");
  // Nothing on the page warns: an issuer's powers are on the asset's own page.
  await expect(assets.getByText("Can freeze wallets")).toHaveCount(0);
  await expect(assets.getByText("Not on the verified list")).toHaveCount(0);

  // A chip narrows the page to one kind and goes into the URL, so a kind can be linked to.
  await assets.getByRole("group", { name: "Kind" }).getByRole("button", { name: /^Memes/ }).click();
  await expect(page).toHaveURL(/\/assets\?category=meme$/);
  await expect(assets.getByRole("heading", { level: 2 })).toHaveCount(0);
  const flat = assets.getByRole("list", { name: "Assets" }).getByRole("listitem");
  await expect(flat).toHaveCount(1);
  await expect(flat).toContainText("BULLWHALE");
  await expect(flat).toContainText("Not launchable");

  // A search finds an asset by name, ticker or mint across every kind, and an empty result offers the way back.
  await assets.getByRole("group", { name: "Kind" }).getByRole("button", { name: /^All/ }).click();
  await expect(page).toHaveURL(/\/assets$/);
  const search = assets.getByRole("searchbox", { name: "Search assets" });
  await search.fill("nvidia");
  await expect(flat).toHaveCount(1);
  await expect(flat).toContainText("NVDAx");
  await search.fill(NVDAX.slice(0, 6));
  await expect(flat).toContainText("NVDAx");
  await search.fill("zzz");
  await expect(assets.getByText('No asset matches "zzz".')).toBeVisible();
  await assets.getByRole("button", { name: "Show every asset" }).click();
  await expect(assets.getByRole("heading", { level: 2 })).toHaveCount(6);
});

test("an asset's page has its facts, the coins priced in it, further information, and a launch button that opens the form on it", async ({ page, stack }) => {
  const creator = await fundedKeypair();
  await launchViaApi(creator, { name: "Chip Pair", symbol: "CHIPX", quote: "NVDAx" });
  const platform = PlatformInfo.parse(await (await fetch(`${stack.apiUrl}/v1/platform`)).json());

  await page.goto(`/assets/${NVDAX}`);
  await expect(page.getByRole("heading", { level: 1, name: "NVDAx" })).toBeVisible();
  await expect(page.getByText("NVIDIA xStock · Stocks · xStocks")).toBeVisible();
  const facts = page.getByLabel("NVDAx facts");
  await expect(facts).toContainText("$180.00");
  // The Graduation Target in the stock, and the SOL it was set from: the platform's target, whatever the stack sets it to.
  await expect(facts).toContainText(/A coin graduates at[\d.,]+ NVDAx/);
  await expect(facts).toContainText(`worth ${sol(BigInt(platform.graduationTargetLamports))} SOL when set`);
  await expect(facts).toContainText("Token-2022");
  const addresses = page.getByLabel("NVDAx addresses");
  await expect(addresses.getByRole("link", { name: /^Xsc9/ })).toHaveAttribute("href", /explorer\.solana\.com\/address\/Xsc9/);
  await expect(addresses.getByRole("link", { name: "See them on the board" })).toHaveAttribute("href", `/coins?quote=${NVDAX}`);

  // The coins already priced in it, newest market cap first, each a link to its page.
  const coins = page.getByRole("list", { name: "Coins paired with NVDAx" });
  await expect(coins.getByRole("link").filter({ hasText: "CHIPX" })).toContainText("Chip Pair");

  // The market behind it (#124): TradingView's chart of the stock NVDAx tracks, its web component given the stock's symbol.
  // The suite serves TradingView's script empty, so the frame stays on its loading line (the widget draws its own attribution).
  const market = page.getByRole("region", { name: "NVDA on NASDAQ" });
  await expect(market.getByText("What NVDAx tracks, as TradingView charts it.", { exact: false })).toBeVisible();
  await expect(market.locator("tv-advanced-chart")).toHaveAttribute("symbol", "NASDAQ:NVDA");
  await expect(market.getByRole("status")).toHaveText("Loading TradingView's chart of NVDA");

  // What its issuer can do and what the token list says, in full and in one place.
  const further = page.getByRole("region", { name: "Further information" });
  const labels = further.getByRole("list", { name: "NVDAx risk labels" }).getByRole("listitem");
  await expect(labels).toHaveCount(6);
  await expect(labels.first()).toContainText("Can freeze wallets");
  await expect(labels.first()).toContainText("Read from the mint on-chain");

  // The launch button opens the form on this asset.
  await page.getByRole("link", { name: "Stoke a coin paired with NVDAx" }).click();
  await expect(page).toHaveURL(`/launch?quote=${NVDAX}`);
  await expect(page.getByRole("radiogroup", { name: "Pair with" }).getByRole("radio", { name: /^NVDAx\b/ })).toBeChecked();
});

test("an asset that can't be launched against says why in place of the launch button, and an unknown mint is a 404", async ({ page }) => {
  await page.goto(`/assets/${QUOTES.BULLWHALE.toBase58()}`);
  await expect(page.getByRole("heading", { level: 1, name: "BULLWHALE" })).toBeVisible();
  // The header and footer keep their plain "Stoke a coin" links; the page's own, which names the asset, is not offered.
  await expect(page.getByRole("link", { name: /^Stoke a coin paired with/ })).toHaveCount(0);
  await expect(page.getByText("No reliable price for BULLWHALE yet, so its Graduation Target can't be set.")).toBeVisible();
  await expect(page.getByLabel("BULLWHALE facts")).toContainText("No reliable price");
  // A pump.fun coin has no market TradingView charts, so the page has no chart card.
  await expect(page.locator("tv-advanced-chart")).toHaveCount(0);
  await expect(page.getByText("as TradingView charts it", { exact: false })).toHaveCount(0);

  const res = await page.goto("/assets/11111111111111111111111111111111");
  expect(res?.status()).toBe(404);
});
