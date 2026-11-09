import { avatarHues } from "@launchpad/contract";
import type { Cluster } from "@launchpad/chain";
import { sniffImageType } from "./images";

/**
 * Pictures the chart's marks show (#160): a wallet's generated avatar, drawn here as an image, and copies of X profile
 * pictures, which X moves whenever their owner changes them, kept in the bucket and served from our own address.
 */

/** A copied picture larger than this is refused: a profile picture is a few tens of kilobytes. */
const PICTURE_MAX_BYTES = 1024 * 1024;
const FETCH_TIMEOUT_MS = 10_000;

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** Bucket keys: an X account's picture by its numeric id, a notable wallet's by its address. */
export const xAvatarKey = (authorId: string) => `x-avatars/${authorId}`;
export const notableAvatarKey = (wallet: string) => `notable-avatars/${wallet}`;

/** Where the API serves each picture. */
export const walletAvatarUrl = (publicApiUrl: string, wallet: string) => `${publicApiUrl}/avatars/wallet/${wallet}`;
export const xAvatarUrl = (publicApiUrl: string, authorId: string) => `${publicApiUrl}/avatars/x/${authorId}`;
export const notableAvatarUrl = (publicApiUrl: string, wallet: string) => `${publicApiUrl}/avatars/notable/${wallet}`;

/**
 * Copies the picture at `url` into the bucket under `key`, unless the copy there already came from that address.
 * Answers whether a picture is there afterwards. Only https is fetched on mainnet; anything that is not a PNG, JPEG,
 * GIF or WebP by its first bytes, or is larger than a megabyte, is refused.
 */
export async function copyPicture(bucket: R2Bucket, key: string, url: string, cluster: Cluster): Promise<boolean> {
  let address: URL;
  try {
    address = new URL(url);
  } catch {
    return false;
  }
  if (address.protocol !== "https:" && !(cluster !== "mainnet" && address.protocol === "http:")) return false;
  const held = await bucket.head(key);
  if (held?.customMetadata?.source === url) return true;
  const res = await fetch(address, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), redirect: "follow" }).catch(() => null);
  if (!res?.ok || !res.body) return held !== null;
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > PICTURE_MAX_BYTES) return held !== null;
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length > PICTURE_MAX_BYTES) return held !== null;
  const contentType = sniffImageType(bytes);
  if (!contentType) return held !== null;
  await bucket.put(key, bytes, { httpMetadata: { contentType }, customMetadata: { source: url } });
  return true;
}

/** A picture from the bucket, or 404. Cached for a day: X pictures change, and the next copy replaces this one. */
export async function servePicture(bucket: R2Bucket, key: string) {
  const obj = await bucket.get(key);
  if (!obj) return Response.json({ error: "not found" }, { status: 404 });
  return new Response(obj.body, {
    headers: {
      "content-type": obj.httpMetadata?.contentType ?? "application/octet-stream",
      "cache-control": "public, max-age=86400",
      "x-content-type-options": "nosniff",
    },
  });
}

/** A wallet's generated avatar as a square SVG: the same two hues and angle the site draws it with. */
export function walletAvatar(wallet: string) {
  if (!BASE58.test(wallet)) return Response.json({ error: "not a wallet address" }, { status: 404 });
  const [a, b] = avatarHues(wallet);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">`
    + `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">`
    + `<stop offset="0" stop-color="hsl(${a} 70% 56%)"/><stop offset="1" stop-color="hsl(${b} 72% 38%)"/>`
    + `</linearGradient></defs><rect width="64" height="64" fill="url(#g)"/></svg>`;
  return new Response(svg, {
    headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff" },
  });
}

export const isWallet = (s: string) => BASE58.test(s);
export const isXId = (s: string) => /^\d{1,20}$/.test(s);
