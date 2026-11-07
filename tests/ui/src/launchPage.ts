// What a Creator does on the launch page, shared by every spec that launches through the web app.
import type { Page } from "@playwright/test";
import { COIN_PNG, coinImage, expect } from "./fixtures";
import { connectTestWallet } from "./wallet";

export const COIN = {
  name: "Tracer Bullet",
  symbol: "TRCR",
  description: "The first coin through the whole system: form, API, wallet, chain, indexer, board.",
  website: "https://example.com/tracer",
  x: "https://x.com/tracer",
  telegram: "https://t.me/tracer",
  discord: "https://discord.gg/tracer",
};
const MORE_LINK_LABELS = { discord: "Discord", tiktok: "TikTok", instagram: "Instagram", youtube: "YouTube" } as const;

export async function connectWallet(page: Page) {
  await connectTestWallet(page, page.getByRole("main").getByRole("button", { name: "Connect wallet" }));
  await expect(signButton(page)).toBeVisible();
}

/** Fills the links, by role: the header's and footer's "Stoker on X" and "Stoker on Telegram" links share the words. */
async function fillLinks(page: Page, coin: Partial<typeof COIN> & Partial<Record<keyof typeof MORE_LINK_LABELS, string>>) {
  const more = (Object.keys(MORE_LINK_LABELS) as (keyof typeof MORE_LINK_LABELS)[]).filter((k) => coin[k]);
  if (!coin.website && !coin.x && !coin.telegram && more.length === 0) return;
  if (coin.telegram) await page.getByRole("textbox", { name: "Telegram" }).fill(coin.telegram);
  if (coin.x) await page.getByRole("textbox", { name: /^X\b/ }).fill(coin.x);
  if (coin.website) await page.getByLabel("Website").fill(coin.website);
  if (more.length > 0) {
    // The other four wait behind one button.
    await page.getByRole("button", { name: /^More links/ }).click();
    for (const k of more) await page.getByRole("textbox", { name: MORE_LINK_LABELS[k] }).fill(coin[k]!);
  }
}

export async function fillForm(page: Page, coin: Partial<typeof COIN> = COIN) {
  // The tracer keeps the fixture's picture; every other coin gets one of its own, since Copy Protection refuses a second
  // coin with a launched coin's image for the stack's window.
  const symbol = coin.symbol ?? COIN.symbol;
  const buffer = symbol === COIN.symbol ? COIN_PNG : coinImage(symbol);
  await page.locator('input[type="file"]').setInputFiles({ name: "coin.png", mimeType: "image/png", buffer });
  await page.getByLabel("Name").fill(coin.name ?? COIN.name);
  await page.getByLabel("Ticker").fill(coin.symbol ?? COIN.symbol);
  if (coin.description) await page.getByLabel("Description").fill(coin.description);
  await fillLinks(page, coin);
}

/** Sets the launch options: a First Buy in SOL, and an Airdrop list as the Creator would type it. */
export async function fillOptions(page: Page, o: { firstBuy?: string; airdrop?: string }) {
  if (o.firstBuy !== undefined) await firstBuyField(page).fill(o.firstBuy);
  if (o.airdrop !== undefined) {
    await page.getByRole("checkbox", { name: "Airdrop part of your first buy to other wallets" }).check();
    await page.getByLabel("Wallets and amounts").fill(o.airdrop);
  }
}

/** Opens the full picker from the "Any other asset" field, which names the asset chosen from it once there is one. */
export async function openPicker(page: Page) {
  await page.getByRole("button", { name: /Choose another Quote Asset/ }).click();
  await expect(page.getByRole("dialog", { name: "Pair with" })).toBeVisible();
}

/**
 * Picks a Quote Asset on the form: opens the picker, searches its ticker and checks its card (a radio named by the
 * card's whole text, which starts with the ticker), which closes the picker.
 */
export async function chooseQuote(page: Page, ticker: string) {
  await openPicker(page);
  await page.getByRole("searchbox", { name: "Search Quote Assets" }).fill(ticker);
  await page.getByRole("radiogroup", { name: "Pair with" }).getByRole("radio", { name: new RegExp(`^${ticker}\\b`) }).check();
  await expect(page.getByRole("dialog", { name: "Pair with" })).toBeHidden();
}

/** The recommended three, as rows under the section's heading. */
export const pairRows = (page: Page) => page.getByRole("radiogroup", { name: "Paired with" });

/** The asset the form has chosen: checked among the recommended three, or named by the "Any other asset" field when it came from the picker. */
export async function expectChosen(page: Page, ticker: string) {
  const recommended = pairRows(page).getByRole("radio", { name: new RegExp(`^${ticker}\\b`) });
  if ((await recommended.count()) > 0) await expect(recommended).toBeChecked();
  else await expect(page.getByRole("button", { name: `${ticker} chosen. Choose another Quote Asset` })).toBeVisible();
}

export const firstBuyField = (page: Page) => page.getByRole("textbox", { name: "First buy" });
export const summary = (page: Page) => page.getByRole("complementary", { name: "Launch summary" });
/** The one action (#172): "Stoke TRCR" prepares, simulates and asks the wallet to sign. */
export const signButton = (page: Page) => summary(page).getByRole("button", { name: /^Stoke / });
/** The signing panel while the wallet asks, with what the wallet pays from the simulation. */
export const signing = (page: Page) => summary(page).getByRole("status").filter({ hasText: "Confirm in" });

/** The simulated cost in SOL the signing panel shows. */
export async function signingCost(page: Page) {
  const text = await signing(page).locator("dd.mono").first().textContent();
  return Number(text?.replace(" SOL", ""));
}

export const disclaimer = (page: Page) => page.getByRole("dialog", { name: "Before you launch" });
export const formAlert = (page: Page) => page.getByRole("main").getByRole("alert");
export const notConfirmed = (page: Page) => page.getByRole("region", { name: "Launch not confirmed" });

export async function acceptDisclaimer(page: Page) {
  const dialog = disclaimer(page);
  await expect(dialog).toBeVisible();
  const cont = dialog.getByRole("button", { name: "Continue" });
  await expect(cont).toBeDisabled();
  await dialog.getByRole("checkbox").check();
  await cont.click();
}
