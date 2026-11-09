// The Budget Table (ADR 0019): the one place the Platform Net is divided. The Burn, the Flywheel, the sweep and every
// page read a row's share and what it has left from here, and nothing else sets a share.
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { WSOL_MINT } from "@launchpad/chain";
import {
  BUDGET_ROWS, BUDGET_TOTAL_BPS, SPENDING_ROWS, type BudgetRow, type BudgetShares, type BudgetsPage, type BudgetTableVersion, type PublishedBudgetTable,
  type SpendingRow,
} from "@launchpad/contract";
import { budgetTables, ledgerEntries, type Db } from "@launchpad/db";
import { creatorMoney } from "./creatorShares";
import { lamportsWorth, quotePrices, type QuotePrice } from "./value";

const WSOL = WSOL_MINT.toBase58();

/** The Ledger kinds that are revenue, named positively: what the platform collected, before the Creators' share. */
export const REVENUE_KINDS = ["platform_fee", "pool_fee", "fee_key"] as const;

/**
 * The Ledger kind each row's spending is recorded under, in SOL. A trader program names its own here when it is
 * built; until then its row has spent nothing (and has no share to spend).
 */
const SPENT_KIND: Partial<Record<SpendingRow, string>> = { burn: "burn", flywheel: "flywheel" };

export type BudgetTable = typeof budgetTables.$inferSelect;

export const sharesOf = (t: BudgetTable): BudgetShares => ({
  burn: t.burnBps, flywheel: t.flywheelBps, rebates: t.rebatesBps, referrals: t.referralsBps, integrators: t.integratorsBps, treasury: t.treasuryBps,
});

export const tableVersion = (t: BudgetTable): BudgetTableVersion => ({
  version: t.version, shares: sharesOf(t), note: t.note, announcedAt: t.announcedAt.toISOString(), effectiveAt: t.effectiveAt.toISOString(),
});

/** Every version there is, in the order they take effect, which is also their order by number. */
export async function budgetVersions(db: Db): Promise<BudgetTable[]> {
  const all = await db.select().from(budgetTables).orderBy(asc(budgetTables.effectiveAt), asc(budgetTables.version));
  if (!all.length) throw new Error("no Budget Table: the first version is missing (migration 0025_budget_table)");
  return all;
}

/**
 * The versions that have taken effect by `now`, oldest first, and those announced for later. The first version is in
 * force from the first lamport, whatever its own time says: there was never a time without a table.
 */
export function split(all: BudgetTable[], now = new Date()) {
  const inEffect = all.filter((t, i) => i === 0 || t.effectiveAt <= now);
  return { inEffect, inForce: inEffect.at(-1)!, upcoming: all.slice(inEffect.length) };
}

/** The table as published on `GET /v1/platform`: the version in force and any announced for later. */
export async function publishedBudgetTable(db: Db, now = new Date()): Promise<PublishedBudgetTable> {
  const { inForce, upcoming } = split(await budgetVersions(db), now);
  return { inForce: tableVersion(inForce), upcoming: upcoming.map(tableVersion) };
}

/** Writes the next version; the route has checked its lead time and its place after every earlier version. */
export async function announceBudgetTable(db: Db, shares: BudgetShares, effectiveAt: Date, note: string | null, now: Date) {
  const [latest] = await db.select({ version: sql<number>`coalesce(max(${budgetTables.version}), 0)::int` }).from(budgetTables);
  const [row] = await db
    .insert(budgetTables)
    .values({
      version: latest!.version + 1, burnBps: shares.burn, flywheelBps: shares.flywheel, rebatesBps: shares.rebates, referralsBps: shares.referrals,
      integratorsBps: shares.integrators, treasuryBps: shares.treasury, note, announcedAt: now, effectiveAt,
    })
    .returning();
  return row!;
}

/**
 * The Platform Net from Ledger entries before `before` (all of it when null), valued in SOL at the given prices, in
 * lamports: every revenue entry less what of it was collected for Creators (ADR 0009; a Graduation Fee withheld out of
 * their share is the platform's, ADR 0015). SOL at par; an asset without a price, or a coin a Fee Key paid out, counts
 * for nothing until it has one.
 */
async function netLamports(db: Db, prices: Map<string, QuotePrice>, before: Date | null) {
  const collected = await db
    .select({ mint: ledgerEntries.assetMint, amount: sql<string>`sum(${ledgerEntries.amount})::text` })
    .from(ledgerEntries)
    .where(and(inArray(ledgerEntries.kind, REVENUE_KINDS), before ? sql`${ledgerEntries.blockTime} < ${before.toISOString()}::timestamptz` : undefined))
    .groupBy(ledgerEntries.assetMint);
  // What was collected for Creators is theirs, forwarded or not, and no part of any budget.
  const creators = await creatorMoney(db, before ?? undefined);
  let net = 0n;
  for (const c of collected) {
    const gross = BigInt(c.amount);
    const theirs = creators.get(c.mint)?.accrued ?? 0n;
    net += lamportsWorth(c.mint, gross > theirs ? gross - theirs : 0n, prices.get(c.mint)) ?? 0n;
  }
  return net;
}

/** What one spending row has been allotted, has spent and has left, in lamports. */
export type RowBudget = { shareBps: number; allotted: bigint; spent: bigint; available: bigint };

export type Budgets = {
  /** The Platform Net so far, valued in SOL at the Quote Registry's latest prices. */
  revenueLamports: bigint;
  inForce: BudgetTable;
  rows: Record<SpendingRow, RowBudget>;
  /** The remainder: what the rows above are not allotted, which the sweep moves to the Treasury. */
  treasury: { shareBps: number; allotted: bigint };
};

/**
 * Every row's budget, from the Ledger and the table's versions alone (ADR 0019). A version's shares apply to the net
 * collected while it is in force: with `C(t)` the net from entries before `t` at the latest prices, a row is allotted
 * the sum over the versions of `(C(next version's start) - C(this version's start)) * share`, the first version
 * starting from nothing and the last running to now. While a row's share has never changed that is its share of the
 * whole net, the formula ADR 0006 had. What a row has left is its allotment less what the Ledger shows it spent.
 */
export async function budgets(db: Db, now = new Date()): Promise<Budgets> {
  const { inEffect, inForce } = split(await budgetVersions(db), now);
  const prices = await quotePrices(db);
  // The net up to each later version's start, then all of it: one figure per version in effect.
  const upTo: bigint[] = [];
  for (const next of [...inEffect.slice(1).map((t) => t.effectiveAt), null]) upTo.push(await netLamports(db, prices, next));
  const net = upTo.at(-1)!;
  const allotted = (row: BudgetRow) => {
    let weighted = 0n;
    inEffect.forEach((t, i) => {
      weighted += (upTo[i]! - (i ? upTo[i - 1]! : 0n)) * BigInt(sharesOf(t)[row]);
    });
    return weighted > 0n ? weighted / BigInt(BUDGET_TOTAL_BPS) : 0n;
  };
  const kinds = Object.values(SPENT_KIND);
  const spentRows = await db
    .select({ kind: ledgerEntries.kind, lamports: sql<string>`coalesce(sum(${ledgerEntries.amount}), 0)::text` })
    .from(ledgerEntries)
    .where(and(inArray(ledgerEntries.kind, kinds), eq(ledgerEntries.assetMint, WSOL)))
    .groupBy(ledgerEntries.kind);
  const spentOf = new Map(spentRows.map((r) => [r.kind, BigInt(r.lamports)]));
  const shares = sharesOf(inForce);
  const rows = Object.fromEntries(SPENDING_ROWS.map((row): [SpendingRow, RowBudget] => {
    const kind = SPENT_KIND[row];
    const total = allotted(row);
    const spent = (kind && spentOf.get(kind)) || 0n;
    return [row, { shareBps: shares[row], allotted: total, spent, available: total > spent ? total - spent : 0n }];
  })) as Record<SpendingRow, RowBudget>;
  const toRows = SPENDING_ROWS.reduce((sum, row) => sum + rows[row].allotted, 0n);
  return { revenueLamports: net, inForce, rows, treasury: { shareBps: shares.treasury, allotted: net > toRows ? net - toRows : 0n } };
}

/** SOL the Fee Collector's sweep must leave in the operations wallet: what every row but the treasury has not spent yet. */
export async function reservedLamports(db: Db) {
  const b = await budgets(db);
  return SPENDING_ROWS.reduce((sum, row) => sum + b.rows[row].available, 0n);
}

/** `GET /v1/budgets`: the net, every version, and each row's allotment, spending and remainder. */
export async function budgetsPage(db: Db, now = new Date()): Promise<BudgetsPage> {
  const [all, b] = [await budgetVersions(db), await budgets(db, now)];
  return {
    netLamports: b.revenueLamports.toString(),
    versions: all.map(tableVersion),
    inForce: b.inForce.version,
    rows: BUDGET_ROWS.map((row) =>
      row === "treasury"
        ? { row, shareBps: b.treasury.shareBps, allottedLamports: b.treasury.allotted.toString(), spentLamports: null, availableLamports: null }
        : {
            row, shareBps: b.rows[row].shareBps, allottedLamports: b.rows[row].allotted.toString(), spentLamports: b.rows[row].spent.toString(),
            availableLamports: b.rows[row].available.toString(),
          },
    ),
  };
}
