import { spawn, type ChildProcess } from "node:child_process";
import { createSocket } from "node:dgram";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { connect, createServer, type Server } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AddressLookupTableProgram, ComputeBudgetProgram, Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, sendAndConfirmTransaction,
  SystemProgram, Transaction, TransactionMessage, VersionedTransaction, type TransactionInstruction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction, createInitializeMetadataPointerInstruction, createInitializeMint2Instruction,
  createInitializeTransferFeeConfigInstruction, createMintToInstruction, ExtensionType, getAssociatedTokenAddressSync, getMintLen, LENGTH_SIZE,
  TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, TYPE_SIZE,
} from "@solana/spl-token";
import { createInitializeInstruction as createInitializeMetadataInstruction, pack as packTokenMetadata } from "@solana/spl-token-metadata";
import { createHash } from "node:crypto";
import BN from "bn.js";
import bs58 from "bs58";
import {
  createPlatformConfigIx, launchlabCoder, launchlabPdas, metadataPda, platformLookupAddresses, prepareMigration, programsFor,
  sharedMigrationAccounts, updatePlatformConfigIx, WSOL_MINT,
} from "@launchpad/chain";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURES = join(ROOT, "fixtures");
const KEYS = join(ROOT, ".keys");

/** The devnet SOL GlobalConfig, loaded from fixtures. */
export const SOL_GLOBAL_CONFIG = new PublicKey("7ZR4zD7PYfY2XxoG1Gxcy2EgEeGYrpxrwzPuwdUBssEt");
const SOL_QUOTE_MINT = new PublicKey("So11111111111111111111111111111111111111112");

/** Devnet CPMM config index 0. */
export const CPSWAP_CONFIG = new PublicKey("5MxLgy9oPdTC3YgkiePHqr3EoCRD9uLVYRQS2ANAs7wy");

/**
 * A Token-2022 quote mint with a 1% transfer fee, made on the local chain at bootstrap (there is no fixture: the chain
 * creates it), standing in for the mainnet Quote Assets whose issuers withhold a fee on every transfer (33 of 573; the
 * PreStocks at 3%, reward-style tokens). Its address is derived from a fixed seed, so it is the same on every chain.
 */
export const TAXED_QUOTE_KEYPAIR = Keypair.fromSeed(createHash("sha256").update("launchpad localnet taxed quote mint v1").digest());
export const TAXED_QUOTE_FEE_BPS = 100;
export const TAXED_QUOTE_DECIMALS = 6;

/** The mainnet quote mints cloned into `fixtures/quotes`, one per case the Quote Registry must handle, plus the taxed one made here. */
export const LOCAL_QUOTES = {
  /** SPL Token, 6 decimals, a freeze authority. */
  USDC: new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
  /** Token-2022 tokenized stock, 8 decimals, with the issuer extensions every xStock has (permanent delegate, pausable, transfer hook and more). */
  NVDAx: new PublicKey("Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh"),
  /** SPL Token, 9 decimals, Metaplex metadata. */
  JTO: new PublicKey("jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL"),
  /** Token-2022 pump.fun memecoin, 6 decimals; left without a price, so it can't be launched against. */
  BULLWHALE: new PublicKey("88SpBWrpbQ6MCdukVbtDBwRYYZAkv4KU4PYdG86ipump"),
  /** Token-2022, 6 decimals, a 1% transfer fee withheld by its issuer (the local admin key), priced at 1 USD. */
  TAXQ: TAXED_QUOTE_KEYPAIR.publicKey,
} as const;

/**
 * The local stand-in for Jupiter's token list (Quote Risk Labels, #11, and categories, ADR 0010), for the API's static
 * source: SOL, USDC, NVDAx and JTO verified with deep markets and tagged as Jupiter tags them; TAXQ listed but unverified
 * and thin; BULLWHALE listed only by its `meme` tag, unverified with no liquidity known, on purpose.
 */
export const LOCAL_QUOTE_TOKEN_LIST: Record<string, { verified: boolean; liquidityUsd: number | null; tags: string[] }> = {
  So11111111111111111111111111111111111111112: { verified: true, liquidityUsd: 2_500_000_000, tags: ["verified", "major"] },
  [LOCAL_QUOTES.USDC.toBase58()]: { verified: true, liquidityUsd: 900_000_000, tags: ["verified", "stable"] },
  [LOCAL_QUOTES.NVDAx.toBase58()]: { verified: true, liquidityUsd: 4_000_000, tags: ["verified", "rwa", "stocks", "xstocks"] },
  [LOCAL_QUOTES.JTO.toBase58()]: { verified: true, liquidityUsd: 12_000_000, tags: ["verified", "defi"] },
  [LOCAL_QUOTES.TAXQ.toBase58()]: { verified: false, liquidityUsd: 25_000, tags: [] },
  [LOCAL_QUOTES.BULLWHALE.toBase58()]: { verified: false, liquidityUsd: null, tags: ["meme"] },
};

/** USD prices for the API's static price source on the local chain. BULLWHALE is missing on purpose. */
export const LOCAL_QUOTE_PRICES_USD: Record<string, string> = {
  So11111111111111111111111111111111111111112: "150",
  [LOCAL_QUOTES.USDC.toBase58()]: "1",
  [LOCAL_QUOTES.NVDAx.toBase58()]: "180",
  [LOCAL_QUOTES.JTO.toBase58()]: "2.5",
  [LOCAL_QUOTES.TAXQ.toBase58()]: "1",
};

/**
 * Which Quote Assets the chain quotes: the six cases the tests pin (`fixtures/quotes`, each one case the Quote Registry
 * must handle, plus the taxed one), or mainnet's whole set from the snapshot in `fixtures/mainnet` (`pnpm snapshot`),
 * which is what development runs on so the site shows what it will show on mainnet. The cases are in the mainnet set
 * too, so anything that works on the test chain works on the development chain.
 */
export type QuoteSet = "cases" | "mainnet";

type SnapshotAccount = AccountFixture["account"] & { lamports: number };
type SnapshotQuote = { mint: string; maxShareFeeRate: string; mintAccount: SnapshotAccount; metadataAccount: SnapshotAccount | null };
type Snapshot = { takenAt: string; quotes: SnapshotQuote[]; liquidityUsd: Map<string, number> };

/**
 * What Jupiter said about mainnet's Quote Assets on the day of the snapshot (`fixtures/mainnet/market.json`), in the
 * shapes of its Price API v3 and Tokens API v2, which the Jupiter stand-in in tools/stack serves to the API.
 */
export type MarketSnapshot = {
  takenAt: string;
  prices: Record<string, { usdPrice: number; scaledUiConfig?: { usdPricePrescaled?: number } }>;
  tokens: Record<string, { name: string | null; symbol: string | null; icon: string | null; isVerified: boolean; liquidity: number | null; tags: string[]; launchpad: string | null }>;
};

export function mainnetMarketSnapshot(): MarketSnapshot {
  return JSON.parse(readFileSync(join(FIXTURES, "mainnet", "market.json"), "utf8")) as MarketSnapshot;
}

let snapshot: Snapshot | undefined;

/** The mainnet snapshot, read once: the quotes, and each mint's liquidity from Jupiter's list for choosing the lookup tables' quotes. */
function mainnetSnapshot(): Snapshot {
  if (snapshot) return snapshot;
  const quotes = JSON.parse(readFileSync(join(FIXTURES, "mainnet", "quotes.json"), "utf8")) as { takenAt: string; quotes: SnapshotQuote[] };
  const market = mainnetMarketSnapshot();
  const liquidityUsd = new Map(Object.entries(market.tokens).flatMap(([mint, t]) => (t.liquidity === null ? [] : [[mint, t.liquidity] as const])));
  // Wrapped SOL is every chain's own; the validator makes its mint, and SOL's GlobalConfig is the template below.
  snapshot = { takenAt: quotes.takenAt, quotes: quotes.quotes.filter((q) => q.mint !== SOL_QUOTE_MINT.toBase58()), liquidityUsd };
  return snapshot;
}

/**
 * How many of mainnet's Quote Assets the local lookup tables list beyond the cases: the deepest markets, as mainnet's
 * Platform Lookup Table will list SOL and the busiest Quote Assets (a table holds 256 addresses, a launch needs four
 * per Quote Asset). A coin paired with any other asset still launches; only a launch with a First Buy needs the table.
 */
const LOOKUP_QUOTES_FROM_SNAPSHOT = 40;


/**
 * `migrate` stands in for Raydium's migrate wallet (its crank), the only key allowed to graduate a curve. It is kept
 * apart from our admin so nothing local can lean on a power the platform does not have on a real cluster.
 * `liquidity` stands in for the market: it seeds the pools a buy paid with SOL routes through (`./routes`).
 */
export type LocalnetKeys = { admin: Keypair; operations: Keypair; migrate: Keypair; liquidity: Keypair };

export type LocalnetState = {
  rpcUrl: string;
  launchlab: string;
  platformConfig: string;
  solGlobalConfig: string;
  /** The Platform Lookup Table, which keeps a launch with a first buy within one transaction. */
  lookupTable: string;
  admin: string;
  operationsWallet: string;
  graduationTargetLamports: string;
  /** Which Quote Assets the chain quotes, and how many mints that is, SOL included. */
  quotes: QuoteSet;
  quoteMints: number;
};

/** Local keys persist between runs so addresses stay stable; they are git-ignored and only ever used on the local chain. */
export function localnetKeys(): LocalnetKeys {
  mkdirSync(KEYS, { recursive: true });
  const load = (name: string) => {
    const path = join(KEYS, `${name}.json`);
    if (!existsSync(path)) writeFileSync(path, JSON.stringify(Array.from(Keypair.generate().secretKey)));
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8"))));
  };
  return { admin: load("admin"), operations: load("operations"), migrate: load("migrate"), liquidity: load("liquidity") };
}

// GlobalConfig offsets: discriminator, epoch, curve_type, index and eight u64 fields come before quote_mint,
// then four pubkeys before migrate_to_cpswap_wallet.
const QUOTE_MINT_OFFSET = 8 + 8 + 1 + 2 + 8 * 8;
const MIGRATE_TO_CPSWAP_WALLET_OFFSET = QUOTE_MINT_OFFSET + 32 * 4;
// ...and max_share_fee_rate is the third u64, after migrate_fee and trade_fee_rate.
const MAX_SHARE_FEE_RATE_OFFSET = 8 + 8 + 1 + 2 + 8 * 2;

type AccountFixture = { pubkey: string; account: { data: [string, string]; owner: string; rentEpoch: number } };
const readFixture = (path: string) => JSON.parse(readFileSync(path, "utf8")) as AccountFixture;

/**
 * The local chain's GlobalConfigs, written to `dir` as account files keyed by address.
 * Devnet's SOL GlobalConfig is the template. Raydium's admin creates GlobalConfigs, so for every quote mint of the set
 * the local chain plants a copy of the template at that mint's PDA with only the quote mint changed.
 * Only a GlobalConfig's migrate wallet may migrate a graduated pool, and there is no Raydium crank locally,
 * so every copy names a local stand-in key as its migrate wallet.
 */
function globalConfigFixtures(dir: string, migrateWallet: PublicKey, set: QuoteSet): Map<string, string> {
  const template = readFixture(join(FIXTURES, "accounts", `${SOL_GLOBAL_CONFIG.toBase58()}.json`));
  const decoded = launchlabCoder.accounts.decode("GlobalConfig", Buffer.from(template.account.data[0], "base64")) as {
    quote_mint: PublicKey; migrate_to_cpswap_wallet: PublicKey;
  };
  const program = programsFor("localnet").launchlab;
  // SOL's config allows a 1% share (referral) fee; most mainnet configs, every stock's among them, allow none. On the
  // test chain JTO stands in for those, so tests see both; on the development chain each config allows what mainnet's does.
  const shareFeeRates = new Map(set === "mainnet" ? mainnetSnapshot().quotes.map((q) => [q.mint, BigInt(q.maxShareFeeRate)] as const) : []);
  if (set === "cases") shareFeeRates.set(LOCAL_QUOTES.JTO.toBase58(), 0n);
  const out = new Map<string, string>();
  for (const quoteMint of [decoded.quote_mint, ...localQuoteMints(set)]) {
    const data = Buffer.from(template.account.data[0], "base64");
    patchKey(data, QUOTE_MINT_OFFSET, decoded.quote_mint, quoteMint);
    patchKey(data, MIGRATE_TO_CPSWAP_WALLET_OFFSET, decoded.migrate_to_cpswap_wallet, migrateWallet);
    const shareFeeRate = shareFeeRates.get(quoteMint.toBase58());
    if (shareFeeRate !== undefined) {
      if (data.readBigUInt64LE(MAX_SHARE_FEE_RATE_OFFSET) !== 10_000n) throw new Error("GlobalConfig layout changed; update the offsets");
      data.writeBigUInt64LE(shareFeeRate, MAX_SHARE_FEE_RATE_OFFSET);
    }
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
 * The cloned quote mints, written to `dir`. The cases get `authority` as their mint authority, so tests (and anyone on
 * the development chain) can hand wallets USDC or a stock to trade with (`mintLocalQuote`); both token programs keep
 * it as a COption<Pubkey> at the start of the mint. Mainnet's other mints and their Metaplex metadata accounts are
 * written as they are, authorities included, since the Quote Registry reads an asset's kind from them (ADR 0010); the
 * cases' own fixtures go over the snapshot's copies of them.
 */
function quoteMintFixtures(dir: string, authority: PublicKey, set: QuoteSet): Map<string, string> {
  const out = new Map<string, string>();
  const write = (fixture: AccountFixture, mintable: boolean) => {
    const data = Buffer.from(fixture.account.data[0], "base64");
    if (mintable) {
      data.writeUInt32LE(1, 0);
      authority.toBuffer().copy(data, 4);
    }
    const path = join(dir, `quote_mint_${fixture.pubkey}.json`);
    // As for GlobalConfigs: a JSON round-trip turns rentEpoch u64::MAX into a float the validator rejects.
    writeFileSync(path, JSON.stringify({ ...fixture, account: { ...fixture.account, data: [data.toString("base64"), "base64"], rentEpoch: 0 } }));
    out.set(fixture.pubkey, path);
  };
  if (set === "mainnet") {
    for (const q of mainnetSnapshot().quotes) {
      write({ pubkey: q.mint, account: q.mintAccount }, false);
      if (q.metadataAccount) {
        const address = metadataPda(new PublicKey(q.mint)).toBase58();
        const path = join(dir, `metadata_${address}.json`);
        writeFileSync(path, JSON.stringify({ pubkey: address, account: q.metadataAccount }));
        out.set(address, path);
      }
    }
  }
  for (const f of readdirSync(join(FIXTURES, "quotes")).filter((f) => f.endsWith(".json"))) {
    const fixture = readFixture(join(FIXTURES, "quotes", f));
    if (TOKEN_PROGRAMS.has(fixture.account.owner)) write(fixture, true);
  }
  return out;
}

/** The quote mints cloned from mainnet into `fixtures/quotes`, the cases the tests pin. */
function caseQuoteMints(): PublicKey[] {
  return readdirSync(join(FIXTURES, "quotes"))
    .filter((f) => f.endsWith(".json"))
    .map((f) => readFixture(join(FIXTURES, "quotes", f)))
    .filter((f) => TOKEN_PROGRAMS.has(f.account.owner))
    .map((f) => new PublicKey(f.pubkey));
}

/**
 * Every quote mint on the local chain besides SOL: the set's mints (the cases cloned from mainnet into `fixtures/quotes`,
 * their Metaplex metadata accounts beside them, or mainnet's whole snapshot, which includes them) and the taxed one the
 * chain makes itself.
 */
export function localQuoteMints(set: QuoteSet = "cases"): PublicKey[] {
  const cases = caseQuoteMints();
  if (set === "cases") return [...cases, LOCAL_QUOTES.TAXQ];
  const seen = new Set(cases.map((m) => m.toBase58()));
  const rest = mainnetSnapshot().quotes.filter((q) => !seen.has(q.mint)).map((q) => new PublicKey(q.mint));
  return [...cases, ...rest, LOCAL_QUOTES.TAXQ];
}

/**
 * The quote mints the lookup tables list: all of them on the test chain; on the development chain the cases and the
 * deepest markets of the snapshot, as mainnet's table will list SOL and the busiest Quote Assets.
 */
function lookupQuoteMints(set: QuoteSet): PublicKey[] {
  if (set === "cases") return localQuoteMints(set);
  const cases = new Set(caseQuoteMints().map((m) => m.toBase58()));
  const { quotes, liquidityUsd } = mainnetSnapshot();
  const deepest = quotes
    .filter((q) => !cases.has(q.mint))
    .sort((a, b) => (liquidityUsd.get(b.mint) ?? -1) - (liquidityUsd.get(a.mint) ?? -1))
    .slice(0, LOOKUP_QUOTES_FROM_SNAPSHOT)
    .map((q) => new PublicKey(q.mint));
  return [...caseQuoteMints(), ...deepest, LOCAL_QUOTES.TAXQ];
}

/**
 * Makes the taxed quote mint if the chain doesn't have it yet: a Token-2022 mint whose issuer (the admin key) takes a 1%
 * fee on every transfer, with its name in the mint's own metadata, the admin as mint authority so `mintLocalQuote` works.
 */
async function ensureTaxedQuote(connection: Connection) {
  const { admin } = localnetKeys();
  const mint = TAXED_QUOTE_KEYPAIR;
  if (await connection.getAccountInfo(mint.publicKey, "confirmed")) return;
  const metadata = { mint: mint.publicKey, name: "Taxed Quote", symbol: "TAXQ", uri: "", additionalMetadata: [] as [string, string][] };
  const mintLen = getMintLen([ExtensionType.TransferFeeConfig, ExtensionType.MetadataPointer]);
  const metadataLen = TYPE_SIZE + LENGTH_SIZE + packTokenMetadata(metadata).length;
  const lamports = await connection.getMinimumBalanceForRentExemption(mintLen + metadataLen, "confirmed");
  await sendAndConfirmTransaction(
    connection,
    new Transaction().add(
      SystemProgram.createAccount({ fromPubkey: admin.publicKey, newAccountPubkey: mint.publicKey, space: mintLen, lamports, programId: TOKEN_2022_PROGRAM_ID }),
      createInitializeTransferFeeConfigInstruction(mint.publicKey, admin.publicKey, admin.publicKey, TAXED_QUOTE_FEE_BPS, BigInt("1000000000000000"), TOKEN_2022_PROGRAM_ID),
      createInitializeMetadataPointerInstruction(mint.publicKey, admin.publicKey, mint.publicKey, TOKEN_2022_PROGRAM_ID),
      createInitializeMint2Instruction(mint.publicKey, TAXED_QUOTE_DECIMALS, admin.publicKey, null, TOKEN_2022_PROGRAM_ID),
      createInitializeMetadataInstruction({
        programId: TOKEN_2022_PROGRAM_ID, metadata: mint.publicKey, updateAuthority: admin.publicKey, mint: mint.publicKey, mintAuthority: admin.publicKey,
        name: metadata.name, symbol: metadata.symbol, uri: metadata.uri,
      }),
    ),
    [admin, mint],
    { commitment: "confirmed" },
  );
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

/** Which runtime plays the local chain: `solana-test-validator` when installed, else Surfpool embedded in this process. */
export type LocalnetRuntime = "solana-test-validator" | "surfpool";

function hasTestValidator() {
  return (process.env.PATH ?? "").split(":").some((dir) => dir && existsSync(join(dir, "solana-test-validator")));
}

/** `LOCALNET_RUNTIME` picks the runtime; without it, the validator when it is on PATH, otherwise Surfpool. */
export function localnetRuntime(): LocalnetRuntime {
  const chosen = process.env.LOCALNET_RUNTIME;
  if (chosen === "surfpool" || chosen === "solana-test-validator") return chosen;
  if (chosen) throw new Error(`LOCALNET_RUNTIME must be "solana-test-validator" or "surfpool", not "${chosen}"`);
  return hasTestValidator() ? "solana-test-validator" : "surfpool";
}

/**
 * The account files the chain loads besides programs, by address: the fixtures as they are, and the ones written for
 * this chain into `generated` (the quote mints and GlobalConfigs as patched, and for mainnet's set its hundreds of
 * mints and metadata accounts), which the validator loads as one directory.
 */
function accountFiles(dir: string, set: QuoteSet) {
  const { admin, migrate } = localnetKeys();
  const generated = join(dir, "accounts");
  mkdirSync(generated, { recursive: true });
  const quoteMints = quoteMintFixtures(generated, admin.publicKey, set);
  const files = new Map<string, string>();
  for (const folder of ["accounts", "quotes"]) {
    for (const f of readdirSync(join(FIXTURES, folder))) {
      const address = f.replace(/\.json$/, "");
      if (!f.endsWith(".json") || address === SOL_GLOBAL_CONFIG.toBase58() || quoteMints.has(address)) continue;
      files.set(address, join(FIXTURES, folder, f));
    }
  }
  for (const [address, path] of quoteMints) files.set(address, path);
  for (const [address, path] of globalConfigFixtures(generated, migrate.publicKey, set)) files.set(address, path);
  return { files, generated };
}

export type LocalnetOptions = { rpcPort?: number; quotes?: QuoteSet };

/**
 * Starts a fresh local chain with the Raydium devnet programs and accounts from fixtures: a `solana-test-validator`
 * when one is installed, otherwise Surfpool embedded in this process (see `localnetRuntime`).
 * Without an `rpcPort` the validator takes a free block of ports; with one, it refuses to start if anything already
 * holds them. Surfpool picks its own ports. The chain quotes the six cases unless `quotes` asks for mainnet's set.
 */
export async function startLocalnet(opts: LocalnetOptions = {}): Promise<Localnet> {
  const set = opts.quotes ?? "cases";
  if (localnetRuntime() !== "surfpool") return startTestValidator(set, opts);
  if (opts.rpcPort !== undefined) throw new Error("Surfpool picks its own ports; RPC_PORT and TEST_RPC_PORT only apply to solana-test-validator");
  return startSurfpool(set);
}

/**
 * Surfpool runs the same programs and accounts in-process, for machines without the Solana tool suite (CI, cloud
 * agents). It produces a block every 400 ms, so slots finalize about 13 s after they are confirmed, as on the validator.
 * Surfpool picks its own ports, and web3.js expects the websocket one port above the RPC, so the chain is reached
 * through two forwarded ports that sit side by side.
 */
async function startSurfpool(set: QuoteSet): Promise<Localnet> {
  const { Surfnet } = await import("@solana/surfpool");
  const surfnet = Surfnet.startWithConfig({ offline: true, blockProductionMode: "clock", slotTimeMs: 400 });
  // Keyed by Surfpool's own port, so two chains started side by side never write over each other's account files.
  const dir = join(ROOT, ".ledger", `surfpool-${new URL(surfnet.rpcUrl).port}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const forwards: Server[] = [];
  const stop = async () => {
    for (const f of forwards) await new Promise<void>((resolve) => f.close(() => resolve()));
    surfnet.stop();
    rmSync(dir, { recursive: true, force: true });
  };
  try {
    for (const f of readdirSync(join(FIXTURES, "programs")))
      surfnet.deploy({ programId: f.replace(/\.so$/, ""), soPath: join(FIXTURES, "programs", f) });
    for (const [address, path] of accountFiles(dir, set).files) {
      const fixture = JSON.parse(readFileSync(path, "utf8")) as AccountFixture & { account: { lamports: number } };
      surfnet.setAccount(address, fixture.account.lamports, Uint8Array.from(Buffer.from(fixture.account.data[0], "base64")), fixture.account.owner);
    }
    const rpcPort = await freeRpcPort();
    forwards.push(await forwardPort(rpcPort, Number(new URL(surfnet.rpcUrl).port)));
    forwards.push(await forwardPort(rpcPort + 1, Number(new URL(surfnet.wsUrl).port)));
    const rpcUrl = `http://127.0.0.1:${rpcPort}`;
    const connection = new Connection(rpcUrl, "confirmed");
    const deadline = Date.now() + 30_000;
    while ((await connection.getSlot().catch(() => 0)) < 1) {
      if (Date.now() > deadline) throw new Error("Surfpool did not start producing blocks within 30 s");
      await new Promise((r) => setTimeout(r, 100));
    }
    return { rpcUrl, connection, stop };
  } catch (e) {
    await stop();
    throw e;
  }
}

/** A TCP forward from `port` to `target` on localhost. */
function forwardPort(port: number, target: number) {
  return new Promise<Server>((resolve, reject) => {
    const server = createServer((client) => {
      const upstream = connect(target, "127.0.0.1");
      client.pipe(upstream).pipe(client);
      const drop = () => {
        client.destroy();
        upstream.destroy();
      };
      client.on("error", drop);
      upstream.on("error", drop);
    });
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

async function startTestValidator(set: QuoteSet, opts: { rpcPort?: number }): Promise<Localnet> {
  const rpcPort = opts.rpcPort ?? (await freeRpcPort());
  if (opts.rpcPort !== undefined && !(await portsFree(rpcPort)))
    throw new Error(`port ${rpcPort} or one of the validator ports derived from it is in use; is another local chain running there?`);
  const ports = validatorPorts(rpcPort);
  const dir = join(ROOT, ".ledger", String(rpcPort));
  rmSync(dir, { recursive: true, force: true });
  const ledger = join(dir, "ledger");
  mkdirSync(ledger, { recursive: true });
  const args = [
    "--reset", "--quiet", "--ledger", ledger,
    "--rpc-port", String(rpcPort), "--faucet-port", String(ports.faucet),
    "--gossip-port", String(ports.gossip), "--dynamic-port-range", ports.dynamicRange,
  ];
  for (const f of readdirSync(join(FIXTURES, "programs"))) args.push("--bpf-program", f.replace(/\.so$/, ""), join(FIXTURES, "programs", f));
  // The fixtures one by one, the generated files (hundreds for mainnet's set) as the directory they were written to.
  const { files, generated } = accountFiles(dir, set);
  for (const [address, path] of files) if (!path.startsWith(generated)) args.push("--account", address, path);
  args.push("--account-dir", generated);

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
 * Creates our PlatformConfig with the ADR 0009 fee rates and the operations wallet in every day-to-day role (ADR 0004),
 * turns on curve-rule enforcement and makes the operations wallet the curve rule manager (ADR 0005).
 * The curve rules themselves are written by the API's Quote Registry refresh.
 * Idempotent: an existing PlatformConfig is left as it is.
 */
export async function bootstrapPlatform(connection: Connection, rpcUrl: string, graduationTargetLamports: BN, opts: { quotes?: QuoteSet } = {}): Promise<LocalnetState> {
  const set = opts.quotes ?? "cases";
  const { admin, operations, migrate } = localnetKeys();
  const program = programsFor("localnet").launchlab;
  const platformConfig = launchlabPdas(program).platformConfig(admin.publicKey);
  if (!(await connection.getAccountInfo(platformConfig))) {
    await airdrop(connection, admin.publicKey, 100);
    await airdrop(connection, operations.publicKey, 10);
    // Each migration pays CPMM's 0.15 SOL pool fee plus rent, as Raydium's crank does on real clusters.
    await airdrop(connection, migrate.publicKey, 100);
    await ensureTaxedQuote(connection);
    await send(connection, [
      createPlatformConfigIx(program, admin.publicKey, {
        // 1.00% Platform Fee and no on-chain Creator Fee: the Creator's share is forwarded (ADR 0009).
        feeRate: new BN(10_000),
        creatorFeeRate: new BN(0),
        name: "Stoker (localnet)",
        web: "http://localhost:3000",
        img: "http://localhost:3000/icon.png",
        operationsWallet: operations.publicKey,
        cpswapConfig: CPSWAP_CONFIG,
      }),
      updatePlatformConfigIx(program, admin.publicKey, { PlatformCPCreator: [operations.publicKey] }),
      updatePlatformConfigIx(program, admin.publicKey, { RestrictCurveParam: [new BN(1)] }),
      updatePlatformConfigIx(program, admin.publicKey, { CurveRuleManager: [operations.publicKey] }),
    ], [admin]);
    await createMigrationLookupTable(connection, platformConfig, set);
  }
  // SOL first: a SOL launch with a First Buy only fits a transaction with SOL's accounts in the table.
  const quotes = [WSOL_MINT, ...lookupQuoteMints(set)].map((quoteMint) => ({ quoteMint, globalConfig: launchlabPdas(program).globalConfig(quoteMint) }));
  const lookupTable = await ensureLookupTable(connection, operations, platformLookupAddresses(program, platformConfig, quotes));
  return {
    rpcUrl,
    launchlab: program.toBase58(),
    platformConfig: platformConfig.toBase58(),
    solGlobalConfig: SOL_GLOBAL_CONFIG.toBase58(),
    lookupTable: lookupTable.toBase58(),
    admin: admin.publicKey.toBase58(),
    operationsWallet: operations.publicKey.toBase58(),
    graduationTargetLamports: graduationTargetLamports.toString(),
    quotes: set,
    quoteMints: localQuoteMints(set).length + 1,
  };
}

/**
 * The migrate wallet's address lookup table of the accounts migrations share, for every Quote Asset on the local chain,
 * created with the platform. A migration is too big for a legacy transaction, so it goes out as v0 through this table.
 * The validator only resolves a lookup table for new transactions once its last extension is rooted (about 32 slots,
 * 15 s locally), so the table is made once, up front, rather than per migration.
 */
async function createMigrationLookupTable(connection: Connection, platformConfig: PublicKey, set: QuoteSet) {
  const { migrate } = localnetKeys();
  const programs = programsFor("localnet");
  const shared = new Map<string, PublicKey>();
  for (const quoteMint of [SOL_QUOTE_MINT, ...lookupQuoteMints(set)]) {
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
  const failing = new Map<string, { attempts: number; at: number }>();
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
        // One curve whose migration fails must not hold up the others: it is tried again with a growing wait.
        const retryAt = failing.get(pubkey.toBase58());
        if (retryAt && retryAt.at > Date.now()) continue;
        try {
          const { signature, pool } = await migrateCurve(connection, pubkey);
          failing.delete(pubkey.toBase58());
          opts.log?.(`crank: migrated curve ${pubkey.toBase58()} into pool ${pool.toBase58()} (${signature})`);
        } catch (e) {
          const attempts = (retryAt?.attempts ?? 0) + 1;
          failing.set(pubkey.toBase58(), { attempts, at: Date.now() + Math.min(60_000, 3_000 * 2 ** attempts) });
          opts.log?.(`crank: migrating ${pubkey.toBase58()} failed (attempt ${attempts}): ${(e as Error).message}`);
        }
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

const LOOKUP_EXTEND_BATCH = 20;

/**
 * The Platform Lookup Table, owned by the operations wallet (ADR 0004), holding at least `addresses`: the one this
 * wallet already owns, extended with anything missing, or a new one. Launch transactions use it; it is ours, unlike the
 * migrate wallet's table above, which stands in for Raydium's crank. Returns once every address is usable, which the
 * validator allows once the last extension is rooted.
 */
export async function ensureLookupTable(connection: Connection, authority: Keypair, addresses: PublicKey[]): Promise<PublicKey> {
  const owned = await connection.getProgramAccounts(AddressLookupTableProgram.programId, {
    commitment: "confirmed",
    filters: [{ memcmp: { offset: LOOKUP_TABLE_AUTHORITY_OFFSET, bytes: authority.publicKey.toBase58() } }],
  });
  let table = owned[0]?.pubkey;
  if (!table) {
    const [create, address] = AddressLookupTableProgram.createLookupTable({
      authority: authority.publicKey,
      payer: authority.publicKey,
      recentSlot: await connection.getSlot("finalized"),
    });
    await send(connection, [create], [authority]);
    table = address;
  }
  const current = (await connection.getAddressLookupTable(table, { commitment: "confirmed" })).value;
  const have = new Set(current?.state.addresses.map((a) => a.toBase58()));
  const missing = addresses.filter((a) => !have.has(a.toBase58()));
  for (let i = 0; i < missing.length; i += LOOKUP_EXTEND_BATCH) {
    await send(connection, [
      AddressLookupTableProgram.extendLookupTable({
        authority: authority.publicKey, payer: authority.publicKey, lookupTable: table, addresses: missing.slice(i, i + LOOKUP_EXTEND_BATCH),
      }),
    ], [authority]);
  }
  const extended = (await connection.getAddressLookupTable(table, { commitment: "confirmed" })).value!;
  while ((await connection.getSlot("finalized")) <= Number(extended.state.lastExtendedSlot)) await new Promise((r) => setTimeout(r, 250));
  return table;
}
