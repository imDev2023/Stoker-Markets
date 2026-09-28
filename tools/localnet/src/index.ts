import { spawn, type ChildProcess } from "node:child_process";
import { createSocket } from "node:dgram";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
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

/**
 * Every port a validator binds, derived from its RPC port so each chain gets its own block: RPC and its websocket,
 * the faucet, gossip, and the dynamic range for TPU and repair.
 */
function validatorPorts(rpcPort: number) {
  const dynamic = Array.from({ length: 30 }, (_, i) => rpcPort + 2001 + i);
  return {
    faucet: rpcPort + 1000,
    gossip: rpcPort + 2000,
    dynamicRange: `${rpcPort + 2001}-${rpcPort + 2030}`,
    tcp: [rpcPort, rpcPort + 1, rpcPort + 1000, rpcPort + 2000, ...dynamic],
    udp: [rpcPort + 2000, ...dynamic],
  };
}

const canBind = (port: number, kind: "tcp" | "udp") =>
  new Promise<boolean>((resolve) => {
    if (kind === "tcp") {
      const srv = createServer().once("error", () => resolve(false));
      srv.listen(port, "0.0.0.0", () => srv.close(() => resolve(true)));
    } else {
      const sock = createSocket("udp4").once("error", () => resolve(false));
      sock.bind(port, "0.0.0.0", () => sock.close(() => resolve(true)));
    }
  });

async function portsFree(rpcPort: number) {
  const ports = validatorPorts(rpcPort);
  for (const p of ports.tcp) if (!(await canBind(p, "tcp"))) return false;
  for (const p of ports.udp) if (!(await canBind(p, "udp"))) return false;
  return true;
}

/** A free block of validator ports, so parallel checkouts and agents never share (or kill) each other's chain. */
async function freeRpcPort() {
  for (let attempt = 0; attempt < 50; attempt++) {
    const port = 20_000 + Math.floor(Math.random() * 400) * 50;
    if (await portsFree(port)) return port;
  }
  throw new Error("no free block of validator ports found between 20000 and 42000");
}

async function rpcIdentity(rpcUrl: string) {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getIdentity" }),
  });
  return ((await res.json()) as { result: { identity: string } }).result.identity;
}

/**
 * Starts a fresh solana-test-validator with the Raydium devnet programs and accounts from fixtures.
 * Without an `rpcPort` it takes a free block of ports; with one, it refuses to start if anything already holds them.
 */
export async function startLocalnet(opts: { rpcPort?: number } = {}): Promise<Localnet> {
  const rpcPort = opts.rpcPort ?? (await freeRpcPort());
  if (opts.rpcPort !== undefined && !(await portsFree(rpcPort)))
    throw new Error(`port ${rpcPort} or one of the validator ports derived from it is in use; is another local chain running there?`);
  const ports = validatorPorts(rpcPort);
  const dir = join(ROOT, ".ledger", String(rpcPort));
  rmSync(dir, { recursive: true, force: true });
  const ledger = join(dir, "ledger");
  mkdirSync(ledger, { recursive: true });
  const { admin } = localnetKeys();
  const args = [
    "--reset", "--quiet", "--ledger", ledger,
    "--rpc-port", String(rpcPort), "--faucet-port", String(ports.faucet),
    "--gossip-port", String(ports.gossip), "--dynamic-port-range", ports.dynamicRange,
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
  const identityFile = join(ledger, "validator-keypair.json");
  for (;;) {
    if (proc.exitCode !== null) throw new Error(`solana-test-validator exited: ${stderr}`);
    try {
      // Ready only when the chain answering is this validator, not another one that grabbed the port first.
      if (existsSync(identityFile) && (await connection.getSlot()) > 0) {
        const own = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(identityFile, "utf8")))).publicKey.toBase58();
        const answering = await rpcIdentity(rpcUrl);
        if (answering !== own) {
          proc.kill("SIGKILL");
          throw new Error(`another validator (${answering}) is answering on ${rpcUrl}`);
        }
        break;
      }
    } catch (e) {
      if ((e as Error).message.startsWith("another validator")) throw e;
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
    stop: async () => {
      await new Promise<void>((resolve) => {
        if (proc.exitCode !== null) return resolve();
        proc.once("exit", () => resolve());
        proc.kill("SIGTERM");
      });
      // A chain on picked ports is throwaway; one on a chosen port keeps its ledger for inspection.
      if (opts.rpcPort === undefined) rmSync(dir, { recursive: true, force: true });
    },
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
