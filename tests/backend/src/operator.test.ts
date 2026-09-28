// The operator view, alerts and fee-change announcements (#22): an internal view of every Launch, round, burn and job
// run; alerts when a job fails, a round stalls or a Launch is stuck; and a Platform Fee or Creator Fee change that can
// only be prepared once its announcement's lead time has passed, for the cold admin key to sign.
import { describe, expect, it } from "vitest";
import { Transaction } from "@solana/web3.js";
import { launchlabCoder } from "@launchpad/chain";
import { localnetKeys } from "@launchpad/localnet";
import { FeeAnnouncementList, OperatorAlertList, OperatorOverview, PlatformInfo } from "@launchpad/contract";
import { connection, env, fundedWallet, launchedCoin, trade, SOL } from "./client";

const api = (path: string, init?: RequestInit) => fetch(`${env().apiUrl}${path}`, init);
const operator = () => ({ authorization: `Bearer ${env().operatorToken}`, "content-type": "application/json" });
const alerts = async () => OperatorAlertList.parse(await (await api("/v1/operator/alerts", { headers: operator() })).json()).alerts;

describe("the operator view", () => {
  it("shows every Launch, round, burn and job run at a glance, and answers where a wallet's rewards are", async () => {
    const { mint } = await launchedCoin();
    const trader = await fundedWallet();
    await trade(trader, mint, "buy", SOL(0.01));
    const res = await api("/v1/operator/overview", { headers: operator() });
    expect(res.status).toBe(200);
    const overview = OperatorOverview.parse(await res.json());
    expect(overview.launches.total).toBeGreaterThan(0);
    expect(overview.launches.byStatus.live).toBeGreaterThan(0);
    expect(overview.jobs.map((j) => j.job)).toEqual(expect.arrayContaining(["quote-registry"]));
    // Any wallet's Holder Rewards: the same lookup holders use.
    expect((await api(`/v1/wallets/${trader.publicKey.toBase58()}/rewards`)).status).toBe(200);
    expect((await api("/v1/operator/overview")).status).toBe(401);
  });

  it("raises an alert when a scheduled job fails, and resolves it when the job succeeds again", async () => {
    // A run made to fail on purpose, as the operator would to see the alert path work.
    const failed = await api("/v1/operator/jobs/fee-collector?fail=simulated", { method: "POST", headers: operator() });
    expect(failed.status).toBe(500);
    const open = (await alerts()).find((a) => a.kind === "job_failed" && a.subject === "fee-collector" && a.resolvedAt === null);
    expect(open).toBeDefined();
    expect(open!.message).toMatch(/fee-collector/);
    const ok = await api("/v1/operator/jobs/fee-collector", { method: "POST", headers: operator() });
    expect(ok.status).toBe(200);
    const resolved = (await alerts()).find((a) => a.kind === "job_failed" && a.subject === "fee-collector");
    expect(resolved!.resolvedAt).not.toBeNull();
  });
});

describe("fee-change announcements", () => {
  it("can't be prepared before the announced time, and after it builds the admin's transaction which changes the fees", async () => {
    const soon = new Date(Date.now() + 1_000).toISOString();
    const tooSoon = await api("/v1/operator/fees/announce", {
      method: "POST", headers: operator(), body: JSON.stringify({ platformFeeBps: 60, creatorFeeBps: 40, effectiveAt: soon, note: "too soon" }),
    });
    expect(tooSoon.status).toBe(422);

    const effectiveAt = new Date(Date.now() + env().feeChangeLeadSeconds * 1000 + 1_500).toISOString();
    const announced = await api("/v1/operator/fees/announce", {
      method: "POST", headers: operator(), body: JSON.stringify({ platformFeeBps: 60, creatorFeeBps: 40, effectiveAt, note: "rebalance" }),
    });
    expect(announced.status).toBe(201);
    const { id } = (await announced.json()) as { id: string };
    // Public, so everyone sees it coming.
    const list = FeeAnnouncementList.parse(await (await api("/v1/announcements")).json());
    expect(list.announcements.find((a) => a.id === id)).toMatchObject({ platformFeeBps: 60, creatorFeeBps: 40, effectiveAt, appliedSignature: null });

    const early = await api("/v1/operator/fees/prepare", { method: "POST", headers: operator(), body: JSON.stringify({ id }) });
    expect(early.status).toBe(422);
    await new Promise((r) => setTimeout(r, env().feeChangeLeadSeconds * 1000 + 2_000));
    const ready = await api("/v1/operator/fees/prepare", { method: "POST", headers: operator(), body: JSON.stringify({ id }) });
    expect(ready.status).toBe(200);
    const { transaction, admin, lastValidBlockHeight } = (await ready.json()) as { transaction: string; admin: string; lastValidBlockHeight: number };
    expect(admin).toBe(env().platform.admin);

    // The cold admin key signs it (here the local chain's admin) and the PlatformConfig changes on-chain.
    const tx = Transaction.from(Buffer.from(transaction, "base64"));
    const { admin: adminKey } = localnetKeys();
    tx.sign(adminKey);
    const signature = await connection().sendRawTransaction(tx.serialize());
    await connection().confirmTransaction({ signature, blockhash: tx.recentBlockhash!, lastValidBlockHeight }, "confirmed");
    const account = await connection().getAccountInfo(new (await import("@solana/web3.js")).PublicKey(env().platform.platformConfig));
    const config = launchlabCoder.accounts.decode("PlatformConfig", account!.data) as { fee_rate: { toString(): string }; creator_fee_rate: { toString(): string } };
    expect([config.fee_rate.toString(), config.creator_fee_rate.toString()]).toEqual(["6000", "4000"]);
    // Once the Indexer sees the change land, the platform facts follow it and the announcement records it.
    expect((await api(`/v1/transactions/${signature}`, { method: "POST" })).status).toBe(200);
    const platform = PlatformInfo.parse(await (await api("/v1/platform")).json());
    expect([platform.platformFeeBps, platform.creatorFeeBps]).toEqual([60, 40]);
    const applied = FeeAnnouncementList.parse(await (await api("/v1/announcements")).json()).announcements.find((a) => a.id === id)!;
    expect(applied.appliedSignature).toBe(signature);

    // Back to the ADR 0001 rates for the other tests, the same way.
    const back = await api("/v1/operator/fees/announce", {
      method: "POST", headers: operator(),
      body: JSON.stringify({ platformFeeBps: 50, creatorFeeBps: 50, effectiveAt: new Date(Date.now() + env().feeChangeLeadSeconds * 1000 + 1_500).toISOString() }),
    });
    const { id: backId } = (await back.json()) as { id: string };
    await new Promise((r) => setTimeout(r, env().feeChangeLeadSeconds * 1000 + 2_000));
    const restore = (await (await api("/v1/operator/fees/prepare", { method: "POST", headers: operator(), body: JSON.stringify({ id: backId }) })).json()) as {
      transaction: string; lastValidBlockHeight: number;
    };
    const rtx = Transaction.from(Buffer.from(restore.transaction, "base64"));
    rtx.sign(adminKey);
    const rsig = await connection().sendRawTransaction(rtx.serialize());
    await connection().confirmTransaction({ signature: rsig, blockhash: rtx.recentBlockhash!, lastValidBlockHeight: restore.lastValidBlockHeight }, "confirmed");
    expect((await api(`/v1/transactions/${rsig}`, { method: "POST" })).status).toBe(200);
    expect(PlatformInfo.parse(await (await api("/v1/platform")).json()).platformFeeBps).toBe(50);
  }, 120_000);
});
