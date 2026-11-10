// The `liquidity` rule (ADR 0011, #184): once a coin has graduated, its Creator Earnings buy the coin in its pool, pair
// what they bought with the Quote Asset and add the pair to the pool, and the LP tokens are locked with Raydium's lock
// program in the same transaction; the operations wallet keeps the position's Fee Key.
import { Keypair, PACKET_DATA_SIZE, PublicKey, TransactionMessage, VersionedTransaction, type TransactionInstruction } from "@solana/web3.js";
import { ACCOUNT_SIZE, TOKEN_2022_PROGRAM_ID, getAccountLenForMint, getAssociatedTokenAddressSync, unpackAccount, unpackMint } from "@solana/spl-token";
import BN from "bn.js";
import {
  decodeLiquidityAddition, graduatedPool, liquidityAddInstructions, liquidityCoinAccount, liquidityLookupAddresses, loadLookupTable, loadPool,
  lockedPositionOf, openSeededTokenAccount, planLiquidityAddition, poolSides, type RawTransaction,
} from "@launchpad/chain";
import { feeKeys, type Db } from "@launchpad/db";
import type { Config } from "../../env";
import type { RulePot } from "../creatorShares";
import type { BuybackRow } from "./buyback";
import type { BuybackOutcome, BuybackPlan, RuleDeps, Skipped } from "./types";

/**
 * Plans one liquidity addition for the coin with at most `amount` of its Quote Asset. Skipped, with the reason, before
 * Graduation (the share waits for the pool) and whenever the pool cannot take it right now.
 *
 * The transaction buys an exact number of coins into an account of the rule's own for this coin, deposits them with
 * the matching Quote Asset for an exact number of LP tokens, and locks exactly those. The deposit is sized with a small
 * slack, so a pool that moved a little since the plan does not fail it; the coins it leaves stay in the rule's account,
 * and the next addition reads them there and pairs them with what it buys. Nothing of the rule's ever sits in the
 * wallet's associated account of the coin, which holds a Reward Launch's harvested tax and the coins fee collections
 * bring in for the sweep.
 */
export async function planLiquidityAdd({ cfg, operations, connection }: RuleDeps, pot: RulePot, amount: bigint): Promise<BuybackPlan | Skipped> {
  const owner = operations.publicKey;
  const coin = new PublicKey(pot.mint);
  const market = await graduatedPool(connection, cfg, new PublicKey(pot.curve));
  if (!market) return { skipped: "waits for Graduation: the share is added to the coin's pool, and is never spent on the curve" };
  const pool = await loadPool(connection, market);
  if (!pool) return { skipped: "the coin's pool is not there yet" };
  if (!pool.swapEnabled || !pool.depositEnabled) return { skipped: "the pool is paused" };
  if (pool.chainTime < pool.openTime) return { skipped: "the pool is not open yet" };
  const { base } = poolSides(pool, coin);

  const account = await liquidityCoinAccount(owner, coin, base.program);
  const [held = null, mint = null] = await connection.getMultipleAccountsInfo([account.address, coin], "confirmed");
  if (!mint) throw new Error(`the coin's mint ${pot.mint} does not exist`);
  // An address that holds lamports and nothing else is not an account yet: someone only sent it SOL.
  const opened = held !== null && held.data.length > 0;
  let onHand = 0n;
  if (held && opened) {
    const token = held.owner.equals(base.program) ? unpackAccount(account.address, held, base.program) : null;
    if (!token || !token.mint.equals(coin) || !token.owner.equals(owner))
      throw new Error(`the address of the rule's coin account, ${account.address.toBase58()}, is taken by something else`);
    onHand = token.amount;
  }

  const addition = planLiquidityAddition(pool, coin, new BN(amount.toString()), new BN(onHand.toString()));
  if (!addition) return { skipped: "the pot is too small to add any liquidity" };

  let open: TransactionInstruction[] = [];
  if (!opened) {
    const space = base.program.equals(TOKEN_2022_PROGRAM_ID) ? getAccountLenForMint(unpackMint(coin, mint, TOKEN_2022_PROGRAM_ID)) : ACCOUNT_SIZE;
    const rent = await connection.getMinimumBalanceForRentExemption(space, "confirmed");
    open = openSeededTokenAccount({ owner, address: account.address, seed: account.seed, mint: coin, tokenProgram: base.program, space, rent, lamports: held?.lamports ?? 0 });
  }
  const feeKey = Keypair.generate();
  const instructions = liquidityAddInstructions({ programs: cfg, pool, coin, owner, addition, coinAccount: { address: account.address, open }, feeKey: feeKey.publicKey });
  const table = await loadLookupTable(connection, cfg.lookupTable);
  // The addition only fits a transaction through the table, and a table on devnet or mainnet is extended by hand: one
  // that was not says so here, by address, rather than as an encoding error when the transaction is signed.
  const bytes = transactionBytes(owner, instructions, [table]);
  if (bytes === null || bytes > PACKET_DATA_SIZE) {
    const known = new Set(table.state.addresses.map((a) => a.toBase58()));
    const missing = liquidityLookupAddresses({ cpmm: cfg.cpmm, lock: cfg.lock, cpswapConfig: pool.ammConfig }).filter((a) => !known.has(a.toBase58()));
    throw new Error(
      `the transaction is ${bytes ?? "far over"} bytes, over the ${PACKET_DATA_SIZE}-byte limit` +
        (missing.length ? `: the Platform Lookup Table ${cfg.lookupTable.toBase58()} lacks ${missing.map((a) => a.toBase58()).join(", ")}` : ""),
    );
  }
  return {
    venue: "pool",
    market,
    budget: BigInt(addition.budget.toString()),
    instructions,
    signers: [feeKey],
    lookupTables: [table],
    liquidity: {
      lpAmount: BigInt(addition.lpAmount.toString()),
      feeKey: feeKey.publicKey,
      lockedLiquidity: lockedPositionOf(cfg.lock, feeKey.publicKey, owner).lockedLiquidity,
    },
  };
}

/** The size of the transaction these instructions make, signatures included; null when it is too large to encode at all. */
function transactionBytes(payer: PublicKey, instructions: TransactionInstruction[], tables: BuybackPlan["lookupTables"]) {
  const message = new TransactionMessage({ payerKey: payer, recentBlockhash: PublicKey.default.toBase58(), instructions }).compileToV0Message(tables);
  try {
    return new VersionedTransaction(message).serialize().length;
  } catch {
    return null;
  }
}

/** What a landed addition did: the coins it bought, and the coins and Quote Asset its deposit put into the pool. */
export function decodeLiquidityRun(cfg: Config, raw: RawTransaction, _operationsWallet: PublicKey, row: BuybackRow): BuybackOutcome {
  const did = decodeLiquidityAddition(raw, cfg.cpmm, new PublicKey(row.market), new PublicKey(row.mint));
  if (!did) throw new Error(`transaction ${row.signature} is not a liquidity addition to pool ${row.market}`);
  return { coins: BigInt(did.coinsBought.toString()), coinsAdded: BigInt(did.coinsAdded.toString()), quoteAdded: BigInt(did.quoteAdded.toString()) };
}

/** Puts a landed addition's Fee Key on record, so the Fee Collector collects the position's fees from its next run. */
export async function registerFeeKey(db: Db, operationsWallet: PublicKey, row: BuybackRow): Promise<void> {
  if (!row.feeKey || !row.lockedLiquidity) throw new Error(`the liquidity addition ${row.signature} was recorded without its Fee Key`);
  // The lock put the Fee Key's NFT in the wallet's associated account of it. The Fee Collector may have found the key
  // on-chain already, so a second registration changes nothing.
  const nftAccount = getAssociatedTokenAddressSync(new PublicKey(row.feeKey), operationsWallet, true);
  await db
    .insert(feeKeys)
    .values({ nftMint: row.feeKey, nftAccount: nftAccount.toBase58(), lockedLiquidity: row.lockedLiquidity, pool: row.market })
    .onConflictDoNothing();
}
