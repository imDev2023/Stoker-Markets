import { Keypair, PublicKey, type Connection } from "@solana/web3.js";
import BN from "bn.js";
import { launchlabPdas, type Cluster } from "@launchpad/chain";
import type { Db } from "@launchpad/db";
import type { ApiKeyContext } from "./apiKeys";
import type { HeliusConfig } from "./helius";
import { jupiterMarket, staticMarket, type QuoteMarket } from "./quotes/pricing";
import { cpmmSolRoutes, jupiterSolRoutes, type SolRoutes } from "./solRoutes";

export type Bindings = {
  CLUSTER: Cluster;
  /** The Worker's own RPC, with its provider key on mainnet; never shown to a browser. */
  RPC_URL: string;
  /**
   * The RPC browsers use to simulate, send and confirm the transactions we build: a public endpoint or a browser key
   * restricted to our domain. Defaults to RPC_URL off mainnet, where there is no key to leak.
   */
  PUBLIC_RPC_URL?: string;
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
  QUOTE_PRICES_USD?: string;
  /**
   * The static price source's token list, for Quote Risk Labels (#11): JSON of `{ "<mint>": { "verified": bool,
   * "liquidityUsd": number } }`; a mint left out is unverified with unknown liquidity. Mainnet reads Jupiter's list.
   */
  QUOTE_TOKEN_LIST?: string;
  /** Optional; without it the free Jupiter host is used, for prices and for SOL routes. */
  JUPITER_API_KEY?: string;
  /**
   * Local only: another host for Jupiter's APIs, the stand-in from `pnpm stand-ins` that answers from the mainnet
   * snapshot the local chain quotes (tools/localnet/fixtures/mainnet). Refused on mainnet.
   */
  JUPITER_API_URL?: string;
  /**
   * Curve rule writes per Quote Registry refresh, most urgent first (default 120): a first run over mainnet's hundreds
   * of Quote Assets completes over a few runs. The local chain sets it high enough for one run.
   */
  QUOTE_RULE_WRITES_MAX?: string;
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
  /** How long after a Graduation is indexed the graduation watch keeps reading the new pool's history for trades the webhook missed. */
  POOL_BACKFILL_SECONDS: string;
  /** The Authorization header value Helius sends with every webhook delivery. */
  HELIUS_WEBHOOK_SECRET: string;
  /**
   * Optional, together: Helius's API key and the id of our raw webhook. With both, the Indexer adds each graduated
   * pool's address to the webhook (`PUT /v0/webhooks/:id`), so its trades keep arriving without anyone editing the
   * webhook by hand; without them nothing is called.
   */
  HELIUS_API_KEY?: string;
  HELIUS_WEBHOOK_ID?: string;
  /** Where Helius's webhook API is; only tests point it at a stand-in. */
  HELIUS_API_URL?: string;
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
  /**
   * What a Creator must be owed in one Quote Asset, worth this many lamports at the Quote Registry's price, before the
   * Creator Forward pays it (ADR 0009); 0.01 SOL unless set.
   */
  CREATOR_FORWARD_MIN_LAMPORTS?: string;
  /** How long before it applies a change to the Reward Round rules must be announced, in seconds (a day on mainnet). */
  REWARD_RULES_LEAD_SECONDS?: string;
  /** The Burn's share of revenue, in basis points; 6000 (60%) unless set. */
  BURN_SHARE_BPS?: string;
  /** The Flywheel's share of revenue, in basis points; 500 (5%) unless set. */
  FLYWHEEL_SHARE_BPS?: string;
  /** How many top Launches the Flywheel buys; 10 unless set. */
  FLYWHEEL_TOP_N?: string;
  /** A buy-and-burn under this many lamports is not worth its network fee and waits; 0.01 SOL unless set. */
  BURN_MIN_SPEND_LAMPORTS?: string;
  /** What a referred curve trade pays its referrer, in basis points, where the Quote Asset allows a share fee; 50 unless set. */
  REFERRAL_SHARE_BPS?: string;
  /** How long before it applies a Platform Fee or Creator Fee change must be announced, in seconds (a day on mainnet). */
  FEE_CHANGE_LEAD_SECONDS?: string;
  /** Requests a minute one IP may make without an API key; 300 unless set. */
  ANON_RATE_LIMIT_PER_MINUTE?: string;
  /** Prepare requests (transactions built for a wallet) a minute one IP may make without an API key; 25 unless set. */
  ANON_PREPARE_RATE_LIMIT_PER_MINUTE?: string;
  /** The PlatformConfig's admin, the cold key that signs fee changes (ADR 0004); PLATFORM_CONFIG is derived from it. */
  PLATFORM_ADMIN: string;
  /**
   * Permanent metadata (#44): ArDrive Turbo's upload and payment services, and the Arweave gateway every coin's on-chain
   * metadata URI is built from. The gateway address is written on-chain at launch and can never change; on mainnet it
   * must be https on a gateway that lasts (`https://arweave.net`). Locally all three point at the stand-in in tools/stack.
   */
  TURBO_UPLOAD_URL?: string;
  TURBO_PAYMENT_URL?: string;
  ARWEAVE_GATEWAY_URL?: string;
  /** SOL sent to Turbo for upload credits each time an upload is refused for want of them; 0.05 SOL unless set. */
  ARWEAVE_TOP_UP_LAMPORTS?: string;
  HYPERDRIVE: Hyperdrive;
  METADATA_BUCKET: R2Bucket;
};

/** The Hono environment every route shares: bindings, plus the per-request database and parsed configuration. */
export type AppEnv = { Bindings: Bindings; Variables: { db: Db; cfg: Config; apiKey?: ApiKeyContext } };

export type Config = {
  cluster: Cluster;
  rpcUrl: string;
  publicRpcUrl: string;
  publicApiUrl: string;
  launchlab: PublicKey;
  cpmm: PublicKey;
  platformConfig: PublicKey;
  platformAdmin: PublicKey;
  lookupTable: PublicKey;
  graduationTargetLamports: BN;
  graduationAlertAfterSeconds: number;
  poolBackfillSeconds: number;
  alertWebhookUrl: string | null;
  helius: HeliusConfig | null;
  mintKeySecret: string;
  lock: PublicKey;
  treasury: PublicKey | null;
  sweepThresholdLamports: bigint;
  sweepFloatLamports: bigint;
  collectMinLamports: bigint;
  creatorForwardMinLamports: bigint;
  rewardRulesLeadSeconds: number;
  burnShareBps: number;
  flywheelShareBps: number;
  flywheelTopN: number;
  burnMinSpendLamports: bigint;
  referralShareBps: number;
  feeChangeLeadSeconds: number;
  anonRateLimitPerMinute: number;
  anonPrepareRateLimitPerMinute: number;
  quoteRuleWritesMax: number;
  solRoute: SolRouteConfig | null;
  arweave: ArweaveConfig;
};

export type ArweaveConfig = {
  turbo: { upload: string; payment: string };
  /** Without a trailing slash; a data item lives at `${gateway}/${id}`. */
  gateway: string;
  topUpLamports: bigint;
};

const TURBO_UPLOAD_URL = "https://upload.ardrive.io";
const TURBO_PAYMENT_URL = "https://payment.ardrive.io";
const ARWEAVE_GATEWAY_URL = "https://arweave.net";
const ARWEAVE_TOP_UP_DEFAULT_LAMPORTS = 50_000_000n;

/**
 * Where coins' permanent metadata goes and is read from. The gateway is part of every coin's on-chain metadata URI, so
 * on mainnet it must be https on a gateway that will outlive us, and the services must be the real ones over https.
 */
function arweaveConfig(env: Bindings): ArweaveConfig {
  const trim = (raw: string) => new URL(raw).toString().replace(/\/$/, "");
  const cfg: ArweaveConfig = {
    turbo: { upload: trim(env.TURBO_UPLOAD_URL || TURBO_UPLOAD_URL), payment: trim(env.TURBO_PAYMENT_URL || TURBO_PAYMENT_URL) },
    gateway: trim(env.ARWEAVE_GATEWAY_URL || ARWEAVE_GATEWAY_URL),
    topUpLamports: env.ARWEAVE_TOP_UP_LAMPORTS ? lamports(env.ARWEAVE_TOP_UP_LAMPORTS, "ARWEAVE_TOP_UP_LAMPORTS") : ARWEAVE_TOP_UP_DEFAULT_LAMPORTS,
  };
  if (env.CLUSTER === "mainnet") {
    for (const [name, url] of [["TURBO_UPLOAD_URL", cfg.turbo.upload], ["TURBO_PAYMENT_URL", cfg.turbo.payment], ["ARWEAVE_GATEWAY_URL", cfg.gateway]] as const)
      if (!url.startsWith("https://") || /^https:\/\/(localhost|127\.|\[|[\d.]+(:|$))/.test(url))
        throw new Error(`${name} must be https on a public host on mainnet (got ${url})`);
  }
  return cfg;
}

function bps(raw: string | undefined, name: string, fallback: number) {
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 10_000) throw new Error(`${name} must be whole basis points from 0 to 10000 (got ${raw})`);
  return n;
}

const REWARD_RULES_LEAD_DEFAULT_SECONDS = 24 * 60 * 60;
const BURN_MIN_SPEND_DEFAULT_LAMPORTS = 10_000_000n;
const CREATOR_FORWARD_MIN_DEFAULT_LAMPORTS = 10_000_000n;
const FEE_CHANGE_LEAD_DEFAULT_SECONDS = 24 * 60 * 60;
/** Curve rule writes per Quote Registry refresh; a first run over mainnet's hundreds of Quote Assets completes over a few runs. */
const QUOTE_RULE_WRITES_DEFAULT = 120;
/** On mainnet a fee change to every live curve is announced at least this long ahead, whatever the setting says. */
const FEE_CHANGE_LEAD_MAINNET_MIN_SECONDS = 60 * 60;

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

/**
 * On mainnet the Worker's RPC carries a provider key, so the browsers' RPC must be its own, without one; anything
 * with a key in its URL would hand that key to every visitor. Elsewhere one RPC serves both.
 */
function publicRpcUrl(env: Bindings) {
  const raw = env.PUBLIC_RPC_URL || env.RPC_URL;
  if (env.CLUSTER !== "mainnet") return raw;
  if (!env.PUBLIC_RPC_URL) throw new Error("PUBLIC_RPC_URL must be set on mainnet, or browsers would be handed the Worker's own RPC URL and its key");
  const url = new URL(raw);
  if (url.protocol !== "https:") throw new Error(`PUBLIC_RPC_URL must be https on mainnet (got ${raw})`);
  if ([...url.searchParams.keys()].some((k) => /key|token|secret/i.test(k)) || /key|token|secret/i.test(url.username + url.password))
    throw new Error("PUBLIC_RPC_URL must not carry a key: browsers see it. Use a public endpoint or a browser key restricted to our domain");
  return raw;
}

/**
 * What only works on the local chain must never reach mainnet: the static prices would write curve rules from made-up
 * numbers, and the local route pools don't exist there.
 */
function refuseLocalOnlySettingsOnMainnet(env: Bindings) {
  if (env.CLUSTER !== "mainnet") return;
  if (env.PRICE_SOURCE !== "jupiter") throw new Error(`PRICE_SOURCE must be "jupiter" on mainnet, not "${env.PRICE_SOURCE}": static prices would set every Graduation Target wrong`);
  if (env.SOL_ROUTE_SOURCE === "raydium-cpmm") throw new Error('SOL_ROUTE_SOURCE "raydium-cpmm" names the local chain\'s pools, which do not exist on mainnet; use "jupiter" or "none"');
  if (!env.RPC_URL.startsWith("https://")) throw new Error(`RPC_URL must be https on mainnet (got ${env.RPC_URL})`);
  if (env.JUPITER_API_URL) throw new Error("JUPITER_API_URL names the local stand-in; on mainnet Jupiter's own host is chosen by the key, so leave it unset");
  if (env.FEE_CHANGE_LEAD_SECONDS && seconds(env.FEE_CHANGE_LEAD_SECONDS, "FEE_CHANGE_LEAD_SECONDS") < FEE_CHANGE_LEAD_MAINNET_MIN_SECONDS)
    throw new Error(`FEE_CHANGE_LEAD_SECONDS must be at least ${FEE_CHANGE_LEAD_MAINNET_MIN_SECONDS} on mainnet: a fee change hits every live curve at once`);
}

/** The rent of a token account, which a sweep may open up to four of for the treasury in one transaction. */
const TOKEN_ACCOUNT_RENT_LAMPORTS = 2_039_280n;
const SWEEP_ACCOUNTS_PER_TRANSACTION = 4n;
const SWEEP_FLOAT_MIN_LAMPORTS = TOKEN_ACCOUNT_RENT_LAMPORTS * SWEEP_ACCOUNTS_PER_TRANSACTION + 2_000_000n;

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
  // A sweep pays the rent of the treasury's new token accounts from what the float leaves; too small a float and the
  // sweep fails every run.
  if (sweepFloatLamports < SWEEP_FLOAT_MIN_LAMPORTS)
    throw new Error(`SWEEP_FLOAT_LAMPORTS must be at least ${SWEEP_FLOAT_MIN_LAMPORTS}, enough for the token accounts a sweep opens`);
  refuseLocalOnlySettingsOnMainnet(env);
  const platformConfig = key("PLATFORM_CONFIG");
  const platformAdmin = key("PLATFORM_ADMIN");
  if (!launchlabPdas(key("LAUNCHLAB_PROGRAM")).platformConfig(platformAdmin).equals(platformConfig))
    throw new Error("PLATFORM_ADMIN is not the admin PLATFORM_CONFIG was created by: the PlatformConfig address derives from its admin");
  return {
    cluster: env.CLUSTER,
    rpcUrl: env.RPC_URL,
    publicRpcUrl: publicRpcUrl(env),
    publicApiUrl: publicApiUrl(env.PUBLIC_API_URL, env.CLUSTER),
    launchlab: key("LAUNCHLAB_PROGRAM"),
    cpmm: key("CPMM_PROGRAM"),
    platformConfig,
    platformAdmin,
    lookupTable: key("PLATFORM_LOOKUP_TABLE"),
    graduationTargetLamports: new BN(env.GRADUATION_TARGET_LAMPORTS),
    graduationAlertAfterSeconds: seconds(env.GRADUATION_ALERT_AFTER_SECONDS, "GRADUATION_ALERT_AFTER_SECONDS"),
    poolBackfillSeconds: seconds(env.POOL_BACKFILL_SECONDS, "POOL_BACKFILL_SECONDS"),
    alertWebhookUrl: env.ALERT_WEBHOOK_URL ? new URL(env.ALERT_WEBHOOK_URL).toString() : null,
    helius: heliusConfig(env),
    mintKeySecret: mintKeySecret(env.MINT_KEY_SECRET),
    lock: key("LOCK_PROGRAM"),
    treasury,
    sweepThresholdLamports,
    sweepFloatLamports,
    collectMinLamports: lamports(env.COLLECT_MIN_LAMPORTS, "COLLECT_MIN_LAMPORTS"),
    creatorForwardMinLamports: env.CREATOR_FORWARD_MIN_LAMPORTS
      ? lamports(env.CREATOR_FORWARD_MIN_LAMPORTS, "CREATOR_FORWARD_MIN_LAMPORTS")
      : CREATOR_FORWARD_MIN_DEFAULT_LAMPORTS,
    rewardRulesLeadSeconds: env.REWARD_RULES_LEAD_SECONDS ? seconds(env.REWARD_RULES_LEAD_SECONDS, "REWARD_RULES_LEAD_SECONDS") : REWARD_RULES_LEAD_DEFAULT_SECONDS,
    burnShareBps: bps(env.BURN_SHARE_BPS, "BURN_SHARE_BPS", 6_000),
    flywheelShareBps: bps(env.FLYWHEEL_SHARE_BPS, "FLYWHEEL_SHARE_BPS", 500),
    flywheelTopN: env.FLYWHEEL_TOP_N ? seconds(env.FLYWHEEL_TOP_N, "FLYWHEEL_TOP_N") : 10,
    burnMinSpendLamports: env.BURN_MIN_SPEND_LAMPORTS ? lamports(env.BURN_MIN_SPEND_LAMPORTS, "BURN_MIN_SPEND_LAMPORTS") : BURN_MIN_SPEND_DEFAULT_LAMPORTS,
    referralShareBps: bps(env.REFERRAL_SHARE_BPS, "REFERRAL_SHARE_BPS", 50),
    anonRateLimitPerMinute: perMinute(env.ANON_RATE_LIMIT_PER_MINUTE, "ANON_RATE_LIMIT_PER_MINUTE", 300),
    anonPrepareRateLimitPerMinute: perMinute(env.ANON_PREPARE_RATE_LIMIT_PER_MINUTE, "ANON_PREPARE_RATE_LIMIT_PER_MINUTE", 25),
    feeChangeLeadSeconds: env.FEE_CHANGE_LEAD_SECONDS ? seconds(env.FEE_CHANGE_LEAD_SECONDS, "FEE_CHANGE_LEAD_SECONDS") : FEE_CHANGE_LEAD_DEFAULT_SECONDS,
    quoteRuleWritesMax: env.QUOTE_RULE_WRITES_MAX ? seconds(env.QUOTE_RULE_WRITES_MAX, "QUOTE_RULE_WRITES_MAX") : QUOTE_RULE_WRITES_DEFAULT,
    solRoute: solRouteConfig(env),
    arweave: arweaveConfig(env),
  };
}

const HELIUS_API_URL = "https://api.helius.xyz";

/** Both secrets or neither: one without the other is a deploy mistake, not a webhook to leave alone. */
function heliusConfig(env: Bindings): HeliusConfig | null {
  const apiKey = env.HELIUS_API_KEY || "";
  const webhookId = env.HELIUS_WEBHOOK_ID || "";
  if (!apiKey && !webhookId) return null;
  if (!apiKey || !webhookId) throw new Error("HELIUS_API_KEY and HELIUS_WEBHOOK_ID go together: set both to keep the webhook's addresses current, or neither");
  return { apiUrl: (env.HELIUS_API_URL || HELIUS_API_URL).replace(/\/$/, ""), apiKey, webhookId };
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
  if (r.source === "jupiter") return jupiterSolRoutes(env.JUPITER_API_KEY || undefined, env.JUPITER_API_URL || undefined);
  return cpmmSolRoutes(connection, cfg.cpmm, r.pools);
}

export function quoteMarket(env: Bindings): QuoteMarket {
  if (env.PRICE_SOURCE === "jupiter") return jupiterMarket(env.JUPITER_API_KEY || undefined, env.JUPITER_API_URL || undefined);
  if (env.PRICE_SOURCE === "static") return staticMarket(env.QUOTE_PRICES_USD ?? "", env.QUOTE_TOKEN_LIST);
  throw new Error(`unknown PRICE_SOURCE: ${env.PRICE_SOURCE}`);
}

export function operationsKey(env: Bindings) {
  if (!env.OPERATIONS_KEY) throw new Error("missing configuration: OPERATIONS_KEY");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(env.OPERATIONS_KEY) as number[]));
}

function perMinute(raw: string | undefined, name: string, fallback: number) {
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${name} must be a whole number of requests above zero (got ${raw})`);
  return n;
}

function seconds(raw: string, name: string) {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${name} must be a whole number of seconds above zero (got ${raw})`);
  return n;
}
