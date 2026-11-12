// Diamond Hands in the web app (#199, ADR 0022): the Holding Weight as its holders see it. The rule announced and then
// in force on the Rewards page, a wallet's own Diamond Hands on a coin's rewards card against what the API answers for
// its Holding Lots, and a Reward Round whose page shows what each payout counted for.
//
// A Holding Day lasts three seconds on this stack (`global-setup.ts`), so with the owner's steps a coin kept 21 seconds
// counts one and a half times and a coin kept 90 seconds twice. The flows share one stack, and every other file works
// its payouts out with every coin counted once: this file announces a version with steps once, and whatever happens
// in it, a version without steps is in force again before it ends (`afterAll`). Its tests run one after another and
// nothing else runs between them. The rules' version number grows with every run of this file; nothing asserts it.
import type { Locator, Page } from "@playwright/test";
import { LAMPORTS_PER_SOL, type Keypair } from "@solana/web3.js";
import { JobRun, LaunchList, type HoldingWeightStep, type RewardRuleVersion, type WalletHolding } from "@launchpad/contract";
import {
  announceRewardRules, coinEarnings, expect, expectHydrated, expectNoHorizontalOverflow, fundedKeypair, launchViaApi, rewardRound, rewardRules,
  runFeeCollector, SCHEME_COOKIE, stackEnv, test, tradeViaApi, walletHolding,
} from "./fixtures";
import { EARNINGS_COINS } from "./seedData";
import { connectFromSite, installTestWallet } from "./wallet";

/** The owner's first steps (ADR 0022): a coin kept 7 days counts one and a half times, a coin kept 30 days twice. */
const STEPS: HoldingWeightStep[] = [{ afterDays: 7, weightBps: 15_000 }, { afterDays: 30, weightBps: 20_000 }];
const ONCE = 10_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const dayMs = () => stackEnv().holdingDaySeconds * 1000;
/** A rules change needs a minute's notice at the least, whatever the stack's lead time (`REWARD_RULES_LEAD_SECONDS_MIN`). */
const LEAD_MS = 60_000;

/** A weight as the site writes it, worked out here from the API's basis points: 15000 is "1.5x", 18333 "1.83x". */
function multiple(bps: number) {
  const hundredths = Math.floor((bps % ONCE) / 100);
  return `${Math.floor(bps / ONCE)}${hundredths ? `.${String(hundredths).padStart(2, "0").replace(/0+$/, "")}` : ""}x`;
}
const daysOf = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;
/** Whole coins as the cards write them: raw units cut to the coin, with thousands separators. */
const coins = (raw: string | bigint) => (BigInt(raw) / 1_000_000n).toLocaleString("en-US");
const short = (address: string) => `${address.slice(0, 4)}…${address.slice(-4)}`;

/** Runs the Reward Engine once, as the operator would: the Holding Checks due, then the rounds. */
async function runEngine() {
  const { apiUrl, operatorToken } = stackEnv();
  const res = await fetch(`${apiUrl}/v1/operator/jobs/reward-rounds`, { method: "POST", headers: { authorization: `Bearer ${operatorToken}` } });
  const run = JobRun.parse(await res.json());
  if (!res.ok || run.status !== "succeeded") throw new Error(`the reward-rounds job failed: ${res.status} ${JSON.stringify(run)}`);
}

/**
 * Runs the Reward Engine until it has made a new Holding Check of the coin, and answers the wallet's lots as that
 * check left them. A coin is checked once in a Holding Day, and a run checks a bounded number of coins, so a run that
 * fell in the day of the coin's last check, or left the coin for later, is followed by another a day on.
 */
async function checkedAgain(mint: string, wallet: Keypair) {
  const before = (await walletHolding(mint, wallet.publicKey)).check?.checkedAt ?? null;
  for (let tries = 0; tries < 20; tries++) {
    await runEngine();
    const holding = await walletHolding(mint, wallet.publicKey);
    if (holding.check && holding.check.checkedAt !== before) return holding;
    await sleep(dayMs());
  }
  throw new Error(`no new Holding Check of ${mint}`);
}

/** Announces a rules version as early as the lead time allows. */
const announced = (plain: RewardRuleVersion, holdingWeights: HoldingWeightStep[], note: string) =>
  announceRewardRules({ minHolding: plain.minHolding, roundThreshold: plain.roundThreshold, holdingWeights }, new Date(Date.now() + LEAD_MS + 2_000), note);

/** Waits until a version is the one in force. */
async function inForce(version: RewardRuleVersion) {
  const wait = new Date(version.effectiveAt).getTime() + 1_000 - Date.now();
  if (wait > 0) await sleep(wait);
  expect((await rewardRules()).inForce).toEqual(version);
}

const handsSection = (page: Page) => page.getByRole("region", { name: "Diamond Hands", exact: true });
const yours = (card: Locator) => card.getByRole("region", { name: "Your Diamond Hands" });
/** A fact of a block, by its label. */
const fact = (block: Locator, label: string) => block.getByText(label, { exact: true }).locator("xpath=following-sibling::dd");
const earningsCard = (page: Page) => page.getByRole("region", { name: "Creator earnings" });

/** A seeded coin's address by its name, through the board's own search: by now the board holds more coins than one page lists. */
async function launchNamed(name: string) {
  const { launches } = LaunchList.parse(await (await fetch(`${stackEnv().apiUrl}/v1/launches?q=${encodeURIComponent(name)}`)).json());
  const launch = launches.find((l) => l.name === name);
  if (!launch) throw new Error(`no seeded coin named ${name}`);
  return launch.mint;
}

/** A steps table reads as the steps themselves: a coin under the first step counts once, then a row a step. */
async function expectSteps(table: Locator, steps: HoldingWeightStep[]) {
  await expect(table.getByRole("columnheader")).toHaveText(["Kept for", "Each coin counts"]);
  await expect(table.getByRole("rowheader")).toHaveText([`Under ${daysOf(steps[0]!.afterDays)}`, ...steps.map((s) => `From ${daysOf(s.afterDays)}`)]);
  await expect(table.getByRole("cell")).toHaveText([multiple(ONCE), ...steps.map((s) => multiple(s.weightBps))]);
}

/** A wallet's lots as its card gathers them: by what they count for now, the heaviest first. */
function byWeight(lots: WalletHolding["lots"]) {
  const groups = new Map<number, { amount: bigint; since: string; lots: number }>();
  for (const lot of lots) {
    const g = groups.get(lot.weightBps) ?? { amount: 0n, since: lot.since, lots: 0 };
    groups.set(lot.weightBps, { amount: g.amount + BigInt(lot.amount), since: lot.since < g.since ? lot.since : g.since, lots: g.lots + 1 });
  }
  return [...groups.entries()].sort((a, b) => b[0] - a[0]).map(([weightBps, g]) => ({ weightBps, ...g }));
}

/** The looks a baseline is kept in. The flows run at the first; what is new is shot at each. */
const LOOKS = [
  { name: "desktop-light", viewport: { width: 1440, height: 900 }, scheme: "light" },
  { name: "desktop-dark", viewport: { width: 1440, height: 900 }, scheme: "dark" },
  { name: "phone-light", viewport: { width: 390, height: 844 }, scheme: "light" },
  { name: "phone-dark", viewport: { width: 390, height: 844 }, scheme: "dark" },
] as const;

/**
 * A page settled for an element shot: fonts in, the pointer parked, and the sticky header, which would sit over the top
 * of an element taller than the window, scrolling away with the page (`unstickHeader` in visual.spec.ts).
 */
async function settled(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  await expectHydrated(page);
  await page.addStyleTag({ content: "body > header { position: static !important; } html { scroll-padding-top: 0 !important; }" });
  await page.mouse.move(0, 0);
  await expectNoHorizontalOverflow(page);
}

test.describe.serial("Diamond Hands", () => {
  /** The plain rules every other file runs under: the version in force when this file starts. Null until it is read. */
  let plain: RewardRuleVersion | null = null;
  /** The version with the steps. */
  let weighted: RewardRuleVersion;
  /** HAUL: a standard coin whose Creator's earnings go to its holders. No round moves its coins, so its lots follow from this file's buys alone. */
  let dividendCoin: string;
  /** GARD: a Reward Launch, whose Holder rewards card carries the same block. */
  let taxCoin: string;
  /** The holder who keeps their coins from before the steps are announced, and the one who buys once they are in force. */
  let keeper: Keypair, late: Keypair;

  test.afterAll(async () => {
    // Whatever happened above, a version without steps is in force when this file ends and none with steps is waiting:
    // every other file's rounds count every coin once.
    test.setTimeout(180_000);
    if (!plain) return;
    const { inForce: now, upcoming } = await rewardRules();
    const all = [...(now ? [now] : []), ...upcoming];
    const lastWeighted = Math.max(0, ...all.filter((r) => r.holdingWeights.length > 0).map((r) => new Date(r.effectiveAt).getTime()));
    if (lastWeighted === 0) return;
    let back = all.find((r) => r.holdingWeights.length === 0 && new Date(r.effectiveAt).getTime() > lastWeighted);
    if (!back)
      back = await announceRewardRules(
        { minHolding: plain.minHolding, roundThreshold: plain.roundThreshold, holdingWeights: [] }, new Date(Math.max(Date.now() + LEAD_MS + 2_000, lastWeighted + 1_000)),
        "rewardsWeight.spec.ts: the plain rules again",
      );
    await inForce(back);
    expect((await rewardRules()).upcoming).toEqual([]);
  });

  test("the Rewards page says nothing of Diamond Hands until it is announced, then shows the steps and what a holder must know", async ({ page, context, baseURL }) => {
    // A minute's notice before the steps apply, on top of the launches, the trades and the first Holding Check.
    test.setTimeout(300_000);
    plain = (await rewardRules()).inForce!;
    expect(plain.holdingWeights).toEqual([]);
    keeper = await fundedKeypair();
    late = await fundedKeypair();
    await installTestWallet(page, keeper);
    const creator = await fundedKeypair();
    dividendCoin = await launchViaApi(creator, { name: "Long Haul", symbol: "HAUL", earningsDestination: "holders" });
    taxCoin = await launchViaApi(creator, { name: "Old Guard", symbol: "GARD", rewardTax: "500", rewardPayout: "coin" });
    await tradeViaApi(keeper, dividendCoin, "buy", BigInt(0.3 * LAMPORTS_PER_SOL));
    await tradeViaApi(keeper, taxCoin, "buy", BigInt(0.1 * LAMPORTS_PER_SOL));
    // The first Holding Check of each coin: every coin held now starts its age here, before any weight is announced.
    const first = await checkedAgain(dividendCoin, keeper);
    expect(first.lots).toMatchObject([{ weightBps: ONCE }]);
    if (!(await walletHolding(taxCoin, keeper.publicKey)).check) await checkedAgain(taxCoin, keeper);

    // Before any version has steps: no section on the Rewards page, and no block on a coin's card, connected or not.
    await page.goto("/rewards");
    await expect(page.getByRole("heading", { level: 1, name: "Holder rewards" })).toBeVisible();
    await expect(handsSection(page)).toHaveCount(0);
    await expect(page.getByRole("main")).not.toContainText("Diamond Hands");
    await page.goto(`/coin/${dividendCoin}`);
    await connectFromSite(page);
    await expect(earningsCard(page)).toContainText("At launch, the Creator of HAUL pointed their earnings on this coin at its holders, for good.");
    await expect(page.getByRole("main")).not.toContainText("Diamond Hands");

    // Announced: the section says when it begins, with the steps it brings, and that every coin counts once until then.
    weighted = await announced(plain, STEPS, "rewardsWeight.spec.ts: Diamond Hands");
    await page.goto("/rewards");
    const section = handsSection(page);
    await expect(section).toHaveAttribute("data-diamond-hands", "announced");
    await expect(section).toContainText("Coins you keep longer count for more in every Reward Round.");
    await expect(section).toContainText("It applies to every round alike: Holder Rewards, paid from a coin's Reward Tax, and Holder Dividends, paid from its Creator's earnings.");
    await expect(section.locator("[data-diamond-hands-now]")).toHaveText("Until it begins, every coin counts once.");
    const change = section.locator("[data-diamond-hands-change]");
    await expect(change).toHaveCount(1);
    await expect(change).toContainText("Diamond Hands begins");
    await expect(change.locator("time")).toHaveAttribute("datetime", weighted.effectiveAt);
    await expectSteps(change.getByRole("table"), STEPS);
    await expect(section.getByRole("table", { name: "Diamond Hands steps in force" })).toHaveCount(0);
    // The four things a holder must know, one line each.
    await expect(section.getByRole("list", { name: "What a holder must know" }).getByRole("listitem")).toHaveText([
      "A sell takes your newest coins first, so the coins you keep stay as old as they were.",
      "Coins sent to another wallet start again there, as new coins.",
      "Balances are looked at once a day, so a coin's age runs from the first daily check that sees it in your wallet.",
      "The platform's treasury holds coins too, and its coins always count once.",
    ]);
    // The words the glossary keeps for other things never reach a holder.
    await expect(section).not.toContainText(/loyalty|level|tier|boost|staking|token/i);
    // The announced version's own line carries the steps, and until they apply a share is by plain holdings.
    await expect(page.getByRole("region", { name: "Announced changes" }).getByRole("listitem")).toContainText("Diamond Hands: 1.5x after 7 days, 2x after 30 days.");
    const rulesCard = page.getByRole("region", { name: "Rules in force" });
    await expect(rulesCard).toContainText("Each wallet's share is its holding over every eligible holding at the round's snapshot. The curve's");
    await expectNoHorizontalOverflow(page);

    // In force: the steps as the rule's own table, from the version the API answers, and nothing left to announce.
    await inForce(weighted);
    await page.reload();
    await expect(section).toHaveAttribute("data-diamond-hands", "in-force");
    await expectSteps(section.getByRole("table", { name: "Diamond Hands steps in force" }), (await rewardRules()).inForce!.holdingWeights);
    await expect(change).toHaveCount(0);
    await expect(section.locator("[data-diamond-hands-now]")).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Announced changes" })).toHaveCount(0);
    await expect(rulesCard).toContainText("at the round's snapshot, each coin counted at its Diamond Hands weight.");

    // The section at every look: it holds the steps and the copy and no time, address or amount.
    for (const look of LOOKS) {
      await context.addCookies([{ name: SCHEME_COOKIE, value: look.scheme, url: baseURL! }]);
      await page.setViewportSize(look.viewport);
      await page.goto("/rewards");
      await expect(section).toHaveAttribute("data-diamond-hands", "in-force");
      await settled(page);
      await expect(section).toHaveScreenshot(`diamond-hands-rules-${look.name}.png`, { mask: [section.locator("time")] });
    }
  });

  test("a holder sees their own Diamond Hands on a coin's card, as the API answers their Holding Lots", async ({ page, context, baseURL }) => {
    // Up to a minute and a half for the first coins to reach the last step, and 21 seconds for the newer ones to reach the first.
    test.setTimeout(300_000);
    await installTestWallet(page, keeper);
    // A second buy once the steps are in force, seen by the next Holding Check: an old lot and a new one.
    await tradeViaApi(keeper, dividendCoin, "buy", BigInt(0.15 * LAMPORTS_PER_SOL));
    expect((await checkedAgain(dividendCoin, keeper)).lots).toHaveLength(2);
    // The coins from before the announcement are past the last step, and the new ones reach the first 21 seconds after
    // their check: the answer in which the two count differently is the one the card is shot with, further down.
    let mixed!: WalletHolding;
    await expect
      .poll(async () => (mixed = await walletHolding(dividendCoin, keeper.publicKey)).lots.map((l) => l.weightBps), { timeout: 120_000, intervals: [500] })
      .toEqual([20_000, 15_000]);
    expect(mixed).toMatchObject({ flat: false, rulesVersion: weighted.version });
    expect(mixed.weightBps).toBeGreaterThan(15_000);
    expect(mixed.weightBps).toBeLessThan(20_000);

    // Not connected: the card is as it always was. Connected: the block, and every figure in it is the API's.
    await page.goto(`/coin/${dividendCoin}`);
    await expectHydrated(page);
    const card = earningsCard(page);
    await expect(card).toHaveAttribute("data-earnings-rule", "holders");
    await expect(yours(card)).toHaveCount(0);
    await connectFromSite(page);
    const block = yours(card);
    await expect(block).toHaveAttribute("data-hands", "lots");
    // A lot can reach its next step between two reads, so the page and the API are read again until they agree.
    await expect(async () => {
      await page.reload();
      const holding = await walletHolding(dividendCoin, keeper.publicKey);
      const groups = byWeight(holding.lots);
      await expect(block.locator("[data-hands-weight]")).toHaveText(multiple(holding.weightBps), { timeout: 5_000 });
      await expect(fact(block, "Coins seen in your wallet")).toHaveText(`${coins(holding.held)} HAUL`, { timeout: 1_000 });
      await expect(fact(block, "Balances last looked at").locator("time")).toHaveAttribute("datetime", holding.check!.checkedAt, { timeout: 1_000 });
      const rows = block.getByRole("list", { name: "Your coins by what they count for" }).getByRole("listitem");
      await expect(rows).toHaveCount(groups.length, { timeout: 1_000 });
      for (const [i, g] of groups.entries()) {
        await expect(rows.nth(i)).toContainText(`${coins(g.amount)} HAUL${g.lots > 1 ? ", the oldest first seen" : " first seen"}`, { timeout: 1_000 });
        await expect(rows.nth(i)).toContainText(`each counts ${multiple(g.weightBps)}`, { timeout: 1_000 });
        await expect(rows.nth(i).locator("time")).toHaveAttribute("datetime", g.since, { timeout: 1_000 });
      }
      expect(await walletHolding(dividendCoin, keeper.publicKey)).toEqual(holding);
    }).toPass({ timeout: 60_000 });
    await expect(block.getByRole("link", { name: "How Diamond Hands works" })).toHaveAttribute("href", "/rewards#diamond-hands");
    await expect(block).not.toContainText(/loyalty|level|tier|boost|staking|token/i);
    await expectNoHorizontalOverflow(page);

    // The card at every look, with the answer read above while the two lots counted differently: the newer lot reaches
    // the last step a minute later, and a shot must not depend on which side of that the run was. Its amounts follow
    // from the two fixed buys on a new curve; its times are masked.
    const holdings = new RegExp(`/v1/launches/${dividendCoin}/holdings/`);
    await page.route(holdings, async (route) => route.fulfill({ response: await route.fetch(), json: mixed }));
    for (const look of LOOKS) {
      await context.addCookies([{ name: SCHEME_COOKIE, value: look.scheme, url: baseURL! }]);
      await page.setViewportSize(look.viewport);
      await page.goto(`/coin/${dividendCoin}`);
      await expect(block.locator("[data-hands-weight]")).toHaveText(multiple(mixed.weightBps));
      await expect(block.getByRole("listitem")).toHaveCount(2);
      await expect(page.locator('[data-chart="loading"]')).toHaveCount(0, { timeout: 60_000 });
      await settled(page);
      await expect(card).toHaveScreenshot(`diamond-hands-card-${look.name}.png`, { mask: [card.locator("time")] });
    }
    await page.setViewportSize(LOOKS[0].viewport);

    // The treasury's coins always count once, whatever its lots say. No test holds the treasury's key, so the card is
    // shown the same answer with the API's own mark for it set.
    await page.unroute(holdings);
    await page.route(holdings, async (route) => route.fulfill({ response: await route.fetch(), json: { ...mixed, flat: true, weightBps: ONCE } }));
    await page.goto(`/coin/${dividendCoin}`);
    await expect(block).toHaveAttribute("data-hands", "flat");
    await expect(block.locator("[data-hands-line]")).toContainText("This wallet is the platform's treasury. Its coins always count once in a round, however long it keeps them.");
    await page.unroute(holdings);

    // A Reward Launch's Holder rewards card carries the same block, from the same read.
    await page.goto(`/coin/${taxCoin}`);
    const taxBlock = yours(page.getByRole("region", { name: "Holder rewards" }));
    await expect(taxBlock).toHaveAttribute("data-hands", "lots");
    await expect(async () => {
      await page.reload();
      const holding = await walletHolding(taxCoin, keeper.publicKey);
      await expect(taxBlock.locator("[data-hands-weight]")).toHaveText(multiple(holding.weightBps), { timeout: 5_000 });
      await expect(fact(taxBlock, "Coins seen in your wallet")).toHaveText(`${coins(holding.held)} GARD`, { timeout: 1_000 });
      expect(await walletHolding(taxCoin, keeper.publicKey)).toEqual(holding);
    }).toPass({ timeout: 60_000 });
  });

  test("a round's page shows what each payout counted for, and each payout is its share of the pot by Weighted Holding", async ({ page }) => {
    test.setTimeout(300_000);
    await installTestWallet(page, late);
    // A new holder buys now. No Holding Check has seen their coins yet, and their card says when one will.
    await tradeViaApi(late, dividendCoin, "buy", BigInt(0.15 * LAMPORTS_PER_SOL));
    expect((await walletHolding(dividendCoin, late.publicKey)).lots).toEqual([]);
    await page.goto(`/coin/${dividendCoin}`);
    await connectFromSite(page);
    const block = yours(earningsCard(page));
    await expect(block).toHaveAttribute("data-hands", "none");
    await expect(block.locator("[data-hands-line]")).toContainText(
      "No coins have been seen in this wallet yet. Balances are looked at once a day: the HAUL you hold now will be seen at the next daily check, and each coin counts once until you have kept it past a step.",
    );

    // The platform's hourly run opens the coin's round out of the Creator's share of the three buys, weighed at its
    // snapshot, and the Reward Engine pays it.
    await runFeeCollector();
    await runEngine();
    const { rounds } = await coinEarnings(dividendCoin);
    expect(rounds).toHaveLength(1);
    const round = await rewardRound(rounds[0]!.id);
    expect(round).toMatchObject({ source: "earnings", status: "paid", rulesVersion: weighted.version, eligibleHolders: 2 });
    // Every payout from the round's own figures: its share of the pot by Weighted Holding, rounded down.
    const [pot, total] = [BigInt(round.pot), BigInt(round.weightedTotal!)];
    expect(round.payouts.reduce((sum, p) => sum + BigInt(p.weightedHolding), 0n)).toBe(total);
    for (const p of round.payouts) expect(BigInt(p.amount), p.wallet).toBe((pot * BigInt(p.weightedHolding)) / total);
    const payoutOf = (wallet: Keypair) => round.payouts.find((p) => p.wallet === wallet.publicKey.toBase58())!;
    const weightOf = (wallet: Keypair) => Number(BigInt(payoutOf(wallet).weightedHolding) / BigInt(payoutOf(wallet).holding));
    // The long holder's coins count for more than once, the new holder's once, so the long holder is paid more per coin.
    expect(weightOf(keeper)).toBeGreaterThan(15_000);
    expect(BigInt(payoutOf(late).weightedHolding)).toBe(BigInt(payoutOf(late).holding) * BigInt(ONCE));
    expect(BigInt(payoutOf(keeper).amount) * BigInt(payoutOf(late).holding)).toBeGreaterThan(BigInt(payoutOf(late).amount) * BigInt(payoutOf(keeper).holding));

    // The round's page: each payout with what its holding counted for, and how a payout is worked out under the list.
    await page.goto(`/rewards/rounds/${round.id}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("HAUL round of");
    const payouts = page.getByRole("region", { name: "Payouts" });
    const row = (wallet: Keypair) => payouts.getByRole("listitem").filter({ hasText: short(wallet.publicKey.toBase58()) });
    await expect(payouts.getByRole("listitem")).toHaveCount(2);
    await expect(row(keeper).locator("[data-weight]")).toHaveText(multiple(weightOf(keeper)));
    await expect(row(keeper)).toContainText(`, counted ${multiple(weightOf(keeper))} · paid`);
    await expect(row(late)).toContainText(", counted 1x · paid");
    const weighing = payouts.locator("[data-weighing]");
    await expect(weighing).toContainText("A payout is its wallet's share of the pot by Weighted Holding");
    await expect(weighing.getByRole("link", { name: "How Diamond Hands works" })).toHaveAttribute("href", "/rewards#diamond-hands");
    await expectNoHorizontalOverflow(page);

    // A wallet's own rewards say what its coins counted for where that was more than once, and nothing where it was not.
    await page.goto(`/rewards/${keeper.publicKey.toBase58()}`);
    const mine = page.getByRole("region", { name: "Rewards" }).getByRole("listitem").filter({ hasText: "HAUL" });
    await expect(mine).toHaveCount(1);
    await expect(mine).toContainText(`· your coins counted ${multiple(weightOf(keeper))} · paid`);
    await page.goto(`/rewards/${late.publicKey.toBase58()}`);
    const theirs = page.getByRole("region", { name: "Rewards" }).getByRole("listitem").filter({ hasText: "HAUL" });
    await expect(theirs).toHaveCount(1);
    await expect(theirs).not.toContainText("counted");

    // A round where every coin counted once reads as it always has: the seed's round, paid before any steps.
    const seeded = await launchNamed(EARNINGS_COINS.holders);
    const before = (await coinEarnings(seeded)).rounds.at(-1)!;
    expect(new Date(before.startedAt).getTime()).toBeLessThan(new Date(weighted.effectiveAt).getTime());
    await page.goto(`/rewards/rounds/${before.id}`);
    await expect(page.getByRole("region", { name: "Payouts" }).getByRole("listitem").first()).toContainText("held");
    await expect(page.locator("[data-weight]")).toHaveCount(0);
    await expect(page.locator("[data-weighing]")).toHaveCount(0);
    await expect(page.getByRole("main")).not.toContainText("counted");

    // The plain rules are announced again, and the Rewards page says when Diamond Hands ends, under the steps still in force.
    const back = await announced(plain!, [], "rewardsWeight.spec.ts: the plain rules again");
    await page.goto("/rewards");
    const section = handsSection(page);
    await expect(section).toHaveAttribute("data-diamond-hands", "in-force");
    await expect(section.getByRole("table", { name: "Diamond Hands steps in force" })).toBeVisible();
    const change = section.locator("[data-diamond-hands-change]");
    await expect(change).toContainText("Diamond Hands ends");
    await expect(change.locator("time")).toHaveAttribute("datetime", back.effectiveAt);
    await expect(change).toContainText("From then on every coin counts once again, however long it has been kept.");
    await expect(page.getByRole("region", { name: "Announced changes" }).getByRole("listitem")).toContainText("Diamond Hands ends: every coin counts once.");
  });
});
