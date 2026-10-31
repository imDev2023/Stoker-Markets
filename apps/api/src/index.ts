import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { Connection, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { desc, eq } from "drizzle-orm";
import type { RawTransaction } from "@launchpad/chain";
import {
  LAUNCH_IMAGE_MAX_BYTES, LAUNCH_IMAGE_TYPES, PrepareLaunchFields, type JobName, type OperatorAlertList, type PlatformInfo,
} from "@launchpad/contract";
import { createDb, jobRuns, launchMetadata, operatorAlerts } from "@launchpad/db";
import { apiKeyMiddleware, keyRoutes, operatorKeyRoutes, pruneUsage } from "./apiKeys";
import { config, operationsKey, quoteMarket, solRoutes, type AppEnv, type Bindings } from "./env";
import { collectFees } from "./fees/collector";
import { CREATOR_SHARE_BPS } from "./fees/creatorShares";
import { forwardCreatorShares } from "./fees/forward";
import { notifyPending, watchGraduations } from "./graduation";
import { fetchRawTransaction, IndexBatchError, indexTransactions } from "./indexer";
import { sniffImageType } from "./images";
import {
  buildLaunch, launchQuoteAsset, loadDraft, newMintKeyNonce, refuseWith, resolveLaunchModes, saveDraft,
} from "./launch";
import { runJob, toJobRun } from "./jobs";
import { arweaveUrl, metadataDocument, signedItems, signMetadataItems, uploadMetadata } from "./metadata";
import { refreshQuoteRegistry } from "./quotes/registry";
import { lockRewardTaxes } from "./rewardTax";
import { creatorEarningsRoutes } from "./routes/creatorEarnings";
import { quotes } from "./routes/quotes";
import { launchRoutes } from "./routes/launches";
import { launchModeRoutes, operatorAirdropRoutes } from "./routes/launchModes";
import { operatorRegionRoutes, regionRoutes } from "./routes/region";
import { statsRoutes } from "./routes/stats";
import { copyRoutes } from "./routes/copies";
import { checkCopies, firstCopy } from "./copies/check";
import { imageHash } from "./copies/imageHash";
import { operatorMintKeyRoutes } from "./routes/mintKeys";
import { mintKeypair, nextChosenMint } from "./mintKeys";
import { mayAirdrop } from "./airdropAccess";
import { operatorJobRoutes, revenueRoutes } from "./routes/revenue";
import { operatorRewardRoutes, rewardRoutes } from "./routes/rewards";
import { burnRoutes, operatorBurnRoutes } from "./routes/burns";
import { announcementRoutes, operatorFeeRoutes, operatorViewRoutes, platformFees } from "./routes/operator";
import { runBurns } from "./burn/engine";
import { runRewardRounds } from "./rewards/engine";
import { tradeRoutes } from "./routes/trades";
import { trustRoutes } from "./routes/trust";

const app = new Hono<AppEnv>();

// WEB_ORIGIN may list several origins, comma-separated: the devnet rehearsal answers on its own hostname and, until the
// production web deploy takes the apex at go-live, on stoker.markets too (owner, 2026-10-14).
app.use("*", async (c, next) => cors({ origin: c.env.WEB_ORIGIN.split(",").map((o) => o.trim()), allowMethods: ["GET", "POST", "DELETE"] })(c, next));

app.use("/v1/*", async (c, next) => {
  c.set("cfg", config(c.env));
  const { db, close } = createDb(c.env.HYPERDRIVE.connectionString);
  c.set("db", db);
  try {
    await next();
  } finally {
    c.executionCtx.waitUntil(close());
  }
});

// An integrator's key, when one is sent, identifies and meters the caller; every read stays open without one (#21).
app.use("/v1/*", apiKeyMiddleware);

app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: "internal error" }, 500);
});

// Healthy only when the configuration is valid, so a misconfigured deploy never looks ready.
app.get("/health", (c) => {
  config(c.env);
  return c.json({ ok: true });
});

app.get("/v1/platform", async (c) => {
  const cfg = c.get("cfg");
  // The fees as the chain has them, so a fee change (#22) shows everywhere at once.
  const fees = await platformFees(c.get("db"), cfg);
  const info: PlatformInfo = {
    cluster: cfg.cluster,
    // The browser's RPC, never the Worker's own (which carries its provider key on mainnet).
    rpcUrl: cfg.publicRpcUrl,
    launchlabProgram: cfg.launchlab.toBase58(),
    platformConfig: cfg.platformConfig.toBase58(),
    graduationTargetLamports: cfg.graduationTargetLamports.toString(),
    platformFeeBps: fees.platformFeeBps,
    poolCreatorFeeBps: fees.poolCreatorFeeBps,
    poolCreatorFeeShareBps: fees.poolCreatorFeeShareBps,
    raydiumFee: { curveBps: fees.raydiumCurveFeeBps, poolBps: fees.raydiumPoolFeeBps },
    creatorFeeBps: fees.creatorFeeBps,
    creatorForward: {
      // Half of what the platform collects on either venue (ADR 0009): of the Platform Fee on the curve, of the pool
      // creator fee after Graduation less the share Raydium keeps of it, all as the chain has them.
      shareBps: CREATOR_SHARE_BPS,
      curveBps: (fees.platformFeeBps * CREATOR_SHARE_BPS) / 10_000,
      poolBps: (fees.poolCreatorFeeBps * (10_000 - fees.poolCreatorFeeShareBps) * CREATOR_SHARE_BPS) / 100_000_000,
      minLamports: cfg.creatorForwardMinLamports.toString(),
    },
    referralShareBps: cfg.referralShareBps,
    solRoute: cfg.solRoute?.source ?? null,
  };
  return c.json(info);
});

/** Stores the Launch's metadata and returns the launch transaction for the Creator's wallet to sign (ADR 0003). */
app.post("/v1/launches/prepare", async (c) => {
  const cfg = c.get("cfg");
  const form = await c.req.formData().catch(() => {
    throw new HTTPException(400, { message: "expected multipart/form-data" });
  });
  const fields = PrepareLaunchFields.safeParse(Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string")));
  if (!fields.success) return c.json({ error: "invalid launch fields", details: fields.error.issues }, 400);
  const image = form.get("image");
  if (!(image instanceof File) || image.size === 0) return c.json({ error: "an image is required" }, 400);
  if (image.size > LAUNCH_IMAGE_MAX_BYTES) return c.json({ error: "image is larger than 2 MB" }, 400);
  const bytes = new Uint8Array(await image.arrayBuffer());
  const contentType = sniffImageType(bytes);
  if (!contentType || !(LAUNCH_IMAGE_TYPES as readonly string[]).includes(contentType))
    return c.json({ error: "image must be PNG, JPEG, WebP or GIF" }, 400);

  const f = fields.data;
  const creator = new PublicKey(f.creator);
  // Copy Protection (#120, ADR 0012): a launched coin's name, ticker and image are nobody else's for a window after it.
  const hash = await imageHash(bytes, contentType);
  const copy = firstCopy(await checkCopies(c.get("db"), cfg, { name: f.name, symbol: f.symbol, imageHash: hash, creator: f.creator }));
  if (copy) return c.json({ error: copy.reason, copy }, 409);
  const connection = new Connection(cfg.rpcUrl, "confirmed");
  const quote = await launchQuoteAsset(c.get("db"), cfg, quoteMarket(c.env), f.quoteMint);
  const firstBuy = f.firstBuy ? new BN(f.firstBuy) : null;
  const airdrop = f.airdrop ?? [];
  if (airdrop.length > 0 && !(await mayAirdrop(c.get("db"), creator.toBase58())))
    return c.json({ error: "Airdrops at launch aren't open to this wallet. Launch without one." }, 403);
  const rewardTaxBps = f.rewardTax ?? null;
  const rewardPayout = f.rewardPayout ?? null;
  const modes = await resolveLaunchModes(connection, cfg, quote, creator, firstBuy, airdrop, rewardTaxBps, rewardPayout).catch(refuseWith(400));

  // A key the operator chose for this Creator's next launch (the Platform Token's vanity address, #75) takes the place
  // of a derived one; the draft then has no nonce and signs with the stored key.
  const chosen = await nextChosenMint(c.get("db"), creator.toBase58());
  const nonce = chosen ? null : newMintKeyNonce();
  const mint = chosen ?? mintKeypair(cfg.mintKeySecret, nonce!).publicKey;
  const mintAddress = mint.toBase58();
  const imageKey = `images/${mintAddress}`;
  await c.env.METADATA_BUCKET.put(imageKey, bytes, { httpMetadata: { contentType } });
  const [stored] = await c
    .get("db")
    .insert(launchMetadata)
    .values({
      id: mintAddress,
      creator: f.creator,
      name: f.name,
      symbol: f.symbol,
      description: f.description,
      imageKey,
      imageContentType: contentType,
      website: f.website ?? null,
      x: f.x ?? null,
      telegram: f.telegram ?? null,
      imageHash: hash,
    })
    .returning();
  // Signed now, so the launch transaction names the permanent address; uploaded only once the launch has landed.
  await signMetadataItems(c.get("db"), c.env.METADATA_BUCKET, cfg, operationsKey(c.env), stored!, { bytes, contentType });
  await saveDraft(c.get("db"), { mint, creator, nonce, quote, firstBuy, airdrop, rewardTaxBps, rewardPayout });
  const loaded = await loadDraft(c.get("db"), mintAddress);
  return c.json(await buildLaunch(c.get("db"), connection, cfg, loaded!, quote, modes.firstBuy, modes.summary));
});

/** Helius raw-transaction webhook. The same transactions may arrive more than once; indexing is idempotent. */
app.post("/v1/webhooks/helius", async (c) => {
  if (!timingSafeEqual(c.req.header("authorization") ?? "", c.env.HELIUS_WEBHOOK_SECRET ?? "")) return c.json({ error: "unauthorized" }, 401);
  const body = await c.req.json<RawTransaction[]>().catch(() => null);
  if (!Array.isArray(body)) return c.json({ error: "expected an array of transactions" }, 400);
  const result = await indexTransactions(c.get("db"), c.get("cfg"), body).catch(indexingFailed);
  if (result.launched > 0) c.executionCtx.waitUntil(uploadAfterLaunch(c.env));
  return c.json(result);
});

/**
 * A launch that has just landed gets its permanent metadata uploaded right away rather than on the next minute's cron.
 * On its own database connection: the request's closes with the request.
 */
async function uploadAfterLaunch(env: Bindings) {
  const { db, close } = createDb(env.HYPERDRIVE.connectionString);
  try {
    await runJob(db, "metadata-upload", () => uploadMetadata(uploadDeps(env, db)), { exclusive: true });
  } catch (e) {
    console.error("metadata upload after a launch failed", e);
  } finally {
    await close();
  }
}

const uploadDeps = (env: Bindings, db: ReturnType<typeof createDb>["db"]) => ({ db, cfg: config(env), operations: operationsKey(env), bucket: env.METADATA_BUCKET });

/**
 * A batch some of whose transactions could not be indexed answers 500 naming them, so Helius delivers the batch again;
 * the ones that were indexed are then no-ops.
 */
function indexingFailed(e: unknown): never {
  if (e instanceof IndexBatchError) throw new HTTPException(500, { message: e.message });
  throw e;
}

/** Fast path: the web app reports a confirmed signature so a Launch, trade or claim appears without waiting for the webhook. */
app.post("/v1/transactions/:signature", async (c) => {
  const signature = c.req.param("signature");
  if (!/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(signature)) return c.json({ error: "invalid signature" }, 400);
  const raw = await fetchRawTransaction(c.get("cfg").rpcUrl, signature);
  if (!raw) return c.json({ error: "transaction not found or not confirmed yet" }, 404);
  const result = await indexTransactions(c.get("db"), c.get("cfg"), [raw]).catch(indexingFailed);
  if (result.launched > 0) c.executionCtx.waitUntil(uploadAfterLaunch(c.env));
  return c.json(result);
});

app.route("/v1", launchRoutes);
app.route("/v1", launchModeRoutes);
app.route("/v1", copyRoutes);
app.route("/v1", quotes);
app.route("/v1", tradeRoutes);
app.route("/v1", trustRoutes);
app.route("/v1", creatorEarningsRoutes);
app.route("/v1", revenueRoutes);
app.route("/v1", rewardRoutes);
app.route("/v1", burnRoutes);
app.route("/v1", announcementRoutes);
app.route("/v1", keyRoutes);
app.route("/v1", regionRoutes);
app.route("/v1", statsRoutes);

/** Every operator endpoint needs the operator token. */
app.use("/v1/operator/*", async (c, next) => {
  const token = (c.req.header("authorization") ?? "").replace(/^Bearer /, "");
  if (!timingSafeEqual(token, c.env.OPERATOR_TOKEN ?? "")) return c.json({ error: "unauthorized" }, 401);
  await next();
});

app.route("/v1/operator", operatorJobRoutes);
app.route("/v1/operator", operatorRewardRoutes);
app.route("/v1/operator", operatorBurnRoutes);
app.route("/v1/operator", operatorKeyRoutes);
app.route("/v1/operator", operatorViewRoutes);
app.route("/v1/operator", operatorFeeRoutes);
app.route("/v1/operator", operatorAirdropRoutes);
app.route("/v1/operator", operatorMintKeyRoutes);
app.route("/v1/operator", operatorRegionRoutes);

/**
 * Runs one scheduled job now, as its Cron Trigger would, and answers with the run: 500 with the failed run when it
 * fails, skipped if a run is already under way. `?fail=simulated` makes the run fail on purpose, so the operator can see
 * the alert path work end to end.
 */
async function manualJob(c: Context<AppEnv>, job: JobName, work: () => Promise<unknown>) {
  const simulated = c.req.query("fail") === "simulated";
  const run = await runJob(c.get("db"), job, simulated ? () => Promise.reject(new Error("failure simulated by the operator")) : work, { exclusive: true }).catch(
    (e: Error) => e,
  );
  await notifyPending(c.get("db"), c.get("cfg"));
  if (run instanceof Error) {
    const [failed] = await c.get("db").select().from(jobRuns).where(eq(jobRuns.job, job)).orderBy(desc(jobRuns.startedAt)).limit(1);
    return c.json(failed ? toJobRun(failed) : { error: run.message }, 500);
  }
  return c.json(run);
}

/** The Quote Registry refresh (ADR 0005): a deploy runs it until every GlobalConfig has a curve rule. */
app.post("/v1/operator/jobs/quote-registry", (c) => {
  const cfg = c.get("cfg");
  return manualJob(c, "quote-registry", () => refreshQuoteRegistry({ db: c.get("db"), cfg, market: quoteMarket(c.env), operations: operationsKey(c.env) }));
});

/** The Burn and Flywheel. */
app.post("/v1/operator/jobs/burn", (c) => {
  const cfg = c.get("cfg");
  const routes = solRoutes(c.env, cfg, new Connection(cfg.rpcUrl, "confirmed"));
  return manualJob(c, "burn", () => runBurns({ db: c.get("db"), cfg, operations: operationsKey(c.env), routes }));
});

/** The Reward Engine; `maxPayouts` caps one run, which tests use to cut a round short. */
app.post("/v1/operator/jobs/reward-rounds", (c) => {
  const maxPayouts = Number(c.req.query("maxPayouts") ?? 200);
  if (!Number.isInteger(maxPayouts) || maxPayouts < 1) return c.json({ error: "maxPayouts must be a whole number above zero" }, 400);
  return manualJob(c, "reward-rounds", () => runRewardRounds({ db: c.get("db"), cfg: c.get("cfg"), operations: operationsKey(c.env) }, maxPayouts));
});

/** The Fee Collector. */
app.post("/v1/operator/jobs/fee-collector", (c) =>
  manualJob(c, "fee-collector", () => collectFees({ db: c.get("db"), cfg: c.get("cfg"), operations: operationsKey(c.env) })),
);

/** The Creator Forward (ADR 0009). */
app.post("/v1/operator/jobs/creator-forward", (c) =>
  manualJob(c, "creator-forward", () => forwardCreatorShares({ db: c.get("db"), cfg: c.get("cfg"), operations: operationsKey(c.env) })),
);

app.post("/v1/operator/jobs/metadata-upload", (c) => manualJob(c, "metadata-upload", () => uploadMetadata(uploadDeps(c.env, c.get("db")))));

/** Operator alerts, newest first: open ones and recently resolved ones. */
app.get("/v1/operator/alerts", async (c) => {
  const rows = await c.get("db").select().from(operatorAlerts).orderBy(desc(operatorAlerts.raisedAt)).limit(200);
  const res: OperatorAlertList = {
    alerts: rows.map((a) => ({
      kind: a.kind,
      subject: a.subject,
      message: a.message,
      raisedAt: a.raisedAt.toISOString(),
      resolvedAt: a.resolvedAt?.toISOString() ?? null,
    })),
  };
  return c.json(res);
});

/**
 * Token metadata JSON in the Metaplex off-chain format: the same document the coin's on-chain URI names on Arweave,
 * served from our own domain as the cache (the image on Arweave too, where the coin was launched with it).
 */
app.get("/metadata/:file", async (c) => {
  const match = /^([1-9A-HJ-NP-Za-km-z]{32,44})\.json$/.exec(c.req.param("file"));
  if (!match) return c.json({ error: "not found" }, 404);
  const { db, close } = createDb(c.env.HYPERDRIVE.connectionString);
  try {
    const [m] = await db.select().from(launchMetadata).where(eq(launchMetadata.id, match[1]!)).limit(1);
    if (!m) return c.json({ error: "not found" }, 404);
    const cfg = config(c.env);
    const items = await signedItems(db, m.id);
    const image = items ? arweaveUrl(cfg.arweave, items.image.arweaveId) : `${cfg.publicApiUrl}/metadata/${m.id}/image`;
    return c.json(metadataDocument(m, image), 200, { "cache-control": "public, max-age=31536000, immutable" });
  } finally {
    c.executionCtx.waitUntil(close());
  }
});

app.get("/metadata/:mint/image", async (c) => {
  const obj = await c.env.METADATA_BUCKET.get(`images/${c.req.param("mint")}`);
  if (!obj) return c.json({ error: "not found" }, 404);
  return new Response(obj.body, {
    headers: {
      "content-type": obj.httpMetadata?.contentType ?? "application/octet-stream",
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
});

function timingSafeEqual(a: string, b: string) {
  if (b === "") return false;
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i]! ^ y[i]!;
  return diff === 0;
}

/** The Cron Triggers in wrangler.jsonc. A run with no cron (a bare GET /__scheduled in tests) does every job. */
const CRONS = { graduationWatch: "* * * * *", quoteRegistry: "*/5 * * * *", feeCollector: "15 * * * *", rewardRounds: "*/10 * * * *", burn: "45 * * * *" } as const;

export default {
  fetch: app.fetch,
  async scheduled(controller, env, ctx) {
    const { db, close } = createDb(env.HYPERDRIVE.connectionString);
    const run = (cron: string) => !controller.cron || controller.cron === cron;
    // Each job runs even if one before it fails; the failures are thrown together at the end, so the run shows as failed.
    const failures: Error[] = [];
    const job = (p: Promise<unknown>) => p.catch((e: Error) => void failures.push(e));
    try {
      // The Quote Registry refresh and our curve rules (ADR 0005).
      // Every job takes its lease: a slow run overlapping the next Cron Trigger, or a manual run, must never act twice.
      if (run(CRONS.quoteRegistry)) {
        await job(runJob(db, "quote-registry", () => refreshQuoteRegistry({ db, cfg: config(env), market: quoteMarket(env), operations: operationsKey(env) }), { exclusive: true }));
        await job(pruneUsage(db));
      }
      // Launches that sold out but that Raydium has not migrated, and graduated Reward Launches whose tax is not locked yet.
      if (run(CRONS.graduationWatch)) {
        await job(runJob(db, "graduation-watch", () => watchGraduations(db, config(env)), { exclusive: true }));
        await job(runJob(db, "reward-tax-lock", () => lockRewardTaxes(db, config(env), operationsKey(env)), { exclusive: true }));
        // Permanent metadata for any launch the fast path after indexing did not upload (#44).
        await job(runJob(db, "metadata-upload", () => uploadMetadata(uploadDeps(env, db)), { exclusive: true }));
      }
      // Platform revenue into the operations wallet, and on to the treasury (ADR 0004).
      // Then the Creators' share of what was collected goes on to them (ADR 0009).
      if (run(CRONS.feeCollector)) {
        await job(runJob(db, "fee-collector", () => collectFees({ db, cfg: config(env), operations: operationsKey(env) }), { exclusive: true }));
        await job(runJob(db, "creator-forward", () => forwardCreatorShares({ db, cfg: config(env), operations: operationsKey(env) }), { exclusive: true }));
      }
      // The Burn and Flywheel, on the hour's revenue, half an hour after the Fee Collector has claimed it.
      if (run(CRONS.burn)) {
        const cfg = config(env);
        await job(runJob(db, "burn", () => runBurns({ db, cfg, operations: operationsKey(env), routes: solRoutes(env, cfg, new Connection(cfg.rpcUrl, "confirmed")) }), { exclusive: true }));
      }
      // Reward Rounds: harvest each Reward Launch's tax, open a round where enough has collected, pay the open ones.
      if (run(CRONS.rewardRounds))
        await job(runJob(db, "reward-rounds", () => runRewardRounds({ db, cfg: config(env), operations: operationsKey(env) }), { exclusive: true }));
      // Whatever the run raised (a stuck Launch, a failed job, a stalled round) reaches the operator's webhook.
      await job(notifyPending(db, config(env)));
      if (failures.length) throw new AggregateError(failures, failures.map((f) => f.message).join("; "));
    } finally {
      ctx.waitUntil(close());
    }
  },
} satisfies ExportedHandler<Bindings>;
