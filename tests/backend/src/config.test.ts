// The API refuses mainnet configurations that would put a broken metadata URL on-chain for good, leave revenue in the
// hot wallet, hand browsers the Worker's RPC key, or carry settings that only work on the local chain.
import { afterAll, describe, expect, it } from "vitest";
import { freePort, startApi, WEBHOOK_SECRET } from "@launchpad/stack";
import { env } from "./client";

describe("mainnet configuration", () => {
  const stops: (() => Promise<void>)[] = [];
  afterAll(async () => {
    for (const stop of stops) await stop();
  });

  /** A mainnet configuration with everything the API insists on; `extra` overrides or removes (with "") any of it. */
  async function apiOnMainnet(publicApiUrl: string, extra: Record<string, string> = {}) {
    const h = env();
    const api = await startApi({
      port: await freePort(),
      databaseUrl: h.databaseUrl,
      vars: {
        CLUSTER: "mainnet",
        // /health never touches the chain, so an https address that isn't a real RPC is enough here.
        RPC_URL: "https://mainnet.helius-rpc.com/?api-key=secret",
        PUBLIC_RPC_URL: "https://rpc.example.com",
        PRICE_SOURCE: "jupiter",
        SOL_ROUTE_SOURCE: "jupiter",
        TREASURY_WALLET: h.treasury,
        PUBLIC_API_URL: publicApiUrl,
        WEB_ORIGIN: "https://example.com",
        PLATFORM_CONFIG: h.platform.platformConfig,
        PLATFORM_ADMIN: h.platform.admin,
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
    const url = await apiOnMainnet("https://api.example.com", { TREASURY_WALLET: "" });
    expect((await fetch(`${url}/health`)).status).toBe(500);
  });

  it("never hands browsers the Worker's own RPC, which carries its provider key", async () => {
    // No browser RPC at all, and one that carries a key of its own.
    for (const bad of [{ PUBLIC_RPC_URL: "" }, { PUBLIC_RPC_URL: "https://rpc.example.com/?api-key=another-secret" }]) {
      const url = await apiOnMainnet("https://api.example.com", bad);
      expect((await fetch(`${url}/health`)).status, JSON.stringify(bad)).toBe(500);
    }
    const url = await apiOnMainnet("https://api.example.com");
    const platform = (await (await fetch(`${url}/v1/platform`)).json()) as { rpcUrl: string };
    expect(platform.rpcUrl).toBe("https://rpc.example.com");
  }, 300_000);

  it("refuses the settings that only work on the local chain: static prices, local route pools, a plain-http RPC", async () => {
    const bads: Record<string, string>[] = [
      { PRICE_SOURCE: "static" },
      { SOL_ROUTE_SOURCE: "raydium-cpmm" },
      { RPC_URL: "http://127.0.0.1:8899" },
    ];
    for (const bad of bads) {
      const url = await apiOnMainnet("https://api.example.com", bad);
      expect((await fetch(`${url}/health`)).status, JSON.stringify(bad)).toBe(500);
    }
    // Without a SOL route at all is fine: SOL payment is simply not offered.
    const url = await apiOnMainnet("https://api.example.com", { SOL_ROUTE_SOURCE: "none" });
    expect((await fetch(`${url}/health`)).status).toBe(200);
  }, 300_000);

  it("refuses a sweep float too small to pay for the token accounts a sweep opens", async () => {
    const url = await apiOnMainnet("https://api.example.com", { SWEEP_FLOAT_LAMPORTS: "1000000" });
    expect((await fetch(`${url}/health`)).status).toBe(500);
  });
});
