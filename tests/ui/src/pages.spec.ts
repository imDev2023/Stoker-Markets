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
  await expect(page.getByRole("contentinfo").getByRole("link", { name: "Fees" })).toHaveAttribute("href", "/fees");
  for (const [path, title] of [["/terms", "Terms of use"], ["/privacy", "Privacy"], ["/risk", "Risk disclosure"], ["/fees", "Fees"]] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
  await page.goto("/launch");
  await expect(page.getByRole("banner").getByRole("link", { name: "Stoke a coin" })).toHaveAttribute("aria-current", "page");
});

// The header (owner, 2026-10-30, on #133: H9's structure with H4's pill kept): six words in the pill with the current one
// marked, Developers in the footer, no search of its own (the board's is the site's, reached by "/" from any page since
// 2026-10-31), and under 768px the bottom tab bar with the launch in the middle and the account sheet in place of a menu overlay.
test("the header: six words in the pill with the current one marked, Developers in the footer, and no search of its own", async ({ page }) => {
  await page.goto("/coins");
  // Each word is set twice for the hover slide (the twin aria-hidden), so the links are matched by word, not whole text.
  await expect(main(page).getByRole("link")).toHaveText([/^Explore/, /^Swap/, /^Assets/, /^Rewards/, /^Stats/, /^Curated/]);
  await expect(main(page).getByRole("link", { name: "Explore" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("link", { name: "Developers" })).toHaveCount(0);
  await expect(page.getByRole("contentinfo").getByRole("link", { name: "API" })).toHaveAttribute("href", "/api");
  // "/" reaches the board's search from anywhere but a field; the header carries none.
  await expect(page.getByRole("banner").getByRole("button", { name: "Search", exact: true })).toHaveCount(0);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("/");
  await expect(page.getByRole("searchbox", { name: "Search coins" })).toBeFocused();
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
  // The bar keeps the lockup alone; the pill and the launch button are the tab bar's.
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

// The Fees page (owner, 2026-10-30): the one place the site shows a fee figure, every one of them read from the API.
test("the Fees page lists every fee from the platform facts, and the landing's footer leads to it", async ({ page, stack }) => {
  const platform = (await (await fetch(`${stack.apiUrl}/v1/platform`)).json()) as {
    platformFeeBps: number; poolCreatorFeeBps: number; poolCreatorFeeShareBps: number; referralShareBps: number; graduationFeeLamports: string;
    creatorForward: { curveBps: number; ladder: { inForce: { tiers: { tier: number; activeDays: number; shareBps: number }[]; activeDayFloorBps: number }; upcoming: unknown[] } };
    budgetTable: { inForce: { shares: Record<string, number> }; upcoming: unknown[] };
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
  await expect(page.getByText(/^Figures as of /).getByRole("link", { name: "Announcements" })).toHaveAttribute("href", "/announcements");
  // The Budget Table (#187, ADR 0019): how the platform's own share is divided, every row with its share from the API,
  // the trader programs present at nothing until they are built, and the shares summing to the whole.
  const shares = platform.budgetTable.inForce.shares;
  const budget = page.getByRole("list", { name: "How the platform's share is divided" }).getByRole("listitem");
  await expect(budget).toHaveCount(6);
  for (const [name, row] of [["The Burn", "burn"], ["The Flywheel", "flywheel"], ["Volume rebates", "rebates"], ["Referrals on every pair", "referrals"], ["Integrator share", "integrators"], ["Treasury", "treasury"]] as const)
    await expect(budget.filter({ hasText: name })).toContainText(`${shares[row]! / 100}%`);
  expect(Object.values(shares).reduce((sum, bps) => sum + bps, 0)).toBe(10_000);
  await expect(budget.filter({ hasText: "Volume rebates" })).toContainText("Not built yet");
  const card = page.getByRole("region", { name: "What the platform does with its share" });
  await expect(card).toContainText("The Fee Key's part of a pool trade");
  await expect(card).toContainText("is the platform's alone");
  await expect(card.getByRole("link", { name: "Announcements" })).toHaveAttribute("href", "/announcements");
  // The Creator Ladder (#188, ADR 0020): the three tiers with their shares from the API, the Active Days that reach
  // each, and what a pool trade then pays the Creator; the pool creator fee's row leads to it.
  const { tiers, activeDayFloorBps } = platform.creatorForward.ladder.inForce;
  const ladder = page.getByRole("region", { name: "What a Creator earns: the Creator Ladder" });
  const rungs = ladder.getByRole("list", { name: "The Creator's share by tier" }).getByRole("listitem");
  await expect(rungs).toHaveCount(3);
  const pct = (bps: number) => `${Number((bps / 100).toFixed(3))}%`;
  const ofPoolTrade = (shareBps: number) => pct((platform.poolCreatorFeeBps * (10_000 - platform.poolCreatorFeeShareBps) * shareBps) / 100_000_000);
  for (const [i, name] of ["First tier", "Second tier", "Top tier"].entries()) {
    await expect(rungs.nth(i)).toContainText(name);
    await expect(rungs.nth(i)).toContainText(pct(tiers[i]!.shareBps));
    await expect(rungs.nth(i)).toContainText(`${ofPoolTrade(tiers[i]!.shareBps)} of every trade in the pool`);
    if (i > 0) await expect(rungs.nth(i)).toContainText(`After ${tiers[i]!.activeDays} Active Days`);
  }
  expect(tiers.map((t) => t.shareBps)).toEqual([5000, 6000, 7000]);
  await expect(ladder).toContainText(`at least ${pct(activeDayFloorBps)} of the coin's own Graduation Target`);
  await expect(ladder).toContainText("a tier, once reached, is never lost");
  await expect(rows.filter({ hasText: "Pool creator fee" }).getByRole("link", { name: "Creator Ladder" })).toHaveAttribute("href", "#creator-ladder");
  await expectNoHorizontalOverflow(page);
  // A change to the table or to the ladder is announced beside the fee changes; none has been.
  await page.goto("/announcements");
  await expect(page.getByRole("region", { name: "The platform's share" })).toContainText("The division has not changed since the start.");
  await expect(page.getByRole("region", { name: "The Creator's share" })).toContainText("The ladder has not changed since the start.");
  // The landing's footer lists it with the legal pages.
  await page.goto("/");
  await expect(page.getByRole("contentinfo").getByRole("link", { name: "Fees" })).toHaveAttribute("href", "/fees");
});
