/**
 * Copy Protection (#120, ADR 0012): for a window after a coin launches here (COPY_PROTECTION_SECONDS, seven days), nobody
 * else may launch a coin with its name, its ticker or its image. The check runs at prepare time, where it refuses, and
 * when a launch is indexed, where it labels a coin that took an earlier coin's name, ticker or image (inside the window:
 * one made without our API, or in the minute before the original was indexed; after it: allowed, and still said). A
 * Creator may reuse their own coins' name, ticker and image.
 */
import { and, desc, gt, ne, sql } from "drizzle-orm";
import type { CopyKind, CopyVerdict, ProtectedCoin } from "@launchpad/contract";
import { launches, type Db } from "@launchpad/db";
import type { Config } from "../env";
import { COPY_DISTANCE, hashDistance } from "./imageHash";
import { coreKey, keysOf, nearTo } from "./keys";

export type Candidate = {
  name?: string | null;
  symbol?: string | null;
  /** The image's perceptual hash; undefined when no image was sent, null when it couldn't be hashed. */
  imageHash?: string | null;
  /** The Creator, whose own coins never count against them. */
  creator?: string | null;
};

export type CopyVerdicts = { name: CopyVerdict | null; symbol: CopyVerdict | null; image: CopyVerdict | null };

/** The launches inside their window at `now`, newest first, with everything the matcher reads. */
type ProtectedRow = { mint: string; name: string; symbol: string; nameKey: string; symbolKey: string; imageHash: string | null; creator: string; createdAt: Date };

/** How many protected launches one check reads at most: well above a week of launches, and bounded if it is not. */
const WINDOW_ROWS = 20_000;

/**
 * `window` false looks past the window at every earlier launch: what the Indexer labels a new coin with, since after the
 * window a copy is allowed but still worth a word ("same ticker as X, launched on ...").
 */
export async function checkCopies(db: Db, cfg: Config, c: Candidate, now = new Date(), { window = true } = {}): Promise<CopyVerdicts> {
  const since = window ? new Date(now.getTime() - cfg.copyProtectionSeconds * 1000) : new Date(0);
  const rows: ProtectedRow[] = await db
    .select({
      mint: launches.mint, name: launches.name, symbol: launches.symbol, nameKey: launches.nameKey, symbolKey: launches.symbolKey,
      imageHash: launches.imageHash, creator: launches.creator, createdAt: launches.createdAt,
    })
    .from(launches)
    .where(and(gt(launches.createdAt, since), c.creator ? ne(launches.creator, c.creator) : undefined, sql`${launches.createdAt} <= ${now.toISOString()}::timestamptz`))
    .orderBy(desc(launches.createdAt))
    .limit(WINDOW_ROWS);
  const until = (r: ProtectedRow) => new Date(r.createdAt.getTime() + cfg.copyProtectionSeconds * 1000);
  const coin = (r: ProtectedRow): ProtectedCoin => ({
    mint: r.mint, symbol: r.symbol, name: r.name, launchedAt: r.createdAt.toISOString(), protectedUntil: until(r).toISOString(),
  });
  const free: CopyVerdict = { status: "free", kind: null, of: null, reason: null };
  const taken = (kind: CopyKind, r: ProtectedRow, reason: string): CopyVerdict => ({ status: "taken", kind, of: coin(r), reason });
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const dates = (r: ProtectedRow) => `launched here on ${day(r.createdAt)} and protected until ${day(until(r))}`;

  const symbol = c.symbol?.trim() ? c.symbol.trim() : null;
  const name = c.name?.trim() ? c.name.trim() : null;

  let symbolVerdict: CopyVerdict | null = null;
  if (symbol !== null) {
    const core = coreKey(symbol);
    const keys = keysOf(symbol);
    const same = core ? rows.find((r) => r.symbolKey === core) : undefined;
    const near = same ? undefined : rows.find((r) => nearTo(keys, keysOf(r.symbol)));
    symbolVerdict = same
      ? taken("ticker", same, `${symbol.toUpperCase()} is taken: ${same.name} (${same.symbol}) ${dates(same)}.`)
      : near
        ? taken("near", near, `${symbol.toUpperCase()} is too close to ${near.symbol} (${near.name}), ${dates(near)}.`)
        : free;
  }

  let nameVerdict: CopyVerdict | null = null;
  if (name !== null) {
    const core = coreKey(name);
    const keys = keysOf(name);
    const same = core ? rows.find((r) => r.nameKey === core) : undefined;
    const near = same ? undefined : rows.find((r) => nearTo(keys, keysOf(r.name)));
    nameVerdict = same
      ? taken("name", same, `The name ${name} is taken: ${same.name} (${same.symbol}) ${dates(same)}.`)
      : near
        ? taken("near", near, `The name ${name} is too close to ${near.name} (${near.symbol}), ${dates(near)}.`)
        : free;
  }

  let imageVerdict: CopyVerdict | null = null;
  if (c.imageHash !== undefined) {
    if (c.imageHash === null) imageVerdict = { status: "unchecked", kind: null, of: null, reason: null };
    else {
      const hash = c.imageHash;
      const same = rows.find((r) => r.imageHash !== null && hashDistance(r.imageHash, hash) <= COPY_DISTANCE);
      imageVerdict = same ? taken("image", same, `This image is ${same.symbol}'s (${same.name}), ${dates(same)}.`) : free;
    }
  }
  return { name: nameVerdict, symbol: symbolVerdict, image: imageVerdict };
}

/** The first field found to be a copy, ticker first: what a prepare refuses with, and what the Indexer labels. */
export function firstCopy(v: CopyVerdicts): CopyVerdict | null {
  for (const field of [v.symbol, v.name, v.image]) if (field?.status === "taken") return field;
  return null;
}

/** The keys a launch is stored with, from its on-chain name and symbol. */
export const launchKeys = (name: string, symbol: string) => ({ nameKey: coreKey(name), symbolKey: coreKey(symbol) });
