// Q4 evidence: who signs migrate_to_cpswap on devnet, and the remaining-account layout it uses.
import { PublicKey } from "@solana/web3.js";
import { writeFileSync } from "fs";
import { join } from "path";
import { devnet, DEV, launchCoder, launchIdlDev, plain, ROOT } from "./common";

const MIGRATE_WALLET = new PublicKey(process.argv[2] ?? "DRayP1Yav394wpS47WQJ5Qm6d95WTQFtGGh54cVQFmhF");
const sigs = await devnet.getSignaturesForAddress(MIGRATE_WALLET, { limit: 200 });
const ixNames = (launchIdlDev as any).instructions.find((i: any) => i.name === "migrate_to_cpswap").accounts.map((a: any) => a.name);
const out: any[] = [];
for (const s of sigs) {
  if (s.err || out.length >= 8) continue;
  const tx = await devnet.getTransaction(s.signature, { maxSupportedTransactionVersion: 0 });
  if (!tx) continue;
  const keys = tx.transaction.message.getAccountKeys({ accountKeysFromLookups: tx.meta?.loadedAddresses }).staticAccountKeys.concat(tx.meta?.loadedAddresses?.writable ?? [], tx.meta?.loadedAddresses?.readonly ?? []);
  for (const ix of tx.transaction.message.compiledInstructions) {
    if (!keys[ix.programIdIndex].equals(DEV.LAUNCHPAD)) continue;
    const dec = launchCoder.instruction.decode(Buffer.from(ix.data));
    if (dec?.name !== "migrate_to_cpswap") continue;
    const accs = ix.accountKeyIndexes.map((i) => keys[i].toBase58());
    const pc = await devnet.getAccountInfo(new PublicKey(accs[3]));
    const p: any = pc ? plain(launchCoder.accounts.decode("PlatformConfig", pc.data)) : null;
    out.push({
      signature: s.signature, blockTime: s.blockTime, signer: keys[0].toBase58(),
      platform: accs[3], platform_scale: p?.platform_scale, creator_scale: p?.creator_scale, burn_scale: p?.burn_scale, platform_cp_creator: p?.platform_cp_creator, platform_nft_wallet: p?.platform_nft_wallet,
      named: Object.fromEntries(ixNames.map((n: string, i: number) => [n, accs[i]])),
      remaining: accs.slice(ixNames.length),
      signers: tx.transaction.message.staticAccountKeys.slice(0, tx.transaction.message.header.numRequiredSignatures).map((k) => k.toBase58()),
      logs: tx.meta?.logMessages?.filter((l) => l.includes("Program log")),
    });
  }
}
writeFileSync(join(ROOT, "out/devnet_migrations_sample.json"), JSON.stringify(out, null, 2));
console.log("recent sigs", sigs.length, "migrations found", out.length);
for (const o of out) console.log(o.signature, new Date(o.blockTime * 1000).toISOString(), "signer", o.signer, "scales", o.platform_scale, o.creator_scale, o.burn_scale, "remaining", o.remaining.length, "cpCreator", o.platform_cp_creator);
