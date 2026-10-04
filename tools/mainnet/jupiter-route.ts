// Proves the SOL route of a buy paid with SOL against the real Jupiter (runbook, section 9): asks Jupiter's Swap API v2
// for a swap of SOL into a Quote Asset exactly as the API does, and simulates it on mainnet for a wallet that holds SOL.
// Nothing is signed or sent. The local chain has no Jupiter, so this is the only check of that swap before mainnet.
//
//   RPC_URL=<mainnet RPC> pnpm --filter @launchpad/mainnet jupiter-route <taker with SOL> [quote mint] [lamports]
import { PublicKey, Connection, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, unpackAccount } from "@solana/spl-token";
import BN from "bn.js";
import { jupiterSwapIn } from "@launchpad/chain";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export type JupiterRouteCheck = { via: string[]; solIn: string; expectedOut: string; minOut: string; delivered: string; bytes: number; unitsConsumed: number | null };

/** Simulates Jupiter's swap of `lamports` of the taker's SOL into `quoteMint` and reads what would reach the taker's account. */
export async function checkJupiterRoute(connection: Connection, taker: PublicKey, quoteMint: PublicKey, lamports: BN, apiKey?: string): Promise<JupiterRouteCheck> {
  const mint = await connection.getAccountInfo(quoteMint, "confirmed");
  if (!mint) throw new Error(`mint ${quoteMint.toBase58()} does not exist`);
  const j = await jupiterSwapIn({ apiKey }, quoteMint, lamports, taker);
  if (!j) throw new Error(`Jupiter has no route from SOL to ${quoteMint.toBase58()}`);
  const destination = getAssociatedTokenAddressSync(quoteMint, taker, true, mint.owner);
  const tables = await Promise.all(j.swap.lookupTables.map(async (a) => (await connection.getAddressLookupTable(a, { commitment: "confirmed" })).value!));
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  const message = new TransactionMessage({
    payerKey: taker, recentBlockhash: blockhash, instructions: [...j.swap.setup, ...j.swap.swap, ...j.swap.cleanup],
  }).compileToV0Message(tables);
  const tx = new VersionedTransaction(message);
  const held = async () => {
    const info = await connection.getAccountInfo(destination, "confirmed");
    return info ? unpackAccount(destination, info, mint.owner).amount : 0n;
  };
  const before = await held();
  const sim = await connection.simulateTransaction(tx, {
    sigVerify: false, replaceRecentBlockhash: true, commitment: "confirmed", accounts: { encoding: "base64", addresses: [destination.toBase58()] },
  });
  if (sim.value.err) throw new Error(`the swap fails in simulation: ${JSON.stringify(sim.value.err)}\n${(sim.value.logs ?? []).join("\n")}`);
  const post = sim.value.accounts?.[0];
  if (!post) throw new Error("the simulation returned no account for the taker's Quote Asset account");
  const after = unpackAccount(destination, { data: Buffer.from(post.data[0]!, "base64"), owner: new PublicKey(post.owner), lamports: post.lamports, executable: false }, mint.owner).amount;
  const delivered = after - before;
  if (delivered < BigInt(j.minOut.toString())) throw new Error(`the swap delivered ${delivered}, under the ${j.minOut.toString()} it promised`);
  return {
    via: j.via, solIn: j.solIn.toString(), expectedOut: j.expectedOut.toString(), minOut: j.minOut.toString(), delivered: delivered.toString(),
    bytes: tx.serialize().length, unitsConsumed: sim.value.unitsConsumed ?? null,
  };
}

if (process.argv[1] && /jupiter-route\.ts$/.test(process.argv[1])) {
  const [taker, quoteMint = USDC, lamports = "10000000"] = process.argv.slice(2);
  const rpcUrl = process.env.RPC_URL;
  if (!taker || !rpcUrl) {
    console.error("usage: RPC_URL=<mainnet RPC> jupiter-route <taker with SOL> [quote mint] [lamports]");
    process.exit(1);
  }
  console.log(await checkJupiterRoute(new Connection(rpcUrl, "confirmed"), new PublicKey(taker), new PublicKey(quoteMint), new BN(lamports), process.env.JUPITER_API_KEY));
}
