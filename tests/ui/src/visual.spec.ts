// Every screen at desktop and phone width, light and dark, against committed baselines. Values that change from run to
// run (addresses, times, costs) are masked; everything else must match to the pixel.
import type { Page } from "@playwright/test";
import { COIN_PNG, expect, expectNoHorizontalOverflow, expectNoTruncatedText, listLaunches, test } from "./fixtures";
import { TEST_WALLET_NAME } from "./wallet";

// The chart's time axis and candle spacing follow the clock, so its canvases are masked like any other time.
const dynamic = (page: Page) => [page.locator("time"), page.locator(".mono:not(input)"), page.locator("canvas")];

/**
 * A traded coin's amounts and prices follow from the fixed seed trades, so only what really varies is masked: times, the
 * chart, the latest candle (trades can straddle a minute), trader links and the coin's addresses.
 */
const tradedDynamic = (page: Page) => [
  page.locator("time"),
  page.locator("canvas"),
  page.locator('dl[aria-label$="candle"] .mono'),
  page.locator("a.mono"),
  page.locator("dl").filter({ hasText: "Launch transaction" }).locator(".mono"),
];

async function snap(page: Page, name: string, mask = dynamic) {
  // Check the settled page: hydrated, images in and web fonts swapped.
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  await expectNoHorizontalOverflow(page);
  await expectNoTruncatedText(page);
  // A full-page capture of a scrolled page stitches the sticky header into the middle.
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page).toHaveScreenshot(name, { fullPage: true, mask: mask(page) });
}

async function mintOf(name: string) {
  const launch = (await listLaunches()).find((l) => l.name === name);
  if (!launch) throw new Error(`no seeded coin named ${name}`);
  return launch.mint;
}

test("board", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "New coins" })).toBeVisible();
  await expect(page.locator("ul li img").first()).toHaveJSProperty("complete", true);
  await snap(page, "board.png");
});

test("coin page", async ({ page }) => {
  await page.goto(`/coin/${await mintOf("Tracer Bullet")}`);
  await expect(page.locator("article header img")).toHaveJSProperty("complete", true);
  await snap(page, "coin.png");
});

test("coin page with the longest name and ticker", async ({ page }) => {
  await page.goto(`/coin/${await mintOf("Maximum Length Coin Name Here 32")}`);
  await expect(page.locator("article header img")).toHaveJSProperty("complete", true);
  await snap(page, "coin-longest.png");
});

test("coin page with trades", async ({ page }) => {
  await page.goto(`/coin/${await mintOf("Harbor Lights")}`);
  await expect(page.locator("article header img")).toHaveJSProperty("complete", true);
  await expect(page.getByRole("region", { name: "Trades", exact: true }).getByRole("row")).toHaveCount(5);
  await expect(page.getByText("Market cap")).toBeVisible();
  await snap(page, "coin-traded.png", tradedDynamic);
});

test("trade panel, buy and sell, quote and review", async ({ page, wallet }) => {
  await page.goto(`/coin/${await mintOf("Harbor Lights")}`);
  const panel = page.getByRole("region", { name: /^Trade( |$)/ });
  await panel.getByRole("button", { name: "Connect wallet" }).click();
  await page.getByRole("menuitem", { name: TEST_WALLET_NAME }).click();
  await panel.getByRole("button", { name: "0.5 SOL" }).click();
  await expect(panel.getByText("You get about")).toBeVisible();
  await expect(panel).toHaveScreenshot("trade-buy-quote.png", { mask: tradedDynamic(page) });

  await panel.getByRole("button", { name: "Review buy" }).click();
  const dialog = page.getByRole("dialog", { name: "Before you trade" });
  await expect(dialog).toBeVisible();
  // Masks paint over everything, the modal included, so the dialog is captured on its own.
  await expect(dialog).toHaveScreenshot("trade-disclaimer.png");
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Continue" }).click();
  await expect(panel.getByRole("region", { name: "Review your trade" })).toBeVisible();
  await expect(panel).toHaveScreenshot("trade-buy-review.png", { mask: tradedDynamic(page) });
  expect(wallet.requests).toHaveLength(0);

  await panel.getByRole("button", { name: "Edit" }).click();
  await panel.getByRole("group", { name: "Buy or sell" }).getByRole("button", { name: "Sell" }).click();
  // The test wallet holds none of this coin, so a sell shows the over-balance state.
  await panel.getByLabel("You pay").fill("1000000");
  await expect(panel.getByText(/^You have 0 HRBR\. Enter a smaller amount\.$/)).toBeVisible();
  await expect(panel.getByText("You get about")).toBeVisible();
  await expect(panel).toHaveScreenshot("trade-sell-over-balance.png", { mask: tradedDynamic(page) });
});

test("trade panel after the curve sold out", async ({ page }) => {
  await page.goto(`/coin/${await mintOf("Signal Fire")}`);
  await expect(page.getByText(/The curve sold out, so this coin no longer trades here/)).toBeVisible();
  await snap(page, "coin-sold-out.png", tradedDynamic);
});

test("coin not found", async ({ page }) => {
  const res = await page.goto("/coin/11111111111111111111111111111111");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await snap(page, "coin-not-found.png");
});

test("launch form, step by step", async ({ page, wallet }) => {
  await page.goto("/launch");
  await expect(page.getByRole("heading", { name: "Launch a coin" })).toBeVisible();
  await snap(page, "launch-disconnected.png");

  await page.getByRole("main").getByRole("button", { name: "Connect wallet" }).click();
  await expect(page.getByRole("menuitem", { name: TEST_WALLET_NAME })).toBeVisible();
  await snap(page, "launch-wallet-menu.png");
  await page.getByRole("menuitem", { name: TEST_WALLET_NAME }).click();
  await expect(page.getByRole("button", { name: "Review launch" })).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles({ name: "coin.png", mimeType: "image/png", buffer: COIN_PNG });
  await page.getByLabel("Name").fill("Tracer Bullet");
  await page.getByLabel("Ticker").fill("TRCR");
  await page.getByLabel("Description").fill("The first coin through the whole system: form, API, wallet, chain, indexer, board.");
  await page.getByLabel("Website").fill("https://example.com/tracer");
  await snap(page, "launch-filled.png");

  await page.getByRole("button", { name: "Review launch" }).click();
  const dialog = page.getByRole("dialog", { name: "Before you launch" });
  await expect(dialog).toBeVisible();
  await expect(page).toHaveScreenshot("launch-disclaimer.png", { mask: dynamic(page) });
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("region", { name: "Review your launch" })).toBeVisible();
  await snap(page, "launch-review.png");
  expect(wallet.requests).toHaveLength(0);
});

test("header wallet menu when connected", async ({ page, wallet }) => {
  await page.goto("/launch");
  await page.getByRole("main").getByRole("button", { name: "Connect wallet" }).click();
  await page.getByRole("menuitem", { name: TEST_WALLET_NAME }).click();
  await page.goto("/");
  const account = page.getByRole("banner").getByRole("button", { name: wallet.keypair.publicKey.toBase58().slice(0, 4), exact: false });
  await account.click();
  await expect(page.getByRole("menuitem", { name: "Disconnect" })).toBeVisible();
  await expect(page).toHaveScreenshot("header-account-menu.png", { mask: dynamic(page) });
});
