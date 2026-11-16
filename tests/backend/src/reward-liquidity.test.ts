// The Reward Liquidity (#214, ADR 0006 amended): a Reward Launch may fix at launch a share of every harvested Reward Tax
// that the Reward Engine keeps apart and adds to the coin's pool as locked liquidity, beside the Reward Burn, the two at
// most half of every harvest. The share moves in the withdrawal's own transaction to an account of its own, tax-free;
// before Graduation it waits there, and the engine sells and pays only what is left. After Graduation one transaction
// sells part of it for the Quote Asset, deposits the pair and locks the LP tokens, the operations wallet keeping the Fee
// Key, as a `reward_liquidity` entry on the Ledger. Every figure is checked against the chain and the planner's own
// arithmetic, from the pool as it stood.
import { afterAll, describe, expect, it } from "vitest";
import { PublicKey, type Keypair } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, getAccount, getAssociatedTokenAddressSync, getTransferFeeAmount } from "@solana/spl-token";
import BN from "bn.js";
import postgres from "postgres";
import {
  liquidityCoinAccount, loadPool, lockCoder, lockPdas, planRewardLiquidityAddition, programsFor, rewardLiquidityQuoteAccount, poolSides, WSOL_MINT,
} from "@launchpad/chain";
import { BudgetsPage, CoinRewards, LaunchSummary, LedgerPage, PreparedLaunch, Revenue, RewardRoundDetail } from "@launchpad/contract";
import { migrateCurve } from "@launchpad/localnet";
import { connection, deliverWebhook, env, fundedWallet, prepare, quote, signAndSend, tokenBalance, trade } from "./client";

const programs = programsFor("localnet");
const WSOL = WSOL_MINT.toBase58();
const api = (path: string, init?: RequestInit) => fetch(`${env().apiUrl}${path}`, init);
const operator = () => ({ authorization: `Bearer ${env().operatorToken}` });
const ops = () => new PublicKey(env().platform.operationsWallet);
const big = (n: BN) => BigInt(n.toString());

type Summary = {
  collected: { mint: string; amount: string }[];
  burned: { mint: string; signature: string; burned: string; kept: string; outcome: string }[];
  liquidityAdded: {
    mint: string; signature: string; outcome: string; coinsSold: string | null; coinsAdded: string | null; quoteAdded: string | null; position: string;
    plannedFrom: { coins: string; quote: string; coinReserve: string; quoteReserve: string };
  }[];
  liquidityWaiting: { mint: string; reason: string }[];
  sold: { mint: string; coins: string; outcome: string }[];
  opened: { mint: string; round: string }[];
  settled: { liquidity: { landed: number; failed: number; expired: number } };
  problems: string[];
};

/** One Reward Engine run. Another file's coin can fail a run that did everything right for ours, so each test reads its own coin. */
async function runRounds() {
  const res = await api("/v1/operator/jobs/reward-rounds", { method: "POST", headers: operator() });
  const run = (await res.json()) as { summary: Summary | null };
  expect(run.summary, JSON.stringify(run)).not.toBeNull();
  return run.summary!;
}

type Coin = { mint: string; curve: PublicKey; prepared: PreparedLaunch };

async function rewardCoin(form: { rewardTax: string; rewardPayout: "coin" | "quote"; rewardBurn?: string; rewardLiquidity?: string; symbol: string }): Promise<Coin> {
  const creator = await fundedWallet(10);
  const res = await prepare({ creator: creator.publicKey.toBase58(), ...form });
  expect(res.status, await res.clone().text()).toBe(200);
  const prepared = PreparedLaunch.parse(await res.json());
  await deliverWebhook([await signAndSend(prepared, creator)]);
  return { mint: prepared.mint, curve: new PublicKey(prepared.pool), prepared };
}

const rewards = async (mint: string) => CoinRewards.parse(await (await api(`/v1/launches/${mint}/rewards`)).json());
const refusal = async (res: Response) => ((await res.json()) as { error: string }).error;
/** The Reward Liquidity's own two accounts for a coin paired with SOL. */
const keptCoins = async (mint: string) => tokenBalance((await liquidityCoinAccount(ops(), new PublicKey(mint), TOKEN_2022_PROGRAM_ID, "reward")).address);
const keptQuote = async (mint: string) => {
  const account = (await rewardLiquidityQuoteAccount(ops(), new PublicKey(mint), TOKEN_PROGRAM_ID)).address;
  return (await connection().getAccountInfo(account, "confirmed")) ? tokenBalance(account) : 0n;
};
const entriesOf = async (mint: string) =>
  LedgerPage.parse(await (await api("/v1/ledger?kind=reward_liquidity&limit=100")).json()).entries.filter((e) => e.launch?.mint === mint).sort((a, b) => a.index - b.index);

/** A signature nobody made: 64 random bytes in base58, which the chain has never seen. */
function base58(bytes: Uint8Array) {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let n = bytes.reduce((v, b) => (v << 8n) | BigInt(b), 0n);
  let out = "";
  while (n > 0n) {
    out = alphabet[Number(n % 58n)]! + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = `1${out}`;
  }
  return out;
}

/** Every locked position of a pool, read from Raydium's lock program: its records name the pool after 64 bytes. */
async function positionsOf(pool: PublicKey) {
  const accounts = await connection().getProgramAccounts(programs.lock, { commitment: "confirmed", filters: [{ memcmp: { offset: 64, bytes: pool.toBase58() } }] });
  return accounts.map(({ pubkey, account }) => {
    const s = lockCoder.accounts.decode("LockedCpLiquidityState", account.data) as { locked_lp_amount: BN; fee_nft_mint: PublicKey };
    expect(pubkey.equals(lockPdas(programs.lock).lockedLiquidity(s.fee_nft_mint))).toBe(true);
    return { address: pubkey, feeKey: s.fee_nft_mint, lockedLp: big(s.locked_lp_amount) };
  });
}

/** Buys the rest of the curve and plays Raydium's crank; returns the coin's pool, open for swaps, all of it indexed. */
async function graduate(coin: Coin, trader: Keypair) {
  const bought = await trade(trader, coin.mint, "buy", 2_000_000_000n);
  expect(bought.quote.completesCurve).toBe(true);
  const migration = await migrateCurve(connection(), coin.curve);
  await deliverWebhook([bought.signature, migration.signature]);
  for (let i = 0; i < 40 && !(await quote(coin.mint, { side: "buy", amount: "1000000" })).ok; i++) await new Promise((r) => setTimeout(r, 250));
  return migration.pool;
}

describe("Reward Liquidity", () => {
  let both: Coin;
  let trader: Keypair;

  afterAll(async () => {
    // Leaves nothing of ours worth an addition behind: every later file's Reward Engine run would add it, and move the
    // operations wallet's SOL for the position's rent while another file counts it.
    if (!both) return;
    for (let i = 0; i < 5; i++) if (!(await runRounds()).liquidityAdded.some((a) => a.mint === both.mint)) break;
  });

  it("is a Reward Launch's choice among the offered shares, with the Reward Burn at most half, fixed with the draft", async () => {
    const creator = (await fundedWallet(1)).publicKey.toBase58();
    // Nothing to keep without a tax, not even nothing.
    for (const rewardLiquidity of ["2500", "0"]) {
      const standard = await prepare({ creator, rewardLiquidity });
      expect(standard.status).toBe(400);
      expect(await refusal(standard)).toMatch(/Reward Liquidity is only for a Reward Launch/);
    }
    expect((await prepare({ creator, rewardTax: "300", rewardLiquidity: "3000" })).status).toBe(400);
    // Holders keep at least half: a burn and a liquidity share over 50% together are refused, in words.
    for (const [rewardBurn, rewardLiquidity] of [["5000", "1000"], ["2500", "5000"], ["1000", "5000"]]) {
      const over = await prepare({ creator, rewardTax: "300", rewardBurn, rewardLiquidity });
      expect(over.status).toBe(400);
      expect(await refusal(over)).toMatch(/Holders keep at least half of every reward/);
    }
    // Left out, a Reward Launch keeps nothing, as every one did before.
    const plain = await prepare({ creator, rewardTax: "300" });
    expect(PreparedLaunch.parse(await plain.json()).rewardTax).toEqual({ bps: 300, payout: "coin", burnBps: 0, liquidityBps: 0 });
    const res = await prepare({ creator, rewardTax: "300", rewardPayout: "quote", rewardBurn: "2500", rewardLiquidity: "2500" });
    expect(res.status, await res.clone().text()).toBe(200);
    const prepared = PreparedLaunch.parse(await res.json());
    expect(prepared.rewardTax).toEqual({ bps: 300, payout: "quote", burnBps: 2500, liquidityBps: 2500 });
    // A retry rebuilds the same launch from the draft, the share with it.
    const retry = await api(`/v1/launches/${prepared.mint}/prepare`, { method: "POST" });
    expect(retry.status, await retry.clone().text()).toBe(200);
    expect(PreparedLaunch.parse(await retry.json()).rewardTax).toEqual({ bps: 300, payout: "quote", burnBps: 2500, liquidityBps: 2500 });

    // The launch quote refuses what prepare refuses, so a form can say it before anything is prepared.
    const ask = (q: Record<string, string>) => api(`/v1/launch-quote?${new URLSearchParams({ quoteMint: WSOL, firstBuy: "10000000", ...q })}`);
    const without = await ask({ rewardLiquidity: "1000" });
    expect(without.status).toBe(400);
    expect(await refusal(without)).toMatch(/Reward Liquidity is only for a Reward Launch/);
    const tooMuch = await ask({ rewardTax: "300", rewardBurn: "5000", rewardLiquidity: "2500" });
    expect(tooMuch.status).toBe(400);
    expect(await refusal(tooMuch)).toMatch(/Holders keep at least half/);
    expect((await ask({ rewardTax: "300", rewardBurn: "2500", rewardLiquidity: "2500" })).status).toBe(200);
  });

  it("keeps its share apart in the withdrawal, tax-free, before Graduation, and pays holders only what is left", async () => {
    await runRounds();
    both = await rewardCoin({ rewardTax: "500", rewardPayout: "coin", rewardBurn: "2500", rewardLiquidity: "2500", symbol: "RLQB" });
    const launch = LaunchSummary.parse(await (await api(`/v1/launches/${both.mint}`)).json());
    expect(launch.rewardTax).toMatchObject({ bps: 500, payout: "coin", burnBps: 2500, liquidityBps: 2500 });
    expect((await rewards(both.mint)).liquidity).toEqual({ bps: 2500, waiting: "0", waitingQuote: "0", coinsAdded: "0", quoteAdded: "0", recent: [] });
    trader = await fundedWallet(20);
    const holder = await fundedWallet(5);
    await trade(trader, both.mint, "buy", 100_000_000n);
    await trade(holder, both.mint, "buy", 40_000_000n);

    const run = await runRounds();
    const collected = BigInt(run.collected.find((c) => c.mint === both.mint)!.amount);
    const share = (collected * 2_500n) / 10_000n;
    expect(share).toBeGreaterThan(0n);
    // One transaction burned one share and kept the other.
    expect(run.burned.filter((b) => b.mint === both.mint)).toEqual([expect.objectContaining({ burned: share.toString(), kept: share.toString(), outcome: "landed" })]);
    // The kept share sits whole in the Reward Liquidity's own account: the tax its move withheld was withdrawn back.
    expect(await keptCoins(both.mint)).toBe(share);
    const account = await getAccount(connection(), (await liquidityCoinAccount(ops(), new PublicKey(both.mint), TOKEN_2022_PROGRAM_ID, "reward")).address, "confirmed", TOKEN_2022_PROGRAM_ID);
    expect(account.owner.equals(ops())).toBe(true);
    expect(getTransferFeeAmount(account)?.withheldAmount).toBe(0n);
    // The curve has no pool to add to, so the share waits.
    expect(run.liquidityAdded.filter((a) => a.mint === both.mint)).toEqual([]);
    expect(run.liquidityWaiting.filter((w) => w.mint === both.mint)).toEqual([{ mint: both.mint, reason: expect.stringMatching(/^waits for Graduation/) }]);
    // The round pays out what is left after the burn and the liquidity share, and nothing of either.
    const opened = run.opened.find((o) => o.mint === both.mint);
    expect(opened).toBeDefined();
    expect(BigInt(RewardRoundDetail.parse(await (await api(`/v1/rewards/rounds/${opened!.round}`)).json()).pot)).toBe(collected - share - share);
    expect((await rewards(both.mint)).liquidity).toMatchObject({ bps: 2500, waiting: share.toString(), coinsAdded: "0", recent: [] });
    expect(await entriesOf(both.mint)).toEqual([]);
  });

  it("sells only what is left of a Quote Asset payout's tax, and burns nothing without a burn", async () => {
    await runRounds();
    const { mint } = await rewardCoin({ rewardTax: "100", rewardPayout: "quote", rewardLiquidity: "5000", symbol: "RLQQ" });
    await trade(await fundedWallet(10), mint, "buy", 100_000_000n);

    const run = await runRounds();
    const collected = BigInt(run.collected.find((c) => c.mint === mint)!.amount);
    const share = collected / 2n;
    expect(run.burned.filter((b) => b.mint === mint)).toEqual([expect.objectContaining({ burned: "0", kept: share.toString(), outcome: "landed" })]);
    expect(await keptCoins(mint)).toBe(share);
    // A withdrawal that burned nothing writes no Reward Burn on the Ledger.
    const burns = LedgerPage.parse(await (await api("/v1/ledger?kind=reward_burn&limit=100")).json()).entries.filter((e) => e.launch?.mint === mint);
    expect(burns).toEqual([]);
    const [sale, ...more] = run.sold.filter((s) => s.mint === mint);
    expect(more).toEqual([]);
    expect(sale).toMatchObject({ outcome: "landed", coins: (collected - share).toString() });
    expect(await tokenBalance(getAssociatedTokenAddressSync(new PublicKey(mint), ops(), false, TOKEN_2022_PROGRAM_ID))).toBe(0n);
  });

  it("adds what is kept to the pool once the coin has graduated, in one transaction, exactly as planned from the pool", { timeout: 180_000 }, async () => {
    const poolAddress = await graduate(both, trader);
    const pool = (await loadPool(connection(), poolAddress))!;
    const positionsBefore = await positionsOf(poolAddress);
    // The buyout and the migration withheld tax: this run harvests it, keeps its share, and adds everything kept.
    const waiting = (await rewards(both.mint)).waiting;
    const withheld = BigInt(waiting.inAccounts) + BigInt(waiting.inMint);
    // Read again rather than carried over: the round's payouts withheld tax too, and a later run kept its share of it.
    const onHand = (await keptCoins(both.mint)) + (withheld * 2_500n) / 10_000n;
    const plan = planRewardLiquidityAddition(pool, new PublicKey(both.mint), new BN(onHand.toString()), new BN(0))!;
    expect(plan).not.toBeNull();
    expect(plan.sale).not.toBeNull();
    const { quote: quoteSide } = poolSides(pool, new PublicKey(both.mint));
    const budgetsBefore = BudgetsPage.parse(await (await api("/v1/budgets")).json());

    let run = await runRounds();
    expect(run.collected.find((c) => c.mint === both.mint)?.amount).toBe(withheld.toString());
    // A Platform Lookup Table extended moments ago makes an addition wait for a later run, by design (`lookupTableWaits`):
    // the stack's bootstrap extends it, so a file that gets here within 64 slots of the stack's start runs the engine again.
    for (let i = 0; i < 20 && run.liquidityWaiting.some((w) => w.mint === both.mint && /Platform Lookup Table/.test(w.reason)); i++) {
      await new Promise((r) => setTimeout(r, 3_000));
      run = await runRounds();
    }
    const [added, ...more] = run.liquidityAdded.filter((a) => a.mint === both.mint);
    expect(more).toEqual([]);
    // Planned from the coins this test worked out and the pool as it read it.
    const sides = poolSides(pool, new PublicKey(both.mint));
    expect(added!.plannedFrom).toEqual({ coins: onHand.toString(), quote: "0", coinReserve: sides.base.reserve.toString(), quoteReserve: sides.quote.reserve.toString() });
    expect(added).toMatchObject({
      outcome: "landed", coinsSold: plan.sale!.coins.toString(), coinsAdded: plan.coins.added.toString(), quoteAdded: plan.quote.added.toString(),
    });
    // The pool grew by exactly the LP tokens the plan minted, and the lock holds them in a position of its own.
    const after = (await loadPool(connection(), poolAddress))!;
    expect(big(after.lpSupply) - big(pool.lpSupply)).toBe(big(plan.lpAmount));
    const position = (await positionsOf(poolAddress)).find((p) => !positionsBefore.some((b) => b.feeKey.equals(p.feeKey)));
    expect(position).toBeDefined();
    expect(position!.address.toBase58()).toBe(added!.position);
    expect(position!.lockedLp).toBe(big(plan.lpAmount));
    // The Fee Key is the operations wallet's.
    expect(await tokenBalance(getAssociatedTokenAddressSync(position!.feeKey, ops(), true))).toBe(1n);
    // What the deposit left stays in the Reward Liquidity's two accounts, for the next addition.
    expect(await keptCoins(both.mint)).toBe(onHand - big(plan.sale!.coins) - big(plan.coins.transfer));
    expect(await keptQuote(both.mint)).toBe(big(plan.sale!.amountOut) - big(plan.quote.transfer));
    // On the Ledger: the sale into the pool, then the coins and the SOL into the locked position.
    const entries = await entriesOf(both.mint);
    expect(entries.map((e) => [e.index, e.asset.mint, e.amount, e.destination])).toEqual([
      [0, both.mint, plan.sale!.coins.toString(), poolAddress.toBase58()],
      [1, both.mint, plan.coins.added.toString(), added!.position],
      [2, quoteSide.mint.toBase58(), plan.quote.added.toString(), added!.position],
    ]);
    expect(entries.every((e) => e.signature === added!.signature && e.source === ops().toBase58())).toBe(true);
    // Never revenue, and never a spending of any row of the Budget Table.
    const revenue = Revenue.parse(await (await api("/v1/revenue")).json());
    expect(revenue.totals.map((t) => t.asset.mint)).not.toContain(both.mint);
    const budgetsAfter = BudgetsPage.parse(await (await api("/v1/budgets")).json());
    expect(budgetsAfter.rows.map((r) => [r.row, r.spentLamports])).toEqual(budgetsBefore.rows.map((r) => [r.row, r.spentLamports]));
    expect((await rewards(both.mint)).liquidity).toMatchObject({
      bps: 2500, coinsAdded: plan.coins.added.toString(), quoteAdded: plan.quote.added.toString(),
      recent: [{ signature: added!.signature, coins: plan.coins.added.toString(), quote: plan.quote.added.toString(), position: added!.position, time: expect.any(String) }],
    });
    // The Fee Collector collects the position's fees from its next run.
    const db = postgres(env().databaseUrl, { max: 1, onnotice: () => {} });
    try {
      const keys = await db<{ nft_mint: string }[]>`select nft_mint from fee_keys where pool = ${poolAddress.toBase58()}`;
      expect(keys.map((k) => k.nft_mint)).toContain(position!.feeKey.toBase58());
    } finally {
      await db.end();
    }
  });

  it("adds nothing while an earlier addition may still land, and goes on once it has expired", async () => {
    const db = postgres(env().databaseUrl, { max: 1, onnotice: () => {} });
    // An addition written down and never seen landing, as a run that died after sending it leaves one.
    const signature = base58(crypto.getRandomValues(new Uint8Array(64)));
    try {
      await db`insert into job_transactions (signature, job, purpose, subject, last_valid_block_height) values (${signature}, 'reward-rounds', 'reward_liquidity', ${both.mint}, ${Number.MAX_SAFE_INTEGER})`;
      const before = await entriesOf(both.mint);
      const waiting = await runRounds();
      expect(waiting.liquidityAdded.filter((a) => a.mint === both.mint)).toEqual([]);
      expect(waiting.liquidityWaiting.filter((w) => w.mint === both.mint)).toEqual([{ mint: both.mint, reason: "an earlier addition may still land" }]);
      expect(await entriesOf(both.mint)).toEqual(before);
      // Its blockhash has run out: the next run marks it expired and the coin's turn goes on.
      await db`update job_transactions set last_valid_block_height = 0 where signature = ${signature}`;
      const next = await runRounds();
      expect(next.settled.liquidity.expired).toBeGreaterThanOrEqual(1);
      expect(next.liquidityWaiting.filter((w) => w.mint === both.mint && w.reason === "an earlier addition may still land")).toEqual([]);
      const [row] = await db<{ status: string }[]>`select status from job_transactions where signature = ${signature}`;
      expect(row!.status).toBe("expired");
    } finally {
      await db`delete from job_transactions where signature = ${signature}`.catch(() => {});
      await db.end();
    }
  });
});
