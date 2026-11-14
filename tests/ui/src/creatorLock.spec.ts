// The Creator Lock on the site (ADR 0023, #211): a Creator locks part of the supply on the launch form, every visitor
// sees it as the coin page's fourth trust mark at each stage, the Creator's own wallet claims what has unlocked after
// Graduation, and the board's card carries a badge for a coin with a lock and for no other.
import type { Page } from "@playwright/test";
import { LAMPORTS_PER_SOL, type Keypair } from "@solana/web3.js";
import { CreatorLockStatus, PreparedLaunch } from "@launchpad/contract";
import { coinBalance, expect, fundedKeypair, graduate, launchViaApi, listLaunches, stackEnv, test, tradeViaApi } from "./fixtures";
import { connectWallet, fillForm, formAlert, signButton, summary } from "./launchPage";
import { connectTestWallet, installTestWallet } from "./wallet";

const DAY = 86_400;

const marks = (page: Page) => page.getByRole("button", { name: /^Before you buy:/ });
const trustPanel = (page: Page) => page.locator("#trust-panel");
const claimCard = (page: Page) => page.getByRole("region", { name: "Your Creator Lock" });
const lockChoice = (page: Page) => page.getByRole("radiogroup", { name: "Creator Lock" });

/** The lock as the API reads it from the chain; null (404) for a coin without one. */
async function lockOf(mint: string) {
  const res = await fetch(`${stackEnv().apiUrl}/v1/launches/${mint}/lock`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`reading the lock of ${mint} failed: ${res.status} ${await res.text()}`);
  return CreatorLockStatus.parse(await res.json());
}

/** The next launch the page prepares, as the API answered it, with the form fields it sent. */
function nextPrepare(page: Page) {
  return page
    .waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/v1/launches/prepare")
    .then(async (r) => ({ body: r.request().postData() ?? "", ok: r.ok(), json: (await r.json()) as unknown }));
}

/** Sells a curve out with one buy from a trader of its own, then plays Raydium's crank. */
async function sellOutAndGraduate(mint: string) {
  await tradeViaApi(await fundedKeypair(5), mint, "buy", BigInt(2 * LAMPORTS_PER_SOL));
  await graduate(mint);
}

async function openTrust(page: Page) {
  await marks(page).click();
  await expect(trustPanel(page)).toBeVisible();
}

test("a Creator locks part of the supply on the form, and the coin carries the lock on-chain, in the API and on its page", async ({ page, wallet }) => {
  expect(wallet.requests).toHaveLength(0);
  await page.goto("/launch");
  await connectWallet(page);
  await fillForm(page, { name: "Vault Keeper", symbol: "VLTK" });

  // Off by default: a launch without a lock is today's launch.
  await expect(lockChoice(page).getByRole("radio", { name: /^No lock/ })).toBeChecked();
  await expect(page.getByRole("group", { name: "Lock size" })).toHaveCount(0);
  await expect(summary(page)).not.toContainText("Creator Lock");

  // On, the steps start at the smallest size and the 30 days the owner named beside 7 days.
  await lockChoice(page).getByText("Lock coins for yourself").click();
  const sizes = page.getByRole("group", { name: "Lock size" });
  const times = page.getByRole("group", { name: "Locked for" });
  await expect(sizes.getByRole("button")).toHaveText(["5%", "10%", "15%", "20%"]);
  await expect(times.getByRole("button")).toHaveText(["7 days", "30 days", "90 days", "180 days", "1 year"]);
  await expect(sizes.getByRole("button", { name: "5%", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(times.getByRole("button", { name: "30 days" })).toHaveAttribute("aria-pressed", "true");
  await sizes.getByRole("button", { name: "10%", exact: true }).click();
  await times.getByRole("button", { name: "7 days" }).click();

  // The summary says the lock in one sentence, and the form what it does to the opening price, from two launch quotes.
  await expect(summary(page)).toContainText("Creator Lock10% of the supply is locked for the Creator; all of it unlocks 7 days after Graduation.");
  await expect(page.getByText(/the same raise buys fewer VLTK, so the curve opens about \d+% higher\. The price at graduation is the same\./)).toBeVisible();

  const prepared = nextPrepare(page);
  await signButton(page).click();
  const answer = await prepared;
  expect(answer.ok).toBe(true);
  expect(answer.body).toMatch(/name="lockBps"\r\n\r\n1000\r\n/);
  expect(answer.body).toMatch(/name="lockCliffSeconds"\r\n\r\n604800\r\n/);
  expect(answer.body).not.toContain('name="lockUnlockSeconds"');
  const launch = PreparedLaunch.parse(answer.json);
  await page.waitForURL(`**/coin/${launch.mint}`);

  // On-chain (read back through the API's chain reader) and in the coin's listing.
  const terms = { bps: 1_000, amount: "100000000000000000", cliffSeconds: 7 * DAY, unlockSeconds: 0 };
  expect((await listLaunches()).find((l) => l.mint === launch.mint)?.creatorLock).toEqual(terms);
  expect(await lockOf(launch.mint)).toMatchObject({ terms, curve: "live", unlockStartsAt: null, stillLocked: terms.amount });

  // Its page: the fourth mark, and its row in the card, in the words before the curve sells out.
  await expect(marks(page)).toContainText("10% locked");
  await openTrust(page);
  await expect(trustPanel(page)).toContainText("10% of the supply is locked for the Creator; all of it unlocks 7 days after Graduation.");
  await expect(trustPanel(page)).toContainText("The clock starts when the curve sells out");
  // The Creator sees their claim waiting for Graduation.
  await expect(claimCard(page)).toContainText("You can claim once VLTK has graduated. Nothing unlocks for 7 days after that.");
  await expect(claimCard(page).getByRole("button", { name: "Claim VLTK" })).toBeDisabled();
});

test("a coin launched from the form without a lock has none on-chain, and its page shows three marks and no claim", async ({ page, wallet }) => {
  expect(wallet.requests).toHaveLength(0);
  await page.goto("/launch");
  await connectWallet(page);
  await fillForm(page, { name: "Open Hand", symbol: "OPHD" });
  const prepared = nextPrepare(page);
  await signButton(page).click();
  const answer = await prepared;
  expect(answer.body).not.toContain('name="lockBps"');
  const launch = PreparedLaunch.parse(answer.json);
  await page.waitForURL(`**/coin/${launch.mint}`);
  expect((await listLaunches()).find((l) => l.mint === launch.mint)?.creatorLock).toBeNull();
  expect(await lockOf(launch.mint)).toBeNull();
  await expect(marks(page)).toContainText("Top 10");
  await expect(marks(page)).not.toContainText("locked");
  await expect(claimCard(page)).toHaveCount(0);
});

test.describe("a lock the API refuses", () => {
  test.use({ expectedHttpErrors: [/\/v1\/launches\/prepare$/] });

  test("is refused in the form before the wallet is asked to sign", async ({ page, wallet }) => {
    // The rule's cap can move between the page's load and the prepare (a Quote Registry refresh): the API refuses, and
    // the form says so where the action is, with nothing signed.
    await page.route("**/v1/launches/prepare", (route) =>
      route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "A Creator can lock 10% of the supply at most." }) }),
    );
    await page.goto("/launch");
    await connectWallet(page);
    await fillForm(page, { name: "Cap Moved", symbol: "CAPM" });
    await lockChoice(page).getByText("Lock coins for yourself").click();
    await page.getByRole("group", { name: "Lock size" }).getByRole("button", { name: "20%", exact: true }).click();
    await signButton(page).click();
    await expect(formAlert(page)).toHaveText("A Creator can lock 10% of the supply at most.");
    expect(wallet.requests).toHaveLength(0);
  });
});

test("the coin page's mark reads at each stage of the lock, and another wallet sees no claim", async ({ page }) => {
  const creator = await fundedKeypair(5);
  // A cliff of seven days: locked from launch, through the sell-out and the cliff.
  const cliff = await launchViaApi(creator, { name: "Long Winter", symbol: "LWNT", lockBps: "1500", lockCliffSeconds: String(7 * DAY) });
  // No cliff and a week's unlock: unlocking from the sell-out.
  const linear = await launchViaApi(creator, { name: "Slow Thaw", symbol: "THAW", lockBps: "1000", lockUnlockSeconds: String(7 * DAY) });

  // Before the sell-out.
  await page.goto(`/coin/${cliff}`);
  await expect(marks(page)).toContainText("15% locked");
  await openTrust(page);
  await expect(trustPanel(page)).toContainText("15% of the supply is locked for the Creator; all of it unlocks 7 days after Graduation.");
  await expect(claimCard(page)).toHaveCount(0);

  // During the cliff, dated.
  await sellOutAndGraduate(cliff);
  await page.reload();
  await expect(marks(page)).toContainText("15% locked");
  await openTrust(page);
  await expect(trustPanel(page)).toContainText(/15% of the supply is locked for the Creator until \w{3} \d{1,2}, \d{4}, .+ UTC\./);
  await expect(trustPanel(page)).toContainText("Then all of it unlocks at once.");
  await expect(trustPanel(page).locator("time")).toHaveCount(1);

  // While it unlocks: what is still locked (a hair under the whole lock a moment after the sell-out, said to two decimals).
  await sellOutAndGraduate(linear);
  await page.goto(`/coin/${linear}`);
  await expect(marks(page)).toContainText(/\b\d(\.\d+)?% locked/);
  await expect(claimCard(page)).toHaveCount(0);
  await openTrust(page);
  await expect(trustPanel(page)).toContainText(/still locked for the Creator, unlocking evenly until \w{3} \d{1,2}, \d{4}/);

  // Once all of it has unlocked, by the chain's clock: a week can't pass in a test, so the page's next read is answered
  // with the chain's own answer a week on.
  await page.route(`**/v1/launches/${linear}/lock`, async (route) => {
    const response = await route.fetch();
    const real = CreatorLockStatus.parse(await response.json());
    const json = { ...real, asOf: new Date(Date.parse(real.unlockEndsAt!) + 1_000).toISOString(), creatorShare: { ...real.creatorShare!, unlocked: real.terms.amount } };
    await route.fulfill({ response, json });
  });
  await page.keyboard.press("Escape");
  await expect(marks(page)).toContainText("Lock ended", { timeout: 30_000 });
  await openTrust(page);
  await expect(trustPanel(page)).toContainText(/The Creator's 10% has all unlocked, since \w{3} \d{1,2}, \d{4}/);
});

test("the Creator's wallet claims what has unlocked after Graduation", async ({ page }) => {
  const creator: Keypair = await fundedKeypair(5);
  const mint = await launchViaApi(creator, { name: "First Thaw", symbol: "FTHW", lockBps: "1000", lockUnlockSeconds: String(7 * DAY) });
  await sellOutAndGraduate(mint);
  const wallet = await installTestWallet(page, creator);
  await page.goto(`/coin/${mint}`);
  await connectTestWallet(page, page.getByRole("main").getByRole("button", { name: "Connect wallet" }));

  const card = claimCard(page);
  await expect(card).toContainText(/You can claim [\d,]+ FTHW now\./);
  await expect(card).toContainText("0 of 100,000,000,000 claimed");
  const before = await coinBalance(creator, mint);
  await card.getByRole("button", { name: "Claim FTHW" }).click();
  await expect(card.getByRole("status")).toHaveText(/^Claimed [\d,]+ FTHW to your wallet\.$/);
  expect(wallet.requests).toHaveLength(1);
  expect(await coinBalance(creator, mint)).toBeGreaterThan(before);
  const after = await lockOf(mint);
  expect(BigInt(after!.creatorShare!.claimed)).toBeGreaterThan(0n);
  await expect(card).not.toContainText("0 of 100,000,000,000 claimed");
});

test("the board's card and the share card carry a badge for a coin with a lock and for no other", async ({ page, stack }) => {
  const creator = await fundedKeypair(5);
  const locked = await launchViaApi(creator, { name: "Badge Holder", symbol: "BDGH", lockBps: "2000", lockCliffSeconds: String(30 * DAY) });
  await launchViaApi(creator, { name: "Badge Free", symbol: "BDGF" });
  await page.goto("/coins?view=cards");
  const card = (name: string) => page.locator("[data-coin-card]").filter({ hasText: name });
  await expect(card("Badge Holder").locator("[data-lock-badge]")).toHaveText("20% lock");
  await expect(card("Badge Free")).toBeVisible();
  await expect(card("Badge Free").locator("[data-lock-badge]")).toHaveCount(0);

  // The share card names the lock, its size and its time; a coin without one keeps the card `seo.spec.ts` pins.
  await page.goto(`/coin/${locked}`);
  const named = await page.locator('meta[property="og:image"]').getAttribute("content");
  const url = new URL(named!);
  const res = await page.request.get(`${stack.webUrl}${url.pathname}${url.search}`);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("image/png");
  expect(await res.body()).toMatchSnapshot("share-coin-lock.png");
});
