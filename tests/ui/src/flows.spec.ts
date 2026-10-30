// What a Creator does in the web app, end to end against the real chain and API.
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  COIN_PNG, drain, expect, fundedKeypair, launchViaApi, listLaunches, runFeeCollector, sol, solBalance, test, tradeViaApi,
} from "./fixtures";
import { acceptDisclaimer, COIN, connectWallet, disclaimer, fillForm, formAlert, review } from "./launchPage";
import { connectTestWallet } from "./wallet";

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
  // The coin's own links, within its article: the footer links to Stoker's X and Telegram under the same names.
  for (const [label, href] of [["Website", COIN.website], ["X", COIN.x], ["Telegram", COIN.telegram]])
    await expect(page.getByRole("article").getByRole("link", { name: label, exact: true })).toHaveAttribute("href", href!);
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
  // The on-chain URI is on Arweave (the stand-in here), posted right after the launch was indexed; the image is there too.
  expect(launch!.metadataUri.startsWith(`${stack.turbo.url}/`)).toBe(true);
  await expect.poll(async () => (await page.request.get(launch!.metadataUri)).status(), { timeout: 30_000 }).toBe(200);
  const metadata = await (await page.request.get(launch!.metadataUri)).json();
  expect(metadata).toMatchObject({ name: COIN.name, symbol: COIN.symbol, description: COIN.description });
  expect(metadata.image.startsWith(`${stack.turbo.url}/`)).toBe(true);

  // The board lists it, and its card leads back to the coin page.
  await page.goto("/coins");
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

test("a wallet without enough SOL is told so before signing", async ({ page, wallet }) => {
  // Leave the wallet 0.005 SOL, well under the rent a launch pays.
  await drain(wallet.keypair, 0.005);

  await page.goto("/launch");
  await connectWallet(page);
  await fillForm(page, { name: "Too Poor", symbol: "POOR" });
  await page.getByRole("button", { name: "Review launch" }).click();
  await acceptDisclaimer(page);
  await expect(formAlert(page)).toHaveText("Your wallet doesn't have enough SOL to pay for the launch. Add SOL and try again.");
  await expect(review(page)).toBeHidden();
  expect(wallet.requests).toHaveLength(0);
});

test("a Creator's earnings are their own page, offered once they have launched, and sent by the platform with nothing to claim", async ({ page, wallet, stack }) => {
  const creator = wallet.keypair.publicKey;
  const account = page.getByRole("banner").getByRole("button", { name: creator.toBase58().slice(0, 4), exact: false });

  // A wallet that has launched nothing is offered no earnings page.
  await page.goto("/");
  await connectTestWallet(page, page.getByRole("banner").getByRole("button", { name: "Connect wallet" }));
  await account.click();
  await expect(page.getByRole("menuitem", { name: "Disconnect" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Your earnings" })).toHaveCount(0);

  const mint = await launchViaApi(wallet.keypair, { name: "Fee Earner", symbol: "EARN" });
  const bought = await tradeViaApi(await fundedKeypair(), mint, "buy", BigInt(0.4 * LAMPORTS_PER_SOL));
  // Half of the trade's Platform Fee is the Creator's; the chain itself pays the Creator nothing (ADR 0009).
  expect(bought.fees.creator).toBe("0");
  const share = BigInt(bought.fees.platform) / 2n;
  expect(share).toBeGreaterThan(0n);

  // The coin's page says what its Creator earns and how, without a figure (the Fees page is the one place for one, owner
  // 2026-10-30), and leads to no creator page: a Creator's is their own.
  await page.goto(`/coin/${mint}`);
  const earns = page.getByRole("definition").filter({ hasText: "Sent to the Creator's wallet" });
  await expect(earns).toContainText("Half of what the platform collects on this coin");
  await expect(earns).not.toContainText("%");
  await expect(earns.getByRole("link", { name: "Every fee, explained" })).toHaveAttribute("href", "/fees");
  await expect(page.locator('a[href^="/creator"]')).toHaveCount(0);

  // Now that the wallet has launched a coin, the account menu leads to its earnings; nothing asks for a signature.
  await account.click();
  await page.getByRole("menuitem", { name: "Your earnings" }).click();
  await page.waitForURL("**/creator");
  await expect(page.getByRole("heading", { name: "Your creator earnings" })).toBeVisible();
  const card = page.getByRole("region", { name: "SOL" });
  await expect(card).toContainText(`${sol(share)} SOL`);
  await expect(page.getByRole("link", { name: /EARN\s*Fee Earner/ })).toContainText(`${sol(share)} SOL`);
  await expect(page.getByRole("link", { name: /EARN\s*Fee Earner/ })).toContainText("Earning on its curve");
  await expect(card.getByText("Still to be sent").locator("xpath=following-sibling::dd")).toHaveText(`${sol(share)} SOL`);
  await expect(page.getByText("Nothing sent yet.")).toBeVisible();
  await expect(page.getByRole("button", { name: /claim/i })).toHaveCount(0);
  expect(wallet.requests).toHaveLength(0);

  // The platform's hourly run collects its fee and sends the Creator their share of it: nothing to sign.
  const held = await solBalance(creator);
  await runFeeCollector();
  expect((await solBalance(creator)) - held).toBe(share);
  const sent = page.getByRole("region", { name: "Sent by the platform" });
  await expect(sent.getByRole("listitem")).toHaveCount(1);
  await expect(sent.getByRole("listitem")).toContainText(`${sol(share)} SOL`);
  const tx = new URL((await sent.getByRole("link", { name: "View transaction" }).getAttribute("href"))!);
  expect(tx.pathname).toMatch(/^\/tx\/[1-9A-HJ-NP-Za-km-z]{64,88}$/);
  expect(tx.searchParams.get("customUrl")).toBe(stack.rpcUrl);
  await expect(card.getByText("Sent by the platform").locator("xpath=following-sibling::dd")).toHaveText(`${sol(share)} SOL`);
  await expect(card.getByText("Still to be sent").locator("xpath=following-sibling::dd")).toHaveText("0 SOL");
  expect(wallet.requests).toHaveLength(0);
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
  await page.goto("/creator");
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
