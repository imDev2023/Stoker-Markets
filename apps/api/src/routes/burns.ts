import { Hono } from "hono";
import { PublicKey } from "@solana/web3.js";
import { and, countDistinct, desc, eq, inArray, sql } from "drizzle-orm";
import { WSOL_MINT } from "@launchpad/chain";
import { SetBudgetDestinations, SetPlatformToken, type BurnsPage, type BurnEvent, type LiquidityAdditionEvent } from "@launchpad/contract";
import { feeKeys, launches, ledgerEntries, platformSettings } from "@launchpad/db";
import type { AppEnv } from "../env";
import { budgetsView, flywheelPicks, platformToken, PLATFORM_TOKEN_SETTING } from "../burn/engine";
import { budgetDestinations, LIQUIDITY_KIND, setBudgetDestinations, type Destinations } from "../burn/liquidity";
import { budgets } from "../fees/budget";
import { revenueAssets } from "../fees/ledger";

const WSOL = WSOL_MINT.toBase58();
const ADDITION_KINDS = Object.values(LIQUIDITY_KIND);
/** How many additions the page lists, newest first; the totals count every one. */
const ADDITIONS_SHOWN = 100;

/** The published rule, in words, as the destinations stand. */
function ruleText(shares: { burnBps: number; flywheelBps: number }, topN: number, d: Destinations) {
  const burn = d.burn === "liquidity"
    ? "buys the Platform Token in its own pool and adds it, with as much SOL again, to that pool as liquidity locked for good"
    : "buys the Platform Token and burns it";
  const flywheel = d.flywheel === "liquidity" ? "each bought and added to its own pool as locked liquidity" : "each bought and burned";
  const added = d.burn === "liquidity" || d.flywheel === "liquidity"
    ? " Liquidity is added only to pools paired with SOL, and each addition is a locked position whose fees the platform collects as revenue."
    : "";
  return `Every run, the Burn's share of what the platform keeps after the Creators' share, ${shares.burnBps / 100}% (valued in SOL at the latest prices), less what earlier runs spent, ${burn}; the Flywheel's share, ${shares.flywheelBps / 100}%, is split equally between the ${topN} graduated coins with the most trading volume over the last 24 hours, ${flywheel}. Coins without a SOL route are skipped and their share waits.${added} A changed share is announced ahead and applies only to what is collected after it takes effect.`;
}

/** Burn and Flywheel, public: the shares, the rule, what has been spent and burned, and every buy and burn so far. */
export const burnRoutes = new Hono<AppEnv>();

burnRoutes.get("/burns", async (c) => {
  const db = c.get("db");
  const cfg = c.get("cfg");
  const token = await platformToken(db);
  const [entries, picks, b, destinations, additions, [added]] = await Promise.all([
    db.select().from(ledgerEntries).where(inArray(ledgerEntries.kind, ["burn", "flywheel"])).orderBy(desc(ledgerEntries.slot), desc(ledgerEntries.signature), desc(ledgerEntries.eventIndex)).limit(400),
    flywheelPicks(db, cfg.flywheelTopN),
    budgets(db),
    budgetDestinations(db),
    // Two entries per addition: the SOL that went into the pool, and the coins, to the locked position.
    db
      .select({ entry: ledgerEntries, feeKey: feeKeys.nftMint })
      .from(ledgerEntries)
      .leftJoin(feeKeys, and(eq(ledgerEntries.eventIndex, 1), eq(feeKeys.lockedLiquidity, ledgerEntries.destination)))
      .where(inArray(ledgerEntries.kind, ADDITION_KINDS))
      .orderBy(desc(ledgerEntries.slot), desc(ledgerEntries.signature), desc(ledgerEntries.eventIndex))
      .limit(ADDITIONS_SHOWN * 2),
    db
      .select({
        lamports: sql<string>`coalesce(sum(${ledgerEntries.amount}), 0)::text`,
        count: countDistinct(ledgerEntries.signature),
        pools: countDistinct(ledgerEntries.destination),
      })
      .from(ledgerEntries)
      .where(and(inArray(ledgerEntries.kind, ADDITION_KINDS), eq(ledgerEntries.assetMint, WSOL))),
  ]);
  const shares = { burnBps: b.rows.burn.shareBps, flywheelBps: b.rows.flywheel.shareBps };
  const asset = await revenueAssets(
    db, cfg.publicApiUrl, new Map([...entries, ...additions.map((a) => a.entry)].map((e) => [e.assetMint, e.assetDecimals])),
  );
  // Two Ledger rows per burn: the SOL spent, and the coins destroyed; shown as one event.
  const bySignature = new Map<string, BurnEvent>();
  for (const e of entries) {
    const event = bySignature.get(e.signature) ?? {
      signature: e.signature, kind: e.kind as "burn" | "flywheel", coin: asset(e.assetMint), lamports: "0", amount: "0", slot: e.slot, time: e.blockTime.toISOString(),
    };
    if (e.assetMint === WSOL_MINT.toBase58()) event.lamports = e.amount;
    else {
      event.amount = e.amount;
      event.coin = asset(e.assetMint);
    }
    bySignature.set(e.signature, event);
  }
  const events = [...bySignature.values()];
  const burnedByCoin = new Map<string, bigint>();
  for (const e of events) burnedByCoin.set(e.coin.mint, (burnedByCoin.get(e.coin.mint) ?? 0n) + BigInt(e.amount));
  const bySignatureAdded = new Map<string, LiquidityAdditionEvent>();
  for (const { entry: e, feeKey } of additions) {
    const event = bySignatureAdded.get(e.signature) ?? {
      signature: e.signature, kind: e.kind === LIQUIDITY_KIND.burn ? "burn" as const : "flywheel" as const, coin: asset(e.launchMint ?? e.assetMint),
      lamports: "0", amount: "0", position: e.destination, feeKey: null, slot: e.slot, time: e.blockTime.toISOString(),
    };
    if (e.assetMint === WSOL) event.lamports = e.amount;
    else Object.assign(event, { amount: e.amount, coin: asset(e.assetMint), position: e.destination, feeKey });
    bySignatureAdded.set(e.signature, event);
  }
  const res: BurnsPage = {
    platformToken: token?.toBase58() ?? null,
    // The shares are the Budget Table's rows in force (ADR 0019); each applies to what is collected while its version is.
    shares: { ...shares, flywheelTopN: cfg.flywheelTopN },
    destinations,
    rule: ruleText(shares, cfg.flywheelTopN, destinations),
    budgets: (({ revenueLamports, burn, flywheel }) => ({
      revenueLamports, burn: { spent: burn.spent, available: burn.available }, flywheel: { spent: flywheel.spent, available: flywheel.available },
    }))(budgetsView(b)),
    burned: [...burnedByCoin].map(([mint, amount]) => ({ coin: asset(mint), amount: amount.toString() })),
    nextFlywheel: picks.map((p) => ({ mint: p.mint, symbol: p.symbol })),
    events,
    liquidity: { lamports: added!.lamports, count: added!.count, pools: added!.pools, additions: [...bySignatureAdded.values()].slice(0, ADDITIONS_SHOWN) },
  };
  return c.json(res);
});

/** Operator: names the Platform Token, once it has launched on our platform; the Burn stays idle until then. */
export const operatorBurnRoutes = new Hono<AppEnv>();

operatorBurnRoutes.put("/platform-token", async (c) => {
  const body = SetPlatformToken.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "invalid Platform Token", details: body.error.issues }, 400);
  const db = c.get("db");
  const mint = new PublicKey(body.data.mint).toBase58();
  const [launch] = await db.select({ mint: launches.mint }).from(launches).where(eq(launches.mint, mint)).limit(1);
  if (!launch) return c.json({ error: "The Platform Token must be a coin launched on this platform." }, 422);
  await db
    .insert(platformSettings)
    .values({ key: PLATFORM_TOKEN_SETTING, value: mint })
    .onConflictDoUpdate({ target: platformSettings.key, set: { value: mint, updatedAt: new Date() } });
  return c.json({ platformToken: mint });
});

/**
 * Operator: points the Burn's or the Flywheel's budget at `burn` or `liquidity` (#184), effective from the next run.
 * A destination is where the budget's buys go, not how big it is: the shares stay the Budget Table's, announced ahead.
 */
operatorBurnRoutes.put("/budget-destinations", async (c) => {
  const body = SetBudgetDestinations.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "invalid budget destinations", details: body.error.issues }, 400);
  return c.json({ destinations: await setBudgetDestinations(c.get("db"), body.data) });
});
