// A fresh platform: nothing launched yet. Runs before any test launches a coin.
import { expect, expectNoHorizontalOverflow, test } from "./fixtures";

test("the empty landing invites the first launch", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "No one picks your pair. You do." })).toBeVisible();
  // The card beside the slogan and the figures are live even before the first coin: the registry has its assets.
  await expect(page.getByRole("heading", { name: /^Priced in any of \d+ assets$/ })).toBeVisible();
  await expect(page.getByText("assets to pair with")).toBeVisible();
  await expect(page.getByText("No coins yet. The first one could be yours.")).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expect(page).toHaveScreenshot("home-empty.png", { fullPage: true });
});

test("the empty board shows every control", async ({ page }) => {
  await page.goto("/coins");
  await expect(page.getByText("No coins yet. The first one could be yours.")).toBeVisible();
  // The search, the sorts and every kind in the asset rail are there before the first coin, so a visitor sees what the board does.
  await expect(page.getByRole("searchbox", { name: "Search coins" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Sort coins" }).getByRole("button")).toHaveText(["Market cap", "Newest", "24h volume", "Near graduation"]);
  await expect(page.getByRole("group", { name: "Paired with" }).getByRole("button")).toHaveText([
    "All assets", "xStocks", "PreStocks", "Tessera", "Backpack", "Solana", "Currencies", "Wrapped", "DeFi", "Real-world assets", "Leverage", "Collectibles", "Memes", "Community",
  ]);
  await expectNoHorizontalOverflow(page);
  await expect(page).toHaveScreenshot("board-empty.png", { fullPage: true });
});

test("the assets page lists every Quote Asset before the first coin", async ({ page }) => {
  await page.goto("/assets");
  const assets = page.getByRole("region", { name: "Assets" });
  // The search and every kind, with its count, are there before the first coin: the registry has its assets from the start.
  await expect(assets.getByRole("searchbox", { name: "Search assets" })).toBeVisible();
  await expect(assets.getByRole("group", { name: "Kind" }).getByRole("button")).toHaveText([
    "All 6", "xStocks 1", "PreStocks 0", "Tessera 0", "Backpack 0", "Solana 1", "Currencies 1", "Wrapped 0", "DeFi 1", "Real-world assets 0",
    "Leverage 0", "Collectibles 0", "Memes 1", "Community 1",
  ]);
  await expect(assets.getByRole("listitem")).toHaveCount(6);
  await expectNoHorizontalOverflow(page);
  await expect(page).toHaveScreenshot("assets-empty.png", { fullPage: true });
});

test("the revenue page before anything is collected", async ({ page }) => {
  await page.goto("/revenue");
  await expect(page.getByText(/^No revenue collected yet\./)).toBeVisible();
  await expect(page.getByRole("region", { name: "Ledger" })).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  // The operations wallet and treasury addresses differ between runs.
  await expect(page).toHaveScreenshot("revenue-empty.png", { fullPage: true, mask: [page.locator("a.mono")] });
});
