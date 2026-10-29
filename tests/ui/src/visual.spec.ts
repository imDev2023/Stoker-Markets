// Every screen at desktop and phone width, light and dark, against committed baselines. Values that change from run to
// run (addresses, times, costs) are masked; everything else must match to the pixel.
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { LedgerPage, Revenue } from "@launchpad/contract";
import {
  allowAirdrops, COIN_PNG, drain, expect, expectHydrated, expectNoHorizontalOverflow, expectNoTruncatedText, fixedKeypair, giveCoins, listLaunches, QUOTES, SEED_CREATOR,
  SEED_HOLDER, test,
} from "./fixtures";
import { AIRDROP_CREATOR, AIRDROP_PAID, AIRDROP_SENDING, REWARD_QUOTE } from "./seedData";
import { chooseQuote } from "./launchPage";
import { connectTestWallet, installTestWallet, openWalletMenu, TEST_WALLET_NAME } from "./wallet";

// The chart's time axis and candle spacing follow the clock, so its canvases are masked like any other time. Only what is
// visible: content of a closed <details> still has a box, and masking it would paint over whatever is on screen there.
// The wallet's avatar draws its hues from the address, which every run draws afresh, so it is masked like the address.
const dynamic = (page: Page) => ["time", ".mono:not(input)", "canvas", "[data-avatar]"].map((s) => page.locator(s).filter({ visible: true }));

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
  page.locator("[data-avatar]").filter({ visible: true }),
];

/** The suite's screenshot styles plus the dialog's own; a call's `stylePath` replaces the config's, so both are named. */
const DIALOG_STYLES = ["screenshot.css", "dialog.css"].map((name) => fileURLToPath(new URL(`./${name}`, import.meta.url)));

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
    // Only images within the page's width: one hidden sideways in a scrolling row never loads without a sideways scroll,
    // and its decode would wait forever (the landing's trending row on a phone, 2026-10-29).
    const within = (img: HTMLImageElement) => {
      const r = img.getBoundingClientRect();
      return r.right > 0 && r.left < window.innerWidth;
    };
    await Promise.all([...document.images].filter(within).map((img) => img.decode().catch(() => undefined)));
  });
  // Hydrated before the shot, so the caret Playwright hides is on a field React already holds; the truncation check
  // then polls past the font swaps, so the overflow check after it sees the finished layout.
  await expectHydrated(page);
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

test("home", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "No one picks your pair. You do." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Most traded today" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Most traded today" }).last().getByRole("link").first()).toBeVisible();
  await expect(page.locator("ul li img").first()).toHaveJSProperty("complete", true);
  await snap(page, "home.png");
});

test("board", async ({ page }) => {
  await page.goto("/coins");
  await expect(page.getByRole("heading", { name: "Coins", exact: true })).toBeVisible();
  await expect(page.locator("ul li img").first()).toHaveJSProperty("complete", true);
  await snap(page, "board.png");
});

test("board sorted by market cap, stablecoin pairs only", async ({ page }) => {
  await page.goto("/coins?sort=market_cap&category=stablecoin");
  await expect(page.getByRole("button", { name: "Market cap", pressed: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "Coins" }).getByRole("listitem").first()).toContainText("USDC");
  await expect(page.locator("ul li img").first()).toHaveJSProperty("complete", true);
  await snap(page, "board-filtered.png");
});

test("assets page", async ({ page }) => {
  await page.goto("/assets");
  await snap(page, "assets.png");
});

test("api page", async ({ page }) => {
  await page.goto("/api");
  // The quickstart's base URL, its request and the live answer carry the stack's own port and addresses (`data-live`).
  await snap(page, "api.png", (p) => [...dynamic(p), p.locator("[data-live]")]);
});

test("curated page", async ({ page }) => {
  await page.goto("/curated");
  await snap(page, "curated.png");
});

test("asset page of a tokenized stock, with the coins priced in it", async ({ page }) => {
  await page.goto(`/assets/${QUOTES.NVDAx.toBase58()}`);
  await snap(page, "asset.png");
});

test("the header's search open, with a match", async ({ page }) => {
  await page.goto("/rewards");
  await page.getByRole("banner").getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("combobox", { name: "Search coins" }).fill("harbor");
  const found = page.getByRole("listbox", { name: "Coins found" });
  await expect(found.getByRole("option")).toHaveCount(1);
  await expect(found.locator("img")).toHaveJSProperty("complete", true);
  await page.evaluate(() => document.fonts.ready);
  await expectNoTruncatedText(page);
  await expectNoHorizontalOverflow(page);
  // The result pills hang from the header over the page, so the viewport is the shot, its times masked as in any other.
  await expect(page).toHaveScreenshot("search.png", { mask: dynamic(page) });
});

test("coin page", async ({ page }) => {
  await page.goto(`/coin/${await mintOf("Tracer Bullet")}`);
  await expect(page.locator("article header img")).toHaveJSProperty("complete", true);
  await snap(page, "coin.png");
});

test("coin page with the longest name and ticker", async ({ page }) => {
  await page.goto(`/coin/${await mintOf("Maximum Length Coin Name Here 32")}`);
  // The page says "Copy protection until" inside the stack's 45-second window and "ended" after it, and the first look's
  // shot can land either side of that line depending on the run's speed (the light desktop baseline flipped once, 2026-10-29),
  // so the shot waits for the window to end; the label is rendered on the server, so it takes a reload to change.
  await expect
    .poll(async () => {
      if (await page.getByText("Copy protection ended").isVisible()) return true;
      await page.reload();
      return false;
    }, { timeout: 60_000, intervals: [2_000] })
    .toBe(true);
  await expect(page.locator("article header img")).toHaveJSProperty("complete", true);
  await snap(page, "coin-longest.png");
});

test("coin page with trades", async ({ page }) => {
  await page.goto(`/coin/${await mintOf("Harbor Lights")}`);
  await expect(page.locator("article header img")).toHaveJSProperty("complete", true);
  await expect(page.getByRole("region", { name: "Trades", exact: true }).getByRole("row")).toHaveCount(5);
  await expect(page.getByText(/^Market cap [\d.,]+ \w+$/)).toBeVisible();
  await snap(page, "coin-traded.png", tradedDynamic);
});

test("trade panel, buy and sell, quote and review", async ({ page, wallet }) => {
  await page.goto(`/coin/${await mintOf("Harbor Lights")}`);
  const panel = page.getByRole("region", { name: /^Trade( |$)/ });
  await connectTestWallet(page, panel.getByRole("button", { name: "Connect wallet" }));
  await panel.getByRole("button", { name: "0.5 SOL" }).click();
  await expect(panel.getByText("You get about")).toBeVisible();
  // The pointer rests on what it clicked and would draw its hover into the shot; park it first.
  await page.mouse.move(0, 0);
  await expect(panel).toHaveScreenshot("trade-buy-quote.png", { mask: tradedDynamic(page) });

  await panel.getByRole("button", { name: "Review buy" }).click();
  const dialog = page.getByRole("dialog", { name: "Before you trade" });
  await expect(dialog).toBeVisible();
  // Masks paint over everything, the modal included, so the dialog is captured on its own, with the page hidden under it
  // (`dialog.css`: one bottom row of `trade-disclaimer.png` on the phone differed between runs, 2026-10-26).
  await expect(dialog).toHaveScreenshot("trade-disclaimer.png", { stylePath: DIALOG_STYLES });
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Continue" }).click();
  await expect(panel.getByRole("region", { name: "Review your trade" })).toBeVisible();
  // The pointer rests on what it clicked and would draw its hover into the shot; park it first.
  await page.mouse.move(0, 0);
  await expect(panel).toHaveScreenshot("trade-buy-review.png", { mask: tradedDynamic(page) });
  expect(wallet.requests).toHaveLength(0);

  await panel.getByRole("button", { name: "Edit" }).click();
  await panel.getByRole("group", { name: "Buy or sell" }).getByRole("button", { name: "Sell" }).click();
  // The test wallet holds none of this coin, so a sell shows the over-balance state.
  await panel.getByLabel("You pay").fill("1000000");
  await expect(panel.getByText("Your wallet has no HRBR.", { exact: true })).toBeVisible();
  await expect(panel.getByText("You get about")).toBeVisible();
  // The pointer rests on what it clicked and would draw its hover into the shot; park it first.
  await page.mouse.move(0, 0);
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
  await expect(page.getByText(/^Market cap [\d.,]+ \w+$/)).toBeVisible();
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
  // The pointer rests on what it clicked and would draw its hover into the shot; park it first.
  await page.mouse.move(0, 0);
  await expect(panel).toHaveScreenshot("trade-sol-quote.png", { mask: tradedDynamic(page) });

  await panel.getByRole("button", { name: "Review buy" }).click();
  const dialog = page.getByRole("dialog", { name: "Before you trade" });
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Continue" }).click();
  await expect(panel.getByRole("region", { name: "Review your trade" })).toBeVisible();
  // The pointer rests on what it clicked and would draw its hover into the shot; park it first.
  await page.mouse.move(0, 0);
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
  // The pointer rests on the preset it clicked, which draws its hover; park it so the shot is the same every run.
  await page.mouse.move(0, 0);
  await expect(panel.getByText("There's no SOL route to NVDAx right now. Pay in NVDAx instead.")).toBeVisible();
  await expect(panel).toHaveScreenshot("trade-sol-no-route.png", { mask: tradedDynamic(page) });
  expect(wallet.requests).toHaveLength(0);
});

test("coin page after graduation", async ({ page }) => {
  await page.goto(`/coin/${await mintOf("Cap and Gown")}`);
  await expect(page.locator("article header img")).toHaveJSProperty("complete", true);
  await expect(page.getByText("Graduated to its Raydium pool")).toBeVisible();
  await expect(page.getByText(/^Market cap [\d.,]+ \w+$/)).toBeVisible();
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
  // The pointer rests on the preset it clicked, which draws its hover; park it so the shot is the same every run.
  await page.mouse.move(0, 0);
  await expect(panel.getByText("Raydium pool fee")).toBeVisible();
  await expect(panel).toHaveScreenshot("trade-pool-buy-quote.png", { mask: tradedDynamic(page) });

  await panel.getByRole("group", { name: "Buy or sell" }).getByRole("button", { name: "Sell" }).click();
  await panel.getByRole("button", { name: "50%", exact: true }).click();
  await page.mouse.move(0, 0);
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
  await expect(page.getByRole("heading", { name: "Stoke a coin" })).toBeVisible();
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
  await copyCheckSettled(page);
  await snap(page, "launch-filled.png");

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

/** The copy check answers a moment after the fields are filled; a shot waits for its verdicts so it never catches "Checking". */
async function copyCheckSettled(page: Page) {
  const card = page.getByRole("region", { name: "Copy check" });
  await expect(card).toHaveAttribute("aria-busy", "false");
  await expect(card.getByText("Checking")).toHaveCount(0);
}

test("launch review against a tokenized stock", async ({ page, wallet }) => {
  await page.goto("/launch");
  await connectTestWallet(page, page.getByRole("main").getByRole("button", { name: "Connect wallet" }));
  await page.locator('input[type="file"]').setInputFiles({ name: "coin.png", mimeType: "image/png", buffer: COIN_PNG });
  await page.getByLabel("Name").fill("Chipmaker Pair");
  await page.getByLabel("Ticker").fill("CHPX");
  await chooseQuote(page, "NVDAx");
  await copyCheckSettled(page);
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
  await copyCheckSettled(page);
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
  await copyCheckSettled(page);
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

// The creator page is the connected wallet's own: no public view of anyone's earnings.
test("creator earnings page, as its Creator", async ({ page }) => {
  await installTestWallet(page, SEED_CREATOR);
  await page.goto("/creator");
  await expect(page.getByRole("heading", { name: "Your creator earnings" })).toBeVisible();
  await snap(page, "creator-connect.png");

  await connectTestWallet(page, page.getByRole("main").getByRole("button", { name: "Connect wallet" }));
  await expect(page.getByRole("region", { name: "SOL" })).toBeVisible();
  await expect(page.locator("main img").first()).toHaveJSProperty("complete", true);
  await snap(page, "creator.png", tradedDynamic);
});

test("creator earnings page of a wallet that never launched", async ({ page }) => {
  await installTestWallet(page, fixedKeypair("never launched"));
  await page.goto("/creator");
  await connectTestWallet(page, page.getByRole("main").getByRole("button", { name: "Connect wallet" }));
  await expect(page.getByText("You haven't launched a coin here yet.")).toBeVisible();
  await snap(page, "creator-empty.png");
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
  // Addresses and times differ between runs, and the SOL swept so far wavers by a few lamports with the sweep's own costs
  // (7.959784 one run, 7.959779 another); every other amount follows from the seed's fixed trades.
  await snap(page, "revenue.png", (p) => [p.locator("time"), p.locator("a.mono"), p.locator('dl[aria-labelledby="swept-title"] dd')]);
});
