// LaunchLab helpers: PDAs, instruction builders (Anchor coder from the devnet IDL, SDK builders for trades), event decoding.
import bs58 from "bs58";
import { Keypair, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, TransactionInstruction } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, NATIVE_MINT,
  createAssociatedTokenAccountIdempotentInstruction, createSyncNativeInstruction, getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { buyExactInInstruction, sellExactInInstruction } from "@raydium-io/raydium-sdk-v2";
import BN from "bn.js";
import { conn, DEV, launchCoder, plain } from "./common";

export const METADATA_PROGRAM = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
const P = DEV.LAUNCHPAD;
const pda = (seeds: (Buffer | Uint8Array)[], program = P) => PublicKey.findProgramAddressSync(seeds, program)[0];

export const AUTH = pda([Buffer.from("vault_auth_seed")]);
export const EVENT_AUTH = pda([Buffer.from("__event_authority")]);
export const PLATFORM_FEE_VAULT_AUTH = pda([Buffer.from("platform_fee_vault_auth_seed")]);
export const CREATOR_FEE_VAULT_AUTH = pda([Buffer.from("creator_fee_vault_auth_seed")]);
export const poolPda = (base: PublicKey, quote: PublicKey) => pda([Buffer.from("pool"), base.toBuffer(), quote.toBuffer()]);
export const vaultPda = (pool: PublicKey, mint: PublicKey) => pda([Buffer.from("pool_vault"), pool.toBuffer(), mint.toBuffer()]);
export const platformFeeVault = (platform: PublicKey, quote: PublicKey) => pda([platform.toBuffer(), quote.toBuffer()]);
export const creatorFeeVault = (creator: PublicKey, quote: PublicKey) => pda([creator.toBuffer(), quote.toBuffer()]);
export const metadataPda = (mint: PublicKey) => pda([Buffer.from("metadata"), METADATA_PROGRAM.toBuffer(), mint.toBuffer()], METADATA_PROGRAM);

export type Launch = {
  globalConfig: PublicKey; platformConfig: PublicKey; quoteMint: PublicKey;
  supply: BN; totalBaseSell: BN; totalQuoteFundRaising: BN; ammFeeOn: "QuoteToken" | "BothToken";
  name: string; symbol: string; uri: string; decimals?: number;
};

const curveArg = (l: Launch) => ({ Constant: { data: { supply: l.supply, total_base_sell: l.totalBaseSell, total_quote_fund_raising: l.totalQuoteFundRaising, migrate_type: 1 } } });
const noVesting = { total_locked_amount: new BN(0), cliff_period: new BN(0), unlock_period: new BN(0) };

export function initializeV2Ix(payer: PublicKey, creator: PublicKey, mint: PublicKey, l: Launch) {
  const pool = poolPda(mint, l.quoteMint);
  const data = launchCoder.instruction.encode("initialize_v2", {
    base_mint_param: { decimals: l.decimals ?? 6, name: l.name, symbol: l.symbol, uri: l.uri },
    curve_param: curveArg(l), vesting_param: noVesting, amm_fee_on: { [l.ammFeeOn]: {} },
  });
  const keys = [
    [payer, true, true], [creator, false, false], [l.globalConfig, false, false], [l.platformConfig, false, false], [AUTH, false, false],
    [pool, false, true], [mint, true, true], [l.quoteMint, false, false], [vaultPda(pool, mint), false, true], [vaultPda(pool, l.quoteMint), false, true],
    [metadataPda(mint), false, true], [TOKEN_PROGRAM_ID, false, false], [TOKEN_PROGRAM_ID, false, false], [METADATA_PROGRAM, false, false],
    [SystemProgram.programId, false, false], [SYSVAR_RENT_PUBKEY, false, false], [EVENT_AUTH, false, false], [P, false, false],
  ].map(([pubkey, isSigner, isWritable]) => ({ pubkey: pubkey as PublicKey, isSigner: isSigner as boolean, isWritable: isWritable as boolean }));
  return new TransactionInstruction({ programId: P, keys, data });
}

export function initializeToken2022Ix(payer: PublicKey, creator: PublicKey, mint: PublicKey, l: Launch, transferFee?: { bps: number; max: BN }) {
  const pool = poolPda(mint, l.quoteMint);
  const data = launchCoder.instruction.encode("initialize_with_token_2022", {
    base_mint_param: { decimals: l.decimals ?? 6, name: l.name, symbol: l.symbol, uri: l.uri },
    curve_param: curveArg(l), vesting_param: noVesting, amm_fee_on: { [l.ammFeeOn]: {} },
    transfer_fee_extension_param: transferFee ? { transfer_fee_basis_points: transferFee.bps, maximum_fee: transferFee.max } : null,
  });
  const keys = [
    [payer, true, true], [creator, false, false], [l.globalConfig, false, false], [l.platformConfig, false, false], [AUTH, false, false],
    [pool, false, true], [mint, true, true], [l.quoteMint, false, false], [vaultPda(pool, mint), false, true], [vaultPda(pool, l.quoteMint), false, true],
    [TOKEN_2022_PROGRAM_ID, false, false], [TOKEN_PROGRAM_ID, false, false], [SystemProgram.programId, false, false], [EVENT_AUTH, false, false], [P, false, false],
  ].map(([pubkey, isSigner, isWritable]) => ({ pubkey: pubkey as PublicKey, isSigner: isSigner as boolean, isWritable: isWritable as boolean }));
  return new TransactionInstruction({ programId: P, keys, data });
}

export type PoolKeys = { pool: PublicKey; baseMint: PublicKey; quoteMint: PublicKey; globalConfig: PublicKey; platformConfig: PublicKey; creator: PublicKey; baseProgram: PublicKey };

// Wrap SOL into the owner's WSOL ATA.
export function wrapSolIxs(owner: PublicKey, lamports: number) {
  const ata = getAssociatedTokenAddressSync(NATIVE_MINT, owner);
  return [
    createAssociatedTokenAccountIdempotentInstruction(owner, ata, owner, NATIVE_MINT),
    SystemProgram.transfer({ fromPubkey: owner, toPubkey: ata, lamports }),
    createSyncNativeInstruction(ata),
  ];
}

export function tradeIx(side: "buy" | "sell", user: PublicKey, k: PoolKeys, amountIn: BN, minOut = new BN(0)) {
  const userBase = getAssociatedTokenAddressSync(k.baseMint, user, false, k.baseProgram);
  const userQuote = getAssociatedTokenAddressSync(k.quoteMint, user);
  const args = [
    P, user, AUTH, k.globalConfig, k.platformConfig, k.pool, userBase, userQuote,
    vaultPda(k.pool, k.baseMint), vaultPda(k.pool, k.quoteMint), k.baseMint, k.quoteMint, k.baseProgram, TOKEN_PROGRAM_ID,
    platformFeeVault(k.platformConfig, k.quoteMint), creatorFeeVault(k.creator, k.quoteMint), amountIn, minOut,
  ] as const;
  const ix = side === "buy" ? (buyExactInInstruction as any)(...args) : (sellExactInInstruction as any)(...args);
  return [createAssociatedTokenAccountIdempotentInstruction(user, userBase, user, k.baseMint, k.baseProgram), ix];
}

export function claimCreatorFeeIx(creator: PublicKey, quoteMint: PublicKey) {
  const data = launchCoder.instruction.encode("claim_creator_fee", {});
  const keys = [
    [creator, true, true], [CREATOR_FEE_VAULT_AUTH, false, false], [creatorFeeVault(creator, quoteMint), false, true],
    [getAssociatedTokenAddressSync(quoteMint, creator), false, true], [quoteMint, false, false], [TOKEN_PROGRAM_ID, false, false],
    [SystemProgram.programId, false, false], [ASSOCIATED_TOKEN_PROGRAM_ID, false, false],
  ].map(([pubkey, isSigner, isWritable]) => ({ pubkey: pubkey as PublicKey, isSigner: isSigner as boolean, isWritable: isWritable as boolean }));
  return new TransactionInstruction({ programId: P, keys, data });
}

export function claimPlatformFeeFromVaultIx(feeWallet: PublicKey, platform: PublicKey, quoteMint: PublicKey) {
  const data = launchCoder.instruction.encode("claim_platform_fee_from_vault", {});
  const keys = [
    [feeWallet, true, true], [PLATFORM_FEE_VAULT_AUTH, false, false], [platform, false, false], [platformFeeVault(platform, quoteMint), false, true],
    [getAssociatedTokenAddressSync(quoteMint, feeWallet), false, true], [quoteMint, false, false], [TOKEN_PROGRAM_ID, false, false],
    [SystemProgram.programId, false, false], [ASSOCIATED_TOKEN_PROGRAM_ID, false, false],
  ].map(([pubkey, isSigner, isWritable]) => ({ pubkey: pubkey as PublicKey, isSigner: isSigner as boolean, isWritable: isWritable as boolean }));
  return new TransactionInstruction({ programId: P, keys, data });
}

export function claimPlatformFeeIx(feeWallet: PublicKey, k: PoolKeys) {
  const data = launchCoder.instruction.encode("claim_platform_fee", {});
  const keys = [
    [feeWallet, true, true], [AUTH, false, false], [k.pool, false, true], [k.platformConfig, false, false], [vaultPda(k.pool, k.quoteMint), false, true],
    [getAssociatedTokenAddressSync(k.quoteMint, feeWallet), false, true], [k.quoteMint, false, false], [TOKEN_PROGRAM_ID, false, false],
    [SystemProgram.programId, false, false], [ASSOCIATED_TOKEN_PROGRAM_ID, false, false],
  ].map(([pubkey, isSigner, isWritable]) => ({ pubkey: pubkey as PublicKey, isSigner: isSigner as boolean, isWritable: isWritable as boolean }));
  return new TransactionInstruction({ programId: P, keys, data });
}

export async function poolState(pool: PublicKey) {
  const a = await conn.getAccountInfo(pool, "confirmed");
  if (!a) return null;
  const d: any = plain(launchCoder.accounts.decode("PoolState", a.data));
  delete d.padding;
  return d;
}

export async function events(sig: string) {
  const t = await conn.getTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
  const out: any[] = [];
  const decodeData = (b64: string) => {
    try { const e = launchCoder.events.decode(b64); if (e) out.push({ name: e.name, ...plain(e.data) }); } catch {}
  };
  for (const l of t?.meta?.logMessages ?? []) if (l.startsWith("Program data: ")) decodeData(l.slice(14));
  // Anchor emit_cpi events live in inner instructions to the event authority (8-byte tag + event).
  for (const inner of t?.meta?.innerInstructions ?? [])
    for (const ix of inner.instructions as any[]) {
      const raw = Buffer.from(bs58.decode(ix.data));
      if (raw.length > 16 && raw.subarray(0, 8).equals(Buffer.from("e445a52e51cb9a1d", "hex"))) decodeData(raw.subarray(8).toString("base64"));
    }
  const seen = new Set<string>();
  return out.filter((e) => { const j = JSON.stringify(e); if (seen.has(j)) return false; seen.add(j); return true; });
}
