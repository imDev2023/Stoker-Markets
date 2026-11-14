// The Reward Burn (#183, ADR 0006 amended): a Reward Launch may fix at launch a share of every harvested Reward Tax that
// the Reward Engine burns instead of paying out. The burn is in the transaction that withdraws the tax, before anything
// is sold or paid, and goes on the Ledger as a `reward_burn` entry on that transaction, never revenue and never a
// spending of the Budget Table. A coin payout pays the kept share; a Quote Asset payout sells only the kept share.
import { describe, expect, it } from "vitest";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync, getMint } from "@solana/spl-token";
import { BudgetsPage, CoinRewards, LaunchSummary, LedgerPage, PreparedLaunch, Revenue, RewardRoundDetail } from "@launchpad/contract";
import { connection, deliverWebhook, env, fundedWallet, prepare, signAndSend, tokenBalance, trade } from "./client";

const api = (path: string, init?: RequestInit) => fetch(`${env().apiUrl}${path}`, init);
const operator = () => ({ authorization: `Bearer ${env().operatorToken}` });
/** Where the Ledger records burned coins as having gone: the system program's address standing in for nowhere. */
const BURNED = PublicKey.default.toBase58();

type Summary = {
  collected: { mint: string; amount: string }[];
  burned: { mint: string; signature: string; burned: string; outcome: string }[];
  burnWaiting: string[];
  sold: { mint: string; signature: string; coins: string; proceeds: string | null; outcome: string }[];
  opened: { mint: string; round: string }[];
  finished: string[];
};

async function runRounds() {
  const res = await api("/v1/operator/jobs/reward-rounds", { method: "POST", headers: operator() });
  expect(res.status, await res.clone().text()).toBe(200);
  return ((await res.json()) as { summary: Summary }).summary;
}

async function rewardCoin(form: { rewardTax: string; rewardPayout: "coin" | "quote"; rewardBurn?: string; symbol: string }) {
  const creator = await fundedWallet(10);
  const res = await prepare({ creator: creator.publicKey.toBase58(), ...form });
  expect(res.status, await res.clone().text()).toBe(200);
  const prepared = PreparedLaunch.parse(await res.json());
  const signature = await signAndSend(prepared, creator);
  await deliverWebhook([signature]);
  return { prepared, mint: prepared.mint };
}

const rewards = async (mint: string) => CoinRewards.parse(await (await api(`/v1/launches/${mint}/rewards`)).json());
const supply = async (mint: string) => (await getMint(connection(), new PublicKey(mint), "confirmed", TOKEN_2022_PROGRAM_ID)).supply;
/** What the operations wallet holds of a coin: the collected tax waiting for a round or a sale. */
const opsHolds = (mint: string) =>
  tokenBalance(getAssociatedTokenAddressSync(new PublicKey(mint), new PublicKey(env().platform.operationsWallet), false, TOKEN_2022_PROGRAM_ID));
const rewardBurnEntries = async (mint: string) =>
  LedgerPage.parse(await (await api("/v1/ledger?kind=reward_burn&limit=100")).json()).entries.filter((e) => e.launch?.mint === mint);

describe("Reward Burn", () => {
  it("is a Reward Launch's choice among the offered shares, fixed with the draft", async () => {
    const creator = (await fundedWallet(1)).publicKey.toBase58();
    // Nothing to burn without a tax, not even a burn of nothing.
    for (const rewardBurn of ["2500", "0"]) {
      const standard = await prepare({ creator, rewardBurn });
      expect(standard.status).toBe(400);
      expect(((await standard.json()) as { error: string }).error).toMatch(/Reward Burn is only for a Reward Launch/);
    }
    // Only the steps the form offers: 0, 10, 25 and 50%.
    expect((await prepare({ creator, rewardTax: "300", rewardBurn: "3000" })).status).toBe(400);
    expect((await prepare({ creator, rewardTax: "300", rewardBurn: "10000" })).status).toBe(400);
    // Left out, a Reward Launch burns nothing, as every one did before.
    const plain = await prepare({ creator, rewardTax: "300" });
    expect(PreparedLaunch.parse(await plain.json()).rewardTax).toEqual({ bps: 300, payout: "coin", burnBps: 0 });
    const res = await prepare({ creator, rewardTax: "300", rewardPayout: "quote", rewardBurn: "1000" });
    const prepared = PreparedLaunch.parse(await res.json());
    expect(prepared.rewardTax).toEqual({ bps: 300, payout: "quote", burnBps: 1000 });
    // A retry rebuilds the same launch from the draft, the Reward Burn with it.
    const retry = await api(`/v1/launches/${prepared.mint}/prepare`, { method: "POST" });
    expect(retry.status, await retry.clone().text()).toBe(200);
    expect(PreparedLaunch.parse(await retry.json()).rewardTax).toEqual({ bps: 300, payout: "quote", burnBps: 1000 });
  });

  it("burns its share of every harvest in the withdrawal, on the Ledger and never revenue, and pays holders the rest in the coin", async () => {
    // Settle every other Reward Launch first, so this run's harvests are these coins' alone.
    await runRounds();
    const burning = await rewardCoin({ rewardTax: "500", rewardPayout: "coin", rewardBurn: "2500", symbol: "RBRN" });
    const plain = await rewardCoin({ rewardTax: "500", rewardPayout: "coin", symbol: "RKEP" });
    const launch = LaunchSummary.parse(await (await api(`/v1/launches/${burning.mint}`)).json());
    expect(launch.rewardTax).toMatchObject({ bps: 500, payout: "coin", burnBps: 2500 });
    expect((await rewards(burning.mint)).burn).toEqual({ bps: 2500, burned: "0", recent: [] });
    const [big, mid] = [await fundedWallet(10), await fundedWallet(10)];
    for (const mint of [burning.mint, plain.mint]) {
      await trade(big, mint, "buy", 100_000_000n);
      await trade(mid, mint, "buy", 40_000_000n);
    }
    const supplyBefore = await supply(burning.mint);
    const budgetsBefore = BudgetsPage.parse(await (await api("/v1/budgets")).json());

    const run = await runRounds();
    const collected = BigInt(run.collected.find((c) => c.mint === burning.mint)!.amount);
    const share = (collected * 2_500n) / 10_000n;
    expect(share).toBeGreaterThan(0n);
    // One burn for the coin with a share, in the transaction that withdrew its tax; none for the coin without one.
    const burns = run.burned.filter((b) => b.mint === burning.mint);
    expect(burns).toEqual([expect.objectContaining({ burned: share.toString(), outcome: "landed" })]);
    expect(run.burned.filter((b) => b.mint === plain.mint)).toEqual([]);
    expect(run.collected.find((c) => c.mint === plain.mint)).toBeDefined();
    const [burn] = burns;
    // The coins are gone from the supply.
    expect(supplyBefore - (await supply(burning.mint))).toBe(share);
    const tx = await connection().getTransaction(burn!.signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    expect(tx?.meta?.err).toBeNull();

    // On the Ledger: one entry on the withdrawal, the coins from the operations wallet to nowhere, under the coin.
    expect(await rewardBurnEntries(burning.mint)).toEqual([
      expect.objectContaining({
        signature: burn!.signature, index: 0, kind: "reward_burn", asset: expect.objectContaining({ mint: burning.mint }), amount: share.toString(),
        source: env().platform.operationsWallet, destination: BURNED, launch: expect.objectContaining({ mint: burning.mint }),
      }),
    ]);
    expect(await rewardBurnEntries(plain.mint)).toEqual([]);
    // Never revenue, and never a spending of any row of the Budget Table.
    const revenue = Revenue.parse(await (await api("/v1/revenue")).json());
    expect(revenue.totals.map((t) => t.asset.mint)).not.toContain(burning.mint);
    const budgetsAfter = BudgetsPage.parse(await (await api("/v1/budgets")).json());
    expect(budgetsAfter.rows.map((r) => [r.row, r.spentLamports])).toEqual(budgetsBefore.rows.map((r) => [r.row, r.spentLamports]));

    // The round paid out the kept share only: its pot is what was collected less what was burned.
    const opened = run.opened.find((o) => o.mint === burning.mint);
    expect(opened).toBeDefined();
    expect(run.finished).toContain(opened!.round);
    const detail = RewardRoundDetail.parse(await (await api(`/v1/rewards/rounds/${opened!.round}`)).json());
    expect(BigInt(detail.pot)).toBe(collected - share);
    const plainRound = RewardRoundDetail.parse(await (await api(`/v1/rewards/rounds/${run.opened.find((o) => o.mint === plain.mint)!.round}`)).json());
    expect(plainRound.pot).toBe(run.collected.find((c) => c.mint === plain.mint)!.amount);

    // The coin's rewards say the share and what it has burned, each burn with its transaction.
    expect((await rewards(burning.mint)).burn).toEqual({
      bps: 2500, burned: share.toString(), recent: [expect.objectContaining({ signature: burn!.signature, coins: share.toString() })],
    });
    expect((await rewards(plain.mint)).burn).toEqual({ bps: 0, burned: "0", recent: [] });
  });

  it("sells only the kept share of a Quote Asset payout's tax", async () => {
    await runRounds();
    // A little tax at 1%, far under one slice's bound, so the sale is the whole of what is left after the burn.
    const { mint } = await rewardCoin({ rewardTax: "100", rewardPayout: "quote", rewardBurn: "5000", symbol: "RBQT" });
    const holder = await fundedWallet(10);
    await trade(holder, mint, "buy", 100_000_000n);
    const supplyBefore = await supply(mint);

    const run = await runRounds();
    const collected = BigInt(run.collected.find((c) => c.mint === mint)!.amount);
    const share = collected / 2n;
    expect(run.burned.filter((b) => b.mint === mint)).toEqual([expect.objectContaining({ burned: share.toString(), outcome: "landed" })]);
    expect(supplyBefore - (await supply(mint))).toBe(share);
    // Half was burned, so the slice sold the other half and nothing more: the standing sell falls by the burned share.
    const [sale, ...more] = run.sold.filter((s) => s.mint === mint);
    expect(more).toEqual([]);
    expect(sale).toMatchObject({ outcome: "landed", coins: (collected - share).toString() });
    expect(await opsHolds(mint)).toBe(0n);
    const after = await rewards(mint);
    expect(after.sales!.sold).toBe((collected - share).toString());
    expect(after.burn).toMatchObject({ bps: 5000, burned: share.toString() });
  });
});
