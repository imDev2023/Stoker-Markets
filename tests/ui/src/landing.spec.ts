// The landing's hero candidates with the right side made live (#133, owner 2026-10-30): the pair picker, the most
// traded coin's trade panel and Jupiter's swap, each behind `?hero=`.
import { expect, expectNoHorizontalOverflow, test } from "./fixtures";

const hero = (page: import("@playwright/test").Page) => page.getByRole("region", { name: "No one picks your pair. You do." });

test("the pair picker in the hero opens the launch form filled", async ({ page }) => {
  await page.goto("/?hero=picker");
  const picker = hero(page).getByRole("form", { name: "Pick your pair" });
  await picker.getByLabel("Name").fill("Tracer Bullet");
  await picker.getByLabel("Ticker").fill("trcr");
  await expect(picker.getByLabel("Ticker")).toHaveValue("TRCR");
  // The launch form's recommended three lead (SOL, the deepest stablecoin, the deepest stock); a search reaches the rest.
  await expect(picker.getByRole("radiogroup", { name: "Paired with" }).getByRole("radio")).toHaveCount(3);
  await picker.getByRole("searchbox", { name: "Search Quote Assets" }).fill("JTO");
  await picker.getByRole("radio", { name: /JTO/ }).check();
  await picker.getByRole("button", { name: "Stoke it" }).click();
  await expect(page).toHaveURL(/\/launch\?.*quote=/);
  await expect(page.getByLabel("Name")).toHaveValue("Tracer Bullet");
  await expect(page.getByLabel("Ticker")).toHaveValue("TRCR");
  await expect(page.getByRole("radiogroup", { name: "Pair with" }).getByRole("radio", { name: /JTO/ })).toBeChecked();
});

test("the most traded coin's trade panel stands in the hero", async ({ page }) => {
  await page.goto("/?hero=trade");
  const h = hero(page);
  await expect(h.getByRole("group", { name: "Buy or sell" })).toBeVisible();
  // No wallet in this test: the panel asks for one, as it does on the coin's page.
  await expect(h.getByText("Connect a wallet to trade.")).toBeVisible();
  await expect(h.getByRole("link", { name: "Its page" })).toHaveAttribute("href", /^\/coin\//);
  await expectNoHorizontalOverflow(page);
});

test("the Swap section frames Jupiter's plugin, which the suite serves empty, and the swap hero falls back to the rows", async ({ page }) => {
  await page.goto("/swap");
  await expect(page.getByRole("heading", { level: 1, name: "Swap" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Swap" })).toHaveAttribute("aria-current", "page");
  // The Plugin's script comes back empty here (tests/ui/src/fixtures.ts), so the frame shows its fallback line.
  await expect(page.getByRole("status")).toHaveText(/Jupiter's swap did not load here/);
  await expect(page.getByRole("link", { name: "Open jup.ag" })).toHaveAttribute("href", "https://jup.ag/swap/SOL-USDC");
  await page.goto("/?hero=swap");
  await expect(hero(page).getByRole("list", { name: "Most traded today" }).getByRole("link").first()).toBeVisible();
});
