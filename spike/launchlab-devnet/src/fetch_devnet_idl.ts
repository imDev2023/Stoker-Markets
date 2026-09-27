// Fetch the Anchor IDL account of the devnet LaunchLab, CPMM and lock programs (if published) and save it.
import { Connection, PublicKey } from "@solana/web3.js";
import { inflateSync } from "zlib";
import { writeFileSync } from "fs";

const conn = new Connection("https://api.devnet.solana.com", "confirmed");
const programs: Record<string, string> = {
  launchlab: "DRay6fNdQ5J82H7xV6uq2aV3mNrUZ1J4PgSKsWgptcm6",
  cpmm: "DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb",
  lock: "DRay25Usp3YJAi7beckgpGUC7mGJ2cR1AVPxhYfwVCUX",
};
for (const [name, id] of Object.entries(programs)) {
  const pid = new PublicKey(id);
  const [base] = PublicKey.findProgramAddressSync([], pid);
  const idlAddr = await PublicKey.createWithSeed(base, "anchor:idl", pid);
  const acc = await conn.getAccountInfo(idlAddr);
  if (!acc) { console.log(name, "no on-chain IDL at", idlAddr.toBase58()); continue; }
  const len = acc.data.readUInt32LE(40);
  const json = inflateSync(acc.data.subarray(44, 44 + len)).toString();
  writeFileSync(`idl/${name}_devnet_onchain.json`, json);
  const idl = JSON.parse(json);
  console.log(name, "IDL", idlAddr.toBase58(), idl.metadata?.name, idl.metadata?.version, "ix:", idl.instructions.length);
}
