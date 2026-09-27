// Starts the local chain for development and keeps it running: `pnpm localnet`.
import { mkdirSync, writeFileSync } from "node:fs";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import BN from "bn.js";
import { bootstrapPlatform, startLocalnet } from "./index";

const graduationSol = Number(process.env.GRADUATION_TARGET_SOL ?? 85);
const net = await startLocalnet({ rpcPort: Number(process.env.RPC_PORT ?? 8899) });
const state = await bootstrapPlatform(net.connection, net.rpcUrl, new BN(graduationSol * LAMPORTS_PER_SOL));
const out = new URL("../.ledger/", import.meta.url);
mkdirSync(out, { recursive: true });
writeFileSync(new URL("state.json", out), JSON.stringify(state, null, 2));
console.log(JSON.stringify(state, null, 2));
console.log(`local chain running at ${net.rpcUrl}; Ctrl+C to stop`);
const stop = async () => {
  await net.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
