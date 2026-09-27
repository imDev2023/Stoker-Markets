// What a client of the platform does: call the public API, sign with a wallet, send to the chain.
import { Connection, Keypair, LAMPORTS_PER_SOL, VersionedTransaction } from "@solana/web3.js";
import { inject } from "vitest";
import { LaunchList, LaunchSummary, PreparedLaunch } from "@launchpad/contract";
import type { RawTransaction } from "@launchpad/chain";

export const env = () => inject("harness");
export const connection = () => new Connection(env().rpcUrl, "confirmed");

/** A valid 1x1 PNG. */
export const PNG = Uint8Array.from(
  Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360f8ffff3f0005fe02fea7d6a9840000000049454e44ae426082", "hex"),
);

export async function fundedWallet(sol = 5) {
  const kp = Keypair.generate();
  const conn = connection();
  const sig = await conn.requestAirdrop(kp.publicKey, sol * LAMPORTS_PER_SOL);
  await conn.confirmTransaction({ signature: sig, ...(await conn.getLatestBlockhash("confirmed")) }, "confirmed");
  return kp;
}

export type LaunchForm = {
  creator: string;
  name?: string;
  symbol?: string;
  description?: string;
  website?: string;
  x?: string;
  telegram?: string;
  image?: { bytes: Uint8Array; type: string } | null;
};

export async function prepare(form: LaunchForm) {
  const body = new FormData();
  const fields = { name: "Tracer", symbol: "TRCR", description: "A tracer bullet", ...form };
  for (const [k, v] of Object.entries(fields)) if (typeof v === "string") body.set(k, v);
  const image = form.image === undefined ? { bytes: PNG, type: "image/png" } : form.image;
  if (image) body.set("image", new Blob([image.bytes], { type: image.type }), "logo.png");
  return fetch(`${env().apiUrl}/v1/launches/prepare`, { method: "POST", body });
}

/** The wallet side: add the Creator's signature to the prepared transaction and send it. */
export async function signAndSend(prepared: PreparedLaunch, signer: Keypair) {
  const tx = VersionedTransaction.deserialize(Buffer.from(prepared.transaction, "base64"));
  tx.sign([signer]);
  const conn = connection();
  const signature = await conn.sendTransaction(tx);
  await conn.confirmTransaction(
    { signature, blockhash: tx.message.recentBlockhash, lastValidBlockHeight: prepared.lastValidBlockHeight },
    "confirmed",
  );
  return signature;
}

export async function launch(creator: Keypair, form: Omit<LaunchForm, "creator"> = {}) {
  const res = await prepare({ creator: creator.publicKey.toBase58(), ...form });
  if (!res.ok) throw new Error(`prepare failed: ${res.status} ${await res.text()}`);
  const prepared = PreparedLaunch.parse(await res.json());
  const signature = await signAndSend(prepared, creator);
  return { prepared, signature };
}

/** The transaction exactly as a Helius raw webhook delivers it (the RPC `getTransaction` JSON encoding). */
export async function rawTransaction(signature: string): Promise<RawTransaction> {
  const res = await fetch(env().rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getTransaction",
      params: [signature, { encoding: "json", commitment: "confirmed", maxSupportedTransactionVersion: 0 }],
    }),
  });
  const body = (await res.json()) as { result: RawTransaction | null };
  if (!body.result) throw new Error(`transaction ${signature} not found`);
  return body.result;
}

export async function deliverWebhook(signatures: string[], authorization = env().webhookSecret) {
  const txs = await Promise.all(signatures.map(rawTransaction));
  return fetch(`${env().apiUrl}/v1/webhooks/helius`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization },
    body: JSON.stringify(txs),
  });
}

export async function listLaunches() {
  const res = await fetch(`${env().apiUrl}/v1/launches`);
  return LaunchList.parse(await res.json()).launches;
}

export async function getLaunch(mint: string) {
  const res = await fetch(`${env().apiUrl}/v1/launches/${mint}`);
  return { status: res.status, launch: res.ok ? LaunchSummary.parse(await res.json()) : null };
}
