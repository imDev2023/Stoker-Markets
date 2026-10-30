// The site's own pages for developers and for Curated (owner, 2026-10-25): the header's API link opens the reference
// on the site, never the repository, and Curated is a section of its own.
import { expect, expectNoHorizontalOverflow, test } from "./fixtures";

const main = (page: import("@playwright/test").Page) => page.getByRole("navigation", { name: "Main" });

test("the API page is the whole reference, answered live, and the header and footer link to it", async ({ page }) => {
  await page.goto("/api");
  await expect(page.getByRole("heading", { level: 1, name: "The API" })).toBeVisible();
  // Developers left the pill for the footer (owner, 2026-10-30), which lists the page as "API": nothing in the pill is current here.
  await expect(main(page).getByRole("link", { name: "Developers" })).toHaveCount(0);
  await expect(main(page).locator('[aria-current="page"]')).toHaveCount(0);
  // No link out to GitHub for the docs: the footer's Developers group points at the page itself.
  await expect(page.getByRole("contentinfo").getByRole("link", { name: "API" })).toHaveAttribute("href", "/api");
  await expect(page.locator('a[href*="docs/api.md"]')).toHaveCount(0);
  // The quickstart shows the answer the API gave for this page view: the cluster the stack runs on.
  await expect(page.getByRole("region", { name: "Quickstart" }).getByRole("figure", { name: "Answer" }).locator("pre")).toContainText('"cluster": "localnet"');
  // Every section of the reference, each reachable from the contents.
  const sections = ["Reading, no key needed", "Preparing transactions", "Sign, send, report", "Referrals", "API keys and limits", "Errors", "The operator's endpoints"];
  for (const name of sections) await expect(page.getByRole("region", { name })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "On this page" }).getByRole("link")).toHaveText(["Quickstart", ...sections]);
  await expectNoHorizontalOverflow(page);
});

test("the Curated page says what a Curated launch is before one exists", async ({ page }) => {
  await page.goto("/curated");
  await expect(page.getByRole("heading", { level: 1, name: "Curated" })).toBeVisible();
  await expect(main(page).getByRole("link", { name: "Curated" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("region", { name: "How an allocation is earned" }).getByRole("listitem")).toHaveCount(3);
  await expect(page.getByRole("region", { name: "No Curated launch yet" }).getByRole("link", { name: "Explore the board" })).toHaveAttribute("href", "/coins");
  await expectNoHorizontalOverflow(page);
});

// The two footers and the legal pages (#131): the landing's grouped footer with its status line and the one-row footer
// on every terminal page, both linking the legal pages, which answer; and the one filled action marked current on its page.
test("the landing ends with the full footer, every terminal page with one row, and the legal pages answer", async ({ page }) => {
  await page.goto("/");
  const foot = page.getByRole("contentinfo");
  await expect(foot.getByRole("heading", { level: 2 })).toHaveText(["Trade", "Create", "Platform", "Legal"]);
  await expect(foot.getByText("Localnet · API online")).toBeVisible();
  await expect(foot.getByRole("link", { name: "Read the risk disclosure" })).toHaveAttribute("href", "/risk");
  await page.goto("/coins");
  await expect(page.getByRole("contentinfo").getByRole("heading")).toHaveCount(0);
  await expect(page.getByRole("contentinfo").getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
  await expect(page.getByRole("contentinfo").getByText("Localnet · API online")).toBeVisible();
  for (const [path, title] of [["/terms", "Terms of use"], ["/privacy", "Privacy"], ["/risk", "Risk disclosure"]] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
  await page.goto("/launch");
  await expect(page.getByRole("banner").getByRole("link", { name: "Stoke a coin" })).toHaveAttribute("aria-current", "page");
});

// The header (owner, 2026-10-30, on #133: H9's structure with H4's pill kept): six words in the pill with the current one
// marked, Developers in the footer, the search opening in place from its disc on "/", and under 768px the bottom tab bar
// with the launch in the middle and the account sheet in place of a menu overlay.
test("the header: six words in the pill with the current one marked, Developers in the footer, and the search from its disc", async ({ page }) => {
  await page.goto("/coins");
  // Each word is set twice for the hover slide (the twin aria-hidden), so the links are matched by word, not whole text.
  await expect(main(page).getByRole("link")).toHaveText([/^Explore/, /^Swap/, /^Assets/, /^Rewards/, /^Stats/, /^Curated/]);
  await expect(main(page).getByRole("link", { name: "Explore" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("link", { name: "Developers" })).toHaveCount(0);
  await expect(page.getByRole("contentinfo").getByRole("link", { name: "API" })).toHaveAttribute("href", "/api");
  // "/" opens the search in place, from anywhere but a field (the board's search holds the focus on load, so it is let go first).
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("/");
  await expect(page.getByRole("combobox", { name: "Search coins" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Search" })).toBeFocused();
  // A coin's page is under Explore; Burns is under Stats.
  await page.goto("/burns");
  await expect(main(page).getByRole("link", { name: "Stats" })).toHaveAttribute("aria-current", "page");
  await expectNoHorizontalOverflow(page);
});

test("on a phone the tab bar carries the launch with its name and the account sheet the sections it leaves out", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/coins");
  const tabs = page.getByRole("navigation", { name: "Sections" });
  await expect(tabs.getByRole("link")).toHaveText(["Explore", "Assets", "Stoke", "Rewards"]);
  await expect(tabs.getByRole("link", { name: "Stoke a coin" })).toBeVisible();
  await expect(tabs.getByRole("link", { name: "Explore" })).toHaveAttribute("aria-current", "page");
  // The bar keeps the lockup and the search alone; the pill and the launch button are the tab bar's.
  await expect(main(page)).toBeHidden();
  await expect(page.getByRole("banner").getByRole("link", { name: "Stoke a coin" })).toBeHidden();
  // A click before hydration does nothing, so the sheet is asked for until it opens.
  const sheet = page.getByRole("dialog", { name: "Account" });
  await expect(async () => {
    if (!(await sheet.isVisible())) await tabs.getByRole("button", { name: "Account" }).click();
    await expect(sheet).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 30_000 });
  await expect(sheet.getByRole("button", { name: "Connect wallet" })).toBeVisible();
  await expect(sheet.getByRole("navigation", { name: "More" }).getByRole("link")).toHaveText(["Swap", "Stats", /Curated/]);
  await expect(sheet.getByRole("link", { name: "Developers" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});
