// A Reward Launch's Payout Asset (#43) in the web app: chosen as the launch type, repeated in the review, and stated
// on the coin page, where the Holder Rewards card explains the sales it will make.
import type { Page } from "@playwright/test";
import { PreparedLaunch } from "@launchpad/contract";
import { expect, test } from "./fixtures";
import { connectWallet, fillForm, review } from "./launchPage";

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
  await expect(types.getByRole("radio")).toHaveCount(4);
  await expect(types.getByRole("radio", { name: /^Standard coin/ })).toBeChecked();
  // The Holder rewards launch (#113) is announced on the form before it exists, and takes no choice yet.
  await expect(types.getByRole("radio", { name: /^Holder rewards Coming soon/ })).toBeDisabled();
  await expect(terms).toHaveCount(0);
  await types.getByRole("radio", { name: /^Reward Launch paid in DIVD/ }).check();
  await expect(terms).toContainText("Holders are paid in DIVD itself, never sold. Fixed at launch, like the rate.");
  await types.getByRole("radio", { name: /^Reward Launch paid in SOL/ }).check();
  await expect(types.getByRole("radio", { name: /^Reward Launch paid in DIVD/ })).not.toBeChecked();
  await terms.getByRole("button", { name: "3%" }).click();
  await expect(terms).toContainText(
    "The tax is sold for SOL in small slices, at most 0.5% of the coins in the market per run, and holders are paid in SOL. Fixed at launch, like the rate.",
  );

  const prepared = nextPrepared(page);
  await page.getByRole("button", { name: "Review launch" }).click();
  const launch = await prepared;
  expect(launch.rewardTax).toEqual({ bps: 300, payout: "quote" });
  await expect(review(page)).toContainText("A Reward Launch: every transfer of DIVD withholds 3% for its holders, the first buy's coins included.");
  await expect(review(page)).toContainText("It is sold for SOL in small slices and paid out in SOL. Nobody can change the rate or the payout asset, now or later.");
  expect(wallet.requests).toHaveLength(0);

  await review(page).getByRole("button", { name: "Sign and launch" }).click();
  await page.waitForURL(`**/coin/${launch.mint}`);
  expect(wallet.requests).toHaveLength(1);
  await expect(page.getByText("3% of every transfer, paid out to holders in SOL")).toBeVisible();
  const card = page.getByRole("region", { name: "Holder rewards" });
  await expect(card).toContainText("The tax is sold for SOL in small slices, at most 0.5% of the coins in the market per run");
  await expect(card).toContainText("Waiting to be sold");
  await expect(card).toContainText("Pot for the next round");
  await expect(card).toContainText("No round yet: the first runs once enough tax has been sold.");
});
