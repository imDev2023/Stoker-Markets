// The coin page's trust figures (#41, ADR 0013): the "Before you buy" card under the trade panel, the Sniper mark in the
// holders, and the places the coin can be looked up elsewhere. The UI stack's Snipe Window is 100,000 slots, so every
// buy a test makes after a launch is a snipe.
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { expect, fundedKeypair, launchViaApi, test, tradeViaApi } from "./fixtures";

test("the coin page says what the Creator holds and did, who sniped, what the top wallets hold, and where else to look", async ({ page }) => {
  const creator = await fundedKeypair(5);
  const mint = await launchViaApi(creator, { name: "Trust Check", symbol: "TRST", firstBuy: String(0.02 * LAMPORTS_PER_SOL) });
  const card = page.getByRole("region", { name: "Before you buy" });

  await page.goto(`/coin/${mint}`);
  await expect(card.getByText(/^Holds [\d.<]+% of the supply\.$/)).toBeVisible();
  await expect(card.getByText(/^First Buy at launch: [\d.<]+%\. Their first coin here\.$/)).toBeVisible();
  await expect(card.getByText("None.", { exact: true })).toBeVisible();
  await expect(card.getByText(/^Nobody but the Creator bought in the launch's first 100,000 slots \(about 11 hours\)\.$/)).toBeVisible();
  await expect(card.getByText(/^Hold [\d.<]+% of the supply\.$/)).toBeVisible();

  // Two wallets buy the same amount right after the launch: snipers, and each other's bundle mates by the amount.
  const a = await fundedKeypair(2);
  const b = await fundedKeypair(2);
  await tradeViaApi(a, mint, "buy", BigInt(0.05 * LAMPORTS_PER_SOL));
  await tradeViaApi(b, mint, "buy", BigInt(0.05 * LAMPORTS_PER_SOL));
  await page.reload();
  await expect(card.getByText(/^2 wallets bought [\d.<]+% in the launch's first 100,000 slots \(about 11 hours\) and hold [\d.<]+% now, by their trades here\.$/)).toBeVisible();
  await expect(card.getByText("2 paid the same amount, as one bundle's wallets do.")).toBeVisible();

  // The holders list marks them.
  await page.getByRole("tab", { name: "Top holders" }).click();
  const holders = page.getByRole("region", { name: "Top holders" });
  await expect(holders.getByText("Sniper", { exact: true })).toHaveCount(2);
  for (const w of [a, b]) {
    const address = w.publicKey.toBase58();
    await expect(holders.getByRole("listitem").filter({ hasText: `${address.slice(0, 4)}…${address.slice(-4)}` })).toContainText("Sniper");
  }

  // Where else the coin can be looked up: the explorer on this cluster, and the aggregators.
  const article = page.getByRole("article");
  await expect(article.getByRole("link", { name: "Explorer" })).toHaveAttribute("href", new RegExp(`^https://explorer\\.solana\\.com/address/${mint}`));
  await expect(article.getByRole("link", { name: "DEX Screener" })).toHaveAttribute("href", `https://dexscreener.com/solana/${mint}`);
  await expect(article.getByRole("link", { name: "Jupiter" })).toHaveAttribute("href", new RegExp(`^https://jup\\.ag/swap/[1-9A-HJ-NP-Za-km-z]+-${mint}$`));
});
