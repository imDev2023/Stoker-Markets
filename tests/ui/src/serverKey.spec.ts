// Pages rendered on the server reach the API from the web server's own address, so the web server names itself with an
// API key and is not counted as one anonymous IP (#45). The key is a server-only secret: no browser request carries it.
import { ApiKeyUsage } from "@launchpad/contract";
import { expect, test } from "./fixtures";

test("the web server calls the API with its own key, and the browser never sees it", async ({ page, stack }) => {
  const key = stack.webApiKey!;
  const used = async () => {
    const me = ApiKeyUsage.parse(await (await fetch(`${stack.apiUrl}/v1/keys/me`, { headers: { "x-api-key": key } })).json());
    expect(me.name).toBe("Web server");
    return me.usage.reduce((sum, m) => sum + m.count, 0);
  };
  const before = await used();

  const fromBrowser: string[] = [];
  page.on("request", (r) => {
    if (r.url().startsWith(stack.apiUrl) && r.headers()["x-api-key"]) fromBrowser.push(r.url());
  });
  await page.goto("/coins");
  await expect(page.getByRole("heading", { name: "Coins", exact: true })).toBeVisible();
  await page.goto("/launch");
  await expect(page.getByRole("heading", { name: "Stoke a coin" })).toBeVisible();
  await page.waitForLoadState("networkidle");

  // Each read of the usage is itself one request with the key; the pages' server-side reads come on top of those.
  expect((await used()) - before).toBeGreaterThan(2);
  expect(fromBrowser).toEqual([]);
  expect(await page.content()).not.toContain(key);
});
