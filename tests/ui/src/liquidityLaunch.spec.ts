// The Liquidity Launch in the web app (#215), under the name the site gives it (`LIQUIDITY_LAUNCH` in fixtures.ts): the
// third launch type on the form, with its line and without anything of a Reward Launch; its coin's page, which says in
// words that the whole tax goes to the pool and carries the tax's card where a Reward Launch has its Holder Rewards;
// and the board's card, the row and the share card, which name it, while a Reward Launch and a standard coin read as
// they always have. The additions themselves need a graduated pool and are the backend suite's (`liquidity-launch.test.ts`).
import type { Page } from "@playwright/test";
import { CoinLiquidityTax, PreparedLaunch } from "@launchpad/contract";
import {
  expect, expectHydrated, expectNoHorizontalOverflow, fundedKeypair, launchViaApi, LIQUIDITY_LAUNCH, listLaunches, SCHEME_COOKIE, stackEnv, test,
} from "./fixtures";
import { connectWallet, fillForm, firstBuyField, signButton, summary } from "./launchPage";

const { name: NAME, tax: TAX, line } = LIQUIDITY_LAUNCH;
const COIN_DECIMALS = 6;
/** Three percent, the rate every coin of this file carries. */
const RATE = "300";
/** A First Buy of 0.1 SOL, in lamports: the tax it withholds is what waits for the pool. */
const FIRST_BUY = "100000000";

const types = (page: Page) => page.getByRole("radiogroup", { name: "Launch type" });
const typeRow = (page: Page) => types(page).getByRole("radio", { name: new RegExp(`^${NAME}`) });
const taxRates = (page: Page) => page.getByRole("group", { name: TAX, exact: true });
const earningsChoice = (page: Page) => page.getByRole("radiogroup", { name: "Creator earnings" });
const taxCard = (page: Page) => page.getByRole("region", { name: TAX, exact: true });
const tradePanel = (page: Page) => page.getByRole("region", { name: /^Trade( |$)/ });
/** A fact of the coin's About block, by its term. */
const fact = (page: Page, term: string) => page.getByText(term, { exact: true }).locator("xpath=following-sibling::dd");

/** The next launch the page prepares, as the API answered it, with the form fields it sent. */
function nextPrepare(page: Page) {
  return page
    .waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/v1/launches/prepare")
    .then(async (r) => ({ body: r.request().postData() ?? "", ok: r.ok(), json: (await r.json()) as unknown }));
}

/** The coin's tax as the API reads it from the chain and the Ledger. */
async function liquidityTaxOf(mint: string) {
  const res = await fetch(`${stackEnv().apiUrl}/v1/launches/${mint}/liquidity-tax`);
  if (!res.ok) throw new Error(`reading the liquidity tax of ${mint} failed: ${res.status} ${await res.text()}`);
  return CoinLiquidityTax.parse(await res.json());
}

/** Whole coins as the site writes them: raw units cut to the coin, with thousands separators. */
const coins = (raw: string) => (BigInt(raw) / 10n ** BigInt(COIN_DECIMALS)).toLocaleString("en-US");

/** The looks a baseline is kept in. The flows run at the first; what is new is shot at each. */
const LOOKS = [
  { name: "desktop-light", viewport: { width: 1440, height: 900 }, scheme: "light" },
  { name: "desktop-dark", viewport: { width: 1440, height: 900 }, scheme: "dark" },
  { name: "phone-light", viewport: { width: 390, height: 844 }, scheme: "light" },
  { name: "phone-dark", viewport: { width: 390, height: 844 }, scheme: "dark" },
] as const;

/**
 * A page settled for an element shot: fonts in, the pointer parked, and the sticky header, which would sit over the top
 * of an element taller than the window, scrolling away with the page (`unstickHeader` in visual.spec.ts).
 */
async function settled(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  await expectHydrated(page);
  await page.addStyleTag({ content: "body > header { position: static !important; } html { scroll-padding-block: 0 !important; }" });
  await page.mouse.move(0, 0);
  await expectNoHorizontalOverflow(page);
}

test("a Creator launches a Liquidity Launch on the form, which sends its tax alone, and the coin's page says the tax goes to the pool", async ({ page, wallet }) => {
  expect(wallet.requests).toHaveLength(0);
  await page.goto("/launch");
  await connectWallet(page);
  await fillForm(page, { name: "Deep Well", symbol: "WELL" });

  // The fourth row of the launch type, there before anything is chosen, and saying in its own words what it is.
  await expect(types(page).getByRole("radio")).toHaveCount(4);
  await expect(typeRow(page)).toHaveAccessibleName(`${NAME}, the tax goes to its pool, not to holders`);
  await expect(typeRow(page)).not.toBeChecked();
  await expect(taxRates(page)).toHaveCount(0);

  // A Reward Launch first, with a rate, a burn and the holders as the Creator's earnings: everything the type must drop.
  await types(page).getByRole("radio", { name: "Reward Launch, paid in the coin" }).check();
  await page.getByRole("group", { name: "Reward Tax" }).getByRole("button", { name: "3%" }).click();
  await page.getByRole("group", { name: "Reward Burn" }).getByRole("button", { name: "25%" }).click();
  await earningsChoice(page).getByRole("radio", { name: /^Your holders/ }).check();
  await expect(earningsChoice(page).getByRole("radio")).toHaveCount(4);

  await typeRow(page).check();
  await expect(types(page).getByRole("radio", { name: "Reward Launch, paid in the coin" })).not.toBeChecked();
  // Its tax at the rate already picked, and its line; no Payout Asset, "Burned" or "To liquidity" row.
  await expect(taxRates(page).getByRole("button")).toHaveText(["1%", "2%", "3%", "4%", "5%"]);
  await expect(taxRates(page).getByRole("button", { name: "3%" })).toHaveAttribute("aria-pressed", "true");
  await expect(taxRates(page)).toContainText(`${line("WELL")} It waits until WELL graduates and is added from then on. Fixed at launch, like the rate.`);
  for (const group of ["Reward Tax", "Reward Burn", "Reward Liquidity"]) await expect(page.getByRole("group", { name: group, exact: true })).toHaveCount(0);
  const section = page.getByRole("region", { name: /^Launch type/ });
  await expect(section).not.toContainText("Burned");
  await expect(section).not.toContainText("To liquidity");
  await expect(section).not.toContainText(/Holders are paid in|holders are paid in SOL/);
  // It pays its holders nothing, so the Creator's earnings can't go to them: the row is gone and the choice is the wallet again.
  await expect(earningsChoice(page).getByRole("radio")).toHaveCount(3);
  await expect(earningsChoice(page).getByRole("radio", { name: /^Your holders/ })).toHaveCount(0);
  await expect(earningsChoice(page).getByRole("radio", { name: /^Your wallet/ })).toBeChecked();

  // A First Buy is quoted with the type's tax, never a Reward Tax.
  const quoted = page.waitForRequest((r) => new URL(r.url()).pathname === "/v1/launch-quote" && new URL(r.url()).searchParams.get("firstBuy") === FIRST_BUY);
  await firstBuyField(page).fill("0.1");
  const query = new URL((await quoted).url()).searchParams;
  expect(query.get("liquidityTax")).toBe(RATE);
  expect(query.has("rewardTax")).toBe(false);
  await expect(summary(page)).toContainText("You get");

  // The summary names the type and the tax, in words, and the preview card carries its tag; nothing of a Reward Launch's.
  await expect(summary(page)).toContainText(new RegExp(`Launch type\\s*${NAME}, 3%`));
  await expect(summary(page)).toContainText(new RegExp(`${TAX}\\s*All of it to its pool, locked; nothing to holders`));
  await expect(summary(page)).not.toContainText("Reward Burn");
  await expect(summary(page)).not.toContainText("Reward Liquidity");
  await expect(summary(page)).not.toContainText("paid to your holders");
  const preview = page.getByRole("region", { name: "Preview" });
  await expect(preview.locator("[data-liquidity-tax]")).toHaveText(`3% ${TAX}`);
  await expect(preview).not.toContainText("to holders");

  // The prepare request carries the tax alone: no Reward Tax, Payout Asset, Reward Burn or Reward Liquidity, and no destination.
  const prepared = nextPrepare(page);
  await signButton(page).click();
  const answer = await prepared;
  expect(answer.ok).toBe(true);
  expect(answer.body).toMatch(/name="liquidityTax"\r\n\r\n300\r\n/);
  for (const field of ["rewardTax", "rewardPayout", "rewardBurn", "rewardLiquidity", "earningsDestination"]) expect(answer.body, field).not.toContain(`name="${field}"`);
  const launch = PreparedLaunch.parse(answer.json);
  expect(launch.liquidityTax).toEqual({ bps: 300 });
  expect(launch.rewardTax).toBeNull();
  await page.waitForURL(`**/coin/${launch.mint}`);
  expect(wallet.requests).toHaveLength(1);

  // The listing carries the kind and the tax, and no Reward Tax.
  const listed = (await listLaunches()).find((l) => l.mint === launch.mint);
  expect(listed?.liquidityTax).toEqual({ bps: 300, locked: null });
  expect(listed?.rewardTax).toBeNull();
  expect(listed?.earningsDestination).toBe("wallet");

  // The coin's facts: the type by its name, and its tax with the line, that it waits, and who holds the authority.
  await expect(fact(page, "Launch type")).toHaveText(NAME);
  const taxFact = page.locator("dl div[data-liquidity-tax]");
  await expect(taxFact.locator("dt")).toHaveText(TAX);
  await expect(taxFact).toContainText("3% of every transfer, all of it added to its pool");
  await expect(taxFact).toContainText(`${line("WELL")} It waits until WELL graduates.`);
  await expect(taxFact).toContainText("Fixed: LaunchLab holds the tax authority until graduation");
  await expect(page.getByText("Reward tax", { exact: true })).toHaveCount(0);

  // The card in the Holder Rewards card's place: the line, what waits (the First Buy's tax, as the API reads it from
  // the chain) and that it waits for Graduation, and nothing added yet.
  const card = taxCard(page);
  await expect(card.getByRole("heading", { name: TAX, exact: true })).toBeVisible();
  await expect(card).toContainText(`Every transfer of WELL withholds 3% for its pool. ${line("WELL")} It waits until WELL graduates:`);
  const tax = await liquidityTaxOf(launch.mint);
  expect(tax.taxBps).toBe(300);
  expect(BigInt(tax.waiting.total)).toBeGreaterThan(0n);
  expect(tax.recent).toEqual([]);
  await expect(card).toContainText(new RegExp(`Waiting for the pool\\s*${coins(tax.waiting.total)} WELL`));
  await expect(card).toContainText(/Added to the pool so far\s*0 WELL/);
  await expect(card).toContainText("Nothing added yet: the tax waits for WELL to graduate.");
  await expect(card.getByRole("link", { name: "Every fee, explained" })).toHaveAttribute("href", "/fees");
  // No Holder Rewards, no round, no payout and no Diamond Hands, on the card or anywhere on the page.
  await expect(page.getByRole("region", { name: "Holder rewards" })).toHaveCount(0);
  await expect(page.locator("[data-hands]")).toHaveCount(0);
  await expect(card).not.toContainText(/Reward Round|Diamond Hands|Payout|No round yet|Minimum holding/);
  expect((await fetch(`${stackEnv().apiUrl}/v1/launches/${launch.mint}/rewards`)).status).toBe(404);

  // A trade's fee line names the coin's own tax by its name, never as a reward tax.
  const panel = tradePanel(page);
  await expect(panel.getByRole("button", { name: /^Review (buy|sell)$/ })).toBeVisible();
  await panel.getByLabel("You pay").fill("0.01");
  await expect(panel.getByText("You get about")).toBeVisible();
  await expect(panel).toContainText(`WELL's ${TAX}`);
  await expect(panel).not.toContainText("reward tax");
  await expectNoHorizontalOverflow(page);
});

test("a Liquidity Launch's card at every look, and the board's card, its row and the share card name the type and no other coin's", async ({ page, context, baseURL, stack }) => {
  const creator = await fundedKeypair(5);
  // The three kinds side by side, each with "well" in its name so one search lists them: only the first is a Liquidity Launch.
  const mint = await launchViaApi(creator, { name: "Still Well", symbol: "STLW", liquidityTax: RATE, firstBuy: FIRST_BUY });
  const reward = await launchViaApi(creator, { name: "Well Paid", symbol: "WPAID", rewardTax: RATE });
  const plain = await launchViaApi(creator, { name: "Well Plain", symbol: "WPLN" });

  // The cards: the Liquidity Launch names its tax, with the line as the badge's title; the Reward Launch and the
  // standard coin read as they did.
  await page.goto("/coins?view=cards&q=well");
  const card = (coin: string) => page.locator("[data-coin-card]").filter({ has: page.locator(`a[href="/coin/${coin}"]`) });
  await expect(card(mint).locator("[data-liquidity-tax]")).toHaveText(`3% ${TAX}`);
  await expect(card(mint).locator("[data-liquidity-tax]")).toHaveAttribute("title", line());
  await expect(card(reward)).toContainText("3% tax");
  await expect(card(reward).locator("[data-liquidity-tax]")).toHaveCount(0);
  await expect(card(reward)).not.toContainText(TAX);
  await expect(card(plain)).toBeVisible();
  await expect(card(plain)).not.toContainText(/tax/i);
  await expectNoHorizontalOverflow(page);
  // The table's rows, the same way.
  await page.goto("/coins?view=table&q=well");
  const row = (coin: string) => page.getByRole("list", { name: "Coins" }).getByRole("listitem").filter({ has: page.locator(`a[href="/coin/${coin}"]`) });
  await expect(row(mint).locator("[data-liquidity-tax]")).toHaveText(`3% ${TAX}`);
  await expect(row(reward)).toContainText("3% tax");
  await expect(row(reward).locator("[data-liquidity-tax]")).toHaveCount(0);
  await expect(row(plain)).not.toContainText(/tax/i);

  // The share card names the type and where the tax goes; it holds only what was fixed at launch.
  await page.goto(`/coin/${mint}`);
  const named = await page.locator('meta[property="og:image"]').getAttribute("content");
  const url = new URL(named!);
  const res = await page.request.get(`${stack.webUrl}${url.pathname}${url.search}`);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("image/png");
  expect(await res.body()).toMatchSnapshot("share-coin-liquidity.png");

  // The card at every look. Its one amount is the tax the First Buy withheld, a fixed buy on a new curve, and nothing
  // collects or adds it while this test runs (no job runs unasked on this stack); it holds no time and no address.
  const tax = await liquidityTaxOf(mint);
  for (const look of LOOKS) {
    await context.addCookies([{ name: SCHEME_COOKIE, value: look.scheme, url: baseURL! }]);
    await page.setViewportSize(look.viewport);
    await page.goto(`/coin/${mint}`);
    await expect(taxCard(page)).toContainText(new RegExp(`Waiting for the pool\\s*${coins(tax.waiting.total)} STLW`));
    await expect(page.locator('[data-chart="loading"]')).toHaveCount(0, { timeout: 60_000 });
    await settled(page);
    await expect(taxCard(page)).toHaveScreenshot(`liquidity-tax-card-${look.name}.png`, { mask: [taxCard(page).locator("time")] });
  }
  await page.setViewportSize(LOOKS[0].viewport);
});

test("the launch type with a Liquidity Launch chosen, at every look", async ({ page, context, baseURL }) => {
  // No wallet and no launch: the section alone, with the type chosen, its rate and its line about the coin by its ticker.
  for (const look of LOOKS) {
    await context.addCookies([{ name: SCHEME_COOKIE, value: look.scheme, url: baseURL! }]);
    await page.setViewportSize(look.viewport);
    await page.goto("/launch");
    await expectHydrated(page);
    await page.getByLabel("Ticker").fill("WELL");
    await typeRow(page).check();
    await taxRates(page).getByRole("button", { name: "3%" }).click();
    await expect(taxRates(page)).toContainText(line("WELL"));
    await settled(page);
    const section = page.getByRole("region", { name: /^Launch type/ });
    await expect(section).toHaveScreenshot(`launch-type-liquidity-${look.name}.png`);
  }
  await page.setViewportSize(LOOKS[0].viewport);
});
