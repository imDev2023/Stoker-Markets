import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { Connection, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { desc, eq } from "drizzle-orm";
import type { RawTransaction } from "@launchpad/chain";
import {
  LAUNCH_IMAGE_MAX_BYTES, LAUNCH_IMAGE_TYPES, PrepareLaunchFields, type OperatorAlertList, type PlatformInfo,
} from "@launchpad/contract";
import { createDb, launchMetadata, operatorAlerts } from "@launchpad/db";
import { config, operationsKey, quoteMarket, type AppEnv, type Bindings } from "./env";
import { watchGraduations } from "./graduation";
import { fetchRawTransaction, indexTransactions } from "./indexer";
import { sniffImageType } from "./images";
import {
  buildLaunch, launchQuoteAsset, loadDraft, mintKeypair, newMintKeyNonce, refuseWith, resolveLaunchModes, saveDraft,
} from "./launch";
import { refreshQuoteRegistry } from "./quotes/registry";
import { creatorFeeRoutes } from "./routes/creatorFees";
import { quotes } from "./routes/quotes";
import { launchRoutes } from "./routes/launches";
import { launchModeRoutes } from "./routes/launchModes";
import { tradeRoutes } from "./routes/trades";

const app = new Hono<AppEnv>();

app.use("*", async (c, next) => cors({ origin: c.env.WEB_ORIGIN, allowMethods: ["GET", "POST"] })(c, next));

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

app.get("/v1/platform", (c) => {
  const cfg = c.get("cfg");
  const info: PlatformInfo = {
    cluster: cfg.cluster,
    rpcUrl: cfg.rpcUrl,
    launchlabProgram: cfg.launchlab.toBase58(),
    platformConfig: cfg.platformConfig.toBase58(),
    graduationTargetLamports: cfg.graduationTargetLamports.toString(),
    platformFeeBps: 50,
    creatorFeeBps: 50,
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
  const connection = new Connection(cfg.rpcUrl, "confirmed");
  const quote = await launchQuoteAsset(c.get("db"), cfg, quoteMarket(c.env), f.quoteMint);
  const firstBuy = f.firstBuy ? new BN(f.firstBuy) : null;
  const airdrop = f.airdrop ?? [];
  const modes = await resolveLaunchModes(connection, cfg, quote, creator, firstBuy, airdrop).catch(refuseWith(400));

  const nonce = newMintKeyNonce();
  const mint = mintKeypair(cfg.mintKeySecret, nonce).publicKey;
  const mintAddress = mint.toBase58();
  const imageKey = `images/${mintAddress}`;
  await c.env.METADATA_BUCKET.put(imageKey, bytes, { httpMetadata: { contentType } });
  await c.get("db").insert(launchMetadata).values({
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
  });
  await saveDraft(c.get("db"), { mint, creator, nonce, quote, firstBuy, airdrop });
  const loaded = await loadDraft(c.get("db"), mintAddress);
  return c.json(await buildLaunch(connection, cfg, loaded!, quote, modes.firstBuy, modes.summary));
});

/** Helius raw-transaction webhook. The same transactions may arrive more than once; indexing is idempotent. */
app.post("/v1/webhooks/helius", async (c) => {
  if (!timingSafeEqual(c.req.header("authorization") ?? "", c.env.HELIUS_WEBHOOK_SECRET ?? "")) return c.json({ error: "unauthorized" }, 401);
  const body = await c.req.json<RawTransaction[]>().catch(() => null);
  if (!Array.isArray(body)) return c.json({ error: "expected an array of transactions" }, 400);
  return c.json(await indexTransactions(c.get("db"), c.get("cfg"), body));
});

/** Fast path: the web app reports a confirmed signature so a Launch, trade or claim appears without waiting for the webhook. */
app.post("/v1/transactions/:signature", async (c) => {
  const signature = c.req.param("signature");
  if (!/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(signature)) return c.json({ error: "invalid signature" }, 400);
  const raw = await fetchRawTransaction(c.get("cfg").rpcUrl, signature);
  if (!raw) return c.json({ error: "transaction not found or not confirmed yet" }, 404);
  return c.json(await indexTransactions(c.get("db"), c.get("cfg"), [raw]));
});

app.route("/v1", launchRoutes);
app.route("/v1", launchModeRoutes);
app.route("/v1", quotes);
app.route("/v1", tradeRoutes);
app.route("/v1", creatorFeeRoutes);

/** Operator alerts, newest first: open ones and recently resolved ones. Needs the operator token. */
app.get("/v1/operator/alerts", async (c) => {
  const token = (c.req.header("authorization") ?? "").replace(/^Bearer /, "");
  if (!timingSafeEqual(token, c.env.OPERATOR_TOKEN ?? "")) return c.json({ error: "unauthorized" }, 401);
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

/** Token metadata JSON in the Metaplex off-chain format, as referenced by the on-chain metadata URI. */
app.get("/metadata/:file", async (c) => {
  const match = /^([1-9A-HJ-NP-Za-km-z]{32,44})\.json$/.exec(c.req.param("file"));
  if (!match) return c.json({ error: "not found" }, 404);
  const { db, close } = createDb(c.env.HYPERDRIVE.connectionString);
  try {
    const [m] = await db.select().from(launchMetadata).where(eq(launchMetadata.id, match[1]!)).limit(1);
    if (!m) return c.json({ error: "not found" }, 404);
    const api = config(c.env).publicApiUrl;
    return c.json(
      {
        name: m.name,
        symbol: m.symbol,
        description: m.description,
        image: `${api}/metadata/${m.id}/image`,
        external_url: m.website ?? undefined,
        extensions: { website: m.website ?? undefined, twitter: m.x ?? undefined, telegram: m.telegram ?? undefined },
      },
      200,
      { "cache-control": "public, max-age=31536000, immutable" },
    );
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

/** The Cron Triggers in wrangler.jsonc. A run with no cron (a bare GET /__scheduled in tests) does both jobs. */
const CRONS = { graduationWatch: "* * * * *", quoteRegistry: "*/5 * * * *" } as const;

export default {
  fetch: app.fetch,
  async scheduled(controller, env, ctx) {
    const { db, close } = createDb(env.HYPERDRIVE.connectionString);
    const run = (cron: string) => !controller.cron || controller.cron === cron;
    try {
      // The Quote Registry refresh and our curve rules (ADR 0005).
      if (run(CRONS.quoteRegistry)) {
        const result = await refreshQuoteRegistry({ db, cfg: config(env), market: quoteMarket(env), operations: operationsKey(env) });
        console.log("quote registry refreshed", result);
      }
      // Launches that sold out but that Raydium has not migrated.
      if (run(CRONS.graduationWatch)) {
        const watch = await watchGraduations(db, config(env));
        if (watch.recovered.length > 0) console.log(`graduation watch indexed missed migrations: ${watch.recovered.join(", ")}`);
      }
    } finally {
      ctx.waitUntil(close());
    }
  },
} satisfies ExportedHandler<Bindings>;
