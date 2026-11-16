// The Liquidity Launch (#215, ADR 0006 amended; shown on the site as a Stoke Launch): a third launch type whose whole tax
// is added to the coin's own pool as locked liquidity, with no holder rewards. The coin carries the same Token-2022
// transfer fee as a Reward Launch, but no Payout Asset, no Reward Burn and no Reward Liquidity share, and its Creator
// Earnings may not go to holders. The Reward Engine withdraws every harvest straight into the account the Reward
// Liquidity (#214) keeps a share in, where it waits before Graduation; afterwards #214's addition puts it into the pool.
// No Reward Round is ever opened for the coin, no Reward Sale is made, and no Holding Check reads it.
import { afterAll, describe, expect, it } from "vitest";
import { PublicKey, type Keypair } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, getAccount, getAssociatedTokenAddressSync, getTransferFeeAmount } from "@solana/spl-token";
import BN from "bn.js";
import postgres from "postgres";
import {
  liquidityCoinAccount, loadPool, lockCoder, lockPdas, planRewardLiquidityAddition, programsFor, rewardLiquidityQuoteAccount, poolSides, WSOL_MINT,
} from "@launchpad/chain";
import { BudgetsPage, CoinLiquidityTax, FirstBuyQuote, LaunchSummary, LedgerPage, PreparedLaunch, Revenue } from "@launchpad/contract";
import { LOCAL_QUOTES, migrateCurve } from "@launchpad/localnet";
import { connection, deliverWebhook, env, fundedWallet, prepare, quote, signAndSend, tokenBalance, trade } from "./client";

const programs = programsFor("localnet");
const WSOL = WSOL_MINT.toBase58();
const api = (path: string, init?: RequestInit) => fetch(`${env().apiUrl}${path}`, init);
const operator = () => ({ authorization: `Bearer ${env().operatorToken}` });
const ops = () => new PublicKey(env().platform.operationsWallet);
const big = (n: BN) => BigInt(n.toString());

type Summary = {
  holdingChecks: { checked: { mint: string }[] };
  collected: { mint: string; amount: string }[];
  burned: { mint: string }[];
  liquidityAdded: {
    mint: string; signature: string; outcome: string; coinsSold: string | null; coinsAdded: string | null; quoteAdded: string | null; position: string;
    plannedFrom: { coins: string; quote: string; coinReserve: string; quoteReserve: string };
  }[];
  liquidityWaiting: { mint: string; reason: string }[];
  sold: { mint: string }[];
  unsold: { mint: string }[];
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

const liquidityTax = async (mint: string) => CoinLiquidityTax.parse(await (await api(`/v1/launches/${mint}/liquidity-tax`)).json());
const refusal = async (res: Response) => ((await res.json()) as { error: string }).error;
/** The two accounts a coin's tax is kept in for its pool, for a coin paired with SOL: the Reward Liquidity's own. */
const keptAccount = async (mint: string) => (await liquidityCoinAccount(ops(), new PublicKey(mint), TOKEN_2022_PROGRAM_ID, "reward")).address;
const keptCoins = async (mint: string) => tokenBalance(await keptAccount(mint));
const keptQuote = async (mint: string) => {
  const account = (await rewardLiquidityQuoteAccount(ops(), new PublicKey(mint), TOKEN_PROGRAM_ID)).address;
  return (await connection().getAccountInfo(account, "confirmed")) ? tokenBalance(account) : 0n;
};
const entriesOf = async (mint: string) =>
  LedgerPage.parse(await (await api("/v1/ledger?kind=reward_liquidity&limit=100")).json()).entries.filter((e) => e.launch?.mint === mint).sort((a, b) => a.index - b.index);

/** What the database holds of a coin that would count or pay its holders: rounds, sales and Holding Checks. */
async function holderRecords(mint: string) {
  const db = postgres(env().databaseUrl, { max: 1, onnotice: () => {} });
  try {
    const [row] = await db<{ rounds: number; sales: number; checks: number }[]>`
      select (select count(*)::int from reward_rounds where mint = ${mint}) as rounds,
             (select count(*)::int from reward_sales where mint = ${mint}) as sales,
             (select count(*)::int from holding_checks where mint = ${mint}) as checks`;
    return row!;
  } finally {
    await db.end();
  }
}

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

describe("Liquidity Launch", () => {
  let coin: Coin;
  let trader: Keypair;

  afterAll(async () => {
    // Leaves nothing of ours worth an addition behind: every later file's Reward Engine run would add it, and move the
    // operations wallet's SOL for the position's rent while another file counts it.
    if (!coin) return;
    for (let i = 0; i < 5; i++) if (!(await runRounds()).liquidityAdded.some((a) => a.mint === coin.mint)) break;
  });

  it("is a launch type of its own: a tax with no payout asset, burn, liquidity share or holders' earnings, with any Quote Asset", async () => {
    const creator = (await fundedWallet(1)).publicKey.toBase58();
    // A coin's tax pays its holders or deepens its pool, never both.
    const both = await prepare({ creator, liquidityTax: "300", rewardTax: "300" });
    expect(both.status).toBe(400);
    expect(await refusal(both)).toMatch(/a Reward Launch or a Liquidity Launch, never both/);
    // Nothing of the tax is paid out, burned or split: each of a Reward Launch's choices is refused, "0" included.
    for (const [field, value, words] of [
      ["rewardPayout", "coin", /A Liquidity Launch has no payout asset/],
      ["rewardPayout", "quote", /A Liquidity Launch has no payout asset/],
      ["rewardBurn", "2500", /A Liquidity Launch has no Reward Burn/],
      ["rewardBurn", "0", /A Liquidity Launch has no Reward Burn/],
      ["rewardLiquidity", "5000", /A Liquidity Launch has no Reward Liquidity share/],
      ["rewardLiquidity", "0", /A Liquidity Launch has no Reward Liquidity share/],
      ["earningsDestination", "holders", /pays its holders nothing/],
    ] as const) {
      const res = await prepare({ creator, liquidityTax: "300", [field]: value });
      expect(res.status, `${field}=${value}`).toBe(400);
      expect(await refusal(res)).toMatch(words);
    }
    // The same rates as a Reward Tax, and no others.
    for (const rate of ["50", "600", "0"]) expect((await prepare({ creator, liquidityTax: rate })).status, rate).toBe(400);

    // The Creator's earnings may still go anywhere but to holders; and the coin pairs with any Quote Asset.
    const res = await prepare({ creator, liquidityTax: "300", earningsDestination: "burn", quoteMint: LOCAL_QUOTES.USDC.toBase58() });
    expect(res.status, await res.clone().text()).toBe(200);
    const prepared = PreparedLaunch.parse(await res.json());
    expect(prepared.liquidityTax).toEqual({ bps: 300 });
    expect(prepared.rewardTax).toBeNull();
    expect(prepared.earningsDestination).toBe("burn");
    // A retry rebuilds the same launch from the draft, its kind with it.
    const retry = await api(`/v1/launches/${prepared.mint}/prepare`, { method: "POST" });
    expect(retry.status, await retry.clone().text()).toBe(200);
    const again = PreparedLaunch.parse(await retry.json());
    expect(again.liquidityTax).toEqual({ bps: 300 });
    expect(again.rewardTax).toBeNull();

    // The launch quote refuses what prepare refuses, and a first buy loses the tax as it would a Reward Tax of that rate.
    const ask = (q: Record<string, string>) => api(`/v1/launch-quote?${new URLSearchParams({ quoteMint: WSOL, firstBuy: "10000000", ...q })}`);
    expect(await refusal(await ask({ liquidityTax: "300", rewardTax: "300" }))).toMatch(/never both/);
    expect(await refusal(await ask({ liquidityTax: "300", rewardBurn: "1000" }))).toMatch(/no Reward Burn/);
    expect(await refusal(await ask({ liquidityTax: "300", rewardLiquidity: "1000" }))).toMatch(/no Reward Liquidity share/);
    const taxed = FirstBuyQuote.parse(await (await ask({ liquidityTax: "300" })).json());
    const asReward = FirstBuyQuote.parse(await (await ask({ rewardTax: "300" })).json());
    const untaxed = FirstBuyQuote.parse(await (await ask({})).json());
    expect(taxed).toEqual(asReward);
    expect(BigInt(taxed.firstBuy.amountOut)).toBeLessThan(BigInt(untaxed.firstBuy.amountOut));
  });

  it("keeps its whole harvest for the pool before Graduation, and opens no round, makes no sale and checks no holding", async () => {
    await runRounds();
    const creator = await fundedWallet(10);
    const res = await prepare({ creator: creator.publicKey.toBase58(), liquidityTax: "500", symbol: "LQL" });
    expect(res.status, await res.clone().text()).toBe(200);
    const prepared = PreparedLaunch.parse(await res.json());
    await deliverWebhook([await signAndSend(prepared, creator)]);
    coin = { mint: prepared.mint, curve: new PublicKey(prepared.pool), prepared };

    // The listing names the kind and the tax, and nothing of a Reward Launch.
    const launch = LaunchSummary.parse(await (await api(`/v1/launches/${coin.mint}`)).json());
    expect(launch.liquidityTax).toEqual({ bps: 500, locked: null });
    expect(launch.rewardTax).toBeNull();
    // It is no Reward Launch: it has no rewards to read, and its own read starts empty.
    expect((await api(`/v1/launches/${coin.mint}/rewards`)).status).toBe(404);
    expect(await liquidityTax(coin.mint)).toEqual({
      mint: coin.mint, taxBps: 500, waiting: { inAccounts: "0", inMint: "0", kept: "0", total: "0", quote: "0" }, coinsAdded: "0", quoteAdded: "0", recent: [],
    });
    // A Reward Launch and a standard coin have no such read.
    expect((await api(`/v1/launches/${WSOL}/liquidity-tax`)).status).toBe(404);

    trader = await fundedWallet(20);
    const holder = await fundedWallet(5);
    await trade(trader, coin.mint, "buy", 100_000_000n);
    await trade(holder, coin.mint, "buy", 40_000_000n);
    const before = await liquidityTax(coin.mint);
    const withheld = BigInt(before.waiting.inAccounts) + BigInt(before.waiting.inMint);
    expect(withheld).toBeGreaterThan(0n);
    expect(before.waiting).toMatchObject({ kept: "0", total: withheld.toString() });

    const run = await runRounds();
    // Every coin of the harvest is withdrawn, and all of it sits in the account kept for the pool.
    expect(run.collected.filter((c) => c.mint === coin.mint)).toEqual([{ mint: coin.mint, amount: withheld.toString() }]);
    expect(await keptCoins(coin.mint)).toBe(withheld);
    const account = await getAccount(connection(), await keptAccount(coin.mint), "confirmed", TOKEN_2022_PROGRAM_ID);
    expect(account.owner.equals(ops())).toBe(true);
    // A withdrawal is no transfer: nothing was withheld on the way.
    expect(getTransferFeeAmount(account)?.withheldAmount).toBe(0n);
    // It never passed through the wallet's associated account, where a Reward Launch's holders' pot would sit.
    expect(await connection().getAccountInfo(getAssociatedTokenAddressSync(new PublicKey(coin.mint), ops(), false, TOKEN_2022_PROGRAM_ID), "confirmed")).toBeNull();
    // The curve has no pool to add to, so the tax waits.
    expect(run.liquidityAdded.filter((a) => a.mint === coin.mint)).toEqual([]);
    expect(run.liquidityWaiting.filter((w) => w.mint === coin.mint)).toEqual([{ mint: coin.mint, reason: expect.stringMatching(/^waits for Graduation/) }]);
    // Nothing is burned, sold, opened or checked for the coin.
    for (const list of [run.burned, run.sold, run.unsold, run.opened, run.holdingChecks.checked]) expect(list.filter((x) => x.mint === coin.mint)).toEqual([]);
    expect(await holderRecords(coin.mint)).toEqual({ rounds: 0, sales: 0, checks: 0 });
    expect((await liquidityTax(coin.mint)).waiting).toEqual({ inAccounts: "0", inMint: "0", kept: withheld.toString(), total: withheld.toString(), quote: "0" });
    expect(await entriesOf(coin.mint)).toEqual([]);

    // A second run with nothing new harvested moves nothing and still opens nothing.
    const idle = await runRounds();
    expect(idle.collected.filter((c) => c.mint === coin.mint)).toEqual([]);
    expect(idle.opened.filter((o) => o.mint === coin.mint)).toEqual([]);
    expect(await keptCoins(coin.mint)).toBe(withheld);
  });

  it("adds the kept tax to the pool once the coin has graduated, in one transaction, exactly as planned from the pool", { timeout: 180_000 }, async () => {
    const poolAddress = await graduate(coin, trader);
    const pool = (await loadPool(connection(), poolAddress))!;
    const positionsBefore = await positionsOf(poolAddress);
    // The buyout and the migration withheld tax: this run harvests it all for the pool, and adds everything kept.
    const waiting = (await liquidityTax(coin.mint)).waiting;
    const withheld = BigInt(waiting.inAccounts) + BigInt(waiting.inMint);
    const onHand = (await keptCoins(coin.mint)) + withheld;
    expect(BigInt(waiting.total)).toBe(onHand);
    const plan = planRewardLiquidityAddition(pool, new PublicKey(coin.mint), new BN(onHand.toString()), new BN(0))!;
    expect(plan).not.toBeNull();
    expect(plan.sale).not.toBeNull();
    const sides = poolSides(pool, new PublicKey(coin.mint));
    const budgetsBefore = BudgetsPage.parse(await (await api("/v1/budgets")).json());

    let run = await runRounds();
    expect(run.collected.find((c) => c.mint === coin.mint)?.amount).toBe(withheld.toString());
    // A Platform Lookup Table extended moments ago makes an addition wait for a later run, by design (`lookupTableWaits`):
    // the stack's bootstrap extends it, so a file that gets here within 64 slots of the stack's start runs the engine again.
    for (let i = 0; i < 20 && run.liquidityWaiting.some((w) => w.mint === coin.mint && /Platform Lookup Table/.test(w.reason)); i++) {
      await new Promise((r) => setTimeout(r, 3_000));
      run = await runRounds();
    }
    // Nothing keeps the addition waiting, and nothing went wrong with it: a reason or a problem would be named here.
    expect(run.liquidityWaiting.filter((w) => w.mint === coin.mint)).toEqual([]);
    expect(run.problems.filter((p) => p.includes(coin.mint))).toEqual([]);
    const [added, ...more] = run.liquidityAdded.filter((a) => a.mint === coin.mint);
    expect(more).toEqual([]);
    // Planned from the coins this test worked out and the pool as it read it.
    expect(added!.plannedFrom).toEqual({ coins: onHand.toString(), quote: "0", coinReserve: sides.base.reserve.toString(), quoteReserve: sides.quote.reserve.toString() });
    expect(added).toMatchObject({
      outcome: "landed", coinsSold: plan.sale!.coins.toString(), coinsAdded: plan.coins.added.toString(), quoteAdded: plan.quote.added.toString(),
    });
    // The pool is deeper: it holds more coins against the SOL the sale took out and the deposit put back, so the product
    // of its reserves grew, by exactly the LP tokens the plan minted, and the lock holds them in a position of its own.
    const after = (await loadPool(connection(), poolAddress))!;
    const grown = poolSides(after, new PublicKey(coin.mint));
    expect(big(grown.base.reserve)).toBeGreaterThan(big(sides.base.reserve));
    expect(big(grown.base.reserve) * big(grown.quote.reserve)).toBeGreaterThan(big(sides.base.reserve) * big(sides.quote.reserve));
    expect(big(after.lpSupply) - big(pool.lpSupply)).toBe(big(plan.lpAmount));
    const position = (await positionsOf(poolAddress)).find((p) => !positionsBefore.some((b) => b.feeKey.equals(p.feeKey)));
    expect(position).toBeDefined();
    expect(position!.address.toBase58()).toBe(added!.position);
    expect(position!.lockedLp).toBe(big(plan.lpAmount));
    // The Fee Key is the operations wallet's.
    expect(await tokenBalance(getAssociatedTokenAddressSync(position!.feeKey, ops(), true))).toBe(1n);
    // What the deposit left stays in the two accounts, for the next addition.
    expect(await keptCoins(coin.mint)).toBe(onHand - big(plan.sale!.coins) - big(plan.coins.transfer));
    expect(await keptQuote(coin.mint)).toBe(big(plan.sale!.amountOut) - big(plan.quote.transfer));
    // On the Ledger: the sale into the pool, then the coins and the SOL into the locked position.
    const entries = await entriesOf(coin.mint);
    expect(entries.map((e) => [e.index, e.asset.mint, e.amount, e.destination])).toEqual([
      [0, coin.mint, plan.sale!.coins.toString(), poolAddress.toBase58()],
      [1, coin.mint, plan.coins.added.toString(), added!.position],
      [2, sides.quote.mint.toBase58(), plan.quote.added.toString(), added!.position],
    ]);
    expect(entries.every((e) => e.signature === added!.signature && e.source === ops().toBase58())).toBe(true);
    // Never revenue, and never a spending of any row of the Budget Table.
    const revenue = Revenue.parse(await (await api("/v1/revenue")).json());
    expect(revenue.totals.map((t) => t.asset.mint)).not.toContain(coin.mint);
    const budgetsAfter = BudgetsPage.parse(await (await api("/v1/budgets")).json());
    expect(budgetsAfter.rows.map((r) => [r.row, r.spentLamports])).toEqual(budgetsBefore.rows.map((r) => [r.row, r.spentLamports]));
    expect(await liquidityTax(coin.mint)).toMatchObject({
      coinsAdded: plan.coins.added.toString(), quoteAdded: plan.quote.added.toString(),
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
    // Graduated or not, the coin has no round, no sale and no Holding Check, and still is no Reward Launch.
    for (const list of [run.burned, run.sold, run.unsold, run.opened, run.holdingChecks.checked]) expect(list.filter((x) => x.mint === coin.mint)).toEqual([]);
    expect(await holderRecords(coin.mint)).toEqual({ rounds: 0, sales: 0, checks: 0 });
    expect((await api(`/v1/launches/${coin.mint}/rewards`)).status).toBe(404);
  });

  it("adds nothing while an earlier addition may still land, and goes on once it has expired", async () => {
    const db = postgres(env().databaseUrl, { max: 1, onnotice: () => {} });
    // An addition written down and never seen landing, as a run that died after sending it leaves one.
    const signature = base58(crypto.getRandomValues(new Uint8Array(64)));
    try {
      await db`insert into job_transactions (signature, job, purpose, subject, last_valid_block_height) values (${signature}, 'reward-rounds', 'reward_liquidity', ${coin.mint}, ${Number.MAX_SAFE_INTEGER})`;
      const before = await entriesOf(coin.mint);
      const waiting = await runRounds();
      expect(waiting.liquidityAdded.filter((a) => a.mint === coin.mint)).toEqual([]);
      expect(waiting.liquidityWaiting.filter((w) => w.mint === coin.mint)).toEqual([{ mint: coin.mint, reason: "an earlier addition may still land" }]);
      expect(await entriesOf(coin.mint)).toEqual(before);
      // Its blockhash has run out: the next run marks it expired and the coin's turn goes on.
      await db`update job_transactions set last_valid_block_height = 0 where signature = ${signature}`;
      const next = await runRounds();
      expect(next.settled.liquidity.expired).toBeGreaterThanOrEqual(1);
      expect(next.liquidityWaiting.filter((w) => w.mint === coin.mint && w.reason === "an earlier addition may still land")).toEqual([]);
      const [row] = await db<{ status: string }[]>`select status from job_transactions where signature = ${signature}`;
      expect(row!.status).toBe("expired");
    } finally {
      await db`delete from job_transactions where signature = ${signature}`.catch(() => {});
      await db.end();
    }
  });
});
