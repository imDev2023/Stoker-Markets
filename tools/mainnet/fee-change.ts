// A Platform Fee or Creator Fee change through the fee-change flow (#22, ADR 0004): announces it through the API as the
// operator, and once it is due has the API prepare the `update_platform_config` transaction and signs and sends it with
// the admin keypair, where the admin is a file keypair (the devnet rehearsal, the local chain). On mainnet only
// `announce` is for this script: the cold device signs what `POST /v1/operator/fees/prepare` hands it.
// Read-only on secrets: the operator token and the keypair are read from files and never printed.
//
//   pnpm --filter @launchpad/mainnet fee-change announce --api https://... --token-file operator.token \
//     --platform-fee-bps 100 --creator-fee-bps 0 --effective-at 2026-10-10T12:00:00Z [--note "..."]
//   pnpm --filter @launchpad/mainnet fee-change apply --api https://... --token-file operator.token --rpc <url> \
//     --id <announcement id> --sign admin.json
import { readFileSync } from "node:fs";
import { Connection, Keypair, Transaction } from "@solana/web3.js";
import { flags, keypairArg } from "./platform-config";

export type FeeChangeApi = { url: string; token: string };

export type Announced = { id: string; platformFeeBps: number; creatorFeeBps: number; announcedAt: string; effectiveAt: string };

async function post<T>(api: FeeChangeApi, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${api.url}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${api.token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} answered ${res.status}: ${text}`);
  return JSON.parse(text) as T;
}

/** Announces the change; the API refuses one due sooner than its lead time. */
export async function announceFeeChange(api: FeeChangeApi, change: { platformFeeBps: number; creatorFeeBps: number; effectiveAt: Date; note?: string }) {
  return post<Announced>(api, "/v1/operator/fees/announce", {
    platformFeeBps: change.platformFeeBps, creatorFeeBps: change.creatorFeeBps, effectiveAt: change.effectiveAt.toISOString(), ...(change.note ? { note: change.note } : {}),
  });
}

/**
 * Has the API prepare the announced change, which it only does once the change is due, signs it with the admin keypair
 * and sends it; returns the signature once it is confirmed. The Indexer marks the announcement applied when it sees it.
 */
export async function applyFeeChange(api: FeeChangeApi, connection: Connection, id: string, admin: Keypair) {
  const prepared = await post<{ admin: string; transaction: string; lastValidBlockHeight: number }>(api, "/v1/operator/fees/prepare", { id });
  if (prepared.admin !== admin.publicKey.toBase58()) throw new Error(`the change is for admin ${prepared.admin}, not the keypair given (${admin.publicKey.toBase58()})`);
  const tx = Transaction.from(Buffer.from(prepared.transaction, "base64"));
  tx.sign(admin);
  const signature = await connection.sendRawTransaction(tx.serialize());
  const result = await connection.confirmTransaction({ signature, blockhash: tx.recentBlockhash!, lastValidBlockHeight: prepared.lastValidBlockHeight }, "confirmed");
  if (result.value.err) throw new Error(`the fee change transaction ${signature} failed: ${JSON.stringify(result.value.err)}`);
  return signature;
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const f = flags(rest);
  const need = (name: string) => {
    const v = f.get(name);
    if (!v) throw new Error(`--${name} is required`);
    return v;
  };
  const api: FeeChangeApi = { url: need("api").replace(/\/$/, ""), token: readFileSync(need("token-file"), "utf8").trim() };
  if (command === "announce") {
    const effectiveAt = new Date(need("effective-at"));
    if (Number.isNaN(effectiveAt.getTime())) throw new Error("--effective-at must be a date, such as 2026-10-10T12:00:00Z");
    const a = await announceFeeChange(api, {
      platformFeeBps: Number(need("platform-fee-bps")), creatorFeeBps: Number(need("creator-fee-bps")), effectiveAt, note: f.get("note"),
    });
    console.log(`Announced ${a.id}: Platform Fee ${a.platformFeeBps / 100}%, Creator Fee ${a.creatorFeeBps / 100}% from ${a.effectiveAt}.`);
    console.log(`Once it is due: fee-change apply --api ${api.url} --token-file ... --rpc <url> --id ${a.id} --sign admin.json`);
    return;
  }
  if (command === "apply") {
    const signature = await applyFeeChange(api, new Connection(need("rpc"), "confirmed"), need("id"), keypairArg(need("sign")));
    console.log(`Sent and confirmed: ${signature}`);
    return;
  }
  throw new Error("usage: fee-change announce|apply --api <url> --token-file <path> ...");
}

if (process.argv[1] && /fee-change\.ts$/.test(process.argv[1])) {
  // web3.js keeps its websocket open after a confirmation, so the process would never exit on its own (the devnet
  // fee-change apply of 2026-10-15 hung after "Sent and confirmed").
  main()
    .then(() => process.exit(process.exitCode ?? 0))
    .catch((e: Error) => {
      console.error(e.message);
      process.exit(1);
    });
}
