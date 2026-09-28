// Every screen at desktop and phone width, light and dark, against committed baselines. Values that change from run to
// run (addresses, times, costs) are masked; everything else must match to the pixel.
import type { Page } from "@playwright/test";
import { COIN_PNG, expect, expectNoHorizontalOverflow, expectNoTruncatedText, listLaunches, test } from "./fixtures";
import { TEST_WALLET_NAME } from "./wallet";

const dynamic = (page: Page) => [page.locator("time"), page.locator(".mono:not(input)")];

async function snap(page: Page, name: string) {
  // Check the settled page: hydrated, images in and web fonts swapped.
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  await expectNoHorizontalOverflow(page);
  await expectNoTruncatedText(page);
  // A full-page capture of a scrolled page stitches the sticky header into the middle.
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page).toHaveScreenshot(name, { fullPage: true, mask: dynamic(page) });
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
