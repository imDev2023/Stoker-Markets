// The rules a Creator's earnings can go to instead of their wallet (ADR 0011): what every rule is handed, and what a
// buyback hands back to be sent.
import type { AddressLookupTableAccount, Connection, Keypair, PublicKey, TransactionInstruction } from "@solana/web3.js";
import type { Db } from "@launchpad/db";
import type { Config } from "../../env";

export type RuleDeps = { db: Db; cfg: Config; operations: Keypair; connection: Connection };

/** A rule that did nothing for a coin this run, and why, in words an operator reads in the job's summary. */
export type Skipped = { skipped: string };

export const isSkipped = (r: object): r is Skipped => "skipped" in r;

/**
 * A buyback ready to be sent: one transaction that buys the coin in its own market with the Quote Asset the operations
 * wallet already holds for the coin's Creator, and burns what it bought or adds it to the pool as locked liquidity.
 */
export type BuybackPlan = {
  venue: "curve" | "pool";
  /** The curve's or the pool's address. */
  market: PublicKey;
  /**
   * The most Quote Asset the transaction can take out of the operations wallet, raw units: the limit of its buy plus,
   * for liquidity, the limit of the half it pairs. Never more than the pot it was planned from; it is counted against
   * the pot while the transaction may still land.
   */
  budget: bigint;
  instructions: TransactionInstruction[];
  /** Keys that sign beside the operations wallet, such as a new Fee Key's mint. */
  signers?: Keypair[];
  lookupTables?: AddressLookupTableAccount[];
  /** Liquidity: what the transaction is built to mint and lock, written down with it before it is sent. */
  liquidity?: { lpAmount: bigint; feeKey: PublicKey; lockedLiquidity: PublicKey };
};

/** What a landed buyback did beyond the Quote Asset it spent, read back from its transaction; raw units. */
export type BuybackOutcome = {
  /** Coins bought. */
  coins: bigint;
  /** Coins destroyed: all of them under the burn rule. */
  burned?: bigint;
  /** Liquidity: the coins and the Quote Asset that went into the pool. */
  coinsAdded?: bigint;
  quoteAdded?: bigint;
};
