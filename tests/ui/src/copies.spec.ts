// Copy Protection (#120, ADR 0012) as a Creator meets it: the launch form's copy check says a launched coin's ticker is
// taken, and the coin's page says until when; the test stack's window is 45 seconds.
import { coinImage, expect, fundedKeypair, launchViaApi, test } from "./fixtures";
import { connectWallet } from "./launchPage";

test("the launch form's copy check names the protected coin, and the coin page says until when", async ({ page, wallet }) => {
  // The form and the wallet come first: the stack's window is 45 seconds, and a cold `next dev` compile would eat it.
  await page.goto("/launch");
  await connectWallet(page);
  // Before anything is typed there is no verdict anywhere (phase 5, #136: inline verdicts, no box of empty rows).
  const coin = page.getByRole("region", { name: "Your coin" });
  const verdict = (field: "name" | "symbol" | "image") => coin.locator(`[data-field="${field}"]`);
  await expect(coin.locator("[data-field]")).toHaveCount(0);
  const creator = await fundedKeypair();
  const mint = await launchViaApi(creator, { name: "Ember Guild", symbol: "EMBER", description: "The original." });

  // The same ticker in leetspeak, the name with a claim word, and the launched picture itself: all taken, by name.
  await page.getByLabel("Ticker").fill("3MBER");
  await page.getByLabel("Name").fill("Official Ember Guild");
  await page.locator('input[type="file"]').setInputFiles({ name: "copy.png", mimeType: "image/png", buffer: coinImage("EMBER") });
  await expect(verdict("symbol")).toContainText("Taken by Ember Guild (EMBER) until");
  await expect(verdict("name")).toContainText("Taken by Ember Guild (EMBER) until");
  await expect(verdict("image")).toContainText("A copy of EMBER's image, protected until");
  // One letter more on a ticker of five or more is a near copy (four-letter tickers have too many neighbours); a different coin is free.
  await page.getByLabel("Ticker").fill("EMBERS");
  await expect(verdict("symbol")).toContainText("Too close to EMBER (Ember Guild)");
  await page.getByLabel("Ticker").fill("FORGE");
  await page.getByLabel("Name").fill("Forge Hand");
  await page.locator('input[type="file"]').setInputFiles({ name: "forge.png", mimeType: "image/png", buffer: coinImage("FORGE") });
  await expect(verdict("name")).toHaveText("Free");
  await expect(verdict("symbol")).toHaveText("Free");
  await expect(verdict("image")).toHaveText("Not a protected coin's image");

  // The wallet connected is not the Creator, so the ticker stays taken for it; the coin page says for how long.
  expect(wallet.keypair.publicKey.equals(creator.publicKey)).toBe(false);
  await page.goto(`/coin/${mint}`);
  // A `dt` has no accessible name (the term role takes none from its content), so it is found by its text.
  const facts = page.locator("dt", { hasText: "Copy protection" }).locator("xpath=following-sibling::dd[1]");
  await expect(facts).toContainText("45 seconds from launch");
  await expect(facts).toContainText("nobody else can launch a coin here with this name, ticker or image.");
  await expect(facts.locator("time")).toHaveAttribute("dateTime", /^\d{4}-/);
});
