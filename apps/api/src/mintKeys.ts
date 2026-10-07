// Mint keys the operator chose for a Creator's next launch: a ground vanity address for the Platform Token (#75). Every
// other launch derives its mint key from MINT_KEY_SECRET and the draft's nonce and never stores it; a chosen key has to
// be stored, so it is kept encrypted under a key derived from the same secret, and read back only to sign the launch.
import { createHmac } from "node:crypto";
import { Keypair, PublicKey } from "@solana/web3.js";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { ChosenMintKey } from "@launchpad/contract";
import { chosenMintKeys, launchDrafts, launches, type Db } from "@launchpad/db";
import type { Config } from "./env";

export class ChosenMintKeyError extends Error {}

/** The mint key of a draft. Deterministic, so a retry signs for the same coin address; never stored. */
export function mintKeypair(secret: string, nonce: string) {
  return Keypair.fromSeed(createHmac("sha256", secret).update(`launchpad mint key v1:${nonce}`).digest());
}

async function encryptionKey(secret: string) {
  const raw = createHmac("sha256", secret).update("launchpad chosen mint key v1").digest();
  return crypto.subtle.importKey("raw", new Uint8Array(raw), "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encrypt(secret: string, secretKey: Uint8Array) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(secret), new Uint8Array(secretKey)));
  return Buffer.concat([iv, sealed]).toString("base64");
}

async function decrypt(secret: string, stored: string) {
  const bytes = Buffer.from(stored, "base64");
  const opened = await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(bytes.subarray(0, 12)) }, await encryptionKey(secret), new Uint8Array(bytes.subarray(12)));
  return new Uint8Array(opened);
}

/** The chosen keys with whether a draft has taken each: the operator's view, never the secrets. */
export async function listChosenMintKeys(db: Db): Promise<ChosenMintKey[]> {
  const rows = await db
    .select({ mint: chosenMintKeys.mint, creator: chosenMintKeys.creator, createdAt: chosenMintKeys.createdAt, drafted: sql<boolean>`${launchDrafts.mint} is not null` })
    .from(chosenMintKeys)
    .leftJoin(launchDrafts, eq(launchDrafts.mint, chosenMintKeys.mint))
    .orderBy(asc(chosenMintKeys.createdAt));
  return rows.map((r) => ({ mint: r.mint, creator: r.creator, drafted: r.drafted, createdAt: r.createdAt.toISOString() }));
}

/** Stores a key for a Creator's next launch; refused when the address is already a coin or a draft here. */
export async function storeChosenMintKey(db: Db, cfg: Config, creator: string, secretKey: Uint8Array) {
  let keypair: Keypair;
  try {
    keypair = Keypair.fromSecretKey(secretKey);
  } catch {
    throw new ChosenMintKeyError("not a valid secret key: expected the 64 bytes of a Solana keypair file");
  }
  const mint = keypair.publicKey.toBase58();
  const [draft] = await db.select({ mint: launchDrafts.mint }).from(launchDrafts).where(eq(launchDrafts.mint, mint)).limit(1);
  const [launch] = await db.select({ mint: launches.mint }).from(launches).where(eq(launches.mint, mint)).limit(1);
  if (draft || launch) throw new ChosenMintKeyError(`${mint} is already a coin or a launch draft here`);
  await db
    .insert(chosenMintKeys)
    .values({ mint, creator, secret: await encrypt(cfg.mintKeySecret, secretKey) })
    .onConflictDoNothing();
  return listChosenMintKeys(db);
}

/** Removes a key no draft has taken; one a draft took stays, since the draft can still launch with it. */
export async function deleteChosenMintKey(db: Db, mint: string) {
  const [draft] = await db.select({ mint: launchDrafts.mint }).from(launchDrafts).where(eq(launchDrafts.mint, mint)).limit(1);
  if (draft) throw new ChosenMintKeyError(`${mint} is taken by a launch draft`);
  await db.delete(chosenMintKeys).where(eq(chosenMintKeys.mint, mint));
  return listChosenMintKeys(db);
}

/** The address a Creator's next launch takes, the oldest chosen key no draft has taken yet; null when there is none. */
export async function nextChosenMint(db: Db, creator: string): Promise<PublicKey | null> {
  const [row] = await db
    .select({ mint: chosenMintKeys.mint })
    .from(chosenMintKeys)
    .leftJoin(launchDrafts, eq(launchDrafts.mint, chosenMintKeys.mint))
    .where(and(eq(chosenMintKeys.creator, creator), isNull(launchDrafts.mint)))
    .orderBy(asc(chosenMintKeys.createdAt))
    .limit(1);
  return row ? new PublicKey(row.mint) : null;
}

/** The keypair that signs a draft's launch: derived from its nonce, or the chosen key stored for its address. */
export async function draftMintKeypair(db: Db, cfg: Config, draft: { mint: string; mintKeyNonce: string | null }) {
  if (draft.mintKeyNonce !== null) return mintKeypair(cfg.mintKeySecret, draft.mintKeyNonce);
  const [row] = await db.select({ secret: chosenMintKeys.secret }).from(chosenMintKeys).where(eq(chosenMintKeys.mint, draft.mint)).limit(1);
  if (!row) throw new Error(`draft ${draft.mint} has no nonce and no chosen mint key`);
  return Keypair.fromSecretKey(await decrypt(cfg.mintKeySecret, row.secret));
}
