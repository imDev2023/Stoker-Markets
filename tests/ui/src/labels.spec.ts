// Quote Risk Labels in the web app (#11): chips in the Quote Asset picker, the full list on the launch form, and a section
// on the coin page of every Launch paired with something other than SOL. Labels inform; none stops a launch or a trade.
import type { Page } from "@playwright/test";
import { expect, fundedKeypair, launchViaApi, test } from "./fixtures";
import { connectWallet } from "./launchPage";

const picker = (page: Page) => page.getByRole("button", { name: /^Pair with/ });
const options = (page: Page) => page.getByRole("listbox", { name: "Quote Assets" }).getByRole("option");
const search = (page: Page) => page.getByRole("combobox", { name: "Search Quote Assets" });
const chips = (page: Page, ticker: string) => options(page).filter({ hasText: ticker }).getByLabel("Quote Risk Labels");

test("the picker shows each Quote Asset's labels, and the launch form lists them without stopping a launch", async ({ page, wallet }) => {
  await page.goto("/launch");
  await picker(page).click();
  await expect(options(page)).toHaveCount(6);

  // A tokenized stock carries its issuer's controls; three fit the row and the rest are counted, all of them in the tooltip.
  const stock = chips(page, "NVDAx");
  await expect(stock).toHaveText("Can freeze walletsIssuer can move tokensCan pause transfers+3");
  await expect(stock).toHaveAttribute("title", /Can freeze wallets · Issuer can move tokens · Can pause transfers · Can add a transfer hook · Can freeze new wallets by default · Scaled balances/);
  // A stablecoin's issuer can freeze; a plain SPL token with no authorities and on the verified list has nothing to flag.
  await expect(chips(page, "USDC")).toHaveText("Can freeze wallets");
  await expect(chips(page, "JTO")).toHaveCount(0);
  await expect(chips(page, "SOL")).toHaveCount(0);
  // An unpriced pump.fun coin: not verified, no liquidity known; the taxed quote: its fee, and thin liquidity.
  await expect(chips(page, "BULLWHALE")).toHaveText("Not on the verified listUnknown liquidity");
  await expect(chips(page, "TAXQ")).toHaveText("Not on the verified listLow liquidity1% transfer fee");

  // Choosing a labelled asset is like choosing any other, and the form then lists every label with its source.
  await search(page).fill("nvdax");
  await options(page).click();
  await expect(picker(page)).toHaveAccessibleName(/^Pair with NVDAx\b/);
  const details = page.locator("details").filter({ hasText: "NVDAx has 6 risk labels. They inform; none stops a launch." });
  await expect(details).toBeVisible();
  await details.locator("summary").click();
  const list = page.getByRole("list", { name: "NVDAx risk labels" });
  await expect(list.getByRole("listitem")).toHaveCount(6);
  await expect(list.getByRole("listitem").first()).toContainText("Can freeze wallets");
  await expect(list.getByRole("listitem").first()).toContainText("The issuer (JDq1…xJNs) can freeze any wallet's NVDAx");
  await expect(list.getByRole("listitem").first()).toContainText("Read from the mint on-chain");
  await expect(list.getByRole("listitem").last()).toContainText("Scaled balances");

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

  const plain = await launchViaApi(creator, { name: "Plain Pair", symbol: "PLN" });
  await page.goto(`/coin/${plain}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/PLN paired with SOL/);
  await expect(page.getByRole("region", { name: /^Paired with/ })).toHaveCount(0);
});
