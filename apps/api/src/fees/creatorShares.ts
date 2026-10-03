import { and, eq, inArray, sql } from "drizzle-orm";
import { creatorForwards, launches, ledgerEntries, trades, type Db } from "@launchpad/db";

/**
 * What Creators earn from the platform's own revenue (ADR 0007), on top of the Creator Fee the chain pays them:
 * - on the curve, a match of each trade's on-chain Creator Fee, out of that trade's Platform Fee and never more than it;
 * - after Graduation, a share of the pool creator fee the platform collected from the coin's pool.
 * Both are in the Launch's Quote Asset. Everything here is a sum over indexed trades and the Ledger, so anyone can redo it.
 */

/** The Creator's share of a graduated pool's creator fee, in basis points: half. */
export const POOL_FORWARD_SHARE_BPS = 5_000;

/** A Creator's share in one Quote Asset, by where it was earned; raw units. */
export type CreatorShare = { creator: string; mint: string; curve: bigint; pool: bigint };

/**
 * What a curve trade earns its Creator from the platform, as SQL over `trades`. The match is capped by the Platform Fee
 * the trade paid, so the platform never forwards more than a trade brought in.
 */
const curveMatch = sql`least(${trades.creatorFee}, ${trades.platformFee})`;
const poolShare = sql`floor(sum(${ledgerEntries.amount}) * ${POOL_FORWARD_SHARE_BPS} / 10000)`;

/**
 * A curve trade's fee has been collected once a Platform Fee claim for its Quote Asset landed at or after the trade:
 * the vault it was paid into was emptied into the operations wallet.
 */
const collected = sql`${trades.slot} <= coalesce(
  (select max(le.slot) from ${ledgerEntries} le where le.kind = 'platform_fee' and le.asset_mint = ${launches.quoteMint}), -1)`;

type Scope = {
  /** Only what the platform has already collected, which is what it owes; otherwise everything earned so far. */
  collectedOnly: boolean;
  creator?: string;
};

/** Each Creator's share per Quote Asset. A pool's share only ever counts collected fees: the Ledger knows no others. */
export async function creatorShares(db: Db, scope: Scope): Promise<CreatorShare[]> {
  const mine = scope.creator ? sql`and ${launches.creator} = ${scope.creator}` : sql``;
  const [curve, pool] = await Promise.all([
    db
      .select({ creator: launches.creator, mint: launches.quoteMint, amount: sql<string>`coalesce(sum(${curveMatch}), 0)::text` })
      .from(trades)
      .innerJoin(launches, eq(launches.mint, trades.mint))
      .where(sql`${trades.venue} = 'curve' ${mine} ${scope.collectedOnly ? sql`and ${collected}` : sql``}`)
      .groupBy(launches.creator, launches.quoteMint),
    db
      .select({ creator: launches.creator, mint: ledgerEntries.assetMint, amount: sql<string>`${poolShare}::text` })
      .from(ledgerEntries)
      .innerJoin(launches, eq(launches.mint, ledgerEntries.launchMint))
      .where(sql`${ledgerEntries.kind} = 'pool_fee' and ${ledgerEntries.assetMint} = ${launches.quoteMint} ${mine}`)
      .groupBy(launches.creator, ledgerEntries.assetMint),
  ]);
  const shares = new Map<string, CreatorShare>();
  const at = (creator: string, mint: string) => {
    const key = `${creator} ${mint}`;
    if (!shares.has(key)) shares.set(key, { creator, mint, curve: 0n, pool: 0n });
    return shares.get(key)!;
  };
  for (const r of curve) at(r.creator, r.mint).curve = BigInt(r.amount);
  for (const r of pool) at(r.creator, r.mint).pool = BigInt(r.amount);
  return [...shares.values()].filter((s) => s.curve + s.pool > 0n).sort((a, b) => a.creator.localeCompare(b.creator) || a.mint.localeCompare(b.mint));
}

/** One Creator's share per Launch, counting every indexed curve trade: for the Creator Fee page. */
export async function creatorSharesByLaunch(db: Db, creator: string) {
  const [curve, pool] = await Promise.all([
    db
      .select({ mint: launches.mint, amount: sql<string>`coalesce(sum(${curveMatch}), 0)::text` })
      .from(trades)
      .innerJoin(launches, eq(launches.mint, trades.mint))
      .where(and(eq(trades.venue, "curve"), eq(launches.creator, creator)))
      .groupBy(launches.mint),
    db
      .select({ mint: launches.mint, amount: sql<string>`${poolShare}::text` })
      .from(ledgerEntries)
      .innerJoin(launches, eq(launches.mint, ledgerEntries.launchMint))
      .where(sql`${ledgerEntries.kind} = 'pool_fee' and ${ledgerEntries.assetMint} = ${launches.quoteMint} and ${launches.creator} = ${creator}`)
      .groupBy(launches.mint),
  ]);
  const of = (rows: { mint: string; amount: string }[]) => new Map(rows.map((r) => [r.mint, r.amount]));
  return { curve: of(curve), pool: of(pool) };
}

/**
 * What has been forwarded, or is on its way, per Creator and Quote Asset: every forward that landed or may still land.
 * A failed or expired one moved nothing and counts for nothing.
 */
export async function committedForwards(db: Db, creator?: string) {
  const rows = await db
    .select({ creator: creatorForwards.creator, mint: creatorForwards.assetMint, amount: sql<string>`sum(${creatorForwards.amount})::text` })
    .from(creatorForwards)
    .where(and(inArray(creatorForwards.status, ["sending", "paid"]), creator ? eq(creatorForwards.creator, creator) : undefined))
    .groupBy(creatorForwards.creator, creatorForwards.assetMint);
  return new Map(rows.map((r) => [`${r.creator} ${r.mint}`, BigInt(r.amount)]));
}

/**
 * Per Quote Asset, what the platform has collected for Creators and what the Ledger shows it has forwarded so far. The
 * difference is still in the operations wallet and is not the platform's: the sweep leaves it there, and the Burn and
 * Flywheel budgets are shares of revenue without it.
 */
export async function creatorMoney(db: Db) {
  const [shares, forwarded] = await Promise.all([
    creatorShares(db, { collectedOnly: true }),
    db
      .select({ mint: ledgerEntries.assetMint, amount: sql<string>`sum(${ledgerEntries.amount})::text` })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.kind, "creator_forward"))
      .groupBy(ledgerEntries.assetMint),
  ]);
  const money = new Map<string, { accrued: bigint; forwarded: bigint }>();
  const at = (mint: string) => {
    if (!money.has(mint)) money.set(mint, { accrued: 0n, forwarded: 0n });
    return money.get(mint)!;
  };
  for (const s of shares) at(s.mint).accrued += s.curve + s.pool;
  for (const f of forwarded) at(f.mint).forwarded = BigInt(f.amount);
  return money;
}

/** What is owed and not yet forwarded in one Quote Asset; never negative. */
export function unforwarded(money: Map<string, { accrued: bigint; forwarded: bigint }>, mint: string) {
  const m = money.get(mint);
  return m && m.accrued > m.forwarded ? m.accrued - m.forwarded : 0n;
}
