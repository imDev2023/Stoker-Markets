// A fresh platform: nothing launched yet. Runs before any test launches a coin.
import { expect, expectNoHorizontalOverflow, test } from "./fixtures";

test("the empty board invites the first launch", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("No coins yet. The first one could be yours.")).toBeVisible();
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
