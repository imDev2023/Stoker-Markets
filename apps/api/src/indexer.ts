import { eq, sql } from "drizzle-orm";
import {
  curvePrice, decodeTransaction, type CreatorFeeClaimed, type LaunchCreated, type RawTransaction, type TradeExecuted,
} from "@launchpad/chain";
import { creatorFeeClaims, curves, launches, trades, type Db } from "@launchpad/db";
import type { Config } from "./env";

/**
 * Writes the Launches, curve trades and Creator Fee claims in a batch of confirmed transactions. Launches and trades count
 * only on our PlatformConfig. A claim names no platform (a Creator's vault serves all of them), so it counts when its
 * Creator has launched on our platform.
 * Idempotent: the same transaction delivered twice (webhook retries, the client fast path, backfills) writes one row.
 */
export async function indexTransactions(db: Db, cfg: Config, txs: RawTransaction[]) {
  let launched = 0;
  let traded = 0;
  let claimed = 0;
  for (const tx of txs) {
    for (const e of decodeTransaction(tx, cfg.launchlab)) {
      if (e.kind === "creator_fee_claimed") {
        claimed += await indexClaim(db, e);
        continue;
      }
      if (!e.platformConfig.equals(cfg.platformConfig)) continue;
      if (e.kind === "launch_created") {
        // Only a GlobalConfig newer than the last Quote Registry refresh lets such a launch through (ADR 0005).
        if (!e.standardShape) {
          console.warn("ignoring a launch outside our launch shape", e.signature);
          continue;
        }
        launched += await indexLaunch(db, e);
      } else traded += await indexTrade(db, e);
    }
  }
  return { launched, traded, claimed };
}

const time = (blockTime: number | null) => new Date((blockTime ?? Math.floor(Date.now() / 1000)) * 1000);

async function indexLaunch(db: Db, e: LaunchCreated) {
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
      createdAt: time(e.blockTime),
    })
    .onConflictDoNothing()
    .returning({ mint: launches.mint });
  return inserted.length;
}

async function indexTrade(db: Db, e: TradeExecuted) {
  const mint = e.baseMint.toBase58();
  const price = curvePrice(e.after, e.baseDecimals, e.quoteDecimals);
  const inserted = await db
    .insert(trades)
    .values({
      signature: e.signature,
      eventIndex: e.index,
      mint,
      trader: e.trader.toBase58(),
      side: e.side,
      baseAmount: (e.side === "buy" ? e.amountOut : e.amountIn).toString(),
      quoteAmount: (e.side === "buy" ? e.amountIn : e.amountOut).toString(),
      protocolFee: e.fees.protocol.toString(),
      platformFee: e.fees.platform.toString(),
      creatorFee: e.fees.creator.toString(),
      priceBefore: curvePrice(e.before, e.baseDecimals, e.quoteDecimals),
      priceAfter: price,
      slot: e.slot,
      blockTime: time(e.blockTime),
    })
    .onConflictDoNothing()
    .returning({ signature: trades.signature });

  // The curve moves to a trade from a later slot, or to the next trade in the same slot, which starts where the stored
  // state ends. Replays and late deliveries of earlier trades never move it backwards.
  await db
    .insert(curves)
    .values({
      mint,
      realQuote: e.after.realQuote.toString(),
      realBase: e.after.realBase.toString(),
      price,
      status: e.status,
      slot: e.slot,
    })
    .onConflictDoUpdate({
      target: curves.mint,
      set: {
        realQuote: sql`excluded.real_quote`,
        realBase: sql`excluded.real_base`,
        price: sql`excluded.price`,
        status: sql`excluded.status`,
        slot: sql`excluded.slot`,
        updatedAt: sql`now()`,
      },
      setWhere: sql`excluded.slot > ${curves.slot} or (excluded.slot = ${curves.slot} and ${curves.realBase} = ${e.before.realBase.toString()} and ${curves.realQuote} = ${e.before.realQuote.toString()})`,
    });
  return inserted.length;
}

async function indexClaim(db: Db, e: CreatorFeeClaimed) {
  const creator = e.creator.toBase58();
  const [ours] = await db.select({ mint: launches.mint }).from(launches).where(eq(launches.creator, creator)).limit(1);
  if (!ours) return 0;
  const inserted = await db
    .insert(creatorFeeClaims)
    .values({
      signature: e.signature,
      eventIndex: e.index,
      creator,
      quoteMint: e.quoteMint.toBase58(),
      quoteDecimals: e.quoteDecimals,
      amount: e.amount.toString(),
      slot: e.slot,
      blockTime: time(e.blockTime),
    })
    .onConflictDoNothing()
    .returning({ signature: creatorFeeClaims.signature });
  return inserted.length;
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
