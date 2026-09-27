// The whole system as a black box for tests: a throwaway Postgres, a fresh local chain with the real Raydium programs,
// the API Worker under `wrangler dev`, and optionally the web app under `next dev`.
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { appendFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import BN from "bn.js";
import { runMigrations } from "@launchpad/db/migrate";
import { bootstrapPlatform, LOCAL_QUOTE_PRICES_USD, localnetKeys, startLocalnet, type LocalnetState } from "@launchpad/localnet";

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
  /** How long a sold-out curve waits for migration before the API alerts. */
  graduationAlertAfterSeconds: number;
  platform: LocalnetState;
};

export type StackOptions = {
  /** Taken automatically from the free ports unless set, so parallel suites never share a chain. */
  rpcPort?: number;
  /** Small, so tests can graduate a Launch cheaply; production uses 85 SOL. */
  graduationTargetSol?: number;
  /** Short, so a test can see a stuck Launch alerted without waiting minutes; production uses 300. */
  graduationAlertAfterSeconds?: number;
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

function startPostgres() {
  const name = `launchpad-test-pg-${process.pid}-${Date.now()}`;
  execFileSync("docker", [
    "run", "-d", "--rm", "--name", name, "-e", "POSTGRES_USER=test", "-e", "POSTGRES_PASSWORD=test", "-e", "POSTGRES_DB=test",
    "-p", "127.0.0.1::5432", "postgres:17-alpine",
  ]);
  const port = execFileSync("docker", ["port", name, "5432/tcp"]).toString().trim().split(":").pop();
  return { name, url: `postgres://test:test@127.0.0.1:${port}/test` };
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
  const stop = async () => {
    for (const c of cleanups.reverse()) await c();
  };
  try {
    const pg = startPostgres();
    cleanups.push(() => void execFileSync("docker", ["rm", "-f", pg.name], { stdio: "ignore" }));
    await waitFor("postgres", async () => {
      execFileSync("docker", ["exec", pg.name, "pg_isready", "-U", "test", "-h", "127.0.0.1"], { stdio: "ignore" });
      return true;
    }, 60_000);
    await runMigrations(pg.url);

    const chain = await startLocalnet(opts.rpcPort === undefined ? {} : { rpcPort: opts.rpcPort });
    cleanups.push(() => chain.stop());
    const platform = await bootstrapPlatform(
      chain.connection,
      chain.rpcUrl,
      new BN((opts.graduationTargetSol ?? 1) * LAMPORTS_PER_SOL),
    );

    const sink = await startAlertSink();
    cleanups.push(sink.stop);
    const graduationAlertAfterSeconds = opts.graduationAlertAfterSeconds ?? 5;

    const webPort = opts.web ? await freePort() : null;
    const webUrl = webPort ? `http://127.0.0.1:${webPort}` : null;
    const apiPort = await freePort();
    const apiUrl = `http://127.0.0.1:${apiPort}`;
    const vars = {
      RPC_URL: chain.rpcUrl,
      PUBLIC_API_URL: apiUrl,
      WEB_ORIGIN: webUrl ?? "http://127.0.0.1",
      PLATFORM_CONFIG: platform.platformConfig,
      GRADUATION_TARGET_LAMPORTS: platform.graduationTargetLamports,
      PRICE_SOURCE: "static",
      QUOTE_PRICES_USD: JSON.stringify(LOCAL_QUOTE_PRICES_USD),
      OPERATIONS_KEY: JSON.stringify(Array.from(localnetKeys().operations.secretKey)),
      GRADUATION_ALERT_AFTER_SECONDS: String(graduationAlertAfterSeconds),
      HELIUS_WEBHOOK_SECRET: WEBHOOK_SECRET,
      OPERATOR_TOKEN,
      ALERT_WEBHOOK_URL: sink.url,
    };
    const api = await startApi({ port: apiPort, vars, databaseUrl: pg.url });
    cleanups.push(api.stop);
    await waitFor("API", async () => (await fetch(`${apiUrl}/health`)).ok, 30_000, api.log);
    // As a deploy would: fill the Quote Registry and write the curve rules before anything launches.
    const refresh = await fetch(`${apiUrl}/__scheduled`);
    if (!refresh.ok) throw new Error(`first Quote Registry refresh failed: ${refresh.status}\n${api.log()}`);

    if (webPort && webUrl) {
      const web = run(
        `web-${webPort}`,
        "pnpm",
        ["exec", "next", "dev", "--port", String(webPort), "--hostname", "127.0.0.1"],
        join(REPO, "apps", "web"),
        // A separate build directory, so tests never fight a developer's running `next dev` for its lock.
        { NEXT_PUBLIC_API_URL: apiUrl, NEXT_DIST_DIR: `.next-test-${webPort}`, NEXT_TELEMETRY_DISABLED: "1" },
      );
      cleanups.push(web.stop, () => rmSync(join(REPO, "apps", "web", `.next-test-${webPort}`), { recursive: true, force: true }));
      await waitFor("web", async () => (await fetch(webUrl)).ok, 180_000, web.log);
    }

    return {
      env: {
        apiUrl, webUrl, rpcUrl: chain.rpcUrl, databaseUrl: pg.url, webhookSecret: WEBHOOK_SECRET, operatorToken: OPERATOR_TOKEN,
        alertSinkUrl: sink.url, graduationAlertAfterSeconds, platform,
      },
      stop,
    };
  } catch (e) {
    await stop();
    throw e;
  }
}
