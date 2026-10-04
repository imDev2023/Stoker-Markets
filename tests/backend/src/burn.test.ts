// Burn and Flywheel (#18): 60% of revenue buys the Platform Token and burns it, 5% buys the top graduated coins by the
// published rule and burns them, every buy and burn on the Ledger. Budgets come from the Ledger's revenue entries, so
// the shares are exact and reproducible from indexed data.
import { describe, expect, it } from "vitest";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, getMint, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { BurnsPage, LedgerPage } from "@launchpad/contract";
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

  it("burns a graduated Reward Launch too, and leaves the coin account that holds its harvested Reward Tax open", async () => {
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

  it("runs on its Cron Trigger too, and the Fee Collector's sweep leaves the unspent budgets behind", async () => {
    expect((await api(`/__scheduled?cron=${encodeURIComponent(BURN_CRON)}`)).ok).toBe(true);
    expect((await api(`/__scheduled?cron=${encodeURIComponent(FEE_COLLECTOR_CRON)}`)).ok).toBe(true);
    const page = await burns();
    const reserved = BigInt(page.budgets.burn.available) + BigInt(page.budgets.flywheel.available);
    const balance = BigInt(await connection().getBalance(new PublicKey(env().platform.operationsWallet), "confirmed"));
    expect(balance).toBeGreaterThanOrEqual(reserved);
  });
});
