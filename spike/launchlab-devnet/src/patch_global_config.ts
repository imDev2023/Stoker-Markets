// Localnet only: copy the devnet SOL GlobalConfig and set migrate_to_cpswap_wallet to our admin key,
// so the fork can run migrate_to_cpswap without Raydium's devnet crank key. Writes a solana-test-validator --account JSON.
import { PublicKey } from "@solana/web3.js";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { devnet, launchCoder, key, ROOT } from "./common";

const GLOBAL = new PublicKey(process.argv[2] ?? "7ZR4zD7PYfY2XxoG1Gxcy2EgEeGYrpxrwzPuwdUBssEt");
const acc = (await devnet.getAccountInfo(GLOBAL))!;
const data = Buffer.from(acc.data);
const decoded: any = launchCoder.accounts.decode("GlobalConfig", data);
const off = data.indexOf(decoded.migrate_to_cpswap_wallet.toBuffer(), 8 + 83 + 32 * 3);
if (off !== 8 + 8 + 1 + 2 + 8 * 8 + 32 * 4) throw new Error(`unexpected offset ${off}`);
key("admin").publicKey.toBuffer().copy(data, off);
const after: any = launchCoder.accounts.decode("GlobalConfig", data);
console.log("migrate_to_cpswap_wallet", decoded.migrate_to_cpswap_wallet.toBase58(), "->", after.migrate_to_cpswap_wallet.toBase58(), "at offset", off);
mkdirSync(join(ROOT, ".localnet"), { recursive: true });
writeFileSync(join(ROOT, ".localnet/global_config_patched.json"), JSON.stringify({
  pubkey: GLOBAL.toBase58(),
  account: { lamports: acc.lamports, data: [data.toString("base64"), "base64"], owner: acc.owner.toBase58(), executable: false, rentEpoch: 0, space: data.length },
}));
