// Vitest global setup: the backend as a black box. A throwaway Postgres, a fresh local chain with the real Raydium
// programs, and the API Worker under `wrangler dev`. Tests only talk to the API over HTTP and to the chain over RPC.
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import BN from "bn.js";
import type { TestProject } from "vitest/node";
import { runMigrations } from "@launchpad/db/migrate";
import { bootstrapPlatform, startLocalnet, type Localnet, type LocalnetState } from "@launchpad/localnet";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
export const WEBHOOK_SECRET = "test-webhook-secret";
/** Small, so tests can graduate a Launch cheaply; production uses 85 SOL. */
const GRADUATION_TARGET_SOL = 1;

export type HarnessEnv = { apiUrl: string; rpcUrl: string; databaseUrl: string; webhookSecret: string; platform: LocalnetState };

declare module "vitest" {
  export interface ProvidedContext {
    harness: HarnessEnv;
  }
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, "127.0.0.1", () => {
      const port = (srv.address() as { port: number }).port;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

async function waitFor(what: string, check: () => Promise<boolean>, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      if (await check()) return;
    } catch {
      // not ready yet
    }
    if (Date.now() > deadline) throw new Error(`${what} did not become ready within ${timeoutMs / 1000} s`);
    await new Promise((r) => setTimeout(r, 300));
  }
}

function startPostgres() {
  const name = `launchpad-test-pg-${process.pid}`;
  execFileSync("docker", [
    "run", "-d", "--rm", "--name", name, "-e", "POSTGRES_USER=test", "-e", "POSTGRES_PASSWORD=test", "-e", "POSTGRES_DB=test",
    "-p", "127.0.0.1::5432", "postgres:17-alpine",
  ]);
  const port = execFileSync("docker", ["port", name, "5432/tcp"]).toString().trim().split(":").pop();
  return { name, url: `postgres://test:test@127.0.0.1:${port}/test` };
}

export default async function setup(project: TestProject) {
  const cleanups: (() => Promise<void> | void)[] = [];
  const teardown = async () => {
    for (const c of cleanups.reverse()) await c();
  };
  try {
    const pg = startPostgres();
    cleanups.push(() => void execFileSync("docker", ["rm", "-f", pg.name], { stdio: "ignore" }));
    await waitFor("postgres", async () => {
      execFileSync("docker", ["exec", pg.name, "pg_isready", "-U", "test", "-h", "127.0.0.1"], { stdio: "ignore" });
      return true;
    });
    await runMigrations(pg.url);

    const rpcPort = 18_899;
    const chain: Localnet = await startLocalnet({ rpcPort });
    cleanups.push(() => chain.stop());
    const platform = await bootstrapPlatform(chain.connection, chain.rpcUrl, new BN(GRADUATION_TARGET_SOL * LAMPORTS_PER_SOL));

    const apiPort = await freePort();
    const apiUrl = `http://127.0.0.1:${apiPort}`;
    const vars = {
      RPC_URL: chain.rpcUrl,
      PUBLIC_API_URL: apiUrl,
      PLATFORM_CONFIG: platform.platformConfig,
      SOL_GLOBAL_CONFIG: platform.solGlobalConfig,
      GRADUATION_TARGET_LAMPORTS: platform.graduationTargetLamports,
      HELIUS_WEBHOOK_SECRET: WEBHOOK_SECRET,
    };
    const api: ChildProcess = spawn(
      "pnpm",
      [
        "exec", "wrangler", "dev", "--port", String(apiPort), "--ip", "127.0.0.1", "--inspector-port", String(await freePort()),
        "--persist-to", mkdtempSync(join(tmpdir(), "launchpad-api-")),
        ...Object.entries(vars).flatMap(([k, v]) => ["--var", `${k}:${v}`]),
      ],
      {
        cwd: join(REPO, "apps", "api"),
        env: { ...process.env, CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE: pg.url, WRANGLER_SEND_METRICS: "false" },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let apiLog = "";
    api.stdout?.on("data", (d) => (apiLog += d));
    api.stderr?.on("data", (d) => (apiLog += d));
    cleanups.push(
      () =>
        new Promise<void>((resolve) => {
          if (api.exitCode !== null) return resolve();
          api.once("exit", () => resolve());
          api.kill("SIGTERM");
        }),
    );
    await waitFor("API", async () => (await fetch(`${apiUrl}/health`)).ok, 90_000).catch((e) => {
      throw new Error(`${(e as Error).message}\n${apiLog}`);
    });

    project.provide("harness", { apiUrl, rpcUrl: chain.rpcUrl, databaseUrl: pg.url, webhookSecret: WEBHOOK_SECRET, platform });
  } catch (e) {
    await teardown();
    throw e;
  }
  return teardown;
}
