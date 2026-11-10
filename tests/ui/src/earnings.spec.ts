// The Creator Earnings Destination in the web app (ADR 0011): chosen on the launch form, fixed at launch, said on the
// coin's page (the About block and the Creator earnings card) and on the Creator's own page, and followed from the
// rule's rounds and buybacks to their pages. The first two tests hold whatever the rules do; the last two need each
// rule to act when the Creator Forward runs, as the hourly cron would have it.
import type { Page } from "@playwright/test";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { LaunchSummary, PreparedLaunch } from "@launchpad/contract";
import { coinEarnings, expect, fundedKeypair, launchViaApi, runFeeCollector, runRewardRounds, sol, solBalance, test, tradeViaApi } from "./fixtures";
import { connectWallet, fillForm, signButton, summary } from "./launchPage";
import { connectTestWallet } from "./wallet";

const PREPARE = /^\/v1\/launches\/prepare$/;

/** The next launch the page prepares, as the API answered it. */
function nextPrepared(page: Page) {
  return page
    .waitForResponse((r) => r.request().method() === "POST" && PREPARE.test(new URL(r.url()).pathname) && r.ok())
    .then(async (r) => PreparedLaunch.parse(await r.json()));
}

const choice = (page: Page) => page.getByRole("radiogroup", { name: "Creator earnings" });
const card = (page: Page) => page.getByRole("region", { name: "Creator earnings" });
/** A fact of the card by its label. */
const fact = (page: Page, label: string) => card(page).getByText(label, { exact: true }).locator("xpath=following-sibling::dd");
/** An amount of SOL as the card writes it: six decimals at most, the rest cut. */
const shown = (lamports: bigint) => `${sol(lamports - (lamports % 1_000n))} SOL`;
const BUY = BigInt(0.4 * LAMPORTS_PER_SOL);

test("a Creator points a coin's earnings at its holders on the launch form, and the coin's page says where they go", async ({ page, wallet, stack }) => {
  await page.goto("/launch");
  await connectWallet(page);
  await fillForm(page, { name: "Share Alike", symbol: "SHARE" });

  // Four choices right after the launch type, the Creator's own wallet unless they say otherwise, each with one line.
  await expect(choice(page).getByRole("radio")).toHaveCount(4);
  await expect(choice(page).getByRole("radio", { name: "Your wallet Paid to you, with nothing to claim." })).toBeChecked();
  const earn = summary(page).getByText("You earn", { exact: true }).locator("xpath=following-sibling::dd");
  await expect(earn).toHaveText("Half of what we collect");
  await expect(earn.getByRole("link", { name: "Half of what we collect" })).toHaveAttribute("href", "/fees");
  const fixed = page.getByText(/^Fixed at launch: where a coin's earnings go can never be changed\./);
  await expect(fixed).toBeVisible();
  await expect(fixed).not.toContainText("pool");

  // Liquidity needs the coin's pool, and says the earnings wait for it; the summary names each choice in words.
  await choice(page).getByRole("radio", { name: "Liquidity Buys SHARE, pairs it with SOL and locks both in its pool for good." }).check();
  await expect(fixed).toContainText("A coin has no pool until it graduates, so until then your earnings wait.");
  await expect(earn).toHaveText("Half of what we collect, added as locked liquidity");
  await choice(page).getByRole("radio", { name: "Buy back and burn Buys SHARE in its own market and burns what it buys." }).check();
  await expect(earn).toHaveText("Half of what we collect, bought back and burned");
  await choice(page).getByRole("radio", { name: "Your holders Paid to everyone holding SHARE, in SOL, by the size of their holding." }).check();
  await expect(fixed).not.toContainText("pool");
  await expect(earn).toHaveText("Half of what we collect, paid to your holders");
  // Words only: the Fees page is the one place with a figure (owner, 2026-10-30).
  await expect(choice(page)).not.toContainText("%");

  const prepared = nextPrepared(page);
  await signButton(page).click();
  const launch = await prepared;
  expect(launch.earningsDestination).toBe("holders");
  await page.waitForURL(`**/coin/${launch.mint}`);
  expect(wallet.requests).toHaveLength(1);

  // The About block says where the Creator's earnings go, in place of the wallet's sentence.
  const earns = page.locator('[data-earnings="holders"]');
  await expect(earns).toContainText("Half of what the platform collects on this coin");
  await expect(earns).toContainText("Paid to this coin's holders in SOL, on the curve and after graduation, as its Creator fixed at launch.");
  await expect(earns).not.toContainText("%");
  await expect(earns.getByRole("link", { name: "Every fee, explained" })).toHaveAttribute("href", "/fees");
  await expect(page.getByText("Sent to the Creator's wallet")).toHaveCount(0);

  // The card: what the rule does, that the platform's job applies it with every action on the Ledger, and, before
  // anything is collected, nothing to list.
  await expect(card(page)).toHaveAttribute("data-earnings-rule", "holders");
  await expect(card(page)).toContainText("To holders");
  await expect(card(page)).toContainText("At launch, the Creator of SHARE pointed their earnings on this coin at its holders, for good.");
  await expect(card(page)).toContainText("No program on the chain enforces this: the platform's scheduled job applies it");
  await expect(card(page).getByRole("link", { name: "Ledger" })).toHaveAttribute("href", "/revenue#ledger-title");
  await expect(card(page).locator("[data-earnings-waiting]")).toHaveText(
    "Nothing has been collected for the Creator yet. The platform collects its fees about once an hour, and the Creator's share of them comes here.",
  );
  await expect(card(page).getByRole("list")).toHaveCount(0);
  await expect(card(page)).not.toContainText("%");

  // The choice is the coin's, for any client to read.
  const coin = LaunchSummary.parse(await (await fetch(`${stack.apiUrl}/v1/launches/${launch.mint}`)).json());
  expect(coin.earningsDestination).toBe("holders");
});

test("a coin pointed at liquidity keeps its earnings waiting for its pool, and its Creator's page says where each coin's earnings go", async ({ page, wallet }) => {
  const creator = wallet.keypair;
  const pooled = await launchViaApi(creator, { name: "Deep End", symbol: "DEND", earningsDestination: "liquidity" });
  const plain = await launchViaApi(creator, { name: "Plain Sailing", symbol: "PLAIN" });
  const trader = await fundedKeypair();
  const toRule = BigInt((await tradeViaApi(trader, pooled, "buy", BUY)).fees.platform) / 2n;
  const toWallet = BigInt((await tradeViaApi(trader, plain, "buy", BUY)).fees.platform) / 2n;

  // The platform's hourly run: the plain coin's share reaches the wallet, the other coin's never does.
  const held = await solBalance(creator.publicKey);
  await runFeeCollector();
  expect((await solBalance(creator.publicKey)) - held).toBe(toWallet);
  const earnings = await coinEarnings(pooled);
  expect(earnings).toMatchObject({ destination: "liquidity", collected: toRule.toString(), waiting: toRule.toString(), waitsForGraduation: true, buybacks: [] });

  // The coin's page: the share waits for the pool the coin gets when it graduates, and nothing has been added.
  await page.goto(`/coin/${pooled}`);
  await expect(page.locator('[data-earnings="liquidity"]')).toContainText(
    "Kept until the coin graduates, then added to its pool as liquidity locked for good, as its Creator fixed at launch.",
  );
  await expect(card(page)).toHaveAttribute("data-earnings-rule", "liquidity");
  await expect(card(page)).toContainText("To liquidity");
  await expect(card(page)).toContainText("A coin has no pool until it graduates, so until then the earnings wait.");
  await expect(fact(page, "Collected so far")).toHaveText(shown(toRule));
  await expect(fact(page, "Waiting for the pool")).toHaveText(shown(toRule));
  await expect(card(page)).toContainText("Nothing added yet: what has been collected waits for the pool DEND gets when it graduates.");
  // A coin that pays its Creator's wallet has no card, and its page keeps the wallet's words.
  await page.goto(`/coin/${plain}`);
  await expect(page.locator('[data-earnings="wallet"]')).toContainText("Sent to the Creator's wallet with nothing to claim, on the curve and after graduation.");
  await expect(card(page)).toHaveCount(0);

  // The Creator's own page: a second pill on the coin they pointed elsewhere, and what went to rules beside what was sent.
  await page.goto("/creator");
  await connectTestWallet(page, page.getByRole("main").getByRole("button", { name: "Connect wallet" }));
  const pooledRow = page.getByRole("link", { name: /DEND\s*Deep End/ });
  await expect(pooledRow).toContainText("Earning on its curve");
  await expect(pooledRow.locator('[data-earnings="liquidity"]')).toHaveText("To liquidity");
  await expect(page.getByRole("link", { name: /PLAIN\s*Plain Sailing/ }).locator("[data-earnings]")).toHaveCount(0);
  const asset = page.getByRole("region", { name: "SOL" });
  await expect(asset.getByText("Sent by the platform").locator("xpath=following-sibling::dd")).toHaveText(`${sol(toWallet)} SOL`);
  await expect(asset.getByText("To holders, burns or liquidity").locator("xpath=following-sibling::dd")).toHaveText(`${sol(toRule)} SOL`);
  await expect(asset.getByText("Still to be sent").locator("xpath=following-sibling::dd")).toHaveText("0 SOL");
  await expect(page.getByRole("region", { name: "How you are paid" })).toContainText("A coin's earnings go where you pointed them when you launched it");
  expect(wallet.requests).toHaveLength(0);
});

test("a coin's earnings are paid to its holders in a round, and the round's page says where its pot came from", async ({ page }) => {
  const creator = await fundedKeypair();
  const mint = await launchViaApi(creator, { name: "Common Purse", symbol: "PURSE", earningsDestination: "holders" });
  const holder = await fundedKeypair();
  const share = BigInt((await tradeViaApi(holder, mint, "buy", BUY)).fees.platform) / 2n;

  // The Creator Forward opens the round out of what the collector took in, and the Reward Engine pays it: to the one
  // holder, and nothing to the Creator, who holds none of the coin.
  const [creatorHeld, holderHeld] = await Promise.all([solBalance(creator.publicKey), solBalance(holder.publicKey)]);
  await runFeeCollector();
  await runRewardRounds();
  const { rounds, totals } = await coinEarnings(mint);
  expect(rounds).toHaveLength(1);
  const round = rounds[0]!;
  expect(round).toMatchObject({ source: "earnings", status: "paid", eligibleHolders: 1, pot: share.toString() });
  expect(totals.paidToHolders).toBe(round.paid);
  expect(await solBalance(creator.publicKey)).toBe(creatorHeld);
  expect((await solBalance(holder.publicKey)) - holderHeld).toBe(BigInt(round.paid));

  // The coin's page lists the round, paid, and leads to it.
  await page.goto(`/coin/${mint}`);
  await expect(fact(page, "Collected so far")).toHaveText(shown(share));
  await expect(fact(page, "Paid to holders")).toHaveText(shown(BigInt(round.paid)));
  const listed = card(page).getByRole("list", { name: "Earnings rounds" }).getByRole("listitem");
  await expect(listed).toHaveCount(1);
  await expect(listed).toContainText("Paid · 1 holder");
  await expect(card(page).getByRole("link", { name: "The rules, and where your rewards are" })).toHaveAttribute("href", "/rewards");
  await listed.getByRole("link").click();

  // The round's page: its pot is the Creator's earnings, in SOL, never "collected tax" in the coin.
  await page.waitForURL(`**/rewards/rounds/${round.id}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("PURSE round of");
  await expect(page.getByText("At launch, the Creator of PURSE pointed their earnings on this coin at its holders.")).toBeVisible();
  const facts = page.getByRole("region", { name: "Paid in full" });
  await expect(facts.getByText("Creator's earnings", { exact: true }).locator("xpath=following-sibling::dd")).toHaveText(`${sol(share - (share % 100_000n))} SOL`);
  await expect(facts).not.toContainText("tax");
  const payouts = page.getByRole("region", { name: "Payouts" }).getByRole("listitem");
  await expect(payouts).toHaveCount(1);
  await expect(payouts.getByRole("link", { name: "paid" })).toHaveAttribute("href", /\/tx\//);

  // The holder's own rewards say the round paid the Creator's earnings.
  await page.goto(`/rewards/${holder.publicKey.toBase58()}`);
  const reward = page.getByRole("region", { name: "Rewards" }).getByRole("listitem");
  await expect(reward).toHaveCount(1);
  await expect(reward).toContainText("PURSE · Creator's earnings, round of");

  // And the Ledger has the payment, out of the operations wallet to the coin's holders.
  await page.goto("/revenue");
  const entry = page.getByRole("region", { name: "Ledger" }).getByRole("listitem").filter({ hasText: "To the holders of PURSE" });
  await expect(entry).toHaveCount(1);
  await expect(entry).toContainText("Creator Earnings paid to holders");
  await expect(entry).toContainText(`−${sol(BigInt(round.paid))} SOL`);
});

test("a coin's earnings buy it back on its curve and burn it, each buyback with its transaction", async ({ page, stack }) => {
  const creator = await fundedKeypair();
  const mint = await launchViaApi(creator, { name: "Ash Heap", symbol: "ASHP", earningsDestination: "burn" });
  const share = BigInt((await tradeViaApi(await fundedKeypair(), mint, "buy", BUY)).fees.platform) / 2n;

  // The Creator Forward buys the coin back with what the collector took in and burns what it bought; a second run settles
  // a buyback the first could not yet see land.
  const held = await solBalance(creator.publicKey);
  await runFeeCollector();
  if ((await coinEarnings(mint)).buybacks[0]?.status !== "landed") await runFeeCollector();
  const { buybacks, totals } = await coinEarnings(mint);
  expect(buybacks).toHaveLength(1);
  const buyback = buybacks[0]!;
  expect(buyback).toMatchObject({ kind: "burn", venue: "curve", status: "landed" });
  expect(BigInt(buyback.spent!)).toBeLessThanOrEqual(share);
  expect(buyback.burned).toBe(buyback.coins);
  expect(totals).toMatchObject({ buybacks: 1, spent: buyback.spent, burned: buyback.burned });
  expect(await solBalance(creator.publicKey)).toBe(held);

  // The coin's page: what was spent and burned, and the buyback with its transaction on the explorer.
  await page.goto(`/coin/${mint}`);
  await expect(page.locator('[data-earnings="burn"]')).toContainText("Used to buy ASHP back and burn it, on the curve and after graduation, as its Creator fixed at launch.");
  await expect(fact(page, "Spent on buybacks")).toHaveText(shown(BigInt(buyback.spent!)));
  await expect(fact(page, "Burned")).toContainText("ASHP");
  const listed = card(page).getByRole("list", { name: "Buybacks" }).getByRole("listitem");
  await expect(listed).toHaveCount(1);
  await expect(listed).toContainText(/Bought and burned [\d,]+ ASHP on the curve/);
  const tx = new URL((await listed.getByRole("link").getAttribute("href"))!);
  expect(tx.pathname).toBe(`/tx/${buyback.signature}`);
  expect(tx.searchParams.get("customUrl")).toBe(stack.rpcUrl);
  // The buyback is a trade of the coin like anyone's: the first buy, then the platform's.
  await expect(page.getByRole("region", { name: "Trades", exact: true }).getByRole("row")).toHaveCount(3);

  // The Ledger has both halves: the SOL that left the wallet, and the coins burned.
  await page.goto("/revenue");
  const entries = page.getByRole("region", { name: "Ledger" }).getByRole("listitem").filter({ hasText: "Creator Earnings bought back and burned" });
  await expect(entries.filter({ hasText: "Spent buying ASHP in its own market" })).toContainText(`−${sol(BigInt(buyback.spent!))} SOL`);
  await expect(entries.filter({ hasText: "Burned, every coin of ASHP it bought" })).toContainText("ASHP");
});
