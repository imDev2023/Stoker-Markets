// Q2: create our own LaunchLab PlatformConfig with a non-zero creator fee, a platform fee, our fee wallet and a cpswap config.
import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import BN from "bn.js";
import { conn, DEV, key, launchCoder, launchIdlDev, plain, send, saveState, loadState, logEvidence } from "./common";

const admin = key("admin");
const feeWallet = key("feewallet").publicKey;
const CPSWAP_CONFIG = new PublicKey(process.env.CPSWAP_CONFIG ?? "5MxLgy9oPdTC3YgkiePHqr3EoCRD9uLVYRQS2ANAs7wy"); // devnet CPMM index 0
const [platformConfig] = PublicKey.findProgramAddressSync([Buffer.from("platform_config"), admin.publicKey.toBuffer()], DEV.LAUNCHPAD);

// PlatformParams, in IDL field order. Rates use a 1e6 denominator.
const platformParams = {
  migrate_nft_info: { platform_scale: new BN(1_000_000), creator_scale: new BN(0), burn_scale: new BN(0) }, // 100% of locked LP fee rights to our Fee Key NFT
  fee_rate: new BN(10_000), // 1.00% platform fee on every curve trade
  name: "PAND432 Spike",
  web: "https://example.invalid/pand-432",
  img: "https://example.invalid/pand-432.png",
  creator_fee_rate: new BN(5_000), // 0.50% creator fee on every curve trade
  platform_vesting_scale: new BN(0),
};

if (!(await conn.getAccountInfo(platformConfig))) {
  const data = launchCoder.instruction.encode("create_platform_config", { platform_params: platformParams });
  const ix = new TransactionInstruction({
    programId: DEV.LAUNCHPAD,
    data,
    keys: [
      { pubkey: admin.publicKey, isSigner: true, isWritable: true }, // platform_admin
      { pubkey: feeWallet, isSigner: false, isWritable: false }, // platform_fee_wallet
      { pubkey: feeWallet, isSigner: false, isWritable: false }, // platform_nft_wallet (receives the Fee Key NFT at migration)
      { pubkey: platformConfig, isSigner: false, isWritable: true },
      { pubkey: CPSWAP_CONFIG, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: feeWallet, isSigner: false, isWritable: false }, // transfer_fee_extension_authority (Token-2022 launches)
      { pubkey: feeWallet, isSigner: false, isWritable: false }, // platform_vesting_wallet
    ],
  });
  await send("q2 create_platform_config", [ix], [admin]);
} else console.log("platform config exists", platformConfig.toBase58());

const acc = (await conn.getAccountInfo(platformConfig))!;
const decoded: any = plain(launchCoder.accounts.decode("PlatformConfig", acc.data));
for (const f of ["name", "web", "img"]) decoded[f] = Buffer.from((launchCoder.accounts.decode("PlatformConfig", acc.data) as any)[f]).toString("utf8").replace(/\0+$/, "");
delete decoded.padding;
console.log("PlatformConfig", platformConfig.toBase58(), "size", acc.data.length, "rent", acc.lamports);
console.log(JSON.stringify(decoded, null, 1));
saveState({ platformConfig: platformConfig.toBase58(), cpswapConfig: CPSWAP_CONFIG.toBase58(), platformParams: plain(platformParams), platformConfigDecoded: decoded });
logEvidence("q2 platform config decoded", { platformConfig, decoded });
