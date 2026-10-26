// Copy Protection (#120, ADR 0012) as a Creator meets it: the launch form's copy check says a launched coin's ticker is
// taken, and the coin's page says until when; the test stack's window is 45 seconds.
import { coinImage, expect, fundedKeypair, launchViaApi, test } from "./fixtures";
import { connectWallet } from "./launchPage";

test("the launch form's copy check names the protected coin, and the coin page says until when", async ({ page, wallet }) => {
  const creator = await fundedKeypair();
  const mint = await launchViaApi(creator, { name: "Kiln Keeper", symbol: "KILN", description: "The original." });

  await page.goto("/launch");
  await connectWallet(page);
  const card = page.getByRole("region", { name: "Copy check" });
  await expect(card.getByRole("listitem")).toHaveText([/Name.*Type one to check it/, /Ticker.*Type one to check it/, /Image.*Add one to check it/]);
  await expect(card).toContainText("nobody else can use your coin's name, ticker or image here for");

  // The same ticker in leetspeak, the name with a claim word, and the launched picture itself: all taken, by name.
  await page.getByLabel("Ticker").fill("K1LN");
  await page.getByLabel("Name").fill("Official Kiln Keeper");
  await page.locator('input[type="file"]').setInputFiles({ name: "copy.png", mimeType: "image/png", buffer: coinImage("KILN") });
  await expect(card.getByRole("listitem").nth(1)).toContainText("Taken by Kiln Keeper (KILN) until");
  await expect(card.getByRole("listitem").nth(0)).toContainText("Taken by Kiln Keeper (KILN) until");
  await expect(card.getByRole("listitem").nth(2)).toContainText("A copy of KILN's image, protected until");
  // One letter more on a long enough ticker is a near copy; a different coin is free.
  await page.getByLabel("Ticker").fill("KILNS");
  await expect(card.getByRole("listitem").nth(1)).toContainText("Too close to KILN (Kiln Keeper)");
  await page.getByLabel("Ticker").fill("FORGE");
  await page.getByLabel("Name").fill("Forge Hand");
  await page.locator('input[type="file"]').setInputFiles({ name: "forge.png", mimeType: "image/png", buffer: coinImage("FORGE") });
  await expect(card.getByRole("listitem")).toHaveText([/Name.*Free/, /Ticker.*Free/, /Image.*Not a copy of a protected coin's/]);

  // The wallet connected is not the Creator, so the ticker stays taken for it; the coin page says for how long.
  expect(wallet.keypair.publicKey.equals(creator.publicKey)).toBe(false);
  await page.goto(`/coin/${mint}`);
  const facts = page.getByRole("term", { name: "Copy protection" }).locator("xpath=following-sibling::dd[1]");
  await expect(facts).toContainText("In force");
  await expect(facts).toContainText("Nobody else can launch a coin here with this name, ticker or image until");
});
