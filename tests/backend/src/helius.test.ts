// The Helius webhook keeps itself current through Helius's webhook API (runbook, section 7): the Indexer adds each
// graduated pool when it indexes the Graduation, and the Quote Registry refresh adds every quote mint, so pool swaps and
// issuer changes to a mint keep arriving without anyone editing the webhook. The stack stands in for Helius's API.
import { describe, expect, it } from "vitest";
import { PublicKey } from "@solana/web3.js";
import { launchlabPdas } from "@launchpad/chain";
import { migrateCurve } from "@launchpad/localnet";
import { connection, deliverWebhook, env, fundedWallet, launchedCoin, listQuotes, refreshQuoteRegistry, SOL, trade } from "./client";

type Webhook = { webhookURL: string; transactionTypes: string[]; accountAddresses: string[]; webhookType: string; authHeader: string };

/** The webhook as Helius (here its stand-in) has it now. */
async function webhook(apiKey = env().heliusApiKey): Promise<{ status: number; webhook: Webhook | null }> {
  const res = await fetch(`${env().heliusApiUrl}/v0/webhooks/${env().heliusWebhookId}?api-key=${apiKey}`);
  return { status: res.status, webhook: res.ok ? ((await res.json()) as Webhook) : null };
}

describe("the Helius webhook's addresses", () => {
  it("gain every quote mint at the Quote Registry refresh, with the rest of the webhook left as it was", async () => {
    const before = (await webhook()).webhook!;
    const program = new PublicKey(env().platform.launchlab);
    // As the owner created it: our PlatformConfig and the creator fee vault authority.
    expect(before.accountAddresses).toEqual(expect.arrayContaining([env().platform.platformConfig, launchlabPdas(program).creatorFeeVaultAuthority.toBase58()]));
    await refreshQuoteRegistry();
    const after = (await webhook()).webhook!;
    for (const q of await listQuotes()) expect(after.accountAddresses).toContain(q.mint);
    expect(after.accountAddresses).toEqual(expect.arrayContaining(before.accountAddresses));
    expect(new Set(after.accountAddresses).size).toBe(after.accountAddresses.length);
    // The update replaces the whole webhook, so its URL, types, kind and auth header must travel back unchanged.
    expect(after).toMatchObject({
      webhookURL: `${env().apiUrl}/v1/webhooks/helius`, transactionTypes: ["ANY"], webhookType: "raw", authHeader: env().webhookSecret,
    });
    // A second refresh has nothing to add and leaves the webhook alone.
    await refreshQuoteRegistry();
    expect((await webhook()).webhook!.accountAddresses).toEqual(after.accountAddresses);
  });

  it("gain a graduated Launch's pool when the Indexer indexes its Graduation", async () => {
    const coin = await launchedCoin();
    const buyout = await trade(await fundedWallet(10), coin.mint, "buy", SOL(2));
    expect(buyout.quote.completesCurve).toBe(true);
    await deliverWebhook([buyout.signature]);
    const migration = await migrateCurve(connection(), coin.pool);
    expect((await webhook()).webhook!.accountAddresses).not.toContain(migration.pool.toBase58());
    expect(await (await deliverWebhook([migration.signature])).json()).toMatchObject({ graduated: 1 });
    expect((await webhook()).webhook!.accountAddresses).toContain(migration.pool.toBase58());
    // Delivered again (Helius retries), the Graduation is a no-op and the pool is listed once.
    expect(await (await deliverWebhook([migration.signature])).json()).toMatchObject({ graduated: 0 });
    const addresses = (await webhook()).webhook!.accountAddresses;
    expect(addresses.filter((a) => a === migration.pool.toBase58())).toHaveLength(1);
  });

  it("are behind the API key, which the stand-in checks like Helius does", async () => {
    expect((await webhook("wrong-key")).status).toBe(401);
  });
});
