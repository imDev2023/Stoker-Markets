// Quote Risk Labels in the web app (#11): never beside an asset's name (owner, 2026-10-10), only as further information:
// a section on the coin page of every Launch paired with something other than SOL, and the asset's own page
// (assets.spec.ts). The launch form carries none (owner, 2026-10-25: its "Further information" disclosure was removed).
// Labels inform; none stops a launch or a trade.
import type { Page } from "@playwright/test";
import { expect, fundedKeypair, launchViaApi, QUOTES, test } from "./fixtures";
import { chooseQuote, connectWallet } from "./launchPage";

const group = (page: Page) => page.getByRole("radiogroup", { name: "Pair with" });
const card = (page: Page, ticker: string) => group(page).getByRole("radio", { name: new RegExp(`^${ticker}\\b`) });

test("the chooser names each Quote Asset's kind and never a label, and choosing a labelled asset stops nothing", async ({ page, wallet }) => {
  await page.goto("/launch");
  await expect(group(page).getByRole("radio")).toHaveCount(6);

  // No warning sits beside an asset's name: each card says what kind of asset it is (ADR 0010), a fact and not a verdict,
  // in the words of the chips above the cards.
  await expect(page.getByLabel("Quote Risk Labels")).toHaveCount(0);
  await expect(page.getByText("Can freeze wallets")).toHaveCount(0);
  await expect(card(page, "NVDAx")).toHaveAccessibleName(/xStocks/);
  await expect(card(page, "USDC")).toHaveAccessibleName(/Currencies/);
  await expect(card(page, "JTO")).toHaveAccessibleName(/DeFi/);
  await expect(card(page, "BULLWHALE")).toHaveAccessibleName(/Memes/);
  await expect(card(page, "TAXQ")).toHaveAccessibleName(/Community/);

  // Choosing a labelled asset is like choosing any other: the form shows no label and no disclosure for it.
  await chooseQuote(page, "NVDAx");
  await expect(card(page, "NVDAx")).toBeChecked();
  await expect(page.locator("details")).toHaveCount(0);
  await expect(page.getByRole("list", { name: "NVDAx risk labels" })).toHaveCount(0);

  await connectWallet(page);
  await expect(page.getByRole("button", { name: "Review launch" })).toBeEnabled();
  expect(wallet.requests).toHaveLength(0);
});

test("a coin page shows what is known about its Quote Asset, and a SOL-paired coin page shows nothing of the kind", async ({ page }) => {
  const creator = await fundedKeypair();
  const taxed = await launchViaApi(creator, { name: "Taxed Pair", symbol: "TXP", quote: "TAXQ" });
  await page.goto(`/coin/${taxed}`);
  const section = page.getByRole("region", { name: "Paired with TAXQ" });
  await expect(section).toContainText("Every trade of TXP is paid in TAXQ.");
  const labels = section.getByRole("list", { name: "TAXQ risk labels" }).getByRole("listitem");
  await expect(labels).toHaveCount(3);
  await expect(labels.nth(0)).toContainText("Not on the verified list");
  await expect(labels.nth(0)).toContainText("From the local token list");
  await expect(labels.nth(1)).toContainText("Low liquidity");
  await expect(labels.nth(2)).toContainText("1% transfer fee");
  await expect(labels.nth(2)).toContainText("The issuer withholds 1% of every transfer of TAXQ");
  await expect(labels.nth(2)).toContainText("Read from the mint on-chain");
  await expect(section.getByRole("link", { name: "Everything about TAXQ" })).toHaveAttribute("href", `/assets/${QUOTES.TAXQ.toBase58()}`);

  const plain = await launchViaApi(creator, { name: "Plain Pair", symbol: "PLN" });
  await page.goto(`/coin/${plain}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/PLN paired with SOL/);
  await expect(page.getByRole("region", { name: /^Paired with/ })).toHaveCount(0);
});
