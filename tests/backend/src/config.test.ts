// The API refuses mainnet configurations that would put a broken metadata URL on-chain for good, leave revenue in the
// hot wallet, hand browsers the Worker's RPC key, or carry settings that only work on the local chain.
import { describe, expect, it } from "vitest";
import { freePort, startApi, WEBHOOK_SECRET } from "@launchpad/stack";
import { env } from "./client";

describe("mainnet configuration", () => {
  /**
   * Runs `check` against an API on a mainnet configuration with everything the API insists on; `extra` overrides or
   * removes (with "") any of it. Each API is stopped as soon as its check is done: a `wrangler dev` costs a few hundred
   * megabytes, and a dozen alive at once is more than a CI runner has.
   */
  async function onMainnet(publicApiUrl: string, extra: Record<string, string>, check: (url: string) => Promise<void>) {
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
        // The real Turbo and gateway: wrangler.jsonc's defaults name the local stand-in, which mainnet refuses.
        TURBO_UPLOAD_URL: "https://upload.ardrive.io",
        TURBO_PAYMENT_URL: "https://payment.ardrive.io",
        ARWEAVE_GATEWAY_URL: "https://arweave.net",
        ...extra,
      },
    });
    try {
      await check(api.url);
    } finally {
      await api.stop();
    }
  }
  const health = (url: string) => fetch(`${url}/health`).then((r) => r.status);

  it("is refused on a temporary address, since every coin's metadata URL is fixed on-chain at launch", async () => {
    for (const temporary of ["https://launchpad-api.someone.workers.dev", "http://api.example.com", "https://203.0.113.7"])
      await onMainnet(temporary, {}, async (url) => {
        expect(await health(url), temporary).toBe(500);
        expect((await fetch(`${url}/v1/platform`)).status, temporary).toBe(500);
      });
  }, 300_000);

  it("is accepted on our own https domain", async () => {
    await onMainnet("https://api.example.com", {}, async (url) => {
      expect(await health(url)).toBe(200);
      expect(((await (await fetch(`${url}/v1/platform`)).json()) as { cluster: string }).cluster).toBe("mainnet");
    });
  });

  it("is refused without a treasury, since revenue would pile up in the hot operations wallet (ADR 0004)", async () => {
    await onMainnet("https://api.example.com", { TREASURY_WALLET: "" }, async (url) => expect(await health(url)).toBe(500));
  });

  it("never hands browsers the Worker's own RPC, which carries its provider key", async () => {
    // No browser RPC at all, and one that carries a key of its own.
    for (const bad of [{ PUBLIC_RPC_URL: "" }, { PUBLIC_RPC_URL: "https://rpc.example.com/?api-key=another-secret" }])
      await onMainnet("https://api.example.com", bad, async (url) => expect(await health(url), JSON.stringify(bad)).toBe(500));
    await onMainnet("https://api.example.com", {}, async (url) => {
      const platform = (await (await fetch(`${url}/v1/platform`)).json()) as { rpcUrl: string };
      expect(platform.rpcUrl).toBe("https://rpc.example.com");
    });
  }, 300_000);

  it("refuses the settings that only work on the local chain: static prices, local route pools, a plain-http RPC, the Turbo stand-in", async () => {
    const bads: Record<string, string>[] = [
      { PRICE_SOURCE: "static" },
      { SOL_ROUTE_SOURCE: "raydium-cpmm" },
      { RPC_URL: "http://127.0.0.1:8899" },
      // The gateway is in every coin's on-chain URI for good; a stand-in or a plain-http one must never reach mainnet.
      { ARWEAVE_GATEWAY_URL: "http://127.0.0.1:8797" },
      { TURBO_UPLOAD_URL: "https://127.0.0.1:8797" },
    ];
    for (const bad of bads) await onMainnet("https://api.example.com", bad, async (url) => expect(await health(url), JSON.stringify(bad)).toBe(500));
    // Without a SOL route at all is fine: SOL payment is simply not offered.
    await onMainnet("https://api.example.com", { SOL_ROUTE_SOURCE: "none" }, async (url) => expect(await health(url)).toBe(200));
  }, 300_000);

  it("refuses a sweep float too small to pay for the token accounts a sweep opens", async () => {
    await onMainnet("https://api.example.com", { SWEEP_FLOAT_LAMPORTS: "1000000" }, async (url) => expect(await health(url)).toBe(500));
  });
});
