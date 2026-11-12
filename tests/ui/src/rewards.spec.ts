// A Reward Launch's Payout Asset (#43) in the web app: chosen as the launch type, repeated in the review, and stated
// on the coin page, where the Holder Rewards card explains the sales it will make. And Volume Rebates (#196, ADR 0021)
// on the Rewards page: a Rebate Week announced, traded, settled and paid, as its traders see it.
import type { Locator, Page } from "@playwright/test";
import { LAMPORTS_PER_SOL, type Keypair } from "@solana/web3.js";
import { PreparedLaunch, type BudgetShares } from "@launchpad/contract";
import {
  announceBudgetTable, budgetShares, chainTime, expect, expectNoHorizontalOverflow, fundedKeypair, launchViaApi, rebatesPage, runFeeCollector, runRebates,
  SCHEME_COOKIE, sol, stackEnv, test, tradeViaApi, walletRebates,
} from "./fixtures";
import { connectWallet, fillForm, signButton, summary } from "./launchPage";
import { connectTestWallet, installTestWallet } from "./wallet";

const PREPARE = /^\/v1\/launches\/prepare$/;

/** The next launch the page prepares, as the API answered it. */
function nextPrepared(page: Page) {
  return page
    .waitForResponse((r) => r.request().method() === "POST" && PREPARE.test(new URL(r.url()).pathname) && r.ok())
    .then(async (r) => PreparedLaunch.parse(await r.json()));
}

test("a Creator launches a Reward Launch paid in SOL, and the coin page says so", async ({ page, wallet }) => {
  await page.goto("/launch");
  await connectWallet(page);
  await fillForm(page, { name: "Dividend Desk", symbol: "DIVD" });

  // The launch type is the form's first choice, there before anything is ticked: a standard coin unless the Creator
  // says otherwise, and each Reward Launch names its Payout Asset and explains itself once chosen.
  const types = page.getByRole("radiogroup", { name: "Launch type" });
  const terms = page.getByRole("group", { name: "Reward Tax" });
  await expect(types.getByRole("radio")).toHaveCount(3);
  await expect(types.getByRole("radio", { name: /^Standard/ })).toBeChecked();
  // Paying holders from the Creator's earnings, once announced here as a fourth type, is a choice of its own section now
  // (ADR 0011, `earnings.spec.ts`): the launch type keeps to the Reward Tax.
  await expect(types.getByRole("radio", { name: /Holder rewards/ })).toHaveCount(0);
  await expect(terms).toHaveCount(0);
  await types.getByRole("radio", { name: "Reward Launch, paid in the coin" }).check();
  // Five rates, 1% to 5% (owner, 2026-11-07), the lowest chosen until the Creator picks another.
  await expect(terms.getByRole("button")).toHaveText(["1%", "2%", "3%", "4%", "5%"]);
  await expect(terms.getByRole("button", { name: "1%" })).toHaveAttribute("aria-pressed", "true");
  await expect(terms).toContainText("Holders are paid in DIVD itself, never sold. Fixed at launch, like the rate.");
  await types.getByRole("radio", { name: "Reward Launch, paid in SOL" }).check();
  await expect(types.getByRole("radio", { name: "Reward Launch, paid in the coin" })).not.toBeChecked();
  await terms.getByRole("button", { name: "4%" }).click();
  await expect(terms).toContainText(
    "The tax is sold for SOL in small slices, at most 0.5% of the coins in the market per run, and holders are paid in SOL. Fixed at launch, like the rate.",
  );

  const prepared = nextPrepared(page);
  // The summary says the launch type, and the preview card carries the tax as the board's cards do.
  await expect(summary(page)).toContainText(/Launch type\s*Reward Launch, 4%/);
  await expect(page.getByRole("region", { name: "Preview" })).toContainText("4% to holders");
  await signButton(page).click();
  const launch = await prepared;
  expect(launch.rewardTax).toEqual({ bps: 400, payout: "quote" });
  await page.waitForURL(`**/coin/${launch.mint}`);
  expect(wallet.requests).toHaveLength(1);
  await expect(page.getByText("4% of every transfer, paid out to holders in SOL")).toBeVisible();
  const card = page.getByRole("region", { name: "Holder rewards" });
  await expect(card).toContainText("The tax is sold for SOL in small slices, at most 0.5% of the coins in the market per run");
  await expect(card).toContainText("Waiting to be sold");
  await expect(card).toContainText("Pot for the next round");
  await expect(card).toContainText("No round yet: the first runs once enough tax has been sold.");
});

// Volume rebates. A Rebate Week lasts a minute on this stack (`global-setup.ts`), so one ends while the test watches.
// The `rebates` row is given a fifth of what the platform keeps for the length of these tests, out of the treasury's
// share, so no other file's Burn or Flywheel figure moves, and the first table is put back when they end.
const SHARE_BPS = 2000;
/** A curve holds 1 SOL on this stack, so the larger trader buys on two coins and every coin stays on its curve. */
const BUY_LARGE = BigInt(0.8 * LAMPORTS_PER_SOL);
const BUY_SMALL = BigInt(0.25 * LAMPORTS_PER_SOL);
/** 1970-01-05, the epoch's first Monday, which every Rebate Week is counted from (`GRID_ANCHOR_MS` in the API's engine). */
const ANCHOR = 4 * 86_400_000;
const weekMs = () => stackEnv().rebateWeekSeconds * 1000;
const weekOf = (ms: number) => Math.floor((ms - ANCHOR) / weekMs());
const startOf = (week: number) => ANCHOR + week * weekMs();
const iso = (ms: number) => new Date(ms).toISOString();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Both clocks: the chain's dates every trade, and the wall's is the API's "now". They need not agree to the second. */
const clocks = async () => [await chainTime(), Date.now()] as const;

/** A moment the lead time and a little more ahead of both clocks: the soonest a Budget Table may take effect, plus `ms`. */
async function ahead(ms: number) {
  return new Date(Math.max(...(await clocks())) + stackEnv().feeChangeLeadSeconds * 1000 + ms);
}

/** Waits until a moment is a second behind both clocks. */
async function past(ms: number) {
  while (Math.min(...(await clocks())) <= ms + 1_000) await sleep(500);
}

/** A figure of the program's as the page writes it: SOL to six decimals, cut and never rounded up. */
const sol6 = (lamports: bigint) => sol(lamports - (lamports % 1000n));

const rebatesSection = (page: Page) => page.getByRole("region", { name: "Volume rebates", exact: true });
/** A fact of a panel, by its label. */
const fact = (panel: Locator, label: string) => panel.getByText(label, { exact: true }).locator("xpath=following-sibling::dd");

/** The looks a baseline is kept in. The flows run at the first; the section is shot at each, since it is new. */
const LOOKS = [
  { name: "desktop-light", viewport: { width: 1440, height: 900 }, scheme: "light" },
  { name: "desktop-dark", viewport: { width: 1440, height: 900 }, scheme: "dark" },
  { name: "phone-light", viewport: { width: 390, height: 844 }, scheme: "light" },
  { name: "phone-dark", viewport: { width: 390, height: 844 }, scheme: "dark" },
] as const;

test.describe.serial("Volume Rebates", () => {
  /** The table in force before these tests, put back when they end; null until another has been announced. */
  let first: BudgetShares | null = null;
  /** The trader whose rebate stays under the minimum payout. */
  let small: Keypair;

  test.afterAll(async () => {
    if (!first) return;
    const back = await ahead(2_000);
    await announceBudgetTable(first, back, "volume rebates end");
    await past(back.getTime());
  });

  test("a Rebate Week is announced, traded, settled and paid, and its trader sees every step", async ({ page, wallet, stack, context, baseURL }) => {
    // Up to a minute's wait for a new week, then the week itself, on top of the trades and the jobs.
    test.setTimeout(360_000);
    const large = wallet.keypair;
    small = await fundedKeypair();
    const creator = await fundedKeypair();
    const coins: string[] = [];
    for (const [name, symbol] of [["Rebate Row One", "RBTA"], ["Rebate Row Two", "RBTB"], ["Rebate Row Three", "RBTC"]] as const)
      coins.push(await launchViaApi(creator, { name, symbol }));
    // Whatever earlier tests left to collect is taken in under the first table, so the row's budget is this week's alone.
    await runFeeCollector();
    const min = BigInt(stack.rebateMinLamports);

    // Before any share: the program has not begun, as on a new database.
    await page.goto("/rewards");
    const section = rebatesSection(page);
    const state = section.locator("[data-rebates]");
    await expect(state).toHaveAttribute("data-rebates", "idle");

    // Announced: the page names the moment trades begin to earn, in words and without the share, which is the Fees
    // page's; the wallet's panel and the weeks come with the announcement. The share starts with a Rebate Week, the
    // first that leaves the page time to be read as announced, so that week is the first with anything to settle and
    // the only one this test settles.
    const shares = await budgetShares();
    const week = weekOf((await ahead(10_000)).getTime()) + 1;
    const from = new Date(startOf(week));
    await announceBudgetTable({ ...shares, rebates: SHARE_BPS, treasury: shares.treasury - SHARE_BPS }, from, "volume rebates go live");
    first = shares;
    await page.reload();
    await expect(state).toHaveAttribute("data-rebates", "announced");
    await expect(fact(section.getByRole("region", { name: "Announced" }), "Volume rebates begin").locator("time")).toHaveAttribute("datetime", from.toISOString());
    await expect(state).toContainText("A trade made from then on earns its part of its week's pot; a trade made before earns nothing.");
    await expect(state.getByRole("link", { name: "Fees page" })).toHaveAttribute("href", "/fees#volume-rebates");
    await expect(section).not.toContainText("%");
    const mine = section.getByRole("region", { name: "Your rebates" });
    await expect(mine).toContainText("Connect a wallet to see what its trades have earned back.");
    const weeksCard = section.getByRole("region", { name: "Settled weeks" });
    await expect(weeksCard).toContainText("No Rebate Week has been settled yet.");

    // Running: both traders buy as the week begins, and the page shows the week with the Platform Fees paid in it so far.
    await past(from.getTime());
    expect((await clocks()).map(weekOf), "both clocks are in the share's first week").toEqual([week, week]);
    const fees = { large: 0n, small: 0n };
    for (const mint of coins.slice(0, 2)) fees.large += BigInt((await tradeViaApi(large, mint, "buy", BUY_LARGE)).fees.platform);
    fees.small = BigInt((await tradeViaApi(small, coins[2]!, "buy", BUY_SMALL)).fees.platform);
    const total = fees.large + fees.small;
    await page.reload();
    await expect(state).toHaveAttribute("data-rebates", "running");
    const now = section.getByRole("region", { name: "This Rebate Week" });
    await expect(fact(now, "Began").locator("time")).toHaveAttribute("datetime", iso(startOf(week)));
    await expect(fact(now, "Ends").locator("time")).toHaveAttribute("datetime", iso(startOf(week + 1)));
    await expect(fact(now, "Platform Fees paid so far")).toHaveText(`${sol6(total)} SOL`);
    await expect(fact(now, "The week's pot so far, an estimate")).toHaveText(/^[\d.,]+ SOL$/);
    await expect(now).toContainText("The pot is an estimate until the week is settled");
    await expect(section).not.toContainText("%");
    // The connected wallet: what its own trades have paid this week, and the minimum its rebates wait for.
    await connectTestWallet(page, mine.getByRole("button", { name: "Connect wallet" }));
    await expect(fact(mine, "Fees your trades paid this week")).toHaveText(`${sol6(fees.large)} SOL`);
    await expect(fact(mine, "Your rebate so far, an estimate")).toHaveText(/^[\d.,]+ SOL$/);
    await expect(mine.locator("[data-rebates-minimum]")).toHaveText(`What is waiting is sent in one transfer, with nothing to claim, once it reaches ${sol(min)} SOL.`);
    await expect(mine).toContainText("No week has been settled for this wallet yet");

    // The fees are collected, which is what gives the row its budget. Then the operator runs the rebates job from the
    // operator's page once the week has ended: the page is opened ahead, so the run comes a moment after the week's end
    // and settles that week alone.
    await runFeeCollector();
    await page.goto("/operator");
    await page.getByLabel("Operator token").fill(stack.operatorToken);
    await page.getByRole("button", { name: "Open", exact: true }).click();
    const jobs = page.getByRole("region", { name: "Jobs" });
    const run = jobs.getByRole("button", { name: "Run rebates now" });
    await expect(run).toBeVisible();
    await past(startOf(week + 1));
    const answered = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/v1/operator/jobs/rebates");
    await run.click();
    expect((await answered).status()).toBe(200);
    await expect(jobs.getByRole("listitem").filter({ hasText: "rebates" })).toContainText("succeeded");
    // A payment the run did not see land yet is recorded by the next one.
    if ((await walletRebates(large.publicKey)).rebates[0]?.status !== "paid") await runRebates();

    // What the API says of the week: the pot split by the fees each wallet paid, the larger rebate paid, the smaller waiting.
    const { program, weeks } = await rebatesPage();
    expect(weeks).toHaveLength(1);
    const settled = weeks[0]!;
    expect(settled).toMatchObject({ start: iso(startOf(week)), end: iso(startOf(week + 1)), feesLamports: total.toString(), traders: 2 });
    const pot = BigInt(settled.potLamports);
    const share = (fee: bigint) => (pot * fee) / total;
    expect(share(fees.large)).toBeGreaterThanOrEqual(min);
    expect(share(fees.small)).toBeGreaterThan(0n);
    expect(share(fees.small)).toBeLessThan(min);
    const paid = await walletRebates(large.publicKey);
    expect(paid).toMatchObject({ waitingLamports: "0", paidLamports: share(fees.large).toString() });
    expect(paid.rebates).toMatchObject([{ weekStart: settled.start, amountLamports: share(fees.large).toString(), status: "paid" }]);
    const signature = paid.rebates[0]!.signature!;
    expect(settled.paidLamports).toBe(share(fees.large).toString());

    // The Rewards page: the settled week with its traders, its pot and what has been paid, and the totals above it.
    await page.goto("/rewards");
    const weekRows = weeksCard.getByRole("table", { name: "Settled Rebate Weeks" }).getByRole("row");
    await expect(weekRows).toHaveCount(2);
    await expect(weekRows.nth(1).locator("time")).toHaveAttribute("datetime", settled.start);
    await expect(weekRows.nth(1).getByRole("cell")).toHaveText(["2", `${sol6(pot)} SOL`, `${sol6(share(fees.large))} SOL`]);
    await expect(fact(weeksCard, "Paid to traders so far")).toHaveText(`${sol6(BigInt(program.paidLamports))} SOL`);
    await expect(fact(weeksCard, "Waiting to be paid")).toHaveText(`${sol6(BigInt(program.waitingLamports))} SOL`);
    expect(BigInt(program.paidLamports)).toBe(share(fees.large));
    expect(BigInt(program.waitingLamports)).toBe(share(fees.small));
    // The wallet, which the adapter reconnects on a new page: its rebate, to the lamport, paid, with the payment's transaction.
    await expect(fact(mine, "Paid so far")).toHaveText(`${sol(share(fees.large))} SOL`);
    await expect(fact(mine, "Waiting to be paid")).toHaveText("0 SOL");
    const mineRows = mine.getByRole("table", { name: "Your rebates by week" }).getByRole("row");
    await expect(mineRows).toHaveCount(2);
    await expect(mineRows.nth(1).locator("th time")).toHaveAttribute("datetime", settled.start);
    await expect(mineRows.nth(1).getByRole("cell").nth(0)).toHaveText(`${sol6(fees.large)} SOL`);
    await expect(mineRows.nth(1).getByRole("cell").nth(1)).toHaveText(`${sol(share(fees.large))} SOL`);
    const status = mineRows.nth(1).locator("[data-rebate-status]");
    await expect(status).toHaveAttribute("data-rebate-status", "paid");
    await expect(status).toContainText(/^Paid \d+[smh] ago/);
    const tx = new URL((await status.getByRole("link").getAttribute("href"))!);
    expect(tx.pathname).toBe(`/tx/${signature}`);
    expect(tx.searchParams.get("customUrl")).toBe(stack.rpcUrl);
    await expectNoHorizontalOverflow(page);

    // The section with a week behind it, at every look: the times and the payment's signature differ run to run; the
    // amounts follow from the three fixed buys. The week now running has no trade in it.
    for (const look of LOOKS) {
      await context.addCookies([{ name: SCHEME_COOKIE, value: look.scheme, url: baseURL! }]);
      await page.setViewportSize(look.viewport);
      await page.goto("/rewards");
      await expect(fact(mine, "Paid so far")).toHaveText(`${sol(share(fees.large))} SOL`);
      await expect(mine.locator("[data-rebate-status]")).toHaveAttribute("data-rebate-status", "paid");
      await expect(fact(now, "Platform Fees paid so far")).toHaveText("0 SOL");
      await page.waitForLoadState("networkidle");
      await page.evaluate(() => document.fonts.ready);
      // The section is taller than the window, so it is captured while the page is scrolled: the sticky header, which
      // would sit over its top, scrolls away with the page (`unstickHeader` in visual.spec.ts).
      await page.addStyleTag({ content: "body > header { position: static !important; } html { scroll-padding-top: 0 !important; }" });
      await page.mouse.move(0, 0);
      await expectNoHorizontalOverflow(page);
      await expect(section).toHaveScreenshot(`rebates-settled-${look.name}.png`, { mask: [section.locator("time"), section.locator("a.mono")] });
    }
    await page.setViewportSize(LOOKS[0].viewport);

    // The Ledger has the payment, out of the operations wallet to the trader, and the Fees page the row's share.
    await page.goto("/revenue");
    const entry = page.getByRole("region", { name: "Ledger" }).getByRole("listitem").filter({ hasText: "Volume Rebate paid to a trader" });
    await expect(entry).toHaveCount(1);
    await expect(entry).toContainText(`−${sol(share(fees.large))} SOL`);
    await expect(entry.getByRole("link", { name: `${large.publicKey.toBase58().slice(0, 4)}…${large.publicKey.toBase58().slice(-4)}` })).toHaveAttribute("href", new RegExp(`/address/${large.publicKey.toBase58()}`));
    await page.goto("/fees");
    const row = page.getByRole("list", { name: "How the platform's share is divided" }).getByRole("listitem").filter({ hasText: "Volume rebates" });
    await expect(row).toContainText(`${SHARE_BPS / 100}%`);
    await expect(row).not.toContainText("Nothing is set aside yet");
    await expect(page.locator("[data-rebates-terms]")).toContainText(`never more than the row's own share of the fees the trader paid (${SHARE_BPS / 100}% of them now)`);
  });

  test("a rebate under the minimum payout waits, and its wallet is told what it waits for", async ({ page, stack }) => {
    await installTestWallet(page, small);
    const { waitingLamports, rebates } = await walletRebates(small.publicKey);
    expect(rebates).toMatchObject([{ status: "waiting", signature: null, paidAt: null }]);
    expect(BigInt(waitingLamports)).toBeGreaterThan(0n);
    expect(BigInt(waitingLamports)).toBeLessThan(BigInt(stack.rebateMinLamports));

    await page.goto("/rewards");
    const mine = rebatesSection(page).getByRole("region", { name: "Your rebates" });
    await connectTestWallet(page, mine.getByRole("button", { name: "Connect wallet" }));
    await expect(fact(mine, "Waiting to be paid")).toHaveText(`${sol(BigInt(waitingLamports))} SOL`);
    await expect(fact(mine, "Paid so far")).toHaveText("0 SOL");
    await expect(mine.locator("[data-rebates-minimum]")).toContainText(`once it reaches ${sol(BigInt(stack.rebateMinLamports))} SOL`);
    const status = mine.locator("[data-rebate-status]");
    await expect(status).toHaveCount(1);
    await expect(status).toHaveAttribute("data-rebate-status", "waiting");
    await expect(status).toHaveText("Waiting for the minimum");
    await expect(status.getByRole("link")).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });
});
