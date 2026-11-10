import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { CREATOR_SHARE_FLOOR_BPS, type CreatorEarningsDestination } from "@launchpad/contract";
import { creatorBuybacks, creatorForwards, graduations, launches, ledgerEntries, quoteAssets, rewardPayouts, rewardRounds, trades, type Db } from "@launchpad/db";
import { poolShareBps } from "./ladder";

/**
 * What Creators earn (ADR 0009, ADR 0020): their share of what the platform collects on their Launches' trades.
 * - on the curve, half of each trade's Platform Fee;
 * - after Graduation, each pool creator fee collection from the coin's pool at the share of the Creator Tier the coin
 *   held when it was collected: half on the first tier, more on the second and the top (`ladder.ts`).
 * Both are in the Launch's Quote Asset, and each share is rounded down on its own, so a sum per Creator, per Launch or
 * per asset is the same whichever way the fees are grouped. Everything here is a sum over indexed trades, the Ledger,
 * the published ladder and the recorded tiers, so anyone can redo it. A coin's Graduation Fee (ADR 0015) comes out of
 * its Creator's share once it graduates: what was withheld is on the Ledger as `graduation_fee` entries, and the platform's.
 *
 * Where a coin's share goes is its Creator Earnings Destination (ADR 0011), fixed at launch. A coin that pays the wallet
 * is paid by Creator Forwards, counted per Creator and Quote Asset across all such coins of theirs. A coin with a rule
 * (its holders, a buyback and burn, or a buyback and liquidity) has a pot of its own, `rulePots`: its own share, less
 * its own Graduation Fee, less what its rule has paid out or spent.
 */

/** The Ledger kinds under which a Creator's share leaves the operations wallet (ADR 0009, ADR 0011), each named positively. */
export const CREATOR_PAID_KINDS = ["creator_forward", "holder_dividend", "creator_burn", "creator_liquidity"] as const;

/**
 * As SQL over `ledger_entries`: the entry is a Creator's share leaving the operations wallet in its Quote Asset. A
 * buyback writes a second entry for the coins it bought, burned or added, which names its own coin and is no money out.
 */
export const creatorPaid = sql`(${inArray(ledgerEntries.kind, CREATOR_PAID_KINDS)} and (${ledgerEntries.launchMint} is null or ${ledgerEntries.assetMint} <> ${ledgerEntries.launchMint}))`;

/** The Creator's share of the Platform Fee on the curve, and the first tier's share of a pool fee, in basis points: half. */
export const CREATOR_SHARE_BPS = CREATOR_SHARE_FLOOR_BPS;

/** A Creator's share in one Quote Asset, by where it was earned; raw units. */
export type CreatorShare = { creator: string; mint: string; curve: bigint; pool: bigint };

const half = (amount: unknown) => sql`floor(${amount} * ${CREATOR_SHARE_BPS} / 10000)`;
/** What a curve trade earns its Creator, as SQL over `trades`. */
const curveShare = sql`coalesce(sum(${half(trades.platformFee)}), 0)::text`;
/** What the pool fee collections of a coin earn its Creator, each at its tier's share, as SQL over `ledger_entries`. */
const poolShare = sql`coalesce(sum(floor(${ledgerEntries.amount} * ${poolShareBps} / 10000)), 0)::text`;

/** A Ledger time as SQL: a `Date` parameter fails under our client's settings, so it goes as text with a cast. */
const ledgerTime = (time: Date) => sql`${time.toISOString()}::timestamptz`;

/**
 * A curve trade's fee has been collected once a Platform Fee claim for its Quote Asset landed at or after the trade:
 * the vault it was paid into was emptied into the operations wallet. With `before`, only claims that landed before
 * that time count, which is what had been collected by then.
 */
const collected = (before?: Date) => sql`${trades.slot} <= coalesce(
  (select max(le.slot) from ${ledgerEntries} le where le.kind = 'platform_fee' and le.asset_mint = ${launches.quoteMint}${before ? sql` and le.block_time < ${ledgerTime(before)}` : sql``}), -1)`;

type Scope = {
  /** Only what the platform has already collected, which is what it owes; otherwise everything earned so far. */
  collectedOnly: boolean;
  creator?: string;
  /** With `collectedOnly`: only what Ledger entries before this time collected (ADR 0019's periods). */
  before?: Date;
  /** Only the coins whose earnings go to their Creator's wallet (ADR 0011): what Creator Forwards pay. */
  walletOnly?: boolean;
};

/** As SQL over `launches`: the coin pays its Creator's wallet. */
const paysWallet = sql`${launches.earningsDestination} = 'wallet'`;

/** Each Creator's share per Quote Asset. A pool's share only ever counts collected fees: the Ledger knows no others. */
export async function creatorShares(db: Db, scope: Scope): Promise<CreatorShare[]> {
  const mine = sql`${scope.creator ? sql`and ${launches.creator} = ${scope.creator}` : sql``} ${scope.walletOnly ? sql`and ${paysWallet}` : sql``}`;
  const [curve, pool] = await Promise.all([
    db
      .select({ creator: launches.creator, mint: launches.quoteMint, amount: sql<string>`${curveShare}` })
      .from(trades)
      .innerJoin(launches, eq(launches.mint, trades.mint))
      .where(sql`${trades.venue} = 'curve' ${mine} ${scope.collectedOnly ? sql`and ${collected(scope.before)}` : sql``}`)
      .groupBy(launches.creator, launches.quoteMint),
    db
      .select({ creator: launches.creator, mint: ledgerEntries.assetMint, amount: sql<string>`${poolShare}` })
      .from(ledgerEntries)
      .innerJoin(launches, eq(launches.mint, ledgerEntries.launchMint))
      .where(sql`${ledgerEntries.kind} = 'pool_fee' and ${ledgerEntries.assetMint} = ${launches.quoteMint} ${mine} ${scope.before ? sql`and ${ledgerEntries.blockTime} < ${ledgerTime(scope.before)}` : sql``}`)
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
 * Platform Fee of its curve trades whose claim has landed, and its tiers' shares of its pool fee collections. What a Graduation Fee
 * may be withheld from (ADR 0015): the coin's own earnings, never another coin's.
 */
export async function collectedSharesByLaunch(db: Db, mints: string[]) {
  if (!mints.length) return new Map<string, bigint>();
  const [curve, pool] = await Promise.all([
    db
      .select({ mint: launches.mint, amount: sql<string>`${curveShare}` })
      .from(trades)
      .innerJoin(launches, eq(launches.mint, trades.mint))
      .where(sql`${trades.venue} = 'curve' and ${inArray(launches.mint, mints)} and ${collected()}`)
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
 * `graduation_fee` entry on the Ledger, which names the coin, and through it the Creator. With `walletOnly`, only on
 * the coins that pay the wallet, which is what comes off a Creator Forward.
 */
export async function withheldGraduationFees(db: Db, creator?: string, before?: Date, walletOnly = false) {
  const rows = await db
    .select({ creator: launches.creator, mint: ledgerEntries.assetMint, amount: sql<string>`sum(${ledgerEntries.amount})::text` })
    .from(ledgerEntries)
    .innerJoin(launches, eq(launches.mint, ledgerEntries.launchMint))
    .where(and(
      eq(ledgerEntries.kind, "graduation_fee"),
      creator ? eq(launches.creator, creator) : undefined,
      before ? sql`${ledgerEntries.blockTime} < ${ledgerTime(before)}` : undefined,
      walletOnly ? paysWallet : undefined,
    ))
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
 * and what the Ledger shows has left for them so far: forwarded to a wallet, paid to holders, or spent on a buyback
 * (ADR 0011). The difference is still in the operations wallet and is not the platform's: the sweep leaves it there,
 * and the Budget Table's rows are shares of revenue without it (ADR 0019).
 * With `before`, what had been collected for them by Ledger entries before that time; the forwards are not cut off.
 */
export async function creatorMoney(db: Db, before?: Date) {
  const [shares, withheld, forwarded] = await Promise.all([
    creatorShares(db, { collectedOnly: true, before }),
    withheldGraduationFees(db, undefined, before),
    db
      .select({ mint: ledgerEntries.assetMint, amount: sql<string>`sum(${ledgerEntries.amount})::text` })
      .from(ledgerEntries)
      .where(creatorPaid)
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

/** A coin whose Creator Earnings go to a rule, and where its pot stands; amounts in raw units of its Quote Asset. */
export type RulePot = {
  mint: string;
  symbol: string;
  creator: string;
  destination: Exclude<CreatorEarningsDestination, "wallet">;
  /** The coin's curve (`launches.pool`); its CPMM pool is found from it once it has graduated. */
  curve: string;
  coinDecimals: number;
  quoteMint: string;
  quoteDecimals: number;
  /** The Creator's share the platform has collected on this coin. */
  collected: bigint;
  /** The coin's Graduation Fee withheld out of it so far (ADR 0015). */
  withheld: bigint;
  /**
   * What the rule has used: for `holders`, every payout of the coin's earnings rounds that is paid, in flight or still
   * to be sent (a `returned` one stays in the pot); for a buyback, what every landed run spent and the most every run
   * still in flight may spend.
   */
  applied: bigint;
  /** What the next run may use: collected, less withheld, less applied; never negative. */
  available: bigint;
};

/**
 * The pot of every coin whose earnings go to a rule (ADR 0011), or of the given ones: all of it a sum over indexed
 * trades, the Ledger and the rule's own public rows, so anyone can redo it. In launch order.
 */
export async function rulePots(db: Db, mints?: string[]): Promise<RulePot[]> {
  if (mints && !mints.length) return [];
  const coins = await db
    .select({
      mint: launches.mint, symbol: launches.symbol, creator: launches.creator, destination: launches.earningsDestination, curve: launches.pool,
      coinDecimals: launches.decimals, quoteMint: launches.quoteMint, quoteDecimals: quoteAssets.decimals, withheld: graduations.feeWithheld,
    })
    .from(launches)
    .innerJoin(quoteAssets, eq(quoteAssets.mint, launches.quoteMint))
    .leftJoin(graduations, eq(graduations.mint, launches.mint))
    .where(and(ne(launches.earningsDestination, "wallet"), mints ? inArray(launches.mint, mints) : undefined))
    .orderBy(launches.createdSlot, launches.mint);
  if (!coins.length) return [];
  const own = coins.map((c) => c.mint);
  const [collected, paidOut, bought] = await Promise.all([
    collectedSharesByLaunch(db, own),
    db
      .select({ mint: rewardRounds.mint, amount: sql<string>`coalesce(sum(${rewardPayouts.amount}), 0)::text` })
      .from(rewardPayouts)
      .innerJoin(rewardRounds, eq(rewardRounds.id, rewardPayouts.roundId))
      .where(and(eq(rewardRounds.source, "earnings"), inArray(rewardRounds.mint, own), inArray(rewardPayouts.status, ["paid", "sending", "unpaid"])))
      .groupBy(rewardRounds.mint),
    db
      .select({
        mint: creatorBuybacks.mint,
        amount: sql<string>`coalesce(sum(case when ${creatorBuybacks.status} = 'landed' then ${creatorBuybacks.spent} else ${creatorBuybacks.budget} end), 0)::text`,
      })
      .from(creatorBuybacks)
      .where(and(inArray(creatorBuybacks.mint, own), inArray(creatorBuybacks.status, ["sending", "landed"])))
      .groupBy(creatorBuybacks.mint),
  ]);
  const used = new Map([...paidOut, ...bought].map((r) => [r.mint, BigInt(r.amount)]));
  return coins.map((c) => {
    const share = collected.get(c.mint) ?? 0n;
    const withheld = BigInt(c.withheld ?? "0");
    const applied = used.get(c.mint) ?? 0n;
    const available = share - withheld - applied;
    return {
      ...c, destination: c.destination as RulePot["destination"], collected: share, withheld, applied, available: available > 0n ? available : 0n,
    };
  });
}
