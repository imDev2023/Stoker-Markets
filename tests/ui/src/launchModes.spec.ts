// Launch modes in the web app: a First Buy in the launch transaction, an Airdrop sent from the coin page, and launches
// that fail and are tried again without ever creating a second coin.
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import type { Page } from "@playwright/test";
import { PreparedAirdrop, PreparedLaunch } from "@launchpad/contract";
import { allowAirdrops, coinBalance, drain, expect, fund, fundQuote, launchViaApi, listLaunches, sol, test } from "./fixtures";
import { acceptDisclaimer, chooseQuote, connectWallet, fillForm, fillOptions, formAlert, notConfirmed, review } from "./launchPage";
import { connectTestWallet } from "./wallet";

const airdropCard = (page: Page) => page.getByRole("region", { name: "Airdrop" });
const wallets = (n: number) => Array.from({ length: n }, () => Keypair.generate().publicKey.toBase58());
const COINS = (n: number) => BigInt(n) * 1_000_000n;

const PREPARE = /^\/v1\/launches\/(?:[1-9A-HJ-NP-Za-km-z]{32,44}\/)?prepare$/;

/** The next launch the page prepares, or prepares again, as the API answered it. */
function nextPrepared(page: Page) {
  return page
    .waitForResponse((r) => r.request().method() === "POST" && PREPARE.test(new URL(r.url()).pathname) && r.ok())
    .then(async (r) => PreparedLaunch.parse(await r.json()));
}

async function launchesNamed(name: string) {
  return (await listLaunches()).filter((l) => l.name === name);
}

const airdropOption = (page: Page) => page.getByRole("checkbox", { name: "Airdrop part of your first buy to other wallets" });

test("the form offers an airdrop only to a wallet the operator has allowed", async ({ page, wallet }) => {
  const answered = page.waitForResponse((r) => /\/launch-permissions$/.test(r.url()));
  await page.goto("/launch");
  await connectWallet(page);
  expect(await (await answered).json()).toEqual({ airdrop: false });
  await expect(page.getByLabel(/^First buy/)).toBeVisible();
  await expect(airdropOption(page)).toHaveCount(0);
  expect(wallet.requests).toHaveLength(0);
});

test("a Creator launches with a first buy and an airdrop, then sends the airdrop from the coin page", async ({ page, wallet }) => {
  await allowAirdrops(wallet.keypair.publicKey);
  const recipients = wallets(3);
  await page.goto("/launch");
  await connectWallet(page);
  await fillForm(page, { name: "Party Favors", symbol: "PARTY" });
  await fillOptions(page, {
    firstBuy: "0.2",
    // Pasted the way people keep lists: commas, spaces or semicolons, thousands grouped, blank lines in between.
    airdrop: `${recipients[0]}, 1,000,000\n\n${recipients[1]} 2500000\n${recipients[2]};500000.5`,
  });
  // The first buy's coins are quoted before anything is prepared, and the list is read as typed.
  await expect(page.getByText(/^You get [\d,]+ PARTY, [\d.]+% of the supply, in the launch transaction itself/)).toBeVisible();
  await expect(page.getByText(/^3 wallets get 4,000,000\.5 PARTY, 0\.4% of the supply\. You keep [\d,]+\. Sent from your wallet/)).toBeVisible();

  const prepared = nextPrepared(page);
  await page.getByRole("button", { name: "Review launch" }).click();
  await acceptDisclaimer(page);
  const launch = await prepared;
  await expect(review(page)).toContainText(/Launching PARTY paired with SOL, with your first buy of 0\.2 SOL for [\d,]+ PARTY/);
  await expect(review(page)).toContainText("Then send the airdrop from your coin's page: 3 wallets get 4,000,000.5 PARTY.");
  // A First Buy is a curve trade, so it pays the Platform Fee, half of which is the Creator's own (ADR 0009).
  const firstBuyShare = sol(BigInt(launch.firstBuy!.fees.platform) / 2n);
  await expect(review(page)).toContainText(`Like any trade, the first buy pays the Platform Fee, and half of it, ${firstBuyShare} SOL, comes back to you as the coin's creator.`);
  expect(wallet.requests).toHaveLength(0);

  await review(page).getByRole("button", { name: "Sign and launch" }).click();
  await page.waitForURL(`**/coin/${launch.mint}`);
  expect(wallet.requests).toHaveLength(1);
  const bought = BigInt(launch.firstBuy!.amountOut);
  expect(await coinBalance(wallet.keypair.publicKey, launch.mint)).toBe(bought);

  // The first trade on the curve is the Creator's own, made in the launch transaction.
  const history = page.getByRole("region", { name: "Trades" });
  await expect(history.getByRole("row")).toHaveCount(2);
  await expect(history.getByRole("row").nth(1)).toContainText("Buy");

  const card = airdropCard(page);
  await expect(card).toContainText("0 of 3 paid");
  await card.getByRole("button", { name: "Send airdrop" }).click();
  await expect(card).toContainText("3 of 3 paid");
  await expect(card.getByRole("button")).toHaveCount(0);
  // One approval signed every airdrop transaction.
  expect(wallet.requests).toHaveLength(1 + launch.airdrop!.transactions);

  const amounts = [COINS(1_000_000), COINS(2_500_000), COINS(500_000) + 500_000n];
  for (const [i, r] of recipients.entries()) expect(await coinBalance(new PublicKey(r), launch.mint)).toBe(amounts[i]);
  expect(await coinBalance(wallet.keypair.publicKey, launch.mint)).toBe(bought - amounts.reduce((a, b) => a + b));

  await card.getByText("Show the 3 wallets").click();
  await expect(card.getByRole("link", { name: "Paid" })).toHaveCount(3);

  // The Creator's share of the first buy is on their own page, to be sent by the platform.
  await page.goto("/creator");
  await expect(page.getByRole("region", { name: "SOL" })).toContainText(`${firstBuyShare} SOL`);
  await expect(page.getByRole("link", { name: /PARTY\s*Party Favors/ })).toContainText("Earning");
});

test("a First Buy in USDC is quoted, reviewed and paid in USDC", async ({ page, wallet }) => {
  await fundQuote(wallet.keypair.publicKey, "USDC", 50_000_000n);
  await page.goto("/launch");
  await connectWallet(page);
  await fillForm(page, { name: "Dollar First", symbol: "DFST" });
  await chooseQuote(page, "USDC");

  // USDC has 6 decimals, so a seventh is refused; the amount field and its quote are in USDC.
  await fillOptions(page, { firstBuy: "20.0000001" });
  await expect(page.getByText("Enter a first buy above zero with up to 6 decimal places.")).toBeVisible();
  await fillOptions(page, { firstBuy: "20" });
  await expect(page.locator("#first-buy").locator("..")).toContainText("USDC");
  await expect(page.getByText(/^You get [\d,]+ DFST, [\d.]+% of the supply/)).toBeVisible();

  const prepared = nextPrepared(page);
  await page.getByRole("button", { name: "Review launch" }).click();
  await acceptDisclaimer(page);
  const launch = await prepared;
  expect(launch.firstBuy).toMatchObject({ amountIn: "20000000" });
  await expect(review(page)).toContainText(/with your first buy of 20 USDC for [\d,]+ DFST .* It graduates at 150 USDC raised\./);
  await expect(review(page)).toContainText("Your wallet pays the USDC and about");

  await review(page).getByRole("button", { name: "Sign and launch" }).click();
  await page.waitForURL(`**/coin/${launch.mint}`);
  expect(await coinBalance(wallet.keypair.publicKey, launch.mint)).toBe(BigInt(launch.firstBuy!.amountOut));
  const history = page.getByRole("region", { name: "Trades" });
  await expect(history.getByRole("row").nth(1)).toContainText("20");
});

test("launch options explain what is wrong before anything is prepared", async ({ page, wallet }) => {
  await allowAirdrops(wallet.keypair.publicKey);
  await page.goto("/launch");
  await connectWallet(page);
  await fillForm(page, { name: "Wrong Lists", symbol: "WRONG" });
  const [a, b] = wallets(2);

  await fillOptions(page, { firstBuy: "abc" });
  await expect(page.getByText("Enter a first buy above zero with up to 9 decimal places.")).toBeVisible();
  await fillOptions(page, { firstBuy: "0.05", airdrop: `${a}, 1000\nnot-a-wallet, 5` });
  await expect(page.getByText("Line 2: write a wallet address, then the number of coins it gets.")).toBeVisible();
  await fillOptions(page, { airdrop: `${a}, 1000\n${a}, 5` });
  await expect(page.getByText(`Line 2: this wallet is already on line 1.`)).toBeVisible();
  await fillOptions(page, { airdrop: `${wallet.keypair.publicKey.toBase58()}, 1000` });
  await expect(page.getByText(/^Line 1: that's your own wallet/)).toBeVisible();
  await fillOptions(page, { airdrop: `${a}, 900000000\n${b}, 1` });
  await expect(page.getByText("The airdrop gives away more coins than your first buy gets. Buy more or airdrop less.")).toBeVisible();

  await page.getByRole("button", { name: "Review launch" }).click();
  await expect(formAlert(page)).toHaveText("The airdrop gives away more coins than your first buy gets. Buy more or airdrop less.");
  await page.getByLabel(/^First buy/).fill("");
  await page.getByRole("button", { name: "Review launch" }).click();
  await expect(formAlert(page)).toHaveText("An airdrop is paid from your first buy. Add a first buy.");
  expect(wallet.requests).toHaveLength(0);
  expect(await launchesNamed("Wrong Lists")).toHaveLength(0);
});

test("a launch the network refuses says why, and trying again launches that same coin once", async ({ page, wallet }) => {
  await page.goto("/launch");
  await connectWallet(page);
  await fillForm(page, { name: "Second Try", symbol: "AGAIN" });
  await fillOptions(page, { firstBuy: "0.1" });
  const prepared = nextPrepared(page);
  await page.getByRole("button", { name: "Review launch" }).click();
  await acceptDisclaimer(page);
  const first = await prepared;
  await expect(review(page)).toBeVisible();

  // The Creator spends their SOL elsewhere between reviewing and signing.
  await drain(wallet.keypair, 0.01);
  await review(page).getByRole("button", { name: "Sign and launch" }).click();
  await expect(formAlert(page)).toHaveText(
    "Your wallet no longer has enough SOL to pay for the launch, so it wasn't sent and nothing was created. Add SOL and try again.",
  );
  await expect(notConfirmed(page).getByRole("button", { name: "Edit" })).toBeVisible();

  await fund(wallet.keypair.publicKey, 2);
  const again = nextPrepared(page);
  await notConfirmed(page).getByRole("button", { name: "Try again" }).click();
  expect((await again).mint).toBe(first.mint);
  await review(page).getByRole("button", { name: "Sign and launch" }).click();
  await page.waitForURL(`**/coin/${first.mint}`);
  expect(wallet.requests).toHaveLength(2);
  expect((await launchesNamed("Second Try")).map((l) => l.mint)).toEqual([first.mint]);
});

test("when a launch can't be confirmed, trying again finds the coin instead of launching a second", async ({ page, wallet, stack, expectedHttpErrors }) => {
  // The retry is answered 409 "already launched", which the page turns into going to the coin.
  expectedHttpErrors.push(/\/v1\/launches\/[1-9A-HJ-NP-Za-km-z]{32,44}\/prepare$/);
  // The RPC node takes the launch but its answer is lost on the way back, so the page can't know whether it landed.
  const rpc = new URL(stack.rpcUrl).origin;
  let landed: string | null = null;
  await page.route((url) => url.origin === rpc, async (route) => {
    const body = route.request().postDataJSON() as { id: string; method: string } | null;
    if (body?.method !== "sendTransaction" || landed) return route.fallback();
    const response = await route.fetch();
    landed = ((await response.json()) as { result: string }).result;
    await route.fulfill({ response, body: JSON.stringify({ jsonrpc: "2.0", id: body.id, error: { code: -32603, message: "Internal error" } }) });
  });

  await page.goto("/launch");
  await connectWallet(page);
  await fillForm(page, { name: "Lost Reply", symbol: "LOST" });
  const prepared = nextPrepared(page);
  await page.getByRole("button", { name: "Review launch" }).click();
  await acceptDisclaimer(page);
  const launch = await prepared;
  await review(page).getByRole("button", { name: "Sign and launch" }).click();

  await expect(formAlert(page)).toHaveText("We couldn't confirm whether your coin launched. Check your connection, then try again.");
  // It may have launched, so the Creator can't start over with a new coin, only check and try again.
  await expect(notConfirmed(page).getByRole("button", { name: "Edit" })).toHaveCount(0);
  await expect(page.getByLabel("Name")).toBeDisabled();

  // It did land.
  const conn = new Connection(stack.rpcUrl, "confirmed");
  await expect.poll(async () => (await conn.getSignatureStatus(landed!)).value?.confirmationStatus, { timeout: 30_000 }).toMatch(/confirmed|finalized/);

  await notConfirmed(page).getByRole("button", { name: "Try again" }).click();
  await page.waitForURL(`**/coin/${launch.mint}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/LOST paired with SOL/);
  expect(wallet.requests).toHaveLength(1);
  expect((await launchesNamed("Lost Reply")).map((l) => l.mint)).toEqual([launch.mint]);
});

test("declining the airdrop sends nothing, and the Creator can send it once the declined transactions expire", async ({ page, wallet, stack }) => {
  // The declined transactions stay valid for 150 blocks, about a minute; nothing is handed out again before they expire.
  // Block times on a busy machine vary, so the test follows the chain rather than the clock.
  test.setTimeout(360_000);
  const handedOut = page
    .waitForResponse((r) => /\/airdrop\/prepare$/.test(r.url()) && r.ok())
    .then(async (r) => PreparedAirdrop.parse(await r.json()).lastValidBlockHeight);
  const recipients = wallets(2);
  const mint = await launchViaApi(wallet.keypair, {
    name: "Not Yet Sent", symbol: "WAIT", firstBuy: "100000000", airdrop: recipients.map((w) => ({ wallet: w, amount: COINS(10).toString() })),
  });
  await page.goto(`/coin/${mint}`);
  const card = airdropCard(page);
  await expect(card).toContainText("0 of 2 paid");
  // Only the Creator can send it.
  await expect(card.getByRole("button")).toHaveCount(0);

  await connectTestWallet(page, page.getByRole("banner").getByRole("button", { name: "Connect wallet" }));
  wallet.declineNext();
  await card.getByRole("button", { name: "Send airdrop" }).click();
  await expect(card.getByRole("alert")).toHaveText(
    "You declined in your wallet, so nothing was sent. You can send it in about a minute, once the transactions you declined have expired.",
  );
  await card.getByText("Show the 2 wallets").click();
  await expect(card.getByText("Waiting", { exact: true })).toHaveCount(2);
  await expect(card.getByRole("button", { name: /Send/ })).toBeDisabled();
  for (const r of recipients) expect(await coinBalance(new PublicKey(r), mint)).toBe(0n);

  // The page follows the declined transactions until they expire, then lets the Creator send again.
  const expiresAfter = await handedOut;
  const conn = new Connection(stack.rpcUrl, "confirmed");
  await expect.poll(() => conn.getBlockHeight("confirmed"), { timeout: 300_000, intervals: [2_000] }).toBeGreaterThan(expiresAfter);
  await expect(card.getByRole("button", { name: "Send airdrop" })).toBeEnabled({ timeout: 30_000 });
  await card.getByRole("button", { name: "Send airdrop" }).click();
  await expect(card).toContainText("2 of 2 paid");
  for (const r of recipients) expect(await coinBalance(new PublicKey(r), mint)).toBe(COINS(10));
});
