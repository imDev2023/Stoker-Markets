// The Creator Earnings destination (ADR 0011, #113): where a Creator's share goes, chosen when the launch is prepared
// and fixed for the coin's life. This file covers the choice itself: prepared, kept by a retry, copied to the Launch
// when it is indexed, and a wallet for any coin that never chose. The holder dividend and the buyback follow in their
// own files once the jobs exist.
import { describe, expect, it } from "vitest";
import { LaunchSummary, PreparedLaunch } from "@launchpad/contract";
import { deliverWebhook, env, fundedWallet, getLaunch, prepare, signAndSend } from "./client";

describe("the Creator Earnings destination", () => {
  it.each(["holders", "burn"] as const)("is fixed at launch as %s: prepared, kept by a retry and shown on the Launch", async (destination) => {
    const creator = await fundedWallet(10);
    const res = await prepare({ creator: creator.publicKey.toBase58(), earningsDestination: destination, symbol: destination === "holders" ? "DIVI" : "BURNY" });
    expect(res.status, await res.clone().text()).toBe(200);
    const prepared = PreparedLaunch.parse(await res.json());
    expect(prepared.earningsDestination).toBe(destination);
    // A retry rebuilds the same launch with the same choice.
    const again = PreparedLaunch.parse(await (await fetch(`${env().apiUrl}/v1/launches/${prepared.mint}/prepare`, { method: "POST" })).json());
    expect(again.mint).toBe(prepared.mint);
    expect(again.earningsDestination).toBe(destination);
    const signature = await signAndSend(again, creator);
    await deliverWebhook([signature]);
    expect(LaunchSummary.parse((await getLaunch(prepared.mint)).launch).earningsDestination).toBe(destination);
  });

  it("pays the wallet when nothing was chosen, and refuses a destination it does not know", async () => {
    const creator = await fundedWallet(10);
    const res = await prepare({ creator: creator.publicKey.toBase58(), symbol: "PLAIN" });
    expect(res.status, await res.clone().text()).toBe(200);
    const prepared = PreparedLaunch.parse(await res.json());
    expect(prepared.earningsDestination).toBe("wallet");
    const signature = await signAndSend(prepared, creator);
    await deliverWebhook([signature]);
    expect(LaunchSummary.parse((await getLaunch(prepared.mint)).launch).earningsDestination).toBe("wallet");

    const unknown = await prepare({ creator: creator.publicKey.toBase58(), earningsDestination: "treasury", symbol: "NOPE" });
    expect(unknown.status).toBe(400);
  });
});
