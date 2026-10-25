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
  await expect(page.getByRole("region", { name: "Quickstart" }).locator("pre[data-live]")).toContainText('"cluster": "localnet"');
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
