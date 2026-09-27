// Q4 evidence on real devnet, read-only: simulate migrate_to_cpswap (sigVerify off) against a real devnet pool with
// (a) Raydium's devnet crank wallet as payer and (b) any other funded wallet as payer, and compare the errors.
// Also measure how quickly the crank migrates after a pool completes its curve.
import { Keypair, PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction, ComputeBudgetProgram } from "@solana/web3.js";
import { writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { devnet, DEV, launchCoder, launchIdlDev, ROOT } from "./common";

const sample = JSON.parse(readFileSync(join(ROOT, "out/devnet_migrations_sample.json"), "utf8"));
const names: string[] = (launchIdlDev as any).instructions.find((i: any) => i.name === "migrate_to_cpswap").accounts.map((a: any) => a.name);
const s = sample[0];
const CRANK = new PublicKey(s.signer);
const OTHER = new PublicKey(process.argv[2] ?? "DRaySeEaQ4oFFFZNFfM8vZTZdj6ve6bqBByBg4DuLGdi"); // protocol fee owner: funded, but not the migrate wallet
const results: any[] = [];
for (const payer of [CRANK, OTHER]) {
  const nft = Keypair.generate().publicKey;
  const keys = names.map((n, i) => ({ pubkey: i === 0 ? payer : new PublicKey(s.named[n]), isSigner: i === 0, isWritable: true }));
  const rem = s.remaining.map((r: string, i: number) => ({ pubkey: i === 1 ? nft : new PublicKey(r), isSigner: i === 1, isWritable: true }));
  const ix = new TransactionInstruction({ programId: DEV.LAUNCHPAD, keys: [...keys, ...rem], data: launchCoder.instruction.encode("migrate_to_cpswap", {}) });
  const lutAddr = (await devnet.getTransaction(s.signature, { maxSupportedTransactionVersion: 0 }))!.transaction.message.addressTableLookups.map((l) => l.accountKey);
  const luts = await Promise.all(lutAddr.map(async (a) => (await devnet.getAddressLookupTable(a)).value!));
  const msg = new TransactionMessage({ payerKey: payer, recentBlockhash: (await devnet.getLatestBlockhash()).blockhash, instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }), ix] }).compileToV0Message(luts);
  const sim = await devnet.simulateTransaction(new VersionedTransaction(msg), { sigVerify: false, replaceRecentBlockhash: true });
  const err = sim.value.logs?.filter((l) => /Error|error/.test(l)).slice(0, 2);
  results.push({ payer: payer.toBase58(), isCrank: payer.equals(CRANK), pool: s.named.pool_state, err: sim.value.err, logs: err });
  console.log(payer.equals(CRANK) ? "crank payer" : "other payer", payer.toBase58(), "->", JSON.stringify(err));
}

// Crank latency: time from the pool's last curve trade (status -> 1) to the migration.
const latency: any[] = [];
for (const m of sample) {
  const sigs = await devnet.getSignaturesForAddress(new PublicKey(m.named.pool_state), { limit: 20 });
  const i = sigs.findIndex((x) => x.signature === m.signature);
  const prev = sigs[i + 1];
  if (prev) latency.push({ pool: m.named.pool_state, migration: m.signature, previousTx: prev.signature, seconds: (m.blockTime ?? 0) - (prev.blockTime ?? 0) });
}
console.log("crank latency (s):", latency.map((l) => l.seconds).join(", "));
writeFileSync(join(ROOT, "out/devnet_migrate_permission.json"), JSON.stringify({ simulations: results, crankLatency: latency }, null, 2));
