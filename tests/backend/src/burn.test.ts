// Burn and Flywheel (#18): 60% of revenue buys the Platform Token and burns it, 5% buys the top graduated coins by the
// published rule and burns them, every buy and burn on the Ledger. Budgets come from the Ledger's revenue entries, so
// the shares are exact and reproducible from indexed data.
import postgres from "postgres";
import { describe, expect, it } from "vitest";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, getMint, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { BudgetsPage, BurnsPage, LedgerPage } from "@launchpad/contract";
import { BURN_CRON, FEE_COLLECTOR_CRON } from "@launchpad/stack";
import { LOCAL_QUOTES, migrateCurve, mintLocalQuote } from "@launchpad/localnet";
import { connection, deliverWebhook, env, fundedWallet, launch, launchedCoin, quote, SOL, tokenBalance, trade } from "./client";

const api = (path: string, init?: RequestInit) => fetch(`${env().apiUrl}${path}`, init);
const operator = () => ({ authorization: `Bearer ${env().operatorToken}`, "content-type": "application/json" });
const burns = async () => BurnsPage.parse(await (await api("/v1/burns")).json());

/** A SOL-paired coin bought out and migrated, its pool open. */
async function graduatedCoin(symbol: string) {
  const coin = await launchedCoin();
  const trader = await fundedWallet(10);
  const buyout = await trade(trader, coin.mint, "buy", SOL(2));
  expect(buyout.quote.completesCurve).toBe(true);
  const migration = await migrateCurve(connection(), coin.pool);
  await deliverWebhook([buyout.signature, migration.signature]);
  for (let i = 0; i < 40; i++) {
    if ((await quote(coin.mint, { side: "buy", amount: SOL(0.01).toString() })).ok) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  void symbol;
  return { ...coin, trader };
}

async function runJob(job: "burn" | "fee-collector" | "reward-rounds") {
  const res = await api(`/v1/operator/jobs/${job}`, { method: "POST", headers: operator() });
  const body = (await res.json()) as { status: string; summary: unknown; error?: string };
  expect(res.status, JSON.stringify(body)).toBe(200);
  return body;
}

const supplyOf = async (mint: string) => (await getMint(connection(), new PublicKey(mint), "confirmed", TOKEN_PROGRAM_ID)).supply;

describe("Burn and Flywheel", () => {
  it("stays idle until the operator names the Platform Token, and refuses a coin not launched here", async () => {
    const page = await burns();
    expect(page.shares).toEqual({ burnBps: 6000, flywheelBps: 500, flywheelTopN: 3 });
    expect(page.rule).toMatch(/60%/);
    const bad = await api("/v1/operator/platform-token", { method: "PUT", headers: operator(), body: JSON.stringify({ mint: PublicKey.unique().toBase58() }) });
    expect(bad.status).toBe(422);
    expect((await api("/v1/operator/platform-token", { method: "PUT", body: "{}" })).status).toBe(401);
  });

  it("burns the Platform Token with exactly the burn share of revenue, and the Flywheel's picks with theirs", async () => {
    // The Platform Token: Launch #1 on our own platform, graduated so it has a pool to buy from.
    const token = await graduatedCoin("PLAT");
    const named = await api("/v1/operator/platform-token", { method: "PUT", headers: operator(), body: JSON.stringify({ mint: token.mint }) });
    expect(named.status).toBe(200);
    // A second graduated coin, traded more than the Platform Token today, which the Flywheel rule picks first. Both are
    // traded more than any coin the other tests graduate, so both are among the rule's three picks.
    const hot = await graduatedCoin("HOT");
    await deliverWebhook([(await trade(hot.trader, hot.mint, "buy", SOL(4))).signature]);
    await deliverWebhook([(await trade(token.trader, token.mint, "buy", SOL(3))).signature]);

    // Revenue: the Fee Collector claims the Platform Fee of every trade so far into the operations wallet.
    await runJob("fee-collector");
    const before = await burns();
    const revenue = BigInt(before.budgets.revenueLamports);
    expect(revenue).toBeGreaterThan(0n);
    expect(before.budgets.burn).toEqual({ spent: "0", available: ((revenue * 6000n) / 10_000n).toString() });
    expect(before.budgets.flywheel).toEqual({ spent: "0", available: ((revenue * 500n) / 10_000n).toString() });
    // Other tests graduate coins too; the rule ranks by volume, so the hot coin comes before the Platform Token.
    const picks = before.nextFlywheel.map((p) => p.mint);
    expect(picks, JSON.stringify(before.nextFlywheel)).toContain(hot.mint);
    expect(picks, JSON.stringify(before.nextFlywheel)).toContain(token.mint);
    expect(picks.indexOf(hot.mint)).toBeLessThan(picks.indexOf(token.mint));
    const supply = { token: await supplyOf(token.mint), hot: await supplyOf(hot.mint) };

    const run = await runJob("burn");
    const summary = run.summary as {
      burned: { signature: string; lamports: string; amount: string } | null; flywheel: { mint: string; amount: string }[]; skipped: { mint: string; reason: string }[];
    };
    expect(summary.burned).not.toBeNull();
    expect(summary.skipped).toEqual([]);
    expect(summary.flywheel.map((f) => f.mint).sort()).toEqual(picks.slice().sort());

    // The Platform Token's supply fell by exactly what the burn destroyed, and the Ledger says what was spent.
    expect(supply.token - (await supplyOf(token.mint))).toBe(BigInt(summary.burned!.amount) + BigInt(summary.flywheel.find((f) => f.mint === token.mint)!.amount));
    expect(supply.hot - (await supplyOf(hot.mint))).toBe(BigInt(summary.flywheel.find((f) => f.mint === hot.mint)!.amount));
    const after = await burns();
    const spent = BigInt(after.budgets.burn.spent);
    // Spent at most the share, and all but the slippage allowance of it; the rest stays available.
    expect(spent).toBeLessThanOrEqual((revenue * 6000n) / 10_000n);
    expect(spent).toBeGreaterThan((revenue * 6000n * 98n) / 1_000_000n);
    expect(BigInt(after.budgets.burn.available)).toBe((revenue * 6000n) / 10_000n - spent);
    expect(after.events.map((e) => e.kind).sort()).toEqual(["burn", ...picks.map(() => "flywheel")]);
    expect(after.burned.find((b) => b.coin.mint === token.mint)!.amount).toBe((supply.token - (await supplyOf(token.mint))).toString());

    const ledger = LedgerPage.parse(await (await api("/v1/ledger?kind=burn")).json());
    expect(ledger.entries).toHaveLength(2);
    const tx = await connection().getTransaction(summary.burned!.signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    expect(tx?.meta?.err).toBeNull();

    // A second run has only what the slippage allowance left, and spends at most that.
    const again = await runJob("burn");
    const left = (again.summary as { burned: { lamports: string } | null }).burned;
    expect(BigInt(left?.lamports ?? "0")).toBeLessThanOrEqual(BigInt(after.budgets.burn.available));
  });

  // The suite's longest flow: a Graduation, then the burn funded twice through up to a dozen launch-and-buy-out rounds,
  // about 80 s on its own and more beside another chain on the same machine.
  it("burns a graduated Reward Launch too, and leaves the coin account that holds its harvested Reward Tax open", { timeout: 180_000 }, async () => {
    // Named as the Platform Token here; the Flywheel buys a graduated Reward Launch it picks in the same way.
    const creator = await fundedWallet();
    // Paid out in SOL: the tax harvested for the holders waits in the wallet's coin account, sold a slice per run.
    const { prepared, signature } = await launch(creator, { rewardTax: "300", rewardPayout: "quote", symbol: "RWB" });
    await deliverWebhook([signature]);
    const mint = new PublicKey(prepared.mint);
    const trader = await fundedWallet(20);
    const buyout = await trade(trader, prepared.mint, "buy", SOL(2));
    expect(buyout.quote.completesCurve).toBe(true);
    const migration = await migrateCurve(connection(), new PublicKey(prepared.pool));
    await deliverWebhook([buyout.signature, migration.signature]);
    for (let i = 0; i < 40; i++) {
      if ((await quote(prepared.mint, { side: "buy", amount: SOL(0.01).toString() })).ok) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    expect((await api("/v1/operator/platform-token", { method: "PUT", headers: operator(), body: JSON.stringify({ mint: prepared.mint }) })).status).toBe(200);
    const account = getAssociatedTokenAddressSync(mint, new PublicKey(env().platform.operationsWallet), false, TOKEN_2022_PROGRAM_ID);
    const supplyNow = async () => (await getMint(connection(), mint, "confirmed", TOKEN_2022_PROGRAM_ID)).supply;

    /** Revenue enough for one buy: the burn waits until its budget is worth a transaction. */
    const fund = async () => {
      for (let i = 0; i < 6 && BigInt((await burns()).budgets.burn.available) < SOL(0.012); i++) {
        const coin = await launchedCoin();
        await deliverWebhook([(await trade(trader, coin.mint, "buy", SOL(1.2))).signature]);
        await runJob("fee-collector");
      }
      const budget = BigInt((await burns()).budgets.burn.available);
      expect(budget).toBeGreaterThanOrEqual(SOL(0.012));
      return budget;
    };
    /** One Burn run: what was bought is gone from the supply, and the Ledger's spend is the buy alone. */
    const burnOnce = async (budget: bigint) => {
      const supply = await supplyNow();
      const run = await runJob("burn");
      const summary = run.summary as {
        burned: { signature: string; lamports: string; amount: string } | null;
        flywheel: { mint: string; amount: string }[];
        problems: string[];
      };
      expect(summary.problems).toEqual([]);
      expect(summary.burned).not.toBeNull();
      // The Flywheel may pick the coin in the same run, as one of the busiest graduated Launches.
      const picked = summary.flywheel.filter((f) => f.mint === prepared.mint).reduce((sum, f) => sum + BigInt(f.amount), 0n);
      expect(supply - (await supplyNow())).toBe(BigInt(summary.burned!.amount) + picked);
      expect(BigInt(summary.burned!.lamports)).toBeLessThanOrEqual(budget);
      expect(BigInt(summary.burned!.lamports)).toBeGreaterThan((budget * 98n) / 100n);
    };

    // The wallet has no account for the coin yet. The burn opens one and can't close it again, since the buy's own
    // Reward Tax is withheld in it: it stays, empty, and its rent is no part of what the buy cost.
    const budget = await fund();
    expect(await connection().getAccountInfo(account, "confirmed")).toBeNull();
    await burnOnce(budget);
    expect(await connection().getAccountInfo(account, "confirmed")).not.toBeNull();
    expect(await tokenBalance(account)).toBe(0n);

    // The holder sells out into the pool, which charges its fees on a sale in the coin: revenue in the coin, for the Fee
    // Collector to collect into that same account and sweep on.
    const holding = await tokenBalance(getAssociatedTokenAddressSync(mint, trader.publicKey, false, TOKEN_2022_PROGRAM_ID));
    await deliverWebhook([(await trade(trader, prepared.mint, "sell", holding)).signature]);
    // The Reward Engine harvests the tax into the account and sells one bounded slice of it; the rest stays there, the
    // holders' coins. Neither the Fee Collector's sweeps nor the next burn take any of them: a sweep counts what left
    // the wallet, not the less that reached the treasury after the coin's own tax, so it never finds revenue missing.
    await runJob("reward-rounds");
    const harvested = await tokenBalance(account);
    expect(harvested).toBeGreaterThan(0n);
    await burnOnce(await fund());
    expect(await tokenBalance(account)).toBe(harvested);
  });

  it("buys a coin paired with USDC in two steps: SOL into USDC through the route, then the coin in its own pool", async () => {
    const USDC = LOCAL_QUOTES.USDC;
    const creator = await fundedWallet();
    const { prepared, signature } = await launch(creator, { symbol: "UBRN", quoteMint: USDC.toBase58() });
    await deliverWebhook([signature]);
    const mint = new PublicKey(prepared.mint);
    const trader = await fundedWallet(20);
    await mintLocalQuote(connection(), USDC, trader.publicKey, 400_000_000n);
    const buyout = await trade(trader, prepared.mint, "buy", 200_000_000n);
    expect(buyout.quote.completesCurve).toBe(true);
    const migration = await migrateCurve(connection(), new PublicKey(prepared.pool));
    await deliverWebhook([buyout.signature, migration.signature]);
    for (let i = 0; i < 40; i++) {
      if ((await quote(prepared.mint, { side: "buy", amount: "1000000" })).ok) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    expect((await api("/v1/operator/platform-token", { method: "PUT", headers: operator(), body: JSON.stringify({ mint: prepared.mint }) })).status).toBe(200);
    for (let i = 0; i < 6 && BigInt((await burns()).budgets.burn.available) < SOL(0.012); i++) {
      const coin = await launchedCoin();
      await deliverWebhook([(await trade(trader, coin.mint, "buy", SOL(1.2))).signature]);
      await runJob("fee-collector");
    }
    const budget = BigInt((await burns()).budgets.burn.available);
    expect(budget).toBeGreaterThanOrEqual(SOL(0.012));
    const ops = new PublicKey(env().platform.operationsWallet);
    const usdcHeld = await tokenBalance(getAssociatedTokenAddressSync(USDC, ops, false, TOKEN_PROGRAM_ID));
    const supply = (await getMint(connection(), mint, "confirmed", TOKEN_PROGRAM_ID)).supply;

    const run = await runJob("burn");
    const summary = run.summary as {
      burned: { signature: string; lamports: string; amount: string } | null;
      flywheel: { mint: string; amount: string }[];
      skipped: { mint: string; reason: string }[];
      problems: string[];
    };
    expect(summary.problems).toEqual([]);
    expect(summary.skipped.filter((k) => k.mint === prepared.mint)).toEqual([]);
    expect(summary.burned).not.toBeNull();
    const picked = summary.flywheel.filter((f) => f.mint === prepared.mint).reduce((sum, f) => sum + BigInt(f.amount), 0n);
    expect(supply - (await getMint(connection(), mint, "confirmed", TOKEN_PROGRAM_ID)).supply).toBe(BigInt(summary.burned!.amount) + picked);
    // The swap takes exactly the budget, and every coin bought is burned: the wallet keeps none.
    expect(BigInt(summary.burned!.lamports)).toBe(budget);
    expect(await connection().getAccountInfo(getAssociatedTokenAddressSync(mint, ops, false, TOKEN_PROGRAM_ID), "confirmed")).toBeNull();
    // The pool took no more USDC than the least the swap could deliver, so the wallet's own USDC is never spent.
    expect(await tokenBalance(getAssociatedTokenAddressSync(USDC, ops, false, TOKEN_PROGRAM_ID))).toBeGreaterThanOrEqual(usdcHeld);
  });

  // #184: the operator points either budget at protocol-owned liquidity; nothing is burned, and each addition is a locked
  // position in the coin's own pool whose Fee Key the operations wallet holds. Last but one in this file, since the tests
  // above assert the Burn's spending from zero, and the destinations go back to burn however this ends.
  it("adds to the Platform Token's pool as locked liquidity once the operator points the Burn there, and the Flywheel's picks too", { timeout: 180_000 }, async () => {
    const destinations = (body: unknown, headers: Record<string, string> = operator()) =>
      api("/v1/operator/budget-destinations", { method: "PUT", headers, body: JSON.stringify(body) });
    expect((await destinations({ burn: "liquidity" }, { "content-type": "application/json" })).status).toBe(401);
    expect((await destinations({ burn: "lp" })).status).toBe(400);
    expect((await destinations({})).status).toBe(400);
    expect((await destinations({ burn: "liquidity", treasury: "liquidity" })).status).toBe(400);
    expect((await burns()).destinations).toEqual({ burn: "burn", flywheel: "burn" });
    try {
      // The budget first, so no Fee Collector run comes between the Platform Token's Graduation and its first addition:
      // the run after it must still find the Fee Key Raydium's migration minted for the pool, beside the addition's own.
      const funder = await fundedWallet(20);
      for (let i = 0; i < 6 && BigInt((await burns()).budgets.burn.available) < SOL(0.02); i++) {
        const coin = await launchedCoin();
        await deliverWebhook([(await trade(funder, coin.mint, "buy", SOL(1.2))).signature]);
        await runJob("fee-collector");
      }
      const token = await graduatedCoin("POL");
      expect((await api("/v1/operator/platform-token", { method: "PUT", headers: operator(), body: JSON.stringify({ mint: token.mint }) })).status).toBe(200);
      const set = await destinations({ burn: "liquidity", flywheel: "liquidity" });
      expect(set.status).toBe(200);
      expect(await set.json()).toEqual({ destinations: { burn: "liquidity", flywheel: "liquidity" } });
      const page = await burns();
      expect(page.destinations).toEqual({ burn: "liquidity", flywheel: "liquidity" });
      expect(page.rule).toMatch(/locked/);

      const before = await burns();
      const budget = BigInt(before.budgets.burn.available);
      expect(budget).toBeGreaterThanOrEqual(SOL(0.012));
      const supply = await supplyOf(token.mint);

      const run = await runJob("burn");
      const summary = run.summary as {
        destinations: { burn: string; flywheel: string };
        burned: unknown;
        added: { signature: string; lamports: string; amount: string; position: string; feeKey: string } | null;
        flywheel: { mint: string; amount: string; destination: string }[];
        skipped: { mint: string; reason: string }[];
        problems: string[];
      };
      expect(summary.problems).toEqual([]);
      expect(summary.destinations).toEqual({ burn: "liquidity", flywheel: "liquidity" });
      expect(summary.burned).toBeNull();
      expect(summary.added, JSON.stringify(summary.skipped)).not.toBeNull();
      const added = summary.added!;
      // Every Flywheel buy went into its coin's pool too; a pick paired with another Quote Asset waits for a route.
      expect(summary.flywheel.every((f) => f.destination === "liquidity")).toBe(true);
      for (const k of summary.skipped) expect(k.reason).not.toBe("");

      // Nothing burned: every coin bought went into the pool, beside the SOL paired with it.
      expect(await supplyOf(token.mint)).toBe(supply);
      expect(BigInt(added.amount)).toBeGreaterThan(0n);
      // The budget paid for it, never more than it had, nearly all of it (the buy's 1% allowance and the deposit's slack stay).
      const spent = BigInt(added.lamports);
      expect(spent).toBeLessThanOrEqual(budget);
      expect(spent).toBeGreaterThan((budget * 95n) / 100n);
      const after = await burns();
      expect(BigInt(after.budgets.burn.spent) - BigInt(before.budgets.burn.spent)).toBe(spent);
      expect(after.events.some((e) => e.signature === added.signature)).toBe(false);

      // The position is locked in Raydium's lock program and its Fee Key is in the operations wallet.
      const ops = new PublicKey(env().platform.operationsWallet);
      expect(await connection().getAccountInfo(new PublicKey(added.position), "confirmed")).not.toBeNull();
      expect(await tokenBalance(getAssociatedTokenAddressSync(new PublicKey(added.feeKey), ops, true))).toBe(1n);

      // Protocol-owned liquidity, on the Stats page's read and on the Ledger.
      const shown = after.liquidity.additions.find((a) => a.signature === added.signature);
      expect(shown).toMatchObject({ kind: "burn", lamports: added.lamports, amount: added.amount, position: added.position, feeKey: added.feeKey });
      expect(shown!.coin.mint).toBe(token.mint);
      expect(after.liquidity.count).toBe(1 + summary.flywheel.length);
      expect(BigInt(after.liquidity.lamports)).toBe(spent + summary.flywheel.reduce((sum, f) => sum + BigInt(after.liquidity.additions.find((a) => a.coin.mint === f.mint && a.kind === "flywheel")!.lamports), 0n));
      const ledger = LedgerPage.parse(await (await api("/v1/ledger?kind=burn_liquidity")).json()).entries.filter((e) => e.signature === added.signature);
      expect(ledger.map((e) => [e.index, e.asset.mint, e.amount, e.destination]).sort()).toEqual(
        [[0, "So11111111111111111111111111111111111111112", added.lamports, ledger.find((e) => e.index === 0)!.destination], [1, token.mint, added.amount, added.position]].sort(),
      );

      // The Fee Key is on record for the Fee Collector (the page's `feeKey` above is read from that record), and the
      // Fee Collector's next run still finds the position Raydium's migration locked in the same pool.
      const pool = ledger.find((e) => e.index === 0)!.destination;
      await runJob("fee-collector");
      const db = postgres(env().databaseUrl, { max: 1, onnotice: () => {} });
      try {
        const keys = await db<{ nft_mint: string }[]>`select nft_mint from fee_keys where pool = ${pool}`;
        expect(keys.map((k) => k.nft_mint)).toContain(added.feeKey);
        // The migration's, the Burn's addition's, and the Flywheel's where it picked the same coin this run.
        expect(keys).toHaveLength(2 + summary.flywheel.filter((f) => f.mint === token.mint).length);
      } finally {
        await db.end();
      }
    } finally {
      expect((await destinations({ burn: "burn", flywheel: "burn" })).status).toBe(200);
    }
  });

  it("runs on its Cron Trigger too, and the Fee Collector's sweep leaves the unspent budgets behind", async () => {
    expect((await api(`/__scheduled?cron=${encodeURIComponent(BURN_CRON)}`)).ok).toBe(true);
    expect((await api(`/__scheduled?cron=${encodeURIComponent(FEE_COLLECTOR_CRON)}`)).ok).toBe(true);
    // Every spending row of the Budget Table (ADR 0019), not the Burn's and the Flywheel's alone.
    const page = BudgetsPage.parse(await (await api("/v1/budgets")).json());
    const reserved = page.rows.reduce((sum, r) => sum + BigInt(r.availableLamports ?? "0"), 0n);
    const balance = BigInt(await connection().getBalance(new PublicKey(env().platform.operationsWallet), "confirmed"));
    expect(balance).toBeGreaterThanOrEqual(reserved);
  });
});
