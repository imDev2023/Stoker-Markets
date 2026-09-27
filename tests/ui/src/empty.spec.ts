// A fresh platform: nothing launched yet. Runs before any test launches a coin.
import { expect, expectNoHorizontalOverflow, test } from "./fixtures";

test("the empty board invites the first launch", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("No coins yet. The first one could be yours.")).toBeVisible();
  await expect(page.getByText("Your coin")).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expect(page).toHaveScreenshot("board-empty.png", { fullPage: true });
});
