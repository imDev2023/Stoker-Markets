import { Keypair, PublicKey, type Connection } from "@solana/web3.js";
import BN from "bn.js";
import type { Cluster } from "@launchpad/chain";
import type { Db } from "@launchpad/db";
import { jupiterMarket, staticMarket, type QuoteMarket } from "./quotes/pricing";
import { cpmmSolRoutes, jupiterSolRoutes, type SolRoutes } from "./solRoutes";

export type Bindings = {
  CLUSTER: Cluster;
  RPC_URL: string;
  PUBLIC_API_URL: string;
  WEB_ORIGIN: string;
  LAUNCHLAB_PROGRAM: string;
  CPMM_PROGRAM: string;
  PLATFORM_CONFIG: string;
  /** The Platform Lookup Table, owned by the operations wallet; launches with a first buy only fit a transaction with it. */
  PLATFORM_LOOKUP_TABLE: string;
  GRADUATION_TARGET_LAMPORTS: string;
  /** "jupiter" on mainnet; "static" reads QUOTE_PRICES_USD. */
  PRICE_SOURCE: "jupiter" | "static";
  /** JSON object of USD prices by mint, for the static price source. */
  QUOTE_PRICES_USD: string;
  /** Optional; without it the free Jupiter host is used, for prices and for SOL routes. */
  JUPITER_API_KEY?: string;
  /**
   * Where buys paid with SOL get their Quote Asset: "jupiter" on mainnet, "raydium-cpmm" through the pools in
   * SOL_ROUTE_POOLS (the local chain, devnet), or "none" to offer no SOL payment on non-SOL Launches.
   */
  SOL_ROUTE_SOURCE?: "jupiter" | "raydium-cpmm" | "none";
  /**
   * JSON object of the Raydium CPMM pool of SOL against each Quote Asset, by quote mint, for the "raydium-cpmm" source.
   * The pools' accounts belong in the Platform Lookup Table too, or a buy routed through them won't fit a transaction.
   */
  SOL_ROUTE_POOLS?: string;
  /** The operations wallet's secret key as a JSON byte array: it signs curve rule updates as the curve rule manager (ADR 0005). */
  OPERATIONS_KEY: string;
  /** How long a sold-out curve may wait for Raydium's migration before the operator is alerted. */
  GRADUATION_ALERT_AFTER_SECONDS: string;
  /** The Authorization header value Helius sends with every webhook delivery. */
  HELIUS_WEBHOOK_SECRET: string;
  /** Where operator alerts are posted as JSON (a chat webhook, for example); alerts are only recorded and logged without it. */
  ALERT_WEBHOOK_URL?: string;
  /** Bearer token for the operator endpoints; they refuse every request without it. */
  OPERATOR_TOKEN?: string;
  /**
   * Derives each launch's mint key from a nonce stored with its draft, so a retry signs for the same coin address and
   * can never create a second coin. A secret: anyone holding it could sign for the address of a coin not launched yet.
   */
  MINT_KEY_SECRET: string;
  LOCK_PROGRAM: string;
  /**
   * The cold store the Fee Collector sweeps revenue to (ADR 0004): a hardware wallet or a multisig vault, never a key the
   * Worker holds. Required on mainnet; without it elsewhere, revenue stays in the operations wallet.
   */
  TREASURY_WALLET?: string;
  /** The operations wallet's SOL is swept to the treasury once it holds more than this many lamports... */
  SWEEP_THRESHOLD_LAMPORTS: string;
  /** ...down to this many, kept for network fees and rent. */
  SWEEP_FLOAT_LAMPORTS: string;
  /** A fee worth less than this many lamports is left to grow rather than collected at a loss to network fees. */
  COLLECT_MIN_LAMPORTS: string;
  HYPERDRIVE: Hyperdrive;
  METADATA_BUCKET: R2Bucket;
};

/** The Hono environment every route shares: bindings, plus the per-request database and parsed configuration. */
export type AppEnv = { Bindings: Bindings; Variables: { db: Db; cfg: Config } };

export type Config = {
  cluster: Cluster;
  rpcUrl: string;
  publicApiUrl: string;
  launchlab: PublicKey;
  cpmm: PublicKey;
  platformConfig: PublicKey;
  lookupTable: PublicKey;
  graduationTargetLamports: BN;
  graduationAlertAfterSeconds: number;
  alertWebhookUrl: string | null;
  mintKeySecret: string;
  lock: PublicKey;
  treasury: PublicKey | null;
  sweepThresholdLamports: bigint;
  sweepFloatLamports: bigint;
  collectMinLamports: bigint;
  solRoute: SolRouteConfig | null;
};

export type SolRouteConfig = { source: "jupiter" } | { source: "raydium-cpmm"; pools: Map<string, PublicKey> };

const MINT_KEY_SECRET_MIN_LENGTH = 32;

/**
 * Every coin's metadata URL is built from this address and written on-chain at launch, where nobody can change it
 * afterwards (LaunchLab holds the metadata update authority). On mainnet it must be https on a domain we keep for
 * good: a workers.dev, localhost or bare IP address would leave every coin launched through it without its image.
 */
function publicApiUrl(raw: string, cluster: Cluster) {
  const url = new URL(raw);
  const host = url.hostname;
  const temporary =
    url.protocol !== "https:" || host === "localhost" || host.endsWith(".workers.dev") || /^[\d.]+$|^\[/.test(host);
  if (cluster === "mainnet" && temporary)
    throw new Error(`PUBLIC_API_URL must be https on our own permanent domain on mainnet, since coins' metadata URLs can never change (got ${raw})`);
  return raw.replace(/\/$/, "");
}

function mintKeySecret(raw: string | undefined) {
  if (typeof raw !== "string" || raw.length < MINT_KEY_SECRET_MIN_LENGTH)
    throw new Error(`MINT_KEY_SECRET must be a secret of at least ${MINT_KEY_SECRET_MIN_LENGTH} characters`);
  return raw;
}

/** Parses and checks the Worker's configuration once per request, failing loudly on a missing value. */
export function config(env: Bindings): Config {
  const key = (name: keyof Bindings) => {
    const v = env[name];
    if (typeof v !== "string" || v === "") throw new Error(`missing configuration: ${name}`);
    return new PublicKey(v);
  };
  const treasury = env.TREASURY_WALLET ? new PublicKey(env.TREASURY_WALLET) : null;
  if (env.CLUSTER === "mainnet" && !treasury) throw new Error("TREASURY_WALLET must be set on mainnet, or revenue piles up in the hot wallet (ADR 0004)");
  const sweepThresholdLamports = lamports(env.SWEEP_THRESHOLD_LAMPORTS, "SWEEP_THRESHOLD_LAMPORTS");
  const sweepFloatLamports = lamports(env.SWEEP_FLOAT_LAMPORTS, "SWEEP_FLOAT_LAMPORTS");
  if (sweepFloatLamports >= sweepThresholdLamports) throw new Error("SWEEP_FLOAT_LAMPORTS must be below SWEEP_THRESHOLD_LAMPORTS");
  return {
    cluster: env.CLUSTER,
    rpcUrl: env.RPC_URL,
    publicApiUrl: publicApiUrl(env.PUBLIC_API_URL, env.CLUSTER),
    launchlab: key("LAUNCHLAB_PROGRAM"),
    cpmm: key("CPMM_PROGRAM"),
    platformConfig: key("PLATFORM_CONFIG"),
    lookupTable: key("PLATFORM_LOOKUP_TABLE"),
    graduationTargetLamports: new BN(env.GRADUATION_TARGET_LAMPORTS),
    graduationAlertAfterSeconds: seconds(env.GRADUATION_ALERT_AFTER_SECONDS, "GRADUATION_ALERT_AFTER_SECONDS"),
    alertWebhookUrl: env.ALERT_WEBHOOK_URL ? new URL(env.ALERT_WEBHOOK_URL).toString() : null,
    mintKeySecret: mintKeySecret(env.MINT_KEY_SECRET),
    lock: key("LOCK_PROGRAM"),
    treasury,
    sweepThresholdLamports,
    sweepFloatLamports,
    collectMinLamports: lamports(env.COLLECT_MIN_LAMPORTS, "COLLECT_MIN_LAMPORTS"),
    solRoute: solRouteConfig(env),
  };
}

function lamports(raw: string, name: string) {
  if (!/^\d+$/.test(raw ?? "")) throw new Error(`${name} must be a whole number of lamports (got ${raw})`);
  return BigInt(raw);
}

function solRouteConfig(env: Bindings): SolRouteConfig | null {
  const source = env.SOL_ROUTE_SOURCE || "none";
  if (source === "none") return null;
  if (source === "jupiter") return { source };
  if (source === "raydium-cpmm") {
    const pools = Object.entries(JSON.parse(env.SOL_ROUTE_POOLS || "{}") as Record<string, string>);
    if (!pools.length) throw new Error("SOL_ROUTE_SOURCE raydium-cpmm needs SOL_ROUTE_POOLS");
    return { source, pools: new Map(pools.map(([mint, pool]) => [new PublicKey(mint).toBase58(), new PublicKey(pool)])) };
  }
  throw new Error(`unknown SOL_ROUTE_SOURCE: ${String(source)}`);
}

/** The SOL route source for one request, or null when this deployment offers none. */
export function solRoutes(env: Bindings, cfg: Config, connection: Connection): SolRoutes | null {
  const r = cfg.solRoute;
  if (!r) return null;
  if (r.source === "jupiter") return jupiterSolRoutes(env.JUPITER_API_KEY || undefined);
  return cpmmSolRoutes(connection, cfg.cpmm, r.pools);
}

export function quoteMarket(env: Bindings): QuoteMarket {
  if (env.PRICE_SOURCE === "jupiter") return jupiterMarket(env.JUPITER_API_KEY || undefined);
  if (env.PRICE_SOURCE === "static") return staticMarket(env.QUOTE_PRICES_USD);
  throw new Error(`unknown PRICE_SOURCE: ${env.PRICE_SOURCE}`);
}

export function operationsKey(env: Bindings) {
  if (!env.OPERATIONS_KEY) throw new Error("missing configuration: OPERATIONS_KEY");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(env.OPERATIONS_KEY) as number[]));
}

function seconds(raw: string, name: string) {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${name} must be a whole number of seconds above zero (got ${raw})`);
  return n;
}
