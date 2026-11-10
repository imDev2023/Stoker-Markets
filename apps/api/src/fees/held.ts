import { and, inArray, ne, or, sql } from "drizzle-orm";
import { WSOL_MINT } from "@launchpad/chain";
import { ledgerEntries, type Db } from "@launchpad/db";
import { REVENUE_KINDS } from "./budget";
import { creatorPaid } from "./creatorShares";

const WSOL = WSOL_MINT.toBase58();

/**
 * Per token, the revenue the Ledger shows the operations wallet still holds: collected, less swept and less what has
 * left for Creators (forwarded, paid to holders, spent on a buyback). The wallet's account of a token can also hold a
 * Reward Round's pot, which is the holders' and never revenue, so nothing is paid out of a Creator's share beyond this.
 */
export async function revenueHeld(db: Db, mints: string[]) {
  if (!mints.length) return new Map<string, bigint>();
  const rows = await db
    .select({
      mint: ledgerEntries.assetMint,
      amount: sql<string>`sum(case when ${ledgerEntries.kind} = 'sweep' or ${creatorPaid} then -${ledgerEntries.amount} else ${ledgerEntries.amount} end)::text`,
    })
    .from(ledgerEntries)
    .where(and(or(inArray(ledgerEntries.kind, [...REVENUE_KINDS, "sweep"]), creatorPaid), inArray(ledgerEntries.assetMint, mints), ne(ledgerEntries.assetMint, WSOL)))
    .groupBy(ledgerEntries.assetMint);
  return new Map(rows.map((r) => [r.mint, BigInt(r.amount)]));
}
