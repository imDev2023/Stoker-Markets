import { spawn, type ChildProcess } from "node:child_process";
import { createSocket } from "node:dgram";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AddressLookupTableProgram, ComputeBudgetProgram, Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, sendAndConfirmTransaction,
  Transaction, TransactionMessage, VersionedTransaction, type TransactionInstruction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction, createMintToInstruction, getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import BN from "bn.js";
import bs58 from "bs58";
import {
  createPlatformConfigIx, launchlabCoder, launchlabPdas, prepareMigration, programsFor, sharedMigrationAccounts, updatePlatformConfigIx,
} from "@launchpad/chain";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURES = join(ROOT, "fixtures");
const KEYS = join(ROOT, ".keys");

/** The devnet SOL GlobalConfig, loaded from fixtures. */
export const SOL_GLOBAL_CONFIG = new PublicKey("7ZR4zD7PYfY2XxoG1Gxcy2EgEeGYrpxrwzPuwdUBssEt");
const SOL_QUOTE_MINT = new PublicKey("So11111111111111111111111111111111111111112");

/** Devnet CPMM config index 0. */
export const CPSWAP_CONFIG = new PublicKey("5MxLgy9oPdTC3YgkiePHqr3EoCRD9uLVYRQS2ANAs7wy");

/** The mainnet quote mints cloned into `fixtures/quotes`, one per case the Quote Registry must handle. */
export const LOCAL_QUOTES = {
  /** SPL Token, 6 decimals, a freeze authority. */
  USDC: new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
  /** Token-2022 tokenized stock, 8 decimals, with the issuer extensions every xStock has (permanent delegate, pausable, transfer hook and more). */
  NVDAx: new PublicKey("Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh"),
  /** SPL Token, 9 decimals, Metaplex metadata. */
  JTO: new PublicKey("jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL"),
  /** Token-2022 pump.fun memecoin, 6 decimals; left without a price, so it can't be launched against. */
  BULLWHALE: new PublicKey("88SpBWrpbQ6MCdukVbtDBwRYYZAkv4KU4PYdG86ipump"),
} as const;

/** USD prices for the API's static price source on the local chain. BULLWHALE is missing on purpose. */
export const LOCAL_QUOTE_PRICES_USD: Record<string, string> = {
  So11111111111111111111111111111111111111112: "150",
  [LOCAL_QUOTES.USDC.toBase58()]: "1",
  [LOCAL_QUOTES.NVDAx.toBase58()]: "180",
  [LOCAL_QUOTES.JTO.toBase58()]: "2.5",
};


/**
 * `migrate` stands in for Raydium's migrate wallet (its crank), the only key allowed to graduate a curve. It is kept
 * apart from our admin so nothing local can lean on a power the platform does not have on a real cluster.
 */
export type LocalnetKeys = { admin: Keypair; operations: Keypair; migrate: Keypair };

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
  return { admin: load("admin"), operations: load("operations"), migrate: load("migrate") };
}

// GlobalConfig offsets: discriminator, epoch, curve_type, index and eight u64 fields come before quote_mint,
// then four pubkeys before migrate_to_cpswap_wallet.
const QUOTE_MINT_OFFSET = 8 + 8 + 1 + 2 + 8 * 8;
const MIGRATE_TO_CPSWAP_WALLET_OFFSET = QUOTE_MINT_OFFSET + 32 * 4;

type AccountFixture = { pubkey: string; account: { data: [string, string]; owner: string; rentEpoch: number } };
const readFixture = (path: string) => JSON.parse(readFileSync(path, "utf8")) as AccountFixture;

/**
 * The local chain's GlobalConfigs, written to `dir` as account files keyed by address.
 * Devnet's SOL GlobalConfig is the template. Raydium's admin creates GlobalConfigs, so for every quote mint in `fixtures/quotes`
 * the local chain plants a copy of the template at that mint's PDA with only the quote mint changed.
 * Only a GlobalConfig's migrate wallet may migrate a graduated pool, and there is no Raydium crank locally,
 * so every copy names a local stand-in key as its migrate wallet.
 */
function globalConfigFixtures(dir: string, migrateWallet: PublicKey): Map<string, string> {
  const template = readFixture(join(FIXTURES, "accounts", `${SOL_GLOBAL_CONFIG.toBase58()}.json`));
  const decoded = launchlabCoder.accounts.decode("GlobalConfig", Buffer.from(template.account.data[0], "base64")) as {
    quote_mint: PublicKey; migrate_to_cpswap_wallet: PublicKey;
  };
  const program = programsFor("localnet").launchlab;
  const out = new Map<string, string>();
  for (const quoteMint of [decoded.quote_mint, ...localQuoteMints()]) {
    const data = Buffer.from(template.account.data[0], "base64");
    patchKey(data, QUOTE_MINT_OFFSET, decoded.quote_mint, quoteMint);
    patchKey(data, MIGRATE_TO_CPSWAP_WALLET_OFFSET, decoded.migrate_to_cpswap_wallet, migrateWallet);
    const address = launchlabPdas(program).globalConfig(quoteMint).toBase58();
    // rentEpoch is u64::MAX in the dump, which JSON.parse turns into a float the validator rejects; 0 means the same (rent-exempt).
    const fixture = { pubkey: address, account: { ...template.account, data: [data.toString("base64"), "base64"], rentEpoch: 0 } };
    const path = join(dir, `global_config_${address}.json`);
    writeFileSync(path, JSON.stringify(fixture));
    out.set(address, path);
  }
  return out;
}

function patchKey(data: Buffer, offset: number, expected: PublicKey, value: PublicKey) {
  if (!data.subarray(offset, offset + 32).equals(expected.toBuffer())) throw new Error("GlobalConfig layout changed; update the offsets");
  value.toBuffer().copy(data, offset);
}

const TOKEN_PROGRAMS = new Set([TOKEN_PROGRAM_ID.toBase58(), TOKEN_2022_PROGRAM_ID.toBase58()]);

/**
 * The cloned quote mints, written to `dir` with `authority` as their mint authority, so tests can hand wallets USDC or a
 * stock to trade with. Both token programs keep the mint authority as a COption<Pubkey> at the start of the mint.
 */
function quoteMintFixtures(dir: string, authority: PublicKey): Map<string, string> {
  const out = new Map<string, string>();
  for (const f of readdirSync(join(FIXTURES, "quotes")).filter((f) => f.endsWith(".json"))) {
    const fixture = readFixture(join(FIXTURES, "quotes", f));
    if (!TOKEN_PROGRAMS.has(fixture.account.owner)) continue;
    const data = Buffer.from(fixture.account.data[0], "base64");
    data.writeUInt32LE(1, 0);
    authority.toBuffer().copy(data, 4);
    const path = join(dir, `quote_mint_${fixture.pubkey}.json`);
    // As for GlobalConfigs: a JSON round-trip turns rentEpoch u64::MAX into a float the validator rejects.
    writeFileSync(path, JSON.stringify({ ...fixture, account: { ...fixture.account, data: [data.toString("base64"), "base64"], rentEpoch: 0 } }));
    out.set(fixture.pubkey, path);
  }
  return out;
}

/** The quote mints cloned from mainnet into `fixtures/quotes` (their Metaplex metadata accounts sit beside them). */
export function localQuoteMints(): PublicKey[] {
  return readdirSync(join(FIXTURES, "quotes"))
    .filter((f) => f.endsWith(".json"))
    .map((f) => readFixture(join(FIXTURES, "quotes", f)))
    .filter((f) => TOKEN_PROGRAMS.has(f.account.owner))
    .map((f) => new PublicKey(f.pubkey));
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
  const { admin, migrate } = localnetKeys();
  const quoteMints = quoteMintFixtures(dir, admin.publicKey);
  const args = [
    "--reset", "--quiet", "--ledger", ledger,
    "--rpc-port", String(rpcPort), "--faucet-port", String(ports.faucet),
    "--gossip-port", String(ports.gossip), "--dynamic-port-range", ports.dynamicRange,
  ];
  for (const f of readdirSync(join(FIXTURES, "programs"))) args.push("--bpf-program", f.replace(/\.so$/, ""), join(FIXTURES, "programs", f));
  for (const folder of ["accounts", "quotes"]) {
    for (const f of readdirSync(join(FIXTURES, folder))) {
      const address = f.replace(/\.json$/, "");
      if (!f.endsWith(".json") || address === SOL_GLOBAL_CONFIG.toBase58() || quoteMints.has(address)) continue;
      args.push("--account", address, join(FIXTURES, folder, f));
    }
  }
  for (const [address, path] of quoteMints) args.push("--account", address, path);
  for (const [address, path] of globalConfigFixtures(dir, migrate.publicKey)) args.push("--account", address, path);

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
 * Gives `owner` `amount` raw units of a cloned quote mint, opening their token account if needed. Only works on the local
 * chain, where the admin key holds every cloned quote mint's mint authority.
 */
export async function mintLocalQuote(connection: Connection, mint: PublicKey, owner: PublicKey, amount: bigint) {
  const { admin } = localnetKeys();
  const tokenProgram = (await connection.getAccountInfo(mint))?.owner;
  if (!tokenProgram || !TOKEN_PROGRAMS.has(tokenProgram.toBase58())) throw new Error(`${mint.toBase58()} is not a mint on this chain`);
  const account = getAssociatedTokenAddressSync(mint, owner, true, tokenProgram);
  await send(connection, [
    createAssociatedTokenAccountIdempotentInstruction(admin.publicKey, account, owner, mint, tokenProgram),
    createMintToInstruction(mint, account, admin.publicKey, amount, [], tokenProgram),
  ], [admin]);
  return account;
}

/**
 * Creates our PlatformConfig with the ADR 0001 fee rates and the operations wallet in every day-to-day role (ADR 0004),
 * turns on curve-rule enforcement and makes the operations wallet the curve rule manager (ADR 0005).
 * The curve rules themselves are written by the API's Quote Registry refresh.
 * Idempotent: an existing PlatformConfig is left as it is.
 */
export async function bootstrapPlatform(connection: Connection, rpcUrl: string, graduationTargetLamports: BN): Promise<LocalnetState> {
  const { admin, operations, migrate } = localnetKeys();
  const program = programsFor("localnet").launchlab;
  const platformConfig = launchlabPdas(program).platformConfig(admin.publicKey);
  if (!(await connection.getAccountInfo(platformConfig))) {
    await airdrop(connection, admin.publicKey, 100);
    await airdrop(connection, operations.publicKey, 10);
    // Each migration pays CPMM's 0.15 SOL pool fee plus rent, as Raydium's crank does on real clusters.
    await airdrop(connection, migrate.publicKey, 100);
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
      updatePlatformConfigIx(program, admin.publicKey, { CurveRuleManager: [operations.publicKey] }),
    ], [admin]);
    await createMigrationLookupTable(connection, platformConfig);
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

/**
 * The migrate wallet's address lookup table of the accounts migrations share, for every Quote Asset on the local chain,
 * created with the platform. A migration is too big for a legacy transaction, so it goes out as v0 through this table.
 * The validator only resolves a lookup table for new transactions once its last extension is rooted (about 32 slots,
 * 15 s locally), so the table is made once, up front, rather than per migration.
 */
async function createMigrationLookupTable(connection: Connection, platformConfig: PublicKey) {
  const { migrate } = localnetKeys();
  const programs = programsFor("localnet");
  const shared = new Map<string, PublicKey>();
  for (const quoteMint of [SOL_QUOTE_MINT, ...localQuoteMints()]) {
    const globalConfig = launchlabPdas(programs.launchlab).globalConfig(quoteMint);
    for (const a of await sharedMigrationAccounts(connection, programs, platformConfig, globalConfig)) shared.set(a.toBase58(), a);
  }
  const addresses = [...shared.values()];
  const [create, table] = AddressLookupTableProgram.createLookupTable({
    authority: migrate.publicKey, payer: migrate.publicKey, recentSlot: await connection.getSlot("finalized"),
  });
  await send(connection, [create], [migrate]);
  // An extension carries 32 bytes per address, so a transaction takes about 25.
  for (let i = 0; i < addresses.length; i += 25) {
    const extend = AddressLookupTableProgram.extendLookupTable({
      lookupTable: table, authority: migrate.publicKey, payer: migrate.publicKey, addresses: addresses.slice(i, i + 25),
    });
    await send(connection, [extend], [migrate]);
  }
  return table;
}

// Address lookup table layout: type (u32), deactivation slot, last extended slot, start index (u8), then the authority
// as an option (u8 tag and 32 bytes).
const LOOKUP_TABLE_AUTHORITY_OFFSET = 4 + 8 + 8 + 1 + 1;

async function migrationLookupTable(connection: Connection) {
  const { migrate } = localnetKeys();
  const [found] = await connection.getProgramAccounts(AddressLookupTableProgram.programId, {
    commitment: "confirmed",
    filters: [{ memcmp: { offset: LOOKUP_TABLE_AUTHORITY_OFFSET, bytes: migrate.publicKey.toBase58() } }],
  });
  if (!found) throw new Error("the migrate wallet has no lookup table; was the platform bootstrapped by this version?");
  const table = (await connection.getAddressLookupTable(found.pubkey, { commitment: "confirmed" })).value!;
  while ((await connection.getSlot("finalized")) <= Number(table.state.lastExtendedSlot)) await new Promise((r) => setTimeout(r, 250));
  return table;
}

/**
 * Plays Raydium's crank for one sold-out curve: `migrate_to_cpswap` signed by the GlobalConfig's migrate wallet, which
 * moves the Launch into its CPMM pool. Returns the migration signature and the pool.
 */
export async function migrateCurve(connection: Connection, curve: PublicKey) {
  const { migrate } = localnetKeys();
  const m = await prepareMigration(connection, { programs: programsFor("localnet"), curve, payer: migrate.publicKey });
  const table = await migrationLookupTable(connection);
  const latest = await connection.getLatestBlockhash("confirmed");
  const message = new TransactionMessage({
    payerKey: migrate.publicKey,
    recentBlockhash: latest.blockhash,
    instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }), m.instruction],
  }).compileToV0Message([table]);
  const tx = new VersionedTransaction(message);
  tx.sign([migrate, m.feeNftMint]);
  const signature = await connection.sendTransaction(tx).catch((e: Error & { transactionLogs?: string[] }) => {
    const accounts = m.instruction.keys.map((k, i) => `  ${i}: ${k.pubkey.toBase58()}`).join("\n");
    throw new Error(`migrating curve ${curve.toBase58()} failed: ${e.message}\n${(e.transactionLogs ?? []).join("\n")}\naccounts:\n${accounts}`);
  });
  const result = await connection.confirmTransaction({ signature, ...latest }, "confirmed");
  if (result.value.err) throw new Error(`migration ${signature} failed: ${JSON.stringify(result.value.err)}`);
  return { signature, pool: m.pool };
}

// PoolState offset of `status`: discriminator, epoch, auth_bump. Status 1 is sold out and waiting for migration.
const CURVE_STATUS_OFFSET = 8 + 8 + 1;
const WAITING_FOR_MIGRATION = 1;

/**
 * Raydium's crank for the local chain, for development: every few seconds it migrates any of our platform's curves that
 * sold out, the way Raydium's crank does on devnet within seconds. Tests do not run it; they migrate explicitly.
 */
export function startCrank(connection: Connection, platformConfig: PublicKey, opts: { intervalMs?: number; log?: (line: string) => void } = {}) {
  const program = programsFor("localnet").launchlab;
  const discriminator = launchlabCoder.accounts.memcmp("PoolState");
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const tick = async () => {
    try {
      const waiting = await connection.getProgramAccounts(program, {
        commitment: "confirmed",
        filters: [
          { memcmp: { offset: 0, bytes: discriminator.bytes! } },
          { memcmp: { offset: CURVE_STATUS_OFFSET, bytes: bs58.encode([WAITING_FOR_MIGRATION]) } },
        ],
      });
      for (const { pubkey, account } of waiting) {
        const s = launchlabCoder.accounts.decode("PoolState", account.data) as { platform_config: PublicKey };
        if (!s.platform_config.equals(platformConfig)) continue;
        const { signature, pool } = await migrateCurve(connection, pubkey);
        opts.log?.(`crank: migrated curve ${pubkey.toBase58()} into pool ${pool.toBase58()} (${signature})`);
      }
    } catch (e) {
      opts.log?.(`crank: ${(e as Error).message}`);
    }
    if (!stopped) timer = setTimeout(tick, opts.intervalMs ?? 3_000);
  };
  void tick();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
