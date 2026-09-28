// Starts the local chain for development and keeps it running: `pnpm localnet`.
// Like Raydium's crank on devnet, it migrates our sold-out curves within seconds; `CRANK=off` leaves them graduating.
import { mkdirSync, writeFileSync } from "node:fs";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { bootstrapPlatform, startCrank, startLocalnet } from "./index";
import { createSolRoutes } from "./routes";

const graduationSol = Number(process.env.GRADUATION_TARGET_SOL ?? 85);
const net = await startLocalnet({ rpcPort: Number(process.env.RPC_PORT ?? 8899) });
const platform = await bootstrapPlatform(net.connection, net.rpcUrl, new BN(graduationSol * LAMPORTS_PER_SOL));
// Pools to route buys paid with SOL through, added to the Platform Lookup Table.
const { ready, ...solRoutes } = await createSolRoutes(net.connection);
await ready;
const state = { ...platform, solRoutes };
const out = new URL("../.ledger/", import.meta.url);
mkdirSync(out, { recursive: true });
writeFileSync(new URL("state.json", out), JSON.stringify(state, null, 2));
console.log(JSON.stringify(state, null, 2));
const stopCrank =
  process.env.CRANK === "off" ? () => undefined : startCrank(net.connection, new PublicKey(state.platformConfig), { log: console.log });
console.log(`local chain running at ${net.rpcUrl}${process.env.CRANK === "off" ? " without a crank" : " with a migration crank"}; Ctrl+C to stop`);
const stop = async () => {
  stopCrank();
  await net.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
