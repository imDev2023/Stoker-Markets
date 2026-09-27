// Shared setup: connections, keypairs, program ids, Anchor coders.
import { AddressLookupTableProgram, ComputeBudgetProgram, Connection, Keypair, PublicKey, Transaction, TransactionInstruction, TransactionMessage, VersionedTransaction, type AddressLookupTableAccount } from "@solana/web3.js";
import { BorshCoder, type Idl } from "@coral-xyz/anchor";
import { readFileSync, existsSync, writeFileSync, mkdirSync, appendFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv(): Record<string, string> {
  const p = join(ROOT, "../../.env");
  const out: Record<string, string> = {};
  if (!existsSync(p)) return out;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}
export const ENV = loadEnv();

export const DEVNET_RPC = process.env.DEVNET_RPC ?? "https://api.devnet.solana.com";
// CLUSTER=localnet (default, a solana-test-validator fork of devnet started by ./localnet.sh) or CLUSTER=devnet.
export const CLUSTER = (process.env.CLUSTER ?? "localnet") as "localnet" | "devnet";
export const RPC = CLUSTER === "devnet" ? DEVNET_RPC : "http://127.0.0.1:8899";
export const conn = new Connection(RPC, "confirmed");
export const HELIUS_MAINNET = `https://mainnet.helius-rpc.com/?api-key=${ENV.HELIUS_API_KEY}`;
export const HELIUS_DEVNET = `https://devnet.helius-rpc.com/?api-key=${ENV.HELIUS_API_KEY}`;
export const devnet = new Connection(DEVNET_RPC, "confirmed");

// Devnet program ids, from raydium-sdk-v2 src/common/programId.ts DEVNET_PROGRAM_ID.
export const DEV = {
  LAUNCHPAD: new PublicKey("DRay6fNdQ5J82H7xV6uq2aV3mNrUZ1J4PgSKsWgptcm6"),
  CPMM: new PublicKey("DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb"),
  CPMM_AUTH: new PublicKey("CXniRufdq5xL8t8jZAPxsPZDpuudwuJSPWnbcD5Y5Nxq"),
  CPMM_FEE_ACC: new PublicKey("3oE58BKVt8KuYkGxx8zBojugnymWmBiyafWgMrnb6eYy"),
  LOCK: new PublicKey("DRay25Usp3YJAi7beckgpGUC7mGJ2cR1AVPxhYfwVCUX"),
  LOCK_AUTH: new PublicKey("7qWVV8UY2bRJfDLP4s37YzBPKUkVB46DStYJBpYbQzu3"),
};
export const MAINNET_LAUNCHPAD = new PublicKey("LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj");
export const WSOL = new PublicKey("So11111111111111111111111111111111111111112");

const readIdl = (f: string) => JSON.parse(readFileSync(join(ROOT, "idl", f), "utf8")) as Idl;
export const launchIdlDev = readIdl("launchlab_devnet_onchain.json");
export const launchIdlMain = readIdl("launchlab_mainnet.json");
export const launchCoder = new BorshCoder(launchIdlDev);
export const cpmmCoder = new BorshCoder(readIdl("cpmm.json"));

export function key(name: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(join(ROOT, ".keys", `${name}.json`), "utf8"))));
}

export const disc = (idl: Idl, account: string) => Buffer.from(idl.accounts!.find((a) => a.name === account)!.discriminator);

// Convert BN / PublicKey / nested objects into JSON-friendly values.
export function plain(v: any): any {
  if (v === null || v === undefined) return v;
  if (v instanceof PublicKey) return v.toBase58();
  if (typeof v === "object" && typeof v.toString === "function" && v.constructor?.name === "BN") return v.toString();
  if (Array.isArray(v)) return v.every((x) => typeof x === "number") && v.length > 16 ? `[${v.length} bytes]` : v.map(plain);
  if (typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]));
  return v;
}

export const explorer = (sig: string) =>
  CLUSTER === "devnet" ? `https://explorer.solana.com/tx/${sig}?cluster=devnet` : `localnet:${sig}`;

// Per-cluster run state (addresses created by earlier steps) and a signature log.
const statePath = () => join(ROOT, "out", CLUSTER, "state.json");
export function loadState(): Record<string, any> {
  return existsSync(statePath()) ? JSON.parse(readFileSync(statePath(), "utf8")) : {};
}
export function saveState(patch: Record<string, any>) {
  mkdirSync(join(ROOT, "out", CLUSTER), { recursive: true });
  const next = { ...loadState(), ...patch };
  writeFileSync(statePath(), JSON.stringify(next, null, 2));
  return next;
}
export function logEvidence(step: string, data: Record<string, any>) {
  mkdirSync(join(ROOT, "out", CLUSTER), { recursive: true });
  const p = join(ROOT, "out", CLUSTER, "evidence.jsonl");
  appendFileSync(p, JSON.stringify({ at: new Date().toISOString(), step, ...plain(data) }) + "\n");
}

// Create an address lookup table holding the non-signer accounts of `ixs` (for transactions over the 1232-byte limit).
export async function makeLookupTable(payer: Keypair, ixs: TransactionInstruction[]): Promise<AddressLookupTableAccount> {
  const addrs = [...new Set(ixs.flatMap((ix) => [ix.programId, ...ix.keys.filter((k) => !k.isSigner).map((k) => k.pubkey)]).map((p) => p.toBase58()))].map((s) => new PublicKey(s));
  const slot = await conn.getSlot("finalized");
  const [create, table] = AddressLookupTableProgram.createLookupTable({ authority: payer.publicKey, payer: payer.publicKey, recentSlot: slot });
  await send("create address lookup table", [create], [payer]);
  for (let i = 0; i < addrs.length; i += 25)
    await send("extend address lookup table", [AddressLookupTableProgram.extendLookupTable({ lookupTable: table, authority: payer.publicKey, payer: payer.publicKey, addresses: addrs.slice(i, i + 25) })], [payer]);
  const start = await conn.getSlot("confirmed");
  while ((await conn.getSlot("confirmed")) <= start + 1) await new Promise((r) => setTimeout(r, 400));
  return (await conn.getAddressLookupTable(table, { commitment: "confirmed" })).value!;
}

type SendOpts = { cu?: number; expectFail?: boolean; lut?: AddressLookupTableAccount };
// Sends and confirms; returns the signature. With expectFail, a failure is logged as evidence and null is returned.
export async function send(label: string, ixs: TransactionInstruction[], signers: Keypair[], opts?: SendOpts & { expectFail?: false }): Promise<string>;
export async function send(label: string, ixs: TransactionInstruction[], signers: Keypair[], opts: SendOpts & { expectFail: true }): Promise<string | null>;
export async function send(label: string, ixs: TransactionInstruction[], signers: Keypair[], opts: SendOpts = {}): Promise<string | null> {
  const all = [ComputeBudgetProgram.setComputeUnitLimit({ units: opts.cu ?? 400_000 }), ...ixs];
  const blockhash = (await conn.getLatestBlockhash()).blockhash;
  let raw: Uint8Array;
  if (opts.lut) {
    const msg = new TransactionMessage({ payerKey: signers[0].publicKey, recentBlockhash: blockhash, instructions: all }).compileToV0Message([opts.lut]);
    const vtx = new VersionedTransaction(msg);
    vtx.sign(signers);
    raw = vtx.serialize();
  } else {
    const tx = new Transaction().add(...all);
    tx.feePayer = signers[0].publicKey;
    tx.recentBlockhash = blockhash;
    tx.sign(...signers);
    raw = tx.serialize();
  }
  try {
    const sig = await conn.sendRawTransaction(raw, { skipPreflight: false });
    await conn.confirmTransaction(sig, "confirmed");
    const t = await conn.getTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    if (t?.meta?.err) throw Object.assign(new Error(`tx failed ${JSON.stringify(t.meta.err)}`), { logs: t.meta.logMessages, sig });
    console.log(`OK   ${label}: ${explorer(sig)}`);
    logEvidence(label, { sig, url: explorer(sig) });
    return sig;
  } catch (e: any) {
    const logs: string[] = e.logs ?? e.transactionLogs ?? (typeof e.getLogs === "function" ? await e.getLogs(conn).catch(() => []) : []);
    const errLine = logs.filter((l) => /Error|error|failed|AnchorError/.test(l)).slice(-3).join(" | ");
    if (opts.expectFail) {
      console.log(`FAIL (expected) ${label}: ${errLine || e.message}`);
      logEvidence(label + " (expected failure)", { error: errLine || e.message });
      return null;
    }
    console.error(`FAIL ${label}: ${e.message}\n${logs.join("\n")}`);
    throw e;
  }
}

export async function lamports(pk: PublicKey) {
  return conn.getBalance(pk, "confirmed");
}
export async function tokenBal(ata: PublicKey): Promise<bigint> {
  const a = await conn.getTokenAccountBalance(ata, "confirmed").catch(() => null);
  return a ? BigInt(a.value.amount) : 0n;
}
