// Copy Protection (#120, ADR 0012) as a Creator meets it: the launch form's copy check says a launched coin's ticker is
// taken, and the coin's page says until when; the test stack's window is 45 seconds.
import { coinImage, expect, fundedKeypair, launchViaApi, test } from "./fixtures";
import { connectWallet } from "./launchPage";

test("the launch form's copy check names the protected coin, and the coin page says until when", async ({ page, wallet }) => {
  // The form and the wallet come first: the stack's window is 45 seconds, and a cold `next dev` compile would eat it.
  await page.goto("/launch");
  await connectWallet(page);
  const card = page.getByRole("region", { name: "Copy check" });
  await expect(card.getByRole("listitem")).toHaveText([/Name.*Type one to check it/, /Ticker.*Type one to check it/, /Image.*Add one to check it/]);
  await expect(card).toContainText("A launched coin's name, ticker and image are its own for a while");
  const creator = await fundedKeypair();
  const mint = await launchViaApi(creator, { name: "Ember Guild", symbol: "EMBER", description: "The original." });

  // The same ticker in leetspeak, the name with a claim word, and the launched picture itself: all taken, by name.
  await page.getByLabel("Ticker").fill("3MBER");
  await page.getByLabel("Name").fill("Official Ember Guild");
  await page.locator('input[type="file"]').setInputFiles({ name: "copy.png", mimeType: "image/png", buffer: coinImage("EMBER") });
  await expect(card.getByRole("listitem").nth(1)).toContainText("Taken by Ember Guild (EMBER) until");
  await expect(card.getByRole("listitem").nth(0)).toContainText("Taken by Ember Guild (EMBER) until");
  await expect(card.getByRole("listitem").nth(2)).toContainText("A copy of EMBER's image, protected until");
  await expect(card).toContainText("nobody else can use your coin's name, ticker or image here for 45 seconds");
  // One letter more on a ticker of five or more is a near copy (four-letter tickers have too many neighbours); a different coin is free.
  await page.getByLabel("Ticker").fill("EMBERS");
  await expect(card.getByRole("listitem").nth(1)).toContainText("Too close to EMBER (Ember Guild)");
  await page.getByLabel("Ticker").fill("FORGE");
  await page.getByLabel("Name").fill("Forge Hand");
  await page.locator('input[type="file"]').setInputFiles({ name: "forge.png", mimeType: "image/png", buffer: coinImage("FORGE") });
  await expect(card.getByRole("listitem")).toHaveText([/Name.*Free/, /Ticker.*Free/, /Image.*Not a copy of a protected coin's/]);

  // The wallet connected is not the Creator, so the ticker stays taken for it; the coin page says for how long.
  expect(wallet.keypair.publicKey.equals(creator.publicKey)).toBe(false);
  await page.goto(`/coin/${mint}`);
  // A `dt` has no accessible name (the term role takes none from its content), so it is found by its text.
  const facts = page.locator("dt", { hasText: "Copy protection until" }).locator("xpath=following-sibling::dd[1]");
  await expect(facts).toContainText("Until then nobody else can launch a coin here with this name, ticker or image.");
  await expect(facts.locator("time")).toHaveAttribute("dateTime", /^\d{4}-/);
});
