// What a trader does to find coins on the board, and to judge one by its holders, end to end against the real chain and API.
import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import type { Page } from "@playwright/test";
import { LaunchList } from "@launchpad/contract";
import { QUOTES, expect, fundQuote, fundedKeypair, launchViaApi, stackEnv, test, tradeViaApi } from "./fixtures";
import { connectTestWallet } from "./wallet";

const cards = (page: Page) => page.getByRole("list", { name: "Coins" }).getByRole("link");
const sorts = (page: Page) => page.getByRole("group", { name: "Sort coins" });
const categories = (page: Page) => page.getByRole("group", { name: "Quote Asset category" });
const quoteFilter = (page: Page) => page.getByRole("button", { name: /^Quote Asset: / });

/** The mints the API lists for a query, in order: what the board must show. */
async function expected(query: Record<string, string>) {
  const params = new URLSearchParams({ limit: "60", ...query });
  return LaunchList.parse(await (await fetch(`${stackEnv().apiUrl}/v1/launches?${params}`)).json()).launches.map((l) => `/coin/${l.mint}`);
}

async function expectBoard(page: Page, query: Record<string, string>) {
  const want = await expected(query);
  expect(want.length).toBeGreaterThan(0);
  await expect(page.getByRole("list", { name: "Coins" })).toHaveAttribute("aria-busy", "false");
  await expect.poll(async () => cards(page).evaluateAll((links) => links.map((a) => a.getAttribute("href")))).toEqual(want);
}

async function coinsHeld(owner: PublicKey, mint: string) {
  const conn = new Connection(stackEnv().rpcUrl, "confirmed");
  const accounts = await conn.getParsedTokenAccountsByOwner(owner, { mint: new PublicKey(mint) }, "confirmed");
  return accounts.value.reduce((sum, a) => sum + BigInt(a.account.data.parsed.info.tokenAmount.amount as string), 0n);
}

/** A share of the 1B supply as the holders card writes it. */
const percentOf = (raw: bigint) => {
  const pct = (Number(raw) / 1e15) * 100;
  return `${pct.toFixed(pct < 1 ? 2 : 1)}%`;
};

test("a trader sorts and filters the board, and the address keeps the choice", async ({ page }) => {
  const creator = await fundedKeypair(10);
  const trader = await fundedKeypair(10);
  const high = await launchViaApi(creator, { name: "Board High", symbol: "HIGH" });
  const low = await launchViaApi(creator, { name: "Board Low", symbol: "LOW" });
  const dollar = await launchViaApi(creator, { name: "Board Dollar", symbol: "BDLR", quote: "USDC" });
  await launchViaApi(creator, { name: "Board Stock", symbol: "BSTK", quote: "NVDAx" });
  await tradeViaApi(trader, high, "buy", BigInt(0.4 * LAMPORTS_PER_SOL));
  await tradeViaApi(trader, low, "buy", BigInt(0.05 * LAMPORTS_PER_SOL));
  await fundQuote(trader.publicKey, "USDC", 20_000_000n);
  await tradeViaApi(trader, dollar, "buy", 20_000_000n);

  await page.goto("/");
  await expect(sorts(page).getByRole("button", { name: "New", pressed: true })).toBeVisible();
  await expectBoard(page, {});

  // Each sort shows the coins in the API's order for it, and the address says which sort it is.
  for (const [label, sort] of [["Trending", "trending"], ["Market cap", "market_cap"], ["Near graduation", "graduation"]] as const) {
    await sorts(page).getByRole("button", { name: label }).click();
    await expect(page).toHaveURL(new RegExp(`/\\?sort=${sort}$`));
    await expect(sorts(page).getByRole("button", { name: label, pressed: true })).toBeVisible();
    await expectBoard(page, { sort });
  }
  // By market cap, the coin bought with the most SOL leads its sibling.
  const byCap = await expected({ sort: "market_cap" });
  expect(byCap.indexOf(`/coin/${high}`)).toBeLessThan(byCap.indexOf(`/coin/${low}`));

  // A category keeps the sort, and shows only coins paired with that kind of Quote Asset.
  await categories(page).getByRole("button", { name: "Stablecoins" }).click();
  await expect(page).toHaveURL(/\/\?sort=graduation&category=stablecoin$/);
  await expectBoard(page, { sort: "graduation", category: "stablecoin" });
  await expect(cards(page).filter({ hasNotText: "/USDC" })).toHaveCount(0);

  // The Quote Asset filter offers only what coins are paired with, within the category.
  await quoteFilter(page).click();
  const options = page.getByRole("listbox", { name: "Quote Assets" }).getByRole("option");
  await expect(options.filter({ hasText: "USDC" })).toHaveCount(1);
  await expect(options.filter({ hasText: "NVDAx" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await categories(page).getByRole("button", { name: "All" }).click();
  await quoteFilter(page).click();
  await page.getByRole("combobox", { name: "Search Quote Assets" }).fill("nvda");
  await page.getByRole("option", { name: /NVDAx/ }).click();
  await expect(quoteFilter(page)).toHaveAccessibleName("Quote Asset: NVDAx");
  await expect(page).toHaveURL(new RegExp(`quote=${QUOTES.NVDAx.toBase58()}`));
  await expectBoard(page, { sort: "graduation", quote: QUOTES.NVDAx.toBase58() });

  // A reload, or a shared link, shows the same board.
  await page.reload();
  await expect(quoteFilter(page)).toHaveAccessibleName("Quote Asset: NVDAx");
  await expect(sorts(page).getByRole("button", { name: "Near graduation", pressed: true })).toBeVisible();
  await expectBoard(page, { sort: "graduation", quote: QUOTES.NVDAx.toBase58() });

  // Choosing a category the chosen Quote Asset isn't in lets go of the Quote Asset.
  await categories(page).getByRole("button", { name: "SOL" }).click();
  await expect(quoteFilter(page)).toHaveAccessibleName("Quote Asset: all");
  await expect(page).toHaveURL(/\/\?sort=graduation&category=sol$/);
  await expectBoard(page, { sort: "graduation", category: "sol" });
});

test("a filter nothing matches says so, and one click shows every coin again", async ({ page }) => {
  // BULLWHALE has no price, so no coin can be paired with it.
  await page.goto(`/?sort=trending&quote=${QUOTES.BULLWHALE.toBase58()}`);
  await expect(page.getByText("No coins match these filters.")).toBeVisible();
  await page.getByRole("button", { name: "Show all coins" }).click();
  await expect(page).toHaveURL(/\/\?sort=trending$/);
  await expectBoard(page, { sort: "trending" });
});

test("the coin page shows top holders that match the chain, and whether the Creator still holds", async ({ page, wallet }) => {
  const creator = await fundedKeypair(5);
  const mint = await launchViaApi(creator, { name: "Holder Check", symbol: "HLDR" });
  await tradeViaApi(creator, mint, "buy", BigInt(0.05 * LAMPORTS_PER_SOL));
  const holders = page.getByRole("region", { name: "Top holders" });

  await page.goto(`/coin/${mint}`);
  const creatorHeld = await coinsHeld(creator.publicKey, mint);
  await expect(holders.getByText(`The Creator holds ${percentOf(creatorHeld)} of the supply.`)).toBeVisible();
  await expect(holders.getByRole("listitem").first()).toContainText("Curve");
  await expect(holders.getByRole("listitem").filter({ hasText: "Creator" })).toContainText(percentOf(creatorHeld));

  // The trader buys through the page; the card picks up the new holder right after.
  await connectTestWallet(page, page.getByRole("region", { name: /^Trade( |$)/ }).getByRole("button", { name: "Connect wallet" }));
  const panel = page.getByRole("region", { name: /^Trade( |$)/ });
  await panel.getByRole("button", { name: "0.1 SOL" }).click();
  await expect(panel.getByText("You get about")).toBeVisible();
  await panel.getByRole("button", { name: "Review buy" }).click();
  const disclaimer = page.getByRole("dialog", { name: "Before you trade" });
  await disclaimer.getByRole("checkbox").check();
  await disclaimer.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("region", { name: "Review your trade" }).getByRole("button", { name: "Sign and buy" }).click();
  await expect(panel.getByRole("status")).toContainText(/^Bought /);
  const bought = await coinsHeld(wallet.keypair.publicKey, mint);
  const address = wallet.keypair.publicKey.toBase58();
  const row = holders.getByRole("listitem").filter({ has: page.getByRole("link", { name: `${address.slice(0, 4)}…${address.slice(-4)}` }) });
  await expect(row).toContainText(percentOf(bought));
  // The trader bought twice what the Creator did, so ranks above them.
  const order = await holders.getByRole("listitem").allTextContents();
  expect(order.findIndex((t) => t.includes(`${address.slice(0, 4)}…`))).toBeLessThan(order.findIndex((t) => t.includes("Creator")));

  // Once the Creator sells everything, the card says so.
  await tradeViaApi(creator, mint, "sell", creatorHeld);
  await page.reload();
  await expect(holders.getByText("The Creator has sold all their coins.")).toBeVisible();
  await expect(holders.getByRole("listitem").filter({ hasText: "Creator" })).toHaveCount(0);
});

test("a coin nobody has bought shows the curve holding everything and a Creator who holds none", async ({ page }) => {
  const mint = await launchViaApi(await fundedKeypair(), { name: "Holder None", symbol: "NONE" });
  await page.goto(`/coin/${mint}`);
  const holders = page.getByRole("region", { name: "Top holders" });
  await expect(holders.getByText("The Creator holds none of this coin.")).toBeVisible();
  await expect(holders.getByRole("listitem")).toHaveCount(1);
  await expect(holders.getByRole("listitem")).toContainText(/Curve\s*100\.0%/);
});
