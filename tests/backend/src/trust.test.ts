// Trust figures (#41, ADR 0013): Bundle Radar counts the wallets that bought inside the Snipe Window (the launch's slot
// and SNIPE_WINDOW_SLOTS after it, 40 on the test stack, 5 deployed) and what they hold by their trades since, and the
// Creator's record says how many coins they launched here and what their First Buy took. Black box: the trust endpoint
// against trades made through the public API.
import { describe, expect, it } from "vitest";
import { PublicKey } from "@solana/web3.js";
import { LaunchTrust } from "@launchpad/contract";
import { coinsOf, connection, deliverWebhook, env, fundedWallet, launch, rawTransaction, SOL, trade } from "./client";

const WINDOW_SLOTS = 40;

async function trust(mint: string) {
  const res = await fetch(`${env().apiUrl}/v1/launches/${mint}/trust`);
  return { status: res.status, trust: res.ok ? LaunchTrust.parse(await res.json()) : null };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("Trust figures", () => {
  it("counts the wallets that bought inside the Snipe Window, what they hold by their trades, and the Creator's record", async () => {
    const creator = await fundedWallet(10);
    const { prepared, signature } = await launch(creator, { firstBuy: SOL(0.1).toString() });
    await deliverWebhook([signature]);
    const mint = prepared.mint;
    const launchSlot = (await rawTransaction(signature)).slot;

    // Three wallets buy the moment the coin lands, one after another so each is quoted on the curve as it stands (a
    // few slots apart, well inside the window), two of them the same amount, as one bundle's wallets do.
    const [a, b, c] = await Promise.all([fundedWallet(), fundedWallet(), fundedWallet()]);
    const buys = [await trade(a, mint, "buy", SOL(0.2)), await trade(b, mint, "buy", SOL(0.2)), await trade(c, mint, "buy", SOL(0.05))];
    for (const t of buys) expect(JSON.stringify((await connection().getTransaction(t.signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 }))?.meta?.err ?? null)).toBe("null");
    await deliverWebhook(buys.map((t) => t.signature));
    // One of them sells half, which its held figure follows.
    const sold = (await coinsOf(mint, a)) / 2n;
    await deliverWebhook([(await trade(a, mint, "sell", sold)).signature]);

    const { status, trust: t } = await trust(mint);
    expect(status).toBe(200);
    const supply = (await connection().getTokenSupply(new PublicKey(mint), "confirmed")).value.amount;
    expect(t!.supply).toBe(supply);
    expect(t!.snipers.windowSlots).toBe(WINDOW_SLOTS);
    const snipers = new Map(t!.snipers.wallets.map((w) => [w.wallet, w]));
    expect([...snipers.keys()].sort()).toEqual([a, b, c].map((k) => k.publicKey.toBase58()).sort());
    for (const w of snipers.values()) {
      expect(w.slotsAfterLaunch).toBeGreaterThan(0);
      expect(w.slotsAfterLaunch).toBeLessThanOrEqual(WINDOW_SLOTS);
      expect(w.boughtShare).toBeGreaterThan(0);
    }
    // The same amount paid by a and b marks each as the other's bundle mate; c paid its own.
    expect(snipers.get(a.publicKey.toBase58())!.sameAmountAs).toBe(1);
    expect(snipers.get(b.publicKey.toBase58())!.sameAmountAs).toBe(1);
    expect(snipers.get(c.publicKey.toBase58())!.sameAmountAs).toBe(0);
    expect(t!.snipers.sameAmount).toBe(2);
    expect(t!.snipers.inLaunchSlot).toBe(0);
    // Held is bought less sold: a kept half, b and c everything.
    const wa = snipers.get(a.publicKey.toBase58())!;
    expect(BigInt(wa.held)).toBe(BigInt(wa.bought) - sold);
    expect(wa.heldShare).toBeLessThan(wa.boughtShare);
    for (const k of [b, c]) {
      const w = snipers.get(k.publicKey.toBase58())!;
      expect(w.held).toBe(w.bought);
    }
    // The totals are the wallets' sums, as shares of the supply.
    const sumShare = (pick: (w: { boughtShare: number; heldShare: number }) => number) => [...snipers.values()].reduce((s, w) => s + pick(w), 0);
    expect(t!.snipers.boughtShare).toBeCloseTo(sumShare((w) => w.boughtShare), 6);
    expect(t!.snipers.heldShare).toBeCloseTo(sumShare((w) => w.heldShare), 6);
    // The list comes largest buy first.
    const bought = t!.snipers.wallets.map((w) => BigInt(w.bought));
    expect([...bought].sort((x, y) => (x === y ? 0 : x > y ? -1 : 1))).toEqual(bought);

    // The Creator: one coin here, none graduated, and the First Buy is the launch transaction's own buy.
    expect(t!.creator.address).toBe(creator.publicKey.toBase58());
    expect(t!.creator.launches).toBe(1);
    expect(t!.creator.graduated).toBe(0);
    expect(t!.creator.firstBuy).not.toBeNull();
    expect(BigInt(t!.creator.firstBuy!.amount)).toBe(await coinsOf(mint, creator));
    expect(t!.creator.firstBuy!.share).toBeCloseTo(Number(await coinsOf(mint, creator)) / Number(supply), 6);

    // A buy after the window is a trade like any other, not a snipe.
    const conn = connection();
    while ((await conn.getSlot("confirmed")) <= launchSlot + WINDOW_SLOTS) await sleep(500);
    const late = await fundedWallet();
    await deliverWebhook([(await trade(late, mint, "buy", SOL(0.2))).signature]);
    const after = (await trust(mint)).trust!;
    expect(after.snipers.wallets.map((w) => w.wallet)).not.toContain(late.publicKey.toBase58());
    expect(after.snipers.wallets).toHaveLength(3);
    expect(after.snipers.boughtShare).toBeCloseTo(t!.snipers.boughtShare, 9);

    // The Creator's second coin, launched without a First Buy, counts both on its record.
    const second = await launch(creator);
    await deliverWebhook([second.signature]);
    const t2 = (await trust(second.prepared.mint)).trust!;
    expect(t2.creator.launches).toBe(2);
    expect(t2.creator.firstBuy).toBeNull();
    expect(t2.snipers.wallets).toEqual([]);
    expect(t2.snipers.boughtShare).toBe(0);
  }, 120_000);

  it("answers 404 for a coin that is not here", async () => {
    expect((await trust("11111111111111111111111111111111")).status).toBe(404);
  });
});
