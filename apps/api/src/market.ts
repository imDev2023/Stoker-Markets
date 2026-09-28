import { sql } from "drizzle-orm";
import { launchMarkets, trades, type Db } from "@launchpad/db";

/**
 * Opens a Launch's market at its curve's starting price, so the board has a market cap for it before anyone trades.
 * A trade indexed before its launch (webhooks don't promise order) already opened it at a later price, which stays.
 */
export async function openMarket(db: Db, mint: string, price: number, slot: number) {
  await db.insert(launchMarkets).values({ mint, price, priceSlot: slot }).onConflictDoNothing();
}

/**
 * Writes one trade of a Launch's coin and moves its market to the trade's price. Every trade, on the curve or in the
 * coin's pool after Graduation, goes through here, so the board's prices, market caps and volumes follow the coin
 * wherever it trades. Returns whether the trade is new; a replay changes nothing.
 * Within one slot the trade indexed last sets the price, since trades in different transactions of a slot have no order
 * we can see.
 */
export async function insertTrade(db: Db, row: typeof trades.$inferInsert) {
  const inserted = await db.insert(trades).values(row).onConflictDoNothing().returning({ signature: trades.signature });
  if (inserted.length === 0) return false;
  await db
    .insert(launchMarkets)
    .values({ mint: row.mint, price: row.priceAfter, priceSlot: row.slot, lastTradeAt: row.blockTime })
    .onConflictDoUpdate({
      target: launchMarkets.mint,
      set: {
        price: sql`case when excluded.price_slot >= ${launchMarkets.priceSlot} then excluded.price else ${launchMarkets.price} end`,
        priceSlot: sql`greatest(excluded.price_slot, ${launchMarkets.priceSlot})`,
        lastTradeAt: sql`greatest(excluded.last_trade_at, ${launchMarkets.lastTradeAt})`,
        updatedAt: sql`now()`,
      },
    });
  return true;
}
