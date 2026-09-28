import type { Config } from "./env";

/** Helius's webhook API, when the Worker may call it: the key, the webhook to keep current, and the API's address. */
export type HeliusConfig = { apiUrl: string; apiKey: string; webhookId: string };

type Webhook = {
  webhookURL: string;
  transactionTypes: string[];
  accountAddresses?: string[];
  webhookType: string;
  authHeader?: string;
};

/**
 * Adds addresses to the Helius webhook through Helius's webhook API (`GET` then `PUT /v0/webhooks/:id`), so a graduated
 * pool's swaps and every quote mint's changes keep arriving without anyone adding them by hand (runbook, section 7).
 * Nothing happens without `HELIUS_API_KEY` and `HELIUS_WEBHOOK_ID` (the local stack, devnet without Helius): null.
 * Idempotent: an address already watched is left as it is, and nothing is written when nothing is missing. The rest of
 * the webhook (its URL, types and auth header) is sent back exactly as read, since the update replaces the whole thing.
 * A failure throws: the caller decides whether that stops the indexing (it does for a Graduation, which is then
 * delivered again) or fails the job (the Quote Registry refresh, which alerts the operator and tries again in five minutes).
 */
export async function watchAddresses(cfg: Config, addresses: string[]): Promise<{ added: number; watched: number } | null> {
  const h = cfg.helius;
  if (!h) return null;
  // The key travels in the query string, as Helius wants it; errors below name the status only, never the URL.
  const url = `${h.apiUrl}/v0/webhooks/${encodeURIComponent(h.webhookId)}?api-key=${encodeURIComponent(h.apiKey)}`;
  const read = await fetch(url);
  if (!read.ok) throw new Error(`Helius webhook ${h.webhookId} could not be read: ${read.status}`);
  const webhook = (await read.json()) as Webhook;
  const have = new Set(webhook.accountAddresses ?? []);
  const missing = [...new Set(addresses)].filter((a) => !have.has(a));
  if (!missing.length) return { added: 0, watched: have.size };
  const body: Webhook = {
    webhookURL: webhook.webhookURL,
    transactionTypes: webhook.transactionTypes,
    accountAddresses: [...have, ...missing],
    webhookType: webhook.webhookType,
    ...(webhook.authHeader ? { authHeader: webhook.authHeader } : {}),
  };
  const put = await fetch(url, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!put.ok) throw new Error(`Helius webhook ${h.webhookId} could not be updated: ${put.status}`);
  return { added: missing.length, watched: have.size + missing.length };
}
