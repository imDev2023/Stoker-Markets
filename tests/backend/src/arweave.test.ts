// Permanent metadata (#44): a launched coin's image and metadata JSON reach Arweave through ArDrive Turbo (the stand-in
// in tools/stack here), the on-chain URI resolves there, nothing is uploaded for a launch that never lands, a retry
// never uploads twice, and what an upload costs is paid in SOL from the operations wallet and written to the Ledger.
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { PublicKey } from "@solana/web3.js";
import { JobRunList, LedgerPage, OperatorOverview, PreparedLaunch, type LedgerEntry } from "@launchpad/contract";
import { connection, deliverWebhook, env, fundedWallet, launch, PNG, prepare, signAndSend } from "./client";

const WSOL = "So11111111111111111111111111111111111111112";
/** The stand-in's prices, as Turbo's on 2026-10-03 (tools/stack/src/turbo.ts). */
const WINC_PER_BYTE = 12_500n;
const WINC_PER_SOL = 17_900_000_000_000n;
const FREE_LIMIT_BYTES = 107_520;

type HeldItem = { id: string; owner: string; bytes: number; contentType: string; winc: string; uploads: number };
const heldItems = async () => (await (await fetch(`${env().turbo.url}/stand-in/items`)).json()) as HeldItem[];
const idOf = (uri: string) => uri.slice(env().turbo.url.length + 1);

/** The gateway answers 404 until the Metadata Upload job, run right after a launch is indexed, has posted the item. */
async function resolved(uri: string) {
  await expect.poll(async () => (await fetch(uri)).status, { timeout: 30_000 }).toBe(200);
  return fetch(uri);
}

async function ledger(kind: string) {
  const entries: LedgerEntry[] = [];
  let before: string | null = null;
  do {
    const params = new URLSearchParams({ limit: "100", kind, ...(before ? { before } : {}) });
    const page = LedgerPage.parse(await (await fetch(`${env().apiUrl}/v1/ledger?${params}`)).json());
    entries.push(...page.entries);
    before = page.next;
  } while (before);
  return entries;
}

const operator = () => ({ headers: { authorization: `Bearer ${env().operatorToken}` } });

async function runUpload() {
  const res = await fetch(`${env().apiUrl}/v1/operator/jobs/metadata-upload`, { method: "POST", ...operator() });
  expect(res.status).toBe(200);
  return (await res.json()) as { status: string; summary: { uploaded: unknown[]; topUps: unknown[]; pending: number; balanceWinc: string } };
}

async function overview() {
  return OperatorOverview.parse(await (await fetch(`${env().apiUrl}/v1/operator/overview`, operator())).json());
}

describe("permanent metadata on Arweave", () => {
  it("puts a launched coin's image and metadata on Arweave, where the on-chain URI resolves, once the launch has landed", async () => {
    const creator = await fundedWallet();
    const before = await overview();
    const res = await prepare({ creator: creator.publicKey.toBase58(), name: "Permanent", symbol: "PERM", description: "Kept for good", website: "https://example.com", exact: true });
    expect(res.status).toBe(200);
    const prepared = PreparedLaunch.parse(await res.json());
    // The launch transaction names the Arweave address, and nothing is uploaded until the launch lands.
    expect(prepared.metadataUri.startsWith(`${env().turbo.url}/`)).toBe(true);
    expect((await fetch(prepared.metadataUri)).status).toBe(404);
    expect((await heldItems()).map((i) => i.id)).not.toContain(idOf(prepared.metadataUri));

    // A retry keeps the same address: the items were signed once, when the launch was first prepared.
    const retry = await fetch(`${env().apiUrl}/v1/launches/${prepared.mint}/prepare`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect(retry.status).toBe(200);
    expect(PreparedLaunch.parse(await retry.json()).metadataUri).toBe(prepared.metadataUri);

    const signature = await signAndSend(prepared, creator);
    expect(await (await deliverWebhook([signature])).json()).toMatchObject({ launched: 1 });

    // Uploaded right after indexing: the document on Arweave, its image on Arweave too, both as the API serves them.
    const document = (await (await resolved(prepared.metadataUri)).json()) as { name: string; symbol: string; image: string };
    expect(document).toMatchObject({ name: "Permanent", symbol: "PERM", description: "Kept for good", external_url: "https://example.com" });
    expect(document.image.startsWith(`${env().turbo.url}/`)).toBe(true);
    const image = await resolved(document.image);
    expect(image.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await image.arrayBuffer())).toEqual(PNG);
    expect(await (await fetch(`${env().apiUrl}/metadata/${prepared.mint}.json`)).json()).toEqual(document);

    // Small items are free, and running the job again uploads nothing twice.
    const held = (await heldItems()).filter((i) => [idOf(prepared.metadataUri), idOf(document.image)].includes(i.id));
    expect(held).toHaveLength(2);
    expect(held.every((i) => i.winc === "0" && i.uploads === 1)).toBe(true);
    const again = await runUpload();
    expect(again.summary.uploaded).toEqual([]);
    expect((await heldItems()).filter((i) => i.id === idOf(prepared.metadataUri))[0]!.uploads).toBe(1);

    const after = await overview();
    expect(after.metadataUploads.uploaded).toBeGreaterThanOrEqual(before.metadataUploads.uploaded + 1);
    expect(after.metadataUploads.pending).toBe(0);
  });

  it("pays for a large image with SOL from the operations wallet, each step on the Ledger", async () => {
    const creator = await fundedWallet();
    // A real PNG header followed by enough bytes to cost credits: the API checks the first bytes of an image.
    const bytes = new Uint8Array([...PNG, ...randomBytes(200_000)]);
    const topUpsBefore = (await ledger("arweave_top_up")).length;
    const { prepared, signature } = await launch(creator, { name: "Heavy", symbol: "HEVY", image: { bytes, type: "image/png" }, exact: true });
    expect(await (await deliverWebhook([signature])).json()).toMatchObject({ launched: 1 });
    const document = (await (await resolved(prepared.metadataUri)).json()) as { image: string };
    const imageId = idOf(document.image);
    await resolved(document.image);

    // The image was charged, the metadata JSON was free.
    const held = await heldItems();
    const imageItem = held.find((i) => i.id === imageId)!;
    expect(imageItem.bytes).toBeGreaterThan(FREE_LIMIT_BYTES);
    expect(BigInt(imageItem.winc)).toBe(BigInt(imageItem.bytes) * WINC_PER_BYTE);
    expect(held.find((i) => i.id === idOf(prepared.metadataUri))!.winc).toBe("0");

    // The credits came from one top-up: SOL from the operations wallet to Turbo's deposit address, on the Ledger.
    const topUps = await ledger("arweave_top_up");
    expect(topUps.length).toBe(topUpsBefore + 1);
    const topUp = topUps[0]!;
    expect(topUp).toMatchObject({ kind: "arweave_top_up", amount: env().arweaveTopUpLamports, destination: env().turbo.depositAddress, launch: null });
    expect(topUp.asset.mint).toBe(WSOL);
    expect(await connection().getBalance(new PublicKey(env().turbo.depositAddress), "confirmed")).toBe(Number(env().arweaveTopUpLamports) * topUps.length);

    // What the coin cost, in lamports at Turbo's SOL price, against the launch transaction.
    const [cost, ...others] = (await ledger("metadata_upload")).filter((e) => e.launch?.mint === prepared.mint);
    expect(others).toEqual([]);
    const lamports = (BigInt(imageItem.winc) * 1_000_000_000n + WINC_PER_SOL - 1n) / WINC_PER_SOL;
    expect(cost).toMatchObject({ signature, kind: "metadata_upload", amount: lamports.toString(), source: env().platform.operationsWallet, destination: env().turbo.depositAddress });
    expect(cost!.launch).toMatchObject({ mint: prepared.mint, symbol: "HEVY" });

    // The run that paid says so, and what is left of the top-up is still the wallet's credit.
    const { runs } = JobRunList.parse(await (await fetch(`${env().apiUrl}/v1/operator/jobs?job=metadata-upload`, operator())).json());
    const paid = runs.find((r) => (r.summary as { topUps?: { signature: string }[] } | null)?.topUps?.some((t) => t.signature === topUp.signature));
    expect(paid?.status).toBe("succeeded");
    const credits = BigInt((paid!.summary as { balanceWinc: string }).balanceWinc);
    expect(credits).toBe((BigInt(env().arweaveTopUpLamports) * WINC_PER_SOL) / 1_000_000_000n - BigInt(imageItem.winc));
  });
});
