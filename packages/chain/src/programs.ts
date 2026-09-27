import { PublicKey } from "@solana/web3.js";

/** The Raydium programs a cluster uses. The local fork runs the devnet binaries under their devnet ids. */
export type Programs = {
  launchlab: PublicKey;
  cpmm: PublicKey;
  lock: PublicKey;
  /** The account CPMM pays its pool-creation fee to, fixed in the program; a migration must pass it. */
  cpmmCreatePoolFee: PublicKey;
};

export type Cluster = "localnet" | "devnet" | "mainnet";

const DEVNET: Programs = {
  launchlab: new PublicKey("DRay6fNdQ5J82H7xV6uq2aV3mNrUZ1J4PgSKsWgptcm6"),
  cpmm: new PublicKey("DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb"),
  lock: new PublicKey("DRay25Usp3YJAi7beckgpGUC7mGJ2cR1AVPxhYfwVCUX"),
  cpmmCreatePoolFee: new PublicKey("3oE58BKVt8KuYkGxx8zBojugnymWmBiyafWgMrnb6eYy"),
};

const MAINNET: Programs = {
  launchlab: new PublicKey("LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj"),
  cpmm: new PublicKey("CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C"),
  lock: new PublicKey("LockrWmn6K5twhz3y9w1dQERbmgSaRkfnTeTKbpofwE"),
  cpmmCreatePoolFee: new PublicKey("DNXgeM9EiiaAbaWvwjHj9fQQLAX5ZsfHyvmYUNRAdNC8"),
};

export function programsFor(cluster: Cluster): Programs {
  return cluster === "mainnet" ? MAINNET : DEVNET;
}

export const METADATA_PROGRAM = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
export const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
