// Paying with SOL on a coin paired with something else: the trade panel offers SOL, shows the swap in front of the buy
// and what of the Quote Asset stays in the wallet, and one transaction swaps and buys, or does nothing. These flows buy JTO-paired coins, so the local SOL-USDC route
// pool stays as the visual tests expect it.
import type { Page } from "@playwright/test";
import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { PreparedTrade } from "@launchpad/contract";
import { expect, fundQuote, fundedKeypair, launchViaApi, moveSolRoute, solBalance, stackEnv, test, tradeViaApi } from "./fixtures";
import { connectTestWallet } from "./wallet";

const panel = (page: Page) => page.getByRole("region", { name: /^Trade( |$)/ });
const payWith = (page: Page) => panel(page).getByRole("group", { name: "Pay with" });
const review = (page: Page) => panel(page).getByRole("region", { name: "Review your trade" });

/** A name per ticker, no two within one letter of each other: "Paid SOLN" and "Paid SOLB" were a near copy to Copy Protection. */
const JTO_NAMES: Record<string, string> = { SOLB: "Bronze Pay", SOLN: "Nickel Pay", SOLS: "Silver Pay", SOLM: "Marble Pay", SOLQ: "Quartz Pay" };

async function jtoCoin(symbol: string) {
  return launchViaApi(await fundedKeypair(), { name: JTO_NAMES[symbol] ?? `${symbol} ${symbol}`, symbol, quote: "JTO" });
}

async function openConnected(page: Page, mint: string) {
  await page.goto(`/coin/${mint}`);
  await connectTestWallet(page, panel(page).getByRole("button", { name: "Connect wallet" }));
  await expect(panel(page).getByRole("button", { name: "Review buy" })).toBeVisible();
}

/** Waits for the panel to switch to SOL: it only does so once the balances load, and never under an amount already typed. */
async function openConnectedPayingSol(page: Page, mint: string) {
  await openConnected(page, mint);
  await expect(payWith(page).getByRole("button", { name: "SOL" })).toHaveAttribute("aria-pressed", "true");
}

async function reviewBuy(page: Page) {
  const prepared = page.waitForResponse((r) => r.url().endsWith("/v1/trades/prepare"));
  await panel(page).getByRole("button", { name: "Review buy" }).click();
  await expect(review(page)).toBeVisible();
  return PreparedTrade.parse(await (await prepared).json());
}

/** Raw JTO as the site writes it: every decimal that isn't a trailing zero. */
function jto(raw: string) {
  const n = BigInt(raw);
  const fraction = (n % 10n ** 9n).toString().padStart(9, "0").replace(/0+$/, "");
  return `${n / 10n ** 9n}${fraction ? `.${fraction}` : ""}`;
}

/** Every token account a wallet holds, with balances. */
async function tokenAccounts(owner: PublicKey) {
  const conn = new Connection(stackEnv().rpcUrl, "confirmed");
  const { value } = await conn.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM_ID }, "confirmed");
  return value.map((a) => ({ mint: a.account.data.parsed.info.mint as string, amount: a.account.data.parsed.info.tokenAmount.amount as string }));
}

test("a trader holding only SOL buys a JTO-paired coin, and ends up with the coins and the little JTO the swap left over", async ({ page, wallet }) => {
  const mint = await jtoCoin("SOLB");
  await openConnected(page, mint);
  // The wallet holds no JTO, so the panel offers to pay with SOL straight away.
  await expect(payWith(page).getByRole("button", { name: "SOL" })).toHaveAttribute("aria-pressed", "true");
  await expect(panel(page).getByText("Balance 5 SOL")).toBeVisible();
  await expect(panel(page).getByText("Paid in SOL, swapped for JTO in the same trade.")).toBeVisible();

  await panel(page).getByRole("button", { name: "0.1 SOL" }).click();
  await expect(panel(page).getByLabel("You pay")).toHaveValue("0.1");
  const quote = panel(page).getByRole("definition");
  await expect(panel(page).getByText("You pay exactly")).toBeVisible();
  // 0.1 SOL buys about 5.98 JTO in the 1,000 SOL : 60,000 JTO pool after its 0.25% fee. The buy spends the least the
  // swap may deliver, 0.3% under that, and the rest stays in the wallet.
  await expect(quote.filter({ hasText: /^0\.1 SOL$/ })).toBeVisible();
  await expect(quote.filter({ hasText: /^5\.96\d+ JTO$/ })).toBeVisible();
  await expect(quote.filter({ hasText: /^0\.0179\d+ JTO$/ })).toBeVisible();
  for (const fee of ["Swap to JTO", "Raydium", "Platform fee"]) await expect(panel(page).getByText(fee, { exact: false }).first()).toBeVisible();
  await expect(panel(page).getByText("Creator fee")).toHaveCount(0);
  await expect(
    panel(page).getByText(
      "Swapped through Raydium CPMM. The swap may deliver up to 0.3% less JTO than the price gives now, so the buy spends only what is sure to arrive and the rest stays in your wallet as JTO.",
      { exact: true },
    ),
  ).toBeVisible();

  const sol = await solBalance(wallet.keypair.publicKey);
  const prepared = await reviewBuy(page);
  const route = prepared.quote.route!;
  await expect(review(page)).toContainText(/^Your wallet pays 0\.1\d+ SOL in total, including network fees and any account rent\. /);
  await expect(review(page)).toContainText(
    `The swap turns 0.1 SOL of it into JTO: ${jto(route.quoteOut)} JTO is spent on the curve, and about ${jto(route.kept)} JTO stays in your wallet. ` +
      "If SOL buys over 0.3% less JTO first, or the coin's price moves more than 1%, the trade fails and nothing is traded.",
  );
  const shownTotal = Number((await review(page).locator("strong.mono").first().textContent())!.replace(" SOL", ""));
  expect(wallet.requests).toHaveLength(0);

  await review(page).getByRole("button", { name: "Sign and buy" }).click();
  await expect(panel(page).getByRole("status")).toHaveText(/^Bought [\d,]+ SOLB\. View transaction$/);
  expect(wallet.requests).toHaveLength(1);
  // The coins, and the JTO the swap delivered beyond what the buy spent: nothing moved in the route pool since the quote.
  const held = await tokenAccounts(wallet.keypair.publicKey);
  expect(held).toHaveLength(2);
  expect(held.find((a) => a.mint === mint)?.amount).toBe(prepared.quote.amountOut);
  expect(held.find((a) => a.mint !== mint)?.amount).toBe(route.kept);
  // The wallet paid what the review said, to the lamport the review shows.
  const spent = Number(sol - (await solBalance(wallet.keypair.publicKey))) / LAMPORTS_PER_SOL;
  expect(Math.abs(spent - shownTotal)).toBeLessThan(1e-6);
  const history = page.getByRole("region", { name: "Trades", exact: true }).getByRole("table");
  await expect(history.getByRole("row")).toHaveCount(2);
  await expect(history.getByRole("columnheader", { name: "JTO" })).toBeVisible();
});

test("declining in the wallet swaps and buys nothing, and says so", async ({ page, wallet }) => {
  const mint = await jtoCoin("SOLN");
  await openConnectedPayingSol(page, mint);
  await panel(page).getByLabel("You pay").fill("0.1");
  await expect(panel(page).getByText("You pay exactly")).toBeVisible();
  await reviewBuy(page);
  const sol = await solBalance(wallet.keypair.publicKey);
  wallet.declineNext();
  await review(page).getByRole("button", { name: "Sign and buy" }).click();
  await expect(panel(page).getByRole("alert")).toHaveText("You declined the transaction in your wallet. Nothing was traded.");
  await expect(review(page)).toBeHidden();
  await expect(panel(page).getByRole("button", { name: "Review buy" })).toBeEnabled();
  expect(wallet.requests).toHaveLength(1);
  expect(await solBalance(wallet.keypair.publicKey)).toBe(sol);
  expect(await tokenAccounts(wallet.keypair.publicKey)).toEqual([]);
});

test("SOL buying less JTO than the swap allows before signing swaps nothing and says so", async ({ page, wallet }) => {
  const mint = await jtoCoin("SOLS");
  await openConnectedPayingSol(page, mint);
  await panel(page).getByLabel("You pay").fill("0.1");
  await expect(panel(page).getByText("You pay exactly")).toBeVisible();
  await reviewBuy(page);
  // Someone swaps 20 SOL for JTO first, moving the route pool about 4%, far past the swap's 0.3%.
  await moveSolRoute("JTO", BigInt(20 * LAMPORTS_PER_SOL));
  const sol = await solBalance(wallet.keypair.publicKey);

  await review(page).getByRole("button", { name: "Sign and buy" }).click();
  await expect(panel(page).getByRole("alert")).toHaveText(
    "SOL buys less JTO now than the swap allows, so nothing was sent, swapped or charged. Check the new quote and try again.",
  );
  await expect(review(page)).toBeHidden();
  expect(wallet.requests).toHaveLength(1);
  expect(await solBalance(wallet.keypair.publicKey)).toBe(sol);
  expect(await tokenAccounts(wallet.keypair.publicKey)).toEqual([]);
});

test("the coin moving more than the slippage allows before signing buys nothing and says so", async ({ page, wallet }) => {
  const mint = await jtoCoin("SOLM");
  await openConnectedPayingSol(page, mint);
  await panel(page).getByLabel("You pay").fill("0.1");
  await expect(panel(page).getByText("You pay exactly")).toBeVisible();
  await reviewBuy(page);
  // Someone else buys the coin with JTO first and moves its price well past the trade's 1%.
  const fast = await fundedKeypair();
  await fundQuote(fast.publicKey, "JTO", 20n * 10n ** 9n);
  await tradeViaApi(fast, mint, "buy", 20n * 10n ** 9n);

  await review(page).getByRole("button", { name: "Sign and buy" }).click();
  await expect(panel(page).getByRole("alert")).toHaveText(
    "The price moved past your slippage before the trade was sent, so nothing was traded or charged. Check the new quote and try again, or allow more slippage.",
  );
  expect(wallet.requests).toHaveLength(1);
  expect(await tokenAccounts(wallet.keypair.publicKey)).toEqual([]);
});

test("a wallet holding the Quote Asset pays with it until the trader picks SOL", async ({ page, wallet }) => {
  const mint = await jtoCoin("SOLQ");
  await fundQuote(wallet.keypair.publicKey, "JTO", 3n * 10n ** 9n);
  await openConnected(page, mint);
  await expect(payWith(page).getByRole("button", { name: "JTO" })).toHaveAttribute("aria-pressed", "true");
  await expect(panel(page).getByText("Balance 3 JTO")).toBeVisible();
  await expect(panel(page).getByRole("button", { name: "6 JTO" })).toBeVisible();

  await payWith(page).getByRole("button", { name: "SOL" }).click();
  await expect(payWith(page).getByRole("button", { name: "SOL" })).toHaveAttribute("aria-pressed", "true");
  await expect(panel(page).getByText("Balance 5 SOL")).toBeVisible();
  await expect(panel(page).getByRole("button", { name: "0.5 SOL" })).toBeVisible();
  // More SOL than the wallet holds is refused before any review.
  await panel(page).getByLabel("You pay").fill("9");
  await expect(panel(page).getByText(/^You have 5 SOL\. Enter a smaller amount\.$/)).toBeVisible();
  await expect(panel(page).getByRole("button", { name: "Review buy" })).toBeDisabled();
  // Selling always pays out the Quote Asset, so the choice goes away.
  await panel(page).getByRole("group", { name: "Buy or sell" }).getByRole("button", { name: "Sell" }).click();
  await expect(payWith(page)).toBeHidden();
  expect(wallet.requests).toHaveLength(0);
});

test("a Quote Asset with no SOL route says so and offers paying in it instead", async ({ page, wallet, expectedHttpErrors }) => {
  expectedHttpErrors.push(/\/v1\/launches\/[^/]+\/quote\?/);
  const mint = await launchViaApi(await fundedKeypair(), { name: "Stock Paid", symbol: "SOLX", quote: "NVDAx" });
  await openConnected(page, mint);
  await payWith(page).getByRole("button", { name: "SOL" }).click();
  await panel(page).getByLabel("You pay").fill("0.1");
  await expect(panel(page).getByText("There's no SOL route to NVDAx right now. Pay in NVDAx instead.")).toBeVisible();
  await expect(panel(page).getByRole("button", { name: "Review buy" })).toBeDisabled();
  expect(wallet.requests).toHaveLength(0);
});
