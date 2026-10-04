import { Connection, type PublicKey } from "@solana/web3.js";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  curvePrice, decodeTransaction, initialCurveReserves, poolPrice, RATE_DENOMINATOR, writableAccounts, type CreatorFeeClaimed, type Graduated,
  type LaunchCreated, type PlatformConfigUpdated, type PoolSwapExecuted, type RawTransaction, type TradeExecuted,
} from "@launchpad/chain";
import { creatorFeeClaims, curves, feeAnnouncements, graduations, launchDrafts, launches, operatorAlerts, trades, type Db } from "@launchpad/db";
import { indexAirdropPayments } from "./airdrop";
import type { Config } from "./env";
import { watchAddresses } from "./helius";
import { insertTrade, openMarket } from "./market";
import { relabelQuoteMints } from "./quotes/labels";
import { recordPlatformFees } from "./routes/operator";

export type IndexResult = { launched: number; traded: number; claimed: number; graduated: number; airdropped: number };

/** A batch in which some transactions could not be indexed; the rest were, so a retry only needs to bring these back. */
export class IndexBatchError extends Error {
  constructor(readonly result: IndexResult, readonly failed: { signature: string; error: string }[]) {
    super(`${failed.length} of the transactions could not be indexed: ${failed.map((f) => `${f.signature} (${f.error})`).join("; ")}`);
  }
}

/**
 * Writes the Launches, curve trades, Creator Fee claims, Graduations and pool trades in a batch of confirmed transactions.
 * Launches, trades and Graduations count only on our PlatformConfig. A claim names no platform (a Creator's vault serves
 * all of them), so it counts when its Creator has launched on our platform; a pool trade, when its pool is one our
 * Launches graduated into. An airdrop payment counts when its airdrop was prepared through our API.
 * Idempotent: the same transaction delivered twice (webhook retries, the client fast path, backfills) writes one row.
 * One transaction that can't be indexed never stops the others: the batch goes on, and `IndexBatchError` names what
 * failed at the end, so a retry of the batch only has those to bring back.
 * A transaction that may have written a Quote Asset's mint (an issuer changing an authority, a fee or a pause) has that
 * mint re-read for its Quote Risk Labels (#11) before the batch answers, so labels follow the issuer within seconds
 * when the webhook watches the quote mints.
 */
export async function indexTransactions(db: Db, cfg: Config, txs: RawTransaction[]): Promise<IndexResult> {
  const result: IndexResult = { launched: 0, traded: 0, claimed: 0, graduated: 0, airdropped: 0 };
  const failed: { signature: string; error: string }[] = [];
  const written = new Set<string>();
  for (const tx of txs) {
    try {
      await indexTransaction(db, cfg, tx, result);
      if (!tx.meta?.err) for (const key of writableAccounts(tx)) written.add(key);
    } catch (e) {
      const signature = tx?.transaction?.signatures?.[0] ?? "unknown";
      console.error(`indexing ${signature} failed`, e);
      failed.push({ signature, error: (e as Error).message });
    }
  }
  if (written.size) await relabelQuoteMints(db, new Connection(cfg.rpcUrl, "confirmed"), [...written]);
  if (failed.length) throw new IndexBatchError(result, failed);
  return result;
}

async function indexTransaction(db: Db, cfg: Config, tx: RawTransaction, result: IndexResult) {
  for (const e of decodeTransaction(tx, cfg)) {
    if (e.kind === "creator_fee_claimed") {
      result.claimed += await indexClaim(db, e);
      continue;
    }
    if (e.kind === "pool_swap") {
      result.traded += await indexPoolTrade(db, e);
      continue;
    }
    if (!e.platformConfig.equals(cfg.platformConfig)) continue;
    if (e.kind === "platform_config_updated") {
      await indexPlatformConfigUpdate(db, e);
      continue;
    }
    if (e.kind === "launch_created") {
      // Only a GlobalConfig newer than the last Quote Registry refresh lets such a launch through (ADR 0005).
      if (!e.standardShape) {
        console.warn("ignoring a launch outside our launch shape", e.signature);
        continue;
      }
      result.launched += await indexLaunch(db, e);
    } else if (e.kind === "trade") result.traded += await indexTrade(db, e);
    else {
      const graduated = await indexGraduation(db, cfg, e);
      result.graduated += graduated;
      // Swaps in the new pool may have been delivered before the migration (webhooks promise no order) and were
      // dropped, since the pool was not ours yet. Now that it is, its history so far is indexed and counted here. The
      // graduation watch carries on from there, for the minutes a webhook takes to start delivering a new address.
      if (graduated) {
        const backfilled = await indexAccountHistory(db, cfg, new Connection(cfg.rpcUrl, "confirmed"), e.pool, null);
        for (const k of Object.keys(result) as (keyof IndexResult)[]) result[k] += backfilled.indexed[k];
        await db.update(graduations).set({ backfilledUntil: backfilled.newest }).where(eq(graduations.mint, e.baseMint.toBase58()));
      }
    }
  }
  result.airdropped += await indexAirdropPayments(db, tx);
}

const SIGNATURE_PAGE = 1000;
// How many transactions a backfill fetches from the node at once.
const FETCH_BATCH = 8;

/**
 * Backfills one account: indexes each of its confirmed transactions newer than `until`, oldest first, and returns the
 * newest signature it got to (or `until` if there was nothing new), from which the next backfill can resume, with
 * what it indexed. A listed transaction that can't be fetched or indexed yet (an RPC node behind the one that listed
 * it, say) stops the backfill there, so the cursor never moves past a transaction that was not indexed. `limit` stops
 * it after that many transactions, for a caller that comes back; `complete` says whether it reached the newest one
 * listed, and `seen` how many it got through. A trade the Indexer already has (the webhook delivered it) is passed over without being fetched again.
 */
export async function indexAccountHistory(
  db: Db, cfg: Config, connection: Connection, account: PublicKey, until: string | null, limit = Infinity,
): Promise<{ newest: string | null; indexed: IndexResult; complete: boolean; seen: number }> {
  const listed: string[] = [];
  let before: string | undefined;
  for (;;) {
    const page = await connection.getSignaturesForAddress(account, { before, until: until ?? undefined, limit: SIGNATURE_PAGE }, "confirmed");
    listed.push(...page.filter((s) => !s.err).map((s) => s.signature));
    if (page.length < SIGNATURE_PAGE) break;
    before = page.at(-1)!.signature;
  }
  const found = listed.reverse().slice(0, limit);
  let newest = until;
  let seen = 0;
  let complete = found.length === listed.length;
  const indexed: IndexResult = { launched: 0, traded: 0, claimed: 0, graduated: 0, airdropped: 0 };
  for (let i = 0; i < found.length && seen === i; i += FETCH_BATCH) {
    const batch = found.slice(i, i + FETCH_BATCH);
    const known = new Set((await db.select({ signature: trades.signature }).from(trades).where(inArray(trades.signature, batch))).map((t) => t.signature));
    const raws = await Promise.all(batch.map((signature) => (known.has(signature) ? null : fetchRawTransaction(cfg.rpcUrl, signature))));
    for (const [j, signature] of batch.entries()) {
      if (!known.has(signature)) {
        const raw = raws[j];
        if (!raw) {
          console.warn(`backfill of ${account.toBase58()} stopped at ${signature}, which could not be fetched yet`);
          complete = false;
          break;
        }
        const r = await indexTransactions(db, cfg, [raw]);
        for (const k of Object.keys(indexed) as (keyof IndexResult)[]) indexed[k] += r[k];
      }
      newest = signature;
      seen++;
    }
  }
  return { newest, indexed, complete, seen };
}

const time = (blockTime: number | null) => new Date((blockTime ?? Math.floor(Date.now() / 1000)) * 1000);

async function indexLaunch(db: Db, e: LaunchCreated) {
  // A Reward Launch's Payout Asset is the Creator's choice at prepare time, kept with the draft (ADR 0006, #43); one
  // launched on our PlatformConfig without our API has no draft and pays in the coin, as every Reward Launch did before.
  const [draft] = e.rewardTaxBps === null
    ? []
    : await db.select({ rewardPayout: launchDrafts.rewardPayout }).from(launchDrafts).where(eq(launchDrafts.mint, e.baseMint.toBase58())).limit(1);
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
      rewardTaxBps: e.rewardTaxBps,
      rewardPayout: e.rewardTaxBps === null ? null : (draft?.rewardPayout ?? "coin"),
      createdSignature: e.signature,
      createdSlot: e.slot,
      createdAt: time(e.blockTime),
    })
    .onConflictDoNothing()
    .returning({ mint: launches.mint });
  const start = initialCurveReserves({ supply: e.supply, totalBaseSell: e.totalBaseSell, fundRaising: e.graduationTargetRaw });
  await openMarket(db, e.baseMint.toBase58(), curvePrice(start, e.decimals, e.quoteDecimals), e.slot);
  return inserted.length;
}

async function indexTrade(db: Db, e: TradeExecuted) {
  const mint = e.baseMint.toBase58();
  const price = curvePrice(e.after, e.baseDecimals, e.quoteDecimals);
  const inserted = await insertTrade(db, {
    signature: e.signature,
    eventIndex: e.index,
    mint,
    venue: "curve",
    trader: e.trader.toBase58(),
    side: e.side,
    baseAmount: (e.side === "buy" ? e.amountOut : e.amountIn).toString(),
    quoteAmount: (e.side === "buy" ? e.amountIn : e.amountOut).toString(),
    protocolFee: e.fees.protocol.toString(),
    platformFee: e.fees.platform.toString(),
    creatorFee: e.fees.creator.toString(),
    shareFee: e.fees.share.toString(),
    referrer: e.fees.share.isZero() ? null : (e.referrer?.toBase58() ?? null),
    priceBefore: curvePrice(e.before, e.baseDecimals, e.quoteDecimals),
    priceAfter: price,
    slot: e.slot,
    blockTime: time(e.blockTime),
  });

  // The curve moves to a trade from a later slot, or to the next trade in the same slot, which starts where the stored
  // state ends. Replays and late deliveries of earlier trades never move it backwards.
  // The buy that sells the curve out stamps when it did, which the graduation watch measures from.
  await db
    .insert(curves)
    .values({
      mint,
      realQuote: e.after.realQuote.toString(),
      realBase: e.after.realBase.toString(),
      price,
      status: e.status,
      slot: e.slot,
      completedAt: e.status === "live" ? null : time(e.blockTime),
    })
    .onConflictDoUpdate({
      target: curves.mint,
      set: {
        realQuote: sql`excluded.real_quote`,
        realBase: sql`excluded.real_base`,
        price: sql`excluded.price`,
        status: sql`excluded.status`,
        slot: sql`excluded.slot`,
        completedAt: sql`coalesce(${curves.completedAt}, excluded.completed_at)`,
        updatedAt: sql`now()`,
      },
      setWhere: sql`excluded.slot > ${curves.slot} or (excluded.slot = ${curves.slot} and ${curves.realBase} = ${e.before.realBase.toString()} and ${curves.realQuote} = ${e.before.realQuote.toString()})`,
    });
  return Number(inserted);
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

/**
 * The admin changed our PlatformConfig's fees: the earliest announcement that named these rates and is not yet applied
 * records the transaction that applied it (#22). The block time is not compared with the announced time: the local
 * chain's clock lags the wall clock, and a change the admin applied early is still that announcement applied.
 */
async function indexPlatformConfigUpdate(db: Db, e: PlatformConfigUpdated) {
  if (e.feeRate === null || e.creatorFeeRate === null) return 0;
  const toBps = (rate: { toNumber(): number }) => (rate.toNumber() * 10_000) / RATE_DENOMINATOR;
  await recordPlatformFees(db, { platformFeeBps: toBps(e.feeRate), creatorFeeBps: toBps(e.creatorFeeRate) });
  const [due] = await db
    .select({ id: feeAnnouncements.id })
    .from(feeAnnouncements)
    .where(
      and(
        eq(feeAnnouncements.platformFeeBps, toBps(e.feeRate)),
        eq(feeAnnouncements.creatorFeeBps, toBps(e.creatorFeeRate)),
        isNull(feeAnnouncements.appliedSignature),
      ),
    )
    .orderBy(feeAnnouncements.effectiveAt)
    .limit(1);
  if (!due) return 0;
  const updated = await db
    .update(feeAnnouncements)
    .set({ appliedSignature: e.signature, appliedAt: time(e.blockTime) })
    .where(and(eq(feeAnnouncements.id, due.id), isNull(feeAnnouncements.appliedSignature)))
    .returning({ id: feeAnnouncements.id });
  return updated.length;
}

/**
 * Raydium migrated one of our curves: the Launch has graduated, and any alert about it waiting is resolved. The new
 * pool joins the Helius webhook first, where one is configured, so its swaps keep arriving; if that fails the
 * migration is not recorded, the batch fails, and Helius delivers it again.
 */
async function indexGraduation(db: Db, cfg: Config, e: Graduated) {
  const mint = e.baseMint.toBase58();
  await watchAddresses(cfg, [e.pool.toBase58()]);
  const inserted = await db
    .insert(graduations)
    .values({ mint, pool: e.pool.toBase58(), signature: e.signature, slot: e.slot, graduatedAt: time(e.blockTime) })
    .onConflictDoNothing()
    .returning({ mint: graduations.mint });
  await db
    .update(operatorAlerts)
    .set({ resolvedAt: sql`now()` })
    .where(and(eq(operatorAlerts.kind, "graduation_stuck"), eq(operatorAlerts.subject, mint), isNull(operatorAlerts.resolvedAt)));
  return inserted.length;
}

/** A trade in a pool one of our Launches graduated into; swaps in any other pool are ignored. */
async function indexPoolTrade(db: Db, e: PoolSwapExecuted) {
  const [g] = await db
    .select({ mint: graduations.mint, quoteMint: launches.quoteMint })
    .from(graduations)
    .innerJoin(launches, eq(launches.mint, graduations.mint))
    .where(eq(graduations.pool, e.pool.toBase58()))
    .limit(1);
  if (!g) return 0;
  const buy = e.inputMint.toBase58() === g.quoteMint;
  // Prices are Quote Asset per coin at the pool's constant-product position, fees excluded.
  const price = ([input, output]: typeof e.before) =>
    buy ? poolPrice(output, input, e.outputDecimals, e.inputDecimals) : poolPrice(input, output, e.inputDecimals, e.outputDecimals);
  const priceAfter = price(e.after);
  // Through insertTrade like a curve trade, so the board's price, market cap and volume follow the coin into its pool.
  const inserted = await insertTrade(db, {
    signature: e.signature,
    eventIndex: e.index,
    mint: g.mint,
    venue: "pool",
    trader: e.trader.toBase58(),
    side: buy ? "buy" : "sell",
    baseAmount: (buy ? e.amountOut : e.amountIn).toString(),
    quoteAmount: (buy ? e.amountIn : e.amountOut).toString(),
    protocolFee: e.tradeFee.toString(),
    // Our platform is every graduated pool's creator, so the pool's creator fee is platform revenue (ADR 0001).
    platformFee: e.creatorFee.toString(),
    creatorFee: "0",
    priceBefore: price(e.before),
    priceAfter,
    slot: e.slot,
    blockTime: time(e.blockTime),
  });
  // The pool's price follows its latest trade by slot; within one slot, the last one indexed wins. Replays never move it.
  if (inserted)
    await db
      .update(graduations)
      .set({ price: priceAfter, priceSlot: e.slot })
      .where(and(eq(graduations.mint, g.mint), sql`coalesce(${graduations.priceSlot}, 0) <= ${e.slot}`));
  return Number(inserted);
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
