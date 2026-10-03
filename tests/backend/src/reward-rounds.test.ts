// Reward Rounds (#17, #43): the Reward Engine harvests a Reward Launch's withheld Reward Tax, snapshots its holders under
// the published rules, and pays each one pro rata in the Launch's Payout Asset: the coin itself, never sold, or the
// Quote Asset, bought with the tax in bounded Reward Sales. Rounds resume after a crash and never pay a holder twice;
// rule changes wait for their announced time.
import { describe, expect, it } from "vitest";
import { Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction, createTransferCheckedInstruction, getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { loadCurve } from "@launchpad/chain";
import {
  CoinRewards, LedgerPage, PreparedLaunch, REWARD_SALE_MAX_RESERVE_BPS, Revenue, RewardRoundDetail, RewardRulesPage, WalletRewards, type RewardPayoutAsset,
} from "@launchpad/contract";
import { LOCAL_QUOTES, migrateCurve, mintLocalQuote } from "@launchpad/localnet";
import { REWARD_ROUNDS_CRON } from "@launchpad/stack";
import { connection, deliverWebhook, env, fundedWallet, prepare, quote, signAndSend, solOf, tokenBalance, trade, trades } from "./client";

const api = (path: string, init?: RequestInit) => fetch(`${env().apiUrl}${path}`, init);
const operator = () => ({ authorization: `Bearer ${env().operatorToken}` });

/** Runs the Reward Engine as its Cron Trigger would; `maxPayouts` caps one run's payouts, as a crash mid-round would. */
async function runRounds(maxPayouts?: number) {
  const res = await api(`/v1/operator/jobs/reward-rounds${maxPayouts ? `?maxPayouts=${maxPayouts}` : ""}`, { method: "POST", headers: operator() });
  expect(res.status, await res.clone().text()).toBe(200);
  return (await res.json()) as {
    summary: {
      collected: { mint: string; amount: string }[];
      sold: { mint: string; signature: string; venue: "curve" | "pool"; coins: string; proceeds: string | null; outcome: string }[];
      unsold: { mint: string; reason: string }[];
      opened: { mint: string; round: string }[];
      paid: { round: string; payouts: number }[];
      returned: { round: string; payouts: number }[];
      finished: string[];
    };
  };
}

async function rewardCoin(bps: 100 | 300 | 500 = 500, payout: RewardPayoutAsset = "coin", quoteMint?: string) {
  const creator = await fundedWallet(10);
  const res = await prepare({ creator: creator.publicKey.toBase58(), rewardTax: String(bps), rewardPayout: payout, symbol: "RWRD", ...(quoteMint ? { quoteMint } : {}) });
  expect(res.status, await res.clone().text()).toBe(200);
  const prepared = PreparedLaunch.parse(await res.json());
  const signature = await signAndSend(prepared, creator);
  await deliverWebhook([signature]);
  return { creator, mint: prepared.mint, pool: new PublicKey(prepared.pool), bps };
}

/** The most one Reward Sale may sell right now: the published share of the curve's constant-product coin reserve. */
async function saleCap(pool: PublicKey) {
  const curve = (await loadCurve(connection(), pool))!;
  return (BigInt(curve.reserves.virtualBase.toString()) - BigInt(curve.reserves.realBase.toString())) * BigInt(REWARD_SALE_MAX_RESERVE_BPS) / 10_000n;
}

/** Hands coins of a Reward Launch to a wallet that has no SOL at all, the sender paying for its coin account. */
async function giveCoins(from: Keypair, mint: string, to: PublicKey, amount: bigint) {
  const m = new PublicKey(mint);
  const source = getAssociatedTokenAddressSync(m, from.publicKey, false, TOKEN_2022_PROGRAM_ID);
  const destination = getAssociatedTokenAddressSync(m, to, false, TOKEN_2022_PROGRAM_ID);
  const tx = new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(from.publicKey, destination, to, m, TOKEN_2022_PROGRAM_ID),
    createTransferCheckedInstruction(source, m, destination, from.publicKey, amount, 6, [], TOKEN_2022_PROGRAM_ID),
  );
  await sendAndConfirmTransaction(connection(), tx, [from], { commitment: "confirmed" });
}

const rewards = async (mint: string) => CoinRewards.parse(await (await api(`/v1/launches/${mint}/rewards`)).json());
const walletRewards = async (wallet: PublicKey) => WalletRewards.parse(await (await api(`/v1/wallets/${wallet.toBase58()}/rewards`)).json());
const held = (mint: string, wallet: Keypair) => tokenBalance(getAssociatedTokenAddressSync(new PublicKey(mint), wallet.publicKey, false, TOKEN_2022_PROGRAM_ID));

describe("Reward Rounds", () => {
  it("publishes the rules in force", async () => {
    const rules = RewardRulesPage.parse(await (await api("/v1/rewards/rules")).json());
    expect(rules.inForce).toMatchObject({ version: 1 });
    expect(BigInt(rules.inForce!.minHolding)).toBeGreaterThan(0n);
    expect(BigInt(rules.inForce!.roundThreshold)).toBeGreaterThan(0n);
  });

  it("pays every eligible holder their pro-rata share of the collected tax, in the coin itself", async () => {
    const { mint, bps } = await rewardCoin(500);
    // Three holders: two well above the minimum holding, one far below it (the test curve graduates at 1 SOL).
    const [big, mid, dust] = [await fundedWallet(10), await fundedWallet(10), await fundedWallet(10)];
    await trade(big, mint, "buy", 100_000_000n);
    await trade(mid, mint, "buy", 30_000_000n);
    await trade(dust, mint, "buy", 1_000n);
    const before = await rewards(mint);
    expect(before.rewardTaxBps).toBe(bps);
    // Every buy withheld 5% of the coins on the way to the wallet; it is all still waiting.
    expect(BigInt(before.waiting.total)).toBeGreaterThan(0n);
    expect(before.rounds).toEqual([]);
    const rules = before.rules!;
    const holdings = { big: await held(mint, big), mid: await held(mint, mid), dust: await held(mint, dust) };
    expect(holdings.dust).toBeLessThan(BigInt(rules.minHolding));
    expect(holdings.mid).toBeGreaterThanOrEqual(BigInt(rules.minHolding));

    // The engine runs over every Reward Launch there is; this coin's round is the one that matters here.
    const run = await runRounds();
    const opened = run.summary.opened.filter((o) => o.mint === mint);
    expect(opened).toHaveLength(1);
    expect(run.summary.finished).toContain(opened[0]!.round);

    const after = await rewards(mint);
    const [round] = after.rounds;
    expect(round).toMatchObject({ status: "paid", eligibleHolders: 2, rulesVersion: rules.version });
    const detail = RewardRoundDetail.parse(await (await api(`/v1/rewards/rounds/${round!.id}`)).json());
    const pot = BigInt(round!.pot);
    const total = holdings.big + holdings.mid;
    const expected = (wallet: Keypair, holding: bigint) => ({ wallet: wallet.publicKey.toBase58(), holding: holding.toString(), amount: ((pot * holding) / total).toString(), status: "paid" });
    expect(detail.payouts.map((p) => ({ wallet: p.wallet, holding: p.holding, amount: p.amount, status: p.status }))).toEqual([
      expected(big, holdings.big), expected(mid, holdings.mid),
    ]);
    // Paid in the coin: each wallet holds its share less the tax the payout itself withholds. Nothing was sold.
    const taxed = (amount: bigint) => amount - (amount * BigInt(bps) + 9_999n) / 10_000n;
    expect((await held(mint, big)) - holdings.big).toBe(taxed(BigInt(detail.payouts[0]!.amount)));
    expect((await held(mint, mid)) - holdings.mid).toBe(taxed(BigInt(detail.payouts[1]!.amount)));
    expect(await held(mint, dust)).toBe(holdings.dust);
    for (const p of detail.payouts) {
      const tx = await connection().getTransaction(p.signature!, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
      expect(tx?.meta?.err).toBeNull();
    }
    // The holder's own lookup answers "where are my rewards?".
    const mine = await walletRewards(big.publicKey);
    expect(mine.rewards).toMatchObject([{ round: round!.id, mint, amount: detail.payouts[0]!.amount, status: "paid" }]);
    expect((await walletRewards(dust.publicKey)).rewards).toEqual([]);
  });

  it("resumes a round cut short and pays the rest without paying anyone twice", async () => {
    // Settle every other Reward Launch first, so this run's one payout is this coin's.
    await runRounds();
    const { mint } = await rewardCoin(500);
    const holders = await Promise.all([1, 2, 3].map(() => fundedWallet(10)));
    for (const h of holders) await trade(h, mint, "buy", 40_000_000n);
    const holdings = await Promise.all(holders.map((h) => held(mint, h)));

    // The first run dies after this coin's first payout. Reward Launches are paid oldest first, and one that another
    // test file left with tax still to sell pays a round of its own on every run, so the run is given as many payouts
    // as it takes for one to reach this coin.
    let first = await runRounds(1);
    expect(first.summary.opened.filter((o) => o.mint === mint)).toHaveLength(1);
    const { rounds: [round] } = await rewards(mint);
    const own = (run: typeof first) => run.summary.paid.filter((p) => p.round === round!.id);
    for (let budget = 2; budget <= 12 && own(first).length === 0; budget++) first = await runRounds(budget);
    expect(own(first)).toEqual([{ round: round!.id, payouts: 1 }]);
    expect(first.summary.finished).not.toContain(round!.id);
    expect((await rewards(mint)).rounds[0]!.status).toBe("paying");

    // The next run pays the other two and closes the round.
    const second = await runRounds();
    expect(second.summary.opened.filter((o) => o.mint === mint)).toEqual([]);
    expect(own(second)).toEqual([{ round: round!.id, payouts: 2 }]);
    expect(second.summary.finished).toContain(round!.id);

    const detail = RewardRoundDetail.parse(await (await api(`/v1/rewards/rounds/${round!.id}`)).json());
    expect(detail.status).toBe("paid");
    expect(detail.payouts.every((p) => p.status === "paid")).toBe(true);
    const signatures = new Set(detail.payouts.map((p) => p.signature));
    expect(signatures.size).toBe(2); // one transaction for the first payout, one for the other two
    for (const [i, h] of holders.entries()) {
      const payout = BigInt(detail.payouts.find((p) => p.wallet === h.publicKey.toBase58())!.amount);
      expect((await held(mint, h)) - holdings[i]!).toBe(payout - (payout * 500n + 9_999n) / 10_000n);
    }

    // A further run finds nothing left to pay on this round. The payouts themselves withheld tax, so it may well open
    // the next round on this coin; that one is a new round, not this one paid again.
    const third = await runRounds();
    expect(third.summary.paid.filter((p) => p.round === round!.id)).toEqual([]);
    expect((await api(`/v1/rewards/rounds/${round!.id}`)).status).toBe(200);
    expect(RewardRoundDetail.parse(await (await api(`/v1/rewards/rounds/${round!.id}`)).json()).payouts.map((p) => p.signature)).toEqual(detail.payouts.map((p) => p.signature));
  });

  it("only changes its rules at an announced time, never sooner", async () => {
    const soon = new Date(Date.now() + 1_000).toISOString();
    const tooSoon = await api("/v1/operator/rewards/rules", {
      method: "POST", headers: { ...operator(), "content-type": "application/json" },
      body: JSON.stringify({ minHolding: "1", roundThreshold: "1", effectiveAt: soon, note: "too soon" }),
    });
    expect(tooSoon.status).toBe(422);
    const later = new Date(Date.now() + 3600_000).toISOString();
    const announced = await api("/v1/operator/rewards/rules", {
      method: "POST", headers: { ...operator(), "content-type": "application/json" },
      body: JSON.stringify({ minHolding: "1", roundThreshold: "1", effectiveAt: later, note: "lower bar" }),
    });
    expect(announced.status).toBe(201);
    const rules = RewardRulesPage.parse(await (await api("/v1/rewards/rules")).json());
    expect(rules.upcoming.map((r) => r.note)).toContain("lower bar");
    expect(rules.inForce!.note).not.toBe("lower bar");
    // Without the operator token the announcement is refused.
    expect((await api("/v1/operator/rewards/rules", { method: "POST", body: "{}" })).status).toBe(401);
  });

  it("sells a Quote Asset payout's tax in bounded slices, on the Ledger and in the trade history, and pays holders in SOL", async () => {
    // Settle every other Reward Launch first, so this run's sales and rounds are this coin's alone to read.
    await runRounds();
    const { mint, pool } = await rewardCoin(500, "quote");
    const before = await rewards(mint);
    expect(before.payout).toMatchObject({ asset: "quote", symbol: "SOL", decimals: 9 });
    expect(before.sales).toMatchObject({ maxReserveBps: REWARD_SALE_MAX_RESERVE_BPS, slippageBps: 100, sold: "0", proceeds: "0", recent: [] });
    // Two holders buy half the curve between them, so the withheld tax is far more than one slice may sell; a third
    // holds a little, received by transfer, and has no SOL of its own.
    const [big, mid] = [await fundedWallet(10), await fundedWallet(10)];
    const empty = Keypair.generate().publicKey;
    await trade(big, mint, "buy", 350_000_000n);
    await trade(mid, mint, "buy", 150_000_000n);
    await giveCoins(big, mint, empty, 20_000_000_000n);
    const holdings = { big: await held(mint, big), mid: await held(mint, mid), empty: await tokenBalance(getAssociatedTokenAddressSync(new PublicKey(mint), empty, false, TOKEN_2022_PROGRAM_ID)) };
    const rules = before.rules!;
    expect(holdings.empty).toBeGreaterThanOrEqual(BigInt(rules.minHolding));
    const cap = await saleCap(pool);
    const sol = { big: await solOf(big), mid: await solOf(mid) };

    const run = await runRounds();
    const collected = run.summary.collected.find((c) => c.mint === mint)!;
    expect(BigInt(collected.amount)).toBeGreaterThan(cap);
    // One slice, bounded to the published share of the market, sold on the curve and landed.
    const [sale, ...more] = run.summary.sold.filter((s) => s.mint === mint);
    expect(more).toEqual([]);
    expect(sale).toMatchObject({ venue: "curve", outcome: "landed" });
    expect(BigInt(sale!.coins)).toBe(cap);
    expect(BigInt(sale!.proceeds!)).toBeGreaterThan(0n);
    // The sale is a trade of the coin like anyone else's, on the Ledger as the coins out and the SOL in.
    const sold = (await trades(mint)).find((t) => t.signature === sale!.signature);
    expect(sold).toMatchObject({ side: "sell", venue: "curve", trader: env().platform.operationsWallet });
    const ledger = LedgerPage.parse(await (await api("/v1/ledger?kind=reward_sale")).json());
    const entries = ledger.entries.filter((e) => e.signature === sale!.signature).sort((a, b) => a.index - b.index);
    expect(entries.map((e) => [e.asset.mint === mint ? "coin" : e.asset.symbol, e.amount, e.launch?.mint])).toEqual([
      ["coin", sale!.coins, mint], ["SOL", sale!.proceeds, mint],
    ]);

    // The holders' pot is not platform revenue: the coin sold appears in no revenue total or day.
    const revenue = Revenue.parse(await (await api("/v1/revenue")).json());
    expect(revenue.totals.map((t) => t.asset.mint)).not.toContain(mint);
    expect(revenue.days.flatMap((d) => d.assets.map((a) => a.asset.mint))).not.toContain(mint);

    // Far more than the threshold was sold, so a round opened on the sale's proceeds and paid out in SOL, pro rata.
    const opened = run.summary.opened.filter((o) => o.mint === mint);
    expect(opened).toHaveLength(1);
    expect(run.summary.finished).toContain(opened[0]!.round);
    const after = await rewards(mint);
    const [round] = after.rounds;
    expect(round).toMatchObject({ status: "paid", eligibleHolders: 3, payout: { asset: "quote", symbol: "SOL" }, pot: sale!.proceeds, sold: sale!.coins });
    expect(BigInt(after.sales!.sold)).toBe(cap);
    expect(after.sales!.recent.map((s) => s.signature)).toEqual([sale!.signature]);
    expect(BigInt(after.waiting.collected)).toBe(BigInt(collected.amount) - cap);
    const detail = RewardRoundDetail.parse(await (await api(`/v1/rewards/rounds/${round!.id}`)).json());
    const pot = BigInt(round!.pot);
    const total = holdings.big + holdings.mid + holdings.empty;
    const share = (holding: bigint) => ((pot * holding) / total).toString();
    const byWallet = new Map(detail.payouts.map((p) => [p.wallet, p]));
    expect(byWallet.get(big.publicKey.toBase58())).toMatchObject({ amount: share(holdings.big), status: "paid" });
    expect(byWallet.get(mid.publicKey.toBase58())).toMatchObject({ amount: share(holdings.mid), status: "paid" });
    // Plain SOL, the whole share: the holder pays nothing for it.
    expect((await solOf(big)) - sol.big).toBe(BigInt(share(holdings.big)));
    expect((await solOf(mid)) - sol.mid).toBe(BigInt(share(holdings.mid)));
    // The empty wallet's share is less than an account's rent minimum, which no transfer to a wallet with no SOL can land:
    // it went back into the pot for the next round, and the round finished without it.
    expect(byWallet.get(empty.toBase58())).toMatchObject({ amount: share(holdings.empty), status: "returned", signature: null });
    expect(run.summary.returned).toEqual([{ round: round!.id, payouts: 1 }]);
    // What the round did not pay stays in the pot: the returned share and the rounding of the others.
    expect(BigInt(after.waiting.pot)).toBe(pot - BigInt(share(holdings.big)) - BigInt(share(holdings.mid)));
    expect(BigInt(await connection().getBalance(empty, "confirmed"))).toBe(0n);
    expect((await walletRewards(big.publicKey)).rewards[0]).toMatchObject({ round: round!.id, payout: { asset: "quote", symbol: "SOL" }, amount: share(holdings.big) });

    // The next run sells the next slice, bounded again by the market as it is then; nothing is ever sold outside a slice.
    const cap2 = await saleCap(pool);
    const second = await runRounds();
    const [next] = second.summary.sold.filter((s) => s.mint === mint);
    expect(next).toMatchObject({ venue: "curve", outcome: "landed" });
    expect(BigInt(next!.coins)).toBe(cap2);
  });

  it("pays a Quote Asset payout paired with USDC in USDC, into the holder's own account", async () => {
    const usdc = LOCAL_QUOTES.USDC;
    const { mint } = await rewardCoin(300, "quote", usdc.toBase58());
    const holder = await fundedWallet(10);
    await mintLocalQuote(connection(), usdc, holder.publicKey, 100_000_000n);
    await trade(holder, mint, "buy", 60_000_000n);
    const usdcOf = (owner: PublicKey) => tokenBalance(getAssociatedTokenAddressSync(usdc, owner, false, TOKEN_PROGRAM_ID));
    const before = await usdcOf(holder.publicKey);
    const run = await runRounds();
    const [sale] = run.summary.sold.filter((s) => s.mint === mint);
    expect(sale).toMatchObject({ outcome: "landed" });
    const opened = run.summary.opened.filter((o) => o.mint === mint);
    expect(opened).toHaveLength(1);
    const { rounds: [round], payout } = await rewards(mint);
    expect(payout).toMatchObject({ asset: "quote", mint: usdc.toBase58(), symbol: "USDC", decimals: 6 });
    expect(round).toMatchObject({ status: "paid", eligibleHolders: 1, payout: { asset: "quote", symbol: "USDC" } });
    // The one holder gets the whole pot, in USDC.
    expect(round!.paid).toBe(sale!.proceeds);
    expect((await usdcOf(holder.publicKey)) - before).toBe(BigInt(round!.paid));
  });

  it("sells in the coin's Raydium pool once it has graduated, and nothing while Raydium is moving it", async () => {
    await runRounds();
    const { mint, pool } = await rewardCoin(300, "quote");
    const trader = await fundedWallet(10);
    const buyout = await trade(trader, mint, "buy", 2_000_000_000n);
    expect(buyout.quote.completesCurve).toBe(true);
    await deliverWebhook([buyout.signature]);
    // Sold out but not migrated: the tax is harvested, and the slice waits.
    const waiting = await runRounds();
    expect(waiting.summary.sold.filter((s) => s.mint === mint)).toEqual([]);
    expect(waiting.summary.unsold.find((u) => u.mint === mint)?.reason).toMatch(/Raydium is moving the coin/);

    const migration = await migrateCurve(connection(), pool);
    await deliverWebhook([migration.signature]);
    for (let i = 0; i < 40; i++) {
      if ((await quote(mint, { side: "buy", amount: "10000000" })).ok) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    const run = await runRounds();
    const [sale] = run.summary.sold.filter((s) => s.mint === mint);
    expect(sale).toMatchObject({ venue: "pool", outcome: "landed" });
    expect(BigInt(sale!.proceeds!)).toBeGreaterThan(0n);
    const sold = (await trades(mint)).find((t) => t.signature === sale!.signature);
    expect(sold).toMatchObject({ side: "sell", venue: "pool", trader: env().platform.operationsWallet });
    const { rounds: [round], sales } = await rewards(mint);
    expect(sales!.recent[0]).toMatchObject({ signature: sale!.signature, venue: "pool", status: "landed", coins: sale!.coins, proceeds: sale!.proceeds });
    expect(round).toMatchObject({ status: "paid", eligibleHolders: 1, payout: { asset: "quote", symbol: "SOL" }, sold: sale!.coins, paid: sale!.proceeds });
  });

  it("runs on its Cron Trigger too", async () => {
    const res = await api(`/__scheduled?cron=${encodeURIComponent(REWARD_ROUNDS_CRON)}`);
    expect(res.ok).toBe(true);
  });
});

