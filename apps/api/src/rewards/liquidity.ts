// The Reward Liquidity (#214, ADR 0006 amended): a Reward Launch whose Creator fixed a share at launch has that share of
// every harvested Reward Tax kept apart, in the transaction that withdraws the tax (`burns.ts`), in an account of its
// own the operations wallet holds. Once the coin has graduated and what is kept is worth a locked position of its own
// (`LIQUIDITY_ADD_MIN_LAMPORTS`), one transaction sells part of the kept coins in the coin's pool for its Quote Asset,
// deposits the pair and locks the LP tokens with Raydium's lock program, the operations wallet keeping the position's
// Fee Key, as the Creator Earnings `liquidity` rule does (ADR 0011). Like every job transaction it is written down
// before it is sent and settled by its signature, so a run that dies leaves it for the next run, which records what
// landed; and the coins it adds are the account's own, so no run can ever add them twice.
import { Keypair, PACKET_DATA_SIZE, PublicKey, SendTransactionError, type Connection } from "@solana/web3.js";
import { ACCOUNT_SIZE, TOKEN_2022_PROGRAM_ID, getAccountLenForMint, unpackAccount, unpackMint } from "@solana/spl-token";
import BN from "bn.js";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  decodeLiquidityAddition, graduatedPool, liquidityCoinAccount, loadLookupTable, loadPool, lockedPositionOf, openSeededTokenAccount,
  planRewardLiquidityAddition, poolSides, rewardLiquidityInstructions, rewardLiquidityQuoteAccount, signedTransaction, type Pool, type RawTransaction,
} from "@launchpad/chain";
import { feeKeys, jobTransactions, ledgerEntries, type Db } from "@launchpad/db";
import type { Config } from "../env";
import { lookupTableWaits, transactionBytes } from "../fees/rules/liquidity";
import { valuer } from "../fees/value";
import { fetchRawTransaction, indexTransactions } from "../indexer";

const JOB = "reward-rounds";
/** The purpose an addition is written down under, and the Ledger kind it is recorded as. */
const KIND = "reward_liquidity";
const POLL_MS = 400;

/** A Reward Launch as the addition needs it. */
export type LiquidityCoin = { mint: string; symbol: string; decimals: number; pool: string; quoteMint: string };

/** One addition a run sent, as the job's summary carries it: strings, since a summary is stored and logged as JSON. */
export type LiquidityReport = {
  mint: string; signature: string; outcome: "landed" | "expired"; coinsSold: string | null; coinsAdded: string | null; quoteAdded: string | null; position: string;
};

/** What the Reward Liquidity holds for a coin now: coins kept and not added yet, and Quote Asset an earlier sale left. */
export async function liquidityWaiting(connection: Connection, ops: PublicKey, coin: Pick<LiquidityCoin, "mint" | "quoteMint">) {
  const mint = new PublicKey(coin.mint);
  const quoteMint = new PublicKey(coin.quoteMint);
  const quoteProgram = (await connection.getAccountInfo(quoteMint, "confirmed"))?.owner;
  if (!quoteProgram) throw new Error(`the Quote Asset's mint ${coin.quoteMint} does not exist`);
  const coinAccount = await liquidityCoinAccount(ops, mint, TOKEN_2022_PROGRAM_ID, "reward");
  const quoteAccount = await rewardLiquidityQuoteAccount(ops, mint, quoteProgram);
  const [coinInfo = null, quoteInfo = null] = await connection.getMultipleAccountsInfo([coinAccount.address, quoteAccount.address], "confirmed");
  const balance = (address: PublicKey, info: typeof coinInfo, program: PublicKey, of: PublicKey) => {
    if (!info || info.data.length === 0) return { opened: false, amount: 0n };
    const token = info.owner.equals(program) ? unpackAccount(address, info, program) : null;
    if (!token || !token.mint.equals(of) || !token.owner.equals(ops))
      throw new Error(`the address of the Reward Liquidity's account ${address.toBase58()} is taken by something else`);
    return { opened: true, amount: token.amount };
  };
  return {
    coinAccount: { ...coinAccount, ...balance(coinAccount.address, coinInfo, TOKEN_2022_PROGRAM_ID, mint) },
    quoteAccount: { ...quoteAccount, ...balance(quoteAccount.address, quoteInfo, quoteProgram, quoteMint), program: quoteProgram, lamports: quoteInfo?.lamports ?? 0 },
  };
}

/** What kept coins and Quote Asset are worth in the Quote Asset at the pool's price, before any sale moves it. */
function worthInQuote(pool: Pool, coin: PublicKey, coins: bigint, quote: bigint) {
  const { base, quote: q } = poolSides(pool, coin);
  if (base.reserve.isZero()) return quote;
  return quote + BigInt(new BN(coins.toString()).mul(q.reserve).div(base.reserve).toString());
}

/**
 * One coin's turn: settles an addition an earlier run left in flight, then adds what is kept when the coin has
 * graduated, its pool can take it and it is worth the minimum. A reason in words when it waits; null when nothing is
 * kept at all.
 */
export async function addRewardLiquidity(
  db: Db, cfg: Config, connection: Connection, operations: Keypair, coin: LiquidityCoin,
): Promise<{ added: LiquidityReport | null; settled: { landed: number; failed: number; expired: number }; waits: string | null }> {
  const ops = operations.publicKey;
  const settled = await settlePendingAdditions(db, cfg, connection, ops, coin.mint);
  const none = { added: null, settled };
  if (settled.inFlight) return { ...none, waits: "an earlier addition may still land" };
  const mint = new PublicKey(coin.mint);
  const kept = await liquidityWaiting(connection, ops, coin);
  if (kept.coinAccount.amount === 0n) return { ...none, waits: null };
  const market = await graduatedPool(connection, cfg, new PublicKey(coin.pool));
  if (!market) return { ...none, waits: "waits for Graduation: the share is added to the coin's pool, and the curve has none" };
  const pool = await loadPool(connection, market);
  if (!pool) return { ...none, waits: "the coin's pool is not there yet" };
  if (!pool.swapEnabled || !pool.depositEnabled) return { ...none, waits: "the pool is paused" };
  if (pool.chainTime < pool.openTime) return { ...none, waits: "the pool is not open yet" };
  const worthAPosition = await valuer(db, cfg.liquidityAddMinLamports);
  if (!worthAPosition(coin.quoteMint, worthInQuote(pool, mint, kept.coinAccount.amount, kept.quoteAccount.amount)))
    return { ...none, waits: "waits until what is kept is worth a locked position of its own" };
  const table = await loadLookupTable(connection, cfg.lookupTable);
  const tableWaits = await lookupTableWaits(connection, operations, cfg, table, pool.ammConfig);
  if (tableWaits) return { ...none, waits: tableWaits };

  const addition = planRewardLiquidityAddition(pool, mint, new BN(kept.coinAccount.amount.toString()), new BN(kept.quoteAccount.amount.toString()));
  if (!addition) return { ...none, waits: "what is kept adds no liquidity yet" };
  const quoteMint = new PublicKey(coin.quoteMint);
  let open: ReturnType<typeof openSeededTokenAccount> = [];
  if (!kept.quoteAccount.opened) {
    const program = kept.quoteAccount.program;
    let space = ACCOUNT_SIZE;
    if (program.equals(TOKEN_2022_PROGRAM_ID)) {
      const info = await connection.getAccountInfo(quoteMint, "confirmed");
      space = getAccountLenForMint(unpackMint(quoteMint, info, TOKEN_2022_PROGRAM_ID));
    }
    const rent = await connection.getMinimumBalanceForRentExemption(space, "confirmed");
    open = openSeededTokenAccount({
      owner: ops, address: kept.quoteAccount.address, seed: kept.quoteAccount.seed, mint: quoteMint, tokenProgram: program, space, rent, lamports: kept.quoteAccount.lamports,
    });
  }
  const feeKey = Keypair.generate();
  const instructions = rewardLiquidityInstructions({
    programs: cfg, pool, coin: mint, owner: ops, addition, coinAccount: kept.coinAccount.address, quoteAccount: { address: kept.quoteAccount.address, open },
    feeKey: feeKey.publicKey,
  });
  const bytes = transactionBytes(ops, instructions, [table]);
  if (bytes === null || bytes > PACKET_DATA_SIZE) throw new Error(`the addition is ${bytes ?? "far over"} bytes, over the ${PACKET_DATA_SIZE}-byte limit`);
  const tx = await signedTransaction(connection, operations, instructions, [table], [feeKey]);
  const position = lockedPositionOf(cfg.lock, feeKey.publicKey, ops).lockedLiquidity.toBase58();
  // Written before it is sent: a run that dies here finds it on its next run and records it, and adds nothing meanwhile.
  await db
    .insert(jobTransactions)
    .values({ signature: tx.signature, job: JOB, purpose: KIND, subject: coin.mint, lastValidBlockHeight: tx.lastValidBlockHeight })
    .onConflictDoNothing();
  try {
    await connection.sendRawTransaction(tx.serialized, { preflightCommitment: "confirmed" });
  } catch (e) {
    // Only a transaction the node refused is known not to have gone out; anything else may still land and stays pending.
    if (!(e instanceof SendTransactionError)) throw e;
    await resolve(db, tx.signature, "failed", e.message);
    throw new Error(`the Reward Liquidity addition ${tx.signature} was refused: ${e.message}`, { cause: e });
  }
  for (;;) {
    const s = await settle(db, cfg, connection, ops, { signature: tx.signature, subject: coin.mint, lastValidBlockHeight: tx.lastValidBlockHeight });
    if (s) {
      if (s.outcome === "failed") throw new Error(`the Reward Liquidity addition ${tx.signature} failed on-chain: ${s.error}`);
      const did = s.outcome === "landed" ? s.did : null;
      const added: LiquidityReport = {
        mint: coin.mint, signature: tx.signature, outcome: s.outcome, coinsSold: did?.coinsSold ?? null, coinsAdded: did?.coinsAdded ?? null,
        quoteAdded: did?.quoteAdded ?? null, position,
      };
      return { added, settled, waits: null };
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

/** Settles the coin's additions an earlier run left in flight; while one may still land, the coin adds nothing more. */
async function settlePendingAdditions(db: Db, cfg: Config, connection: Connection, ops: PublicKey, mint: string) {
  const pending = await db
    .select()
    .from(jobTransactions)
    .where(and(eq(jobTransactions.job, JOB), eq(jobTransactions.purpose, KIND), eq(jobTransactions.subject, mint), eq(jobTransactions.status, "pending")));
  const out = { landed: 0, failed: 0, expired: 0, inFlight: false };
  for (const p of pending) {
    const s = await settle(db, cfg, connection, ops, p);
    if (s) out[s.outcome]++;
    else out.inFlight = true;
  }
  return out;
}

type Did = { coinsSold: string; coinsAdded: string; quoteAdded: string };
type Settled = { outcome: "landed"; did: Did } | { outcome: "failed"; error: string } | { outcome: "expired" };

/** Where one addition stands: landed (and on the Ledger), failed on-chain, expired unlanded, or null while it may still land. */
async function settle(
  db: Db, cfg: Config, connection: Connection, ops: PublicKey, t: { signature: string; subject: string; lastValidBlockHeight: number },
): Promise<Settled | null> {
  const { value: [status] } = await connection.getSignatureStatuses([t.signature], { searchTransactionHistory: true });
  if (status?.err) {
    const error = JSON.stringify(status.err);
    await resolve(db, t.signature, "failed", error);
    return { outcome: "failed", error };
  }
  if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") {
    const raw = await fetchRawTransaction(cfg.rpcUrl, t.signature);
    if (!raw) return null;
    const did = await recordAddition(db, cfg, connection, ops, raw, new PublicKey(t.subject));
    await resolve(db, t.signature, "landed");
    return { outcome: "landed", did };
  }
  if (!status && (await connection.getBlockHeight("confirmed")) > t.lastValidBlockHeight) {
    await resolve(db, t.signature, "expired");
    return { outcome: "expired" };
  }
  return null;
}

/** Account positions in `lock_cp_liquidity`: the Fee Key's mint, which signs, and the pool. */
const LOCK = { feeKey: 4, pool: 6 } as const;

/**
 * Records a landed addition, read back from its transaction: on the Ledger, the coins its sale took into the pool, then
 * the coins and the Quote Asset its deposit put into the pool, to the locked position; the Fee Key, so the Fee Collector
 * collects the position's fees from its next run; and the sale as the trade of the coin it is.
 */
async function recordAddition(db: Db, cfg: Config, connection: Connection, ops: PublicKey, raw: RawTransaction, mint: PublicKey): Promise<Did> {
  const signature = raw.transaction.signatures[0]!;
  const meta = raw.meta as (RawTransaction["meta"] & { postTokenBalances?: { mint: string; uiTokenAmount: { decimals: number } }[] }) | null;
  const keys = [...raw.transaction.message.accountKeys, ...(meta?.loadedAddresses?.writable ?? []), ...(meta?.loadedAddresses?.readonly ?? [])];
  const lock = raw.transaction.message.instructions.find((ix) => keys[ix.programIdIndex] === cfg.lock.toBase58());
  if (!lock) throw new Error(`transaction ${signature} locks nothing, so it is not a Reward Liquidity addition`);
  const feeKey = new PublicKey(keys[lock.accounts[LOCK.feeKey]!]!);
  const pool = new PublicKey(keys[lock.accounts[LOCK.pool]!]!);
  const did = decodeLiquidityAddition(raw, cfg.cpmm, pool, mint);
  if (!did) throw new Error(`transaction ${signature} is not a liquidity addition to pool ${pool.toBase58()}`);
  const { lockedLiquidity, feeKeyAccount } = lockedPositionOf(cfg.lock, feeKey, ops);
  const loaded = await loadPool(connection, pool);
  if (!loaded) throw new Error(`pool ${pool.toBase58()} is gone`);
  const quote = poolSides(loaded, mint).quote;
  const decimals = (m: PublicKey, fallback: number) => meta?.postTokenBalances?.find((b) => b.mint === m.toBase58())?.uiTokenAmount.decimals ?? fallback;
  const entry = { signature, kind: KIND, source: ops.toBase58(), launchMint: mint.toBase58(), slot: raw.slot, blockTime: new Date((raw.blockTime ?? Math.floor(Date.now() / 1000)) * 1000) };
  const coinDecimals = decimals(mint, 6);
  await db
    .insert(ledgerEntries)
    .values([
      ...(did.coinsSold.isZero()
        ? []
        : [{ ...entry, eventIndex: 0, assetMint: mint.toBase58(), assetDecimals: coinDecimals, amount: did.coinsSold.toString(), destination: pool.toBase58() }]),
      { ...entry, eventIndex: 1, assetMint: mint.toBase58(), assetDecimals: coinDecimals, amount: did.coinsAdded.toString(), destination: lockedLiquidity.toBase58() },
      {
        ...entry, eventIndex: 2, assetMint: quote.mint.toBase58(), assetDecimals: decimals(quote.mint, quote.decimals), amount: did.quoteAdded.toString(),
        destination: lockedLiquidity.toBase58(),
      },
    ])
    .onConflictDoNothing();
  // The Fee Collector may have found the key on-chain already, so a second registration changes nothing.
  await db
    .insert(feeKeys)
    .values({ nftMint: feeKey.toBase58(), nftAccount: feeKeyAccount.toBase58(), lockedLiquidity: lockedLiquidity.toBase58(), pool: pool.toBase58() })
    .onConflictDoNothing();
  // On the chart and in the coin's history without waiting for the webhook.
  await indexTransactions(db, cfg, [raw]).catch((e) => console.error(`indexing Reward Liquidity addition ${signature} failed`, e));
  return { coinsSold: did.coinsSold.toString(), coinsAdded: did.coinsAdded.toString(), quoteAdded: did.quoteAdded.toString() };
}

async function resolve(db: Db, signature: string, status: "landed" | "failed" | "expired", error?: string) {
  await db.update(jobTransactions).set({ status, error: error ?? null, resolvedAt: sql`now()` }).where(eq(jobTransactions.signature, signature));
}

/** A coin's Reward Liquidity additions as the Ledger has them: every coin and Quote Asset added so far, and the newest `limit`. */
export async function additionsOf(db: Db, mint: string, limit = 10) {
  const added = and(eq(ledgerEntries.kind, KIND), eq(ledgerEntries.launchMint, mint));
  const [totals] = await db
    .select({
      coins: sql<string>`coalesce(sum(${ledgerEntries.amount}) filter (where ${ledgerEntries.eventIndex} = 1), 0)::text`,
      quote: sql<string>`coalesce(sum(${ledgerEntries.amount}) filter (where ${ledgerEntries.eventIndex} = 2), 0)::text`,
    })
    .from(ledgerEntries)
    .where(added);
  const rows = await db
    .select({ signature: ledgerEntries.signature, eventIndex: ledgerEntries.eventIndex, amount: ledgerEntries.amount, destination: ledgerEntries.destination, blockTime: ledgerEntries.blockTime })
    .from(ledgerEntries)
    .where(and(added, sql`${ledgerEntries.eventIndex} in (1, 2)`))
    .orderBy(desc(ledgerEntries.slot), desc(ledgerEntries.recordedAt))
    .limit(limit * 2);
  const recent = new Map<string, { signature: string; coins: string; quote: string; position: string; time: string }>();
  for (const r of rows) {
    const a = recent.get(r.signature) ?? { signature: r.signature, coins: "0", quote: "0", position: r.destination, time: r.blockTime.toISOString() };
    if (r.eventIndex === 1) a.coins = r.amount;
    else a.quote = r.amount;
    recent.set(r.signature, a);
  }
  return { coinsAdded: totals!.coins, quoteAdded: totals!.quote, recent: [...recent.values()].slice(0, limit) };
}
