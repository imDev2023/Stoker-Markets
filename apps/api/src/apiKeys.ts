// API keys (#21): the public API is open to read, and a key identifies an integrator, meters its usage and bounds it
// with a per-minute rate limit. The key itself is shown once and never stored: only its SHA-256 is.
import { Hono, type MiddlewareHandler } from "hono";
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { API_KEY_HEADER, API_KEY_RATE_LIMIT_DEFAULT, CreateApiKey, type ApiKeyInfo, type ApiKeyList, type ApiKeyUsage, type IssuedApiKey } from "@launchpad/contract";
import { apiKeys, apiKeyUsage } from "@launchpad/db";
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

/**
 * Identifies the caller by the key in `x-api-key`, when there is one: an unknown or revoked key is refused, a known
 * one has this minute's request counted and is refused past its limit with 429 and how long to wait. Requests
 * without a key pass as anonymous.
 */
export const apiKeyMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const key = c.req.header(API_KEY_HEADER);
  if (!key) return next();
  const db = c.get("db");
  const [row] = await db.select().from(apiKeys).where(and(eq(apiKeys.hash, await sha256(key)), isNull(apiKeys.revokedAt))).limit(1);
  if (!row) return c.json({ error: "unknown or revoked API key" }, 401);
  const minute = minuteOf(new Date());
  const [used] = await db
    .insert(apiKeyUsage)
    .values({ keyId: row.id, minute, count: 1 })
    .onConflictDoUpdate({ target: [apiKeyUsage.keyId, apiKeyUsage.minute], set: { count: sql`${apiKeyUsage.count} + 1` } })
    .returning({ count: apiKeyUsage.count });
  c.set("apiKey", { id: row.id, name: row.name, rateLimitPerMinute: row.rateLimitPerMinute });
  // The key's own usage view stays reachable past the limit, so an integrator can see why they are refused.
  if (used!.count > row.rateLimitPerMinute && !c.req.path.endsWith("/keys/me")) {
    const retryAfter = Math.max(1, Math.ceil((minute.getTime() + 60_000 - Date.now()) / 1000));
    c.header("retry-after", String(retryAfter));
    return c.json({ error: `API key rate limit of ${row.rateLimitPerMinute} requests a minute reached; try again in ${retryAfter} seconds` }, 429);
  }
  await next();
};

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
