// API keys (#21): the public API is open to read, and a key identifies an integrator, meters its usage and bounds it
// with a per-minute rate limit. The key itself is shown once and never stored: only its SHA-256 is.
// A caller without a key is bounded per IP instead (#45), with a tighter limit on the prepare endpoints.
import { Hono, type MiddlewareHandler } from "hono";
import { and, desc, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { API_KEY_HEADER, API_KEY_RATE_LIMIT_DEFAULT, CreateApiKey, type ApiKeyInfo, type ApiKeyList, type ApiKeyUsage, type IssuedApiKey } from "@launchpad/contract";
import { apiKeys, apiKeyUsage, type Db } from "@launchpad/db";
import type { AppEnv } from "./env";

const KEY_PREFIX = "lp_";
/** How many minutes of usage the key's own view shows. */
const USAGE_WINDOW_MINUTES = 60;

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function randomKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(40));
  return KEY_PREFIX + Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

async function sha256(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

const minuteOf = (d: Date) => new Date(Math.floor(d.getTime() / 60_000) * 60_000);

export type ApiKeyContext = { id: string; name: string; rateLimitPerMinute: number };

/** Counts one request against a caller's minute and returns the minute's total so far. */
async function count(db: Db, caller: string, minute: Date) {
  const [used] = await db
    .insert(apiKeyUsage)
    .values({ keyId: caller, minute, count: 1 })
    .onConflictDoUpdate({ target: [apiKeyUsage.keyId, apiKeyUsage.minute], set: { count: sql`${apiKeyUsage.count} + 1` } })
    .returning({ count: apiKeyUsage.count });
  return used!.count;
}

const secondsLeft = (minute: Date) => Math.max(1, Math.ceil((minute.getTime() + 60_000 - Date.now()) / 1000));

/** The header Cloudflare sets to the caller's address; a request that reaches the Worker without it is not counted. */
const IP_HEADER = "cf-connecting-ip";
/** Endpoints with their own authentication, which an IP limit must never cut off: Helius's deliveries and the operator. */
const UNMETERED = /^\/v1\/(webhooks|operator)\//;
const PREPARE = /\/prepare$/;

/**
 * Identifies the caller by the key in `x-api-key`, when there is one: an unknown or revoked key is refused, a known
 * one has this minute's request counted and is refused past its limit with 429 and how long to wait.
 * A request without a key is counted against its IP address instead, kept only as a hash: past the anonymous limit,
 * or the tighter one for prepare requests, it is refused the same way.
 */
export const apiKeyMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const key = c.req.header(API_KEY_HEADER);
  const db = c.get("db");
  const minute = minuteOf(new Date());
  if (!key) {
    const ip = c.req.header(IP_HEADER);
    if (!ip || c.req.method === "OPTIONS" || UNMETERED.test(c.req.path)) return next();
    const cfg = c.get("cfg");
    const caller = `ip:${(await sha256(ip)).slice(0, 32)}`;
    const limits: [string, number, string][] = [[caller, cfg.anonRateLimitPerMinute, "requests"]];
    if (c.req.method === "POST" && PREPARE.test(c.req.path)) limits.push([`${caller}:prepare`, cfg.anonPrepareRateLimitPerMinute, "prepare requests"]);
    for (const [id, limit, what] of limits) {
      if ((await count(db, id, minute)) <= limit) continue;
      const retryAfter = secondsLeft(minute);
      c.header("retry-after", String(retryAfter));
      return c.json({ error: `Rate limit of ${limit} ${what} a minute reached; try again in ${retryAfter} seconds, or use an API key` }, 429);
    }
    return next();
  }
  const [row] = await db.select().from(apiKeys).where(and(eq(apiKeys.hash, await sha256(key)), isNull(apiKeys.revokedAt))).limit(1);
  if (!row) return c.json({ error: "unknown or revoked API key" }, 401);
  const used = await count(db, row.id, minute);
  c.set("apiKey", { id: row.id, name: row.name, rateLimitPerMinute: row.rateLimitPerMinute });
  // The key's own usage view stays reachable past the limit, so an integrator can see why they are refused.
  if (used > row.rateLimitPerMinute && !c.req.path.endsWith("/keys/me")) {
    const retryAfter = secondsLeft(minute);
    c.header("retry-after", String(retryAfter));
    return c.json({ error: `API key rate limit of ${row.rateLimitPerMinute} requests a minute reached; try again in ${retryAfter} seconds` }, 429);
  }
  await next();
};

/** How long per-minute counts are kept: a day covers every view of them, and the IP rows would otherwise grow for ever. */
const USAGE_KEPT_MS = 24 * 60 * 60 * 1000;

/** Drops counts older than a day; the Quote Registry refresh calls it every run. */
export async function pruneUsage(db: Db, now = new Date()) {
  await db.delete(apiKeyUsage).where(lt(apiKeyUsage.minute, new Date(now.getTime() - USAGE_KEPT_MS)));
}

/** What a key can see about itself: its limit and its usage over the last hour, by minute. */
export const keyRoutes = new Hono<AppEnv>();

keyRoutes.get("/keys/me", async (c) => {
  const key = c.get("apiKey");
  if (!key) return c.json({ error: `send your API key in the ${API_KEY_HEADER} header` }, 401);
  const since = new Date(minuteOf(new Date()).getTime() - USAGE_WINDOW_MINUTES * 60_000);
  const rows = await c
    .get("db")
    .select({ minute: apiKeyUsage.minute, count: apiKeyUsage.count })
    .from(apiKeyUsage)
    .where(and(eq(apiKeyUsage.keyId, key.id), gte(apiKeyUsage.minute, since)))
    .orderBy(desc(apiKeyUsage.minute));
  const res: ApiKeyUsage = { ...key, usage: rows.map((r) => ({ minute: r.minute.toISOString(), count: r.count })) };
  return c.json(res);
});

/** Operator: issues, lists and revokes keys. */
export const operatorKeyRoutes = new Hono<AppEnv>();

const info = (k: typeof apiKeys.$inferSelect): ApiKeyInfo => ({
  id: k.id, name: k.name, rateLimitPerMinute: k.rateLimitPerMinute, createdAt: k.createdAt.toISOString(), revokedAt: k.revokedAt?.toISOString() ?? null,
});

operatorKeyRoutes.post("/api-keys", async (c) => {
  const body = CreateApiKey.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "invalid API key request", details: body.error.issues }, 400);
  const key = randomKey();
  const id = `key_${key.slice(KEY_PREFIX.length, KEY_PREFIX.length + 8)}`;
  const [row] = await c
    .get("db")
    .insert(apiKeys)
    .values({ id, hash: await sha256(key), name: body.data.name, rateLimitPerMinute: body.data.rateLimitPerMinute ?? API_KEY_RATE_LIMIT_DEFAULT })
    .returning();
  // The one time the key is ever shown.
  const res: IssuedApiKey = { ...info(row!), key };
  return c.json(res, 201);
});

operatorKeyRoutes.get("/api-keys", async (c) => {
  const rows = await c.get("db").select().from(apiKeys).orderBy(desc(apiKeys.createdAt)).limit(200);
  const res: ApiKeyList = { keys: rows.map(info) };
  return c.json(res);
});

operatorKeyRoutes.delete("/api-keys/:id", async (c) => {
  const [row] = await c
    .get("db")
    .update(apiKeys)
    .set({ revokedAt: sql`now()` })
    .where(and(eq(apiKeys.id, c.req.param("id")), isNull(apiKeys.revokedAt)))
    .returning();
  if (!row) return c.json({ error: "no such active key" }, 404);
  return c.json(info(row));
});
