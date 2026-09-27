import { Keypair, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import type { Cluster } from "@launchpad/chain";
import type { Db } from "@launchpad/db";
import { jupiterMarket, staticMarket, type QuoteMarket } from "./quotes/pricing";

export type Bindings = {
  CLUSTER: Cluster;
  RPC_URL: string;
  PUBLIC_API_URL: string;
  WEB_ORIGIN: string;
  LAUNCHLAB_PROGRAM: string;
  CPMM_PROGRAM: string;
  PLATFORM_CONFIG: string;
  GRADUATION_TARGET_LAMPORTS: string;
  /** "jupiter" on mainnet; "static" reads QUOTE_PRICES_USD. */
  PRICE_SOURCE: "jupiter" | "static";
  /** JSON object of USD prices by mint, for the static price source. */
  QUOTE_PRICES_USD: string;
  /** Optional; without it the free Jupiter host is used. */
  JUPITER_API_KEY?: string;
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
  graduationTargetLamports: BN;
  graduationAlertAfterSeconds: number;
  alertWebhookUrl: string | null;
};

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

/** Parses and checks the Worker's configuration once per request, failing loudly on a missing value. */
export function config(env: Bindings): Config {
  const key = (name: keyof Bindings) => {
    const v = env[name];
    if (typeof v !== "string" || v === "") throw new Error(`missing configuration: ${name}`);
    return new PublicKey(v);
  };
  return {
    cluster: env.CLUSTER,
    rpcUrl: env.RPC_URL,
    publicApiUrl: publicApiUrl(env.PUBLIC_API_URL, env.CLUSTER),
    launchlab: key("LAUNCHLAB_PROGRAM"),
    cpmm: key("CPMM_PROGRAM"),
    platformConfig: key("PLATFORM_CONFIG"),
    graduationTargetLamports: new BN(env.GRADUATION_TARGET_LAMPORTS),
    graduationAlertAfterSeconds: seconds(env.GRADUATION_ALERT_AFTER_SECONDS, "GRADUATION_ALERT_AFTER_SECONDS"),
    alertWebhookUrl: env.ALERT_WEBHOOK_URL ? new URL(env.ALERT_WEBHOOK_URL).toString() : null,
  };
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
