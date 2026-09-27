// CPMM and locker helpers for the post-graduation part of the spike.
import { Keypair, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, TransactionInstruction } from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction } from "@solana/spl-token";
import { CpmmPoolInfoLayout, makeSwapCpmmBaseInInstruction, makeCollectCreatorFeeInstruction, collectCpFeeInstruction } from "@raydium-io/raydium-sdk-v2";
import BN from "bn.js";
import { conn, DEV, launchCoder } from "./common";
import * as L from "./launchlab";

const pda = (seeds: Buffer[], program: PublicKey) => PublicKey.findProgramAddressSync(seeds, program)[0];
export const CP_AUTH = pda([Buffer.from("vault_and_lp_mint_auth_seed")], DEV.CPMM);
export const LOCK_AUTH = pda([Buffer.from("lock_cp_authority_seed")], DEV.LOCK);
export const sortMints = (a: PublicKey, b: PublicKey) => (Buffer.compare(a.toBuffer(), b.toBuffer()) < 0 ? [a, b] : [b, a]);
export const cpPoolPda = (config: PublicKey, a: PublicKey, b: PublicKey) => { const [t0, t1] = sortMints(a, b); return pda([Buffer.from("pool"), config.toBuffer(), t0.toBuffer(), t1.toBuffer()], DEV.CPMM); };
export const cpLpMint = (pool: PublicKey) => pda([Buffer.from("pool_lp_mint"), pool.toBuffer()], DEV.CPMM);
export const cpVault = (pool: PublicKey, mint: PublicKey) => pda([Buffer.from("pool_vault"), pool.toBuffer(), mint.toBuffer()], DEV.CPMM);
export const cpObservation = (pool: PublicKey) => pda([Buffer.from("observation"), pool.toBuffer()], DEV.CPMM);
export const cpPermission = (owner: PublicKey) => pda([Buffer.from("permission"), owner.toBuffer()], DEV.CPMM);
export const cpSupportMint = (mint: PublicKey) => pda([Buffer.from("support_mint"), mint.toBuffer()], DEV.CPMM);
export const lockPda = (nftMint: PublicKey) => pda([Buffer.from("locked_liquidity"), nftMint.toBuffer()], DEV.LOCK);

// migrate_to_cpswap with the 10 remaining accounts Raydium's devnet crank passes when platform_scale = 100%:
// [platform_nft_wallet, fee_nft_mint (signer), fee_nft_ata, locked_liquidity, fee_nft_metadata, pool_creator,
//  cpmm_permission, platform_cp_creator, support_mint(quote), support_mint(base)].
export function migrateToCpswapIx(payer: PublicKey, nftMint: Keypair, p: {
  pool: PublicKey; baseMint: PublicKey; quoteMint: PublicKey; platformConfig: PublicKey; globalConfig: PublicKey; cpswapConfig: PublicKey;
  createPoolFee: PublicKey; nftWallet: PublicKey; creator: PublicKey; permission: PublicKey; cpCreator: PublicKey;
}) {
  const cpPool = cpPoolPda(p.cpswapConfig, p.baseMint, p.quoteMint);
  const lp = cpLpMint(cpPool);
  const named: [PublicKey, boolean, boolean][] = [
    [payer, true, true], [p.baseMint, false, true], [p.quoteMint, false, false], [p.platformConfig, false, false], [DEV.CPMM, false, false],
    [cpPool, false, true], [CP_AUTH, false, false], [lp, false, true], [cpVault(cpPool, p.baseMint), false, true], [cpVault(cpPool, p.quoteMint), false, true],
    [p.cpswapConfig, false, false], [p.createPoolFee, false, true], [cpObservation(cpPool), false, true], [DEV.LOCK, false, false], [LOCK_AUTH, false, false],
    [getAssociatedTokenAddressSync(lp, LOCK_AUTH, true), false, true], [L.AUTH, false, true], [p.pool, false, true], [p.globalConfig, false, true],
    [L.vaultPda(p.pool, p.baseMint), false, true], [L.vaultPda(p.pool, p.quoteMint), false, true], [getAssociatedTokenAddressSync(lp, L.AUTH, true), false, true],
    [TOKEN_PROGRAM_ID, false, false], [TOKEN_2022_PROGRAM_ID, false, false], [ASSOCIATED_TOKEN_PROGRAM_ID, false, false], [SystemProgram.programId, false, false],
    [SYSVAR_RENT_PUBKEY, false, false], [L.METADATA_PROGRAM, false, false],
  ];
  const remaining: [PublicKey, boolean, boolean][] = [
    [p.nftWallet, false, true], [nftMint.publicKey, true, true], [getAssociatedTokenAddressSync(nftMint.publicKey, p.nftWallet), false, true],
    [lockPda(nftMint.publicKey), false, true], [L.metadataPda(nftMint.publicKey), false, true], [p.creator, false, true],
    [p.permission, false, false], [p.cpCreator, false, false], [cpSupportMint(p.quoteMint), false, false], [cpSupportMint(p.baseMint), false, false],
  ];
  return new TransactionInstruction({
    programId: DEV.LAUNCHPAD,
    data: launchCoder.instruction.encode("migrate_to_cpswap", {}),
    keys: [...named, ...remaining].map(([pubkey, isSigner, isWritable]) => ({ pubkey, isSigner, isWritable })),
  });
}

export async function cpPoolInfo(pool: PublicKey) {
  const a = await conn.getAccountInfo(pool, "confirmed");
  if (!a) return null;
  const d: any = CpmmPoolInfoLayout.decode(a.data);
  const out: any = {};
  for (const [k, v] of Object.entries(d)) if (!Array.isArray(v)) out[k] = v instanceof PublicKey ? v.toBase58() : (v as any)?.toString?.() ?? v;
  return out;
}

export function swapIxs(user: PublicKey, pool: any, poolId: PublicKey, inputMint: PublicKey, amountIn: BN) {
  const mintA = new PublicKey(pool.mintA), mintB = new PublicKey(pool.mintB);
  const aIn = inputMint.equals(mintA);
  const [inM, outM] = aIn ? [mintA, mintB] : [mintB, mintA];
  const [inP, outP] = aIn ? [new PublicKey(pool.mintProgramA), new PublicKey(pool.mintProgramB)] : [new PublicKey(pool.mintProgramB), new PublicKey(pool.mintProgramA)];
  const userIn = getAssociatedTokenAddressSync(inM, user, false, inP), userOut = getAssociatedTokenAddressSync(outM, user, false, outP);
  return [
    createAssociatedTokenAccountIdempotentInstruction(user, userOut, user, outM, outP),
    makeSwapCpmmBaseInInstruction(DEV.CPMM, user, CP_AUTH, new PublicKey(pool.configId), poolId, userIn, userOut,
      cpVault(poolId, inM), cpVault(poolId, outM), inP, outP, inM, outM, new PublicKey(pool.observationId), amountIn, new BN(0)),
  ];
}

export function collectCreatorFeeIxs(creator: PublicKey, pool: any, poolId: PublicKey) {
  const mintA = new PublicKey(pool.mintA), mintB = new PublicKey(pool.mintB), pA = new PublicKey(pool.mintProgramA), pB = new PublicKey(pool.mintProgramB);
  const ataA = getAssociatedTokenAddressSync(mintA, creator, false, pA), ataB = getAssociatedTokenAddressSync(mintB, creator, false, pB);
  return [
    makeCollectCreatorFeeInstruction(DEV.CPMM, creator, CP_AUTH, poolId, new PublicKey(pool.configId), new PublicKey(pool.vaultA), new PublicKey(pool.vaultB), mintA, mintB, ataA, ataB, pA, pB),
  ];
}

export function collectLockedLpFeeIxs(owner: PublicKey, pool: any, poolId: PublicKey, nftMint: PublicKey, lpFeeAmount: BN) {
  const mintA = new PublicKey(pool.mintA), mintB = new PublicKey(pool.mintB), pA = new PublicKey(pool.mintProgramA), pB = new PublicKey(pool.mintProgramB);
  const ataA = getAssociatedTokenAddressSync(mintA, owner, false, pA), ataB = getAssociatedTokenAddressSync(mintB, owner, false, pB);
  const lp = new PublicKey(pool.mintLp);
  return [
    createAssociatedTokenAccountIdempotentInstruction(owner, ataA, owner, mintA, pA),
    createAssociatedTokenAccountIdempotentInstruction(owner, ataB, owner, mintB, pB),
    collectCpFeeInstruction({
      programId: DEV.LOCK, nftOwner: owner, auth: LOCK_AUTH, nftMint, nftAccount: getAssociatedTokenAddressSync(nftMint, owner), lockPda: lockPda(nftMint),
      poolId, mintLp: lp, userVaultA: ataA, userVaultB: ataB, poolVaultA: new PublicKey(pool.vaultA), poolVaultB: new PublicKey(pool.vaultB),
      mintA, mintB, lockLpVault: getAssociatedTokenAddressSync(lp, LOCK_AUTH, true), lpFeeAmount, cpmmProgram: DEV.CPMM, cpmmAuthProgram: CP_AUTH,
    }),
  ];
}

export async function lockedState(nftMint: PublicKey) {
  const a = await conn.getAccountInfo(lockPda(nftMint), "confirmed");
  if (!a) return null;
  const d = a.data; // disc8 lockedLp8 claimedLp8 unclaimedLp8 lastLp8 lastK16 epoch8 poolId32 feeNftMint32 lockedOwner32 lockedLpMint32
  return {
    lockedLpAmount: d.readBigUInt64LE(8).toString(), claimedLpAmount: d.readBigUInt64LE(16).toString(), unclaimedLpAmount: d.readBigUInt64LE(24).toString(),
    poolId: new PublicKey(d.subarray(64, 96)).toBase58(), feeNftMint: new PublicKey(d.subarray(96, 128)).toBase58(), lockedOwner: new PublicKey(d.subarray(128, 160)).toBase58(),
  };
}
