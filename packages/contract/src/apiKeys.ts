import { z } from "zod";

/**
 * API keys (#21): the public API is open to read without one. A key identifies an integrator (a Telegram bot, a trading
 * terminal), meters its usage and bounds it with a per-minute rate limit. The key itself is shown once, when issued.
 */

export const API_KEY_HEADER = "x-api-key";
export const API_KEY_RATE_LIMIT_DEFAULT = 60;
export const API_KEY_RATE_LIMIT_MAX = 6_000;

/** Operator: issues a key. */
export const CreateApiKey = z.object({
  name: z.string().trim().min(1).max(80),
  rateLimitPerMinute: z.number().int().min(1).max(API_KEY_RATE_LIMIT_MAX).optional(),
});
export type CreateApiKey = z.infer<typeof CreateApiKey>;

export const ApiKeyInfo = z.object({
  id: z.string(),
  name: z.string(),
  rateLimitPerMinute: z.number().int(),
  createdAt: z.iso.datetime(),
  revokedAt: z.iso.datetime().nullable(),
});
export type ApiKeyInfo = z.infer<typeof ApiKeyInfo>;

/** The answer to issuing a key: its facts and, this once, the key itself. */
export const IssuedApiKey = ApiKeyInfo.extend({ key: z.string() });
export type IssuedApiKey = z.infer<typeof IssuedApiKey>;

export const ApiKeyList = z.object({ keys: z.array(ApiKeyInfo) });
export type ApiKeyList = z.infer<typeof ApiKeyList>;

/** What a key sees about itself: its limit and its requests over the last hour, by minute, newest first. */
export const ApiKeyUsage = z.object({
  id: z.string(),
  name: z.string(),
  rateLimitPerMinute: z.number().int(),
  usage: z.array(z.object({ minute: z.iso.datetime(), count: z.number().int() })),
});
export type ApiKeyUsage = z.infer<typeof ApiKeyUsage>;
