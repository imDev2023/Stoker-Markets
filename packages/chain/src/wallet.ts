import {
  Keypair, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction, type Connection, type TransactionInstruction,
} from "@solana/web3.js";
import {
  ACCOUNT_SIZE, TOKEN_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction, createCloseAccountInstruction,
  createInitializeAccount3Instruction, getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import type BN from "bn.js";
import { WSOL_MINT } from "./programs";

/** An unsigned transaction for a wallet to sign as fee payer. */
export type UnsignedTransaction = {
  /** Base64 of an unsigned v0 transaction. */
  transaction: string;
  lastValidBlockHeight: number;
};

/**
 * The trader's token accounts for one trade of a coin against its Quote Asset, with the instructions that open them
 * before the trade and close them after.
 * SOL goes through a temporary wrapped-SOL account opened and closed inside the transaction, so the trader ends up with
 * plain SOL and any wrapped SOL they already hold is never touched. A buy funds it with what the trader pays.
 */
export async function tradeAccounts(
  connection: Connection,
  t: {
    trader: PublicKey;
    baseMint: PublicKey;
    baseTokenProgram: PublicKey;
    quoteMint: PublicKey;
    quoteTokenProgram: PublicKey;
    side: "buy" | "sell";
    amountIn: BN;
  },
) {
  const { trader, side } = t;
  const base = getAssociatedTokenAddressSync(t.baseMint, trader, false, t.baseTokenProgram);
  const setup: TransactionInstruction[] = [];
  const cleanup: TransactionInstruction[] = [];
  let quote: PublicKey;
  if (t.quoteMint.equals(WSOL_MINT)) {
    const seed = Keypair.generate().publicKey.toBase58().slice(0, 32);
    quote = await PublicKey.createWithSeed(trader, seed, TOKEN_PROGRAM_ID);
    const rent = await connection.getMinimumBalanceForRentExemption(ACCOUNT_SIZE, "confirmed");
    setup.push(
      SystemProgram.createAccountWithSeed({
        fromPubkey: trader,
        basePubkey: trader,
        seed,
        newAccountPubkey: quote,
        lamports: rent + (side === "buy" ? t.amountIn.toNumber() : 0),
        space: ACCOUNT_SIZE,
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeAccount3Instruction(quote, WSOL_MINT, trader),
    );
    cleanup.push(createCloseAccountInstruction(quote, trader, trader));
  } else {
    quote = getAssociatedTokenAddressSync(t.quoteMint, trader, false, t.quoteTokenProgram);
    if (side === "sell") setup.push(createAssociatedTokenAccountIdempotentInstruction(trader, quote, trader, t.quoteMint, t.quoteTokenProgram));
  }
  if (side === "buy") setup.push(createAssociatedTokenAccountIdempotentInstruction(trader, base, trader, t.baseMint, t.baseTokenProgram));
  return { base, quote, setup, cleanup };
}

/** Compiles instructions into an unsigned v0 transaction with a fresh blockhash. */
export async function unsignedTransaction(connection: Connection, payer: PublicKey, instructions: TransactionInstruction[]): Promise<UnsignedTransaction> {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const message = new TransactionMessage({ payerKey: payer, recentBlockhash: blockhash, instructions }).compileToV0Message();
  return { transaction: Buffer.from(new VersionedTransaction(message).serialize()).toString("base64"), lastValidBlockHeight };
}
