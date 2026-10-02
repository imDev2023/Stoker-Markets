// A caller without an API key is bounded per IP (#45): any requests, and more tightly the prepare requests that make
// the API build a transaction. Every test in this suite calls from one address, so the shared API's limits are out of
// reach; this file starts a second API on the same database with limits small enough to meet.
import { describe, expect, it } from "vitest";
import { freePort, startApi, WEBHOOK_SECRET } from "@launchpad/stack";
import { API_KEY_HEADER, IssuedApiKey } from "@launchpad/contract";
import { env } from "./client";

const REQUESTS = 6;
const PREPARES = 2;

/** Counts are kept per minute, so a test that counts requests starts in a fresh one, clear of what ran before it. */
async function nextMinute() {
  const left = 60_000 - (Date.now() % 60_000);
  await new Promise((r) => setTimeout(r, left + 500));
}

describe("per-IP rate limits", () => {
  it("refuses a caller without a key past the limit, prepare requests sooner, and lets it back in the next minute", async () => {
    const h = env();
    const api = await startApi({
      port: await freePort(),
      databaseUrl: h.databaseUrl,
      vars: { ...h.apiVars, ANON_RATE_LIMIT_PER_MINUTE: String(REQUESTS), ANON_PREPARE_RATE_LIMIT_PER_MINUTE: String(PREPARES) },
    });
    try {
      const get = (headers: Record<string, string> = {}) => fetch(`${api.url}/v1/platform`, { headers });
      const prepare = () => fetch(`${api.url}/v1/trades/prepare`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const operator = { authorization: `Bearer ${h.operatorToken}`, "content-type": "application/json" };
      // Issued ahead: operator requests are never counted against an IP.
      const issued = await fetch(`${api.url}/v1/operator/api-keys`, { method: "POST", headers: operator, body: JSON.stringify({ name: "rate limit test" }) });
      const { key } = IssuedApiKey.parse(await issued.json());

      await nextMinute();
      // Prepare requests meet their own, tighter limit first; these are refused for their empty body, and still count.
      for (let i = 0; i < PREPARES; i++) expect((await prepare()).status, `prepare ${i + 1}`).toBe(400);
      const tooManyPrepares = await prepare();
      expect(tooManyPrepares.status).toBe(429);
      expect(((await tooManyPrepares.json()) as { error: string }).error).toMatch(
        new RegExp(`^Rate limit of ${PREPARES} prepare requests a minute reached; try again in \\d+ seconds, or use an API key$`),
      );
      // Reads are still open: the three prepare requests used three of the six.
      for (let i = 0; i < REQUESTS - PREPARES - 1; i++) expect((await get()).status, `read ${i + 1}`).toBe(200);
      const tooMany = await get();
      expect(tooMany.status).toBe(429);
      const retryAfter = Number(tooMany.headers.get("retry-after"));
      expect(retryAfter).toBeGreaterThan(0);
      expect(retryAfter).toBeLessThanOrEqual(60);
      expect(((await tooMany.json()) as { error: string }).error).toBe(
        `Rate limit of ${REQUESTS} requests a minute reached; try again in ${retryAfter} seconds, or use an API key`,
      );

      // A key has its own limit, and the operator's and Helius's endpoints answer on their own authentication.
      expect((await get({ [API_KEY_HEADER]: key })).status).toBe(200);
      expect((await fetch(`${api.url}/v1/operator/api-keys`, { headers: operator })).status).toBe(200);
      expect((await fetch(`${api.url}/v1/webhooks/helius`, { method: "POST", headers: { authorization: "wrong" }, body: "[]" })).status).toBe(401);
      expect((await fetch(`${api.url}/v1/webhooks/helius`, { method: "POST", headers: { authorization: WEBHOOK_SECRET, "content-type": "application/json" }, body: "[]" })).status).toBe(200);
      expect((await fetch(`${api.url}/health`)).status).toBe(200);
      expect((await get()).status).toBe(429);

      await nextMinute();
      expect((await get()).status).toBe(200);
      expect((await prepare()).status).toBe(400);
    } finally {
      await api.stop();
    }
  }, 240_000);

  it("leaves the shared API, with limits out of reach, open to a burst", async () => {
    const answers = await Promise.all(Array.from({ length: 40 }, () => fetch(`${env().apiUrl}/v1/platform`)));
    expect(answers.map((r) => r.status)).toEqual(answers.map(() => 200));
  });
});
