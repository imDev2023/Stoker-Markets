// Builds the mainnet PlatformConfig creation transaction for the cold admin key, unsigned, and decodes an existing
// PlatformConfig to check it (runbook, section 2). Read-only on secrets: a keypair path only lends its public key,
// unless `--sign` names one to sign and send with (a devnet rehearsal, the local chain), and nothing secret is printed.
//
//   pnpm --filter @launchpad/mainnet platform-config build --rpc <url> --cluster mainnet --admin <pubkey or keypair.json> \
//     --operations <pubkey or keypair.json> --cpswap-config <pubkey> --name "..." --web https://... --img https://... \
//     [--platform-fee-bps 50] [--creator-fee-bps 50] [--sign admin.json]
//   pnpm --filter @launchpad/mainnet platform-config check --rpc <url> --cluster mainnet --admin <pubkey or keypair.json> \
//     [--operations ... --cpswap-config ... --name ... --web ... --img ... --platform-fee-bps 50 --creator-fee-bps 50]
import { readFileSync } from "node:fs";
import { Connection, Keypair, PublicKey, Transaction, type TransactionInstruction } from "@solana/web3.js";
import BN from "bn.js";
import {
  createPlatformConfigIx, launchlabCoder, launchlabPdas, programsFor, RATE_DENOMINATOR, updatePlatformConfigIx, type Cluster,
} from "@launchpad/chain";

/** What the PlatformConfig is created with: everything `bootstrapPlatform` (tools/localnet) sets on the local chain. */
export type PlatformConfigArgs = {
  cluster: Cluster;
  /** The cold admin key's address: the PlatformConfig derives from it and can never change (ADR 0004). */
  admin: PublicKey;
  /** The hot operations wallet, in every day-to-day role. */
  operations: PublicKey;
  /** The CPMM config graduated pools use; it fixes the post-Graduation Platform Fee for good (ADR 0001). */
  cpswapConfig: PublicKey;
  name: string;
  web: string;
  img: string;
  /** The Platform Fee and Creator Fee on curve trades, in basis points (50 each: ADR 0001). */
  platformFeeBps: number;
  creatorFeeBps: number;
};

export const DEFAULT_FEE_BPS = 50;

const toRate = (bps: number) => new BN((bps * RATE_DENOMINATOR) / 10_000);

/**
 * The four instructions of the creation, in one transaction, exactly as `bootstrapPlatform` sends them locally:
 * create the PlatformConfig (fees, name, links, the operations wallet as fee wallet, NFT wallet, transfer-fee-extension
 * authority and vesting wallet, every Fee Key right to the platform), then name the operations wallet the CPMM pool
 * creator, turn curve-rule enforcement on, and name it the curve rule manager (ADR 0005).
 */
export function platformConfigInstructions(a: PlatformConfigArgs): TransactionInstruction[] {
  const program = programsFor(a.cluster).launchlab;
  return [
    createPlatformConfigIx(program, a.admin, {
      feeRate: toRate(a.platformFeeBps),
      creatorFeeRate: toRate(a.creatorFeeBps),
      name: a.name,
      web: a.web,
      img: a.img,
      operationsWallet: a.operations,
      cpswapConfig: a.cpswapConfig,
    }),
    updatePlatformConfigIx(program, a.admin, { PlatformCPCreator: [a.operations] }),
    updatePlatformConfigIx(program, a.admin, { RestrictCurveParam: [new BN(1)] }),
    updatePlatformConfigIx(program, a.admin, { CurveRuleManager: [a.operations] }),
  ];
}

/** The unsigned transaction as base64, the admin as fee payer, for the cold device or Squads to sign and send. */
export async function buildPlatformConfigTransaction(connection: Connection, a: PlatformConfigArgs) {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: a.admin, blockhash, lastValidBlockHeight }).add(...platformConfigInstructions(a));
  return {
    platformConfig: launchlabPdas(programsFor(a.cluster).launchlab).platformConfig(a.admin),
    transaction: Buffer.from(tx.serialize({ requireAllSignatures: false, verifySignatures: false })).toString("base64"),
    lastValidBlockHeight,
  };
}

/** Signs a built transaction with the admin keypair and sends it: for a rehearsal where the admin is a file keypair. */
export async function signAndSendPlatformConfig(connection: Connection, transaction: string, lastValidBlockHeight: number, admin: Keypair) {
  const tx = Transaction.from(Buffer.from(transaction, "base64"));
  tx.sign(admin);
  const signature = await connection.sendRawTransaction(tx.serialize());
  const result = await connection.confirmTransaction({ signature, blockhash: tx.recentBlockhash!, lastValidBlockHeight }, "confirmed");
  if (result.value.err) throw new Error(`the PlatformConfig transaction ${signature} failed: ${JSON.stringify(result.value.err)}`);
  return signature;
}

/** A PlatformConfig as it is on-chain, in the terms of the runbook's acceptance check. */
export type PlatformConfigView = {
  address: string;
  admin: string;
  feeRate: number;
  creatorFeeRate: number;
  platformFeeBps: number;
  creatorFeeBps: number;
  name: string;
  web: string;
  img: string;
  feeWallet: string;
  nftWallet: string;
  transferFeeExtensionAuth: string;
  vestingWallet: string;
  platformCpCreator: string;
  curveRuleManager: string;
  restrictCurveParam: boolean;
  restrictGlobalConfig: boolean;
  cpswapConfig: string;
  migrateNftInfo: { platformScale: number; creatorScale: number; burnScale: number };
  platformVestingScale: number;
};

type PlatformConfigData = {
  platform_fee_wallet: PublicKey; platform_nft_wallet: PublicKey; platform_scale: BN; creator_scale: BN; burn_scale: BN; fee_rate: BN;
  name: number[]; web: number[]; img: number[]; cpswap_config: PublicKey; creator_fee_rate: BN; transfer_fee_extension_auth: PublicKey;
  platform_vesting_wallet: PublicKey; platform_vesting_scale: BN; platform_cp_creator: PublicKey; restrict_global_config: number;
  restrict_curve_param: number; curve_rule_manager: PublicKey;
};

/** Decodes the PlatformConfig derived from `admin`; null when it does not exist. */
export async function decodePlatformConfig(connection: Connection, cluster: Cluster, admin: PublicKey): Promise<PlatformConfigView | null> {
  const address = launchlabPdas(programsFor(cluster).launchlab).platformConfig(admin);
  const account = await connection.getAccountInfo(address, "confirmed");
  if (!account) return null;
  const p = launchlabCoder.accounts.decode("PlatformConfig", account.data) as PlatformConfigData;
  const text = (bytes: number[]) => Buffer.from(bytes).toString("utf8").replace(/\0+$/, "");
  const rate = (r: BN) => r.toNumber();
  return {
    address: address.toBase58(),
    admin: admin.toBase58(),
    feeRate: rate(p.fee_rate),
    creatorFeeRate: rate(p.creator_fee_rate),
    platformFeeBps: (rate(p.fee_rate) * 10_000) / RATE_DENOMINATOR,
    creatorFeeBps: (rate(p.creator_fee_rate) * 10_000) / RATE_DENOMINATOR,
    name: text(p.name),
    web: text(p.web),
    img: text(p.img),
    feeWallet: p.platform_fee_wallet.toBase58(),
    nftWallet: p.platform_nft_wallet.toBase58(),
    transferFeeExtensionAuth: p.transfer_fee_extension_auth.toBase58(),
    vestingWallet: p.platform_vesting_wallet.toBase58(),
    platformCpCreator: p.platform_cp_creator.toBase58(),
    curveRuleManager: p.curve_rule_manager.toBase58(),
    restrictCurveParam: p.restrict_curve_param !== 0,
    restrictGlobalConfig: p.restrict_global_config !== 0,
    cpswapConfig: p.cpswap_config.toBase58(),
    migrateNftInfo: { platformScale: rate(p.platform_scale), creatorScale: rate(p.creator_scale), burnScale: rate(p.burn_scale) },
    platformVestingScale: rate(p.platform_vesting_scale),
  };
}

/** Every way a decoded PlatformConfig differs from what it should be (runbook, section 2, step 4); empty when it is right. */
export function checkPlatformConfig(view: PlatformConfigView, expected: Omit<PlatformConfigArgs, "cluster" | "admin">): string[] {
  const ops = expected.operations.toBase58();
  const want: [string, unknown, unknown][] = [
    ["fee_rate", view.feeRate, toRate(expected.platformFeeBps).toNumber()],
    ["creator_fee_rate", view.creatorFeeRate, toRate(expected.creatorFeeBps).toNumber()],
    ["migrate_nft_info", JSON.stringify(view.migrateNftInfo), JSON.stringify({ platformScale: 1_000_000, creatorScale: 0, burnScale: 0 })],
    ["platform_vesting_scale", view.platformVestingScale, 0],
    ["fee_wallet", view.feeWallet, ops],
    ["nft_wallet", view.nftWallet, ops],
    ["transfer_fee_extension_auth", view.transferFeeExtensionAuth, ops],
    ["vesting_wallet", view.vestingWallet, ops],
    ["platform_cp_creator", view.platformCpCreator, ops],
    ["curve_rule_manager", view.curveRuleManager, ops],
    ["restrict_curve_param", view.restrictCurveParam, true],
    ["cpswap_config", view.cpswapConfig, expected.cpswapConfig.toBase58()],
    ["name", view.name, expected.name],
    ["web", view.web, expected.web],
    ["img", view.img, expected.img],
  ];
  return want.filter(([, got, should]) => got !== should).map(([field, got, should]) => `${field} is ${String(got)}, expected ${String(should)}`);
}

/** A public key from a base58 address or a keypair file, which lends only its public half. */
export function publicKeyArg(value: string): PublicKey {
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) return new PublicKey(value);
  return keypairArg(value).publicKey;
}

export function keypairArg(path: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8")) as number[]));
}

/** `--flag value` pairs from the command line. */
export function flags(argv: string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith("--")) continue;
    out.set(arg.slice(2), argv[i + 1] ?? "");
    i++;
  }
  return out;
}

export function clusterArg(value: string | undefined): Cluster {
  if (value === "mainnet" || value === "devnet" || value === "localnet") return value;
  throw new Error(`--cluster must be mainnet, devnet or localnet (got ${value ?? "nothing"})`);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const f = flags(rest);
  const need = (name: string) => {
    const v = f.get(name);
    if (!v) throw new Error(`--${name} is required`);
    return v;
  };
  const connection = new Connection(need("rpc"), "confirmed");
  const cluster = clusterArg(f.get("cluster"));
  const admin = publicKeyArg(need("admin"));
  const expected = () => ({
    operations: publicKeyArg(need("operations")),
    cpswapConfig: new PublicKey(need("cpswap-config")),
    name: need("name"),
    web: need("web"),
    img: need("img"),
    platformFeeBps: Number(f.get("platform-fee-bps") ?? DEFAULT_FEE_BPS),
    creatorFeeBps: Number(f.get("creator-fee-bps") ?? DEFAULT_FEE_BPS),
  });
  if (command === "build") {
    const args: PlatformConfigArgs = { cluster, admin, ...expected() };
    if (await decodePlatformConfig(connection, cluster, admin)) throw new Error(`a PlatformConfig for admin ${admin.toBase58()} already exists; use check`);
    const built = await buildPlatformConfigTransaction(connection, args);
    console.log(`PlatformConfig (PLATFORM_CONFIG): ${built.platformConfig.toBase58()}`);
    console.log(`Admin (PLATFORM_ADMIN): ${admin.toBase58()}`);
    console.log(`Valid until block height ${built.lastValidBlockHeight} (about a minute); rebuild if it expires.`);
    const signer = f.get("sign");
    if (signer) {
      const signature = await signAndSendPlatformConfig(connection, built.transaction, built.lastValidBlockHeight, keypairArg(signer));
      console.log(`Sent and confirmed: ${signature}`);
      const view = await decodePlatformConfig(connection, cluster, admin);
      const problems = view ? checkPlatformConfig(view, args) : ["the PlatformConfig does not exist after the transaction confirmed"];
      console.log(problems.length ? `Check failed:\n  ${problems.join("\n  ")}` : "Check passed: the PlatformConfig is as expected.");
      process.exitCode = problems.length ? 1 : 0;
    } else {
      console.log("Unsigned transaction (base64), the admin as fee payer; sign it on the cold device or through Squads and send it:");
      console.log(built.transaction);
    }
    return;
  }
  if (command === "check") {
    const view = await decodePlatformConfig(connection, cluster, admin);
    if (!view) throw new Error(`no PlatformConfig for admin ${admin.toBase58()} on this cluster`);
    console.log(JSON.stringify(view, null, 2));
    if (f.has("operations")) {
      const problems = checkPlatformConfig(view, expected());
      console.log(problems.length ? `Check failed:\n  ${problems.join("\n  ")}` : "Check passed: the PlatformConfig is as expected.");
      process.exitCode = problems.length ? 1 : 0;
    }
    return;
  }
  throw new Error("usage: platform-config build|check --rpc <url> --cluster <cluster> --admin <pubkey or keypair.json> ...");
}

if (process.argv[1] && /platform-config\.ts$/.test(process.argv[1])) {
  main().catch((e: Error) => {
    console.error(e.message);
    process.exit(1);
  });
}
