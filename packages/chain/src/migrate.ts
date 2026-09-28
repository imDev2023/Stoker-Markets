import {
  Keypair, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, TransactionInstruction, type AccountMeta, type Connection,
} from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { launchlabCoder } from "./coder";
import { cpmmPdas, launchlabPdas, lockPdas, metadataPda, sortMints } from "./pda";
import { METADATA_PROGRAM, type Programs } from "./programs";

const meta = (pubkey: PublicKey, isSigner = false, isWritable = false): AccountMeta => ({ pubkey, isSigner, isWritable });

export type MigrationRequest = {
  programs: Programs;
  /** The curve (LaunchLab PoolState) that sold out. */
  curve: PublicKey;
  /** The GlobalConfig's migrate wallet: Raydium's crank on devnet and mainnet, a local stand-in on the fork. */
  payer: PublicKey;
};

export type PreparedMigration = {
  instruction: TransactionInstruction;
  /** The new Fee Key NFT's mint, which must co-sign; the NFT goes to the platform's NFT wallet. */
  feeNftMint: Keypair;
  /** The CPMM pool the Launch graduates into. */
  pool: PublicKey;
};

type CurveAccounts = { base_mint: PublicKey; quote_mint: PublicKey; platform_config: PublicKey; global_config: PublicKey; creator: PublicKey };
type PlatformAccounts = { platform_nft_wallet: PublicKey; cpswap_config: PublicKey; platform_cp_creator: PublicKey };

/**
 * The accounts every migration of one platform's curves on one Quote Asset shares: programs, sysvars, configs, program
 * authorities and the platform's wallets. They belong in the migrate wallet's address lookup table, which keeps each
 * migration transaction under the size limit with only its own curve's accounts written out.
 */
export async function sharedMigrationAccounts(connection: Connection, programs: Programs, platformConfig: PublicKey, globalConfig: PublicKey) {
  const [platformAccount, globalAccount] = await connection.getMultipleAccountsInfo([platformConfig, globalConfig], "confirmed");
  if (!platformAccount || !globalAccount) throw new Error("missing PlatformConfig or GlobalConfig");
  const p = launchlabCoder.accounts.decode("PlatformConfig", platformAccount.data) as PlatformAccounts;
  const g = launchlabCoder.accounts.decode("GlobalConfig", globalAccount.data) as { quote_mint: PublicKey };
  const ll = launchlabPdas(programs.launchlab);
  const cp = cpmmPdas(programs.cpmm);
  const lk = lockPdas(programs.lock);
  return [
    programs.launchlab, programs.cpmm, programs.lock, programs.cpmmCreatePoolFee, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID, SystemProgram.programId, SYSVAR_RENT_PUBKEY, METADATA_PROGRAM,
    platformConfig, globalConfig, g.quote_mint, p.cpswap_config, p.platform_nft_wallet, p.platform_cp_creator,
    ll.authority, cp.authority, lk.authority, cp.permission(ll.authority), cp.supportMint(g.quote_mint),
  ];
}

/**
 * `migrate_to_cpswap`: moves a sold-out curve into a Raydium CPMM pool. Only the GlobalConfig's migrate wallet may sign,
 * so on real clusters only Raydium's crank runs this; we build it to play that crank on the local fork.
 * The ten remaining accounts are what the program needs when the platform takes 100% of the locked LP's Fee Key.
 * The transaction is too large for a legacy message, so send it as v0 with an address lookup table.
 */
export async function prepareMigration(connection: Connection, r: MigrationRequest): Promise<PreparedMigration> {
  const { launchlab, cpmm, lock, cpmmCreatePoolFee } = r.programs;
  const curveAccount = await connection.getAccountInfo(r.curve, "confirmed");
  if (!curveAccount) throw new Error(`no curve at ${r.curve.toBase58()}`);
  const c = launchlabCoder.accounts.decode("PoolState", curveAccount.data) as CurveAccounts;
  const platformAccount = await connection.getAccountInfo(c.platform_config, "confirmed");
  if (!platformAccount) throw new Error(`curve ${r.curve.toBase58()} points at a missing PlatformConfig`);
  const p = launchlabCoder.accounts.decode("PlatformConfig", platformAccount.data) as PlatformAccounts;

  const ll = launchlabPdas(launchlab);
  const cp = cpmmPdas(cpmm);
  const lk = lockPdas(lock);
  const pool = cp.pool(p.cpswap_config, c.base_mint, c.quote_mint);
  const lpMint = cp.lpMint(pool);
  const feeNftMint = Keypair.generate();
  const nft = feeNftMint.publicKey;

  const instruction = new TransactionInstruction({
    programId: launchlab,
    data: launchlabCoder.instruction.encode("migrate_to_cpswap", {}),
    keys: [
      meta(r.payer, true, true),
      meta(c.base_mint, false, true),
      meta(c.quote_mint),
      meta(c.platform_config),
      meta(cpmm),
      meta(pool, false, true),
      meta(cp.authority),
      meta(lpMint, false, true),
      meta(cp.vault(pool, c.base_mint), false, true),
      meta(cp.vault(pool, c.quote_mint), false, true),
      meta(p.cpswap_config),
      meta(cpmmCreatePoolFee, false, true),
      meta(cp.observation(pool), false, true),
      meta(lock),
      meta(lk.authority),
      meta(getAssociatedTokenAddressSync(lpMint, lk.authority, true), false, true),
      meta(ll.authority, false, true),
      meta(r.curve, false, true),
      meta(c.global_config),
      meta(ll.vault(r.curve, c.base_mint), false, true),
      meta(ll.vault(r.curve, c.quote_mint), false, true),
      meta(getAssociatedTokenAddressSync(lpMint, ll.authority, true), false, true),
      meta(TOKEN_PROGRAM_ID),
      meta(TOKEN_2022_PROGRAM_ID),
      meta(ASSOCIATED_TOKEN_PROGRAM_ID),
      meta(SystemProgram.programId),
      meta(SYSVAR_RENT_PUBKEY),
      meta(METADATA_PROGRAM),
      // Remaining accounts for a platform that takes the whole Fee Key.
      meta(p.platform_nft_wallet, false, true),
      meta(nft, true, true),
      meta(getAssociatedTokenAddressSync(nft, p.platform_nft_wallet), false, true),
      meta(lk.lockedLiquidity(nft), false, true),
      meta(metadataPda(nft), false, true),
      meta(c.creator, false, true),
      meta(cp.permission(ll.authority)),
      meta(p.platform_cp_creator),
      // In the pool's token order, not quote then base: WSOL sorts first for all but about 1 in 40 mints.
      ...sortMints(c.base_mint, c.quote_mint).map((mint) => meta(cp.supportMint(mint))),
    ],
  });
  return { instruction, feeNftMint, pool };
}
