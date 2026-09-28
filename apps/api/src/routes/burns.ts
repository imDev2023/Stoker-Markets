import { Hono } from "hono";
import { PublicKey } from "@solana/web3.js";
import { desc, eq, inArray } from "drizzle-orm";
import { WSOL_MINT } from "@launchpad/chain";
import { SetPlatformToken, type BurnsPage, type BurnEvent } from "@launchpad/contract";
import { launches, ledgerEntries, platformSettings } from "@launchpad/db";
import type { AppEnv } from "../env";
import { budgets, budgetsView, flywheelPicks, platformToken, PLATFORM_TOKEN_SETTING } from "../burn/engine";
import { revenueAssets } from "../fees/ledger";

/** Burn and Flywheel, public: the shares, the rule, what has been spent and burned, and every buy and burn so far. */
export const burnRoutes = new Hono<AppEnv>();

burnRoutes.get("/burns", async (c) => {
  const db = c.get("db");
  const cfg = c.get("cfg");
  const token = await platformToken(db);
  const [entries, picks, b] = await Promise.all([
    db.select().from(ledgerEntries).where(inArray(ledgerEntries.kind, ["burn", "flywheel"])).orderBy(desc(ledgerEntries.slot), desc(ledgerEntries.signature), desc(ledgerEntries.eventIndex)).limit(400),
    flywheelPicks(db, cfg.flywheelTopN),
    budgets(db, cfg),
  ]);
  const asset = await revenueAssets(db, cfg.publicApiUrl, new Map(entries.map((e) => [e.assetMint, e.assetDecimals])));
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
  const res: BurnsPage = {
    platformToken: token?.toBase58() ?? null,
    shares: { burnBps: cfg.burnShareBps, flywheelBps: cfg.flywheelShareBps, flywheelTopN: cfg.flywheelTopN },
    rule: `Every run, ${cfg.burnShareBps / 100}% of all revenue so far (valued in SOL at the latest prices), less what earlier runs spent, buys the Platform Token and burns it; ${cfg.flywheelShareBps / 100}% is split equally between the ${cfg.flywheelTopN} graduated coins with the most trading volume over the last 24 hours, each bought and burned. Coins without a SOL route are skipped and their share waits.`,
    budgets: (({ revenueLamports, burn, flywheel }) => ({
      revenueLamports, burn: { spent: burn.spent, available: burn.available }, flywheel: { spent: flywheel.spent, available: flywheel.available },
    }))(budgetsView(b)),
    burned: [...burnedByCoin].map(([mint, amount]) => ({ coin: asset(mint), amount: amount.toString() })),
    nextFlywheel: picks.map((p) => ({ mint: p.mint, symbol: p.symbol })),
    events,
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
