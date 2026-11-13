// Protocol-owned liquidity (#184, ADR 0006 amended): where the operator points the Burn's or the Flywheel's budget at
// `liquidity`, a run adds what the budget buys to the coin's own graduated pool instead of burning it. One transaction
// per coin, the one the Creator's liquidity rule sends (ADR 0011): it buys the coin in the pool with about half of the
// SOL, deposits what it bought with the matching SOL and locks the LP tokens for good with Raydium's lock program, which
// opens a position of its own and mints its Fee Key to the operations wallet. The Fee Collector collects the position's
// fees as `fee_key` revenue from its next run.
import { PublicKey, type Connection, type Keypair } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { eq, inArray } from "drizzle-orm";
import { decodeLiquidityAddition, signedTransaction, WSOL_MINT, type RawTransaction } from "@launchpad/chain";
import type { BudgetDestination } from "@launchpad/contract";
import { feeKeys, launches, ledgerEntries, platformSettings, type Db } from "@launchpad/db";
import type { Config } from "../env";
import { fetchRawTransaction, indexTransactions } from "../indexer";
import { quoteSpent } from "../fees/rules/buyback";
import { planLiquidityAdd } from "../fees/rules/liquidity";
import { isSkipped } from "../fees/rules/types";

const WSOL = WSOL_MINT.toBase58();
const POLL_MS = 400;

/** The budgets whose destination the operator sets, and the `platform_settings` key each is kept under. */
const DESTINATION_SETTING = { burn: "burn_destination", flywheel: "flywheel_destination" } as const;
export type BuyingBudget = keyof typeof DESTINATION_SETTING;
export type Destinations = Record<BuyingBudget, BudgetDestination>;

/** The Ledger kind an addition paid by each budget is recorded under; its SOL entry is that budget's spending. */
export const LIQUIDITY_KIND = { burn: "burn_liquidity", flywheel: "flywheel_liquidity" } as const;

/** Where each budget's buys go right now: `burn` unless the operator has pointed it at `liquidity`. */
export async function budgetDestinations(db: Db): Promise<Destinations> {
  const rows = await db.select().from(platformSettings).where(inArray(platformSettings.key, Object.values(DESTINATION_SETTING)));
  const of = (budget: BuyingBudget): BudgetDestination => (rows.find((r) => r.key === DESTINATION_SETTING[budget])?.value === "liquidity" ? "liquidity" : "burn");
  return { burn: of("burn"), flywheel: of("flywheel") };
}

/** Points the named budgets at their destinations; the run after the change follows it. */
export async function setBudgetDestinations(db: Db, change: Partial<Destinations>): Promise<Destinations> {
  for (const budget of Object.keys(DESTINATION_SETTING) as BuyingBudget[]) {
    const value = change[budget];
    if (!value) continue;
    await db
      .insert(platformSettings)
      .values({ key: DESTINATION_SETTING[budget], value })
      .onConflictDoUpdate({ target: platformSettings.key, set: { value, updatedAt: new Date() } });
  }
  return budgetDestinations(db);
}

/** Waits for a sent transaction to land; throws when it fails on-chain or its blockhash expires unlanded. */
export async function landed(connection: Connection, tx: { signature: string; lastValidBlockHeight: number }, what: string) {
  for (;;) {
    const { value: [status] } = await connection.getSignatureStatuses([tx.signature]);
    if (status?.err) throw new Error(`${what} failed on-chain: ${JSON.stringify(status.err)}`);
    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") return;
    if ((await connection.getBlockHeight("confirmed")) > tx.lastValidBlockHeight) throw new Error(`${what} expired unlanded`);
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

export type LiquidityAdded = { signature: string; lamports: string; amount: string; position: string; feeKey: string };

/**
 * Adds at most `lamports` of SOL to the coin's own pool as locked liquidity for `budget`, in one transaction, and puts
 * it on the Ledger. A reason in words when it cannot this run: the coin has not graduated, its pool is paused or not
 * open, the budget adds nothing, or the pool is paired with another Quote Asset. That last waits for a route: the
 * route's swap and the addition, which alone takes up to 1,226 of a transaction's 1,232 bytes, do not fit one
 * transaction, and a SOL route's surplus or an addition that fails after the route landed would leave the Quote Asset
 * in the operations wallet outside every budget.
 */
export async function addLiquidity(
  db: Db, cfg: Config, connection: Connection, operations: Keypair, mint: PublicKey, lamports: bigint, budget: BuyingBudget,
): Promise<LiquidityAdded | { skipped: string }> {
  const [launch] = await db.select({ curve: launches.pool, quoteMint: launches.quoteMint }).from(launches).where(eq(launches.mint, mint.toBase58())).limit(1);
  if (!launch) return { skipped: "not a coin launched here" };
  if (launch.quoteMint !== WSOL) return { skipped: "liquidity is added only to a pool paired with SOL; a coin paired with another Quote Asset waits" };
  const plan = await planLiquidityAdd({ cfg, operations, connection }, { mint: mint.toBase58(), curve: launch.curve }, lamports);
  if (isSkipped(plan)) return plan;
  const what = `the ${budget === "burn" ? "Burn's" : "Flywheel's"} liquidity addition to ${mint.toBase58()}`;
  const tx = await signedTransaction(connection, operations, plan.instructions, plan.lookupTables ?? [], plan.signers ?? []);
  await connection.sendRawTransaction(tx.serialized, { preflightCommitment: "confirmed" });
  await landed(connection, tx, what);
  return recordAddition(db, cfg, tx.signature, budget, mint, plan.market, plan.liquidity!, operations.publicKey);
}

/**
 * Records a landed addition: on the Ledger, the SOL that went into the pool (what its WSOL vault gained: the buy and
 * the half paired with it; the position's rent and the network fee are the platform's, as for a Creator's addition)
 * and the coins that went in, to the locked position; then the Fee Key, so the Fee Collector collects the position's
 * fees from its next run; then the buy as the trade of the coin it is.
 */
async function recordAddition(
  db: Db, cfg: Config, signature: string, budget: BuyingBudget, mint: PublicKey, pool: PublicKey,
  liquidity: { feeKey: PublicKey; lockedLiquidity: PublicKey }, ops: PublicKey,
): Promise<LiquidityAdded> {
  const raw = await fetchRawTransaction(cfg.rpcUrl, signature);
  if (!raw) throw new Error(`liquidity addition ${signature} not found after confirmation`);
  const did = decodeLiquidityAddition(raw, cfg.cpmm, pool, mint);
  if (!did) throw new Error(`transaction ${signature} is not a liquidity addition to pool ${pool.toBase58()}`);
  const spent = quoteSpent(raw, ops, WSOL);
  const time = new Date((raw.blockTime ?? Math.floor(Date.now() / 1000)) * 1000);
  const entry = { signature, kind: LIQUIDITY_KIND[budget], source: ops.toBase58(), launchMint: mint.toBase58(), slot: raw.slot, blockTime: time };
  await db
    .insert(ledgerEntries)
    .values([
      { ...entry, eventIndex: 0, assetMint: WSOL, assetDecimals: 9, amount: spent.toString(), destination: pool.toBase58() },
      {
        ...entry, eventIndex: 1, assetMint: mint.toBase58(), assetDecimals: coinDecimals(raw, mint), amount: did.coinsAdded.toString(),
        destination: liquidity.lockedLiquidity.toBase58(),
      },
    ])
    .onConflictDoNothing();
  // The lock put the Fee Key's NFT in the wallet's associated account of it. The Fee Collector may have found the key
  // on-chain already, so a second registration changes nothing.
  await db
    .insert(feeKeys)
    .values({
      nftMint: liquidity.feeKey.toBase58(), nftAccount: getAssociatedTokenAddressSync(liquidity.feeKey, ops, true).toBase58(),
      lockedLiquidity: liquidity.lockedLiquidity.toBase58(), pool: pool.toBase58(),
    })
    .onConflictDoNothing();
  // On the chart and in the coin's history without waiting for the webhook.
  await indexTransactions(db, cfg, [raw]).catch((e) => console.error(`indexing liquidity addition ${signature} failed`, e));
  return {
    signature, lamports: spent.toString(), amount: did.coinsAdded.toString(), position: liquidity.lockedLiquidity.toBase58(), feeKey: liquidity.feeKey.toBase58(),
  };
}

function coinDecimals(raw: RawTransaction, mint: PublicKey) {
  const meta = raw.meta as { postTokenBalances?: { mint: string; uiTokenAmount: { decimals: number } }[] } | null;
  return meta?.postTokenBalances?.find((b) => b.mint === mint.toBase58())?.uiTokenAmount.decimals ?? 6;
}
