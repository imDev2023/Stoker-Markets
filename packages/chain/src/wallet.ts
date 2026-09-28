import {
  Keypair, PACKET_DATA_SIZE, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction, type Connection, type TransactionInstruction,
} from "@solana/web3.js";
import {
  ACCOUNT_SIZE, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction, createCloseAccountInstruction,
  createInitializeAccount3Instruction, getAccountLenForMint, getAssociatedTokenAddressSync, getMint,
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
    const wsol = await temporaryTokenAccount(connection, {
      owner: trader, mint: WSOL_MINT, tokenProgram: TOKEN_PROGRAM_ID, ...(side === "buy" ? { lamports: t.amountIn } : {}),
    });
    quote = wsol.address;
    setup.push(...wsol.open);
    cleanup.push(wsol.close);
  } else {
    quote = getAssociatedTokenAddressSync(t.quoteMint, trader, false, t.quoteTokenProgram);
    if (side === "sell") setup.push(createAssociatedTokenAccountIdempotentInstruction(trader, quote, trader, t.quoteMint, t.quoteTokenProgram));
  }
  if (side === "buy") setup.push(createAssociatedTokenAccountIdempotentInstruction(trader, base, trader, t.baseMint, t.baseTokenProgram));
  return { base, quote, setup, cleanup };
}

/**
 * A token account of `owner` that lives only inside one transaction: opened at a fresh address derived from the owner
 * (so the owner signs nothing extra) and closed at the end, which refunds its rent. A close fails unless the account
 * is empty, so a transaction that would leave anything in it fails as a whole.
 * `lamports` more than rent go in with it, which wraps them when the mint is wrapped SOL.
 */
export async function temporaryTokenAccount(
  connection: Connection,
  t: { owner: PublicKey; mint: PublicKey; tokenProgram: PublicKey; lamports?: BN },
) {
  const seed = Keypair.generate().publicKey.toBase58().slice(0, 32);
  const address = await PublicKey.createWithSeed(t.owner, seed, t.tokenProgram);
  let space = ACCOUNT_SIZE;
  if (t.tokenProgram.equals(TOKEN_2022_PROGRAM_ID)) {
    const mint = await getMint(connection, t.mint, "confirmed", TOKEN_2022_PROGRAM_ID);
    space = getAccountLenForMint(mint);
  }
  const rent = await connection.getMinimumBalanceForRentExemption(space, "confirmed");
  return {
    address,
    open: [
      SystemProgram.createAccountWithSeed({
        fromPubkey: t.owner,
        basePubkey: t.owner,
        seed,
        newAccountPubkey: address,
        lamports: rent + (t.lamports?.toNumber() ?? 0),
        space,
        programId: t.tokenProgram,
      }),
      createInitializeAccount3Instruction(address, t.mint, t.owner, t.tokenProgram),
    ],
    close: createCloseAccountInstruction(address, t.owner, t.owner, [], t.tokenProgram),
  };
}

/** Compiles instructions into an unsigned v0 transaction with a fresh blockhash. */
export async function unsignedTransaction(
  connection: Connection, payer: PublicKey, instructions: TransactionInstruction[], lookupTables: PublicKey[] = [],
): Promise<UnsignedTransaction> {
  const [{ blockhash, lastValidBlockHeight }, tables] = await Promise.all([
    connection.getLatestBlockhash("confirmed"),
    Promise.all(
      lookupTables.map(async (address) => {
        const table = (await connection.getAddressLookupTable(address, { commitment: "confirmed" })).value;
        if (!table) throw new Error(`address lookup table ${address.toBase58()} does not exist`);
        return table;
      }),
    ),
  ]);
  const message = new TransactionMessage({ payerKey: payer, recentBlockhash: blockhash, instructions }).compileToV0Message(tables);
  let bytes: Uint8Array;
  try {
    bytes = new VersionedTransaction(message).serialize();
  } catch {
    throw new TransactionTooLargeError(null);
  }
  if (bytes.length > PACKET_DATA_SIZE) throw new TransactionTooLargeError(bytes.length);
  return { transaction: Buffer.from(bytes).toString("base64"), lastValidBlockHeight };
}

/** The transaction would be over Solana's 1,232-byte limit even with its address lookup tables. */
export class TransactionTooLargeError extends Error {
  constructor(readonly bytes: number | null) {
    super(`the transaction is ${bytes ?? "far"} bytes, over the ${PACKET_DATA_SIZE}-byte limit`);
  }
}

/** What each instruction of a trade is for; see the contract's `TradeStep`. */
export type TradeStep = "setup" | "route" | "trade" | "cleanup";

/** An unsigned trade transaction with the step each of its instructions belongs to, in order. */
export type PreparedTrade = UnsignedTransaction & { steps: TradeStep[] };

/** Compiles steps of instructions into one unsigned v0 transaction and records which step each instruction is. */
export async function steppedTransaction(
  connection: Connection, payer: PublicKey, parts: { step: TradeStep; instructions: TransactionInstruction[] }[], lookupTables: PublicKey[] = [],
): Promise<PreparedTrade> {
  const tx = await unsignedTransaction(connection, payer, parts.flatMap((p) => p.instructions), lookupTables);
  return { ...tx, steps: parts.flatMap((p) => p.instructions.map(() => p.step)) };
}
