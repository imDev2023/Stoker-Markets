// Sign in (ADR 0016): the one sheet with the social and email sign-ins and the wallets, through the provider's stand-in;
// the Stoker wallet a sign-in gets, which launches like any wallet; and the sheet with the wallets alone when there is
// no provider.
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { fillForm, review, signButton } from "./launchPage";
import { SIGN_IN_ACCOUNTS, STAND_IN_SECRET, STOKER_WALLET_NAME, TEST_WALLET_NAME, openSignIn, signInState } from "./wallet";

const headerSignIn = (page: Page) => page.getByRole("banner").getByRole("button", { name: "Sign in" });
const connectedAs = (page: Page, name: string) => page.getByRole("banner").getByTitle(`Connected with ${name}`);

test("a Google sign-in gets a Stoker wallet that launches a coin, and signing out ends the session", async ({ page, wallet }) => {
  await page.goto("/launch");
  const sheet = await openSignIn(page, page.getByRole("main").getByRole("button", { name: "Sign in" }));
  await expect(sheet.getByRole("list", { name: "Sign in with" }).getByRole("button")).toHaveText([
    "Continue with Google",
    "Continue with Apple",
    "Continue with GitHub",
    "Continue with X",
  ]);
  await expect(sheet.getByRole("textbox", { name: "Email" })).toBeVisible();
  await expect(sheet.getByRole("list", { name: "Wallets" }).getByRole("button")).toHaveText([TEST_WALLET_NAME]);
  await expect(sheet).toContainText("made and held with Web3Auth");
  await sheet.getByRole("button", { name: "Continue with Google" }).click();
  await expect(sheet).toHaveCount(0);

  // The Stoker wallet connects by itself and the form is ready to review; the menu names the sign-in and the wallet.
  await expect(page.getByRole("button", { name: "Review launch" })).toBeVisible();
  const address = wallet.keypair.publicKey.toBase58();
  await connectedAs(page, STOKER_WALLET_NAME).click();
  const menu = page.getByRole("menu", { name: `Connected with ${STOKER_WALLET_NAME}` });
  await expect(menu).toContainText(SIGN_IN_ACCOUNTS.google);
  await expect(menu).toContainText("Your Stoker wallet");
  await expect(menu).toContainText(address);
  await expect(menu.getByText(/\d\.\d{4} SOL/)).toBeVisible();
  await expect(menu.getByRole("button", { name: "Copy address" })).toBeVisible();
  // Export key shows the secret in the site's own dialog, once.
  await menu.getByRole("menuitem", { name: "Export key" }).click();
  const exportDialog = page.getByRole("dialog", { name: /secret key/ });
  await expect(exportDialog).toContainText(STAND_IN_SECRET);
  await expect(exportDialog.getByRole("button", { name: "Copy secret key" })).toBeVisible();
  await exportDialog.getByRole("button", { name: "Done" }).click();
  await expect(exportDialog).toHaveCount(0);
  expect((await signInState(page)).exports).toBe(1);
  await expect(menu).toHaveCount(0);

  // The launch is signed by the Stoker wallet after the site's own review, with no wallet prompt.
  await fillForm(page, { name: "Signed In", symbol: "SGND" });
  await page.getByRole("button", { name: "Review launch" }).click();
  await expect(review(page)).toBeVisible();
  await signButton(page).click();
  await page.waitForURL(/\/coin\/[1-9A-HJ-NP-Za-km-z]{32,44}$/);
  expect(wallet.requests).toHaveLength(1);
  expect(wallet.requests[0]!.message.staticAccountKeys[0]!.equals(wallet.keypair.publicKey)).toBe(true);

  // The session holds across a page load: the Stoker wallet connects again by itself.
  await page.goto("/coins");
  await expect(connectedAs(page, STOKER_WALLET_NAME)).toBeVisible();

  // Signing out disconnects the wallet and ends the provider's session, so nothing reconnects, not after a load either.
  await connectedAs(page, STOKER_WALLET_NAME).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(headerSignIn(page)).toBeVisible();
  const state = await signInState(page);
  expect(state.logouts).toBe(1);
  expect(state.authenticated).toBe(false);
  await page.reload();
  await expect(headerSignIn(page)).toBeVisible();
});

test("an email sign-in goes through the provider's code page", async ({ page, wallet }) => {
  await page.goto("/coins");
  const sheet = await openSignIn(page, headerSignIn(page));
  // The field is type="email", so the browser itself refuses a malformed address before anything is sent.
  const email = sheet.getByRole("textbox", { name: "Email" });
  await email.fill("ada@example.com");
  await sheet.getByRole("button", { name: "Continue with email" }).click();
  await expect(sheet).toHaveCount(0);
  const state = await signInState(page);
  expect(state.emails).toEqual(["ada@example.com"]);
  expect(state.account).toEqual({ provider: "email", label: "ada@example.com", picture: null });
  await connectedAs(page, STOKER_WALLET_NAME).click();
  await expect(page.getByRole("menu", { name: `Connected with ${STOKER_WALLET_NAME}` })).toContainText("ada@example.com");
  expect(wallet.requests).toHaveLength(0);
});

test.describe("without a provider", () => {
  test.use({ socialSignIn: false });

  test("the sheet offers the wallets alone", async ({ page, wallet }) => {
    await page.goto("/coins");
    const sheet = await openSignIn(page, headerSignIn(page));
    await expect(sheet.getByRole("button", { name: /^Continue with/ })).toHaveCount(0);
    await expect(sheet.getByRole("textbox")).toHaveCount(0);
    await expect(sheet).not.toContainText("Web3Auth");
    await expect(sheet.getByRole("list", { name: "Wallets" }).getByRole("button")).toHaveText([TEST_WALLET_NAME]);
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
    expect(wallet.requests).toHaveLength(0);
  });
});
