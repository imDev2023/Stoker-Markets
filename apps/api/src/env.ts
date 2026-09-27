import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import type { Cluster } from "@launchpad/chain";

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

export type Config = {
  cluster: Cluster;
  rpcUrl: string;
  publicApiUrl: string;
  launchlab: PublicKey;
  platformConfig: PublicKey;
  solGlobalConfig: PublicKey;
  graduationTargetLamports: BN;
};

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
    publicApiUrl: env.PUBLIC_API_URL.replace(/\/$/, ""),
    launchlab: key("LAUNCHLAB_PROGRAM"),
    platformConfig: key("PLATFORM_CONFIG"),
    solGlobalConfig: key("SOL_GLOBAL_CONFIG"),
    graduationTargetLamports: new BN(env.GRADUATION_TARGET_LAMPORTS),
  };
}
