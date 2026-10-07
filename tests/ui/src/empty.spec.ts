// A fresh platform: nothing launched yet. Runs before any test launches a coin.
import { expect, expectNoHorizontalOverflow, test } from "./fixtures";

test("the empty board invites the first launch", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("No coins yet. The first one could be yours.")).toBeVisible();
  // The search, the sorts and every "Paired with" chip are there before the first coin, so a visitor sees what the board does.
  await expect(page.getByRole("searchbox", { name: "Search coins" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Sort coins" }).getByRole("button")).toHaveText(["Market cap", "Newest", "24h volume", "Near graduation"]);
  await expect(page.getByRole("group", { name: "Paired with" }).getByRole("button")).toHaveText([
    "All", "xStocks", "PreStocks", "Tessera", "Backpack", "Currencies", "Leverage", "Collectibles", "Solana", "Custom",
  ]);
  await expect(page.getByRole("button", { name: "Quote Asset: all" })).toBeVisible();
  await expect(page.getByText("Your coin")).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expect(page).toHaveScreenshot("board-empty.png", { fullPage: true });
});

test("the revenue page before anything is collected", async ({ page }) => {
  await page.goto("/revenue");
  await expect(page.getByText(/^No revenue collected yet\./)).toBeVisible();
  await expect(page.getByRole("region", { name: "Ledger" })).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  // The operations wallet and treasury addresses differ between runs.
  await expect(page).toHaveScreenshot("revenue-empty.png", { fullPage: true, mask: [page.locator("a.mono")] });
});
