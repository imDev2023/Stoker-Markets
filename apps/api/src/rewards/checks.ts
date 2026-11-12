// The Holding Check (ADR 0022): once in every Holding Day the Reward Engine reads every account of a coin that can have
// a Reward Round and brings the coin's Holding Lots in step with what each wallet holds, which is all that records how
// long a wallet has kept its coins. Only a check writes the lots; a round's snapshot reads them (`snapshot.ts`).
import { PublicKey, type Connection } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { and, asc, eq, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { holdingChecks, holdingLots, launches, type Db } from "@launchpad/db";
import { readCoinAccounts, walletBalances } from "./holders";
import { reconcileLots, type Lot } from "./weights";

/**
 * Coins checked in one run of the Reward Engine. A check is one read of the coin's accounts and one database
 * transaction, so a run stays well within a Cron Trigger's time; with a run every ten minutes that is 3,600 coins a
 * day, and past that the coins unchecked for longest come first, so each is still checked as often as the runs allow.
 */
export const HOLDING_CHECKS_PER_RUN = 25;
/** Lots written per statement. */
const WRITE_CHUNK = 500;

/** One coin's Holding Check, as the job's summary carries it: the wallets holding, and the lots it changed. */
export type CoinCheck = { mint: string; wallets: number; opened: number; reduced: number; removed: number };

export type HoldingChecksSummary = {
  /** The Holding Day the run fell in, counted from the epoch. */
  day: number;
  checked: CoinCheck[];
  /** Coins still due a check today that this run left to the next ones. */
  leftForLater: number;
};

/** The Holding Day a moment falls in: days `daySeconds` long, counted from the epoch, so UTC days in production. */
export const holdingDay = (at: Date, daySeconds: number) => Math.floor(at.getTime() / 1000 / daySeconds);

/**
 * The run's Holding Checks: at most `limit` of the coins that can have a round (every Reward Launch, and every coin
 * whose Creator Earnings go to its holders, both fixed at launch) and have no check in the Holding Day `now` falls in.
 * The coins never checked come first, then the ones unchecked for longest. One coin's failure is a problem in the
 * summary and never keeps the others from being checked.
 */
export async function runHoldingChecks(
  db: Db, connection: Connection, operationsWallet: PublicKey, daySeconds: number, now: Date, problems: string[], limit = HOLDING_CHECKS_PER_RUN,
): Promise<HoldingChecksSummary> {
  const day = holdingDay(now, daySeconds);
  const latest = db.select({ mint: holdingChecks.mint, day: sql<number>`max(${holdingChecks.day})`.as("latest_day") }).from(holdingChecks).groupBy(holdingChecks.mint).as("latest");
  const due = await db
    .select({ mint: launches.mint, symbol: launches.symbol, taxed: sql<boolean>`${launches.rewardTaxBps} is not null` })
    .from(launches)
    .leftJoin(latest, eq(latest.mint, launches.mint))
    .where(and(or(isNotNull(launches.rewardTaxBps), eq(launches.earningsDestination, "holders")), or(isNull(latest.day), lt(latest.day, day))))
    .orderBy(sql`${latest.day} asc nulls first`, asc(launches.createdSlot), asc(launches.mint));
  const summary: HoldingChecksSummary = { day, checked: [], leftForLater: Math.max(0, due.length - limit) };
  for (const coin of due.slice(0, limit)) {
    try {
      const check = await checkCoin(db, connection, operationsWallet, coin, day, now);
      if (check) summary.checked.push(check);
    } catch (e) {
      problems.push(`Holding Check of ${coin.symbol} (${coin.mint}): ${(e as Error).message}`);
    }
  }
  return summary;
}

/**
 * One coin's Holding Check for one Holding Day: reads every account of the coin, then, in one database transaction,
 * writes the day's `holding_checks` row and every change to the coin's lots. The row goes in first: if the day already
 * has one (another run got there), nothing more is done, so a day is checked once or not at all. Returns null then.
 *
 * The wallets are the ones a round counts, whatever they hold: owners on the ed25519 curve other than the operations
 * wallet. A wallet under the rules' minimum holding is recorded too. A new lot's `since` is the check's own time.
 */
async function checkCoin(db: Db, connection: Connection, operationsWallet: PublicKey, coin: { mint: string; taxed: boolean }, day: number, now: Date): Promise<CoinCheck | null> {
  const slot = await connection.getSlot("confirmed");
  // A Reward Launch's coin is always a Token-2022 mint; any other coin's program is read from the mint.
  const accounts = await readCoinAccounts(connection, new PublicKey(coin.mint), coin.taxed ? TOKEN_2022_PROGRAM_ID : undefined);
  const balances = walletBalances(accounts, operationsWallet);
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(holdingChecks).values({ mint: coin.mint, day, slot, checkedAt: now, wallets: balances.size }).onConflictDoNothing().returning({ day: holdingChecks.day });
    if (!row) return null;
    const { opened, reduced, removed } = reconcileLots(await lotsOf(tx, coin.mint), balances);
    for (let i = 0; i < opened.length; i += WRITE_CHUNK)
      await tx.insert(holdingLots).values(opened.slice(i, i + WRITE_CHUNK).map((l) => ({ mint: coin.mint, wallet: l.wallet, since: now, amount: l.amount.toString() })));
    // A lot is named by its wallet and its `since`; the times go as text and are cast, as a Date parameter cannot be.
    for (let i = 0; i < reduced.length; i += WRITE_CHUNK) {
      const rows = reduced.slice(i, i + WRITE_CHUNK).map((l) => sql`(${l.wallet}::text, ${l.since.toISOString()}::timestamptz, ${l.amount.toString()}::numeric)`);
      await tx.execute(sql`
        update holding_lots as l set amount = v.amount
        from (values ${sql.join(rows, sql`, `)}) as v(wallet, since, amount)
        where l.mint = ${coin.mint} and l.wallet = v.wallet and l.since = v.since`);
    }
    for (let i = 0; i < removed.length; i += WRITE_CHUNK) {
      const rows = removed.slice(i, i + WRITE_CHUNK).map((l) => sql`(${l.wallet}::text, ${l.since.toISOString()}::timestamptz)`);
      await tx.execute(sql`
        delete from holding_lots as l using (values ${sql.join(rows, sql`, `)}) as v(wallet, since)
        where l.mint = ${coin.mint} and l.wallet = v.wallet and l.since = v.since`);
    }
    return { mint: coin.mint, wallets: balances.size, opened: opened.length, reduced: reduced.length, removed: removed.length };
  });
}

/** A coin's Holding Lots by wallet, each wallet's oldest first: every wallet's, or one wallet's. */
export async function lotsOf(db: Pick<Db, "select">, mint: string, wallet?: string): Promise<Map<string, Lot[]>> {
  const rows = await db
    .select({ wallet: holdingLots.wallet, since: holdingLots.since, amount: holdingLots.amount })
    .from(holdingLots)
    .where(and(eq(holdingLots.mint, mint), wallet ? eq(holdingLots.wallet, wallet) : undefined))
    .orderBy(asc(holdingLots.wallet), asc(holdingLots.since));
  const byWallet = new Map<string, Lot[]>();
  for (const r of rows) {
    const lot = { since: r.since, amount: BigInt(r.amount) };
    const own = byWallet.get(r.wallet);
    if (own) own.push(lot);
    else byWallet.set(r.wallet, [lot]);
  }
  return byWallet;
}

/** A coin's latest Holding Check, or null for a coin never checked. */
export async function latestCheck(db: Pick<Db, "select">, mint: string) {
  const [check] = await db
    .select({ checkedAt: holdingChecks.checkedAt, slot: holdingChecks.slot })
    .from(holdingChecks)
    .where(eq(holdingChecks.mint, mint))
    .orderBy(sql`${holdingChecks.day} desc`)
    .limit(1);
  return check ?? null;
}
