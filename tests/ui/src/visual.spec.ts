// Every screen at desktop and phone width, light and dark, against committed baselines. Values that change from run to
// run (addresses, times, costs) are masked; everything else must match to the pixel.
import type { Page } from "@playwright/test";
import { LedgerPage, Revenue } from "@launchpad/contract";
import {
  allowAirdrops, COIN_PNG, drain, expect, expectNoHorizontalOverflow, expectNoTruncatedText, fixedKeypair, giveCoins, listLaunches, SEED_CREATOR, SEED_HOLDER,
  test,
} from "./fixtures";
import { AIRDROP_CREATOR, AIRDROP_PAID, AIRDROP_SENDING, REWARD_QUOTE } from "./seedData";
import { connectTestWallet, installTestWallet, openWalletMenu, TEST_WALLET_NAME } from "./wallet";

// The chart's time axis and candle spacing follow the clock, so its canvases are masked like any other time. Only what is
// visible: content of a closed <details> still has a box, and masking it would paint over whatever is on screen there.
const dynamic = (page: Page) => ["time", ".mono:not(input)", "canvas"].map((s) => page.locator(s).filter({ visible: true }));

/**
 * A traded coin's amounts and prices follow from the fixed seed trades, so only what really varies is masked: times, the
 * chart, the latest candle (trades can straddle a minute), trader links and the coin's addresses.
 */
const tradedDynamic = (page: Page) => [
  page.locator("time"),
  page.locator("canvas"),
  page.locator('dl[aria-label$="candle"] .mono'),
  page.locator("a.mono"),
  page.locator("dl").filter({ hasText: "Launch transaction" }).locator(".mono"),
];

/**
 * A panel taller than the phone's viewport is captured while the page is scrolled, where the sticky site header would
 * sit over its top, wallet address and all; for such a shot the header scrolls away with the page.
 */
const unstickHeader = (page: Page) => page.addStyleTag({ content: "body > header { position: static !important; }" });

async function snap(page: Page, name: string, mask = dynamic) {
  // Check the settled page: hydrated, images in and web fonts swapped.
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  // The page scrolls under a resting pointer below, and whatever passes beneath it is hovered: an open picker makes the
  // hovered option active and scrolls its list to it. Park the pointer over the header first.
  await page.mouse.move(0, 0);
  // A full-page capture doesn't scroll, so lazy images far below the fold (a long board) would load or not depending on
  // timing. Scroll past every one, as a reader would, and wait for them all; the page's own markup is left alone.
  await page.evaluate(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += window.innerHeight) {
      window.scrollTo(0, y);
      await new Promise((r) => requestAnimationFrame(r));
    }
    await Promise.all([...document.images].map((img) => img.decode().catch(() => undefined)));
  });
  // The truncation check waits for hydration, so the overflow check after it sees the finished layout.
  await expectNoTruncatedText(page);
  await expectNoHorizontalOverflow(page);
  // A full-page capture of a scrolled page stitches the sticky header into the middle.
  await page.evaluate(() => window.scrollTo(0, 0));
  // After the scroll the pointer rests over whatever now sits where it last clicked; park it on the page's corner so no field shows a hover.
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot(name, { fullPage: true, mask: mask(page) });
}

async function mintOf(name: string) {
  const launch = (await listLaunches()).find((l) => l.name === name);
  if (!launch) throw new Error(`no seeded coin named ${name}`);
  return launch.mint;
}

test("board", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Coins", exact: true })).toBeVisible();
  await expect(page.locator("ul li img").first()).toHaveJSProperty("complete", true);
  await snap(page, "board.png");
});

test("board sorted by market cap, stablecoin pairs only", async ({ page }) => {
  await page.goto("/?sort=market_cap&category=stablecoin");
  await expect(page.getByRole("button", { name: "Market cap", pressed: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "Coins" }).getByRole("listitem").first()).toContainText("USDC");
  await expect(page.locator("ul li img").first()).toHaveJSProperty("complete", true);
  await snap(page, "board-filtered.png");
});

test("board Quote Asset filter, open", async ({ page }) => {
  await page.goto("/?sort=trending");
  const trigger = page.getByRole("button", { name: /^Quote Asset: / });
  await trigger.click();
  const list = page.getByRole("listbox", { name: "Quote Assets" });
  await expect(list.getByRole("option").first()).toHaveText("All Quote Assets");
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  // The truncation check waits for hydration, so the overflow check after it sees the finished layout.
  await expectNoTruncatedText(page);
  await expectNoHorizontalOverflow(page);
  // Masks paint over everything, the open list included, so only the button and its list are captured, with nothing to mask.
  // The button is brought up below the sticky header so the whole list is in view.
  await trigger.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 96));
  const button = (await trigger.boundingBox())!;
  const popover = (await list.locator("..").boundingBox())!;
  // Padded so the focus ring and the list's shadow show whole, and clamped to the viewport.
  const pad = 12;
  const viewport = page.viewportSize()!;
  const left = Math.max(0, Math.min(button.x, popover.x) - pad);
  const right = Math.min(viewport.width, Math.max(button.x + button.width, popover.x + popover.width) + pad);
  const top = button.y - pad;
  const clip = { x: left, y: top, width: right - left, height: popover.y + popover.height + pad * 2 - top };
  await expect(page).toHaveScreenshot("board-quote-filter.png", { clip });
});

test("search palette, with a match", async ({ page }) => {
  await page.goto("/rewards");
  await page.getByRole("banner").getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("combobox", { name: "Search coins" }).fill("harbor");
  const found = page.getByRole("listbox", { name: "Coins found" });
  await expect(found.getByRole("option")).toHaveCount(1);
  await expect(found.locator("img")).toHaveJSProperty("complete", true);
  await page.evaluate(() => document.fonts.ready);
  await expectNoTruncatedText(page);
  await expectNoHorizontalOverflow(page);
  // The palette covers the viewport, so the viewport is the shot; the page shows through its backdrop, so the page's
  // times are masked as in any other shot.
  await expect(page).toHaveScreenshot("search.png", { mask: dynamic(page) });
});

test("coin page", async ({ page }) => {
  await page.goto(`/coin/${await mintOf("Tracer Bullet")}`);
  await expect(page.locator("article header img")).toHaveJSProperty("complete", true);
  await snap(page, "coin.png");
});

test("coin page with the longest name and ticker", async ({ page }) => {
  await page.goto(`/coin/${await mintOf("Maximum Length Coin Name Here 32")}`);
  await expect(page.locator("article header img")).toHaveJSProperty("complete", true);
  await snap(page, "coin-longest.png");
});

test("coin page with trades", async ({ page }) => {
  await page.goto(`/coin/${await mintOf("Harbor Lights")}`);
  await expect(page.locator("article header img")).toHaveJSProperty("complete", true);
  await expect(page.getByRole("region", { name: "Trades", exact: true }).getByRole("row")).toHaveCount(5);
  await expect(page.getByText("Market cap")).toBeVisible();
  await snap(page, "coin-traded.png", tradedDynamic);
});

test("trade panel, buy and sell, quote and review", async ({ page, wallet }) => {
  await page.goto(`/coin/${await mintOf("Harbor Lights")}`);
  const panel = page.getByRole("region", { name: /^Trade( |$)/ });
  await connectTestWallet(page, panel.getByRole("button", { name: "Connect wallet" }));
  await panel.getByRole("button", { name: "0.5 SOL" }).click();
  await expect(panel.getByText("You get about")).toBeVisible();
  await expect(panel).toHaveScreenshot("trade-buy-quote.png", { mask: tradedDynamic(page) });

  await panel.getByRole("button", { name: "Review buy" }).click();
  const dialog = page.getByRole("dialog", { name: "Before you trade" });
  await expect(dialog).toBeVisible();
  // Masks paint over everything, the modal included, so the dialog is captured on its own.
  await expect(dialog).toHaveScreenshot("trade-disclaimer.png");
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Continue" }).click();
  await expect(panel.getByRole("region", { name: "Review your trade" })).toBeVisible();
  await expect(panel).toHaveScreenshot("trade-buy-review.png", { mask: tradedDynamic(page) });
  expect(wallet.requests).toHaveLength(0);

  await panel.getByRole("button", { name: "Edit" }).click();
  await panel.getByRole("group", { name: "Buy or sell" }).getByRole("button", { name: "Sell" }).click();
  // The test wallet holds none of this coin, so a sell shows the over-balance state.
  await panel.getByLabel("You pay").fill("1000000");
  await expect(panel.getByText("Your wallet has no HRBR.", { exact: true })).toBeVisible();
  await expect(panel.getByText("You get about")).toBeVisible();
  await expect(panel).toHaveScreenshot("trade-sell-over-balance.png", { mask: tradedDynamic(page) });
});

test("trade panel after the curve sold out, while Raydium moves the coin to its pool", async ({ page }) => {
  await page.goto(`/coin/${await mintOf("Signal Fire")}`);
  await expect(page.getByText(/Trading pauses while Raydium moves the coin to its pool/)).toBeVisible();
  await snap(page, "coin-sold-out.png", tradedDynamic);
});

test("coin page paired with USDC, after a buy", async ({ page }) => {
  await page.goto(`/coin/${await mintOf("Dollar Paired")}`);
  await expect(page.locator("article header img")).toHaveJSProperty("complete", true);
  await expect(page.getByRole("region", { name: "Trades", exact: true }).getByRole("row")).toHaveCount(2);
  await expect(page.getByText("Market cap")).toBeVisible();
  await snap(page, "coin-usdc.png", tradedDynamic);
});

test("trade panel paying with SOL on a USDC-paired coin, quote and review", async ({ page, wallet }) => {
  await page.goto(`/coin/${await mintOf("Dollar Paired")}`);
  await unstickHeader(page);
  const panel = page.getByRole("region", { name: /^Trade( |$)/ });
  await connectTestWallet(page, panel.getByRole("button", { name: "Connect wallet" }));
  // The test wallet holds no USDC, so the panel pays with SOL.
  await expect(panel.getByRole("group", { name: "Pay with" }).getByRole("button", { name: "SOL" })).toHaveAttribute("aria-pressed", "true");
  await panel.getByRole("button", { name: "0.5 SOL" }).click();
  await expect(panel.getByText("You pay exactly")).toBeVisible();
  await expect(panel).toHaveScreenshot("trade-sol-quote.png", { mask: tradedDynamic(page) });

  await panel.getByRole("button", { name: "Review buy" }).click();
  const dialog = page.getByRole("dialog", { name: "Before you trade" });
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Continue" }).click();
  await expect(panel.getByRole("region", { name: "Review your trade" })).toBeVisible();
  await expect(panel).toHaveScreenshot("trade-sol-review.png", { mask: tradedDynamic(page) });
  expect(wallet.requests).toHaveLength(0);
});

test("trade panel paying with SOL where there is no SOL route", async ({ page, wallet, expectedHttpErrors }) => {
  expectedHttpErrors.push(/\/v1\/launches\/[^/]+\/quote\?/);
  await page.goto(`/coin/${await mintOf("Chipmaker Pair")}`);
  await unstickHeader(page);
  const panel = page.getByRole("region", { name: /^Trade( |$)/ });
  await connectTestWallet(page, panel.getByRole("button", { name: "Connect wallet" }));
  await panel.getByRole("button", { name: "0.1 SOL" }).click();
  await expect(panel.getByText("There's no SOL route to NVDAx right now. Pay in NVDAx instead.")).toBeVisible();
  await expect(panel).toHaveScreenshot("trade-sol-no-route.png", { mask: tradedDynamic(page) });
  expect(wallet.requests).toHaveLength(0);
});

test("coin page after graduation", async ({ page }) => {
  await page.goto(`/coin/${await mintOf("Cap and Gown")}`);
  await expect(page.locator("article header img")).toHaveJSProperty("complete", true);
  await expect(page.getByText("Graduated to its Raydium pool")).toBeVisible();
  await expect(page.getByText("Market cap")).toBeVisible();
  await snap(page, "coin-graduated.png", tradedDynamic);
});

test("trade panel after graduation, with the pool's fees", async ({ page, wallet }) => {
  const mint = await mintOf("Cap and Gown");
  // Coins to sell, handed over rather than bought, so the pool and its history look the same in every project.
  await giveCoins(SEED_HOLDER, wallet.keypair.publicKey, mint, 1_000_000n * 1_000_000n);
  await page.goto(`/coin/${mint}`);
  const panel = page.getByRole("region", { name: /^Trade( |$)/ });
  await connectTestWallet(page, panel.getByRole("button", { name: "Connect wallet" }));
  await panel.getByRole("button", { name: "0.5 SOL" }).click();
  await expect(panel.getByText("Raydium pool fee")).toBeVisible();
  await expect(panel).toHaveScreenshot("trade-pool-buy-quote.png", { mask: tradedDynamic(page) });

  await panel.getByRole("group", { name: "Buy or sell" }).getByRole("button", { name: "Sell" }).click();
  await panel.getByRole("button", { name: "50%", exact: true }).click();
  await expect(panel.getByText("Raydium pool fee")).toBeVisible();
  await expect(panel).toHaveScreenshot("trade-pool-sell-quote.png", { mask: tradedDynamic(page) });
  // Handed back, so the coin page's top holders look the same in every project whatever order they run in.
  await giveCoins(wallet.keypair, SEED_HOLDER.publicKey, mint, 1_000_000n * 1_000_000n);
});

test("coin not found", async ({ page }) => {
  const res = await page.goto("/coin/11111111111111111111111111111111");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await snap(page, "coin-not-found.png");
});

test("launch form, step by step", async ({ page, wallet }) => {
  await page.goto("/launch");
  await expect(page.getByRole("heading", { name: "Launch a coin" })).toBeVisible();
  await snap(page, "launch-disconnected.png");

  await openWalletMenu(page, page.getByRole("main").getByRole("button", { name: "Connect wallet" }));
  await snap(page, "launch-wallet-menu.png");
  await page.getByRole("menuitem", { name: TEST_WALLET_NAME }).click();
  await expect(page.getByRole("button", { name: "Review launch" })).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles({ name: "coin.png", mimeType: "image/png", buffer: COIN_PNG });
  await page.getByLabel("Name").fill("Tracer Bullet");
  await page.getByLabel("Ticker").fill("TRCR");
  await page.getByLabel("Description").fill("The first coin through the whole system: form, API, wallet, chain, indexer, board.");
  await page.getByLabel("Website").fill("https://example.com/tracer");
  await snap(page, "launch-filled.png");

  await page.getByRole("button", { name: /^Pair with/ }).click();
  await expect(page.getByRole("listbox", { name: "Quote Assets" }).getByRole("option")).toHaveCount(6);
  // A mask paints an element's whole box even where its scrolling list clips it, so the masks of rows scrolled out of
  // the list would land on the form around it. The list's balances are hidden for this shot instead of masked.
  await page.addStyleTag({ content: '[role="listbox"] .mono { visibility: hidden !important; }' });
  await snap(page, "launch-quote-picker.png");
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Review launch" }).click();
  const dialog = page.getByRole("dialog", { name: "Before you launch" });
  await expect(dialog).toBeVisible();
  await expect(page).toHaveScreenshot("launch-disclaimer.png", { mask: dynamic(page) });
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("region", { name: "Review your launch" })).toBeVisible();
  await snap(page, "launch-review.png");
  expect(wallet.requests).toHaveLength(0);
});

test("launch review against a tokenized stock", async ({ page, wallet }) => {
  await page.goto("/launch");
  await connectTestWallet(page, page.getByRole("main").getByRole("button", { name: "Connect wallet" }));
  await page.locator('input[type="file"]').setInputFiles({ name: "coin.png", mimeType: "image/png", buffer: COIN_PNG });
  await page.getByLabel("Name").fill("Chipmaker Pair");
  await page.getByLabel("Ticker").fill("CHPX");
  await page.getByRole("button", { name: /^Pair with/ }).click();
  await page.getByRole("combobox", { name: "Search Quote Assets" }).fill("NVDAx");
  await page.getByRole("option", { name: /NVDAx/ }).click();
  await snap(page, "launch-filled-stock.png");

  await page.getByRole("button", { name: "Review launch" }).click();
  const dialog = page.getByRole("dialog", { name: "Before you launch" });
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("region", { name: "Review your launch" })).toContainText("0.83333333 NVDAx");
  await snap(page, "launch-review-stock.png");
  expect(wallet.requests).toHaveLength(0);
});

const OPTION_WALLETS = [1, 2, 3].map((n) => fixedKeypair(`options wallet ${n}`).publicKey.toBase58());

async function launchFormWithOptions(page: Page, airdrop: string) {
  await page.goto("/launch");
  await connectTestWallet(page, page.getByRole("main").getByRole("button", { name: "Connect wallet" }));
  await expect(page.getByRole("button", { name: "Review launch" })).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({ name: "coin.png", mimeType: "image/png", buffer: COIN_PNG });
  await page.getByLabel("Name").fill("Party Favors");
  await page.getByLabel("Ticker").fill("PARTY");
  await page.getByLabel(/^First buy/).fill("0.1");
  await page.getByRole("checkbox", { name: "Airdrop part of your first buy to other wallets" }).check();
  await page.getByLabel("Wallets and amounts").fill(airdrop);
}

test("launch form with a first buy and an airdrop", async ({ page, wallet }) => {
  await allowAirdrops(wallet.keypair.publicKey);
  await launchFormWithOptions(page, OPTION_WALLETS.map((w, i) => `${w}, ${(i + 1) * 250_000}`).join("\n"));
  await expect(page.getByText(/^You get/)).toBeVisible();
  await expect(page.getByText(/^3 wallets get/)).toBeVisible();
  await snap(page, "launch-options.png");

  await page.getByRole("button", { name: "Review launch" }).click();
  const dialog = page.getByRole("dialog", { name: "Before you launch" });
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("region", { name: "Review your launch" })).toBeVisible();
  await snap(page, "launch-review-options.png");
  expect(wallet.requests).toHaveLength(0);
});

test("launch form as a Reward Launch paid in the Quote Asset, and its review", async ({ page, wallet }) => {
  await page.goto("/launch");
  await connectTestWallet(page, page.getByRole("main").getByRole("button", { name: "Connect wallet" }));
  await expect(page.getByRole("button", { name: "Review launch" })).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({ name: "coin.png", mimeType: "image/png", buffer: COIN_PNG });
  await page.getByLabel("Name").fill("Yield Desk");
  await page.getByLabel("Ticker").fill("YLD");
  await page.getByRole("radiogroup", { name: "Launch type" }).getByRole("radio", { name: /^Reward Launch paid in SOL/ }).check();
  await page.getByRole("group", { name: "Reward Tax" }).getByRole("button", { name: "3%" }).click();
  await expect(page.getByText(/^The tax is sold for SOL in small slices/)).toBeVisible();
  await snap(page, "launch-reward.png");

  await page.getByRole("button", { name: "Review launch" }).click();
  const dialog = page.getByRole("dialog", { name: "Before you launch" });
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("region", { name: "Review your launch" })).toContainText("It is sold for SOL in small slices and paid out in SOL.");
  await snap(page, "launch-review-reward.png");
  expect(wallet.requests).toHaveLength(0);
});

test("launch form with a mistake in the airdrop list", async ({ page, wallet }) => {
  await allowAirdrops(wallet.keypair.publicKey);
  await launchFormWithOptions(page, `${OPTION_WALLETS[0]}, 250000\n${OPTION_WALLETS[0]}, 500000`);
  await expect(page.getByText("Line 2: this wallet is already on line 1.")).toBeVisible();
  await snap(page, "launch-options-error.png");
  expect(wallet.requests).toHaveLength(0);
});

test("launch the network refused", async ({ page, wallet }) => {
  await allowAirdrops(wallet.keypair.publicKey);
  await launchFormWithOptions(page, OPTION_WALLETS.map((w) => `${w}, 250000`).join("\n"));
  await page.getByRole("button", { name: "Review launch" }).click();
  const dialog = page.getByRole("dialog", { name: "Before you launch" });
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("region", { name: "Review your launch" })).toBeVisible();
  await drain(wallet.keypair, 0.01);
  await page.getByRole("button", { name: "Sign and launch" }).click();
  await expect(page.getByRole("region", { name: "Launch not confirmed" })).toBeVisible();
  await snap(page, "launch-failed.png");
});

test("coin page with an airdrop to send, seen by its creator", async ({ page }) => {
  await installTestWallet(page, AIRDROP_CREATOR);
  await page.goto(`/coin/${await mintOf(AIRDROP_SENDING.name)}`);
  await connectTestWallet(page, page.getByRole("banner").getByRole("button", { name: "Connect wallet" }));
  await expect(page.getByRole("region", { name: "Airdrop" }).getByRole("button", { name: "Send airdrop" })).toBeVisible();
  await expect(page.locator("article header img")).toHaveJSProperty("complete", true);
  await snap(page, "coin-airdrop.png");
});

test("coin page with a paid airdrop", async ({ page }) => {
  await page.goto(`/coin/${await mintOf(AIRDROP_PAID.name)}`);
  const card = page.getByRole("region", { name: "Airdrop" });
  await expect(card).toContainText("3 of 3 paid");
  await card.getByText("Show the 3 wallets").click();
  await expect(card.getByRole("link", { name: "Paid" })).toHaveCount(3);
  await expect(page.locator("article header img")).toHaveJSProperty("complete", true);
  await snap(page, "coin-airdrop-paid.png");
});

test("coin page of a Reward Launch paid in SOL, after a sale and a round", async ({ page }) => {
  await page.goto(`/coin/${await mintOf(REWARD_QUOTE.name)}`);
  const card = page.getByRole("region", { name: "Holder rewards" });
  await expect(card.getByRole("list", { name: "Reward Rounds" })).toContainText("Paid");
  await expect(card.getByRole("list", { name: "Reward Sales" }).getByRole("listitem")).toHaveCount(1);
  await expect(page.locator("article header img")).toHaveJSProperty("complete", true);
  await snap(page, "coin-rewards.png", tradedDynamic);
});

test("header wallet menu when connected", async ({ page, wallet }) => {
  await page.goto("/launch");
  await connectTestWallet(page, page.getByRole("main").getByRole("button", { name: "Connect wallet" }));
  await page.goto("/");
  const account = page.getByRole("banner").getByRole("button", { name: wallet.keypair.publicKey.toBase58().slice(0, 4), exact: false });
  await account.click();
  await expect(page.getByRole("menuitem", { name: "Disconnect" })).toBeVisible();
  await expect(page).toHaveScreenshot("header-account-menu.png", { mask: dynamic(page) });
});

test("creator earnings page, as its Creator", async ({ page }) => {
  await installTestWallet(page, SEED_CREATOR);
  await page.goto("/creator");
  await expect(page.getByRole("heading", { name: "Your creator earnings" })).toBeVisible();
  await snap(page, "creator-connect.png");

  await connectTestWallet(page, page.getByRole("main").getByRole("button", { name: "Connect wallet" }));
  await page.waitForURL(`**/creator/${SEED_CREATOR.publicKey.toBase58()}`);
  await expect(page.getByRole("region", { name: "SOL" })).toBeVisible();
  await expect(page.locator("main img").first()).toHaveJSProperty("complete", true);
  await snap(page, "creator.png", tradedDynamic);
});

test("creator earnings page, as a visitor", async ({ page }) => {
  await page.goto(`/creator/${SEED_CREATOR.publicKey.toBase58()}`);
  await expect(page.getByRole("heading", { name: "Creator earnings", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "How a Creator is paid" })).toBeVisible();
  await expect(page.locator("main img").first()).toHaveJSProperty("complete", true);
  await snap(page, "creator-visitor.png", tradedDynamic);
});

test("creator earnings page of a wallet that never launched", async ({ page }) => {
  await page.goto("/creator/11111111111111111111111111111111");
  await expect(page.getByText("This wallet hasn't launched a coin here yet.")).toBeVisible();
  await snap(page, "creator-empty.png");
});

test("creator earnings page of something that isn't an address", async ({ page }) => {
  const res = await page.goto("/creator/not-an-address");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Not a wallet address" })).toBeVisible();
  await snap(page, "creator-not-found.png");
});

test("revenue page", async ({ page, stack }) => {
  const revenue = Revenue.parse(await (await fetch(`${stack.apiUrl}/v1/revenue`)).json());
  const ledger = LedgerPage.parse(await (await fetch(`${stack.apiUrl}/v1/ledger?limit=25`)).json());
  await page.goto("/revenue");
  await expect(page.getByRole("heading", { name: "Platform revenue" })).toBeVisible();
  // The page shows what the API's Ledger says, asset by asset, and every entry links to its transaction.
  const totals = page.getByRole("region", { name: "All time" }).getByRole("listitem");
  await expect(totals).toHaveCount(revenue.totals.length);
  for (const [i, t] of revenue.totals.entries()) await expect(totals.nth(i)).toContainText(t.asset.symbol!);
  const entries = page.getByRole("region", { name: "Ledger" }).getByRole("listitem");
  await expect(entries).toHaveCount(ledger.entries.length);
  for (const [i, e] of ledger.entries.entries())
    await expect(entries.nth(i).getByRole("link").last()).toHaveAttribute("href", new RegExp(`/tx/${e.signature}`));
  await expect(page.locator("main img").first()).toHaveJSProperty("complete", true);
  // Addresses and times differ between runs; every amount follows from the seed's fixed trades.
  await snap(page, "revenue.png", (p) => [p.locator("time"), p.locator("a.mono")]);
});
