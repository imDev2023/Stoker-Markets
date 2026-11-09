// Every screen at desktop and phone width, light and dark, against committed baselines. Values that change from run to
// run (addresses, times, costs) are masked; everything else must match to the pixel.
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { LedgerPage, Revenue } from "@launchpad/contract";
import {
  allowAirdrops, COIN_PNG, drain, expect, expectHydrated, expectNoHorizontalOverflow, expectNoTruncatedText, fixedKeypair, forgetDisclaimer, giveCoins, listLaunches,
  hoverMark, markTooltip, postMarkAt, QUOTES, SEED_CREATOR, SEED_HOLDER, test,
} from "./fixtures";
import { AIRDROP_CREATOR, AIRDROP_PAID, AIRDROP_SENDING, REWARD_QUOTE } from "./seedData";
import { chooseQuote, firstBuyField, signButton, signing, summary } from "./launchPage";
import { accountArea, connectFromSite, connectTestWallet, installTestWallet, openWalletMenu, TEST_WALLET_NAME, type TestWallet } from "./wallet";

// The chart's time axis and candle spacing follow the clock, so TradingView's chart (#126) is masked like any other time,
// as a whole: it draws in a frame of its own, whose canvases a mask on the page cannot reach. Before a coin's first trade
// the plot holds only its note, which is shown. Only what is visible: content of a closed <details> still has a box, and
// masking it would paint over whatever is on screen there. The wallet's avatar draws its hues from the address, which
// every run draws afresh, so it is masked like the address. A coin row's five-minute change reads the seed's trades while
// the shot lands within five minutes of them and 0.0% after, which a slow run reaches (the board, 2026-11-06), so it is a
// clock like any time.
const CHART = '[data-chart]:not([data-chart="empty"])';
const FIVE_MINUTES = '[data-label="5m"]';
const dynamic = (page: Page) => ["time", ".mono:not(input)", "canvas", CHART, FIVE_MINUTES, "[data-avatar]"].map((s) => page.locator(s).filter({ visible: true }));

/**
 * A traded coin's amounts and prices follow from the fixed seed trades, so only what really varies is masked: times, the
 * chart, trader links and the coin's addresses.
 */
const tradedDynamic = (page: Page) => [
  page.locator("time"),
  page.locator(CHART),
  page.locator("a.mono"),
  page.locator("dl").filter({ hasText: "Launch transaction" }).locator(".mono"),
  page.locator("[data-avatar]").filter({ visible: true }),
];

/** The suite's screenshot styles plus the dialog's own; a call's `stylePath` replaces the config's, so both are named. */
const DIALOG_STYLES = ["screenshot.css", "dialog.css"].map((name) => fileURLToPath(new URL(`./${name}`, import.meta.url)));

/**
 * A panel taller than the phone's viewport is captured while the page is scrolled, where the sticky site header would
 * sit over its top, wallet address and all; for such a shot the header scrolls away with the page. The page's scroll
 * padding, which keeps anything scrolled into view clear of that header, goes with it: Playwright scrolls a panel that
 * fits the viewport into view and then captures the viewport alone, and with the padding kept a panel taller than the
 * viewport less the padding lands with its top at the padding and its bottom off screen, blank in the shot
 * (`trade-sol-quote.png` on the phone, 2026-10-27).
 */
const unstickHeader = (page: Page) =>
  page.addStyleTag({ content: "body > header { position: static !important; } html { scroll-padding-top: 0 !important; }" });

/**
 * Every coin chart on the page has loaded TradingView's library and drawn, or said it could not: the plot is masked
 * either way, but a chart still loading keeps the network busy and can log after the shot.
 */
async function chartsSettled(page: Page) {
  await expect(page.locator('[data-chart="loading"]')).toHaveCount(0, { timeout: 60_000 });
}

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
  await chartsSettled(page);
  await expectNoTruncatedText(page);
  await expectNoHorizontalOverflow(page);
  // A full-page capture of a scrolled page stitches the sticky header into the middle, and one taken while a scroll is
  // still in flight catches a sticky column partway (the launch summary, 2026-11-02): back to the top, and held there.
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await expect.poll(() => page.evaluate(() => window.scrollY), { message: "the page is not at the top" }).toBe(0);
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

test.describe("a first visit", () => {
  test.use({ firstVisit: true });

  test("welcome", async ({ page }) => {
    await page.goto("/");
    const welcome = page.getByRole("dialog", { name: "Welcome to Stoker" });
    await expect(welcome).toBeVisible();
    await expect(welcome.getByRole("button", { name: "Continue" })).toBeFocused();
    await page.evaluate(() => document.fonts.ready);
    // The dialog on its own, the page hidden under it (`dialog.css`), as the trade disclaimer is shot.
    await expect(welcome).toHaveScreenshot("disclaimer-welcome.png", { stylePath: DIALOG_STYLES });
  });
});

test("board", async ({ page }) => {
  await page.goto("/coins");
  await expect(page.getByRole("heading", { name: "Coins", exact: true })).toBeVisible();
  await expect(page.locator("ul li img").first()).toHaveJSProperty("complete", true);
  await snap(page, "board.png");
});

test("board as cards", async ({ page }) => {
  await page.goto("/coins?view=cards");
  await expect(page.getByRole("button", { name: "Cards", pressed: true })).toBeVisible();
  await expect(page.locator("ul li img").first()).toHaveJSProperty("complete", true);
  await snap(page, "board-cards.png");
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

/**
 * A coin's page says the Copy Protection runs "Until" a time inside the stack's 45-second window and "Ended" after it, and a shot of a
 * young seeded coin can land either side of that line depending on the run's speed (the longest coin's light desktop
 * baseline flipped on 2026-10-29, First Light's on 2026-10-30), so a shot waits for the window to end; the label is
 * rendered on the server, so it takes a reload to change.
 */
async function copyWindowEnded(page: Page) {
  await expect
    .poll(async () => {
      if (await page.getByText("Anyone may use this coin's name, ticker and image again.").isVisible()) return true;
      await page.reload();
      return false;
    }, { timeout: 60_000, intervals: [2_000] })
    .toBe(true);
}

test("coin page", async ({ page }) => {
  await page.goto(`/coin/${await mintOf("First Light")}`);
  await copyWindowEnded(page);
  await expect(page.locator("article header img").first()).toHaveJSProperty("complete", true);
  await snap(page, "coin.png");
});

test("coin page with the longest name and ticker", async ({ page }) => {
  await page.goto(`/coin/${await mintOf("Maximum Length Coin Name Here 32")}`);
  await copyWindowEnded(page);
  await expect(page.locator("article header img").first()).toHaveJSProperty("complete", true);
  await snap(page, "coin-longest.png");
});

test("coin page with trades", async ({ page }) => {
  await page.goto(`/coin/${await mintOf("Harbor Lights")}`);
  await expect(page.locator("article header img").first()).toHaveJSProperty("complete", true);
  await expect(page.getByRole("region", { name: "Trades", exact: true }).getByRole("row")).toHaveCount(5);
  await expect(page.getByText(/^Market cap [\d.,]+ \w+$/)).toBeVisible();
  await snap(page, "coin-traded.png", tradedDynamic);
});

test("a post's mark on the chart and its tooltip", async ({ page, context }) => {
  // A post's mark opens the post on X when clicked: answered here, should a tap count as one, so the test never reaches X.
  await context.route("https://x.com/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<title>post</title>" }));
  await page.goto(`/coin/${await mintOf("Harbor Lights")}`);
  const plot = page.locator("[data-chart]");
  await expect(plot).toHaveAttribute("data-chart", "ready", { timeout: 60_000 });
  // The posts alone, so the seeded post's ring is the one drawn in the accent; the legend then names posts only.
  await page.getByRole("group", { name: "Marks on the chart" }).getByRole("button", { name: "Trades" }).click();
  await expect(plot).toHaveAttribute("data-marks", "1");
  // On a phone the library's legend lies over a young coin's marks near the top of the plot, which the ring finder
  // cannot read through: the phone looks prove the mark is drawn, and its shots are the desktop's.
  if (test.info().project.use.hasTouch) return;
  await expect.poll(() => postMarkAt(page), { timeout: 30_000 }).not.toBeNull();
  const at = (await postMarkAt(page))!;
  // The mark itself: the ring in the accent around the author's picture, on the chart's own surface.
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot("chart-post-mark.png", { clip: { x: Math.round(at.x) - 14, y: Math.round(at.y) - 14, width: 28, height: 28 } });
  await hoverMark(page, at);
  await expect(markTooltip(page)).toContainText("@harbor_watch on X");
  // A page shot clipped to the tooltip: an element shot scrolls it into view first, which ends the hover.
  const box = (await markTooltip(page).boundingBox())!;
  await expect(page).toHaveScreenshot("chart-post-tooltip.png", { clip: { x: Math.floor(box.x), y: Math.floor(box.y), width: Math.ceil(box.width), height: Math.ceil(box.height) } });
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

  // The welcome recorded the acceptance for every test; a browser without the record meets the trade disclaimer instead.
  await forgetDisclaimer(page);
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
  await panel.getByLabel("You pay").fill("1000000000");
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
  await expect(page.locator("article header img").first()).toHaveJSProperty("complete", true);
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
  await expect(page.locator("article header img").first()).toHaveJSProperty("complete", true);
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
  // The quote carries one Fees line and the link to the Fees page (owner, 2026-10-30), no rates.
  await expect(panel.getByText("Raydium's pool fees and the platform's")).toBeVisible();
  await expect(panel).toHaveScreenshot("trade-pool-buy-quote.png", { mask: tradedDynamic(page) });

  await panel.getByRole("group", { name: "Buy or sell" }).getByRole("button", { name: "Sell" }).click();
  await panel.getByRole("button", { name: "50%", exact: true }).click();
  await page.mouse.move(0, 0);
  await expect(panel.getByText("Raydium's pool fees and the platform's")).toBeVisible();
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

/** The wallet prompt sits in the summary: beside the form on a desktop, after it on a phone (one page, #172). */
async function connectOnForm(page: Page) {
  await connectTestWallet(page, page.getByRole("main").getByRole("button", { name: "Connect wallet" }));
  await expect(signButton(page)).toBeVisible();
}

/** The preview card's price comes from a launch quote a moment after the pair is known; a shot waits for it, never a dash. */
async function previewPriced(page: Page) {
  await expect(page.getByRole("region", { name: "Preview" }).locator(".price")).toBeVisible();
}

async function fillCoin(page: Page, name: string, symbol: string, buffer = COIN_PNG) {
  await page.locator('input[type="file"]').setInputFiles({ name: "coin.png", mimeType: "image/png", buffer });
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Ticker").fill(symbol);
}

/**
 * Starts the launch and holds the wallet's answer, so the summary shows its signing panel with what the wallet pays;
 * `end` then declines and lets the wallet answer, so nothing launches.
 */
async function holdAtSigning(page: Page, wallet: TestWallet) {
  const held = wallet.holdNext();
  await signButton(page).click();
  await expect(signing(page)).toBeVisible();
  return {
    end: async () => {
      wallet.declineNext();
      held.release();
      await expect(page.getByRole("main").getByRole("alert")).toHaveText("You declined the transaction in your wallet. Nothing was launched.");
    },
  };
}

test("launch form, one page from empty to signing", async ({ page, wallet }) => {
  await page.goto("/launch");
  await expect(page.getByRole("heading", { name: "Stoke a coin" })).toBeVisible();
  // One page on every width (#172): no step index, every section in view, the summary with the action.
  await expect(page.getByRole("navigation", { name: "Steps" })).toHaveCount(0);
  for (const section of ["Your coin", "Paired with", "Launch type", "Links", "First buy"])
    await expect(page.getByRole("region", { name: new RegExp(`^${section}`) })).toBeVisible();
  await expect(summary(page)).toBeVisible();
  await expect(page.getByRole("region", { name: "Preview" })).toBeVisible();
  await previewPriced(page);
  await snap(page, "launch-disconnected.png");

  await openWalletMenu(page, page.getByRole("main").getByRole("button", { name: "Connect wallet" }));
  await snap(page, "launch-wallet-menu.png");
  await page.getByRole("menuitem", { name: TEST_WALLET_NAME }).click();
  await expect(signButton(page)).toBeVisible();

  await fillCoin(page, "Tracer Bullet", "TRCR");
  await page.getByLabel("Description").fill("The first coin through the whole system: form, API, wallet, chain, indexer, board.");
  await page.getByLabel("Website").fill("https://example.com/tracer");
  await copyCheckSettled(page);
  await snap(page, "launch-filled.png");

  // The welcome recorded the acceptance for every test; a browser without the record meets the launch disclaimer instead.
  await forgetDisclaimer(page);
  await signButton(page).click();
  const dialog = page.getByRole("dialog", { name: "Before you launch" });
  await expect(dialog).toBeVisible();
  // A viewport shot: the page behind the modal sits wherever the click on the summary's action scrolled it, so pin it.
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page).toHaveScreenshot("launch-disclaimer.png", { mask: dynamic(page) });
  await dialog.getByRole("checkbox").check();
  const held = wallet.holdNext();
  await dialog.getByRole("button", { name: "Continue" }).click();

  await expect(signing(page)).toBeVisible();
  await page.mouse.move(0, 0);
  await snap(page, "launch-signing.png");
  wallet.declineNext();
  held.release();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("You declined the transaction in your wallet. Nothing was launched.");
});

/** The copy check answers a moment after the fields are filled; a shot waits for its verdicts so it never catches "Checking". */
async function copyCheckSettled(page: Page) {
  const coin = page.getByRole("region", { name: "Your coin" });
  await expect(coin).toHaveAttribute("aria-busy", "false");
  await expect(coin.getByText("Checking")).toHaveCount(0);
}

test("launch against a tokenized stock, and its signing", async ({ page, wallet }) => {
  await page.goto("/launch");
  await connectOnForm(page);
  await fillCoin(page, "Chipmaker Pair", "CHPX");
  await chooseQuote(page, "NVDAx");
  await copyCheckSettled(page);
  await expect(summary(page)).toContainText("0.8333 NVDAx raised");
  await previewPriced(page);
  await snap(page, "launch-filled-stock.png");

  const launch = await holdAtSigning(page, wallet);
  await page.mouse.move(0, 0);
  await snap(page, "launch-signing-stock.png");
  await launch.end();
});

const OPTION_WALLETS = [1, 2, 3].map((n) => fixedKeypair(`options wallet ${n}`).publicKey.toBase58());

async function launchFormWithOptions(page: Page, airdrop: string) {
  await page.goto("/launch");
  await connectOnForm(page);
  await fillCoin(page, "Party Favors", "PARTY");
  await firstBuyField(page).fill("0.1");
  await page.getByRole("checkbox", { name: "Airdrop part of your first buy to other wallets" }).check();
  await page.getByLabel("Wallets and amounts").fill(airdrop);
}

test("launch form with a first buy and an airdrop", async ({ page, wallet }) => {
  await allowAirdrops(wallet.keypair.publicKey);
  await launchFormWithOptions(page, OPTION_WALLETS.map((w, i) => `${w}, ${(i + 1) * 250_000_000}`).join("\n"));
  await expect(summary(page)).toContainText("You get");
  await expect(page.getByText(/^3 wallets get/)).toBeVisible();
  await copyCheckSettled(page);
  await previewPriced(page);
  await snap(page, "launch-options.png");

  const launch = await holdAtSigning(page, wallet);
  await page.mouse.move(0, 0);
  await snap(page, "launch-signing-options.png");
  await launch.end();
});

test("launch form as a Reward Launch paid in the Quote Asset, and its signing", async ({ page, wallet }) => {
  await page.goto("/launch");
  await connectOnForm(page);
  await fillCoin(page, "Yield Desk", "YLD");
  await page.getByRole("radiogroup", { name: "Launch type" }).getByRole("radio", { name: "Reward Launch, paid in SOL" }).check();
  await page.getByRole("group", { name: "Reward Tax" }).getByRole("button", { name: "3%" }).click();
  await expect(page.getByText(/^The tax is sold for SOL in small slices/)).toBeVisible();
  await copyCheckSettled(page);
  await previewPriced(page);
  await page.mouse.move(0, 0);
  await snap(page, "launch-reward.png");

  const launch = await holdAtSigning(page, wallet);
  await page.mouse.move(0, 0);
  await snap(page, "launch-signing-reward.png");
  await launch.end();
});

test("launch form with a mistake in the airdrop list", async ({ page, wallet }) => {
  await allowAirdrops(wallet.keypair.publicKey);
  await launchFormWithOptions(page, `${OPTION_WALLETS[0]}, 250000000\n${OPTION_WALLETS[0]}, 500000000`);
  await expect(page.getByText("Line 2: this wallet is already on line 1.")).toBeVisible();
  await snap(page, "launch-options-error.png");
  expect(wallet.requests).toHaveLength(0);
});

test("launch the network refused", async ({ page, wallet }) => {
  await allowAirdrops(wallet.keypair.publicKey);
  await launchFormWithOptions(page, OPTION_WALLETS.map((w) => `${w}, 250000000`).join("\n"));
  await expect(summary(page)).toContainText("You get");
  const held = wallet.holdNext();
  await signButton(page).click();
  await expect(signing(page)).toBeVisible();
  await drain(wallet.keypair, 0.01);
  held.release();
  await expect(page.getByRole("region", { name: "Launch not confirmed" })).toBeVisible();
  await previewPriced(page);
  await page.mouse.move(0, 0);
  await snap(page, "launch-failed.png");
});

test("coin page with an airdrop to send, seen by its creator", async ({ page }) => {
  await installTestWallet(page, AIRDROP_CREATOR);
  await page.goto(`/coin/${await mintOf(AIRDROP_SENDING.name)}`);
  await connectFromSite(page);
  await expect(page.getByRole("region", { name: "Airdrop" }).getByRole("button", { name: "Send airdrop" })).toBeVisible();
  await expect(page.locator("article header img").first()).toHaveJSProperty("complete", true);
  await snap(page, "coin-airdrop.png");
});

test("coin page with a paid airdrop", async ({ page }) => {
  await page.goto(`/coin/${await mintOf(AIRDROP_PAID.name)}`);
  const card = page.getByRole("region", { name: "Airdrop" });
  await expect(card).toContainText("3 of 3 paid");
  await card.getByText("Show the 3 wallets").click();
  await expect(card.getByRole("link", { name: "Paid" })).toHaveCount(3);
  await expect(page.locator("article header img").first()).toHaveJSProperty("complete", true);
  await snap(page, "coin-airdrop-paid.png");
});

test("coin page of a Reward Launch paid in SOL, after a sale and a round", async ({ page }) => {
  await page.goto(`/coin/${await mintOf(REWARD_QUOTE.name)}`);
  const card = page.getByRole("region", { name: "Holder rewards" });
  await expect(card.getByRole("list", { name: "Reward Rounds" })).toContainText("Paid");
  await expect(card.getByRole("list", { name: "Reward Sales" }).getByRole("listitem")).toHaveCount(1);
  await expect(page.locator("article header img").first()).toHaveJSProperty("complete", true);
  await snap(page, "coin-rewards.png", tradedDynamic);
});

test("header wallet menu when connected", async ({ page, wallet }) => {
  await page.goto("/launch");
  await connectOnForm(page);
  await page.goto("/");
  // The header's ghost is the avatar once connected; on a phone the tab bar's Account tab opens the sheet that holds it.
  const account = (await accountArea(page)).getByRole("button", { name: wallet.keypair.publicKey.toBase58().slice(0, 4), exact: false });
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

test("stats page", async ({ page, stack }) => {
  const revenue = Revenue.parse(await (await fetch(`${stack.apiUrl}/v1/revenue`)).json());
  const ledger = LedgerPage.parse(await (await fetch(`${stack.apiUrl}/v1/ledger?limit=25`)).json());
  await page.goto("/revenue");
  // The Platform Token has not launched on the seeded stack, so the page carries its name and the market's empty state.
  await expect(page.getByRole("heading", { level: 1, name: "STOKER" })).toBeVisible();
  await expect(page.getByRole("region", { name: "STOKER market" })).toContainText("STOKER has not launched yet");
  await expect(page.getByRole("region", { name: "Key figures" }).getByRole("term")).toHaveCount(4);
  await expect(page.getByRole("region", { name: "Run the numbers" }).getByRole("textbox")).toHaveCount(2);
  // The page shows what the API's Ledger says, asset by asset, and every entry links to its transaction.
  const totals = page.getByRole("region", { name: "Revenue by asset" }).getByRole("listitem");
  await expect(totals).toHaveCount(revenue.totals.length);
  for (const [i, t] of revenue.totals.entries()) await expect(totals.nth(i)).toContainText(t.asset.symbol!);
  const entries = page.getByRole("region", { name: "Ledger" }).getByRole("listitem");
  await expect(entries).toHaveCount(ledger.entries.length);
  for (const [i, e] of ledger.entries.entries())
    await expect(entries.nth(i).getByRole("link").last()).toHaveAttribute("href", new RegExp(`/tx/${e.signature}`));
  await expect(page.locator("main img").first()).toHaveJSProperty("complete", true);
  // Addresses and times differ between runs, and the SOL swept so far wavers by a few lamports with the sweep's own costs
  // (7.959784 one run, 7.959779 another), in the summary and in the Ledger's sweep entries alike (the entry's amount
  // flipped a proving run on 2026-10-31); every other amount follows from the seed's fixed trades. The annualized figure
  // divides by the days since the first collection, so a run that crosses midnight halves it (2026-11-02): the figure and
  // the calculator that starts from it are masked.
  await snap(page, "revenue.png", (p) => [
    p.locator("time"),
    p.locator("a.mono"),
    p.locator('dl[aria-labelledby="swept-title"] dd'),
    p.getByRole("region", { name: "Ledger" }).getByRole("listitem").filter({ hasText: "Swept to treasury" }).locator("span.mono"),
    p.getByRole("region", { name: "Key figures" }).locator("dl > div").first().locator("dd"),
    p.getByRole("region", { name: "Run the numbers" }),
  ]);
});

test("fees page", async ({ page }) => {
  await page.goto("/fees");
  await expect(page.getByRole("heading", { level: 1, name: "Fees" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Every fee" }).getByRole("row").nth(1)).toBeVisible();
  // The dated line is the page's one clock.
  await snap(page, "fees.png", (p) => [p.locator("time")]);
});
