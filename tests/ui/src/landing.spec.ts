// The landing's hero candidates with the right side made live (#133, owner 2026-10-30): the pair picker, the most
// traded coin's trade panel and Jupiter's swap, each behind `?hero=`; and the header candidate H9 behind `?header=`.
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

test("header H9: five words in the bar with the current one marked, held across the site, and a tab bar on a phone", async ({ page }) => {
  await page.goto("/coins?header=h9");
  const main = page.getByRole("navigation", { name: "Main" });
  await expect(main.getByRole("link")).toHaveText(["Explore", "Swap", "Assets", "Rewards", "Stats", /Curated/]);
  await expect(main.getByRole("link", { name: "Explore" })).toHaveAttribute("aria-current", "page");
  // Developers left the bar for the footer, which names the page "API".
  await expect(page.getByRole("link", { name: "Developers" })).toHaveCount(0);
  await expect(page.getByRole("contentinfo").getByRole("link", { name: "API" })).toHaveAttribute("href", "/api");
  // The choice is a cookie, so it holds on the next page; "/" opens the search in place.
  await page.goto("/rewards");
  await expect(main.getByRole("link", { name: "Rewards" })).toHaveAttribute("aria-current", "page");
  await page.keyboard.press("/");
  await expect(page.getByRole("combobox", { name: "Search coins" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Search" })).toBeFocused();
  // Under 768px the words give way to the bottom tab bar, with the launch in the middle and the account last.
  await page.setViewportSize({ width: 390, height: 844 });
  const tabs = page.getByRole("navigation", { name: "Sections" });
  await expect(tabs.getByRole("link")).toHaveText(["Explore", "Assets", "Stoke", "Rewards"]);
  await expect(tabs.getByRole("link", { name: "Rewards" })).toHaveAttribute("aria-current", "page");
  await expect(main).toBeHidden();
  await tabs.getByRole("button", { name: "Account" }).click();
  const sheet = page.getByRole("dialog", { name: "Account" });
  await expect(sheet.getByRole("button", { name: "Connect wallet" })).toBeVisible();
  await expect(sheet.getByRole("navigation", { name: "More" }).getByRole("link")).toHaveText(["Swap", "Stats", /Curated/]);
  await expectNoHorizontalOverflow(page);
});
