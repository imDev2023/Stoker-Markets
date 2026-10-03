// Permanent metadata (#44): every coin's image and metadata JSON live on Arweave, through ArDrive Turbo, paid in SOL
// from the operations wallet. Both are signed as ANS-104 data items when the launch is prepared, so the launch
// transaction carries the Arweave address of a document nobody can change, and uploaded by the Metadata Upload job
// only once the Indexer has seen the launch land: an abandoned launch is never uploaded and costs nothing. The signed
// bytes wait in R2, which also keeps serving the same document under our own domain as the cache.
import { Connection, PublicKey, SendTransactionError, SystemProgram, type Keypair } from "@solana/web3.js";
import { and, asc, eq, sql } from "drizzle-orm";
import {
  creditBalance, creditTransfer, depositAddress, PaymentRequired, signDataItem, uploadDataItem, wincForLamports, type UploadReceipt,
} from "@launchpad/arweave";
import { signedTransaction, WSOL_MINT } from "@launchpad/chain";
import { arweaveTopUps, launches, launchMetadata, ledgerEntries, metadataUploads, type Db } from "@launchpad/db";
import type { ArweaveConfig, Config } from "./env";
import { fetchRawTransaction } from "./indexer";
import { JobFailure } from "./jobs";

type Metadata = typeof launchMetadata.$inferSelect;
type Item = "image" | "metadata";

const APP_NAME = "Stoker";
const LAMPORTS_PER_SOL = 1_000_000_000n;
/** Ledger event indexes for a launch transaction's upload costs, clear of any revenue the transaction itself moved. */
const LEDGER_INDEX: Record<Item, number> = { image: 900, metadata: 901 };
const POLL_MS = 500;
/** How long one run waits for Turbo to credit a transfer it has just seen land; a later run picks it up otherwise. */
const CREDIT_WAIT_MS = 45_000;

/** The Metaplex off-chain document for a coin, the very bytes Arweave holds. */
export function metadataDocument(m: Metadata, imageUrl: string) {
  return {
    name: m.name,
    symbol: m.symbol,
    description: m.description,
    image: imageUrl,
    external_url: m.website ?? undefined,
    extensions: { website: m.website ?? undefined, twitter: m.x ?? undefined, telegram: m.telegram ?? undefined },
  };
}

export const storageKey = (mint: string, item: Item) => `arweave/${mint}/${item}`;

export const arweaveUrl = (cfg: ArweaveConfig, id: string) => `${cfg.gateway}/${id}`;

/** A 32-byte anchor fixed by the coin and the item, so a launch prepared twice signs the same items. */
async function anchor(mint: string, item: Item) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${APP_NAME} ${item} ${mint}`)));
}

/**
 * Signs a new launch's two data items with the operations key, keeps their bytes in R2 and writes them down as waiting
 * to be uploaded. Returns the coin's permanent metadata URI, for the launch transaction.
 */
export async function signMetadataItems(
  db: Db, bucket: R2Bucket, cfg: Config, operations: Keypair, m: Metadata, image: { bytes: Uint8Array; contentType: string },
) {
  const mint = m.id;
  const common = [{ name: "App-Name", value: APP_NAME }, { name: "Launch-Mint", value: mint }];
  const imageItem = await signDataItem(operations.secretKey, {
    data: image.bytes, tags: [{ name: "Content-Type", value: image.contentType }, ...common], anchor: await anchor(mint, "image"),
  });
  const document = new TextEncoder().encode(JSON.stringify(metadataDocument(m, arweaveUrl(cfg.arweave, imageItem.id))));
  const metadataItem = await signDataItem(operations.secretKey, {
    data: document, tags: [{ name: "Content-Type", value: "application/json" }, ...common], anchor: await anchor(mint, "metadata"),
  });
  await bucket.put(storageKey(mint, "image"), imageItem.bytes, { httpMetadata: { contentType: "application/octet-stream" } });
  await bucket.put(storageKey(mint, "metadata"), metadataItem.bytes, { httpMetadata: { contentType: "application/octet-stream" } });
  await db
    .insert(metadataUploads)
    .values([
      { mint, item: "image", arweaveId: imageItem.id, storageKey: storageKey(mint, "image"), bytes: imageItem.bytes.byteLength },
      { mint, item: "metadata", arweaveId: metadataItem.id, storageKey: storageKey(mint, "metadata"), bytes: metadataItem.bytes.byteLength },
    ])
    .onConflictDoNothing();
  return { metadataUri: arweaveUrl(cfg.arweave, metadataItem.id), imageUri: arweaveUrl(cfg.arweave, imageItem.id) };
}

/** The Arweave ids a coin's items were signed under; null for a coin from before permanent metadata. */
export async function signedItems(db: Db, mint: string) {
  const rows = await db.select().from(metadataUploads).where(eq(metadataUploads.mint, mint));
  const image = rows.find((r) => r.item === "image");
  const metadata = rows.find((r) => r.item === "metadata");
  return image && metadata ? { image, metadata } : null;
}

export type UploadDeps = { db: Db; cfg: Config; operations: Keypair; bucket: R2Bucket };

export type UploadSummary = {
  uploaded: { mint: string; item: Item; id: string; winc: string; lamports: string }[];
  /** SOL sent to Turbo for credits this run or settled from an earlier one, and how it ended. */
  topUps: { signature: string; lamports: string; outcome: "credited" | "pending" | "failed"; error?: string }[];
  /** Launched coins with an item still to upload after this run. */
  pending: number;
  /** The wallet's credits after the run, in winc. */
  balanceWinc: string;
  problems: string[];
};

/**
 * The Metadata Upload job: posts to Turbo every item signed for a launch the Indexer has seen land, image and metadata
 * JSON, and writes what each cost to the Ledger against the launch transaction. When Turbo wants paying, SOL goes from
 * the operations wallet to Turbo's deposit address for credits, one transfer at a time, each on the Ledger too. Turbo
 * holds every item by its id, so a run that dies after posting and before writing uploads nothing twice: the next run
 * posts the same bytes again and is charged nothing. Runs every minute and right after a launch is indexed.
 */
export async function uploadMetadata({ db, cfg, operations, bucket }: UploadDeps): Promise<UploadSummary> {
  const connection = new Connection(cfg.rpcUrl, "confirmed");
  const urls = cfg.arweave.turbo;
  const ops = operations.publicKey.toBase58();
  const summary: UploadSummary = { uploaded: [], topUps: [], pending: 0, balanceWinc: "0", problems: [] };

  // A transfer an earlier run sent but could not see credited comes first; its credits may be what this run needs.
  let creditsInFlight = false;
  for (const t of await db.select().from(arweaveTopUps).where(eq(arweaveTopUps.status, "sent"))) {
    const outcome = await settleTopUp(db, connection, urls, ops, t);
    summary.topUps.push({ signature: t.signature, lamports: t.lamports, ...outcome });
    if (outcome.outcome === "pending") creditsInFlight = true;
  }

  const due = await db
    .select({ upload: metadataUploads, launch: { signature: launches.createdSignature, slot: launches.createdSlot } })
    .from(metadataUploads)
    .innerJoin(launches, eq(launches.mint, metadataUploads.mint))
    .where(eq(metadataUploads.status, "signed"))
    .orderBy(asc(launches.createdAt), asc(metadataUploads.item));
  let wincPerSol: bigint | null = null;
  let deposit: string | null = null;
  const left = new Set<string>();
  for (const { upload, launch } of due) {
    const object = await bucket.get(upload.storageKey);
    if (!object) {
      summary.problems.push(`${upload.mint} ${upload.item}: the signed item is missing from storage (${upload.storageKey})`);
      left.add(upload.mint);
      continue;
    }
    const bytes = new Uint8Array(await object.arrayBuffer());
    let receipt: UploadReceipt;
    try {
      receipt = await uploadDataItem(urls, bytes);
    } catch (e) {
      if (!(e instanceof PaymentRequired)) throw e;
      if (creditsInFlight) {
        summary.problems.push(`${upload.mint} ${upload.item}: waiting for a top-up Turbo has not credited yet`);
        left.add(upload.mint);
        continue;
      }
      const topped = await topUp(db, connection, cfg, operations, summary);
      creditsInFlight = topped !== "credited";
      if (topped !== "credited") {
        left.add(upload.mint);
        continue;
      }
      try {
        receipt = await uploadDataItem(urls, bytes);
      } catch (again) {
        if (!(again instanceof PaymentRequired)) throw again;
        summary.problems.push(`${upload.mint} ${upload.item}: Turbo still wants paying after a top-up of ${cfg.arweave.topUpLamports} lamports; raise ARWEAVE_TOP_UP_LAMPORTS`);
        left.add(upload.mint);
        continue;
      }
    }
    if (receipt.id !== upload.arweaveId) {
      summary.problems.push(`${upload.mint} ${upload.item}: Turbo took the item as ${receipt.id}, not ${upload.arweaveId} as signed`);
      left.add(upload.mint);
      continue;
    }
    const winc = BigInt(receipt.winc);
    wincPerSol ??= await wincForLamports(urls, LAMPORTS_PER_SOL);
    const lamports = winc === 0n ? 0n : (winc * LAMPORTS_PER_SOL + wincPerSol - 1n) / wincPerSol;
    if (winc > 0n) {
      deposit ??= await depositAddress(urls);
      await db
        .insert(ledgerEntries)
        .values({
          signature: launch.signature, eventIndex: LEDGER_INDEX[upload.item], kind: "metadata_upload", assetMint: WSOL_MINT.toBase58(), assetDecimals: 9,
          amount: lamports.toString(), source: ops, destination: deposit, launchMint: upload.mint, slot: launch.slot, blockTime: new Date(),
        })
        .onConflictDoNothing();
    }
    await db
      .update(metadataUploads)
      .set({ status: "uploaded", winc: winc.toString(), lamports: lamports.toString(), receipt, uploadedAt: new Date() })
      .where(and(eq(metadataUploads.mint, upload.mint), eq(metadataUploads.item, upload.item)));
    summary.uploaded.push({ mint: upload.mint, item: upload.item, id: receipt.id, winc: receipt.winc, lamports: lamports.toString() });
  }
  summary.pending = left.size;
  summary.balanceWinc = (await creditBalance(urls, ops)).toString();
  if (summary.problems.length) throw new JobFailure(summary.problems.join("; "), summary);
  return summary;
}

/** How many launched coins have an item uploaded, and how many still wait for one. */
export async function uploadCounts(db: Db) {
  const waiting = sql`exists (select 1 from ${metadataUploads} u where u.mint = ${launches.mint} and u.status = 'signed')`;
  const done = sql`exists (select 1 from ${metadataUploads} u where u.mint = ${launches.mint} and u.status = 'uploaded')`;
  const [row] = await db
    .select({ pending: sql<number>`count(*) filter (where ${waiting})::int`, uploaded: sql<number>`count(*) filter (where ${done} and not ${waiting})::int` })
    .from(launches);
  return row!;
}

type Outcome = { outcome: "credited" | "pending" | "failed"; error?: string };

/**
 * Sends one top-up: SOL from the operations wallet to Turbo's deposit address, written down before it goes out and
 * credited by Turbo once finalized. Never two in flight: credits still pending make the run wait instead.
 */
async function topUp(db: Db, connection: Connection, cfg: Config, operations: Keypair, summary: UploadSummary): Promise<Outcome["outcome"]> {
  const urls = cfg.arweave.turbo;
  const ops = operations.publicKey;
  const lamports = cfg.arweave.topUpLamports;
  const held = BigInt(await connection.getBalance(ops, "confirmed"));
  if (held < lamports + 5_000n) {
    summary.problems.push(`a top-up of ${lamports} lamports is due, but the operations wallet holds only ${held}`);
    return "failed";
  }
  const deposit = new PublicKey(await depositAddress(urls));
  const tx = await signedTransaction(connection, operations, [SystemProgram.transfer({ fromPubkey: ops, toPubkey: deposit, lamports })]);
  await db.insert(arweaveTopUps).values({ signature: tx.signature, lamports: lamports.toString(), lastValidBlockHeight: tx.lastValidBlockHeight }).onConflictDoNothing();
  try {
    await connection.sendRawTransaction(tx.serialized, { preflightCommitment: "confirmed" });
  } catch (e) {
    if (!(e instanceof SendTransactionError)) throw e;
    await db.update(arweaveTopUps).set({ status: "failed", error: e.message, settledAt: new Date() }).where(eq(arweaveTopUps.signature, tx.signature));
    summary.topUps.push({ signature: tx.signature, lamports: lamports.toString(), outcome: "failed", error: e.message });
    summary.problems.push(`the top-up was refused: ${e.message}`);
    return "failed";
  }
  const row = { signature: tx.signature, lamports: lamports.toString(), lastValidBlockHeight: tx.lastValidBlockHeight };
  const outcome = await settleTopUp(db, connection, urls, ops.toBase58(), row, true);
  summary.topUps.push({ ...row, ...outcome });
  if (outcome.outcome === "failed") summary.problems.push(`the top-up ${tx.signature} failed: ${outcome.error}`);
  return outcome.outcome;
}

type InFlight = { signature: string; lamports: string; lastValidBlockHeight: number };

/**
 * Where one top-up stands: landed and credited, landed and not credited yet (Turbo waits for finality), or failed on
 * the chain, expired unlanded or refused by Turbo. A landed transfer goes on the Ledger whatever Turbo says.
 */
async function settleTopUp(
  db: Db, connection: Connection, urls: ArweaveConfig["turbo"], ops: string, t: InFlight, wait = false,
): Promise<Outcome> {
  const fail = async (error: string): Promise<Outcome> => {
    await db.update(arweaveTopUps).set({ status: "failed", error, settledAt: new Date() }).where(eq(arweaveTopUps.signature, t.signature));
    return { outcome: "failed", error };
  };
  const landedAt = Date.now() + (wait ? CREDIT_WAIT_MS : 0);
  for (;;) {
    const { value: [status] } = await connection.getSignatureStatuses([t.signature], { searchTransactionHistory: true });
    if (status?.err) return fail(JSON.stringify(status.err));
    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") break;
    if (!status && (await connection.getBlockHeight("confirmed")) > t.lastValidBlockHeight) return fail("expired before it landed");
    if (!wait || Date.now() > landedAt) return { outcome: "pending" };
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  const raw = await fetchRawTransaction(connection.rpcEndpoint, t.signature);
  if (!raw) return { outcome: "pending" };
  const deposit = await depositAddress(urls);
  await db
    .insert(ledgerEntries)
    .values({
      signature: t.signature, eventIndex: 0, kind: "arweave_top_up", assetMint: WSOL_MINT.toBase58(), assetDecimals: 9, amount: t.lamports,
      source: ops, destination: deposit, launchMint: null, slot: raw.slot, blockTime: new Date((raw.blockTime ?? Math.floor(Date.now() / 1000)) * 1000),
    })
    .onConflictDoNothing();
  const until = Date.now() + (wait ? CREDIT_WAIT_MS : 0);
  for (;;) {
    const credit = await creditTransfer(urls, t.signature);
    if (credit.status === "credited") {
      await db.update(arweaveTopUps).set({ status: "credited", winc: credit.winc, settledAt: new Date() }).where(eq(arweaveTopUps.signature, t.signature));
      return { outcome: "credited" };
    }
    if (credit.status === "failed") return fail(credit.reason);
    if (Date.now() > until) return { outcome: "pending" };
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}
