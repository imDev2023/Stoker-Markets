// Asset Pairing in the web app: choosing a Quote Asset, launching against it at the exact Graduation Target, being refused
// one without a price, and trading a coin paired with something other than SOL.
import type { Page } from "@playwright/test";
import { PreparedLaunch } from "@launchpad/contract";
import { COIN_PNG, QUOTES, expect, fundQuote, fundedKeypair, launchViaApi, listLaunches, test } from "./fixtures";
import { connectTestWallet } from "./wallet";

const picker = (page: Page) => page.getByRole("button", { name: /^Pair with/ });
const options = (page: Page) => page.getByRole("listbox", { name: "Quote Assets" }).getByRole("option");
const search = (page: Page) => page.getByRole("combobox", { name: "Search Quote Assets" });
const terms = (page: Page) => page.getByRole("definition").filter({ hasText: "raised" });
const review = (page: Page) => page.getByRole("region", { name: "Review your launch" });

async function connectWallet(page: Page) {
  await connectTestWallet(page, page.getByRole("main").getByRole("button", { name: "Connect wallet" }));
}

async function fillCoin(page: Page, name: string, symbol: string) {
  await page.locator('input[type="file"]').setInputFiles({ name: "coin.png", mimeType: "image/png", buffer: COIN_PNG });
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Ticker").fill(symbol);
}

async function choose(page: Page, query: string, ticker: string) {
  await picker(page).click();
  await search(page).fill(query);
  await options(page).filter({ hasText: ticker }).click();
  await expect(picker(page)).toHaveAccessibleName(new RegExp(`^Pair with ${ticker}\\b`));
}

async function acceptDisclaimer(page: Page, action: "launch" | "trade") {
  const dialog = page.getByRole("dialog", { name: `Before you ${action}` });
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Continue" }).click();
}

test("the Quote Asset picker finds assets by ticker, name or mint, and shows unpriced ones without letting them be chosen", async ({ page }) => {
  await page.goto("/launch");
  await expect(picker(page)).toHaveAccessibleName("Pair with SOL Solana");
  await expect(terms(page)).toHaveText("1 SOL raised, then moves to Raydium");

  // SOL first, then what can be launched against, then the rest, each with what it must raise.
  await picker(page).click();
  await expect(search(page)).toBeFocused();
  await expect(options(page)).toHaveCount(6);
  await expect(options(page).first()).toContainText("SOL");
  await expect(options(page).filter({ hasText: "USDC" })).toContainText("150 USDC");
  await expect(options(page).filter({ hasText: "JTO" })).toContainText("60 JTO");
  // The Token-2022 quote with a 1% transfer fee is launchable like any other, at 150 USD of it (1 USD each).
  const taxq = options(page).filter({ hasText: "TAXQ" });
  await expect(taxq).not.toHaveAttribute("aria-disabled", "true");
  await expect(taxq).toContainText("150 TAXQ");
  const bullwhale = options(page).filter({ hasText: "BULLWHALE" });
  await expect(bullwhale).toHaveAttribute("aria-disabled", "true");
  await expect(bullwhale).toContainText("No reliable price for BULLWHALE yet, so its Graduation Target can't be set.");
  await expect(options(page).last()).toContainText("BULLWHALE");

  // By name, by the start of a mint address, and by ticker.
  await search(page).fill("nvidia");
  await expect(options(page)).toHaveCount(1);
  await expect(options(page)).toContainText("NVDAx");
  await search(page).fill(QUOTES.USDC.toBase58().slice(0, 6));
  await expect(options(page)).toHaveCount(1);
  await expect(options(page)).toContainText("USDC");
  await search(page).fill("zzzz");
  await expect(page.getByText("No Quote Asset matches “zzzz”.")).toBeVisible();

  // An unpriced asset stays unselected, by click or by keyboard.
  await search(page).fill("bull");
  // Playwright won't click an aria-disabled option unless forced; a person can.
  await options(page).click({ force: true });
  await search(page).press("Enter");
  await expect(search(page)).toBeVisible();
  await search(page).press("Escape");
  await expect(search(page)).toBeHidden();
  await expect(picker(page)).toBeFocused();
  await expect(picker(page)).toHaveAccessibleName("Pair with SOL Solana");

  // Keyboard choice: the list opens on the current choice and Enter takes the highlighted one.
  await picker(page).press("Enter");
  await search(page).fill("usd");
  await search(page).press("Enter");
  await expect(picker(page)).toHaveAccessibleName("Pair with USDC USD Coin");
  await expect(terms(page)).toHaveText(
    "150 USDC raised, worth 1 SOL today, then moves to RaydiumThe amount is fixed from USDC's price when you launch.",
  );
  await expect(page.getByRole("complementary", { name: "Preview" })).toContainText("TICKER paired with USDC");
});

test("a Creator launches a coin paired with a tokenized stock at the exact Graduation Target the transaction fixes", async ({ page, wallet }) => {
  await page.goto("/launch");
  await connectWallet(page);
  await fillCoin(page, "Chip Stock Pair", "CHIP");
  await choose(page, "NVDAx", "NVDAx");
  await expect(terms(page)).toContainText("0.8333 NVDAx raised, worth 1 SOL today");

  const prepared = page.waitForResponse((r) => r.url().endsWith("/v1/launches/prepare"));
  await page.getByRole("button", { name: "Review launch" }).click();
  await acceptDisclaimer(page, "launch");
  const target = PreparedLaunch.parse(await (await prepared).json()).graduationTarget;
  // 1 SOL at 150 USD is 150 USD of NVDAx at 180 USD: 0.83333333 at 8 decimals, shown to the last raw unit.
  expect(target.raw).toBe("83333333");
  await expect(review(page)).toContainText("Launching CHIP paired with NVDAx. It graduates at 0.83333333 NVDAx raised.");
  expect(wallet.requests).toHaveLength(0);

  await review(page).getByRole("button", { name: "Sign and launch" }).click();
  await page.waitForURL(/\/coin\/[1-9A-HJ-NP-Za-km-z]{32,44}$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/CHIP paired with NVDAx/);
  await expect(page.getByText("0 of 0.8333 NVDAx raised")).toBeVisible();
  const launch = (await listLaunches()).find((l) => l.mint === page.url().split("/").pop());
  expect(launch).toMatchObject({ graduationTarget: "83333333", quote: { symbol: "NVDAx", decimals: 8 } });
});

test("a Quote Asset that lost its price by launch time is refused with the reason, and nothing is signed", async ({ page, wallet, expectedHttpErrors }) => {
  expectedHttpErrors.push(/\/v1\/launches\/prepare$/);
  const before = await listLaunches();
  await page.goto("/launch");
  await connectWallet(page);
  await fillCoin(page, "Too Late", "LATE");
  await choose(page, "USDC", "USDC");
  // The page was loaded while the asset had a price; by the time the Creator launches, the API has none for it.
  await page.route("**/v1/launches/prepare", async (route) => {
    const body = route.request().postDataBuffer()!.toString("latin1");
    await route.continue({ postData: Buffer.from(body.replace(QUOTES.USDC.toBase58(), QUOTES.BULLWHALE.toBase58()), "latin1") });
  });
  const refused = page.waitForResponse((r) => r.url().endsWith("/v1/launches/prepare"));
  await page.getByRole("button", { name: "Review launch" }).click();
  await acceptDisclaimer(page, "launch");
  expect((await refused).status()).toBe(422);

  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "No reliable price for BULLWHALE yet, so its Graduation Target can't be set.",
  );
  await expect(review(page)).toBeHidden();
  await expect(page.getByRole("button", { name: "Review launch" })).toBeEnabled();
  expect(wallet.requests).toHaveLength(0);
  expect(await listLaunches()).toHaveLength(before.length);
});

test("a trader buys and sells a USDC-paired coin in USDC", async ({ page, wallet }) => {
  const mint = await launchViaApi(await fundedKeypair(), { name: "Dollar Pair", symbol: "DLRP", quote: "USDC" });
  await fundQuote(wallet.keypair.publicKey, "USDC", 50_000_000n);
  await page.goto(`/coin/${mint}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/DLRP paired with USDC/);
  await expect(page.getByText("0 of 150 USDC raised")).toBeVisible();
  await connectTestWallet(page, page.getByRole("main").getByRole("button", { name: "Connect wallet" }));

  // Buying spends the wallet's USDC; the presets are worth about 0.1, 0.5 and 1 SOL.
  const panel = page.getByRole("region", { name: "Trade DLRP" });
  await expect(panel.getByText("Balance 50 USDC")).toBeVisible();
  await expect(panel.getByText("Paid in USDC, fees included.")).toBeVisible();
  for (const preset of ["15 USDC", "75 USDC", "150 USDC"]) await expect(panel.getByRole("button", { name: preset })).toBeVisible();
  await panel.getByRole("button", { name: "15 USDC" }).click();
  // 1.25% of 15 USDC: 0.0375 to Raydium and 0.15 as the Platform Fee.
  await expect(panel.getByRole("definition").filter({ hasText: /^0\.1875 USDC$/ })).toBeVisible();
  await panel.getByRole("button", { name: "Review buy" }).click();
  await acceptDisclaimer(page, "trade");
  const buyReview = panel.getByRole("region", { name: "Review your trade" });
  await expect(buyReview).toContainText(/^Your wallet pays 15 USDC and 0\.\d+ SOL in network fees and any account rent\./);
  expect(wallet.requests).toHaveLength(0);
  await buyReview.getByRole("button", { name: "Sign and buy" }).click();
  await expect(panel.getByRole("status")).toHaveText(/^Bought [\d,]+ DLRP\. View transaction$/);
  await expect(panel.getByText("Balance 35 USDC")).toBeVisible();
  // Fees stay out of what the curve raised.
  await expect(page.getByText("14.8125 of 150 USDC raised")).toBeVisible();
  const history = page.getByRole("region", { name: "Trades" }).getByRole("table");
  await expect(history.getByRole("columnheader", { name: "USDC" })).toBeVisible();
  await expect(history.getByRole("row").nth(1).getByRole("cell").nth(2)).toHaveText("15");

  // Selling pays out USDC.
  await panel.getByRole("button", { name: "Sell", exact: true }).click();
  await panel.getByRole("button", { name: "All" }).click();
  await expect(panel.getByText(/^You get about/)).toBeVisible();
  await panel.getByRole("button", { name: "Review sell" }).click();
  const sellReview = panel.getByRole("region", { name: "Review your trade" });
  await expect(sellReview).toContainText(/^Your wallet receives about 14\.\d+ USDC and pays 0\.\d+ SOL in network fees and any account rent\./);
  await sellReview.getByRole("button", { name: "Sign and sell" }).click();
  await expect(panel.getByRole("status")).toHaveText(/^Sold [\d,]+ DLRP\. View transaction$/);
  await expect(history.getByRole("row")).toHaveCount(3);
  await expect(history.getByRole("row").nth(1).getByRole("cell").nth(0)).toHaveText("Sell");
  expect(wallet.requests).toHaveLength(2);
  // A round trip costs the 1.25% fees each way, in USDC; the network fees were paid in SOL.
  await panel.getByRole("button", { name: "Buy", exact: true }).click();
  await expect(panel.getByText(/^Balance 49\.6\d* USDC$/)).toBeVisible();
});
