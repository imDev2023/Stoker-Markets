// `pnpm arweave-stand-in`: the Turbo and gateway stand-in for local development, on the port apps/api/wrangler.jsonc
// names, against the local chain from `pnpm localnet`.
import { startTurboStandIn } from "./turbo";

const port = Number(process.env.PORT ?? 8797);
const rpcUrl = process.env.RPC_URL ?? "http://127.0.0.1:8899";
const standIn = await startTurboStandIn({ rpcUrl, port });
console.log(`Turbo stand-in on ${standIn.url} (deposit address ${standIn.depositAddress}, chain ${rpcUrl})`);
const stop = () => void standIn.stop().then(() => process.exit(0));
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
