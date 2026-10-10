// What a Creator does on the launch page, shared by every spec that launches through the web app.
import type { Page } from "@playwright/test";
import { COIN_PNG, expect } from "./fixtures";
import { connectTestWallet } from "./wallet";

export const COIN = {
  name: "Tracer Bullet",
  symbol: "TRCR",
  description: "The first coin through the whole system: form, API, wallet, chain, indexer, board.",
  website: "https://example.com/tracer",
  x: "https://x.com/tracer",
  telegram: "https://t.me/tracer",
};

export async function connectWallet(page: Page) {
  await connectTestWallet(page, page.getByRole("main").getByRole("button", { name: "Connect wallet" }));
  await expect(page.getByRole("button", { name: "Review launch" })).toBeVisible();
}

export async function fillForm(page: Page, coin: Partial<typeof COIN> = COIN) {
  await page.locator('input[type="file"]').setInputFiles({ name: "coin.png", mimeType: "image/png", buffer: COIN_PNG });
  await page.getByLabel("Name").fill(coin.name ?? COIN.name);
  await page.getByLabel("Ticker").fill(coin.symbol ?? COIN.symbol);
  if (coin.description) await page.getByLabel("Description").fill(coin.description);
  if (coin.website) await page.getByLabel("Website").fill(coin.website);
  // The social fields by role: the header's and footer's "Stoker on X" and "Stoker on Telegram" links share the words.
  if (coin.x) await page.getByRole("textbox", { name: /^X\b/ }).fill(coin.x);
  if (coin.telegram) await page.getByRole("textbox", { name: "Telegram" }).fill(coin.telegram);
}

/** Sets the launch options: a First Buy in SOL, and an Airdrop list as the Creator would type it. */
export async function fillOptions(page: Page, o: { firstBuy?: string; airdrop?: string }) {
  if (o.firstBuy !== undefined) await page.getByLabel(/^First buy/).fill(o.firstBuy);
  if (o.airdrop !== undefined) {
    await page.getByRole("checkbox", { name: "Airdrop part of your first buy to other wallets" }).check();
    await page.getByLabel("Wallets and amounts").fill(o.airdrop);
  }
}

/**
 * Picks a Quote Asset on the form: searches its ticker, checks its card (a radio named by the card's whole text, which
 * starts with the ticker), then clears the search so every card is back in view.
 */
export async function chooseQuote(page: Page, ticker: string) {
  const search = page.getByRole("searchbox", { name: "Search Quote Assets" });
  await search.fill(ticker);
  await page.getByRole("radiogroup", { name: "Pair with" }).getByRole("radio", { name: new RegExp(`^${ticker}\\b`) }).check();
  await search.fill("");
}

export const disclaimer = (page: Page) => page.getByRole("dialog", { name: "Before you launch" });
export const formAlert = (page: Page) => page.getByRole("main").getByRole("alert");
export const review = (page: Page) => page.getByRole("region", { name: "Review your launch" });
export const notConfirmed = (page: Page) => page.getByRole("region", { name: "Launch not confirmed" });

export async function acceptDisclaimer(page: Page) {
  const dialog = disclaimer(page);
  await expect(dialog).toBeVisible();
  const cont = dialog.getByRole("button", { name: "Continue" });
  await expect(cont).toBeDisabled();
  await dialog.getByRole("checkbox").check();
  await cont.click();
}
