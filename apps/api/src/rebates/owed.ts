import { inArray, sql } from "drizzle-orm";
import { rebates, type Db } from "@launchpad/db";

/**
 * Volume Rebates given and not paid yet, in lamports (ADR 0021): those waiting for their wallet to reach the minimum
 * payout and those in a payment that has not landed. They are spoken for: no later week's pot may give them out again,
 * and the sweep leaves them in the operations wallet.
 */
export async function rebatesOwed(db: Db) {
  const [row] = await db
    .select({ lamports: sql<string>`coalesce(sum(${rebates.amount}), 0)::text` })
    .from(rebates)
    .where(inArray(rebates.status, ["waiting", "sending"]));
  return BigInt(row!.lamports);
}
