import { Hono } from "hono";
import { and, asc, count, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import type { CreatorRecord, LaunchTrust, Sniper } from "@launchpad/contract";
import { graduations, launches, trades, type Db } from "@launchpad/db";
import type { AppEnv } from "../env";

/**
 * A coin's trust figures (#41, ADR 0013): the Creator's record and First Buy, and Bundle Radar, the wallets that bought
 * in the Snipe Window (the launch's slot and `SNIPE_WINDOW_SLOTS` after it) and what they hold by their trades since.
 * Everything is computed from the indexed trades and launches on each request, nothing is stored, so what the page says
 * can be recomputed from the public API by anyone; a label informs and never stops a trade.
 */
export const trustRoutes = new Hono<AppEnv>();

/** Snipers listed per coin: a hot launch's first slots can hold hundreds of buys, and the page shows the largest. */
const SNIPERS_LISTED = 50;

const share = (amount: bigint, supply: bigint) => (supply === 0n ? 0 : Number((amount * 1_000_000_000n) / supply) / 1_000_000_000);

trustRoutes.get("/launches/:mint/trust", async (c) => {
  const db = c.get("db");
  const [launch] = await db
    .select({ mint: launches.mint, creator: launches.creator, supply: launches.supply, createdSlot: launches.createdSlot, createdSignature: launches.createdSignature })
    .from(launches)
    .where(eq(launches.mint, c.req.param("mint")))
    .limit(1);
  if (!launch) return c.json({ error: "launch not found" }, 404);
  const windowSlots = c.get("cfg").snipeWindowSlots;
  const supply = BigInt(launch.supply);
  const [snipers, creator] = await Promise.all([radar(db, launch, supply, windowSlots), creatorRecord(db, launch, supply)]);
  const body: LaunchTrust = { mint: launch.mint, supply: launch.supply, creator, snipers };
  return c.json(body);
});

type LaunchRow = { mint: string; creator: string; createdSlot: number; createdSignature: string };

/** The buys inside the window by anyone but the Creator, grouped by wallet, and what those wallets hold by their trades. */
async function radar(db: Db, launch: LaunchRow, supply: bigint, windowSlots: number) {
  const inWindow = and(
    eq(trades.mint, launch.mint),
    eq(trades.side, "buy"),
    ne(trades.trader, launch.creator),
    gte(trades.slot, launch.createdSlot),
    lte(trades.slot, launch.createdSlot + windowSlots),
  );
  const buys = await db
    .select({ trader: trades.trader, slot: trades.slot, baseAmount: trades.baseAmount, quoteAmount: trades.quoteAmount })
    .from(trades)
    .where(inWindow)
    .orderBy(asc(trades.slot), asc(trades.signature), asc(trades.eventIndex));

  // What one bundle's wallets have in common is the amount each paid, to the raw unit.
  const walletsByAmount = new Map<string, Set<string>>();
  for (const b of buys) walletsByAmount.set(b.quoteAmount, (walletsByAmount.get(b.quoteAmount) ?? new Set()).add(b.trader));

  const byWallet = new Map<string, { firstSlot: number; bought: bigint; sameAmountAs: number }>();
  for (const b of buys) {
    const w = byWallet.get(b.trader) ?? { firstSlot: b.slot, bought: 0n, sameAmountAs: 0 };
    w.bought += BigInt(b.baseAmount);
    w.sameAmountAs = Math.max(w.sameAmountAs, (walletsByAmount.get(b.quoteAmount)?.size ?? 1) - 1);
    byWallet.set(b.trader, w);
  }

  // Held by trades: every buy less every sell of each sniper since launch, on the curve and in the pool alike.
  const held = new Map<string, bigint>();
  if (byWallet.size > 0) {
    const sums = await db
      .select({ trader: trades.trader, side: trades.side, amount: sql<string>`sum(${trades.baseAmount})` })
      .from(trades)
      .where(and(eq(trades.mint, launch.mint), inArray(trades.trader, [...byWallet.keys()])))
      .groupBy(trades.trader, trades.side);
    for (const s of sums) held.set(s.trader, (held.get(s.trader) ?? 0n) + (s.side === "buy" ? 1n : -1n) * BigInt(s.amount));
  }

  const wallets: Sniper[] = [...byWallet]
    .map(([wallet, w]) => {
      const kept = held.get(wallet) ?? 0n;
      const holds = kept > 0n ? kept : 0n;
      return {
        wallet,
        slotsAfterLaunch: w.firstSlot - launch.createdSlot,
        bought: w.bought.toString(),
        boughtShare: share(w.bought, supply),
        held: holds.toString(),
        heldShare: share(holds, supply),
        sameAmountAs: w.sameAmountAs,
      };
    })
    .sort((a, b) => (a.bought === b.bought ? a.slotsAfterLaunch - b.slotsAfterLaunch : BigInt(a.bought) > BigInt(b.bought) ? -1 : 1));
  const bought = wallets.reduce((sum, w) => sum + BigInt(w.bought), 0n);
  const heldAll = wallets.reduce((sum, w) => sum + BigInt(w.held), 0n);
  return {
    windowSlots,
    wallets: wallets.slice(0, SNIPERS_LISTED),
    boughtShare: share(bought, supply),
    heldShare: share(heldAll, supply),
    inLaunchSlot: wallets.filter((w) => w.slotsAfterLaunch === 0).length,
    sameAmount: wallets.filter((w) => w.sameAmountAs > 0).length,
  };
}

/** How many coins the Creator has launched here and how many graduated, and their First Buy in this launch's own transaction. */
async function creatorRecord(db: Db, launch: LaunchRow, supply: bigint): Promise<CreatorRecord> {
  const [[record], [firstBuy]] = await Promise.all([
    db
      .select({ launches: count(launches.mint), graduated: count(graduations.mint) })
      .from(launches)
      .leftJoin(graduations, eq(graduations.mint, launches.mint))
      .where(eq(launches.creator, launch.creator)),
    db
      .select({ amount: sql<string>`sum(${trades.baseAmount})` })
      .from(trades)
      .where(and(eq(trades.signature, launch.createdSignature), eq(trades.trader, launch.creator), eq(trades.side, "buy"))),
  ]);
  const amount = firstBuy?.amount ? BigInt(firstBuy.amount) : 0n;
  return {
    address: launch.creator,
    launches: record?.launches ?? 1,
    graduated: record?.graduated ?? 0,
    firstBuy: amount > 0n ? { amount: amount.toString(), share: share(amount, supply) } : null,
  };
}
