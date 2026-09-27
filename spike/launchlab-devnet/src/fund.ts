// Step 0: fund the throwaway wallets. Localnet: airdrop. Devnet: admin (funded by faucet or the owner) pays the others.
import { LAMPORTS_PER_SOL, SystemProgram } from "@solana/web3.js";
import { CLUSTER, conn, key, send, lamports } from "./common";

const admin = key("admin");
const plan: Record<string, number> = { creator: 0.1, trader: 0.45, feewallet: 0.02 };
if (CLUSTER === "localnet") {
  for (const n of ["admin", "creator", "trader", "feewallet"]) {
    const sig = await conn.requestAirdrop(key(n).publicKey, 20 * LAMPORTS_PER_SOL);
    await conn.confirmTransaction(sig, "confirmed");
  }
} else {
  // Admin keeps ~0.03 SOL for the PlatformConfig rent (0.0075), lookup-free fees and ATAs; Raydium's crank pays migration.
  const need = Object.values(plan).reduce((a, b) => a + b, 0) + 0.03;
  const have = (await lamports(admin.publicKey)) / LAMPORTS_PER_SOL;
  const othersHave = (await Promise.all(Object.keys(plan).map((n) => lamports(key(n).publicKey)))).reduce((a, b) => a + b, 0) / LAMPORTS_PER_SOL;
  if (have + othersHave < need) {
    console.error(`Not enough devnet SOL: fund ${admin.publicKey.toBase58()} with at least ${(need - have - othersHave).toFixed(2)} SOL (plan ${need.toFixed(2)} SOL in total), then rerun CLUSTER=devnet ./run.sh`);
    process.exit(2);
  }
  const ixs = [];
  for (const [n, sol] of Object.entries(plan)) {
    const have = await lamports(key(n).publicKey);
    const want = Math.round(sol * LAMPORTS_PER_SOL);
    if (have < want) ixs.push(SystemProgram.transfer({ fromPubkey: admin.publicKey, toPubkey: key(n).publicKey, lamports: want - have }));
  }
  if (ixs.length) await send("fund wallets from admin", ixs, [admin]);
}
for (const n of ["admin", "creator", "trader", "feewallet"]) console.log(n, key(n).publicKey.toBase58(), (await lamports(key(n).publicKey)) / LAMPORTS_PER_SOL, "SOL");
