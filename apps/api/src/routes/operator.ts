// The operator view and fee-change announcements (#22).
import { Hono } from "hono";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import BN from "bn.js";
import { cpmmCoder, launchlabCoder, listGlobalConfigs, RATE_DENOMINATOR, updatePlatformConfigIx, WSOL_MINT, type PlatformConfigInfo } from "@launchpad/chain";
import {
  AnnounceFeeChange, PrepareFeeChange, type FeeAnnouncement, type FeeAnnouncementList, type OperatorOverview, type PreparedFeeChange,
} from "@launchpad/contract";
import {
  curves, feeAnnouncements, graduations, jobRuns, launches, ledgerEntries, operatorAlerts, platformSettings, quoteAssets, rewardRounds, type Db,
} from "@launchpad/db";
import type { AppEnv, Config } from "../env";
import { toJobRun } from "../jobs";
import { uploadCounts } from "../metadata";

/** Where the fees as last read from the chain are kept, so every page can show them without an RPC call. */
export const FEE_SETTINGS = {
  platform: "platform_fee_bps", creator: "creator_fee_bps", poolCreator: "pool_creator_fee_bps",
  // The share of the pool creator fee Raydium keeps when it is collected, in basis points of that fee (5% on mainnet).
  poolCreatorShare: "pool_creator_fee_share_bps",
  // Raydium's own fee on a trade: the GlobalConfig's trade fee on the curve, the CPMM config's trade fee after Graduation.
  raydiumCurve: "raydium_curve_fee_bps", raydiumPool: "raydium_pool_fee_bps",
} as const;

export const operatorViewRoutes = new Hono<AppEnv>();

/** Everything at a glance, for support: Launches by status, rounds, burns, the latest run of each job, open alerts. */
operatorViewRoutes.get("/overview", async (c) => {
  const db = c.get("db");
  const cfg = c.get("cfg");
  const status = sql<string>`case when ${graduations.mint} is not null then 'graduated' else coalesce(${curves.status}, 'live') end`;
  const [byStatus, rewardCount, rounds, burns, latestRuns, openAlerts, fees, metadataUploads] = await Promise.all([
    db
      .select({ status, n: count() })
      .from(launches)
      .leftJoin(curves, eq(curves.mint, launches.mint))
      .leftJoin(graduations, eq(graduations.mint, launches.mint))
      .groupBy(status),
    db.select({ n: count() }).from(launches).where(sql`${launches.rewardTaxBps} is not null`),
    db.select({ status: rewardRounds.status, n: count() }).from(rewardRounds).groupBy(rewardRounds.status),
    db.select({ n: sql<number>`count(distinct ${ledgerEntries.signature})::int` }).from(ledgerEntries).where(sql`${ledgerEntries.kind} in ('burn', 'flywheel')`),
    db.selectDistinctOn([jobRuns.job]).from(jobRuns).orderBy(jobRuns.job, desc(jobRuns.startedAt)),
    db.select({ n: count() }).from(operatorAlerts).where(isNull(operatorAlerts.resolvedAt)),
    platformFees(db, cfg),
    uploadCounts(db),
  ]);
  const n = (rows: { status: string; n: number }[], s: string) => rows.find((r) => r.status === s)?.n ?? 0;
  const res: OperatorOverview = {
    launches: {
      total: byStatus.reduce((s, r) => s + r.n, 0),
      byStatus: { live: n(byStatus, "live"), graduating: n(byStatus, "graduating"), graduated: n(byStatus, "graduated") },
      reward: rewardCount[0]!.n,
    },
    rewardRounds: { paying: n(rounds, "paying"), paid: n(rounds, "paid") },
    burns: burns[0]!.n,
    metadataUploads,
    jobs: latestRuns.map(toJobRun),
    openAlerts: openAlerts[0]!.n,
    fees,
  };
  return c.json(res);
});

const announcement = (a: typeof feeAnnouncements.$inferSelect): FeeAnnouncement => ({
  id: a.id,
  platformFeeBps: a.platformFeeBps,
  creatorFeeBps: a.creatorFeeBps,
  note: a.note,
  announcedAt: a.announcedAt.toISOString(),
  effectiveAt: a.effectiveAt.toISOString(),
  appliedSignature: a.appliedSignature,
  appliedAt: a.appliedAt?.toISOString() ?? null,
});

/** Public: every announced fee change, newest first, so a change to every live curve never comes as a surprise. */
export const announcementRoutes = new Hono<AppEnv>();

announcementRoutes.get("/announcements", async (c) => {
  const rows = await c.get("db").select().from(feeAnnouncements).orderBy(desc(feeAnnouncements.effectiveAt)).limit(100);
  const res: FeeAnnouncementList = { announcements: rows.map(announcement) };
  return c.json(res);
});

/**
 * Operator: announces a Platform Fee or Creator Fee change, and once its lead time has passed prepares the
 * `update_platform_config` transaction for the cold admin key to sign (ADR 0004). Rates are in basis points; LaunchLab
 * stores them in its 1e6 denominator.
 */
export const operatorFeeRoutes = new Hono<AppEnv>();

operatorFeeRoutes.post("/fees/announce", async (c) => {
  const body = AnnounceFeeChange.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "invalid fee change", details: body.error.issues }, 400);
  const cfg = c.get("cfg");
  const now = new Date();
  const effectiveAt = new Date(body.data.effectiveAt);
  const lead = cfg.feeChangeLeadSeconds;
  if (effectiveAt.getTime() < now.getTime() + lead * 1000)
    return c.json({ error: `A fee change applies to every live curve at once, so it takes effect no sooner than ${lead} seconds after it is announced.` }, 422);
  const [row] = await c
    .get("db")
    .insert(feeAnnouncements)
    .values({ id: crypto.randomUUID(), platformFeeBps: body.data.platformFeeBps, creatorFeeBps: body.data.creatorFeeBps, note: body.data.note ?? null, announcedAt: now, effectiveAt })
    .returning();
  return c.json(announcement(row!), 201);
});

operatorFeeRoutes.post("/fees/prepare", async (c) => {
  const body = PrepareFeeChange.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "invalid request", details: body.error.issues }, 400);
  const db = c.get("db");
  const cfg = c.get("cfg");
  const [a] = await db.select().from(feeAnnouncements).where(eq(feeAnnouncements.id, body.data.id)).limit(1);
  if (!a) return c.json({ error: "no such announcement" }, 404);
  if (a.appliedSignature) return c.json({ error: "this change has already been applied", details: { signature: a.appliedSignature } }, 409);
  if (a.effectiveAt.getTime() > Date.now())
    return c.json({ error: `This change takes effect at ${a.effectiveAt.toISOString()}; it can't be prepared before then.` }, 422);
  const connection = new Connection(cfg.rpcUrl, "confirmed");
  const { admin, info, cpswapConfig } = await currentPlatformInfo(connection, cfg);
  const toRate = (bps: number) => new BN((bps * RATE_DENOMINATOR) / 10_000);
  const next: PlatformConfigInfo = { ...info, feeRate: toRate(a.platformFeeBps), creatorFeeRate: toRate(a.creatorFeeBps) };
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  // `AllInfo` checks the platform's CPMM config against the account passed alongside, so the current one goes with it.
  const tx = new Transaction({ feePayer: admin, blockhash, lastValidBlockHeight }).add(updatePlatformConfigIx(cfg.launchlab, admin, { AllInfo: [next] }, [cpswapConfig]));
  const res: PreparedFeeChange = {
    id: a.id,
    admin: admin.toBase58(),
    platformFeeBps: a.platformFeeBps,
    creatorFeeBps: a.creatorFeeBps,
    transaction: Buffer.from(tx.serialize({ requireAllSignatures: false, verifySignatures: false })).toString("base64"),
    lastValidBlockHeight,
  };
  return c.json(res);
});

type PlatformConfigData = {
  platform_fee_wallet: PublicKey; platform_nft_wallet: PublicKey; platform_scale: BN; creator_scale: BN; burn_scale: BN; fee_rate: BN;
  name: number[]; web: number[]; img: number[]; cpswap_config: PublicKey; transfer_fee_extension_auth: PublicKey; creator_fee_rate: BN;
  platform_vesting_scale: BN; platform_vesting_wallet: PublicKey;
};

/** The PlatformConfig as it is, and its admin (the address it is derived from, found among its own fields). */
async function currentPlatformInfo(connection: Connection, cfg: Config) {
  const account = await connection.getAccountInfo(cfg.platformConfig, "confirmed");
  if (!account) throw new Error("PlatformConfig not found");
  const p = launchlabCoder.accounts.decode("PlatformConfig", account.data) as PlatformConfigData;
  const text = (bytes: number[]) => Buffer.from(bytes).toString("utf8").replace(/\0+$/, "");
  const info: PlatformConfigInfo = {
    feeWallet: p.platform_fee_wallet,
    nftWallet: p.platform_nft_wallet,
    migrateNftInfo: { platformScale: p.platform_scale, creatorScale: p.creator_scale, burnScale: p.burn_scale },
    feeRate: p.fee_rate,
    name: text(p.name),
    web: text(p.web),
    img: text(p.img),
    transferFeeExtensionAuth: p.transfer_fee_extension_auth,
    creatorFeeRate: p.creator_fee_rate,
    platformVestingScale: p.platform_vesting_scale,
    vestingWallet: p.platform_vesting_wallet,
  };
  return { admin: cfg.platformAdmin, info, cpswapConfig: p.cpswap_config };
}

const toBps = (rate: BN) => (rate.toNumber() * 10_000) / RATE_DENOMINATOR;

export type PlatformFees = {
  platformFeeBps: number;
  creatorFeeBps: number;
  /** The creator fee of the CPMM config graduated pools use, which the platform collects. */
  poolCreatorFeeBps: number;
  /**
   * The share of that creator fee Raydium keeps for itself when it is collected (`creator_fee_share_rate` on the CPMM
   * config), in basis points of the fee: 500 on mainnet's 1% config, so the platform receives 0.95% of a pool trade.
   */
  poolCreatorFeeShareBps: number;
  /** Raydium's own fee on a curve trade, from SOL's GlobalConfig (every GlobalConfig charged the same on 2026-10-25). */
  raydiumCurveFeeBps: number;
  /** Raydium's own fee on a pool trade, the CPMM config's trade fee. */
  raydiumPoolFeeBps: number;
};

/**
 * The fees as the chain has them now: the curve's Platform Fee and Creator Fee from the PlatformConfig, the creator fee
 * of the CPMM config its graduated pools use, which the platform collects after Graduation, and Raydium's own fee on
 * either venue, which a trader pays on top. SOL's GlobalConfig stands for every Quote Asset's: the registry has its
 * address, or the chain is listed for it on a stack whose registry has not run yet.
 */
async function feesOnChain(db: Db, connection: Connection, cfg: Config): Promise<PlatformFees> {
  const { info, cpswapConfig } = await currentPlatformInfo(connection, cfg);
  const [sol] = await db.select({ globalConfig: quoteAssets.globalConfig }).from(quoteAssets).where(eq(quoteAssets.mint, WSOL_MINT.toBase58())).limit(1);
  const solConfig = sol ? new PublicKey(sol.globalConfig) : (await listGlobalConfigs(connection, cfg.launchlab)).find((g) => g.quoteMint.equals(WSOL_MINT))?.address;
  if (!solConfig) throw new Error("no LaunchLab GlobalConfig quotes SOL on this chain");
  const [cpmm, global] = await connection.getMultipleAccountsInfo([cpswapConfig, solConfig], "confirmed");
  if (!cpmm) throw new Error(`the PlatformConfig's CPMM config ${cpswapConfig.toBase58()} was not found`);
  if (!global) throw new Error(`SOL's GlobalConfig ${solConfig.toBase58()} was not found`);
  const { creator_fee_rate, trade_fee_rate, creator_fee_share_rate } = cpmmCoder.accounts.decode("AmmConfig", cpmm.data) as {
    creator_fee_rate: BN; trade_fee_rate: BN; creator_fee_share_rate: BN;
  };
  const g = launchlabCoder.accounts.decode("GlobalConfig", global.data) as { trade_fee_rate: BN };
  return {
    platformFeeBps: toBps(info.feeRate), creatorFeeBps: toBps(info.creatorFeeRate), poolCreatorFeeBps: toBps(creator_fee_rate),
    poolCreatorFeeShareBps: toBps(creator_fee_share_rate), raydiumCurveFeeBps: toBps(g.trade_fee_rate), raydiumPoolFeeBps: toBps(trade_fee_rate),
  };
}

/**
 * The Platform Fee and Creator Fee in basis points, and the pool creator fee after Graduation, as last read from the
 * chain: the Quote Registry refresh reads them every run and the Indexer records every change as it lands, so they are
 * served from the database; the chain is only asked when one has not been recorded yet.
 */
export async function platformFees(db: Db, cfg: Config): Promise<PlatformFees> {
  const keys = Object.values(FEE_SETTINGS);
  const rows = await db.select().from(platformSettings).where(inArray(platformSettings.key, keys));
  const value = (key: string) => rows.find((r) => r.key === key)?.value;
  const [platform, creator, poolCreator, poolCreatorShare, raydiumCurve, raydiumPool] = keys.map(value);
  if (platform !== undefined && creator !== undefined && poolCreator !== undefined && poolCreatorShare !== undefined && raydiumCurve !== undefined && raydiumPool !== undefined)
    return {
      platformFeeBps: Number(platform), creatorFeeBps: Number(creator), poolCreatorFeeBps: Number(poolCreator), poolCreatorFeeShareBps: Number(poolCreatorShare),
      raydiumCurveFeeBps: Number(raydiumCurve), raydiumPoolFeeBps: Number(raydiumPool),
    };
  const fees = await feesOnChain(db, new Connection(cfg.rpcUrl, "confirmed"), cfg);
  await recordPlatformFees(db, fees);
  return fees;
}

/** Writes the fees as the chain has them, from a fresh read or a change the Indexer saw land (which names the curve's two). */
export async function recordPlatformFees(db: Db, fees: { platformFeeBps: number; creatorFeeBps: number } & Partial<PlatformFees>) {
  const values = [
    [FEE_SETTINGS.platform, fees.platformFeeBps], [FEE_SETTINGS.creator, fees.creatorFeeBps],
    ...(fees.poolCreatorFeeBps === undefined ? [] : [[FEE_SETTINGS.poolCreator, fees.poolCreatorFeeBps] as const]),
    ...(fees.poolCreatorFeeShareBps === undefined ? [] : [[FEE_SETTINGS.poolCreatorShare, fees.poolCreatorFeeShareBps] as const]),
    ...(fees.raydiumCurveFeeBps === undefined ? [] : [[FEE_SETTINGS.raydiumCurve, fees.raydiumCurveFeeBps] as const]),
    ...(fees.raydiumPoolFeeBps === undefined ? [] : [[FEE_SETTINGS.raydiumPool, fees.raydiumPoolFeeBps] as const]),
  ] as const;
  for (const [key, value] of values)
    await db
      .insert(platformSettings)
      .values({ key, value: String(value) })
      .onConflictDoUpdate({ target: platformSettings.key, set: { value: String(value), updatedAt: new Date() } });
}

/** Reads the fees from the chain and records them; the Quote Registry refresh does this every run. */
export async function refreshPlatformFees(db: Db, cfg: Config, connection: Connection) {
  await recordPlatformFees(db, await feesOnChain(db, connection, cfg));
}
