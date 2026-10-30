import { and, eq, inArray, sql } from "drizzle-orm";
import { creatorForwards, graduations, launches, ledgerEntries, trades, type Db } from "@launchpad/db";

/**
 * What Creators earn (ADR 0009): half of what the platform collects on their Launches' trades, on either venue.
 * - on the curve, half of each trade's Platform Fee;
 * - after Graduation, half of each pool creator fee collection from the coin's pool.
 * Both are in the Launch's Quote Asset, and each half is rounded down on its own, so a sum per Creator, per Launch or
 * per asset is the same whichever way the fees are grouped. Everything here is a sum over indexed trades and the
 * Ledger, so anyone can redo it. A coin's Graduation Fee (ADR 0015) comes out of its Creator's share once it graduates:
 * what was withheld is on the Ledger as `graduation_fee` entries, and the platform's.
 */

/** The Creator's share of what the platform collects on their coin's trades, in basis points: half. */
export const CREATOR_SHARE_BPS = 5_000;

/** A Creator's share in one Quote Asset, by where it was earned; raw units. */
export type CreatorShare = { creator: string; mint: string; curve: bigint; pool: bigint };

const half = (amount: unknown) => sql`floor(${amount} * ${CREATOR_SHARE_BPS} / 10000)`;
/** What a curve trade earns its Creator, as SQL over `trades`. */
const curveShare = sql`coalesce(sum(${half(trades.platformFee)}), 0)::text`;
/** What the pool fee collections of a coin earn its Creator, as SQL over `ledger_entries`. */
const poolShare = sql`coalesce(sum(${half(ledgerEntries.amount)}), 0)::text`;

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
      .select({ creator: launches.creator, mint: launches.quoteMint, amount: sql<string>`${curveShare}` })
      .from(trades)
      .innerJoin(launches, eq(launches.mint, trades.mint))
      .where(sql`${trades.venue} = 'curve' ${mine} ${scope.collectedOnly ? sql`and ${collected}` : sql``}`)
      .groupBy(launches.creator, launches.quoteMint),
    db
      .select({ creator: launches.creator, mint: ledgerEntries.assetMint, amount: sql<string>`${poolShare}` })
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

/** One Creator's share per Launch, counting every indexed curve trade: for the creator page. */
export async function creatorSharesByLaunch(db: Db, creator: string) {
  const [curve, pool] = await Promise.all([
    db
      .select({ mint: launches.mint, amount: sql<string>`${curveShare}` })
      .from(trades)
      .innerJoin(launches, eq(launches.mint, trades.mint))
      .where(and(eq(trades.venue, "curve"), eq(launches.creator, creator)))
      .groupBy(launches.mint),
    db
      .select({ mint: launches.mint, amount: sql<string>`${poolShare}` })
      .from(ledgerEntries)
      .innerJoin(launches, eq(launches.mint, ledgerEntries.launchMint))
      .where(sql`${ledgerEntries.kind} = 'pool_fee' and ${ledgerEntries.assetMint} = ${launches.quoteMint} and ${launches.creator} = ${creator}`)
      .groupBy(launches.mint),
  ]);
  const of = (rows: { mint: string; amount: string }[]) => new Map(rows.map((r) => [r.mint, r.amount]));
  return { curve: of(curve), pool: of(pool) };
}

/**
 * What a graduated coin's Creator has been credited with in its Quote Asset and the platform has collected: half of the
 * Platform Fee of its curve trades whose claim has landed, and half of its pool fee collections. What a Graduation Fee
 * may be withheld from (ADR 0015): the coin's own earnings, never another coin's.
 */
export async function collectedSharesByLaunch(db: Db, mints: string[]) {
  if (!mints.length) return new Map<string, bigint>();
  const [curve, pool] = await Promise.all([
    db
      .select({ mint: launches.mint, amount: sql<string>`${curveShare}` })
      .from(trades)
      .innerJoin(launches, eq(launches.mint, trades.mint))
      .where(sql`${trades.venue} = 'curve' and ${inArray(launches.mint, mints)} and ${collected}`)
      .groupBy(launches.mint),
    db
      .select({ mint: launches.mint, amount: sql<string>`${poolShare}` })
      .from(ledgerEntries)
      .innerJoin(launches, eq(launches.mint, ledgerEntries.launchMint))
      .where(sql`${ledgerEntries.kind} = 'pool_fee' and ${ledgerEntries.assetMint} = ${launches.quoteMint} and ${inArray(launches.mint, mints)}`)
      .groupBy(launches.mint),
  ]);
  const shares = new Map<string, bigint>();
  for (const r of [...curve, ...pool]) shares.set(r.mint, (shares.get(r.mint) ?? 0n) + BigInt(r.amount));
  return shares;
}

/**
 * Per Creator and Quote Asset, what Graduation Fees have been withheld from their share so far (ADR 0015): every
 * `graduation_fee` entry on the Ledger, which names the coin, and through it the Creator.
 */
export async function withheldGraduationFees(db: Db, creator?: string) {
  const rows = await db
    .select({ creator: launches.creator, mint: ledgerEntries.assetMint, amount: sql<string>`sum(${ledgerEntries.amount})::text` })
    .from(ledgerEntries)
    .innerJoin(launches, eq(launches.mint, ledgerEntries.launchMint))
    .where(and(eq(ledgerEntries.kind, "graduation_fee"), creator ? eq(launches.creator, creator) : undefined))
    .groupBy(launches.creator, ledgerEntries.assetMint);
  return new Map(rows.map((r) => [`${r.creator} ${r.mint}`, BigInt(r.amount)]));
}

/** Every graduated coin's Graduation Fee as the `graduations` row carries it, by coin, for the pages that show one. */
export async function graduationFeesByLaunch(db: Db, mints: string[]) {
  if (!mints.length) return new Map<string, typeof graduations.$inferSelect>();
  const rows = await db.select().from(graduations).where(inArray(graduations.mint, mints));
  return new Map(rows.map((r) => [r.mint, r]));
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
 * Per Quote Asset, what the platform has collected for Creators, less the Graduation Fees withheld out of it (ADR 0015),
 * and what the Ledger shows it has forwarded so far. The difference is still in the operations wallet and is not the
 * platform's: the sweep leaves it there, and the Burn and Flywheel budgets are shares of revenue without it.
 */
export async function creatorMoney(db: Db) {
  const [shares, withheld, forwarded] = await Promise.all([
    creatorShares(db, { collectedOnly: true }),
    withheldGraduationFees(db),
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
  for (const [key, amount] of withheld) at(key.split(" ")[1]!).accrued -= amount;
  for (const f of forwarded) at(f.mint).forwarded = BigInt(f.amount);
  return money;
}

/** What is owed and not yet forwarded in one Quote Asset; never negative. */
export function unforwarded(money: Map<string, { accrued: bigint; forwarded: bigint }>, mint: string) {
  const m = money.get(mint);
  return m && m.accrued > m.forwarded ? m.accrued - m.forwarded : 0n;
}
