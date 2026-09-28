import { PublicKey } from "@solana/web3.js";
import { METADATA_PROGRAM } from "./programs";

const find = (seeds: (Buffer | Uint8Array)[], program: PublicKey) => PublicKey.findProgramAddressSync(seeds, program)[0];
const seed = (s: string) => Buffer.from(s, "utf8");

/** LaunchLab program-derived addresses, parameterised by the program id so one set serves every cluster. */
export function launchlabPdas(program: PublicKey) {
  return {
    authority: find([seed("vault_auth_seed")], program),
    eventAuthority: find([seed("__event_authority")], program),
    platformConfig: (admin: PublicKey) => find([seed("platform_config"), admin.toBuffer()], program),
    /** Raydium creates these; the local chain plants its own. The index is big-endian (checked against devnet's SOL index 1). */
    globalConfig: (quoteMint: PublicKey, curveType = 0, index = 0) =>
      find([seed("global_config"), quoteMint.toBuffer(), Uint8Array.of(curveType), Uint8Array.of(index >> 8, index & 0xff)], program),
    curveRule: (platformConfig: PublicKey, globalConfig: PublicKey) =>
      find([seed("platform_curve_rule"), platformConfig.toBuffer(), globalConfig.toBuffer()], program),
    pool: (baseMint: PublicKey, quoteMint: PublicKey) => find([seed("pool"), baseMint.toBuffer(), quoteMint.toBuffer()], program),
    vault: (pool: PublicKey, mint: PublicKey) => find([seed("pool_vault"), pool.toBuffer(), mint.toBuffer()], program),
    platformFeeVault: (platformConfig: PublicKey, quoteMint: PublicKey) => find([platformConfig.toBuffer(), quoteMint.toBuffer()], program),
    /** Owns every Platform Fee vault; the PlatformConfig's fee wallet claims through it. */
    platformFeeVaultAuthority: find([seed("platform_fee_vault_auth_seed")], program),
    creatorFeeVault: (creator: PublicKey, quoteMint: PublicKey) => find([creator.toBuffer(), quoteMint.toBuffer()], program),
    /** Owns every Creator Fee vault; one address for all Creators, so a webhook on it sees every Creator Fee claim. */
    creatorFeeVaultAuthority: find([seed("creator_fee_vault_auth_seed")], program),
  };
}

/** CPMM's two token mints in the order the program stores them: token 0 is the one with the smaller address bytes. */
export function sortMints(a: PublicKey, b: PublicKey): [PublicKey, PublicKey] {
  return Buffer.compare(a.toBuffer(), b.toBuffer()) < 0 ? [a, b] : [b, a];
}

/** Raydium CPMM program-derived addresses. */
export function cpmmPdas(program: PublicKey) {
  return {
    /** Owns every CPMM pool's vaults, so it holds a graduated Launch's coins in its pool. */
    authority: find([seed("vault_and_lp_mint_auth_seed")], program),
    pool: (ammConfig: PublicKey, mintA: PublicKey, mintB: PublicKey) => {
      const [token0, token1] = sortMints(mintA, mintB);
      return find([seed("pool"), ammConfig.toBuffer(), token0.toBuffer(), token1.toBuffer()], program);
    },
    lpMint: (pool: PublicKey) => find([seed("pool_lp_mint"), pool.toBuffer()], program),
    vault: (pool: PublicKey, mint: PublicKey) => find([seed("pool_vault"), pool.toBuffer(), mint.toBuffer()], program),
    observation: (pool: PublicKey) => find([seed("observation"), pool.toBuffer()], program),
    permission: (owner: PublicKey) => find([seed("permission"), owner.toBuffer()], program),
    supportMint: (mint: PublicKey) => find([seed("support_mint"), mint.toBuffer()], program),
    /** Where a pool creator's share of its creator fee would be split off, per creator and CPMM config; ours has none. */
    creatorFeeShare: (creator: PublicKey, ammConfig: PublicKey) => find([seed("creator_fee_share"), creator.toBuffer(), ammConfig.toBuffer()], program),
  };
}

/** Raydium LP-lock program-derived addresses: where a graduated pool's LP is locked behind a Fee Key NFT. */
export function lockPdas(program: PublicKey) {
  return {
    authority: find([seed("lock_cp_authority_seed")], program),
    lockedLiquidity: (feeNftMint: PublicKey) => find([seed("locked_liquidity"), feeNftMint.toBuffer()], program),
  };
}

export const metadataPda = (mint: PublicKey) => find([seed("metadata"), METADATA_PROGRAM.toBuffer(), mint.toBuffer()], METADATA_PROGRAM);
