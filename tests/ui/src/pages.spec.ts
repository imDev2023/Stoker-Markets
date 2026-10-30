// The site's own pages for developers and for Curated (owner, 2026-10-25): the header's API link opens the reference
// on the site, never the repository, and Curated is a section of its own.
import { expect, expectNoHorizontalOverflow, test } from "./fixtures";

const main = (page: import("@playwright/test").Page) => page.getByRole("navigation", { name: "Main" });

test("the API page is the whole reference, answered live, and the header and footer link to it", async ({ page }) => {
  await page.goto("/api");
  await expect(page.getByRole("heading", { level: 1, name: "The API" })).toBeVisible();
  // The pill calls the page "Developers" (owner, 2026-10-25); the footer lists it as "API" among the developers' links.
  await expect(main(page).getByRole("link", { name: "Developers" })).toHaveAttribute("aria-current", "page");
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
  await expect(page.getByRole("contentinfo").getByRole("link", { name: "Fees" })).toHaveAttribute("href", "/fees");
  for (const [path, title] of [["/terms", "Terms of use"], ["/privacy", "Privacy"], ["/risk", "Risk disclosure"], ["/fees", "Fees"]] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
  await page.goto("/launch");
  await expect(page.getByRole("banner").getByRole("link", { name: "Stoke a coin" })).toHaveAttribute("aria-current", "page");
});

test("on a phone the launch button keeps its name and the menu has a visible close", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/coins");
  await expect(page.getByRole("banner").getByRole("link", { name: "Stoke a coin" })).toBeVisible();
  // A click before hydration does nothing, so the menu is asked for until it opens.
  const menu = page.getByRole("dialog", { name: "Menu" });
  await expect(async () => {
    if (!(await menu.isVisible())) await page.getByRole("button", { name: "Menu" }).click();
    await expect(menu).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 30_000 });
  await expect(menu.getByRole("link", { name: "Explore" })).toHaveAttribute("aria-current", "page");
  await expect(menu.getByRole("link", { name: "Developers" })).toBeVisible();
  await menu.getByRole("button", { name: "Close menu" }).click();
  await expect(menu).toHaveCount(0);
});

// The Fees page (owner, 2026-10-30): the one place the site shows a fee figure, every one of them read from the API.
test("the Fees page lists every fee from the platform facts, and the landing's footer leads to it", async ({ page, stack }) => {
  const platform = (await (await fetch(`${stack.apiUrl}/v1/platform`)).json()) as {
    platformFeeBps: number; poolCreatorFeeBps: number; referralShareBps: number; graduationFeeLamports: string; creatorForward: { curveBps: number };
  };
  await page.goto("/fees");
  await expect(page.getByRole("heading", { level: 1, name: "Fees" })).toBeVisible();
  const table = page.getByRole("region", { name: "Every fee" }).getByRole("table");
  await expect(table.getByRole("columnheader")).toHaveText(["Fee", "Who pays", "When", "In", "Who receives it"]);
  const rows = table.getByRole("rowgroup").last().getByRole("row");
  await expect(rows).toHaveCount(12);
  // The figures are the chain's, through the API: the Platform Fee, the pool creator fee, the referral share, the Graduation Fee.
  await expect(rows.filter({ hasText: "Platform Fee on the curve" })).toContainText(`${platform.platformFeeBps / 100}% of every trade`);
  await expect(rows.filter({ hasText: "Platform Fee on the curve" })).toContainText(`Half of it, ${platform.creatorForward.curveBps / 100}% of the trade`);
  await expect(rows.filter({ hasText: "Pool creator fee" })).toContainText(`${platform.poolCreatorFeeBps / 100}% of every trade`);
  await expect(rows.filter({ hasText: "Referral share" })).toContainText(`${platform.referralShareBps / 100}% of a referred trade`);
  await expect(rows.filter({ hasText: "Graduation Fee" })).toContainText(`${Number(platform.graduationFeeLamports) / 1e9} SOL's worth, once`);
  await expect(rows.filter({ hasText: "Creating a coin" })).toContainText("No platform fee");
  await expect(rows.filter({ hasText: "Swapping any Solana token" })).toContainText("0.5% of every swap");
  // Dated, and pointing at the announcements for changes.
  await expect(page.getByText(/^Figures as of /).locator("time")).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Announcements" })).toHaveAttribute("href", "/announcements");
  await expectNoHorizontalOverflow(page);
  // The landing's footer lists it with the legal pages.
  await page.goto("/");
  await expect(page.getByRole("contentinfo").getByRole("link", { name: "Fees" })).toHaveAttribute("href", "/fees");
});
