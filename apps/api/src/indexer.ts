import { decodeTransaction, type RawTransaction } from "@launchpad/chain";
import { launches, type Db } from "@launchpad/db";
import type { Config } from "./env";

/**
 * Writes the Launches in a batch of confirmed transactions. Only launches on our PlatformConfig count.
 * Idempotent: the same transaction delivered twice (webhook retries, the client fast path, backfills) writes one row.
 */
export async function indexTransactions(db: Db, cfg: Config, txs: RawTransaction[]) {
  let launched = 0;
  for (const tx of txs) {
    for (const e of decodeTransaction(tx, cfg.launchlab)) {
      if (e.kind !== "launch_created" || !e.platformConfig.equals(cfg.platformConfig)) continue;
      const inserted = await db
        .insert(launches)
        .values({
          mint: e.baseMint.toBase58(),
          pool: e.pool.toBase58(),
          creator: e.creator.toBase58(),
          quoteMint: e.quoteMint.toBase58(),
          globalConfig: e.globalConfig.toBase58(),
          name: e.name,
          symbol: e.symbol,
          metadataUri: e.uri,
          decimals: e.decimals,
          supply: e.supply.toString(),
          totalBaseSell: e.totalBaseSell.toString(),
          graduationTarget: e.graduationTargetRaw.toString(),
          createdSignature: e.signature,
          createdSlot: e.slot,
          createdAt: new Date((e.blockTime ?? Math.floor(Date.now() / 1000)) * 1000),
        })
        .onConflictDoNothing()
        .returning({ mint: launches.mint });
      launched += inserted.length;
    }
  }
  return { launched };
}

/** Fetches one transaction in the same JSON shape Helius raw webhooks deliver. */
export async function fetchRawTransaction(rpcUrl: string, signature: string): Promise<RawTransaction | null> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getTransaction",
      params: [signature, { encoding: "json", commitment: "confirmed", maxSupportedTransactionVersion: 0 }],
    }),
  });
  if (!res.ok) throw new Error(`RPC getTransaction failed: ${res.status}`);
  const body = (await res.json()) as { result: RawTransaction | null; error?: { message: string } };
  if (body.error) throw new Error(`RPC getTransaction failed: ${body.error.message}`);
  return body.result;
}
