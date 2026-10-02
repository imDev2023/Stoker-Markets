import {
  ComputeBudgetProgram, PublicKey, SystemProgram, TransactionInstruction, TransactionMessage, VersionedTransaction, type AccountMeta,
  type AddressLookupTableAccount, type Connection, type Keypair,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction,
  createCloseAccountInstruction, createTransferCheckedInstruction, getAssociatedTokenAddressSync, unpackAccount, unpackMint,
} from "@solana/spl-token";
import bs58 from "bs58";
import BN from "bn.js";
import { readFeeVaults, type FeeVault } from "./claim";
import { cpmmCoder, launchlabCoder, lockCoder } from "./coder";
import type { PoolKeys } from "./cpmm";
import type { RawTransaction } from "./decode";
import { cpmmPdas, launchlabPdas, lockPdas } from "./pda";
import { WSOL_MINT, type Programs } from "./programs";

/**
 * The Fee Collector's side of the chain: the platform's revenue arrives in three streams, all claimed by the operations
 * wallet (ADR 0004), and leaves it only in sweeps to the treasury.
 *
 * - Platform Fee: LaunchLab moves our share of every curve trade into one vault per Quote Asset, owned by the program;
 *   the PlatformConfig's fee wallet claims it with `claim_platform_fee_from_vault`.
 * - Pool creator fee: after Graduation our platform is every CPMM pool's creator (`platform_cp_creator`, ADR 0001), so the
 *   pool's creator fee is ours to collect with `collect_creator_fee`.
 * - Fee Key: the migration locks the pool's LP in Raydium's lock program behind a Fee Key NFT, which the platform holds for
 *   100% of the locked LP; its holder collects the LP's share of the pool's trading fees with `collect_cp_fees`, in both tokens.
 *
 * SOL arrives as wrapped SOL; every collection closes the wrapped-SOL account in the same transaction, so SOL revenue lands
 * as plain SOL in the operations wallet.
 */

const meta = (pubkey: PublicKey, isSigner = false, isWritable = false): AccountMeta => ({ pubkey, isSigner, isWritable });

export const MEMO_PROGRAM = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
const U64_MAX = new BN("18446744073709551615");

/** The platform's Platform Fee vaults for the given Quote Assets, with what each holds on-chain now. */
export async function readPlatformFeeVaults(
  connection: Connection, program: PublicKey, platformConfig: PublicKey, quoteMints: PublicKey[],
): Promise<FeeVault[]> {
  const pdas = launchlabPdas(program);
  return readFeeVaults(connection, quoteMints.map((m) => ({ quoteMint: m, vault: pdas.platformFeeVault(platformConfig, m) })));
}

export type PlatformFeeClaimParams = {
  program: PublicKey;
  platformConfig: PublicKey;
  /** The PlatformConfig's `platform_fee_wallet`: our operations wallet. */
  feeWallet: PublicKey;
  quoteMint: PublicKey;
  quoteTokenProgram: PublicKey;
};

/**
 * `claim_platform_fee_from_vault`: moves everything in the Platform Fee vault for one Quote Asset to the fee wallet's
 * associated token account, which the program opens if needed. Only the PlatformConfig's fee wallet may sign.
 */
export function claimPlatformFeeIx(p: PlatformFeeClaimParams) {
  const pdas = launchlabPdas(p.program);
  return new TransactionInstruction({
    programId: p.program,
    data: launchlabCoder.instruction.encode("claim_platform_fee_from_vault", {}),
    keys: [
      meta(p.feeWallet, true, true),
      meta(pdas.platformFeeVaultAuthority),
      meta(p.platformConfig),
      meta(pdas.platformFeeVault(p.platformConfig, p.quoteMint), false, true),
      meta(getAssociatedTokenAddressSync(p.quoteMint, p.feeWallet, true, p.quoteTokenProgram), false, true),
      meta(p.quoteMint),
      meta(p.quoteTokenProgram),
      meta(SystemProgram.programId),
      meta(ASSOCIATED_TOKEN_PROGRAM_ID),
    ],
  });
}

/** The Platform Fee claim for one Quote Asset, paying SOL out as plain SOL. */
export function platformFeeClaimInstructions(p: PlatformFeeClaimParams) {
  return [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 100_000 }),
    claimPlatformFeeIx(p),
    ...unwrapSol(p.feeWallet, [p.quoteMint]),
  ];
}

/**
 * `collect_creator_fee`: moves a CPMM pool's creator fees, in both tokens, to the pool creator's associated token
 * accounts. Only the pool's creator may sign; for our graduated pools that is the operations wallet.
 * The deployed program wants one account more than Raydium's published IDL lists: the creator fee share PDA (seed
 * `creator_fee_share`, creator, CPMM config) last, which may not exist; without it the program fails with 3005.
 */
export function collectCreatorFeeIx(cpmm: PublicKey, pool: PoolKeys, creator: PublicKey) {
  const [t0, t1] = pool.tokens;
  return new TransactionInstruction({
    programId: cpmm,
    data: cpmmCoder.instruction.encode("collect_creator_fee", {}),
    keys: [
      meta(creator, true, true),
      meta(cpmmPdas(cpmm).authority),
      meta(pool.address, false, true),
      meta(pool.ammConfig),
      meta(t0.vault, false, true),
      meta(t1.vault, false, true),
      meta(t0.mint),
      meta(t1.mint),
      meta(getAssociatedTokenAddressSync(t0.mint, creator, true, t0.program), false, true),
      meta(getAssociatedTokenAddressSync(t1.mint, creator, true, t1.program), false, true),
      meta(t0.program),
      meta(t1.program),
      meta(ASSOCIATED_TOKEN_PROGRAM_ID),
      meta(SystemProgram.programId),
      meta(cpmmPdas(cpmm).creatorFeeShare(creator, pool.ammConfig)),
    ],
  });
}

/** Collecting a graduated pool's creator fee, with SOL paid out as plain SOL. */
export function poolCreatorFeeInstructions(cpmm: PublicKey, pool: PoolKeys, creator: PublicKey) {
  return [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 150_000 }),
    ...openTokenAccounts(creator, pool),
    collectCreatorFeeIx(cpmm, pool, creator),
    ...unwrapSol(creator, pool.tokens.map((t) => t.mint)),
  ];
}

/** A Fee Key NFT the operations wallet holds, and the locked LP it collects fees for. */
export type FeeKey = {
  nftMint: PublicKey;
  /** The token account holding the NFT. */
  nftAccount: PublicKey;
  /** The lock program's record of the locked LP (seed `locked_liquidity`, NFT mint). */
  lockedLiquidity: PublicKey;
  /** The CPMM pool whose LP is locked. */
  pool: PublicKey;
};

type LockedCpLiquidityState = { pool_id: PublicKey; fee_nft_mint: PublicKey; locked_lp_amount: BN };

const CHUNK = 100;
const chunks = <T>(items: T[]) => Array.from({ length: Math.ceil(items.length / CHUNK) }, (_, i) => items.slice(i * CHUNK, (i + 1) * CHUNK));

/**
 * The Fee Keys an owner holds, found from the chain alone: every single-token account of the owner whose mint has a
 * locked-liquidity record in Raydium's lock program. `except` skips NFT mints already known.
 */
export async function findFeeKeys(connection: Connection, lock: PublicKey, owner: PublicKey, except: Set<string> = new Set()): Promise<FeeKey[]> {
  const { value } = await connection.getTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM_ID }, "confirmed");
  const single = value
    .map(({ pubkey, account }) => ({ pubkey, token: unpackAccount(pubkey, account, TOKEN_PROGRAM_ID) }))
    .filter(({ token }) => token.amount === 1n && !except.has(token.mint.toBase58()));
  const pdas = lockPdas(lock);
  const found: FeeKey[] = [];
  for (const batch of chunks(single)) {
    const records = batch.map(({ token }) => pdas.lockedLiquidity(token.mint));
    const infos = await connection.getMultipleAccountsInfo(records, "confirmed");
    batch.forEach(({ pubkey, token }, i) => {
      const info = infos[i];
      if (!info || !info.owner.equals(lock)) return;
      const s = lockCoder.accounts.decode("LockedCpLiquidityState", info.data) as LockedCpLiquidityState;
      if (!s.fee_nft_mint.equals(token.mint)) return;
      found.push({ nftMint: token.mint, nftAccount: pubkey, lockedLiquidity: records[i]!, pool: s.pool_id });
    });
  }
  return found;
}

/**
 * `collect_cp_fees`: the Fee Key holder takes the locked LP's share of the pool's trading fees. The lock program burns the
 * fee part of the locked LP through CPMM's withdraw and pays out both tokens to the holder's accounts, which must exist.
 * Asking for u64::MAX LP collects everything the locked LP has earned so far.
 */
export function collectFeeKeyIx(programs: Pick<Programs, "cpmm" | "lock">, pool: PoolKeys, key: FeeKey, owner: PublicKey) {
  const [t0, t1] = pool.tokens;
  const lk = lockPdas(programs.lock);
  return new TransactionInstruction({
    programId: programs.lock,
    data: lockCoder.instruction.encode("collect_cp_fees", { fee_lp_amount: U64_MAX }),
    keys: [
      meta(lk.authority),
      meta(owner, true),
      meta(key.nftAccount, false, true),
      meta(key.lockedLiquidity, false, true),
      meta(programs.cpmm),
      meta(cpmmPdas(programs.cpmm).authority),
      meta(pool.address, false, true),
      meta(pool.lpMint, false, true),
      meta(getAssociatedTokenAddressSync(t0.mint, owner, true, t0.program), false, true),
      meta(getAssociatedTokenAddressSync(t1.mint, owner, true, t1.program), false, true),
      meta(t0.vault, false, true),
      meta(t1.vault, false, true),
      meta(t0.mint),
      meta(t1.mint),
      meta(getAssociatedTokenAddressSync(pool.lpMint, lk.authority, true), false, true),
      meta(TOKEN_PROGRAM_ID),
      meta(TOKEN_2022_PROGRAM_ID),
      meta(MEMO_PROGRAM),
    ],
  });
}

/**
 * Collecting a Fee Key's LP fees. `unwrap: false` leaves SOL wrapped, for a simulation that reads what the wrapped-SOL
 * account received.
 */
export function feeKeyInstructions(programs: Pick<Programs, "cpmm" | "lock">, pool: PoolKeys, key: FeeKey, owner: PublicKey, unwrap = true) {
  return [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 250_000 }),
    ...openTokenAccounts(owner, pool),
    collectFeeKeyIx(programs, pool, key, owner),
    ...(unwrap ? unwrapSol(owner, pool.tokens.map((t) => t.mint)) : []),
  ];
}

/**
 * What collecting a Fee Key would pay out right now, per token in the pool's order, found by simulating the collection:
 * the lock program works the amount out from the pool's growth since the last collection, so only running it tells.
 */
export async function simulateFeeKeyCollection(
  connection: Connection, programs: Pick<Programs, "cpmm" | "lock">, pool: PoolKeys, key: FeeKey, owner: PublicKey,
): Promise<[bigint, bigint]> {
  const recipients = pool.tokens.map((t) => getAssociatedTokenAddressSync(t.mint, owner, true, t.program));
  const before = await connection.getMultipleAccountsInfo(recipients, "confirmed");
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  const message = new TransactionMessage({
    payerKey: owner, recentBlockhash: blockhash, instructions: feeKeyInstructions(programs, pool, key, owner, false),
  }).compileToV0Message();
  const sim = await connection.simulateTransaction(new VersionedTransaction(message), {
    sigVerify: false,
    replaceRecentBlockhash: true,
    commitment: "confirmed",
    accounts: { encoding: "base64", addresses: recipients.map((r) => r.toBase58()) },
  });
  if (sim.value.err) throw new Error(`simulating the Fee Key collection of pool ${pool.address.toBase58()} failed: ${JSON.stringify(sim.value.err)}\n${(sim.value.logs ?? []).join("\n")}`);
  const amount = (i: number, info: { data: Buffer; owner: PublicKey } | null) => (info ? unpackAccount(recipients[i]!, { ...info, lamports: 0, executable: false }, info.owner).amount : 0n);
  const after = sim.value.accounts ?? [];
  const received = (i: 0 | 1) => {
    const post = after[i];
    const postAmount = post ? amount(i, { data: Buffer.from(post.data[0]!, "base64"), owner: new PublicKey(post.owner) }) : 0n;
    return postAmount - amount(i, before[i] ?? null);
  };
  return [received(0), received(1)];
}

export type SweepToken = { mint: PublicKey; tokenProgram: PublicKey; decimals: number; amount: bigint };

/** What an owner's associated token accounts hold of the given mints, leaving out empty and missing ones. */
export async function readTokenHoldings(connection: Connection, owner: PublicKey, mints: PublicKey[]): Promise<SweepToken[]> {
  const out: SweepToken[] = [];
  for (const batch of chunks(mints)) {
    const mintInfos = await connection.getMultipleAccountsInfo(batch, "confirmed");
    const known = batch.flatMap((mint, i) => {
      const info = mintInfos[i];
      return info && TOKEN_PROGRAMS.has(info.owner.toBase58()) ? [{ mint, info, account: getAssociatedTokenAddressSync(mint, owner, true, info.owner) }] : [];
    });
    const accounts = await connection.getMultipleAccountsInfo(known.map((k) => k.account), "confirmed");
    known.forEach(({ mint, info, account }, i) => {
      const held = accounts[i];
      if (!held || !held.owner.equals(info.owner)) return;
      const amount = unpackAccount(account, held, held.owner).amount;
      if (amount > 0n) out.push({ mint, tokenProgram: info.owner, decimals: unpackMint(mint, info, info.owner).decimals, amount });
    });
  }
  return out;
}

/**
 * Moves revenue from the operations wallet to the treasury: `lamports` of SOL and the whole of each token listed, into
 * the treasury's associated token accounts (opened as needed, paid by the operations wallet). The treasury may be a
 * program-derived address such as a multisig vault.
 */
export function sweepInstructions(from: PublicKey, treasury: PublicKey, lamports: bigint, tokens: SweepToken[]) {
  const ixs: TransactionInstruction[] = [];
  if (lamports > 0n) ixs.push(SystemProgram.transfer({ fromPubkey: from, toPubkey: treasury, lamports }));
  for (const t of tokens) {
    const source = getAssociatedTokenAddressSync(t.mint, from, true, t.tokenProgram);
    const destination = getAssociatedTokenAddressSync(t.mint, treasury, true, t.tokenProgram);
    ixs.push(
      createAssociatedTokenAccountIdempotentInstruction(from, destination, treasury, t.mint, t.tokenProgram),
      createTransferCheckedInstruction(source, t.mint, destination, from, t.amount, t.decimals, [], t.tokenProgram),
    );
  }
  return ixs;
}

/**
 * A Creator Forward (ADR 0007): pays a Creator their share of platform revenue in one Quote Asset. SOL goes as plain SOL;
 * anything else into the Creator's associated token account, opened if needed and paid for by the sender.
 */
export function creatorForwardInstructions(from: PublicKey, creator: PublicKey, asset: SweepToken) {
  if (asset.mint.equals(WSOL_MINT)) return [SystemProgram.transfer({ fromPubkey: from, toPubkey: creator, lamports: asset.amount })];
  const source = getAssociatedTokenAddressSync(asset.mint, from, true, asset.tokenProgram);
  const destination = getAssociatedTokenAddressSync(asset.mint, creator, true, asset.tokenProgram);
  return [
    createAssociatedTokenAccountIdempotentInstruction(from, destination, creator, asset.mint, asset.tokenProgram),
    createTransferCheckedInstruction(source, asset.mint, destination, from, asset.amount, asset.decimals, [], asset.tokenProgram),
  ];
}

/** The owner's associated token accounts for both of a pool's tokens, opened if needed. */
function openTokenAccounts(owner: PublicKey, pool: PoolKeys) {
  return pool.tokens.map((t) =>
    createAssociatedTokenAccountIdempotentInstruction(owner, getAssociatedTokenAddressSync(t.mint, owner, true, t.program), owner, t.mint, t.program),
  );
}

/** Closes the owner's wrapped-SOL account when SOL is among the mints, so what it received becomes plain SOL. */
function unwrapSol(owner: PublicKey, mints: PublicKey[]) {
  if (!mints.some((m) => m.equals(WSOL_MINT))) return [];
  return [createCloseAccountInstruction(getAssociatedTokenAddressSync(WSOL_MINT, owner, true), owner, owner)];
}

/** A transaction signed by one key, ready to send, and its signature, known before it is sent. */
export async function signedTransaction(
  connection: Connection, signer: Keypair, instructions: TransactionInstruction[], lookupTables: AddressLookupTableAccount[] = [],
) {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const message = new TransactionMessage({ payerKey: signer.publicKey, recentBlockhash: blockhash, instructions }).compileToV0Message(lookupTables);
  const tx = new VersionedTransaction(message);
  tx.sign([signer]);
  return { serialized: tx.serialize(), signature: bs58.encode(tx.signatures[0]!), lastValidBlockHeight };
}

// ---------------------------------------------------------------------------------------------------------------------
// Reading revenue back from confirmed transactions, for the Ledger.

export type RevenueKind = "platform_fee" | "pool_fee" | "fee_key" | "sweep";

/** One movement of platform revenue in a confirmed transaction. */
export type RevenueMovement = {
  kind: RevenueKind;
  signature: string;
  slot: number;
  blockTime: number | null;
  /** Position among the movements in this transaction. */
  index: number;
  /** What moved; SOL as the wrapped-SOL mint. */
  mint: PublicKey;
  /** Raw units that arrived at the destination: what left the source, less any Token-2022 transfer fee. */
  amount: BN;
  decimals: number;
  /** Where it came from: the Platform Fee vault, the CPMM pool, or the operations wallet for a sweep. */
  source: PublicKey;
  /** The wallet it went to: the operations wallet, or the treasury for a sweep. */
  destination: PublicKey;
  /** The CPMM pool, for pool creator fees and Fee Key collections. */
  pool: PublicKey | null;
};

export type RevenueContext = {
  programs: Pick<Programs, "launchlab" | "cpmm" | "lock">;
  platformConfig: PublicKey;
  operationsWallet: PublicKey;
  treasury: PublicKey | null;
};

type RawInstruction = RawTransaction["transaction"]["message"]["instructions"][number];
type TokenBalance = { accountIndex: number; mint: string; owner?: string; uiTokenAmount: { amount: string; decimals: number } };
type RevenueTransaction = RawTransaction & { meta: (NonNullable<RawTransaction["meta"]> & { preTokenBalances?: TokenBalance[]; postTokenBalances?: TokenBalance[] }) | null };

const TOKEN_PROGRAMS = new Set([TOKEN_PROGRAM_ID.toBase58(), TOKEN_2022_PROGRAM_ID.toBase58()]);
const TOKEN_TRANSFER = 3;
const TOKEN_TRANSFER_CHECKED = 12;
const SYSTEM_TRANSFER = 2;

// Account positions in the instructions whose payouts are revenue.
const PLATFORM_CLAIM = { feeWallet: 0, platformConfig: 2, vault: 3, recipient: 4, quoteMint: 5 } as const;
const CREATOR_FEE = { creator: 0, pool: 2, vault0: 4, vault1: 5, mint0: 6, mint1: 7 } as const;
const FEE_KEY = { owner: 1, pool: 6, vault0: 10, vault1: 11, mint0: 12, mint1: 13 } as const;

type Transfer = { source: string; destination: string; authority: string; amount: BN; mint: string | null; decimals: number | null };

/** A token Transfer or TransferChecked; null for any other instruction. */
function tokenTransfer(ix: RawInstruction, keys: string[]): Transfer | null {
  if (!TOKEN_PROGRAMS.has(keys[ix.programIdIndex]!)) return null;
  const data = Buffer.from(bs58.decode(ix.data));
  const key = (i: number) => keys[ix.accounts[i]!]!;
  if (data[0] === TOKEN_TRANSFER && data.length >= 9)
    return { source: key(0), destination: key(1), authority: key(2), amount: new BN(data.subarray(1, 9), "le"), mint: null, decimals: null };
  if (data[0] === TOKEN_TRANSFER_CHECKED && data.length >= 10)
    return { source: key(0), mint: key(1), destination: key(2), authority: key(3), amount: new BN(data.subarray(1, 9), "le"), decimals: data[9]! };
  return null;
}

/**
 * The platform revenue a confirmed transaction moved: Platform Fee claims on our PlatformConfig, creator fees and Fee Key
 * collections paid to the operations wallet, and sweeps from the operations wallet to the treasury, each with what arrived.
 * Failed transactions move nothing.
 */
export function decodeRevenue(raw: RawTransaction, ctx: RevenueContext): RevenueMovement[] {
  const tx = raw as RevenueTransaction;
  const meta = tx.meta;
  if (!meta || meta.err) return [];
  const keys = [
    ...tx.transaction.message.accountKeys,
    ...(meta.loadedAddresses?.writable ?? []),
    ...(meta.loadedAddresses?.readonly ?? []),
  ];
  const balances = [...(meta.postTokenBalances ?? []), ...(meta.preTokenBalances ?? [])];
  const decimalsOf = (mint: string) => balances.find((b) => b.mint === mint)?.uiTokenAmount.decimals ?? null;
  const ownerOf = (account: string) => balances.find((b) => keys[b.accountIndex] === account)?.owner ?? null;
  // What an account received: its balance change when this transfer is the only one into it (so a Token-2022 transfer
  // fee withheld on the way is not counted), otherwise the transfer's amount. An account closed in the same transaction
  // (the unwrapped SOL) has no closing balance, and SOL has no transfer fee.
  const transfersInto = new Map<string, number>();
  for (const ix of [...tx.transaction.message.instructions, ...(meta.innerInstructions ?? []).flatMap((g) => g.instructions)]) {
    const t = tokenTransfer(ix, keys);
    if (t) transfersInto.set(t.destination, (transfersInto.get(t.destination) ?? 0) + 1);
  }
  const balanceOf = (list: TokenBalance[] | undefined, account: string) => list?.find((b) => keys[b.accountIndex] === account)?.uiTokenAmount.amount;
  const received = (t: Transfer) => {
    const post = balanceOf(meta.postTokenBalances, t.destination);
    if (post === undefined || transfersInto.get(t.destination) !== 1) return t.amount;
    return new BN(post).sub(new BN(balanceOf(meta.preTokenBalances, t.destination) ?? "0"));
  };
  const ops = ctx.operationsWallet.toBase58();
  const treasury = ctx.treasury?.toBase58() ?? null;
  const signature = tx.transaction.signatures[0]!;
  const out: RevenueMovement[] = [];
  const push = (m: Omit<RevenueMovement, "signature" | "slot" | "blockTime" | "index">) => {
    if (m.amount.isZero()) return;
    out.push({ ...m, signature, slot: tx.slot, blockTime: tx.blockTime, index: out.length });
  };
  // A payout out of one of `vaults` (vault address to its mint), in the invoking instruction's inner instructions.
  const payouts = (inner: RawInstruction[], vaults: Map<string, string>, recipientOwner: string) =>
    inner.flatMap((ix) => {
      const t = tokenTransfer(ix, keys);
      if (!t || !vaults.has(t.source)) return [];
      const mint = t.mint ?? vaults.get(t.source)!;
      const owner = ownerOf(t.destination);
      if (owner !== null && owner !== recipientOwner) return [];
      const decimals = t.decimals ?? decimalsOf(mint);
      if (decimals === null) throw new Error(`transaction ${signature} has no token balance for ${mint}`);
      return [{ mint: new PublicKey(mint), amount: received(t), decimals }];
    });

  tx.transaction.message.instructions.forEach((ix, i) => {
    const program = keys[ix.programIdIndex];
    const acct = (n: number) => keys[ix.accounts[n]!]!;
    const inner = meta.innerInstructions?.find((g) => g.index === i)?.instructions ?? [];
    if (program === ctx.programs.launchlab.toBase58()) {
      const decoded = safeDecode(() => launchlabCoder.instruction.decode(Buffer.from(bs58.decode(ix.data))));
      if (decoded?.name !== "claim_platform_fee_from_vault") return;
      if (acct(PLATFORM_CLAIM.feeWallet) !== ops || acct(PLATFORM_CLAIM.platformConfig) !== ctx.platformConfig.toBase58()) return;
      const vault = acct(PLATFORM_CLAIM.vault);
      for (const p of payouts(inner, new Map([[vault, acct(PLATFORM_CLAIM.quoteMint)]]), ops))
        push({ kind: "platform_fee", ...p, source: new PublicKey(vault), destination: ctx.operationsWallet, pool: null });
      return;
    }
    if (program === ctx.programs.cpmm.toBase58()) {
      const decoded = safeDecode(() => cpmmCoder.instruction.decode(Buffer.from(bs58.decode(ix.data))));
      if (decoded?.name !== "collect_creator_fee" || acct(CREATOR_FEE.creator) !== ops) return;
      const pool = new PublicKey(acct(CREATOR_FEE.pool));
      const vaults = new Map([[acct(CREATOR_FEE.vault0), acct(CREATOR_FEE.mint0)], [acct(CREATOR_FEE.vault1), acct(CREATOR_FEE.mint1)]]);
      for (const p of payouts(inner, vaults, ops)) push({ kind: "pool_fee", ...p, source: pool, destination: ctx.operationsWallet, pool });
      return;
    }
    if (program === ctx.programs.lock.toBase58()) {
      const decoded = safeDecode(() => lockCoder.instruction.decode(Buffer.from(bs58.decode(ix.data))));
      if (decoded?.name !== "collect_cp_fees" || acct(FEE_KEY.owner) !== ops) return;
      const pool = new PublicKey(acct(FEE_KEY.pool));
      const vaults = new Map([[acct(FEE_KEY.vault0), acct(FEE_KEY.mint0)], [acct(FEE_KEY.vault1), acct(FEE_KEY.mint1)]]);
      for (const p of payouts(inner, vaults, ops)) push({ kind: "fee_key", ...p, source: pool, destination: ctx.operationsWallet, pool });
      return;
    }
    if (!treasury) return;
    if (program === SystemProgram.programId.toBase58()) {
      const data = Buffer.from(bs58.decode(ix.data));
      if (data.length < 12 || data.readUInt32LE(0) !== SYSTEM_TRANSFER || acct(0) !== ops || acct(1) !== treasury) return;
      push({
        kind: "sweep", mint: WSOL_MINT, amount: new BN(data.subarray(4, 12), "le"), decimals: 9, source: ctx.operationsWallet,
        destination: ctx.treasury!, pool: null,
      });
      return;
    }
    const t = tokenTransfer(ix, keys);
    if (!t || t.authority !== ops || ownerOf(t.destination) !== treasury) return;
    const mint = t.mint ?? balances.find((b) => keys[b.accountIndex] === t.destination)?.mint;
    if (!mint) return;
    const decimals = t.decimals ?? decimalsOf(mint);
    if (decimals === null) return;
    push({ kind: "sweep", mint: new PublicKey(mint), amount: received(t), decimals, source: ctx.operationsWallet, destination: ctx.treasury!, pool: null });
  });
  return out;
}

function safeDecode<T>(decode: () => T): T | null {
  try {
    return decode();
  } catch {
    return null;
  }
}
