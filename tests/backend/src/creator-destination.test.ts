// The Creator Earnings Destination (ADR 0011, #113, #184): where a Creator's share goes, chosen when the launch is
// prepared and fixed for the coin's life. This file covers the choice itself (prepared, kept by a retry, copied to the
// Launch when it is indexed, the wallet for any coin that never chose) and the split it makes in the accounting: a
// coin with a rule has a pot of its own, and a Creator Forward pays only the coins that pay the wallet. What each rule
// then does with its pot is in `earnings-holders`, `earnings-burn` and `earnings-liquidity`.
import { describe, expect, it } from "vitest";
import { PublicKey, type Keypair } from "@solana/web3.js";
import { WSOL_MINT } from "@launchpad/chain";
import { CoinEarnings, CreatorEarnings, CreatorForwardList, EARNINGS_DESTINATIONS, JobRun, LaunchSummary, PreparedLaunch } from "@launchpad/contract";
import { SOL, deliverWebhook, env, fundedWallet, getLaunch, launch, prepare, signAndSend, solOf, trade } from "./client";

const WSOL = WSOL_MINT.toBase58();
const api = (path: string, init?: RequestInit) => fetch(`${env().apiUrl}${path}`, init);
const operator = () => ({ authorization: `Bearer ${env().operatorToken}`, "content-type": "application/json" });

type Forward = { creator: string; mint: string; amount: string; signature: string; outcome: string };

/** The Fee Collector, then the Creator Forward, as their shared Cron Trigger runs them; returns the forwards sent. */
async function collectAndForward() {
  for (const job of ["fee-collector", "creator-forward"] as const) {
    const res = await api(`/v1/operator/jobs/${job}`, { method: "POST", headers: operator() });
    const run = JobRun.parse(await res.json());
    expect(res.status, JSON.stringify(run)).toBe(200);
    if (job === "creator-forward") return (run.summary as { sent: Forward[] }).sent;
  }
  return [];
}

const creatorEarnings = async (creator: PublicKey) => CreatorEarnings.parse(await (await api(`/v1/creators/${creator.toBase58()}/earnings`)).json());
const coinEarnings = async (mint: string) => CoinEarnings.parse(await (await api(`/v1/launches/${mint}/earnings`)).json());
const forwards = async (creator: PublicKey) => CreatorForwardList.parse(await (await api(`/v1/creators/${creator.toBase58()}/forwards`)).json()).forwards;

/** A coin launched by this Creator with a destination, indexed. */
async function coinOf(creator: Keypair, earningsDestination?: string) {
  const { prepared, signature } = await launch(creator, earningsDestination ? { earningsDestination } : {});
  await deliverWebhook([signature]);
  return prepared.mint;
}

/** A buy on a coin's curve, indexed; returns the Creator's share of it, half of its Platform Fee. */
async function curveBuy(mint: string, amount: bigint) {
  const t = await trade(await fundedWallet(), mint, "buy", amount);
  await deliverWebhook([t.signature]);
  return BigInt(t.quote.fees.platform) / 2n;
}

describe("the Creator Earnings Destination", () => {
  it.each(EARNINGS_DESTINATIONS.filter((d) => d !== "wallet"))("is fixed at launch as %s: prepared, kept by a retry and shown on the Launch", async (destination) => {
    const creator = await fundedWallet(10);
    const res = await prepare({ creator: creator.publicKey.toBase58(), earningsDestination: destination });
    expect(res.status, await res.clone().text()).toBe(200);
    const prepared = PreparedLaunch.parse(await res.json());
    expect(prepared.earningsDestination).toBe(destination);
    // A retry rebuilds the same launch with the same choice: it sends no fields, the draft holds them.
    const again = PreparedLaunch.parse(await (await api(`/v1/launches/${prepared.mint}/prepare`, { method: "POST" })).json());
    expect(again.mint).toBe(prepared.mint);
    expect(again.earningsDestination).toBe(destination);
    const signature = await signAndSend(again, creator);
    await deliverWebhook([signature]);
    expect(LaunchSummary.parse((await getLaunch(prepared.mint)).launch).earningsDestination).toBe(destination);
    expect(await coinEarnings(prepared.mint)).toMatchObject({ mint: prepared.mint, destination, collected: "0", applied: "0", waiting: "0", rounds: [], buybacks: [] });
  });

  it("pays the wallet when nothing was chosen, and refuses a destination it does not know", async () => {
    const creator = await fundedWallet(10);
    const mint = await coinOf(creator);
    expect(LaunchSummary.parse((await getLaunch(mint)).launch).earningsDestination).toBe("wallet");
    // A coin that pays the wallet has no rule: nothing is applied and nothing waits, its forwards are the Creator's.
    expect(await coinEarnings(mint)).toMatchObject({ destination: "wallet", applied: null, waiting: null, minLamports: null, waitsForGraduation: false, rounds: [], buybacks: [] });

    const unknown = await prepare({ creator: creator.publicKey.toBase58(), earningsDestination: "treasury" });
    expect(unknown.status).toBe(400);
    expect((await api("/v1/launches/not-an-address/earnings")).status).toBe(400);
    expect((await api(`/v1/launches/${creator.publicKey.toBase58()}/earnings`)).status).toBe(404);
  });

  it("goes with any launch type: a Reward Launch may point its Creator's earnings at a rule too", async () => {
    const creator = await fundedWallet(10);
    const res = await prepare({ creator: creator.publicKey.toBase58(), rewardTax: "300", rewardPayout: "quote", earningsDestination: "burn" });
    expect(res.status, await res.clone().text()).toBe(200);
    const prepared = PreparedLaunch.parse(await res.json());
    expect(prepared).toMatchObject({ earningsDestination: "burn", rewardTax: { bps: 300, payout: "quote" } });
  });

  // Liquidity is the destination this file can hold still: before Graduation its share only waits, so nothing but the
  // accounting moves, whatever the other rules do with their pots.
  it("splits one Creator's earnings by coin: the wallet's coin is forwarded, the rule's coin keeps a pot of its own", async () => {
    const creator = await fundedWallet(10);
    const paid = await coinOf(creator);
    const ruled = await coinOf(creator, "liquidity");
    const [toWallet, toRule] = [await curveBuy(paid, SOL(0.3)), await curveBuy(ruled, SOL(0.2))];

    // Earned from the moment the trades are indexed, and already told apart.
    const before = await creatorEarnings(creator.publicKey);
    expect(before.assets).toEqual([
      { quote: expect.objectContaining({ mint: WSOL }), earned: (toWallet + toRule).toString(), withheld: "0", forwarded: "0", toRule: toRule.toString(), pending: toWallet.toString() },
    ]);
    expect(before.launches.map((l) => [l.mint, l.destination, l.applied])).toEqual([[ruled, "liquidity", "0"], [paid, "wallet", null]]);

    const balance = await solOf(creator);
    const sent = (await collectAndForward()).filter((f) => f.creator === creator.publicKey.toBase58());
    // One forward, of the wallet coin's share alone: the rule coin's share never reaches the wallet.
    expect(sent).toMatchObject([{ mint: WSOL, amount: toWallet.toString(), outcome: "paid" }]);
    expect(await solOf(creator)).toBe(balance + toWallet);
    expect((await forwards(creator.publicKey)).map((f) => f.amount)).toEqual([toWallet.toString()]);

    const after = await creatorEarnings(creator.publicKey);
    expect(after.assets[0]).toMatchObject({ earned: (toWallet + toRule).toString(), forwarded: toWallet.toString(), toRule: toRule.toString(), pending: "0" });
    // The rule coin's share is collected and waits in its pot, for its pool: it is still in the operations wallet.
    expect(await coinEarnings(ruled)).toMatchObject({
      destination: "liquidity", collected: toRule.toString(), withheld: "0", applied: "0", waiting: toRule.toString(), waitsForGraduation: true,
      minLamports: expect.stringMatching(/^\d+$/), rounds: [], buybacks: [],
    });
    // The wallet coin shows what was collected on it; what was sent is counted on the Creator, per Quote Asset.
    expect(await coinEarnings(paid)).toMatchObject({ destination: "wallet", collected: toWallet.toString(), applied: null, waiting: null });

    // A second run pays nothing twice, and the pot is still there.
    expect((await collectAndForward()).filter((f) => f.creator === creator.publicKey.toBase58())).toEqual([]);
    expect((await coinEarnings(ruled)).waiting).toBe(toRule.toString());
  });
});
