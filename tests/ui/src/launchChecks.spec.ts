// The launch page's refusals and its landing, as found on the devnet rehearsal (#222): what the form says to a file
// that is no image, a link the API would refuse, a wallet with no SOL, a click outside the picker, a field changed after
// its check, and a launch the API's node has not seen yet.
import { coinImage, expect, test } from "./fixtures";
import { connectWallet, fillForm, firstBuyField, formAlert, openPicker, signButton, summary } from "./launchPage";

const coinBlock = (page: import("@playwright/test").Page) => page.getByRole("region", { name: "Your coin" });
const fileInput = (page: import("@playwright/test").Page) => page.locator('input[type="file"]');
const types = (page: import("@playwright/test").Page) => page.getByRole("radiogroup", { name: "Launch type" });
const press = (page: import("@playwright/test").Page, group: string, button: string) =>
  page.getByRole("group", { name: group, exact: true }).getByRole("button", { name: button, exact: true }).click();

test("a file that is no image is refused when it is picked, and one that can't be read is taken back out", async ({ page, wallet }) => {
  await page.goto("/launch");
  await connectWallet(page);
  // A text file, which the file dialog's filter would hide and a visitor can still choose.
  await fileInput(page).setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("not an image at all") });
  await expect(formAlert(page)).toHaveText("That file is not a PNG, JPEG, WebP or GIF. Choose an image for your coin.");
  await expect(page.getByAltText("Coin image preview")).toHaveCount(0);
  await expect(coinBlock(page).locator('[data-field="image"]')).toHaveCount(0);
  // A file named as a PNG that holds none.
  await fileInput(page).setInputFiles({ name: "fake.png", mimeType: "image/png", buffer: Buffer.from("not an image at all") });
  await expect(formAlert(page)).toHaveText("That file can't be read as an image. Choose another one.");
  await expect(page.getByAltText("Coin image preview")).toHaveCount(0);
  await expect(coinBlock(page).getByText("Add image")).toBeVisible();
  // A real picture answers for itself.
  await fileInput(page).setInputFiles({ name: "coin.png", mimeType: "image/png", buffer: coinImage("PICT") });
  await expect(formAlert(page)).toHaveCount(0);
  await expect(page.getByAltText("Coin image preview")).toBeVisible();
  await expect(coinBlock(page).locator('[data-field="image"]')).toHaveText("Not a protected coin's image");
  // Nothing was asked of the wallet.
  expect(wallet.requests).toHaveLength(0);
});

test("a verdict stands only beside the value it was given for, and a failed check says nothing", async ({ page, wallet, expectedHttpErrors }) => {
  // The failed check this flow stands in for reaches the console.
  expectedHttpErrors.push(/\/v1\/launches\/check$/);
  await page.goto("/launch");
  await connectWallet(page);
  const verdict = coinBlock(page).locator('[data-field="symbol"]');
  await page.getByLabel("Ticker").fill("VRDA");
  await expect(verdict).toHaveText("Free");
  // The next check is held, as on a slow connection: the changed ticker reads "Checking", never the last one's "Free".
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/v1/launches/check", async (route) => {
    await held;
    await route.continue();
  });
  await page.getByLabel("Ticker").fill("VRDB");
  await expect(verdict).toHaveText("Checking");
  release();
  await expect(verdict).toHaveText("Free");
  await page.unroute("**/v1/launches/check");
  // A check the API could not answer leaves no line, and no old verdict.
  await page.route("**/v1/launches/check", (route) => route.fulfill({ status: 500, headers: { "access-control-allow-origin": "*" }, json: { error: "down" } }));
  const failed = page.waitForResponse((r) => r.url().endsWith("/v1/launches/check") && r.status() === 500);
  await page.getByLabel("Ticker").fill("VRDC");
  await failed;
  await expect(verdict).toHaveCount(0);
  // Nothing was asked of the wallet.
  expect(wallet.requests).toHaveLength(0);
});

test("a refusal leaves the summary once its cause is changed", async ({ page, wallet }) => {
  await page.goto("/launch");
  await connectWallet(page);
  await fillForm(page, { name: "Half And Half", symbol: "HALF" });
  await types(page).getByRole("radio", { name: "Reward Launch, paid in the coin" }).check();
  await press(page, "Reward Burn", "50%");
  await press(page, "Reward Liquidity", "25%");
  await signButton(page).click();
  const refusal = "Holders keep at least half of every reward: burned and to liquidity can be half of it together, at most. Choose smaller shares.";
  await expect(summary(page).getByRole("alert")).toHaveText(refusal);
  await press(page, "Reward Burn", "25%");
  await expect(formAlert(page)).toHaveCount(0);
  // Nothing was asked of the wallet.
  expect(wallet.requests).toHaveLength(0);
});

test("a link without its scheme gets one, and one the API would refuse is refused in the form's words", async ({ page, wallet }) => {
  let prepares = 0;
  page.on("request", (r) => void (r.url().endsWith("/v1/launches/prepare") && prepares++));
  await page.goto("/launch");
  await connectWallet(page);
  await fillForm(page, { name: "Linked Up", symbol: "LINK" });
  const telegram = page.getByRole("textbox", { name: "Telegram" });
  await telegram.fill("t.me/linkedup");
  await telegram.blur();
  await expect(telegram).toHaveValue("https://t.me/linkedup");
  await telegram.fill("javascript:alert(1)");
  await signButton(page).click();
  await expect(formAlert(page)).toHaveText("The Telegram link is not a web address. It starts with https://.");
  await telegram.fill("https://t.me/linkedup");
  await expect(formAlert(page)).toHaveCount(0);
  // A name of spaces passes the browser's own check of a required field.
  await page.getByLabel("Name").fill("   ");
  await signButton(page).click();
  await expect(formAlert(page)).toHaveText("Give your coin a name.");
  expect(prepares).toBe(0);
  // Nothing was asked of the wallet.
  expect(wallet.requests).toHaveLength(0);
});

test("a click outside the pair picker closes it, and one inside it does not", async ({ page }) => {
  await page.goto("/launch");
  await openPicker(page);
  const dialog = page.getByRole("dialog", { name: "Pair with" });
  const box = (await dialog.boundingBox())!;
  // The picker's own padding is the dialog too: a click there stays inside.
  await page.mouse.click(box.x + 6, box.y + 6);
  await expect(dialog).toBeVisible();
  await page.mouse.click(Math.max(2, box.x - 12), box.y + 40);
  await expect(dialog).toBeHidden();
});

test("a wallet that has never held SOL is told to add SOL, as a newer node answers it", async ({ page, stack, wallet }) => {
  // The local chain answers "AccountNotFound"; devnet's node (4.5) answers "InvalidAccountForFee" for the same wallet.
  const rpc = new URL(stack.rpcUrl).origin;
  await page.route(`${rpc}/**`, async (route) => {
    const body = route.request().postDataJSON() as { id: unknown; method?: string } | null;
    if (body?.method !== "simulateTransaction") return route.continue();
    await route.fulfill({
      headers: { "access-control-allow-origin": "*" },
      json: { jsonrpc: "2.0", id: body.id, result: { context: { slot: 1 }, value: { accounts: [null], err: "InvalidAccountForFee", logs: [], unitsConsumed: 0, returnData: null } } },
    });
  });
  await page.goto("/launch");
  await connectWallet(page);
  await fillForm(page, { name: "No Sol Yet", symbol: "NSOL" });
  await signButton(page).click();
  await expect(formAlert(page)).toHaveText("Your wallet has no SOL yet. Add SOL and try again.");
  // Nothing was asked of the wallet.
  expect(wallet.requests).toHaveLength(0);
});

test("a launch the API's node has not seen yet still opens on its coin", async ({ page, wallet, expectedHttpErrors }) => {
  expectedHttpErrors.push(/\/v1\/transactions\//);
  // The API reads a reported transaction from its own node: twice it has not seen it, as on the rehearsal.
  let reports = 0;
  await page.route("**/v1/transactions/*", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    reports++;
    if (reports <= 2) return route.fulfill({ status: 404, headers: { "access-control-allow-origin": "*" }, json: { error: "transaction not found or not confirmed yet" } });
    await route.continue();
  });
  await page.goto("/launch");
  await connectWallet(page);
  await fillForm(page, { name: "Late Seen", symbol: "LATE" });
  await firstBuyField(page).fill("0.01");
  await expect(summary(page)).toContainText("You get");
  await signButton(page).click();
  await page.waitForURL("**/coin/*", { timeout: 60_000 });
  expect(wallet.requests).toHaveLength(1);
  expect(reports).toBe(3);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("LATE");
  await expect(page.getByText("No coin at this address")).toHaveCount(0);
});
