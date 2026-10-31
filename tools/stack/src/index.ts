// The whole system as a black box for tests: a throwaway Postgres, a fresh local chain with the real Raydium programs,
// the API Worker under `wrangler dev`, and optionally the web app under `next dev`.
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { appendFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { connect, createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import BN from "bn.js";
import postgres from "postgres";
import { runMigrations } from "@launchpad/db/migrate";
import { bootstrapPlatform, LOCAL_QUOTE_PRICES_USD, LOCAL_QUOTE_TOKEN_LIST, localnetKeys, startLocalnet, type LocalnetState } from "@launchpad/localnet";
import { createSolRoutes, type SolRoutes } from "@launchpad/localnet/routes";
import { startTurboStandIn, type TurboStandIn } from "./turbo";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

export type StackEnv = {
  apiUrl: string;
  webUrl: string | null;
  rpcUrl: string;
  databaseUrl: string;
  webhookSecret: string;
  /** Bearer token for the API's operator endpoints. */
  operatorToken: string;
  /** Stands in for the operator's chat webhook: the API posts alerts here, and a GET lists every one received. */
  alertSinkUrl: string;
  /**
   * Stands in for Helius's webhook API: `GET` and `PUT /v0/webhooks/:id?api-key=` on one webhook, as the API keeps its
   * watched addresses current. The key and id the API was given, so a test can read the webhook back.
   */
  heliusApiUrl: string;
  heliusApiKey: string;
  heliusWebhookId: string;
  /**
   * Stands in for ArDrive Turbo and the Arweave gateway (#44): the API posts signed data items, buys credits with SOL
   * sent to `depositAddress` on the local chain, and every coin's metadata URI resolves at `url/<id>`.
   */
  turbo: { url: string; depositAddress: string };
  /** What one top-up sends Turbo, in lamports, as the API has it. */
  arweaveTopUpLamports: string;
  /** How long a sold-out curve waits for migration before the API alerts. */
  graduationAlertAfterSeconds: number;
  /** How long after a Graduation the graduation watch keeps backfilling the new pool's trades. */
  poolBackfillSeconds: number;
  /** Where the Fee Collector sweeps revenue: a fresh address per stack, standing in for the cold treasury. */
  treasury: string;
  /** The Fee Collector's settings, as the API has them. */
  sweepThresholdLamports: string;
  sweepFloatLamports: string;
  collectMinLamports: string;
  /** What a Creator must be owed, in lamports' worth, before the Creator Forward pays it. */
  creatorForwardMinLamports: string;
  /** What a referred trade pays its referrer, in basis points, as the API has it. */
  referralShareBps: number;
  /** How long before it applies a fee change must be announced; short, so a test can wait it out. */
  feeChangeLeadSeconds: number;
  platform: LocalnetState;
  /** The Raydium CPMM pools of SOL the API routes buys paid with SOL through, standing in for Jupiter. */
  solRoutes: SolRoutes;
  /** The API key the web server names itself with, so its server-side requests are not counted as one anonymous IP; null without the web app. */
  webApiKey: string | null;
  /** Every variable the API was started with, so a test can start a second API that differs in one setting. */
  apiVars: Record<string, string>;
};

export type StackOptions = {
  /** Taken automatically from the free ports unless set, so parallel suites never share a chain. */
  rpcPort?: number;
  /** Small, so tests can graduate a Launch cheaply; production uses 85 SOL. */
  graduationTargetSol?: number;
  /** Short, so a test can see a stuck Launch alerted without waiting minutes; production uses 300. */
  graduationAlertAfterSeconds?: number;
  /**
   * Bundle Radar's Snipe Window in slots after a launch's own; production uses 5 (about two seconds). The backend suite
   * keeps it short enough to see a buy fall outside it; the UI suite makes it long enough to hold every seeded trade.
   */
  snipeWindowSlots?: number;
  web?: boolean;
};

export async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, "127.0.0.1", () => {
      const port = (srv.address() as { port: number }).port;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

async function waitFor(what: string, check: () => Promise<boolean>, timeoutMs: number, log?: () => string) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      if (await check()) return;
    } catch {
      // not ready yet
    }
    if (Date.now() > deadline) throw new Error(`${what} did not become ready within ${timeoutMs / 1000} s\n${log?.() ?? ""}`);
    await new Promise((r) => setTimeout(r, 300));
  }
}

/**
 * A throwaway database: with `STACK_DATABASE_URL` (a Postgres server the caller may create databases on, for machines
 * without docker), a fresh database on that server; otherwise a Postgres container.
 */
/** Whether something answers on a local port: how a build folder left by a run that was killed is told from a live run's. */
function listening(port: number) {
  return new Promise<boolean>((resolve) => {
    const socket = connect({ port, host: "127.0.0.1" });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

async function startPostgres(): Promise<{ url: string; stop: () => Promise<void> }> {
  const server = process.env.STACK_DATABASE_URL;
  if (server) {
    const admin = postgres(server, { max: 1, onnotice: () => {} });
    // A run that was killed never reached `stop`: drop what such runs left behind, told apart by the pid in the name.
    for (const { datname } of await admin<{ datname: string }[]>`select datname from pg_database where datname like 'launchpad_test_%'`) {
      const pid = Number(datname.split("_")[2]);
      if (pid && !alive(pid)) await admin.unsafe(`drop database if exists "${datname}" with (force)`).catch(() => undefined);
    }
    const name = `launchpad_test_${process.pid}_${Date.now()}`;
    await admin.unsafe(`create database "${name}"`);
    await admin.end();
    const url = new URL(server);
    url.pathname = `/${name}`;
    return {
      url: url.toString(),
      stop: async () => {
        const drop = postgres(server, { max: 1, onnotice: () => {} });
        await drop.unsafe(`drop database if exists "${name}" with (force)`).catch(() => undefined);
        await drop.end();
      },
    };
  }
  // A run that was killed never reached `stop`: remove what such runs left behind, told apart by the pid in the name.
  const stale = execFileSync("docker", ["ps", "-a", "--filter", "name=^launchpad-test-pg-", "--format", "{{.Names}}"]).toString().split("\n").filter(Boolean);
  for (const old of stale) {
    const pid = Number(old.split("-")[3]);
    if (pid && !alive(pid)) execFileSync("docker", ["rm", "-f", old], { stdio: "ignore" });
  }
  const name = `launchpad-test-pg-${process.pid}-${Date.now()}`;
  execFileSync("docker", [
    "run", "-d", "--rm", "--name", name, "-e", "POSTGRES_USER=test", "-e", "POSTGRES_PASSWORD=test", "-e", "POSTGRES_DB=test",
    "-p", "127.0.0.1::5432", "postgres:17-alpine",
  ]);
  const port = execFileSync("docker", ["port", name, "5432/tcp"]).toString().trim().split(":").pop();
  const url = `postgres://test:test@127.0.0.1:${port}/test`;
  await waitFor("postgres", async () => {
    execFileSync("docker", ["exec", name, "pg_isready", "-U", "test", "-h", "127.0.0.1"], { stdio: "ignore" });
    return true;
  }, 60_000);
  return { url, stop: async () => void execFileSync("docker", ["rm", "-f", name], { stdio: "ignore" }) };
}

/** Whether a process with this pid is running on this machine (one we may not signal counts as running). */
function alive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** Runs a stack process, keeping its output; with `STACK_LOG_DIR` set, the output also streams to `<dir>/<name>.log`. */
function run(name: string, cmd: string, args: string[], cwd: string, env: NodeJS.ProcessEnv) {
  const proc: ChildProcess = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  let log = "";
  const dir = process.env.STACK_LOG_DIR;
  const file = dir ? (mkdirSync(dir, { recursive: true }), join(dir, `${name}.log`)) : null;
  const keep = (d: Buffer) => {
    log += d;
    if (file) appendFileSync(file, d);
  };
  proc.stdout?.on("data", keep);
  proc.stderr?.on("data", keep);
  const stop = () =>
    new Promise<void>((resolve) => {
      if (proc.exitCode !== null) return resolve();
      proc.once("exit", () => resolve());
      proc.kill("SIGTERM");
    });
  return { proc, stop, log: () => log };
}

export const WEBHOOK_SECRET = "test-webhook-secret";

/** The API's Cron Triggers (apps/api/wrangler.jsonc), for running one job through `/__scheduled?cron=`. */
export const QUOTE_REGISTRY_CRON = "*/5 * * * *";
export const GRADUATION_WATCH_CRON = "* * * * *";
export const FEE_COLLECTOR_CRON = "15 * * * *";
export const REWARD_ROUNDS_CRON = "*/10 * * * *";
export const BURN_CRON = "45 * * * *";
export const OPERATOR_TOKEN = "test-operator-token";

/** A stand-in for the operator's chat webhook: keeps every JSON body posted to it and lists them on GET. */
async function startAlertSink() {
  const received: unknown[] = [];
  const server = createHttpServer((req, res) => {
    if (req.method === "GET") {
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(received));
      return;
    }
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      try {
        received.push(JSON.parse(body));
        res.writeHead(204).end();
      } catch {
        res.writeHead(400).end();
      }
    });
  });
  const port = await freePort();
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  return { url: `http://127.0.0.1:${port}`, stop: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

export const HELIUS_API_KEY = "test-helius-key";
export const HELIUS_WEBHOOK_ID = "test-helius-webhook";

/**
 * A stand-in for Helius's webhook API, holding one raw webhook as Helius would have it after the owner created it
 * (runbook, section 7): `GET /v0/webhooks/:id` reads it, `PUT` replaces it, both behind `?api-key=`. Only the fields
 * Helius keeps are stored, so a PUT that drops one shows up as a lost field.
 */
async function startHeliusStandIn(webhookUrl: string, authHeader: string, addresses: string[]) {
  let webhook = {
    webhookID: HELIUS_WEBHOOK_ID, wallet: "stand-in", webhookURL: webhookUrl, transactionTypes: ["ANY"], accountAddresses: addresses,
    webhookType: "raw", authHeader,
  };
  const server = createHttpServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://stand-in");
    const json = (status: number, body: unknown) => res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
    if (url.searchParams.get("api-key") !== HELIUS_API_KEY) return json(401, { error: "invalid api key" });
    if (url.pathname !== `/v0/webhooks/${HELIUS_WEBHOOK_ID}`) return json(404, { error: "webhook not found" });
    if (req.method === "GET") return json(200, webhook);
    if (req.method !== "PUT") return json(405, { error: "method not allowed" });
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      try {
        const next = JSON.parse(body) as Partial<typeof webhook>;
        webhook = {
          ...webhook, webhookURL: next.webhookURL ?? "", transactionTypes: next.transactionTypes ?? [], accountAddresses: next.accountAddresses ?? [],
          webhookType: next.webhookType ?? "", authHeader: next.authHeader ?? "",
        };
        json(200, webhook);
      } catch {
        json(400, { error: "invalid body" });
      }
    });
  });
  const port = await freePort();
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  return { url: `http://127.0.0.1:${port}`, stop: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

/**
 * Runs the API Worker under `wrangler dev` with the given vars. Resolves once it answers HTTP at all, so a test can
 * also start a deliberately misconfigured API and look at how it fails.
 */
export async function startApi(opts: { port: number; vars: Record<string, string>; databaseUrl: string }) {
  const { port, vars, databaseUrl } = opts;
  const url = `http://127.0.0.1:${port}`;
  const api = run(
    `api-${port}`,
    "pnpm",
    [
      "exec", "wrangler", "dev", "--port", String(port), "--ip", "127.0.0.1", "--inspector-port", String(await freePort()),
      "--persist-to", mkdtempSync(join(tmpdir(), "launchpad-api-")),
      // Exposes /__scheduled, so tests run the Cron Trigger jobs on demand.
      "--test-scheduled",
      ...Object.entries(vars).flatMap(([k, v]) => ["--var", `${k}:${v}`]),
    ],
    join(REPO, "apps", "api"),
    { CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE: databaseUrl, WRANGLER_SEND_METRICS: "false" },
  );
  try {
    await waitFor("API", async () => Boolean(await fetch(`${url}/health`)), 90_000, api.log);
  } catch (e) {
    await api.stop();
    throw e;
  }
  return { url, stop: api.stop, log: api.log };
}

/** Starts everything and returns the addresses plus a teardown that stops it all, in reverse order. */
export async function startStack(opts: StackOptions = {}): Promise<{ env: StackEnv; stop: () => Promise<void> }> {
  const cleanups: (() => Promise<void> | void)[] = [];
  // Every cleanup runs even when one fails, so a chain that will not stop never leaves the database container behind.
  const stop = async () => {
    const failures: unknown[] = [];
    for (const c of [...cleanups].reverse()) {
      try {
        await c();
      } catch (e) {
        failures.push(e);
      }
    }
    if (failures.length) throw new AggregateError(failures, "stopping the stack failed");
  };
  try {
    const pg = await startPostgres();
    cleanups.push(pg.stop);
    await runMigrations(pg.url);

    const chain = await startLocalnet(opts.rpcPort === undefined ? {} : { rpcPort: opts.rpcPort });
    cleanups.push(() => chain.stop());
    const platform = await bootstrapPlatform(
      chain.connection,
      chain.rpcUrl,
      new BN((opts.graduationTargetSol ?? 1) * LAMPORTS_PER_SOL),
    );
    // The route pools' lookup table takes a while to become usable, so the API starts meanwhile.
    const { ready: solRoutesReady, ...solRoutes } = await createSolRoutes(chain.connection);

    const sink = await startAlertSink();
    cleanups.push(sink.stop);
    const turbo: TurboStandIn = await startTurboStandIn({ rpcUrl: chain.rpcUrl, port: await freePort() });
    cleanups.push(turbo.stop);
    // Small, so a test's top-up is cheap, and still enough for many of the largest images.
    const arweaveTopUpLamports = String(LAMPORTS_PER_SOL / 50);
    const graduationAlertAfterSeconds = opts.graduationAlertAfterSeconds ?? 5;
    // Short, so a test can see the pool backfill close without waiting minutes; production uses 900.
    const poolBackfillSeconds = 8;
    const referralShareBps = 50;
    const feeChangeLeadSeconds = 3;

    const webPort = opts.web ? await freePort() : null;
    const webUrl = webPort ? `http://127.0.0.1:${webPort}` : null;
    const apiPort = await freePort();
    const apiUrl = `http://127.0.0.1:${apiPort}`;
    // As the owner would create the webhook: on the PlatformConfig, nothing else yet.
    const helius = await startHeliusStandIn(`${apiUrl}/v1/webhooks/helius`, WEBHOOK_SECRET, [platform.platformConfig]);
    cleanups.push(helius.stop);
    const fees = {
      treasury: Keypair.generate().publicKey.toBase58(),
      sweepThresholdLamports: String(5 * LAMPORTS_PER_SOL),
      sweepFloatLamports: String(2 * LAMPORTS_PER_SOL),
      collectMinLamports: "100000",
      creatorForwardMinLamports: "100000",
    };
    const vars = {
      RPC_URL: chain.rpcUrl,
      PUBLIC_API_URL: apiUrl,
      WEB_ORIGIN: webUrl ?? "http://127.0.0.1",
      PLATFORM_CONFIG: platform.platformConfig,
      PLATFORM_ADMIN: platform.admin,
      PLATFORM_LOOKUP_TABLE: platform.lookupTable,
      GRADUATION_TARGET_LAMPORTS: platform.graduationTargetLamports,
      PRICE_SOURCE: "static",
      QUOTE_PRICES_USD: JSON.stringify(LOCAL_QUOTE_PRICES_USD),
      QUOTE_TOKEN_LIST: JSON.stringify(LOCAL_QUOTE_TOKEN_LIST),
      OPERATIONS_KEY: JSON.stringify(Array.from(localnetKeys().operations.secretKey)),
      GRADUATION_ALERT_AFTER_SECONDS: String(graduationAlertAfterSeconds),
      POOL_BACKFILL_SECONDS: String(poolBackfillSeconds),
      HELIUS_WEBHOOK_SECRET: WEBHOOK_SECRET,
      HELIUS_API_URL: helius.url,
      HELIUS_API_KEY,
      HELIUS_WEBHOOK_ID,
      OPERATOR_TOKEN,
      ALERT_WEBHOOK_URL: sink.url,
      TURBO_UPLOAD_URL: turbo.url,
      TURBO_PAYMENT_URL: turbo.url,
      ARWEAVE_GATEWAY_URL: turbo.url,
      ARWEAVE_TOP_UP_LAMPORTS: arweaveTopUpLamports,
      MINT_KEY_SECRET: randomBytes(32).toString("hex"),
      TREASURY_WALLET: fees.treasury,
      SWEEP_THRESHOLD_LAMPORTS: fees.sweepThresholdLamports,
      SWEEP_FLOAT_LAMPORTS: fees.sweepFloatLamports,
      COLLECT_MIN_LAMPORTS: fees.collectMinLamports,
      // Small, so the Creator Forward pays on the little a test trades; a test that wants to see a share wait trades less.
      CREATOR_FORWARD_MIN_LAMPORTS: fees.creatorForwardMinLamports,
      // Short, so a test can announce a rules change and see it refused inside the lead time, then accepted outside it.
      REWARD_RULES_LEAD_SECONDS: "60",
      // Short, so a test can see a copy refused inside a launch's Copy Protection and only labelled after it.
      COPY_PROTECTION_SECONDS: "45",
      // A test visits from any country by naming it in this header; Cloudflare's reading is what production uses.
      COUNTRY_HEADER: "x-test-country",
      SNIPE_WINDOW_SLOTS: String(opts.snipeWindowSlots ?? 40),
      // Three top Launches, so a test can see one picked and one left out.
      FLYWHEEL_TOP_N: "3",
      // Tiny, so the Flywheel buys on the little revenue a test run makes.
      BURN_MIN_SPEND_LAMPORTS: "100000",
      REFERRAL_SHARE_BPS: String(referralShareBps),
      FEE_CHANGE_LEAD_SECONDS: String(feeChangeLeadSeconds),
      // Every test calls from one address, so the per-IP limits are far out of reach; a test that wants to meet them
      // starts a second API with `startApi` and its own limits.
      ANON_RATE_LIMIT_PER_MINUTE: "1000000",
      ANON_PREPARE_RATE_LIMIT_PER_MINUTE: "1000000",
      SOL_ROUTE_SOURCE: "raydium-cpmm",
      SOL_ROUTE_POOLS: JSON.stringify(solRoutes.pools),
    };
    const api = await startApi({ port: apiPort, vars, databaseUrl: pg.url });
    cleanups.push(api.stop);
    await waitFor("API", async () => (await fetch(`${apiUrl}/health`)).ok, 30_000, api.log);
    // As a deploy would: fill the Quote Registry and write the curve rules before anything launches.
    const refresh = await fetch(`${apiUrl}/__scheduled?cron=${encodeURIComponent(QUOTE_REGISTRY_CRON)}`);
    if (!refresh.ok) throw new Error(`first Quote Registry refresh failed: ${refresh.status}\n${api.log()}`);

    let webApiKey: string | null = null;
    if (webPort && webUrl) {
      // As the runbook has the operator do: the web server gets a key of its own.
      const issued = await fetch(`${apiUrl}/v1/operator/api-keys`, {
        method: "POST",
        headers: { authorization: `Bearer ${OPERATOR_TOKEN}`, "content-type": "application/json" },
        body: JSON.stringify({ name: "Web server", rateLimitPerMinute: 6000 }),
      });
      if (!issued.ok) throw new Error(`issuing the web server's API key failed: ${issued.status}\n${api.log()}`);
      webApiKey = ((await issued.json()) as { key: string }).key;
      // A run that was killed never reached `stop`: remove the build folders such runs left behind (85 of them, 970 MB,
      // had gathered by 2026-10-28), told from a live run's by whether anything answers on the port in the name.
      const webDir = join(REPO, "apps", "web");
      for (const dir of readdirSync(webDir).filter((d) => d.startsWith(".next-test-"))) {
        const port = Number(dir.slice(".next-test-".length));
        if (port && !(await listening(port))) rmSync(join(webDir, dir), { recursive: true, force: true });
      }
      const web = run(
        `web-${webPort}`,
        "pnpm",
        ["exec", "next", "dev", "--port", String(webPort), "--hostname", "127.0.0.1"],
        join(REPO, "apps", "web"),
        // A separate build directory, so tests never fight a developer's running `next dev` for its lock.
        { NEXT_PUBLIC_API_URL: apiUrl, API_KEY: webApiKey, NEXT_DIST_DIR: `.next-test-${webPort}`, NEXT_TELEMETRY_DISABLED: "1" },
      );
      cleanups.push(web.stop, () => rmSync(join(REPO, "apps", "web", `.next-test-${webPort}`), { recursive: true, force: true }));
      await waitFor("web", async () => (await fetch(webUrl)).ok, 180_000, web.log);
    }

    await solRoutesReady;
    return {
      env: {
        apiUrl, webUrl, rpcUrl: chain.rpcUrl, databaseUrl: pg.url, webhookSecret: WEBHOOK_SECRET, operatorToken: OPERATOR_TOKEN,
        alertSinkUrl: sink.url, heliusApiUrl: helius.url, heliusApiKey: HELIUS_API_KEY, heliusWebhookId: HELIUS_WEBHOOK_ID,
        turbo: { url: turbo.url, depositAddress: turbo.depositAddress }, arweaveTopUpLamports,
        graduationAlertAfterSeconds, poolBackfillSeconds, ...fees, referralShareBps, feeChangeLeadSeconds, platform, solRoutes, webApiKey, apiVars: vars,
      },
      stop,
    };
  } catch (e) {
    await stop();
    throw e;
  }
}
