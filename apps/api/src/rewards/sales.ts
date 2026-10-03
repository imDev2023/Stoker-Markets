// Reward Sales (ADR 0006, #43): for a Reward Launch whose Payout Asset is its Quote Asset, the collected Reward Tax is
// sold into the coin's own market, the curve before Graduation and the pool after it, one bounded slice per run of the
// Reward Engine. Every sale is written down with its signature before it is sent and settled by it, recorded on the
// Ledger and indexed as the trade it is, so a run that dies never sells the same coins twice or loses what a sale
// brought in. The pot a round pays from is what the landed sales brought in, less what earlier rounds paid.
import { Connection, PublicKey, type Keypair, type TransactionInstruction } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import BN from "bn.js";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  graduationPoolAddress, loadCurve, loadPool, minAmountOut, poolSides, poolTradeInstructions, quotePoolTrade, quoteTrade, signedTransaction,
  tradeInstructions, WSOL_MINT, type RawTransaction,
} from "@launchpad/chain";
import { REWARD_SALE_MAX_RESERVE_BPS, REWARD_SALE_SLIPPAGE_BPS } from "@launchpad/contract";
import { graduations, launches, ledgerEntries, rewardPayouts, rewardRounds, rewardSales, type Db } from "@launchpad/db";
import type { Config } from "../env";
import { fetchRawTransaction, indexTransactions } from "../indexer";

const WSOL = WSOL_MINT.toBase58();
const POLL_MS = 400;

export type RewardSaleRow = typeof rewardSales.$inferSelect;

/** One sale this run made, as the job summary reports it. */
export type SaleReport = { mint: string; signature: string; venue: "curve" | "pool"; coins: string; proceeds: string | null; outcome: "landed" | "failed" | "pending" };

/** A coin the engine sells tax for: what the Launch and the chain say about its market. */
export type SaleCoin = { mint: string; symbol: string; decimals: number; pool: string; quoteMint: string };

/**
 * Sells one slice of the collected tax the operations wallet holds of the coin, bounded to `REWARD_SALE_MAX_RESERVE_BPS`
 * of the coins the market holds against the Quote Asset, with `REWARD_SALE_SLIPPAGE_BPS` under its quote as the limit.
 * Nothing is sold while Raydium is moving the coin to its pool, while the pool is paused or not open yet, while an
 * earlier sale may still land, or when the slice would sell for nothing. Returns what happened, or null when nothing
 * was sold and why in `skipped`.
 */
export async function sellSlice(
  db: Db, cfg: Config, connection: Connection, operations: Keypair, coin: SaleCoin,
): Promise<{ sale: SaleReport | null; skipped: string | null }> {
  const ops = operations.publicKey;
  const mint = new PublicKey(coin.mint);
  const [inFlight] = await db.select({ signature: rewardSales.signature }).from(rewardSales).where(and(eq(rewardSales.mint, coin.mint), eq(rewardSales.status, "sending"))).limit(1);
  if (inFlight) return { sale: null, skipped: `sale ${inFlight.signature} may still land` };
  const source = getAssociatedTokenAddressSync(mint, ops, false, TOKEN_2022_PROGRAM_ID);
  const held = new BN((await connection.getTokenAccountBalance(source, "confirmed").catch(() => null))?.value.amount ?? "0");
  if (held.isZero()) return { sale: null, skipped: null };

  const curve = await loadCurve(connection, new PublicKey(coin.pool));
  if (!curve) throw new Error(`launch ${coin.mint} has no curve account at ${coin.pool}`);
  const cap = (reserve: BN) => BN.min(held, reserve.muln(REWARD_SALE_MAX_RESERVE_BPS).divn(10_000));
  let plan: { venue: "curve" | "pool"; market: PublicKey; coins: BN; quoteOut: BN; quoteDecimals: number; instructions: TransactionInstruction[] };
  if (curve.status === "graduating") return { sale: null, skipped: "the curve sold out and Raydium is moving the coin to its pool" };
  if (curve.status === "live") {
    // The constant-product input reserve; the curve can't buy back more than it has sold.
    const coins = BN.min(cap(curve.reserves.virtualBase.sub(curve.reserves.realBase)), curve.reserves.realBase);
    if (coins.isZero()) return { sale: null, skipped: "the curve has sold nothing yet" };
    const t = quoteTrade(curve.reserves, curve.rates, "sell", coins, { quote: curve.quoteTransferFee, base: curve.baseTransferFee });
    if (t.amountOut.isZero()) return { sale: null, skipped: "the slice would sell for nothing" };
    const instructions = await tradeInstructions(connection, {
      program: cfg.launchlab, curve, trader: ops, side: "sell", amountIn: coins, minAmountOut: minAmountOut(t.amountOut, REWARD_SALE_SLIPPAGE_BPS),
    });
    plan = { venue: "curve", market: curve.pool, coins, quoteOut: t.amountOut, quoteDecimals: curve.quoteDecimals, instructions };
  } else {
    const pool = await loadPool(connection, await graduationPoolAddress(connection, cfg.cpmm, curve));
    if (!pool) throw new Error(`launch ${coin.mint} is migrated but has no pool`);
    if (!pool.swapEnabled) return { sale: null, skipped: "Raydium has paused trading in the pool" };
    if (pool.chainTime < pool.openTime) return { sale: null, skipped: "the pool has not opened yet" };
    const { base, quote } = poolSides(pool, mint);
    const coins = cap(base.reserve);
    if (coins.isZero()) return { sale: null, skipped: "the pool holds no coins" };
    const t = quotePoolTrade(pool, mint, "sell", coins);
    if (t.amountOut.isZero()) return { sale: null, skipped: "the slice would sell for nothing" };
    const instructions = await poolTradeInstructions(connection, {
      cpmm: cfg.cpmm, pool, baseMint: mint, trader: ops, side: "sell", amountIn: coins, minAmountOut: minAmountOut(t.amountOut, REWARD_SALE_SLIPPAGE_BPS),
    });
    plan = { venue: "pool", market: pool.address, coins, quoteOut: t.amountOut, quoteDecimals: quote.decimals, instructions };
  }

  const tx = await signedTransaction(connection, operations, plan.instructions);
  // Written before it is sent: a run that dies here finds the sale on its next run and settles it, never sells again.
  await db
    .insert(rewardSales)
    .values({
      signature: tx.signature, mint: coin.mint, venue: plan.venue, coins: plan.coins.toString(), quoteMint: coin.quoteMint, quoteDecimals: plan.quoteDecimals,
      lastValidBlockHeight: tx.lastValidBlockHeight,
    })
    .onConflictDoNothing();
  await connection.sendRawTransaction(tx.serialized, { preflightCommitment: "confirmed" });
  const base = { mint: coin.mint, signature: tx.signature, venue: plan.venue, coins: plan.coins.toString() };
  for (;;) {
    const settled = await settleSale(db, cfg, connection, ops, { signature: tx.signature, mint: coin.mint, quoteMint: coin.quoteMint, lastValidBlockHeight: tx.lastValidBlockHeight, market: plan.market.toBase58(), decimals: coin.decimals, quoteDecimals: plan.quoteDecimals, coins: plan.coins.toString(), venue: plan.venue });
    if (settled === "pending") {
      if ((await connection.getBlockHeight("confirmed")) > tx.lastValidBlockHeight) return { sale: { ...base, proceeds: null, outcome: "pending" }, skipped: null };
      await new Promise((r) => setTimeout(r, POLL_MS));
      continue;
    }
    if (settled.outcome === "failed") throw new Error(`sale ${tx.signature} of ${coin.symbol} failed on-chain: ${settled.error}`);
    if (settled.outcome === "expired") return { sale: { ...base, proceeds: null, outcome: "pending" }, skipped: null };
    return { sale: { ...base, proceeds: settled.proceeds, outcome: "landed" }, skipped: null };
  }
}

type PendingSale = {
  signature: string; mint: string; quoteMint: string; lastValidBlockHeight: number; market: string | null; decimals: number; quoteDecimals: number; coins: string;
  venue: "curve" | "pool";
};

type Settled = { outcome: "landed"; proceeds: string } | { outcome: "failed"; error: string } | { outcome: "expired" } | "pending";

/**
 * Where one sale stands. A landed sale is recorded on the Ledger (the coins out, the Quote Asset in) and indexed as the
 * trade it is, then marked landed with what it brought in; a failed or expired one is marked so, and its coins are
 * still in the wallet for the next slice.
 */
async function settleSale(db: Db, cfg: Config, connection: Connection, ops: PublicKey, s: PendingSale): Promise<Settled> {
  const { value: [status] } = await connection.getSignatureStatuses([s.signature], { searchTransactionHistory: true });
  if (status?.err) {
    const error = JSON.stringify(status.err);
    await db.update(rewardSales).set({ status: "failed", error, settledAt: sql`now()` }).where(and(eq(rewardSales.signature, s.signature), eq(rewardSales.status, "sending")));
    return { outcome: "failed", error };
  }
  if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") {
    const raw = await fetchRawTransaction(cfg.rpcUrl, s.signature);
    if (!raw) return "pending";
    const proceeds = saleProceeds(raw, ops, s.quoteMint);
    const time = new Date((raw.blockTime ?? Math.floor(Date.now() / 1000)) * 1000);
    const market = s.market ?? (await marketOf(db, s.mint, s.venue, raw));
    await db
      .insert(ledgerEntries)
      .values([
        {
          signature: s.signature, eventIndex: 0, kind: "reward_sale", assetMint: s.mint, assetDecimals: s.decimals, amount: s.coins,
          source: ops.toBase58(), destination: market, launchMint: s.mint, slot: raw.slot, blockTime: time,
        },
        {
          signature: s.signature, eventIndex: 1, kind: "reward_sale", assetMint: s.quoteMint, assetDecimals: s.quoteDecimals, amount: proceeds.toString(),
          source: market, destination: ops.toBase58(), launchMint: s.mint, slot: raw.slot, blockTime: time,
        },
      ])
      .onConflictDoNothing();
    // The sale is a trade of the coin like anyone else's, on the chart and in the history without waiting for the webhook.
    await indexTransactions(db, cfg, [raw]).catch((e) => console.error(`indexing sale ${s.signature} failed`, e));
    await db
      .update(rewardSales)
      .set({ status: "landed", proceeds: proceeds.toString(), slot: raw.slot, blockTime: time, settledAt: sql`now()` })
      .where(and(eq(rewardSales.signature, s.signature), eq(rewardSales.status, "sending")));
    return { outcome: "landed", proceeds: proceeds.toString() };
  }
  if (!status && (await connection.getBlockHeight("confirmed")) > s.lastValidBlockHeight) {
    await db.update(rewardSales).set({ status: "expired", settledAt: sql`now()` }).where(and(eq(rewardSales.signature, s.signature), eq(rewardSales.status, "sending")));
    return { outcome: "expired" };
  }
  return "pending";
}

/** The market a settled-later sale went into: the coin's curve, or the pool the transaction names after Graduation. */
async function marketOf(db: Db, mint: string, venue: "curve" | "pool", raw: RawTransaction) {
  const [launch] = await db.select({ pool: launches.pool }).from(launches).where(eq(launches.mint, mint)).limit(1);
  if (venue === "curve" && launch) return launch.pool;
  const [graduated] = await db.select({ pool: graduations.pool }).from(graduations).where(eq(graduations.mint, mint)).limit(1);
  return graduated?.pool ?? launch?.pool ?? raw.transaction.message.accountKeys[0]!;
}

type Raw = RawTransaction & { meta: (NonNullable<RawTransaction["meta"]> & { fee: number; preBalances: number[]; postBalances: number[] }) | null };

/**
 * What a landed sale brought the operations wallet in the Quote Asset: for SOL, the wallet's balance change with the
 * network fee added back (the sale's temporary wrapped-SOL account is opened and closed inside the transaction, so its
 * rent nets to nothing); for any other asset, the change in the wallet's account of it.
 */
export function saleProceeds(raw: RawTransaction, ops: PublicKey, quoteMint: string): bigint {
  const tx = raw as Raw;
  const meta = tx.meta;
  if (!meta || meta.err) return 0n;
  const keys = [...tx.transaction.message.accountKeys, ...(meta.loadedAddresses?.writable ?? []), ...(meta.loadedAddresses?.readonly ?? [])];
  if (quoteMint === WSOL) {
    const i = keys.indexOf(ops.toBase58());
    if (i < 0) return 0n;
    const delta = BigInt(meta.postBalances[i]!) - BigInt(meta.preBalances[i]!) + BigInt(meta.fee);
    return delta > 0n ? delta : 0n;
  }
  const amount = (balances: NonNullable<typeof meta.preTokenBalances>) =>
    balances.filter((b) => b.mint === quoteMint && b.owner === ops.toBase58()).reduce((s, b) => s + BigInt(b.uiTokenAmount.amount), 0n);
  const delta = amount(meta.postTokenBalances ?? []) - amount(meta.preTokenBalances ?? []);
  return delta > 0n ? delta : 0n;
}

/** Settles every sale of the coin an earlier run left in flight. */
export async function settlePendingSales(db: Db, cfg: Config, connection: Connection, ops: PublicKey, coin: SaleCoin) {
  const pending = await db.select().from(rewardSales).where(and(eq(rewardSales.mint, coin.mint), eq(rewardSales.status, "sending")));
  const out = { landed: 0, failed: 0, expired: 0 };
  for (const p of pending) {
    const settled = await settleSale(db, cfg, connection, ops, {
      signature: p.signature, mint: p.mint, quoteMint: p.quoteMint, lastValidBlockHeight: p.lastValidBlockHeight, market: null, decimals: coin.decimals,
      quoteDecimals: p.quoteDecimals, coins: p.coins, venue: p.venue,
    });
    if (settled !== "pending") out[settled.outcome]++;
  }
  return out;
}

/**
 * The pot of a Quote Asset payout coin: what every landed sale brought in, less every payout of the coin's rounds that
 * was paid, is in flight or is still to be sent. A `returned` payout was never paid, so its amount stays in.
 */
export async function quotePot(db: Db, mint: string): Promise<bigint> {
  const [sold] = await db
    .select({ proceeds: sql<string>`coalesce(sum(${rewardSales.proceeds}), 0)::text` })
    .from(rewardSales)
    .where(and(eq(rewardSales.mint, mint), eq(rewardSales.status, "landed")));
  const [paid] = await db
    .select({ amount: sql<string>`coalesce(sum(${rewardPayouts.amount}), 0)::text` })
    .from(rewardPayouts)
    .innerJoin(rewardRounds, eq(rewardRounds.id, rewardPayouts.roundId))
    .where(and(eq(rewardRounds.mint, mint), sql`${rewardRounds.payoutMint} <> ${rewardRounds.mint}`, inArray(rewardPayouts.status, ["paid", "sending", "unpaid"])));
  const pot = BigInt(sold!.proceeds) - BigInt(paid!.amount);
  return pot > 0n ? pot : 0n;
}

/** Landed sales no round has taken yet, and the coins they sold: the threshold a Quote Asset payout's round opens on. */
export async function unassignedSales(db: Db, mint: string) {
  const [row] = await db
    .select({ coins: sql<string>`coalesce(sum(${rewardSales.coins}), 0)::text`, n: sql<number>`count(*)::int` })
    .from(rewardSales)
    .where(and(eq(rewardSales.mint, mint), eq(rewardSales.status, "landed"), isNull(rewardSales.roundId)));
  return { coins: BigInt(row!.coins), count: row!.n };
}

/** Every landed sale of the coin, totals and the newest `limit`. */
export async function salesOf(db: Db, mint: string, limit = 10) {
  const [totals] = await db
    .select({ sold: sql<string>`coalesce(sum(${rewardSales.coins}), 0)::text`, proceeds: sql<string>`coalesce(sum(${rewardSales.proceeds}), 0)::text` })
    .from(rewardSales)
    .where(and(eq(rewardSales.mint, mint), eq(rewardSales.status, "landed")));
  const recent = await db
    .select()
    .from(rewardSales)
    .where(and(eq(rewardSales.mint, mint), inArray(rewardSales.status, ["sending", "landed"])))
    .orderBy(desc(rewardSales.createdAt))
    .limit(limit);
  return { sold: totals!.sold, proceeds: totals!.proceeds, recent };
}

/**
 * SOL the Reward Sales brought in that holders have not been paid yet, across every Quote Asset payout coin paired with
 * SOL: the Fee Collector's sweep leaves it in the operations wallet. Pots in any other token are never swept, since the
 * sweep only moves a token's Ledger revenue.
 */
export async function rewardPotLamports(db: Db): Promise<bigint> {
  const [sold] = await db
    .select({ proceeds: sql<string>`coalesce(sum(${rewardSales.proceeds}), 0)::text` })
    .from(rewardSales)
    .where(and(eq(rewardSales.quoteMint, WSOL), eq(rewardSales.status, "landed")));
  const [paid] = await db
    .select({ amount: sql<string>`coalesce(sum(${rewardPayouts.amount}), 0)::text` })
    .from(rewardPayouts)
    .innerJoin(rewardRounds, eq(rewardRounds.id, rewardPayouts.roundId))
    // Only what has landed has left the wallet: a payout still to be sent, or in flight, is SOL the sweep must leave too.
    .where(and(eq(rewardRounds.payoutMint, WSOL), eq(rewardPayouts.status, "paid")));
  const pot = BigInt(sold!.proceeds) - BigInt(paid!.amount);
  return pot > 0n ? pot : 0n;
}
