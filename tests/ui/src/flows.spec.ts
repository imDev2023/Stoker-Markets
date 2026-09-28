// What a Creator does in the web app, end to end against the real chain and API.
import { Connection, Keypair, LAMPORTS_PER_SOL, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import type { Page } from "@playwright/test";
import {
  COIN_PNG, creatorFeeVault, expect, fundedKeypair, launchViaApi, listLaunches, sol, solBalance, test, tradeViaApi,
} from "./fixtures";
import { TEST_WALLET_NAME } from "./wallet";

const COIN = {
  name: "Tracer Bullet",
  symbol: "TRCR",
  description: "The first coin through the whole system: form, API, wallet, chain, indexer, board.",
  website: "https://example.com/tracer",
  x: "https://x.com/tracer",
  telegram: "https://t.me/tracer",
};

async function connectWallet(page: Page) {
  await page.getByRole("main").getByRole("button", { name: "Connect wallet" }).click();
  await page.getByRole("menuitem", { name: TEST_WALLET_NAME }).click();
  await expect(page.getByRole("button", { name: "Review launch" })).toBeVisible();
}

async function fillForm(page: Page, coin: Partial<typeof COIN> = COIN) {
  await page.locator('input[type="file"]').setInputFiles({ name: "coin.png", mimeType: "image/png", buffer: COIN_PNG });
  await page.getByLabel("Name").fill(coin.name ?? COIN.name);
  await page.getByLabel("Ticker").fill(coin.symbol ?? COIN.symbol);
  if (coin.description) await page.getByLabel("Description").fill(coin.description);
  if (coin.website) await page.getByLabel("Website").fill(coin.website);
  if (coin.x) await page.getByLabel(/^X\b/).fill(coin.x);
  if (coin.telegram) await page.getByLabel("Telegram").fill(coin.telegram);
}

const disclaimer = (page: Page) => page.getByRole("dialog", { name: "Before you launch" });
const formAlert = (page: Page) => page.getByRole("main").getByRole("alert");
const review = (page: Page) => page.getByRole("region", { name: "Review your launch" });

async function acceptDisclaimer(page: Page) {
  const dialog = disclaimer(page);
  await expect(dialog).toBeVisible();
  const cont = dialog.getByRole("button", { name: "Continue" });
  await expect(cont).toBeDisabled();
  await dialog.getByRole("checkbox").check();
  await cont.click();
}

test("a Creator launches a SOL-paired coin and finds it on the board and its coin page", async ({ page, wallet, stack }) => {
  await page.goto("/launch");
  await connectWallet(page);
  await fillForm(page);
  await page.getByRole("button", { name: "Review launch" }).click();
  await acceptDisclaimer(page);

  // The simulated cost is shown before the wallet is ever asked to sign.
  await expect(review(page)).toBeVisible();
  await expect(review(page)).toContainText("Launching TRCR paired with SOL");
  const cost = Number((await review(page).locator("strong.mono").textContent())?.replace(" SOL", ""));
  expect(cost).toBeGreaterThan(0);
  expect(cost).toBeLessThan(0.1);
  expect(wallet.requests).toHaveLength(0);

  await review(page).getByRole("button", { name: "Sign and launch" }).click();
  await page.waitForURL(/\/coin\/[1-9A-HJ-NP-Za-km-z]{32,44}$/);
  expect(wallet.requests).toHaveLength(1);
  expect(wallet.requests[0]!.message.staticAccountKeys[0]!.equals(wallet.keypair.publicKey)).toBe(true);
  const mint = page.url().split("/").pop()!;

  // The coin page shows everything the Creator entered, served from our metadata.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/TRCR paired with SOL/);
  await expect(page.getByText(COIN.name, { exact: true })).toBeVisible();
  await expect(page.getByText(COIN.description)).toBeVisible();
  for (const [label, href] of [["Website", COIN.website], ["X", COIN.x], ["Telegram", COIN.telegram]])
    await expect(page.getByRole("link", { name: label, exact: true })).toHaveAttribute("href", href!);
  const image = page.locator("article header img");
  await expect(image).toHaveJSProperty("complete", true);
  expect(await image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(256);
  const served = await page.request.get((await image.getAttribute("src"))!);
  expect(served.headers()["content-type"]).toBe("image/png");
  expect(Buffer.from(await served.body()).equals(COIN_PNG)).toBe(true);

  // Explorer links point at the chain the platform actually runs on.
  const explorer = new URL((await page.getByRole("link", { name: `${mint.slice(0, 4)}…${mint.slice(-4)}` }).getAttribute("href"))!);
  expect(explorer.pathname).toBe(`/address/${mint}`);
  expect(explorer.searchParams.get("customUrl")).toBe(stack.rpcUrl);

  const [launch] = (await listLaunches()).filter((l) => l.mint === mint);
  expect(launch?.creator).toBe(wallet.keypair.publicKey.toBase58());
  const metadata = await (await page.request.get(launch!.metadataUri)).json();
  expect(metadata).toMatchObject({ name: COIN.name, symbol: COIN.symbol, description: COIN.description, image: launch!.image });

  // The board lists it, and its card leads back to the coin page.
  await page.goto("/");
  await expect(page.getByText("Latest coin")).toBeVisible();
  const card = page.getByRole("link", { name: new RegExp(COIN.name) });
  await expect(card).toBeVisible();
  await card.click();
  await page.waitForURL(`**/coin/${mint}`);
});

test("the disclaimer must be accepted before a first launch and is remembered after", async ({ page, wallet }) => {
  await page.goto("/launch");
  await connectWallet(page);
  await fillForm(page, { name: "Not Yet", symbol: "NOPE" });

  await page.getByRole("button", { name: "Review launch" }).click();
  await expect(disclaimer(page)).toBeVisible();
  await disclaimer(page).getByRole("button", { name: "Cancel" }).click();
  await expect(disclaimer(page)).toBeHidden();
  await expect(review(page)).toBeHidden();

  // Escape is a cancel too, and nothing is prepared until the Creator accepts.
  await page.getByRole("button", { name: "Review launch" }).click();
  await expect(disclaimer(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(disclaimer(page)).toBeHidden();
  await expect(review(page)).toBeHidden();

  await page.getByRole("button", { name: "Review launch" }).click();
  await acceptDisclaimer(page);
  await expect(review(page)).toBeVisible();

  // Accepted once, the next launch goes straight to the review; the wallet reconnects by itself.
  await page.reload();
  await expect(page.getByRole("button", { name: "Review launch" })).toBeVisible();
  await fillForm(page, { name: "Not Yet", symbol: "NOPE" });
  await page.getByRole("button", { name: "Review launch" }).click();
  await expect(review(page)).toBeVisible();
  await expect(disclaimer(page)).toBeHidden();
  expect(wallet.requests).toHaveLength(0);
});

test("declining in the wallet launches nothing and says so", async ({ page, wallet }) => {
  const before = await listLaunches();
  await page.goto("/launch");
  await connectWallet(page);
  await fillForm(page, { name: "Declined", symbol: "NOPE" });
  await page.getByRole("button", { name: "Review launch" }).click();
  await acceptDisclaimer(page);

  wallet.declineNext();
  await review(page).getByRole("button", { name: "Sign and launch" }).click();
  await expect(formAlert(page)).toHaveText("You declined the transaction in your wallet. Nothing was launched.");
  await expect(review(page)).toBeHidden();
  await expect(page.getByRole("button", { name: "Review launch" })).toBeEnabled();
  expect(wallet.requests).toHaveLength(1);
  expect(await listLaunches()).toHaveLength(before.length);
});

test("a wallet without enough SOL is told so before signing", async ({ page, wallet, stack }) => {
  // Leave the wallet 0.005 SOL, well under the rent a launch pays.
  const conn = new Connection(stack.rpcUrl, "confirmed");
  const spend = (await conn.getBalance(wallet.keypair.publicKey)) - 0.005 * LAMPORTS_PER_SOL - 5_000;
  const drain = SystemProgram.transfer({ fromPubkey: wallet.keypair.publicKey, toPubkey: Keypair.generate().publicKey, lamports: spend });
  await sendAndConfirmTransaction(conn, new Transaction().add(drain), [wallet.keypair]);

  await page.goto("/launch");
  await connectWallet(page);
  await fillForm(page, { name: "Too Poor", symbol: "POOR" });
  await page.getByRole("button", { name: "Review launch" }).click();
  await acceptDisclaimer(page);
  await expect(formAlert(page)).toHaveText("Your wallet doesn't have enough SOL to pay for the launch. Add SOL and try again.");
  await expect(review(page)).toBeHidden();
  expect(wallet.requests).toHaveLength(0);
});

test("a Creator finds their Creator Fee from their coin, claims it, and sees it land in their wallet and the history", async ({ page, wallet, stack }) => {
  const creator = wallet.keypair.publicKey;
  const mint = await launchViaApi(wallet.keypair, { name: "Fee Earner", symbol: "EARN" });
  await tradeViaApi(await fundedKeypair(), mint, "buy", BigInt(0.4 * LAMPORTS_PER_SOL));
  const { balance: inVault } = await creatorFeeVault(creator);
  expect(inVault).toBeGreaterThan(0n);

  // Anyone can follow a coin to its Creator's public page, but only the Creator's wallet can claim.
  await page.goto(`/coin/${mint}`);
  await page.getByRole("link", { name: "See what the Creator earned and claimed" }).click();
  await page.waitForURL(`**/creator/${creator.toBase58()}`);
  const card = page.getByRole("region", { name: "SOL" });
  await expect(card).toContainText(`${sol(inVault)} SOL`);
  await expect(page.getByRole("button", { name: "Claim SOL" })).toBeHidden();
  await expect(page.getByRole("link", { name: /EARN\s*Fee Earner/ })).toContainText("Earning");
  await expect(page.getByText("No claims yet.")).toBeVisible();

  // Connecting the Creator's wallet turns it into their own page.
  await page.getByRole("main").getByRole("button", { name: "Connect wallet" }).click();
  await page.getByRole("menuitem", { name: TEST_WALLET_NAME }).click();
  await expect(page.getByRole("heading", { name: "Your Creator Fee" })).toBeVisible();

  // The review shows what reaches the wallet before anything is signed; declining moves nothing.
  const reviewClaim = page.getByRole("region", { name: "Review your claim" });
  await card.getByRole("button", { name: "Claim SOL" }).click();
  await expect(reviewClaim).toContainText(`Your wallet receives about ${sol(inVault - 5_000n)} SOL after the network fee.`);
  expect(wallet.requests).toHaveLength(0);
  wallet.declineNext();
  await reviewClaim.getByRole("button", { name: "Sign and claim" }).click();
  await expect(card.getByRole("alert")).toHaveText("You declined the transaction in your wallet. Nothing was claimed.");
  expect(wallet.requests).toHaveLength(1);
  expect((await creatorFeeVault(creator)).balance).toBe(inVault);

  const before = await solBalance(creator);
  await card.getByRole("button", { name: "Claim SOL" }).click();
  await reviewClaim.getByRole("button", { name: "Sign and claim" }).click();
  await expect(card.getByRole("status")).toHaveText(`Claimed ${sol(inVault)} SOL. View transaction`);
  expect(wallet.requests).toHaveLength(2);
  expect((await creatorFeeVault(creator)).balance).toBe(0n);
  expect((await solBalance(creator)) - before).toBe(inVault - 5_000n);

  // The claim is in the public history, linked to its transaction, and the vault shows empty.
  await expect(card).toContainText("Nothing to claim right now.");
  const history = page.getByRole("region", { name: "Claim history" });
  await expect(history.getByRole("listitem")).toHaveCount(1);
  await expect(history.getByRole("listitem")).toContainText(`${sol(inVault)} SOL`);
  const tx = new URL((await history.getByRole("link", { name: "View transaction" }).getAttribute("href"))!);
  expect(tx.pathname).toMatch(/^\/tx\/[1-9A-HJ-NP-Za-km-z]{64,88}$/);
  expect(tx.searchParams.get("customUrl")).toBe(stack.rpcUrl);

  // The account menu leads back to this page from anywhere.
  await page.goto("/");
  await page.getByRole("banner").getByRole("button", { name: creator.toBase58().slice(0, 4), exact: false }).click();
  await page.getByRole("menuitem", { name: "Your Creator Fee" }).click();
  await page.waitForURL(`**/creator/${creator.toBase58()}`);
});

test("no Raydium SDK or program code ships to the browser", async ({ page, wallet }) => {
  const scripts: { url: string; body: string }[] = [];
  page.on("response", async (res) => {
    if (res.request().resourceType() === "script") scripts.push({ url: res.url(), body: await res.text().catch(() => "") });
  });
  const [launch] = await listLaunches();
  await page.goto("/");
  await page.goto("/launch");
  await connectWallet(page);
  await page.goto(`/coin/${launch!.mint}`);
  await page.waitForLoadState("networkidle");
  await page.goto(`/creator/${launch!.creator}`);
  await page.waitForLoadState("networkidle");
  await page.goto("/docs/claim-creator-fee");
  await page.waitForLoadState("networkidle");
  expect(scripts.length).toBeGreaterThan(0);
  expect(wallet.requests).toHaveLength(0);

  const forbidden = [
    /@raydium-io/,
    /raydium-sdk/i,
    /@launchpad\/chain/,
    /@coral-xyz\/anchor/,
    // LaunchLab program ids (devnet, mainnet): only the API may know them.
    /DRay6fNdQ5J82H7xV6uq2aV3mNrUZ1J4PgSKsWgptcm6/,
    /LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj/,
  ];
  const hits = scripts.flatMap((s) => forbidden.filter((re) => re.test(s.body)).map((re) => `${re} in ${s.url}`));
  expect(hits).toEqual([]);
});
