// Creator Buybacks (ADR 0011): sending and settling the one transaction a run of a coin's `burn` or `liquidity` rule
// is. Each is written down with its signature and the most it may spend before it is sent, settled by its own
// transaction, recorded on the Ledger and indexed as the trade it is, so a run that dies never spends the same share
// twice or loses track of what a buyback did. The rules themselves (`burn.ts`, `liquidity.ts`) only plan a transaction
// and read one back.
import { PublicKey, SendTransactionError, type Connection } from "@solana/web3.js";
import { and, eq, sql } from "drizzle-orm";
import { signedTransaction, WSOL_MINT, type RawTransaction } from "@launchpad/chain";
import { creatorBuybacks, ledgerEntries, type Db } from "@launchpad/db";
import type { Config } from "../../env";
import { BURN_DESTINATION } from "../../burn/decode";
import { fetchRawTransaction, indexTransactions } from "../../indexer";
import type { RulePot } from "../creatorShares";
import { decodeBurnRun } from "./burn";
import { decodeLiquidityRun, registerFeeKey } from "./liquidity";
import type { BuybackOutcome, BuybackPlan, RuleDeps } from "./types";

const WSOL = WSOL_MINT.toBase58();
const POLL_MS = 400;

export type BuybackRow = typeof creatorBuybacks.$inferSelect;
type Kind = BuybackRow["kind"];
type Outcome = "landed" | "failed" | "expired";

/** One buyback a run sent, as the job's summary carries it: strings, since a summary is stored and logged as JSON. */
export type BuybackReport = {
  mint: string; kind: Kind; venue: "curve" | "pool"; signature: string; outcome: Outcome | "pending"; spent: string | null; coins: string | null; error?: string;
};

/** The Ledger kind a buyback's two entries carry. */
const LEDGER_KIND = { burn: "creator_burn", liquidity: "creator_liquidity" } as const;

type Raw = RawTransaction & { meta: NonNullable<RawTransaction["meta"]> | null };

/**
 * The Quote Asset a landed buyback took out of the operations wallet, raw units. For SOL, which the transaction wraps
 * and unwraps inside itself, what the accounts of the market gained in wrapped SOL: the curve's or the pool's vault and
 * any fee vault a curve trade pays into; the wallet's own SOL also paid the network fee and any rent, which are not the
 * buyback's. For any other asset, what left the wallet's own accounts of it, which is also right for an asset with a
 * transfer fee.
 */
export function quoteSpent(raw: RawTransaction, operationsWallet: PublicKey, quoteMint: string): bigint {
  const meta = (raw as Raw).meta;
  if (!meta || meta.err) return 0n;
  const ops = operationsWallet.toBase58();
  const sum = (balances: NonNullable<typeof meta.preTokenBalances>, own: boolean) =>
    balances.filter((b) => b.mint === quoteMint && (b.owner === ops) === own).reduce((s, b) => s + BigInt(b.uiTokenAmount.amount), 0n);
  const [pre, post] = [meta.preTokenBalances ?? [], meta.postTokenBalances ?? []];
  const spent = quoteMint === WSOL ? sum(post, false) - sum(pre, false) : sum(pre, true) - sum(post, true);
  return spent > 0n ? spent : 0n;
}

/** What a landed buyback did beyond what it spent, by its rule. */
function outcomeOf(cfg: Config, raw: RawTransaction, operationsWallet: PublicKey, row: BuybackRow): BuybackOutcome {
  return row.kind === "burn" ? decodeBurnRun(raw, operationsWallet, row) : decodeLiquidityRun(cfg, raw, operationsWallet, row);
}

/**
 * Signs, writes down, sends and waits for one buyback. A transaction the node refuses is marked failed; one that never
 * lands before its blockhash expires, expired. Either frees its budget for the next run.
 */
export async function sendBuyback({ db, cfg, operations, connection }: RuleDeps, pot: RulePot, kind: Kind, plan: BuybackPlan): Promise<BuybackReport> {
  const ops = operations.publicKey;
  const tx = await signedTransaction(connection, operations, plan.instructions, plan.lookupTables ?? [], plan.signers ?? []);
  const base = { mint: pot.mint, kind, venue: plan.venue, signature: tx.signature };
  const row = {
    signature: tx.signature, mint: pot.mint, kind, venue: plan.venue, market: plan.market.toBase58(), quoteMint: pot.quoteMint, quoteDecimals: pot.quoteDecimals,
    coinDecimals: pot.coinDecimals, budget: plan.budget.toString(), lpAmount: plan.liquidity?.lpAmount.toString() ?? null,
    feeKey: plan.liquidity?.feeKey.toBase58() ?? null, lockedLiquidity: plan.liquidity?.lockedLiquidity.toBase58() ?? null,
    lastValidBlockHeight: tx.lastValidBlockHeight,
  };
  // The same instructions on the same blockhash sign to the same signature: a run right after a refused one meets its
  // own earlier buyback here, and sends that one again instead of writing a second.
  const written = await db.insert(creatorBuybacks).values(row).onConflictDoNothing().returning({ signature: creatorBuybacks.signature });
  if (written.length === 0) {
    const [again] = await db
      .update(creatorBuybacks)
      .set({ status: "sending", error: null, settledAt: null })
      .where(and(eq(creatorBuybacks.signature, tx.signature), eq(creatorBuybacks.status, "failed")))
      .returning({ signature: creatorBuybacks.signature });
    // Already landed or still in flight under this very signature: it is counted, and must not go out again.
    if (!again) return { ...base, outcome: "failed", spent: null, coins: null, error: "a buyback with this signature is already recorded" };
  }
  try {
    await connection.sendRawTransaction(tx.serialized, { preflightCommitment: "confirmed" });
  } catch (e) {
    // Only a transaction the node refused (its preflight failed) is known not to have gone out. Anything else may
    // still land, so it stays in flight for the next run to settle.
    if (!(e instanceof SendTransactionError)) throw e;
    await resolve(db, tx.signature, "failed", e.message);
    return { ...base, outcome: "failed", spent: null, coins: null, error: e.message };
  }
  const [sent] = await db.select().from(creatorBuybacks).where(eq(creatorBuybacks.signature, tx.signature)).limit(1);
  for (;;) {
    const settled = await settleBuyback(db, cfg, connection, ops, sent!);
    if (settled) return { ...base, outcome: settled.outcome, spent: settled.spent ?? null, coins: settled.coins ?? null, ...(settled.error ? { error: settled.error } : {}) };
    if ((await connection.getBlockHeight("confirmed")) > tx.lastValidBlockHeight + 150) return { ...base, outcome: "pending", spent: null, coins: null };
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

/**
 * Where one buyback stands. A landed one is recorded on the Ledger (the Quote Asset out of the wallet, then the coins
 * burned or added), indexed as the trade of the coin it is, and marked landed with what it did; a failed or expired one
 * is marked so and moved nothing. Null while it may still land.
 */
export async function settleBuyback(
  db: Db, cfg: Config, connection: Connection, ops: PublicKey, row: BuybackRow,
): Promise<{ outcome: Outcome; spent?: string; coins?: string; error?: string } | null> {
  const { value: [status] } = await connection.getSignatureStatuses([row.signature], { searchTransactionHistory: true });
  if (status?.err) {
    const error = JSON.stringify(status.err);
    await resolve(db, row.signature, "failed", error);
    return { outcome: "failed", error };
  }
  if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") {
    const raw = await fetchRawTransaction(cfg.rpcUrl, row.signature);
    if (!raw) return null;
    const spent = quoteSpent(raw, ops, row.quoteMint);
    const did = outcomeOf(cfg, raw, ops, row);
    const time = new Date((raw.blockTime ?? Math.floor(Date.now() / 1000)) * 1000);
    const entry = { signature: row.signature, kind: LEDGER_KIND[row.kind], source: ops.toBase58(), launchMint: row.mint, slot: raw.slot, blockTime: time };
    // The Ledger first: if the run dies between the writes, the buyback is still `sending`, still counted at its
    // budget, and the next run finds the entries already there.
    await db
      .insert(ledgerEntries)
      .values([
        { ...entry, eventIndex: 0, assetMint: row.quoteMint, assetDecimals: row.quoteDecimals, amount: spent.toString(), destination: row.market },
        row.kind === "burn"
          ? { ...entry, eventIndex: 1, assetMint: row.mint, assetDecimals: row.coinDecimals, amount: (did.burned ?? 0n).toString(), destination: BURN_DESTINATION.toBase58() }
          : { ...entry, eventIndex: 1, assetMint: row.mint, assetDecimals: row.coinDecimals, amount: (did.coinsAdded ?? 0n).toString(), destination: row.market },
      ])
      .onConflictDoNothing();
    if (row.kind === "liquidity") await registerFeeKey(db, ops, row);
    // The buy is a trade of the coin like anyone else's, on the chart and in the history without waiting for the webhook.
    await indexTransactions(db, cfg, [raw]).catch((e) => console.error(`indexing buyback ${row.signature} failed`, e));
    await db
      .update(creatorBuybacks)
      .set({
        status: "landed", spent: spent.toString(), coins: did.coins.toString(), burned: did.burned?.toString() ?? null,
        coinsAdded: did.coinsAdded?.toString() ?? null, quoteAdded: did.quoteAdded?.toString() ?? null, slot: raw.slot, blockTime: time, error: null,
        settledAt: sql`now()`,
      })
      .where(eq(creatorBuybacks.signature, row.signature));
    return { outcome: "landed", spent: spent.toString(), coins: did.coins.toString() };
  }
  if (!status && (await connection.getBlockHeight("confirmed")) > row.lastValidBlockHeight) {
    await resolve(db, row.signature, "expired");
    return { outcome: "expired" };
  }
  return null;
}

/** Settles every buyback an earlier run left in flight; returns what it settled and the coins still waiting on one. */
export async function settlePendingBuybacks({ db, cfg, operations, connection }: RuleDeps) {
  const pending = await db.select().from(creatorBuybacks).where(eq(creatorBuybacks.status, "sending"));
  const settled: { signature: string; outcome: Outcome }[] = [];
  const busy = new Set<string>();
  for (const p of pending) {
    const s = await settleBuyback(db, cfg, connection, operations.publicKey, p);
    if (s) settled.push({ signature: p.signature, outcome: s.outcome });
    else busy.add(p.mint);
  }
  return { settled, busy };
}

async function resolve(db: Db, signature: string, status: "failed" | "expired", error?: string) {
  await db.update(creatorBuybacks).set({ status, error: error ?? null, settledAt: sql`now()` }).where(eq(creatorBuybacks.signature, signature));
}
