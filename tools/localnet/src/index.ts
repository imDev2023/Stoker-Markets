import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, sendAndConfirmTransaction, Transaction, type TransactionInstruction,
} from "@solana/web3.js";
import BN from "bn.js";
import {
  createCurveRuleIx, createPlatformConfigIx, launchlabCoder, launchlabPdas, programsFor, standardLaunchConstraints,
  updateCurveRuleIx, updatePlatformConfigIx,
} from "@launchpad/chain";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURES = join(ROOT, "fixtures");
const KEYS = join(ROOT, ".keys");

/** The devnet SOL GlobalConfig, loaded from fixtures. */
export const SOL_GLOBAL_CONFIG = new PublicKey("7ZR4zD7PYfY2XxoG1Gxcy2EgEeGYrpxrwzPuwdUBssEt");
/** Devnet CPMM config index 0. */
export const CPSWAP_CONFIG = new PublicKey("5MxLgy9oPdTC3YgkiePHqr3EoCRD9uLVYRQS2ANAs7wy");

export type LocalnetKeys = { admin: Keypair; operations: Keypair };

export type LocalnetState = {
  rpcUrl: string;
  launchlab: string;
  platformConfig: string;
  solGlobalConfig: string;
  admin: string;
  operationsWallet: string;
  graduationTargetLamports: string;
};

/** Local keys persist between runs so addresses stay stable; they are git-ignored and only ever used on the local chain. */
export function localnetKeys(): LocalnetKeys {
  mkdirSync(KEYS, { recursive: true });
  const load = (name: string) => {
    const path = join(KEYS, `${name}.json`);
    if (!existsSync(path)) writeFileSync(path, JSON.stringify(Array.from(Keypair.generate().secretKey)));
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8"))));
  };
  return { admin: load("admin"), operations: load("operations") };
}

// GlobalConfig offset of migrate_to_cpswap_wallet: discriminator, epoch, curve_type, index, eight u64 fields, four pubkeys.
const MIGRATE_TO_CPSWAP_WALLET_OFFSET = 8 + 8 + 1 + 2 + 8 * 8 + 32 * 4;

/**
 * Only the GlobalConfig's migrate wallet may migrate a graduated pool, and there is no Raydium crank locally,
 * so the local copy of the SOL GlobalConfig names the local admin key as its migrate wallet.
 */
function patchedGlobalConfig(dir: string, migrateWallet: PublicKey) {
  const fixture = JSON.parse(readFileSync(join(FIXTURES, "accounts", `${SOL_GLOBAL_CONFIG.toBase58()}.json`), "utf8"));
  const data = Buffer.from(fixture.account.data[0], "base64");
  const before = launchlabCoder.accounts.decode("GlobalConfig", data) as { migrate_to_cpswap_wallet: PublicKey };
  const slot = data.subarray(MIGRATE_TO_CPSWAP_WALLET_OFFSET, MIGRATE_TO_CPSWAP_WALLET_OFFSET + 32);
  if (!slot.equals(before.migrate_to_cpswap_wallet.toBuffer())) throw new Error("GlobalConfig layout changed; update MIGRATE_TO_CPSWAP_WALLET_OFFSET");
  migrateWallet.toBuffer().copy(data, MIGRATE_TO_CPSWAP_WALLET_OFFSET);
  fixture.account.data[0] = data.toString("base64");
  // rentEpoch is u64::MAX in the dump, which JSON.parse turns into a float the validator rejects; 0 means the same (rent-exempt).
  fixture.account.rentEpoch = 0;
  const path = join(dir, "global_config_patched.json");
  writeFileSync(path, JSON.stringify(fixture));
  return path;
}

export type Localnet = { rpcUrl: string; connection: Connection; stop: () => Promise<void> };

/** Starts a fresh solana-test-validator with the Raydium devnet programs and accounts from fixtures. */
export async function startLocalnet(opts: { rpcPort?: number } = {}): Promise<Localnet> {
  const rpcPort = opts.rpcPort ?? 8899;
  const dir = join(ROOT, ".ledger", String(rpcPort));
  rmSync(dir, { recursive: true, force: true });
  const ledger = join(dir, "ledger");
  mkdirSync(ledger, { recursive: true });
  const { admin } = localnetKeys();
  const args = [
    "--reset", "--quiet", "--ledger", ledger,
    "--rpc-port", String(rpcPort), "--faucet-port", String(rpcPort + 1000),
    // Each validator needs its own gossip and dynamic ports so a dev chain and a test chain can run side by side.
    "--gossip-port", String(rpcPort + 2000), "--dynamic-port-range", `${rpcPort + 2001}-${rpcPort + 2030}`,
  ];
  for (const f of readdirSync(join(FIXTURES, "programs"))) args.push("--bpf-program", f.replace(/\.so$/, ""), join(FIXTURES, "programs", f));
  for (const f of readdirSync(join(FIXTURES, "accounts"))) {
    if (!f.endsWith(".json") || f === `${SOL_GLOBAL_CONFIG.toBase58()}.json`) continue;
    args.push("--account", f.replace(/\.json$/, ""), join(FIXTURES, "accounts", f));
  }
  args.push("--account", SOL_GLOBAL_CONFIG.toBase58(), patchedGlobalConfig(dir, admin.publicKey));

  const proc: ChildProcess = spawn("solana-test-validator", args, { stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  proc.stdout?.on("data", (d) => (stderr += d));
  proc.stderr?.on("data", (d) => (stderr += d));
  const rpcUrl = `http://127.0.0.1:${rpcPort}`;
  const connection = new Connection(rpcUrl, "confirmed");
  const deadline = Date.now() + 60_000;
  for (;;) {
    if (proc.exitCode !== null) throw new Error(`solana-test-validator exited: ${stderr}`);
    try {
      if ((await connection.getSlot()) > 0) break;
    } catch {
      // not up yet
    }
    if (Date.now() > deadline) {
      proc.kill("SIGKILL");
      throw new Error(`solana-test-validator did not start within 60 s: ${stderr}`);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return {
    rpcUrl,
    connection,
    stop: () =>
      new Promise<void>((resolve) => {
        if (proc.exitCode !== null) return resolve();
        proc.once("exit", () => resolve());
        proc.kill("SIGTERM");
      }),
  };
}

export async function send(connection: Connection, ixs: TransactionInstruction[], signers: Keypair[]) {
  return sendAndConfirmTransaction(connection, new Transaction().add(...ixs), signers, { commitment: "confirmed" });
}

export async function airdrop(connection: Connection, to: PublicKey, sol: number) {
  const signature = await connection.requestAirdrop(to, sol * LAMPORTS_PER_SOL);
  const latest = await connection.getLatestBlockhash("confirmed");
  await connection.confirmTransaction({ signature, ...latest }, "confirmed");
}

/**
 * Creates our PlatformConfig with the ADR 0001 fee rates and the operations wallet in every day-to-day role (ADR 0004),
 * turns on curve-rule enforcement, and pins the launch shape for SOL with the given Graduation Target.
 * Idempotent: an existing PlatformConfig is left as it is.
 */
export async function bootstrapPlatform(connection: Connection, rpcUrl: string, graduationTargetLamports: BN): Promise<LocalnetState> {
  const { admin, operations } = localnetKeys();
  const program = programsFor("localnet").launchlab;
  const platformConfig = launchlabPdas(program).platformConfig(admin.publicKey);
  if (!(await connection.getAccountInfo(platformConfig))) {
    await airdrop(connection, admin.publicKey, 100);
    await airdrop(connection, operations.publicKey, 10);
    await send(connection, [
      createPlatformConfigIx(program, admin.publicKey, {
        feeRate: new BN(5_000),
        creatorFeeRate: new BN(5_000),
        name: "Launchpad (localnet)",
        web: "http://localhost:3000",
        img: "http://localhost:3000/icon.png",
        operationsWallet: operations.publicKey,
        cpswapConfig: CPSWAP_CONFIG,
      }),
      updatePlatformConfigIx(program, admin.publicKey, { PlatformCPCreator: [operations.publicKey] }),
      updatePlatformConfigIx(program, admin.publicKey, { RestrictCurveParam: [new BN(1)] }),
    ], [admin]);
    await send(connection, [
      createCurveRuleIx(program, admin.publicKey, platformConfig, SOL_GLOBAL_CONFIG),
      updateCurveRuleIx(program, admin.publicKey, platformConfig, SOL_GLOBAL_CONFIG, 0, standardLaunchConstraints(graduationTargetLamports)),
    ], [admin]);
  }
  return {
    rpcUrl,
    launchlab: program.toBase58(),
    platformConfig: platformConfig.toBase58(),
    solGlobalConfig: SOL_GLOBAL_CONFIG.toBase58(),
    admin: admin.publicKey.toBase58(),
    operationsWallet: operations.publicKey.toBase58(),
    graduationTargetLamports: graduationTargetLamports.toString(),
  };
}
