// The `burn` rule (ADR 0011): a coin's Creator Earnings buy the coin in its own market, on the curve before
// Graduation and in its pool after, and burn every coin bought, in one transaction.
import type { PublicKey } from "@solana/web3.js";
import type { RawTransaction } from "@launchpad/chain";
import type { RulePot } from "../creatorShares";
import type { BuybackRow } from "./buyback";
import type { BuybackOutcome, BuybackPlan, RuleDeps, Skipped } from "./types";

/**
 * Plans one buyback and burn for the coin with at most `amount` of its Quote Asset, which the operations wallet holds
 * for it: an exact number of coins bought (what the amount buys at the current price, less the slippage allowance), so
 * the burn knows what to burn. Skipped, with the reason, when the market cannot take a buy right now.
 */
export async function planBurn(_deps: RuleDeps, _pot: RulePot, _amount: bigint): Promise<BuybackPlan | Skipped> {
  return { skipped: "the burn rule is not built yet" };
}

/** What a landed burn did: the coins its burn instruction destroyed, which are all it bought. */
export function decodeBurnRun(_raw: RawTransaction, _operationsWallet: PublicKey, _row: BuybackRow): BuybackOutcome {
  return { coins: 0n, burned: 0n };
}
