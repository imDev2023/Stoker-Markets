import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { desc, eq } from "drizzle-orm";
import { prepareLaunch, type RawTransaction } from "@launchpad/chain";
import {
  LAUNCH_IMAGE_MAX_BYTES, LAUNCH_IMAGE_TYPES, PrepareLaunchFields, type LaunchSummary, type PlatformInfo, type PreparedLaunch,
} from "@launchpad/contract";
import { createDb, curves, launches, launchMetadata, quoteAssets } from "@launchpad/db";
import { config, operationsKey, quoteMarket, type AppEnv, type Bindings, type Config } from "./env";
import { fetchRawTransaction, indexTransactions } from "./indexer";
import { sniffImageType } from "./images";
import { priceLaunch, toQuoteRef } from "./quotes/assets";
import { refreshQuoteRegistry } from "./quotes/registry";
import { quotes } from "./routes/quotes";
import { curveProgress, tradeRoutes } from "./routes/trades";

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
  const quote = await priceLaunch(c.get("db"), cfg, quoteMarket(c.env), f.quoteMint);
  const mint = Keypair.generate();
  const mintAddress = mint.publicKey.toBase58();
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

  const metadataUri = `${cfg.publicApiUrl}/metadata/${mintAddress}.json`;
  const prepared = await prepareLaunch(
    new Connection(cfg.rpcUrl, "confirmed"),
    {
      program: cfg.launchlab,
      platformConfig: cfg.platformConfig,
      globalConfig: quote.globalConfig,
      quoteMint: quote.mint,
      quoteTokenProgram: quote.tokenProgram,
      creator: new PublicKey(f.creator),
      name: f.name,
      symbol: f.symbol,
      uri: metadataUri,
      graduationTargetRaw: new BN(quote.graduationTarget.raw),
    },
    mint,
  );
  const body: PreparedLaunch = {
    transaction: prepared.transaction,
    mint: mintAddress,
    pool: prepared.pool.toBase58(),
    metadataUri,
    lastValidBlockHeight: prepared.lastValidBlockHeight,
    graduationTarget: quote.graduationTarget,
  };
  return c.json(body);
});

/** Helius raw-transaction webhook. The same transactions may arrive more than once; indexing is idempotent. */
app.post("/v1/webhooks/helius", async (c) => {
  if (!timingSafeEqual(c.req.header("authorization") ?? "", c.env.HELIUS_WEBHOOK_SECRET ?? "")) return c.json({ error: "unauthorized" }, 401);
  const body = await c.req.json<RawTransaction[]>().catch(() => null);
  if (!Array.isArray(body)) return c.json({ error: "expected an array of transactions" }, 400);
  return c.json(await indexTransactions(c.get("db"), c.get("cfg"), body));
});

/** Fast path: the web app reports a confirmed signature so a Launch or trade appears without waiting for the webhook. */
app.post("/v1/transactions/:signature", async (c) => {
  const signature = c.req.param("signature");
  if (!/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(signature)) return c.json({ error: "invalid signature" }, 400);
  const raw = await fetchRawTransaction(c.get("cfg").rpcUrl, signature);
  if (!raw) return c.json({ error: "transaction not found or not confirmed yet" }, 404);
  return c.json(await indexTransactions(c.get("db"), c.get("cfg"), [raw]));
});

app.get("/v1/launches", async (c) => {
  const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 50) || 50, 1), 100);
  const rows = await c
    .get("db")
    .select()
    .from(launches)
    .leftJoin(launchMetadata, eq(launchMetadata.id, launches.mint))
    .leftJoin(curves, eq(curves.mint, launches.mint))
    // Amounts need the Quote Asset's decimals, so a Launch shows once the registry lists its Quote Asset. Every Launch the API
    // built already is; only one sent straight to a GlobalConfig newer than the last refresh waits for the next one.
    .innerJoin(quoteAssets, eq(quoteAssets.mint, launches.quoteMint))
    .orderBy(desc(launches.createdSlot))
    .limit(limit);
  return c.json({ launches: rows.map((r) => toSummary(c.get("cfg"), r.launches, r.launch_metadata, r.quote_assets, r.curves)) });
});

app.get("/v1/launches/:mint", async (c) => {
  const [row] = await c
    .get("db")
    .select()
    .from(launches)
    .leftJoin(launchMetadata, eq(launchMetadata.id, launches.mint))
    .leftJoin(curves, eq(curves.mint, launches.mint))
    .innerJoin(quoteAssets, eq(quoteAssets.mint, launches.quoteMint))
    .where(eq(launches.mint, c.req.param("mint")))
    .limit(1);
  if (!row) return c.json({ error: "launch not found" }, 404);
  return c.json(toSummary(c.get("cfg"), row.launches, row.launch_metadata, row.quote_assets, row.curves));
});

app.route("/v1", tradeRoutes);

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

function toSummary(
  cfg: Config,
  l: typeof launches.$inferSelect,
  m: typeof launchMetadata.$inferSelect | null,
  q: typeof quoteAssets.$inferSelect,
  curve: typeof curves.$inferSelect | null,
): LaunchSummary {
  return {
    mint: l.mint,
    pool: l.pool,
    creator: l.creator,
    quote: toQuoteRef(q),
    name: l.name,
    symbol: l.symbol,
    metadataUri: l.metadataUri,
    image: m ? `${cfg.publicApiUrl}/metadata/${l.mint}/image` : null,
    description: m?.description ?? null,
    links: { website: m?.website ?? null, x: m?.x ?? null, telegram: m?.telegram ?? null },
    graduationTarget: l.graduationTarget,
    curve: curveProgress(curve),
    createdSignature: l.createdSignature,
    createdAt: l.createdAt.toISOString(),
  };
}

function timingSafeEqual(a: string, b: string) {
  if (b === "") return false;
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i]! ^ y[i]!;
  return diff === 0;
}

app.route("/", quotes);

export default {
  fetch: app.fetch,
  /** The Cron Trigger: refresh the Quote Registry and our curve rules. */
  async scheduled(_controller, env) {
    const { db, close } = createDb(env.HYPERDRIVE.connectionString);
    try {
      const result = await refreshQuoteRegistry({ db, cfg: config(env), market: quoteMarket(env), operations: operationsKey(env) });
      console.log("quote registry refreshed", result);
    } finally {
      await close();
    }
  },
} satisfies ExportedHandler<Bindings>;
