// Graduation in the web app: a trader buys out a curve, the coin page follows Raydium's migration, and the same page then
// trades in the coin's Raydium pool. The test plays Raydium's crank with the local chain's migrate wallet.
import type { Page } from "@playwright/test";
import type { VersionedTransaction } from "@solana/web3.js";
import { coinBalance, expect, fundedKeypair, graduate, launchViaApi, listLaunches, test, tradeViaApi } from "./fixtures";
import { TEST_WALLET_NAME } from "./wallet";

// The devnet program ids the local chain runs: which one a trade invokes shows where it traded.
const LAUNCHLAB = "DRay6fNdQ5J82H7xV6uq2aV3mNrUZ1J4PgSKsWgptcm6";
const CPMM = "DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb";

const invokes = (tx: VersionedTransaction) =>
  tx.message.compiledInstructions.map((ix) => tx.message.staticAccountKeys[ix.programIdIndex]!.toBase58());

const panel = (page: Page) => page.getByRole("region", { name: /^Trade( |$)/ });
const progress = (page: Page) => page.getByRole("region", { name: "Graduation" });
const review = (page: Page) => page.getByRole("region", { name: "Review your trade" });

async function connectWallet(page: Page) {
  await page.getByRole("main").getByRole("button", { name: "Connect wallet" }).click();
  await page.getByRole("menuitem", { name: TEST_WALLET_NAME }).click();
  await expect(page.getByRole("button", { name: "Review buy" })).toBeVisible();
}

/** The first trade in a browser asks for the disclaimer before the review. */
async function acceptDisclaimer(page: Page) {
  const disclaimer = page.getByRole("dialog", { name: "Before you trade" });
  await disclaimer.getByRole("checkbox").check();
  await disclaimer.getByRole("button", { name: "Continue" }).click();
}

/** Types an amount, reviews, signs in the wallet, and waits for the confirmation. */
async function tradeOnPage(page: Page, side: "buy" | "sell", amount: string | "All", confirm: RegExp) {
  await page.getByRole("group", { name: "Buy or sell" }).getByRole("button", { name: side === "buy" ? "Buy" : "Sell" }).click();
  if (amount === "All") await page.getByRole("button", { name: "All", exact: true }).click();
  else await page.getByLabel("You pay").fill(amount);
  await expect(page.getByText("You get about")).toBeVisible();
  await page.getByRole("button", { name: side === "buy" ? "Review buy" : "Review sell" }).click();
  await review(page).getByRole("button", { name: side === "buy" ? "Sign and buy" : "Sign and sell" }).click();
  await expect(page.getByRole("status")).toHaveText(confirm);
}

test("a coin graduates from the curve to its Raydium pool and keeps trading on the same page", async ({ page, wallet }) => {
  const creator = await fundedKeypair();
  const mint = await launchViaApi(creator, { name: "Summit Push", symbol: "SUMT", description: "Bought out in one go." });
  await page.goto(`/coin/${mint}`);
  await connectWallet(page);

  // The first trade asks for the disclaimer, then the buy that takes the rest of the curve says so before signing.
  await page.getByLabel("You pay").fill("2");
  await expect(page.getByText(/takes the last coins on the curve and starts graduation/)).toBeVisible();
  await page.getByRole("button", { name: "Review buy" }).click();
  await acceptDisclaimer(page);
  await review(page).getByRole("button", { name: "Sign and buy" }).click();
  await expect(page.getByRole("status")).toHaveText(/^Bought [\d,]+ SUMT\. View transaction$/);
  expect(invokes(wallet.requests.at(-1)!)).toContain(LAUNCHLAB);

  // Sold out: the page shows the Launch graduating and trading paused until Raydium moves it.
  await expect(progress(page).getByText("100%")).toBeVisible();
  await expect(progress(page)).toContainText("Raydium is moving the coin to its own pool");
  await expect(panel(page)).toContainText("Trading pauses while Raydium moves the coin to its pool");
  await expect(page.getByLabel("You pay")).toBeHidden();

  // Raydium's crank migrates it; the page picks that up by itself.
  await graduate(mint);
  await expect(progress(page).getByText("Graduated", { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(progress(page).getByRole("link", { name: "Raydium pool" })).toBeVisible();
  await expect(page.getByLabel("You pay")).toBeVisible();
  await expect(panel(page)).toContainText("This coin trades in its Raydium pool now.");

  // A buy now goes through the pool, with the pool's fees.
  await page.getByLabel("You pay").fill("0.1");
  const quote = page.locator("dl").filter({ hasText: "You get about" });
  await expect(quote).toContainText("Raydium pool fee 0.25%");
  await expect(quote).toContainText("Platform fee 0.25%");
  await expect(quote).not.toContainText("Creator fee");
  await expect(page.getByText(/takes the last coins on the curve/)).toBeHidden();
  const before = await coinBalance(wallet.keypair, mint);
  const requests = wallet.requests.length;
  await tradeOnPage(page, "buy", "0.1", /^Bought [\d,]+ SUMT\. View transaction$/);
  expect(wallet.requests).toHaveLength(requests + 1);
  expect(invokes(wallet.requests.at(-1)!)).toContain(CPMM);
  expect(invokes(wallet.requests.at(-1)!)).not.toContain(LAUNCHLAB);
  expect(await coinBalance(wallet.keypair, mint)).toBeGreaterThan(before);

  // A sell pays the pool's fee in the coins sold and the platform fee in SOL.
  await page.getByRole("group", { name: "Buy or sell" }).getByRole("button", { name: "Sell" }).click();
  await page.getByRole("button", { name: "50%", exact: true }).click();
  await expect(page.getByText("The coins you sell go to the coin's Raydium pool.")).toBeVisible();
  await expect(quote).toContainText(/Fees[\d.,\s]+SOL \+ [\d,]+ SUMT/);
  await expect(quote).toContainText(/Raydium pool fee 0\.25%[\d,\s]+SUMT/);
  const held = await coinBalance(wallet.keypair, mint);
  await page.getByRole("button", { name: "Review sell" }).click();
  await review(page).getByRole("button", { name: "Sign and sell" }).click();
  await expect(page.getByRole("status")).toHaveText(/^Sold [\d,]+ SUMT\. View transaction$/);
  expect(invokes(wallet.requests.at(-1)!)).toContain(CPMM);
  expect(await coinBalance(wallet.keypair, mint)).toBe(held - held / 2n);

  // The history keeps the curve trades and marks where the pool's begin.
  const history = page.getByRole("region", { name: "Trades" }).locator("tbody tr");
  await expect(history).toHaveCount(4);
  await expect(history.nth(2)).toHaveText("Graduated to its Raydium pool");
  await expect(history.nth(0)).toContainText("Sell");
  await expect(history.nth(1)).toContainText("Buy");
  await expect(history.nth(3)).toContainText("Buy");

  // The board shows it graduated too.
  await page.goto("/");
  const card = page.getByRole("link", { name: /Summit Push/ });
  await expect(card).toContainText("Graduated");
  const [launch] = (await listLaunches()).filter((l) => l.mint === mint);
  expect(launch?.curve.status).toBe("graduated");
});

test("a trader can sell out of a graduated coin they bought on the curve", async ({ page, wallet }) => {
  // The wallet buys on the curve, then someone else buys it out and Raydium migrates it.
  const creator = await fundedKeypair();
  const mint = await launchViaApi(creator, { name: "Early Bird", symbol: "EARLY" });
  await page.goto(`/coin/${mint}`);
  await connectWallet(page);
  await page.getByLabel("You pay").fill("0.2");
  await page.getByRole("button", { name: "Review buy" }).click();
  await acceptDisclaimer(page);
  await review(page).getByRole("button", { name: "Sign and buy" }).click();
  await expect(page.getByRole("status")).toHaveText(/^Bought [\d,]+ EARLY\. View transaction$/);

  const whale = await fundedKeypair(5);
  await tradeViaApi(whale, mint, "buy", 2_000_000_000n);
  await graduate(mint);
  await expect(progress(page).getByText("Graduated", { exact: true })).toBeVisible({ timeout: 20_000 });

  await tradeOnPage(page, "sell", "All", /^Sold [\d,]+ EARLY\. View transaction$/);
  expect(invokes(wallet.requests.at(-1)!)).toContain(CPMM);
  expect(await coinBalance(wallet.keypair, mint)).toBe(0n);
});
