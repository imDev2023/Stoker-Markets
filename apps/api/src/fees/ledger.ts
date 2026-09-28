import type { PublicKey } from "@solana/web3.js";
import { eq, inArray } from "drizzle-orm";
import { decodeRevenue, type RawTransaction, type RevenueContext } from "@launchpad/chain";
import type { RevenueAsset } from "@launchpad/contract";
import { graduations, launches, launchMetadata, ledgerEntries, quoteAssets, type Db } from "@launchpad/db";
import type { Config } from "../env";

export function revenueContext(cfg: Config, operationsWallet: PublicKey): RevenueContext {
  return {
    programs: { launchlab: cfg.launchlab, cpmm: cfg.cpmm, lock: cfg.lock },
    platformConfig: cfg.platformConfig,
    operationsWallet,
    treasury: cfg.treasury,
  };
}

const time = (blockTime: number | null) => new Date((blockTime ?? Math.floor(Date.now() / 1000)) * 1000);

/**
 * Writes the revenue a confirmed transaction moved to the Ledger. Pool fees and Fee Key collections are tied to the
 * graduated coin whose pool paid them. Idempotent: an entry already recorded is left as it is. Returns the new entries.
 */
export async function recordRevenue(db: Db, ctx: RevenueContext, raw: RawTransaction) {
  const movements = decodeRevenue(raw, ctx);
  if (movements.length === 0) return 0;
  const pools = [...new Set(movements.flatMap((m) => (m.pool ? [m.pool.toBase58()] : [])))];
  const launchOf = new Map(
    pools.length
      ? (await db.select({ pool: graduations.pool, mint: graduations.mint }).from(graduations).where(inArray(graduations.pool, pools))).map((g) => [g.pool, g.mint])
      : [],
  );
  const inserted = await db
    .insert(ledgerEntries)
    .values(
      movements.map((m) => ({
        signature: m.signature,
        eventIndex: m.index,
        kind: m.kind,
        assetMint: m.mint.toBase58(),
        assetDecimals: m.decimals,
        amount: m.amount.toString(),
        source: m.source.toBase58(),
        destination: m.destination.toBase58(),
        launchMint: m.pool ? (launchOf.get(m.pool.toBase58()) ?? null) : null,
        slot: m.slot,
        blockTime: time(m.blockTime),
      })),
    )
    .onConflictDoNothing()
    .returning({ signature: ledgerEntries.signature });
  return inserted.length;
}

/**
 * How to show amounts in each asset revenue arrives in: a Quote Asset from the Quote Registry, a coin from its Launch
 * (with its image as the logo), and anything else by its mint and the decimals the Ledger recorded.
 */
export async function revenueAssets(db: Db, publicApiUrl: string, decimals: Map<string, number>) {
  const mints = [...decimals.keys()];
  const [quotes, coins] = mints.length
    ? await Promise.all([
        db.select().from(quoteAssets).where(inArray(quoteAssets.mint, mints)),
        db
          .select({ mint: launches.mint, symbol: launches.symbol, name: launches.name, decimals: launches.decimals, image: launchMetadata.id })
          .from(launches)
          .leftJoin(launchMetadata, eq(launchMetadata.id, launches.mint))
          .where(inArray(launches.mint, mints)),
      ])
    : [[], []];
  const known = new Map<string, RevenueAsset>([
    ...coins.map((c): [string, RevenueAsset] => [
      c.mint,
      { mint: c.mint, symbol: c.symbol, name: c.name, decimals: c.decimals, logo: c.image ? `${publicApiUrl}/metadata/${c.mint}/image` : null },
    ]),
    ...quotes.map((q): [string, RevenueAsset] => [q.mint, { mint: q.mint, symbol: q.symbol, name: q.name, decimals: q.decimals, logo: q.logo }]),
  ]);
  return (mint: string): RevenueAsset => known.get(mint) ?? { mint, symbol: null, name: null, decimals: decimals.get(mint)!, logo: null };
}
