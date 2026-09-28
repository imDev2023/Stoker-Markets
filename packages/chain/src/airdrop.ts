import {
  Keypair, PublicKey, TransactionMessage, VersionedTransaction, type AddressLookupTableAccount, type Connection,
  type TransactionInstruction,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction, createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import BN from "bn.js";
import bs58 from "bs58";
import { serialized } from "./launch";
import type { RawTransaction } from "./decode";

/** One wallet an airdrop pays, and how many coins (raw units) it gets. */
export type AirdropRecipient = { wallet: PublicKey; amount: BN };

export type AirdropRequest = {
  creator: PublicKey;
  mint: PublicKey;
  decimals: number;
  tokenProgram: PublicKey;
  recipients: AirdropRecipient[];
  lookupTable: AddressLookupTableAccount;
};

export type PreparedAirdrop = {
  /** Base64 unsigned v0 transactions, each paying the wallets listed beside it; the Creator signs every one. */
  transactions: { transaction: string; wallets: PublicKey[] }[];
  /** No transaction here can land after this block height. */
  lastValidBlockHeight: number;
};

/** The instructions that pay one recipient: open its coin account if it has none (the Creator pays the rent), then transfer. */
function payInstructions(r: AirdropRequest, to: AirdropRecipient): TransactionInstruction[] {
  const source = getAssociatedTokenAddressSync(r.mint, r.creator, false, r.tokenProgram);
  const destination = getAssociatedTokenAddressSync(r.mint, to.wallet, false, r.tokenProgram);
  return [
    createAssociatedTokenAccountIdempotentInstruction(r.creator, destination, to.wallet, r.mint, r.tokenProgram),
    createTransferCheckedInstruction(source, r.mint, destination, r.creator, BigInt(to.amount.toString()), r.decimals, [], r.tokenProgram),
  ];
}

function compile(r: AirdropRequest, recipients: AirdropRecipient[], blockhash: string) {
  const message = new TransactionMessage({
    payerKey: r.creator,
    recentBlockhash: blockhash,
    instructions: recipients.flatMap((to) => payInstructions(r, to)),
  }).compileToV0Message([r.lookupTable]);
  return new VersionedTransaction(message);
}

const fits = (tx: VersionedTransaction) => {
  try {
    serialized(tx);
    return true;
  } catch {
    return false;
  }
};

/**
 * Splits the recipients into groups that each fit one transaction, in the order given. Every transaction pays whole
 * recipients, so a recipient is either paid in full by one transaction or not at all.
 */
export function planAirdrop(r: AirdropRequest): AirdropRecipient[][] {
  // Any valid blockhash has the same size; the real one is set when the transactions are built.
  const placeholder = Keypair.generate().publicKey.toBase58();
  const groups: AirdropRecipient[][] = [];
  let group: AirdropRecipient[] = [];
  for (const to of r.recipients) {
    if (group.length > 0 && !fits(compile(r, [...group, to], placeholder))) {
      groups.push(group);
      group = [];
    }
    group.push(to);
    if (group.length === 1 && !fits(compile(r, group, placeholder))) throw new Error("one airdrop payment does not fit a transaction");
  }
  if (group.length > 0) groups.push(group);
  return groups;
}

/** Builds the airdrop's transactions server-side (ADR 0003), all on one blockhash. */
export async function prepareAirdrop(connection: Connection, r: AirdropRequest): Promise<PreparedAirdrop> {
  const groups = planAirdrop(r);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  return {
    transactions: groups.map((g) => ({
      transaction: Buffer.from(serialized(compile(r, g, blockhash))).toString("base64"),
      wallets: g.map((to) => to.wallet),
    })),
    lastValidBlockHeight,
  };
}

/** One checked token transfer inside a confirmed transaction. */
export type TokenTransfer = { tokenProgram: PublicKey; source: PublicKey; mint: PublicKey; destination: PublicKey; amount: BN };

const TRANSFER_CHECKED = 12;

/**
 * Every `transfer_checked` of either token program in a confirmed transaction, top-level or invoked by another program.
 * Failed transactions yield nothing. Airdrops pay with `transfer_checked`, so this is how the Indexer sees them.
 */
export function decodeTokenTransfers(raw: RawTransaction): TokenTransfer[] {
  const meta = raw.meta;
  if (!meta || meta.err) return [];
  const keys = [
    ...raw.transaction.message.accountKeys,
    ...(meta.loadedAddresses?.writable ?? []),
    ...(meta.loadedAddresses?.readonly ?? []),
  ];
  const programs = new Set([TOKEN_PROGRAM_ID.toBase58(), TOKEN_2022_PROGRAM_ID.toBase58()]);
  const all = [...raw.transaction.message.instructions, ...(meta.innerInstructions ?? []).flatMap((g) => g.instructions)];
  const transfers: TokenTransfer[] = [];
  for (const ix of all) {
    const program = keys[ix.programIdIndex];
    if (!program || !programs.has(program)) continue;
    const data = Buffer.from(bs58.decode(ix.data));
    if (data[0] !== TRANSFER_CHECKED || data.length < 10 || ix.accounts.length < 4) continue;
    const acct = (i: number) => new PublicKey(keys[ix.accounts[i]!]!);
    transfers.push({
      tokenProgram: new PublicKey(program),
      source: acct(0),
      mint: acct(1),
      destination: acct(2),
      amount: new BN(data.subarray(1, 9), "le"),
    });
  }
  return transfers;
}
