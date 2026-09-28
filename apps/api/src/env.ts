import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import type { Cluster } from "@launchpad/chain";
import type { Db } from "@launchpad/db";

export type Bindings = {
  CLUSTER: Cluster;
  RPC_URL: string;
  PUBLIC_API_URL: string;
  WEB_ORIGIN: string;
  LAUNCHLAB_PROGRAM: string;
  PLATFORM_CONFIG: string;
  SOL_GLOBAL_CONFIG: string;
  GRADUATION_TARGET_LAMPORTS: string;
  /** The Authorization header value Helius sends with every webhook delivery. */
  HELIUS_WEBHOOK_SECRET: string;
  HYPERDRIVE: Hyperdrive;
  METADATA_BUCKET: R2Bucket;
};

/** The Hono environment every `/v1` route runs in: bindings plus the per-request database and parsed configuration. */
export type AppEnv = { Bindings: Bindings; Variables: { db: Db; cfg: Config } };

export type Config = {
  cluster: Cluster;
  rpcUrl: string;
  publicApiUrl: string;
  launchlab: PublicKey;
  platformConfig: PublicKey;
  solGlobalConfig: PublicKey;
  graduationTargetLamports: BN;
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
    platformConfig: key("PLATFORM_CONFIG"),
    solGlobalConfig: key("SOL_GLOBAL_CONFIG"),
    graduationTargetLamports: new BN(env.GRADUATION_TARGET_LAMPORTS),
  };
}
