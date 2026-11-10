// The `liquidity` rule (ADR 0011, #184): once a coin has graduated, its Creator Earnings buy the coin in its pool, pair
// what they bought with the Quote Asset and add the pair to the pool, and the LP tokens are locked with Raydium's lock
// program in the same transaction; the operations wallet keeps the position's Fee Key.
import type { PublicKey } from "@solana/web3.js";
import type { RawTransaction } from "@launchpad/chain";
import type { Db } from "@launchpad/db";
import type { Config } from "../../env";
import type { RulePot } from "../creatorShares";
import type { BuybackRow } from "./buyback";
import type { BuybackOutcome, BuybackPlan, RuleDeps, Skipped } from "./types";

/**
 * Plans one liquidity addition for the coin with at most `amount` of its Quote Asset. Skipped, with the reason, before
 * Graduation (the share waits for the pool) and whenever the pool cannot take it right now.
 */
export async function planLiquidityAdd(_deps: RuleDeps, _pot: RulePot, _amount: bigint): Promise<BuybackPlan | Skipped> {
  return { skipped: "the liquidity rule is not built yet" };
}

/** What a landed addition did: the coins it bought, and the coins and Quote Asset its deposit put into the pool. */
export function decodeLiquidityRun(_cfg: Config, _raw: RawTransaction, _operationsWallet: PublicKey, _row: BuybackRow): BuybackOutcome {
  return { coins: 0n, coinsAdded: 0n, quoteAdded: 0n };
}

/** Puts a landed addition's Fee Key on record, so the Fee Collector collects the position's fees from its next run. */
export async function registerFeeKey(_db: Db, _operationsWallet: PublicKey, _row: BuybackRow): Promise<void> {}
