// The API refuses mainnet configurations that would put a broken metadata URL on-chain for good, or leave revenue in the
// hot wallet.
import { afterAll, describe, expect, it } from "vitest";
import { freePort, startApi, WEBHOOK_SECRET } from "@launchpad/stack";
import { env } from "./client";

describe("mainnet configuration", () => {
  const stops: (() => Promise<void>)[] = [];
  afterAll(async () => {
    for (const stop of stops) await stop();
  });

  async function apiOnMainnet(publicApiUrl: string, extra: Record<string, string> = { TREASURY_WALLET: env().treasury }) {
    const h = env();
    const api = await startApi({
      port: await freePort(),
      databaseUrl: h.databaseUrl,
      vars: {
        CLUSTER: "mainnet",
        RPC_URL: h.rpcUrl,
        PUBLIC_API_URL: publicApiUrl,
        WEB_ORIGIN: "https://example.com",
        PLATFORM_CONFIG: h.platform.platformConfig,
        PLATFORM_LOOKUP_TABLE: h.platform.lookupTable,
        GRADUATION_TARGET_LAMPORTS: h.platform.graduationTargetLamports,
        HELIUS_WEBHOOK_SECRET: WEBHOOK_SECRET,
        MINT_KEY_SECRET: "a-test-secret-that-is-at-least-32-characters",
        ...extra,
      },
    });
    stops.push(api.stop);
    return api.url;
  }

  it("is refused on a temporary address, since every coin's metadata URL is fixed on-chain at launch", async () => {
    for (const temporary of ["https://launchpad-api.someone.workers.dev", "http://api.example.com", "https://203.0.113.7"]) {
      const url = await apiOnMainnet(temporary);
      expect((await fetch(`${url}/health`)).status, temporary).toBe(500);
      expect((await fetch(`${url}/v1/platform`)).status, temporary).toBe(500);
    }
  }, 300_000);

  it("is accepted on our own https domain", async () => {
    const url = await apiOnMainnet("https://api.example.com");
    expect((await fetch(`${url}/health`)).status).toBe(200);
    expect(((await (await fetch(`${url}/v1/platform`)).json()) as { cluster: string }).cluster).toBe("mainnet");
  });

  it("is refused without a treasury, since revenue would pile up in the hot operations wallet (ADR 0004)", async () => {
    const url = await apiOnMainnet("https://api.example.com", {});
    expect((await fetch(`${url}/health`)).status).toBe(500);
  });
});
