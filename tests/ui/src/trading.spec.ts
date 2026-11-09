// What a trader does on a coin page, end to end against the real chain, API and Indexer.
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import type { Page } from "@playwright/test";
import { MarkList } from "@launchpad/contract";
import { expect, forgetDisclaimer, fundedKeypair, launchViaApi, listLaunches, hoverMark, markTooltip, postMarkAt, postOnX, runMentions, stackEnv, test, tradeViaApi } from "./fixtures";
import { connectTestWallet } from "./wallet";

const panel = (page: Page) => page.getByRole("region", { name: /^Trade( |$)/ });
const review = (page: Page) => page.getByRole("region", { name: "Review your trade" });
const disclaimer = (page: Page) => page.getByRole("dialog", { name: "Before you trade" });

async function freshCoin(symbol: string) {
  return launchViaApi(await fundedKeypair(), { name: `Trade ${symbol}`, symbol });
}

async function openConnected(page: Page, mint: string) {
  await page.goto(`/coin/${mint}`);
  await connectTestWallet(page, panel(page).getByRole("button", { name: "Connect wallet" }));
  await expect(panel(page).getByRole("button", { name: /^Review (buy|sell)$/ })).toBeVisible();
}

/** Enters an amount and waits for the live quote, which the review button waits for too. */
async function enterAmount(page: Page, amount: string) {
  await panel(page).getByLabel("You pay").fill(amount);
  await expect(panel(page).getByText("You get about")).toBeVisible();
}

async function reviewTrade(page: Page) {
  await panel(page).getByRole("button", { name: /^Review (buy|sell)$/ }).click();
  await expect(review(page)).toBeVisible();
}

async function coinsHeld(owner: PublicKey, mint: string) {
  const conn = new Connection(stackEnv().rpcUrl, "confirmed");
  const accounts = await conn.getParsedTokenAccountsByOwner(owner, { mint: new PublicKey(mint) }, "confirmed");
  return accounts.value.reduce((sum, a) => sum + BigInt(a.account.data.parsed.info.tokenAmount.amount as string), 0n);
}

/** The coin page's chart (#126): our head above TradingView's library, which draws in a frame of its own. */
const chart = (page: Page) => page.getByRole("region", { name: /^(Price|Market cap)$/ });
const chartFrame = (page: Page) => chart(page).frameLocator("[data-chart] iframe");
/** The price the title row shows, in the compact notation the chart's legend and scale use too. */
const shownPrice = async (page: Page) => (await page.locator("article header .price > [aria-hidden]").first().textContent())!;

test("a trader buys, then sells half, and sees both in the history and the chart", async ({ page, wallet }) => {
  const mint = await freshCoin("BUYS");
  await openConnected(page, mint);
  await expect(page.getByText("No trades yet. Be the first to buy.", { exact: true })).toBeVisible();
  // Before the first trade the chart is its note alone: the library waits for something to draw.
  await expect(chart(page).locator("[data-chart]")).toHaveAttribute("data-chart", "empty");
  await expect(chart(page).getByText("The chart starts with the first trade.")).toBeVisible();
  await expect(chart(page).locator("iframe")).toHaveCount(0);

  // Buy: a preset fills the amount, the quote shows what the fees come to in one line (no rate anywhere but the Fees
  // page, owner 2026-10-30) with the link there, and the disclaimer comes before the first review.
  await panel(page).getByRole("button", { name: "0.1 SOL" }).click();
  await expect(panel(page).getByLabel("You pay")).toHaveValue("0.1");
  await expect(panel(page).getByText("You get about")).toBeVisible();
  await expect(panel(page).getByText("Fees", { exact: true })).toBeVisible();
  await expect(panel(page).getByText("Raydium's fee and the Platform Fee")).toBeVisible();
  await expect(panel(page).getByRole("link", { name: "Every fee, explained" })).toHaveAttribute("href", "/fees");
  const quote = panel(page).locator("dl").filter({ hasText: "You get about" });
  for (const row of ["Platform fee", "Raydium 0."]) await expect(quote).not.toContainText(row);
  // The chain pays no Creator Fee on our platform (ADR 0009): no row for one.
  await expect(panel(page).getByText("Creator fee")).toHaveCount(0);
  // The welcome recorded the acceptance for every test; a browser without the record meets the trade disclaimer here.
  await forgetDisclaimer(page);
  await panel(page).getByRole("button", { name: "Review buy" }).click();
  await expect(disclaimer(page)).toBeVisible();
  await disclaimer(page).getByRole("checkbox").check();
  await disclaimer(page).getByRole("button", { name: "Continue" }).click();

  // The review shows the simulated cost before the wallet is asked to sign.
  await expect(review(page)).toContainText("Your wallet pays");
  const cost = Number((await review(page).locator("strong.mono").textContent())?.replace(" SOL", ""));
  expect(cost).toBeGreaterThan(0.1);
  expect(cost).toBeLessThan(0.11);
  expect(wallet.requests).toHaveLength(0);

  await review(page).getByRole("button", { name: "Sign and buy" }).click();
  const bought = panel(page).getByRole("status");
  await expect(bought).toContainText(/^Bought [\d,]+ BUYS\. View transaction$/);
  expect(wallet.requests).toHaveLength(1);
  const held = await coinsHeld(wallet.keypair.publicKey, mint);
  expect(held).toBeGreaterThan(0n);
  expect((await bought.locator(".mono").textContent())?.replace(/,/g, "")).toBe((held / 1_000_000n).toString());

  // The history and the chart pick the trade up from the Indexer.
  const history = page.getByRole("region", { name: "Trades", exact: true });
  await expect(history.getByRole("row")).toHaveCount(2);
  await expect(history.getByRole("row").nth(1)).toContainText("Buy");
  await expect(page.getByText("No trades yet. Be the first to buy.", { exact: true })).toBeHidden();
  // The chart's market cap, with the figure (the stats strip has a "Market cap" label of its own).
  await expect(page.getByText(/^Market cap [\d.,]+ SOL$/)).toBeVisible();
  // The first trade starts the chart: TradingView's library, served from our own origin, draws the coin from our candles,
  // its legend naming the series and closing at the price the page shows.
  await expect(chart(page).locator("[data-chart]")).toHaveAttribute("data-chart", "ready", { timeout: 60_000 });
  await expect(chartFrame(page).getByText("BUYS / SOL", { exact: true })).toBeVisible();
  await expect(chartFrame(page).locator("body")).toContainText(await shownPrice(page));

  // Sell half: the percentage presets come from the balance the wallet holds.
  await panel(page).getByRole("group", { name: "Buy or sell" }).getByRole("button", { name: "Sell" }).click();
  await panel(page).getByRole("button", { name: "50%" }).click();
  await expect(panel(page).getByText("You get about")).toBeVisible();
  await reviewTrade(page);
  await expect(review(page)).toContainText("Your wallet receives about");
  await review(page).getByRole("button", { name: "Sign and sell" }).click();
  await expect(panel(page).getByRole("status")).toContainText(/^Sold [\d,]+ BUYS\. View transaction$/);
  expect(wallet.requests).toHaveLength(2);
  expect(await coinsHeld(wallet.keypair.publicKey, mint)).toBe(held - held / 2n);
  await expect(history.getByRole("row")).toHaveCount(3);
  await expect(history.getByRole("row").nth(1)).toContainText("Sell");
  // The live candle follows the sell without a reload: the legend closes at the new price.
  await expect(chartFrame(page).locator("body")).toContainText(await shownPrice(page));

  // Another candle interval redraws the chart from the same trades.
  const intervals = chart(page).getByRole("group", { name: "Candle interval" });
  await intervals.getByRole("button", { name: "5m", exact: true }).click();
  await expect(intervals.getByRole("button", { name: "5m", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(chartFrame(page).getByText("BUYS / SOL", { exact: true })).toBeVisible();
  await expect(page.getByText("The chart starts with the first trade.")).toBeHidden();

  // The market cap instead of the price, then in USD at SOL's latest price: the series and the head's figures follow.
  await chart(page).getByRole("group", { name: "Chart shows" }).getByRole("button", { name: "Market cap" }).click();
  await expect(chart(page).getByRole("heading", { name: "Market cap" })).toBeVisible();
  await expect(chartFrame(page).getByText("BUYS market cap in SOL", { exact: true })).toBeVisible();
  await chart(page).getByRole("group", { name: "Currency" }).getByRole("button", { name: "USD" }).click();
  await expect(chartFrame(page).getByText("BUYS market cap in USD", { exact: true })).toBeVisible();
  await expect(chart(page).getByText(/^Market cap [\d.,]+ USD$/)).toBeVisible();
  await expect(chart(page).getByText(/^24h volume [\d.,]+ USD$/)).toBeVisible();
});

test("the chart marks who traded, the visitor's own trades among them, and the posts on X that named the coin", async ({ page, wallet, context }) => {
  const mint = await freshCoin("MARK");
  // Two traders, then the visitor's own wallet, buy; a post names the coin, and the mentions job finds it in the stand-in.
  for (const sol of [0.1, 0.05]) await tradeViaApi(await fundedKeypair(), mint, "buy", BigInt(sol * LAMPORTS_PER_SOL));
  await tradeViaApi(wallet.keypair, mint, "buy", BigInt(0.02 * LAMPORTS_PER_SOL));
  const postId = String(1_910_000_000_000_000_000n + BigInt(Date.now()));
  await postOnX({ id: postId, text: `The MARK chart is heating up ${mint}`, author: { id: "5502", userName: "mark_watcher", name: "Mark Watcher" } });
  await runMentions();

  // The chart asks for the key wallets' trades with the visitor's wallet, and draws each of them and the post.
  const keyMarks = page.waitForResponse((r) => r.url().includes(`/launches/${mint}/marks?`) && r.url().includes(`wallet=${wallet.keypair.publicKey.toBase58()}`));
  await openConnected(page, mint);
  const marks = MarkList.parse(await (await keyMarks).json());
  expect(marks.trades.find((m) => m.wallet === wallet.keypair.publicKey.toBase58())?.roles).toContain("you");
  expect(marks.mentions.map((m) => m.id)).toEqual([postId]);
  const plot = chart(page).locator("[data-chart]");
  await expect(plot).toHaveAttribute("data-chart", "ready", { timeout: 60_000 });
  await expect(plot).toHaveAttribute("data-marks", String(marks.trades.length + 1));

  // The legend says what the rings mean and whose trades are marked, and every trade is one click away.
  const legend = chart(page).getByRole("list", { name: "What the circles mean" });
  await expect(legend.getByRole("listitem")).toHaveText(["Buy", "Sell", "Post on X"]);
  await expect(chart(page).getByText("Trades by you, the Creator, the snipers, the top holders and known wallets.")).toBeVisible();
  const every = page.waitForResponse((r) => r.url().includes(`/launches/${mint}/marks?`) && r.url().includes("trades=all"));
  await chart(page).getByRole("button", { name: "Show every trade" }).click();
  await every;
  await expect(chart(page).getByText("Every trade, up to ten a candle.")).toBeVisible();
  await chart(page).getByRole("button", { name: "Key wallets only" }).click();

  // The posts alone: the trades' rings leave the chart and the legend.
  const toggles = chart(page).getByRole("group", { name: "Marks on the chart" });
  await toggles.getByRole("button", { name: "Trades" }).click();
  await expect(toggles.getByRole("button", { name: "Trades" })).toHaveAttribute("aria-pressed", "false");
  await expect(plot).toHaveAttribute("data-marks", "1");
  await expect(legend.getByRole("listitem")).toHaveText(["Post on X"]);

  // Hovering the post's mark shows who posted what at what market cap; a click opens the post on X (answered here, so
  // the test never reaches X).
  await context.route("https://x.com/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<title>post</title>" }));
  await expect.poll(() => postMarkAt(page), { timeout: 30_000 }).not.toBeNull();
  const at = (await postMarkAt(page))!;
  await hoverMark(page, at);
  await expect(markTooltip(page)).toContainText(`@mark_watcher on X: “The MARK chart is heating up ${mint.slice(0, 4)}…${mint.slice(-4)}” Market cap then:`);
  // The post opens without an opener, so it arrives as a new page of the context rather than as this page's popup.
  const opened = context.waitForEvent("page");
  await page.mouse.click(at.x, at.y);
  await expect(await opened).toHaveURL(`https://x.com/mark_watcher/status/${postId}`);

  // Neither feed: no marks and no legend.
  await toggles.getByRole("button", { name: "Posts" }).click();
  await expect(plot).toHaveAttribute("data-marks", "0");
  await expect(legend).toBeHidden();
});

test("the chart follows the header's light or dark toggle", async ({ page }) => {
  const harbor = (await listLaunches()).find((l) => l.name === "Harbor Lights")!;
  await page.goto(`/coin/${harbor.mint}`);
  await expect(chart(page).locator("[data-chart]")).toHaveAttribute("data-chart", "ready", { timeout: 60_000 });
  // The library draws in a frame of its own: the page's tokens reach it as its own custom properties, read again on a flip.
  const toolbar = () => chartFrame(page).locator("body").evaluate((el) => getComputedStyle(el).getPropertyValue("--tv-color-platform-background").trim());
  // The card's surface, written the way the canvas writes a colour (`#rrggbb`), as the chart's tokens are.
  const card = () =>
    page.evaluate(() => {
      const probe = document.createElement("canvas").getContext("2d")!;
      probe.fillStyle = getComputedStyle(document.querySelector("[data-chart]")!.closest("section")!).backgroundColor;
      return String(probe.fillStyle);
    });
  const flip = async (name: string) => {
    const row = page.getByRole("menuitem", { name });
    await expect(async () => {
      if (!(await row.isVisible())) await page.getByRole("banner").getByRole("button", { name: "Connect wallet" }).click();
      await expect(row).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 30_000 });
    await row.click();
  };
  // The flows carry the light cookie: the chart's toolbar sits on the card's own light surface.
  const light = await toolbar();
  await expect.poll(card).toBe(light);
  await flip("Switch to dark mode");
  await expect(page.locator("html")).toHaveAttribute("data-scheme", "dark");
  await expect.poll(toolbar).not.toBe(light);
  // The card's surface transitions to the dark one; the chart's matches it once it has.
  await expect.poll(async () => (await toolbar()) === (await card())).toBe(true);
  await flip("Switch to light mode");
  await expect.poll(toolbar).toBe(light);
});

test("a buy that takes the rest of the curve costs only what is left and closes trading", async ({ page, wallet }) => {
  const mint = await freshCoin("SOLD");
  await openConnected(page, mint);
  // The local platform's Graduation Target is 1 SOL, so 2 SOL overshoots it.
  await enterAmount(page, "2");
  await expect(panel(page).getByText(/This buy takes the last coins on the curve and starts graduation/)).toBeVisible();
  await reviewTrade(page);
  const cost = Number((await review(page).locator("strong.mono").textContent())?.replace(" SOL", ""));
  expect(cost).toBeGreaterThan(1);
  expect(cost).toBeLessThan(1.1);
  await review(page).getByRole("button", { name: "Sign and buy" }).click();

  await expect(panel(page).getByRole("status")).toContainText(/^Bought [\d,]+ SOLD\./);
  await expect(panel(page).getByText(/Trading pauses while Raydium moves the coin to its pool/)).toBeVisible();
  await expect(panel(page).getByRole("button", { name: /^Review/ })).toHaveCount(0);
  await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
  expect(wallet.requests).toHaveLength(1);
});

test("a price that moves past the slippage before signing trades nothing and says so", async ({ page, wallet }) => {
  const mint = await freshCoin("SLIP");
  await openConnected(page, mint);
  await panel(page).getByRole("group", { name: "Slippage" }).getByRole("button", { name: "0.5%" }).click();
  await enterAmount(page, "0.1");
  await reviewTrade(page);

  // Someone else buys first and moves the price well past 0.5%.
  await tradeViaApi(await fundedKeypair(), mint, "buy", BigInt(0.3 * LAMPORTS_PER_SOL));

  await review(page).getByRole("button", { name: "Sign and buy" }).click();
  await expect(panel(page).getByRole("alert")).toHaveText(
    "The price moved past your slippage before the trade was sent, so nothing was traded or charged. Check the new quote and try again, or allow more slippage.",
  );
  await expect(review(page)).toBeHidden();
  expect(wallet.requests).toHaveLength(1);
  expect(await coinsHeld(wallet.keypair.publicKey, mint)).toBe(0n);
});

test("declining in the wallet trades nothing and says so", async ({ page, wallet }) => {
  const mint = await freshCoin("NOPE");
  await openConnected(page, mint);
  await enterAmount(page, "0.1");
  await reviewTrade(page);
  wallet.declineNext();
  await review(page).getByRole("button", { name: "Sign and buy" }).click();
  await expect(panel(page).getByRole("alert")).toHaveText("You declined the transaction in your wallet. Nothing was traded.");
  await expect(review(page)).toBeHidden();
  await expect(panel(page).getByRole("button", { name: "Review buy" })).toBeEnabled();
  expect(wallet.requests).toHaveLength(1);
  expect(await coinsHeld(wallet.keypair.publicKey, mint)).toBe(0n);
});

test("an amount over the wallet's balance is refused before any review", async ({ page, wallet }) => {
  const mint = await freshCoin("MUCH");
  // Leave the wallet 0.3 SOL. The amount must be over the balance but under what the rest of the curve costs (about 1 SOL
  // locally): a bigger buy is capped at the curve's remainder, and the quote rightly says it costs less than the balance.
  const conn = new Connection(stackEnv().rpcUrl, "confirmed");
  const spend = (await conn.getBalance(wallet.keypair.publicKey)) - 0.3 * LAMPORTS_PER_SOL;
  const drain = SystemProgram.transfer({ fromPubkey: wallet.keypair.publicKey, toPubkey: Keypair.generate().publicKey, lamports: spend });
  await sendAndConfirmTransaction(conn, new Transaction().add(drain), [wallet.keypair]);
  await openConnected(page, mint);
  await panel(page).getByLabel("You pay").fill("0.5");
  await expect(panel(page).getByText("You get about")).toBeVisible();
  await expect(panel(page).getByText(/^You have [\d.,]+ SOL\. Enter a smaller amount\.$/)).toBeVisible();
  await expect(panel(page).getByLabel("You pay")).toHaveAttribute("aria-invalid", "true");
  await expect(panel(page).getByRole("button", { name: "Review buy" })).toBeDisabled();
  expect(wallet.requests).toHaveLength(0);
});
