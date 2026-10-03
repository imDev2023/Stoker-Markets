// The operator issues API keys from the /operator page (#21): a key is shown once, works against the API, is listed
// without its key from then on, and stops working the moment it is revoked.
import { expect, test } from "./fixtures";

const keysCard = (page: import("@playwright/test").Page) => page.getByRole("region", { name: "API keys" });

test("the operator issues an API key, sees it once, and revokes it", async ({ page, stack }) => {
  await page.goto("/operator");
  await page.getByLabel("Operator token").fill(stack.operatorToken);
  await page.getByRole("button", { name: "Open", exact: true }).click();
  const keys = keysCard(page);
  await expect(keys).toBeVisible();

  // At a glance, the permanent metadata count (#44): the seeded Launches are on Arweave (the stand-in), none waiting.
  const glance = page.getByRole("region", { name: "At a glance" });
  await expect(glance.getByText(/^\d+ on Arweave, 0 waiting$/)).toBeVisible();

  await keys.getByLabel("Name").fill("Telegram bot");
  await keys.getByLabel("Requests a minute").fill("120");
  await keys.getByRole("button", { name: "Issue a key" }).click();
  const issued = keys.getByRole("status");
  await expect(issued).toContainText("The key for Telegram bot, shown this once");
  const key = (await issued.locator("pre").textContent())!.trim();
  expect(key).toMatch(/^lp_[A-Za-z0-9_-]{20,}$/);

  // The key works against the API, at the limit the operator chose.
  const me = await fetch(`${stack.apiUrl}/v1/keys/me`, { headers: { "x-api-key": key } });
  expect(me.status).toBe(200);
  expect(await me.json()).toMatchObject({ name: "Telegram bot", rateLimitPerMinute: 120 });

  // Listed without the key, and never shown again: a reload knows the token but not the key.
  const row = () => keys.getByRole("listitem").filter({ hasText: "Telegram bot" });
  await expect(row()).toContainText("120 a minute");
  await page.reload();
  await expect(row()).toBeVisible();
  await expect(keys.getByRole("status")).toHaveCount(0);
  expect(await page.content()).not.toContain(key);

  await row().getByRole("button", { name: "Revoke" }).click();
  await expect(row()).toContainText("revoked");
  await expect(row().getByRole("button", { name: "Revoke" })).toHaveCount(0);
  expect((await fetch(`${stack.apiUrl}/v1/keys/me`, { headers: { "x-api-key": key } })).status).toBe(401);
});
