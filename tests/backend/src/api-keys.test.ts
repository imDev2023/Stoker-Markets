// The public API (#21): the web app and third parties use the same endpoints. An integrator gets an API key from the
// operator, sends it on every request, sees its usage, and is rejected cleanly past its rate limit.
import { describe, expect, it } from "vitest";
import { PreparedLaunch } from "@launchpad/contract";
import { env, fundedWallet, PNG, signAndSend } from "./client";

const api = (path: string, init?: RequestInit) => fetch(`${env().apiUrl}${path}`, init);
const operator = () => ({ authorization: `Bearer ${env().operatorToken}`, "content-type": "application/json" });

async function newKey(name: string, rateLimitPerMinute?: number) {
  const res = await api("/v1/operator/api-keys", { method: "POST", headers: operator(), body: JSON.stringify({ name, rateLimitPerMinute }) });
  expect(res.status).toBe(201);
  return (await res.json()) as { id: string; key: string; name: string; rateLimitPerMinute: number };
}

describe("API keys", () => {
  it("are issued by the operator, shown once, and identify the caller on every request", async () => {
    const made = await newKey("Telegram bot");
    expect(made.key).toMatch(/^lp_[A-Za-z0-9]{32,}$/);
    const me = await api("/v1/keys/me", { headers: { "x-api-key": made.key } });
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({ id: made.id, name: "Telegram bot", rateLimitPerMinute: made.rateLimitPerMinute });
    // The operator's list never shows the key itself.
    const list = (await (await api("/v1/operator/api-keys", { headers: operator() })).json()) as { keys: { id: string; key?: string }[] };
    expect(list.keys.find((k) => k.id === made.id)).toBeDefined();
    expect(list.keys.every((k) => !("key" in k))).toBe(true);
    // A made-up key is refused; no key at all is fine on public endpoints.
    expect((await api("/v1/keys/me", { headers: { "x-api-key": "lp_nope" } })).status).toBe(401);
    expect((await api("/v1/launches", { headers: { "x-api-key": "lp_nope" } })).status).toBe(401);
    expect((await api("/v1/launches")).status).toBe(200);
  });

  it("lets an integrator launch a coin for their user through the Launch API", async () => {
    const { key } = await newKey("Launchpad terminal");
    const creator = await fundedWallet();
    const form = new FormData();
    form.set("creator", creator.publicKey.toBase58());
    form.set("quoteMint", "So11111111111111111111111111111111111111112");
    form.set("name", "Terminal coin");
    form.set("symbol", "TERM");
    form.set("image", new Blob([PNG], { type: "image/png" }), "logo.png");
    const res = await api("/v1/launches/prepare", { method: "POST", headers: { "x-api-key": key }, body: form });
    expect(res.status).toBe(200);
    const prepared = PreparedLaunch.parse(await res.json());
    await signAndSend(prepared, creator);
    const usage = (await (await api("/v1/keys/me", { headers: { "x-api-key": key } })).json()) as { usage: { minute: string; count: number }[] };
    expect(usage.usage.reduce((s, u) => s + u.count, 0)).toBeGreaterThanOrEqual(1);
  });

  it("rejects requests past the key's rate limit with 429 and a retry-after, and counts usage per minute", async () => {
    const { key } = await newKey("Greedy bot", 3);
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) statuses.push((await api("/v1/launches?limit=1", { headers: { "x-api-key": key } })).status);
    expect(statuses).toEqual([200, 200, 200, 429, 429]);
    const limited = await api("/v1/launches?limit=1", { headers: { "x-api-key": key } });
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await limited.json()).toMatchObject({ error: expect.stringMatching(/rate limit/i) });
    // Usage is visible to the key even past its limit.
    const me = await api("/v1/keys/me", { headers: { "x-api-key": key } });
    expect(me.status).toBe(200);
    const body = (await me.json()) as { usage: { count: number }[] };
    expect(body.usage.reduce((s, u) => s + u.count, 0)).toBeGreaterThanOrEqual(6);
  });

  it("can be revoked by the operator, after which the key is refused", async () => {
    const { id, key } = await newKey("Old bot");
    expect((await api("/v1/keys/me", { headers: { "x-api-key": key } })).status).toBe(200);
    expect((await api(`/v1/operator/api-keys/${id}`, { method: "DELETE", headers: operator() })).status).toBe(200);
    expect((await api("/v1/keys/me", { headers: { "x-api-key": key } })).status).toBe(401);
    expect((await api("/v1/operator/api-keys", { method: "POST", body: "{}" })).status).toBe(401);
  });
});
