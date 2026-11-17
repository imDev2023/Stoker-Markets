// What the devnet rehearsal showed on 2026-11-17 (#221), each as a visitor met it. On a coin with a tax (a Reward Launch,
// a Liquidity Launch) the trade panel's result names the coins that reached or left the wallet, and the About's First
// Buy is the share the launch summary promised: the curve's own amounts, which the trades table goes on showing, are
// larger on a buy and smaller on a sell by the tax. A board card whose tag takes two lines keeps its lines level with
// the cards beside it. And a sell preset never reads a balance from before the trade that has just landed.
import type { Page } from "@playwright/test";
import { TradeList } from "@launchpad/contract";
import {
  coinBalance, expect, expectHydrated, expectNoHorizontalOverflow, fundedKeypair, launchViaApi, LIQUIDITY_LAUNCH, SCHEME_COOKIE, stackEnv, test, tradeViaApi,
  type LaunchFields,
} from "./fixtures";
import { connectWallet, fillForm, fillOptions, signButton, summary } from "./launchPage";
import { connectTestWallet } from "./wallet";

const COIN_DECIMALS = 6;
const panel = (page: Page) => page.getByRole("region", { name: /^Trade( |$)/ });
const review = (page: Page) => page.getByRole("region", { name: "Review your trade" });
const amountField = (page: Page) => panel(page).getByLabel("You pay");
/** A fact of the coin's About block, by its term. */
const fact = (page: Page, term: string) => page.getByText(term, { exact: true }).locator("xpath=following-sibling::dd");
/** Whole coins as the panel's result writes them: raw units cut to the coin, with thousands separators. */
const whole = (raw: bigint) => (raw / 10n ** BigInt(COIN_DECIMALS)).toLocaleString("en-US");
/** Raw units of an amount as the panel's field holds it. */
function rawOf(text: string) {
  const [units = "0", fraction = ""] = text.split(".");
  return BigInt(units) * 10n ** BigInt(COIN_DECIMALS) + BigInt(fraction.padEnd(COIN_DECIMALS, "0") || "0");
}

async function openConnected(page: Page, mint: string) {
  await page.goto(`/coin/${mint}`);
  await connectTestWallet(page, panel(page).getByRole("button", { name: "Connect wallet" }));
  await expect(panel(page).getByRole("button", { name: /^Review (buy|sell)$/ })).toBeVisible();
}

/** Reviews and signs what the panel holds, and answers with the coins its result names. */
async function trade(page: Page, side: "buy" | "sell", symbol: string) {
  await expect(panel(page).getByText("You get about")).toBeVisible();
  await panel(page).getByRole("button", { name: side === "buy" ? "Review buy" : "Review sell" }).click();
  await review(page).getByRole("button", { name: side === "buy" ? "Sign and buy" : "Sign and sell" }).click();
  const result = panel(page).getByRole("status");
  await expect(result).toHaveText(new RegExp(`^${side === "buy" ? "Bought" : "Sold"} [\\d,]+ ${symbol}\\. View transaction$`));
  return (await result.locator(".mono").textContent())!;
}

/** The coin's indexed trades, newest first: the curve's amounts. */
async function tradesOf(mint: string) {
  const res = await fetch(`${stackEnv().apiUrl}/v1/launches/${mint}/trades`);
  if (!res.ok) throw new Error(`reading the trades of ${mint} failed: ${res.status} ${await res.text()}`);
  return TradeList.parse(await res.json()).trades;
}

const TAXED: { type: string; name: string; symbol: string; fields: Partial<LaunchFields> }[] = [
  { type: "a Reward Launch", name: "Taxed Rewards", symbol: "TXRW", fields: { rewardTax: "500", rewardBurn: "2500", rewardLiquidity: "2500" } },
  { type: `a ${LIQUIDITY_LAUNCH.name}`, name: "Taxed Pool", symbol: "TXLQ", fields: { liquidityTax: "300" } },
];

for (const coin of TAXED) {
  test(`on ${coin.type}, the trade panel's result names the coins that reached the wallet on a buy and that left it on a sell`, async ({ page, wallet }) => {
    const mint = await launchViaApi(await fundedKeypair(), { name: coin.name, symbol: coin.symbol, ...coin.fields });
    const owner = wallet.keypair.publicKey;
    await openConnected(page, mint);

    // A buy: the wallet receives the curve's coins less the coin's tax, which is what the quote promised and the result says.
    await panel(page).getByRole("button", { name: "0.1 SOL" }).click();
    const bought = await trade(page, "buy", coin.symbol);
    const held = await coinBalance(owner, mint);
    expect(held).toBeGreaterThan(0n);
    expect(bought).toBe(whole(held));
    // The curve gave more than arrived, and the trades table goes on showing that.
    const [buy] = await tradesOf(mint);
    expect(BigInt(buy!.baseAmount)).toBeGreaterThan(held);
    expect(whole(BigInt(buy!.baseAmount))).not.toBe(bought);

    // A sell of half: the wallet sends half of what it holds, and the curve receives that less the tax.
    await panel(page).getByRole("group", { name: "Buy or sell" }).getByRole("button", { name: "Sell" }).click();
    await panel(page).getByRole("button", { name: "50%" }).click();
    expect(rawOf(await amountField(page).inputValue())).toBe(held / 2n);
    const sold = await trade(page, "sell", coin.symbol);
    const left = held - (await coinBalance(owner, mint));
    expect(left).toBe(held / 2n);
    expect(sold).toBe(whole(left));
    const [sell] = await tradesOf(mint);
    expect(sell!.side).toBe("sell");
    expect(BigInt(sell!.baseAmount)).toBeLessThan(left);
    expect(whole(BigInt(sell!.baseAmount))).not.toBe(sold);
  });
}

test("the About's First Buy on a Reward Launch is the share the launch summary promised", async ({ page, wallet }) => {
  await page.goto("/launch");
  await connectWallet(page);
  await fillForm(page, { name: "First Share", symbol: "FSHR" });
  await page.getByRole("radiogroup", { name: "Launch type" }).getByRole("radio", { name: "Reward Launch, paid in the coin" }).check();
  await page.getByRole("group", { name: "Reward Tax" }).getByRole("button", { name: "5%" }).click();
  await fillOptions(page, { firstBuy: "0.01" });

  // What the summary promises: the coins the wallet gets, after the coin's own tax, and their share of the supply.
  await expect(summary(page)).toContainText(/You get\s*[\d,]+ FSHR \([\d.<]+%\)/);
  const [, coins, share] = /You get\s*([\d,]+) FSHR \(([\d.<]+%)\)/.exec((await summary(page).textContent())!)!;
  await signButton(page).click();
  await page.waitForURL("**/coin/*");
  const mint = new URL(page.url()).pathname.split("/").pop()!;
  expect(whole(await coinBalance(wallet.keypair.publicKey, mint))).toBe(coins);

  // The coin's page says the same share twice: in its About and in the Creator's trust figure.
  await expect(fact(page, "First Buy")).toHaveText(`${share} of the supply, bought by the Creator at launch`);
  await page.getByRole("button", { name: /^Before you buy:/ }).click();
  await expect(page.getByRole("region", { name: "Before you buy" }).getByText(new RegExp(`^First Buy at launch: ${share!.replace(".", "\\.")}\\. `))).toBeVisible();
  // The curve's own figure, which the page showed before, is larger by the tax.
  const [first] = await tradesOf(mint);
  expect(BigInt(first!.baseAmount)).toBeGreaterThan(await coinBalance(wallet.keypair.publicKey, mint));
});

/** The looks a baseline is kept in. */
const LOOKS = [
  { name: "desktop-light", viewport: { width: 1440, height: 900 }, scheme: "light" },
  { name: "desktop-dark", viewport: { width: 1440, height: 900 }, scheme: "dark" },
  { name: "phone-light", viewport: { width: 390, height: 844 }, scheme: "light" },
  { name: "phone-dark", viewport: { width: 390, height: 844 }, scheme: "dark" },
] as const;

/** Where each part of each card starts, down the page, with the card's own top: one entry a card, in the board's order. */
const cardLines = (page: Page) =>
  page.locator("[data-coin-card]").evaluateAll((cards) =>
    cards.map((card) => ({
      top: Math.round(card.getBoundingClientRect().top * 100) / 100,
      bottom: Math.round(card.getBoundingClientRect().bottom * 100) / 100,
      lines: Array.from(card.children, (part) => Math.round(part.getBoundingClientRect().top * 100) / 100),
    })),
  );

test("a board card whose tag takes two lines keeps its lines level with the cards beside it", async ({ page, context, baseURL }) => {
  // Three coins that one search finds, the middle one a Reward Launch with both shares, whose tag is the longest there is.
  const creator = await fundedKeypair();
  await launchViaApi(creator, { name: "Levelrow One", symbol: "LVLA" });
  await launchViaApi(creator, { name: "Levelrow Two", symbol: "LVLB", rewardTax: "500", rewardBurn: "2500", rewardLiquidity: "2500" });
  await launchViaApi(creator, { name: "Levelrow Three", symbol: "LVLC", liquidityTax: "300" });

  const grid = page.getByRole("list").filter({ has: page.locator("[data-coin-card]") });
  const tag = page.getByText("5% tax, a quarter burned, a quarter to liquidity", { exact: true });
  for (const width of [1440, 1000, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/coins?view=cards&q=levelrow");
    await expect(page.locator("[data-coin-card]")).toHaveCount(3);
    await expectHydrated(page);
    await page.evaluate(() => document.fonts.ready);
    const cards = await cardLines(page);
    // Every card of a row starts and ends on the same lines, part by part.
    for (const card of cards) {
      const row = cards.filter((c) => c.top === card.top);
      expect(card.lines, `at ${width}`).toEqual(row[0]!.lines);
      expect(card.bottom, `at ${width}`).toBe(row[0]!.bottom);
    }
    // At the desktop's width the three share a row, and the tag does take two lines there: the row this test is about.
    if (width === 1440) {
      expect(new Set(cards.map((c) => c.top)).size).toBe(1);
      const line = await tag.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight));
      expect((await tag.boundingBox())!.height).toBeGreaterThan(line * 1.5);
    }
    await expectNoHorizontalOverflow(page);
  }

  for (const look of LOOKS) {
    await context.addCookies([{ name: SCHEME_COOKIE, value: look.scheme, url: baseURL! }]);
    await page.setViewportSize(look.viewport);
    await page.goto("/coins?view=cards&q=levelrow");
    await expect(page.locator("[data-coin-card]")).toHaveCount(3);
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => document.fonts.ready);
    await expectHydrated(page);
    await page.addStyleTag({ content: "body > header { position: static !important; } html { scroll-padding-top: 0 !important; }" });
    await page.mouse.move(0, 0);
    await expect(grid).toHaveScreenshot(`board-cards-wrapped-tag-${look.name}.png`, { mask: [grid.locator("time")] });
  }
  await page.setViewportSize(LOOKS[0].viewport);
});

test("a sell preset pressed as soon as a trade's result shows reads the balance after the trade", async ({ page, wallet }) => {
  const owner = wallet.keypair.publicKey;
  const mint = await launchViaApi(await fundedKeypair(), { name: "Fresh Balance", symbol: "FRSH" });
  await tradeViaApi(wallet.keypair, mint, "buy", 200_000_000n);
  const before = await coinBalance(owner, mint);

  // An RPC node that has fallen behind, as the rehearsal's did now and then: from the moment the wallet signs, the next
  // two reads of the wallet's coins are answered as they were before the trade, at the slot they were read in.
  let last: unknown = null;
  let stale: unknown = null;
  let lagging = 0;
  await page.route((url) => url.origin === new URL(stackEnv().rpcUrl).origin, async (route) => {
    const call = route.request().postDataJSON() as { id: unknown; method: string; params?: unknown[] } | null;
    const filter = call?.params?.[1] as { mint?: string } | undefined;
    if (call?.method !== "getTokenAccountsByOwner" || filter?.mint !== mint) return route.continue();
    const response = await route.fetch();
    const answer = (await response.json()) as { result: unknown };
    if (lagging > 0) {
      lagging--;
      return route.fulfill({ response, json: { jsonrpc: "2.0", id: call.id, result: stale } });
    }
    last = answer.result;
    return route.fulfill({ response, json: answer });
  });

  await openConnected(page, mint);
  await panel(page).getByRole("group", { name: "Buy or sell" }).getByRole("button", { name: "Sell" }).click();
  await panel(page).getByRole("button", { name: "50%" }).click();
  expect(rawOf(await amountField(page).inputValue())).toBe(before / 2n);
  await expect(panel(page).getByText("You get about")).toBeVisible();
  await panel(page).getByRole("button", { name: "Review sell" }).click();
  expect(last).not.toBeNull();
  stale = last;
  lagging = 2;
  await review(page).getByRole("button", { name: "Sign and sell" }).click();
  await expect(panel(page).getByRole("status")).toHaveText(/^Sold [\d,]+ FRSH\. View transaction$/);

  // Pressed the moment the result shows: half of what the wallet holds now, never half of what it held before.
  await panel(page).getByRole("button", { name: "50%" }).click();
  const now = await coinBalance(owner, mint);
  expect(now).toBe(before - before / 2n);
  expect(rawOf(await amountField(page).inputValue())).toBe(now / 2n);
  // The balance the panel shows beside the field is the new one too.
  await expect(panel(page).getByText(/^Balance /)).toContainText(whole(now));
});
