import {
  ComputeBudgetProgram, PublicKey, TransactionMessage, VersionedTransaction, type AccountInfo, type Connection,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, createCloseAccountInstruction, getAssociatedTokenAddressSync, unpackAccount, unpackMint,
} from "@solana/spl-token";
import { claimCreatorFeeIx } from "./instructions";
import { launchlabPdas } from "./pda";
import { WSOL_MINT } from "./programs";

const TOKEN_PROGRAMS = [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID];

/** A fee vault LaunchLab keeps per Quote Asset, and what it holds right now. */
export type FeeVault = {
  quoteMint: PublicKey;
  vault: PublicKey;
  /** Raw units of the Quote Asset; zero when the vault has never been opened. */
  balance: bigint;
  quoteDecimals: number;
  quoteTokenProgram: PublicKey;
};

/** What one of a Creator's Creator Fee vaults holds right now. There is one vault per Creator and Quote Asset. */
export type CreatorFeeVault = FeeVault;

/**
 * Reads the Creator's Creator Fee vaults for the given Quote Assets straight from the chain, which is the only truth about
 * what they can claim. A vault is shared by every Launch of this Creator against that Quote Asset, on any LaunchLab
 * platform, so its balance can include Creator Fee earned elsewhere. An address that is not a token mint has no vault
 * and is left out.
 */
export async function readCreatorFeeVaults(
  connection: Connection, program: PublicKey, creator: PublicKey, quoteMints: PublicKey[],
): Promise<CreatorFeeVault[]> {
  const pdas = launchlabPdas(program);
  return readFeeVaults(connection, quoteMints.map((m) => ({ quoteMint: m, vault: pdas.creatorFeeVault(creator, m) })));
}

/** Reads fee vaults with their Quote Assets' decimals and token programs; an address that is not a token mint is left out. */
export async function readFeeVaults(connection: Connection, vaults: { quoteMint: PublicKey; vault: PublicKey }[]): Promise<FeeVault[]> {
  if (vaults.length === 0) return [];
  const infos = await connection.getMultipleAccountsInfo([...vaults.map((v) => v.quoteMint), ...vaults.map((v) => v.vault)], "confirmed");
  return vaults.flatMap(({ quoteMint, vault }, i) => {
    const decimals = mintDecimals(quoteMint, infos[i] ?? null);
    if (decimals === null) return [];
    return [{
      quoteMint,
      vault,
      balance: vaultBalance(vault, infos[vaults.length + i] ?? null),
      quoteDecimals: decimals,
      quoteTokenProgram: infos[i]!.owner,
    }];
  });
}

function mintDecimals(address: PublicKey, info: AccountInfo<Buffer> | null) {
  if (!info || !TOKEN_PROGRAMS.some((p) => p.equals(info.owner))) return null;
  try {
    return unpackMint(address, info, info.owner).decimals;
  } catch {
    return null; // a token account, not a mint
  }
}

function vaultBalance(vault: PublicKey, info: AccountInfo<Buffer> | null) {
  return info ? unpackAccount(vault, info, info.owner).amount : 0n;
}

export type CreatorFeeClaimRequest = { program: PublicKey; creator: PublicKey; quoteMint: PublicKey };

export type PreparedCreatorFeeClaim = {
  /** Base64 of an unsigned v0 transaction; the Creator's wallet signs it as fee payer. */
  transaction: string;
  lastValidBlockHeight: number;
  /** What the vault held when the transaction was built; the claim takes whatever it holds when it lands. */
  amount: bigint;
  quoteDecimals: number;
  /** SOL arrives as plain SOL, because the transaction closes the wrapped-SOL account the claim opened. */
  unwrapped: boolean;
};

/** The Creator Fee vault holds nothing, so there is nothing to claim. */
export class NothingToClaimError extends Error {}

const CLAIM_COMPUTE_UNITS = 100_000;

/**
 * Builds a Creator Fee claim server-side (ADR 0003). Only the Creator can sign it: the vault's address is derived from
 * the signer, so nobody else can move their fee.
 * LaunchLab pays the claim into the Creator's associated token account, opening it if needed. For SOL, when that
 * wrapped-SOL account did not exist before, the same transaction closes it again, so the Creator receives plain SOL and
 * gets the account's rent back; an existing wrapped-SOL account, and whatever it already held, is left alone.
 */
export async function prepareCreatorFeeClaim(connection: Connection, r: CreatorFeeClaimRequest): Promise<PreparedCreatorFeeClaim> {
  const [vault] = await readCreatorFeeVaults(connection, r.program, r.creator, [r.quoteMint]);
  if (!vault || vault.balance === 0n) throw new NothingToClaimError("there is no Creator Fee to claim in this Quote Asset");
  const recipient = getAssociatedTokenAddressSync(r.quoteMint, r.creator, false, vault.quoteTokenProgram);
  const unwrap = r.quoteMint.equals(WSOL_MINT) && !(await connection.getAccountInfo(recipient, "confirmed"));
  const instructions = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: CLAIM_COMPUTE_UNITS }),
    claimCreatorFeeIx({ program: r.program, creator: r.creator, quoteMint: r.quoteMint, quoteTokenProgram: vault.quoteTokenProgram }),
    ...(unwrap ? [createCloseAccountInstruction(recipient, r.creator, r.creator, [], vault.quoteTokenProgram)] : []),
  ];
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const message = new TransactionMessage({ payerKey: r.creator, recentBlockhash: blockhash, instructions }).compileToV0Message();
  return {
    transaction: Buffer.from(new VersionedTransaction(message).serialize()).toString("base64"),
    lastValidBlockHeight,
    amount: vault.balance,
    quoteDecimals: vault.quoteDecimals,
    unwrapped: unwrap,
  };
}
