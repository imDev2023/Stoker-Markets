import type { Connection, PublicKey } from "@solana/web3.js";
import { and, eq, isNull, sql } from "drizzle-orm";
import { graduations, launches, ledgerEntries, quoteAssets, type Db } from "@launchpad/db";
import { collectedSharesByLaunch, committedForwards, creatorShares, withheldGraduationFees } from "./creatorShares";
import { lamportsWorth, quotePrices, rawWorth } from "./value";

/**
 * A Graduation Fee's Ledger entries sit on the graduation's own signature, from this index up: clear of any revenue
 * index the migration transaction itself could carry, and of the metadata upload's 900 and 901 on a launch transaction.
 */
const EVENT_INDEX_BASE = 1000;

/** One withholding, as a job summary carries it: strings, since a summary is stored and logged as JSON. */
export type Withheld = { mint: string; creator: string; assetMint: string; amount: string; lamports: string; settled: boolean };

const min = (a: bigint, b: bigint) => (a < b ? a : b);

/**
 * The Graduation Fee (ADR 0015): once a coin has graduated, the platform keeps `GRADUATION_FEE_LAMPORTS`' worth of the
 * coin's Quote Asset out of what its Creator is owed on that coin, at the Quote Registry's price at the time, until the
 * fee is paid in full; each withholding is a `graduation_fee` entry on the Ledger, keyed by the graduation's signature.
 * Nothing moves on-chain: the Creator's share and the platform's revenue sit in the same wallet, and the entry is what
 * says which is which, so the Fee Collector's sweep takes it and the Creator Forward pays the rest. Only what the
 * Creator is owed right now is taken (collected, not yet forwarded, not yet withheld), and only out of the coin's own
 * earnings; a forward is never negative, and a fee a young share cannot cover yet waits for the next collection.
 * Idempotent: every withholding so far is on the Ledger and counted against both the fee and the share, so a second
 * run in a row withholds nothing more.
 */
export async function withholdGraduationFees(db: Db, connection: Connection, operations: PublicKey): Promise<Withheld[]> {
  const open = await db
    .select({
      mint: graduations.mint, signature: graduations.signature, feeLamports: graduations.feeLamports, paidLamports: graduations.feePaidLamports,
      withheld: graduations.feeWithheld, creator: launches.creator, quoteMint: launches.quoteMint, quoteDecimals: quoteAssets.decimals,
    })
    .from(graduations)
    .innerJoin(launches, eq(launches.mint, graduations.mint))
    .innerJoin(quoteAssets, eq(quoteAssets.mint, launches.quoteMint))
    .where(and(isNull(graduations.feeSettledAt), sql`${graduations.feeLamports} > 0`))
    .orderBy(graduations.slot, graduations.mint);
  if (open.length === 0) return [];

  const [shares, committed, withheldSoFar, ownShares, prices] = await Promise.all([
    creatorShares(db, { collectedOnly: true }),
    committedForwards(db),
    withheldGraduationFees(db),
    collectedSharesByLaunch(db, open.map((g) => g.mint)),
    quotePrices(db),
  ]);
  // What each Creator is owed in each Quote Asset right now, which is all a fee can be taken from.
  const owed = new Map(shares.map((s) => {
    const key = `${s.creator} ${s.mint}`;
    return [key, s.curve + s.pool - (committed.get(key) ?? 0n) - (withheldSoFar.get(key) ?? 0n)] as const;
  }));

  const result: Withheld[] = [];
  let slot: number | null = null;
  for (const g of open) {
    const key = `${g.creator} ${g.quoteMint}`;
    const available = min(owed.get(key) ?? 0n, (ownShares.get(g.mint) ?? 0n) - BigInt(g.withheld));
    if (available <= 0n) continue;
    // Priced at the moment of withholding, as the forward's minimum is; an asset the registry can't price waits.
    const price = prices.get(g.quoteMint);
    const remainingLamports = BigInt(g.feeLamports) - BigInt(g.paidLamports);
    const remainingRaw = rawWorth(g.quoteMint, remainingLamports, price);
    if (remainingRaw === null || remainingLamports <= 0n) continue;
    const amount = min(available, remainingRaw);
    const settled = amount >= remainingRaw;
    const lamports = settled ? remainingLamports : lamportsWorth(g.quoteMint, amount, price)!;
    slot ??= await connection.getSlot("confirmed");
    const now = new Date();
    const [earlier] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.signature, g.signature), eq(ledgerEntries.kind, "graduation_fee")));
    const count = earlier?.count ?? 0;
    await db.transaction(async (tx) => {
      await tx.insert(ledgerEntries).values({
        signature: g.signature, eventIndex: EVENT_INDEX_BASE + count, kind: "graduation_fee", assetMint: g.quoteMint, assetDecimals: g.quoteDecimals,
        amount: amount.toString(), source: g.creator, destination: operations.toBase58(), launchMint: g.mint, slot: slot!, blockTime: now,
      });
      await tx
        .update(graduations)
        .set({
          feeWithheld: sql`${graduations.feeWithheld} + ${amount.toString()}::numeric`,
          feePaidLamports: sql`${graduations.feePaidLamports} + ${lamports.toString()}::numeric`,
          ...(settled ? { feeSettledAt: now } : {}),
        })
        .where(eq(graduations.mint, g.mint));
    });
    owed.set(key, (owed.get(key) ?? 0n) - amount);
    result.push({ mint: g.mint, creator: g.creator, assetMint: g.quoteMint, amount: amount.toString(), lamports: lamports.toString(), settled });
  }
  return result;
}
