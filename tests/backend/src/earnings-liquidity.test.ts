// The `liquidity` Creator Earnings Destination (ADR 0011, #184): a coin's Creator fixes at launch that their share of
// the platform's revenue on it becomes locked liquidity. Before Graduation the share waits in the coin's pot. After it,
// the Creator Forward job buys the coin in its pool, deposits what it bought with the matching Quote Asset and locks
// the LP tokens, all in one transaction, and the operations wallet keeps the new position's Fee Key, whose fees the
// Fee Collector then collects beside those of the position Raydium's migration locked. Every figure is checked against
// the chain: what an addition does to a pool is worked out here from the pool as it stood, to the unit.
import { describe, expect, it } from "vitest";
import { PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction, type Keypair } from "@solana/web3.js";
import { ACCOUNT_SIZE, createBurnCheckedInstruction, getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import BN from "bn.js";
import {
  liquidityCoinAccount, loadPool, lockCoder, lockPdas, planLiquidityAddition, poolSides, programsFor, LIQUIDITY_DEPOSIT_SLACK_BPS, WSOL_MINT,
  type LiquidityAddition, type Pool,
} from "@launchpad/chain";
import { CoinEarnings, CoinRewards, CreatorForwardList, JobRun, LedgerPage } from "@launchpad/contract";
import { LOCAL_QUOTES, migrateCurve, mintLocalQuote } from "@launchpad/localnet";
import { SOL, coinsOf, connection, deliverWebhook, env, fundedWallet, launch, quote, tokenBalance, trade, trades, uniqueTag } from "./client";

const programs = programsFor("localnet");
const WSOL = WSOL_MINT.toBase58();
const TAXQ = LOCAL_QUOTES.TAXQ;
const ops = () => new PublicKey(env().platform.operationsWallet);
const api = (path: string, init?: RequestInit) => fetch(`${env().apiUrl}${path}`, init);
const operator = () => ({ authorization: `Bearer ${env().operatorToken}`, "content-type": "application/json" });
const big = (n: BN) => BigInt(n.toString());

type Buyback = { mint: string; kind: string; venue: string; signature: string; outcome: string; spent: string | null; coins: string | null; error?: string };
type Rules = { settled: unknown[]; dividends: unknown[]; buybacks: Buyback[]; belowMinimum: number; skipped: { mint: string; reason: string }[]; problems: string[] };
type Forwarded = { sent: { creator: string; mint: string; amount: string }[]; rules: Rules };
type Collected = {
  sent: { purpose: string; subject: string; signature: string; outcome: string; entries: number }[]; leftToGrow: number; positionsLeftForLater: number; problems: string[];
};

/**
 * Runs one job now, as the operator would. Other files' coins share the stack, and one of theirs can fail a run that
 * did everything right for ours, so the run comes back whatever its status and each test reads its own coin out of it.
 */
async function runJob<T>(job: "fee-collector" | "creator-forward") {
  const res = await api(`/v1/operator/jobs/${job}`, { method: "POST", headers: operator() });
  const run = JobRun.parse(await res.json());
  expect(run.summary, JSON.stringify(run)).not.toBeNull();
  return run.summary as T;
}

/**
 * The Fee Collector until it has looked at every locked position that had something new: a run takes a bounded number.
 * Returns every transaction the runs sent, and what they could not do.
 */
async function collect() {
  const sent: Collected["sent"] = [];
  const problems: string[] = [];
  for (;;) {
    const run = await runJob<Collected>("fee-collector");
    sent.push(...run.sent);
    problems.push(...run.problems);
    if (run.positionsLeftForLater === 0) return { sent, problems };
  }
}

async function earningsOf(mint: string) {
  const res = await api(`/v1/launches/${mint}/earnings`);
  expect(res.status).toBe(200);
  return CoinEarnings.parse(await res.json());
}

const ledgerOf = async (signature: string) =>
  LedgerPage.parse(await (await api("/v1/ledger?kind=creator_liquidity&limit=100")).json()).entries.filter((e) => e.signature === signature).sort((a, b) => a.index - b.index);

type Coin = { mint: string; symbol: string; curve: PublicKey; creator: Keypair; trader: Keypair; quoteMint: PublicKey };

/** A coin whose Creator Earnings go to liquidity, launched through the API and indexed. */
async function liquidityCoin(opts: { quoteMint?: PublicKey; rewardTax?: string } = {}): Promise<Coin> {
  const quoteMint = opts.quoteMint ?? WSOL_MINT;
  const creator = await fundedWallet();
  const symbol = `LQ${uniqueTag()}`;
  const { prepared, signature } = await launch(creator, {
    quoteMint: quoteMint.toBase58(), symbol, exact: true, earningsDestination: "liquidity", ...(opts.rewardTax ? { rewardTax: opts.rewardTax } : {}),
  });
  await deliverWebhook([signature]);
  const trader = await fundedWallet(200);
  if (!quoteMint.equals(WSOL_MINT)) await mintLocalQuote(connection(), quoteMint, trader.publicKey, 5_000_000_000n);
  return { mint: prepared.mint, symbol, curve: new PublicKey(prepared.pool), creator, trader, quoteMint };
}

/** Buys the rest of the curve and plays Raydium's crank; returns the coin's pool, open for swaps, all of it indexed. */
async function graduate(coin: Coin, buyout: bigint) {
  const bought = await trade(coin.trader, coin.mint, "buy", buyout);
  expect(bought.quote.completesCurve).toBe(true);
  const migration = await migrateCurve(connection(), coin.curve);
  await deliverWebhook([bought.signature, migration.signature]);
  for (let i = 0; i < 40 && !(await quote(coin.mint, { side: "buy", amount: "1000000" })).ok; i++) await new Promise((r) => setTimeout(r, 250));
  return migration.pool;
}

/** A buy in a plain coin's pool and a sale of everything it bought, both indexed. */
async function roundTrip(coin: Coin, amount: bigint) {
  const before = await coinsOf(coin.mint, coin.trader);
  const buy = await trade(coin.trader, coin.mint, "buy", amount);
  const sell = await trade(coin.trader, coin.mint, "sell", (await coinsOf(coin.mint, coin.trader)) - before);
  await deliverWebhook([buy.signature, sell.signature]);
}

type Position = { address: PublicKey; feeKey: PublicKey; lockedLp: bigint; claimedLp: bigint };

/** Every locked position of a pool, read from Raydium's lock program: its records name the pool after 64 bytes. */
async function positionsOf(pool: PublicKey): Promise<Position[]> {
  const accounts = await connection().getProgramAccounts(programs.lock, { commitment: "confirmed", filters: [{ memcmp: { offset: 64, bytes: pool.toBase58() } }] });
  return accounts.map(({ pubkey, account }) => {
    const s = lockCoder.accounts.decode("LockedCpLiquidityState", account.data) as { locked_lp_amount: BN; claimed_lp_amount: BN; fee_nft_mint: PublicKey; pool_id: PublicKey };
    expect(s.pool_id.equals(pool)).toBe(true);
    expect(pubkey.equals(lockPdas(programs.lock).lockedLiquidity(s.fee_nft_mint))).toBe(true);
    return { address: pubkey, feeKey: s.fee_nft_mint, lockedLp: big(s.locked_lp_amount), claimedLp: big(s.claimed_lp_amount) };
  });
}

/** The coin's pool as the chain has it, with what the two vaults hold and what the rule's own account of the coin holds. */
async function stateOf(coin: Coin, poolAddress: PublicKey) {
  const pool = (await loadPool(connection(), poolAddress))!;
  const { base, quote: quoteSide } = poolSides(pool, new PublicKey(coin.mint));
  const account = await liquidityCoinAccount(ops(), base.mint, base.program);
  return {
    pool,
    lpSupply: big(pool.lpSupply),
    coinVault: await tokenBalance(base.vault),
    quoteVault: await tokenBalance(quoteSide.vault),
    ruleAccount: account.address,
    onHand: await tokenBalance(account.address),
    // The wallet's associated account of the coin, which the rule must never use.
    walletCoins: await tokenBalance(getAssociatedTokenAddressSync(base.mint, ops(), true, base.program)),
  };
}

/** What the rule plans from a pool for a pot, by the package's own arithmetic: the programs' rounding, the rule's slack. */
function planned(pool: Pool, coin: Coin, pot: string, onHand: bigint): LiquidityAddition {
  const addition = planLiquidityAddition(pool, new PublicKey(coin.mint), new BN(pot), new BN(onHand.toString()));
  expect(addition, "an addition for the pot").not.toBeNull();
  return addition!;
}

/** The size in bytes of a landed transaction, signatures included; a packet carries 1,232. */
async function bytesOf(signature: string) {
  const tx = (await connection().getTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 }))!;
  return 1 + 64 * tx.transaction.signatures.length + tx.transaction.message.serialize().length;
}

/** The Fee Keys of a pool's positions: the one Raydium's migration minted first, then the given ones, which additions opened. */
async function keysOf(pool: PublicKey, additions: PublicKey[]) {
  const migrated = (await positionsOf(pool)).filter((p) => !additions.some((a) => a.equals(p.feeKey)));
  expect(migrated).toHaveLength(1);
  return [migrated[0]!.feeKey, ...additions].map((k) => k.toBase58());
}

/**
 * One run of the rule for the coin, checked against the chain: the Creator Forward job is run, and what its one
 * transaction did to the pool, the rule's account and the lock program must be exactly what the plan from the pool as
 * it stood says. Returns the plan, the buyback as the earnings page shows it and the states either side.
 */
async function addLiquidity(coin: Coin, poolAddress: PublicKey) {
  const pot = await earningsOf(coin.mint);
  const before = await stateOf(coin, poolAddress);
  const positions = await positionsOf(poolAddress);
  const plan = planned(before.pool, coin, pot.waiting!, before.onHand);
  expect(big(plan.budget)).toBeLessThanOrEqual(BigInt(pot.waiting!));

  const { rules } = await runJob<Forwarded>("creator-forward");
  expect(rules.problems.filter((p) => p.includes(coin.mint))).toEqual([]);
  const sent = rules.buybacks.filter((b) => b.mint === coin.mint);
  expect(sent, JSON.stringify(rules)).toHaveLength(1);
  const bought = big(plan.buy!.coins);
  const spent = big(plan.buy!.amountIn) + big(plan.quote.transfer);
  expect(sent[0]).toEqual({ mint: coin.mint, kind: "liquidity", venue: "pool", signature: expect.any(String), outcome: "landed", spent: spent.toString(), coins: bought.toString() });

  // The pool: exactly the planned LP tokens more, and each reserve up by what the deposit added, the coin's less what
  // the buy took out first. Fees a swap sets aside stay in the vault, so the vaults are compared, not the reserves.
  const after = await stateOf(coin, poolAddress);
  expect(after.lpSupply - before.lpSupply).toBe(big(plan.lpAmount));
  const { base, quote: quoteSide } = poolSides(before.pool, new PublicKey(coin.mint));
  const paidOut = bought + big(feeOn(plan.buy!.coins, base.transferFee));
  expect(after.coinVault - before.coinVault).toBe(big(plan.coins.added) - paidOut);
  const arrived = (amount: BN) => big(amount) - big(feeWithheld(amount, quoteSide.transferFee));
  expect(after.quoteVault - before.quoteVault).toBe(arrived(plan.buy!.amountIn) + big(plan.quote.added));
  // The rule's own account: what was on hand, plus the coins bought, less what the deposit took. The wallet's own
  // account of the coin is not touched.
  expect(after.onHand - before.onHand).toBe(bought - big(plan.coins.transfer));
  expect(after.walletCoins).toBe(before.walletCoins);

  // The earnings page: the buyback with what it spent and added, and the pot down by exactly what was spent.
  const page = await earningsOf(coin.mint);
  const buyback = page.buybacks.find((b) => b.signature === sent[0]!.signature)!;
  expect(buyback).toMatchObject({
    kind: "liquidity", venue: "pool", status: "landed", spent: spent.toString(), coins: bought.toString(), burned: null,
    liquidity: { coins: plan.coins.added.toString(), quote: plan.quote.added.toString(), lpAmount: plan.lpAmount.toString(), feeKey: expect.any(String), lockedLiquidity: expect.any(String) },
  });
  expect(BigInt(page.applied!) - BigInt(pot.applied!)).toBe(spent);
  expect(BigInt(page.waiting!)).toBe(BigInt(pot.waiting!) - spent);
  expect(page.waitsForGraduation).toBe(false);

  // The lock: one position more for the pool, holding exactly those LP tokens under the recorded Fee Key, whose NFT is
  // in the operations wallet. The wallet keeps none of the LP tokens.
  const feeKey = new PublicKey(buyback.liquidity!.feeKey);
  const now = await positionsOf(poolAddress);
  expect(now).toHaveLength(positions.length + 1);
  const opened = now.find((p) => p.feeKey.equals(feeKey))!;
  expect(opened).toMatchObject({ lockedLp: big(plan.lpAmount), claimedLp: 0n });
  expect(opened.address.toBase58()).toBe(buyback.liquidity!.lockedLiquidity);
  expect((await connection().getAccountInfo(opened.address, "confirmed"))!.owner.equals(programs.lock)).toBe(true);
  expect(await tokenBalance(getAssociatedTokenAddressSync(feeKey, ops(), true))).toBe(1n);
  expect(await tokenBalance(getAssociatedTokenAddressSync(before.pool.lpMint, ops(), true))).toBe(0n);

  // The Ledger: the Quote Asset that left the wallet, then the coins that went into the pool.
  const launchOf = { mint: coin.mint, symbol: coin.symbol, name: expect.any(String) };
  expect(await ledgerOf(buyback.signature)).toMatchObject([
    { index: 0, kind: "creator_liquidity", asset: { mint: coin.quoteMint.toBase58() }, amount: spent.toString(), source: ops().toBase58(), destination: poolAddress.toBase58(), launch: launchOf },
    { index: 1, kind: "creator_liquidity", asset: { mint: coin.mint }, amount: plan.coins.added.toString(), source: ops().toBase58(), destination: poolAddress.toBase58(), launch: launchOf },
  ]);
  // The buy is a trade of the coin like any other.
  expect((await trades(coin.mint)).find((t) => t.signature === buyback.signature)).toMatchObject({
    venue: "pool", side: "buy", trader: ops().toBase58(), baseAmount: bought.toString(), quoteAmount: plan.buy!.amountIn.toString(),
  });
  return { plan, buyback, before, after, feeKey, spent, pot };
}

type Fee = { bps: number; maximumFee: BN } | null;
const TEN_THOUSAND = new BN(10_000);
/** What a Token-2022 mint withholds from a transfer of `amount`: its rate, rounded up. */
const feeWithheld = (amount: BN, fee: Fee) => (fee ? BN.min(amount.muln(fee.bps).add(TEN_THOUSAND).subn(1).div(TEN_THOUSAND), fee.maximumFee) : new BN(0));
/** What is withheld on top when exactly `net` must arrive: the fee of the smallest transfer that delivers it. */
const feeOn = (net: BN, fee: Fee) => {
  if (!fee) return new BN(0);
  let gross = net.mul(TEN_THOUSAND).add(TEN_THOUSAND.subn(fee.bps)).subn(1).div(TEN_THOUSAND.subn(fee.bps));
  while (gross.sub(feeWithheld(gross, fee)).lt(net)) gross = gross.addn(1);
  return gross.sub(net);
};

describe("a coin whose Creator Earnings go to liquidity", () => {
  let coin: Coin;
  let pool: PublicKey;
  let first: Awaited<ReturnType<typeof addLiquidity>>;
  let second: Awaited<ReturnType<typeof addLiquidity>>;

  it("keeps the share waiting in its pot before Graduation, and forwards none of it to the Creator", async () => {
    coin = await liquidityCoin();
    const buy = await trade(coin.trader, coin.mint, "buy", SOL(0.4));
    await deliverWebhook([buy.signature]);
    const share = BigInt(buy.quote.fees.platform) / 2n;
    expect(share).toBeGreaterThan(BigInt(env().creatorForwardMinLamports));
    const creatorSol = await connection().getBalance(coin.creator.publicKey, "confirmed");

    await collect();
    const { sent, rules } = await runJob<Forwarded>("creator-forward");
    expect(rules.skipped.filter((s) => s.mint === coin.mint)).toEqual([{ mint: coin.mint, reason: expect.stringMatching(/^waits for Graduation/) }]);
    expect(rules.buybacks.filter((b) => b.mint === coin.mint)).toEqual([]);
    expect(rules.problems.filter((p) => p.includes(coin.mint))).toEqual([]);

    expect(await earningsOf(coin.mint)).toMatchObject({
      destination: "liquidity", collected: share.toString(), withheld: "0", applied: "0", waiting: share.toString(), waitsForGraduation: true, buybacks: [],
      totals: { spent: "0", buybacks: 0, coinsAdded: "0", quoteAdded: "0" },
    });
    // Nothing went to the Creator's wallet, which launched this coin alone.
    expect(sent.filter((f) => f.creator === coin.creator.publicKey.toBase58())).toEqual([]);
    expect(CreatorForwardList.parse(await (await api(`/v1/creators/${coin.creator.publicKey.toBase58()}/forwards`)).json()).forwards).toEqual([]);
    expect(await connection().getBalance(coin.creator.publicKey, "confirmed")).toBe(creatorSol);
    // And nothing was bought on the curve with it.
    expect((await trades(coin.mint)).filter((t) => t.trader === ops().toBase58())).toEqual([]);
  });

  it("adds the pot to the pool as locked liquidity once the coin has graduated, in one transaction, exactly as planned from the pool", async () => {
    pool = await graduate(coin, SOL(2));
    // The migration locked the pool's first position, with a Fee Key of its own.
    expect(await positionsOf(pool)).toHaveLength(1);
    // The collector claims the buyout's Platform Fee and withholds the coin's Graduation Fee out of the pot (ADR 0015).
    await collect();
    const pot = await earningsOf(coin.mint);
    expect(pot).toMatchObject({ waitsForGraduation: false, withheld: env().graduationFeeLamports, applied: "0" });
    expect(BigInt(pot.waiting!)).toBe(BigInt(pot.collected) - BigInt(env().graduationFeeLamports));

    first = await addLiquidity(coin, pool);
    // About half bought the coin and the other half was paired with it; the slack left a few coins in the rule's account.
    const { plan } = first;
    expect(big(plan.buy!.amountIn) * 100n / first.spent).toBeGreaterThanOrEqual(49n);
    expect(big(plan.buy!.amountIn) * 100n / first.spent).toBeLessThanOrEqual(52n);
    expect(first.before.onHand).toBe(0n);
    expect(first.after.onHand).toBeGreaterThan(0n);
    expect(first.after.onHand * 10_000n / big(plan.buy!.coins)).toBeLessThanOrEqual(BigInt(LIQUIDITY_DEPOSIT_SLACK_BPS) + 1n);
    // The rule's account is the wallet's, at an address of its own; the wallet's associated account of the coin holds nothing.
    const account = (await connection().getParsedAccountInfo(first.after.ruleAccount, "confirmed")).value!;
    expect((account.data as { parsed: { info: { owner: string; mint: string } } }).parsed.info).toMatchObject({ owner: ops().toBase58(), mint: coin.mint });
    expect(first.after.ruleAccount.equals(getAssociatedTokenAddressSync(new PublicKey(coin.mint), ops(), true))).toBe(false);
    expect(first.after.walletCoins).toBe(0n);
    // SOL was wrapped for the transaction alone.
    expect(await connection().getAccountInfo(getAssociatedTokenAddressSync(WSOL_MINT, ops(), true), "confirmed")).toBeNull();
    // The transaction opens the rule's account and the wallet's LP account, and still fits a packet with room to spare.
    expect(await bytesOf(first.buyback.signature)).toBe(1195);
  });

  it("leaves a pot worth less than a position's minimum to wait", async () => {
    const pot = await earningsOf(coin.mint);
    expect(BigInt(pot.waiting!)).toBeGreaterThan(0n);
    expect(BigInt(pot.waiting!)).toBeLessThan(BigInt(pot.minLamports!));
    const { rules } = await runJob<Forwarded>("creator-forward");
    expect(rules.buybacks.filter((b) => b.mint === coin.mint)).toEqual([]);
    expect(rules.skipped.filter((s) => s.mint === coin.mint)).toEqual([]);
    expect(rules.belowMinimum).toBeGreaterThanOrEqual(1);
    expect(await earningsOf(coin.mint)).toMatchObject({ waiting: pot.waiting, applied: pot.applied, totals: { buybacks: 1 } });
    expect(await positionsOf(pool)).toHaveLength(2);
  });

  it("puts the coins the first addition left into the next one", { timeout: 180_000 }, async () => {
    const [migrated, small] = await keysOf(pool, [first.feeKey]);
    const mine = (p: string) => [migrated!, small!, pool.toBase58(), coin.mint].some((address) => p.includes(address));
    // Only the addition's own buy has traded in the pool so far: what it earned the migration's position is far too
    // little to collect, and the new position, opened after it, has earned nothing. Both are looked at, neither collected.
    const idle = await collect();
    expect(idle.problems.filter(mine)).toEqual([]);
    expect(idle.sent.filter((s) => s.purpose === "fee_key" && mine(s.subject))).toEqual([]);

    // Trading in the pool pays its creator fee, and the Creator's share of that is the pot's once it is collected.
    for (let i = 0; i < 2; i++) await roundTrip(coin, SOL(6));
    const collected = await collect();
    expect(collected.problems.filter(mine)).toEqual([]);
    // The migration's position earned enough to collect. The first addition's is a few thousandths of the pool, and
    // what it earned is left to grow: nothing is sent for it, and it holds nothing else up.
    expect(collected.sent.filter((s) => s.purpose === "fee_key" && mine(s.subject))).toMatchObject([{ subject: migrated, outcome: "landed", entries: 2 }]);
    expect((await positionsOf(pool)).find((p) => p.feeKey.equals(first.feeKey))!.claimedLp).toBe(0n);

    const pot = await earningsOf(coin.mint);
    expect(BigInt(pot.waiting!)).toBeGreaterThan(BigInt(pot.minLamports!));
    second = await addLiquidity(coin, pool);
    expect(second.before.onHand).toBe(first.after.onHand);
    expect(second.before.onHand).toBeGreaterThan(0n);
    // The same pot with no coins on hand would have backed fewer LP tokens.
    const without = planned(second.before.pool, coin, pot.waiting!, 0n);
    expect(big(second.plan.lpAmount)).toBeGreaterThan(big(without.lpAmount));
    // The deposit took more coins than this addition's own buy could give it under the slack.
    expect(big(second.plan.coins.transfer) * 10_000n).toBeGreaterThan(big(second.plan.buy!.coins) * BigInt(10_000 - LIQUIDITY_DEPOSIT_SLACK_BPS));
    expect(await positionsOf(pool)).toHaveLength(3);
    expect((await earningsOf(coin.mint)).totals).toMatchObject({
      buybacks: 2, spent: (first.spent + second.spent).toString(),
      coinsAdded: (big(first.plan.coins.added) + big(second.plan.coins.added)).toString(),
      quoteAdded: (big(first.plan.quote.added) + big(second.plan.quote.added)).toString(),
    });
    // With the rule's account and the wallet's LP account open, the transaction is smaller.
    expect(await bytesOf(second.buyback.signature)).toBe(1065);
  });

  it("has the Fee Collector collect the fees of the pool's positions, each under its own Fee Key", { timeout: 180_000 }, async () => {
    const [migrated, small, large] = await keysOf(pool, [first.feeKey, second.feeKey]);
    const mine = (p: string) => [migrated!, small!, large!, pool.toBase58(), coin.mint].some((address) => p.includes(address));
    for (let i = 0; i < 3; i++) await roundTrip(coin, SOL(6));
    const collected = await collect();
    expect(collected.problems.filter(mine)).toEqual([]);
    // The migration's position and the second addition's, which was opened after the pool's last collection, have each
    // earned enough, and each is collected by its own transaction. The first addition's is still left to grow.
    const sent = collected.sent.filter((s) => s.purpose === "fee_key" && mine(s.subject));
    expect(sent.map((s) => s.subject).sort()).toEqual([migrated!, large!].sort());
    for (const s of sent) expect(s).toMatchObject({ outcome: "landed", entries: 2 });
    // Fee Key revenue is the platform's, in both of the pool's tokens, and the Ledger names the pool as its source.
    const entries = LedgerPage.parse(await (await api("/v1/ledger?kind=fee_key&limit=100")).json()).entries.filter((e) => sent.some((s) => s.signature === e.signature));
    expect(entries).toHaveLength(4);
    for (const e of entries) expect(e).toMatchObject({ source: pool.toBase58(), destination: ops().toBase58(), launch: { mint: coin.mint } });
    expect(entries.map((e) => e.asset.mint).sort()).toEqual([coin.mint, coin.mint, WSOL, WSOL].sort());
    // The lock program counts what each collected position has been paid against its locked LP.
    const positions = await positionsOf(pool);
    expect(positions.find((p) => p.feeKey.toBase58() === large)!.claimedLp).toBeGreaterThan(0n);
    expect(positions.find((p) => p.feeKey.toBase58() === small)!.claimedLp).toBe(0n);
    // The sweep took the coins the Fee Keys paid out on to the treasury; the rule's own coins stayed where they were.
    const now = await stateOf(coin, pool);
    expect(now.onHand).toBe(second.after.onHand);
    expect(now.walletCoins).toBe(0n);

    // Nothing has traded since, so the next run has nothing new to look at for this pool, the small position included.
    const again = await collect();
    expect(again.sent.filter((s) => s.purpose === "fee_key" && mine(s.subject))).toEqual([]);
    expect(again.problems.filter(mine)).toEqual([]);
  });

  it("goes on adding whenever the pot is worth a position again, and stops once it is not", { timeout: 180_000 }, async () => {
    // Those trades paid the pool's creator fee, and the Creator's share of it is in the pot. Each addition's own buy
    // pays the fee too, a little less each time, so the rule runs until what is left is under a position's minimum.
    // That also leaves nothing of this coin for a job run from another file to act on.
    let additions = 0;
    for (;;) {
      const pot = await earningsOf(coin.mint);
      if (BigInt(pot.waiting!) < BigInt(pot.minLamports!)) break;
      const next = await addLiquidity(coin, pool);
      expect(next.before.onHand).toBeGreaterThan(0n);
      additions++;
      await collect();
    }
    expect(additions).toBeGreaterThanOrEqual(1);
    expect(await positionsOf(pool)).toHaveLength(3 + additions);
    expect((await earningsOf(coin.mint)).totals.buybacks).toBe(2 + additions);
    const { rules } = await runJob<Forwarded>("creator-forward");
    expect(rules.buybacks.filter((b) => b.mint === coin.mint)).toEqual([]);
    expect(rules.problems.filter((p) => p.includes(coin.mint))).toEqual([]);
  });
});

describe("transfer fees", () => {
  it("adds a Reward Launch's coin, whose Reward Tax is withheld on the way out of the pool and paid on top on the way in", { timeout: 180_000 }, async () => {
    const coin = await liquidityCoin({ rewardTax: "300" });
    const pool = await graduate(coin, SOL(2));
    // The buyer is the coin's one holder, and a Reward Launch with a holder is paid a Reward Round on run after run of
    // the Reward Engine, each smaller than the last, until its tax runs out. The files that count a run's payouts
    // allow for a coin that pays the same every run, not for one that stops part way, so the buyer burns what they
    // hold: with no holder this coin is never paid a round, and those runs are left as they were.
    const mint = new PublicKey(coin.mint);
    const bought = getAssociatedTokenAddressSync(mint, coin.trader.publicKey, false, TOKEN_2022_PROGRAM_ID);
    await sendAndConfirmTransaction(
      connection(),
      new Transaction().add(createBurnCheckedInstruction(bought, mint, coin.trader.publicKey, await tokenBalance(bought), 6, [], TOKEN_2022_PROGRAM_ID)),
      [coin.trader],
    );
    expect(await tokenBalance(bought)).toBe(0n);
    await collect();
    const { plan, after, buyback } = await addLiquidity(coin, pool);
    // The deposit's transfer of the coin carried the tax on top of what the reserve gained.
    expect(big(plan.coins.transfer)).toBeGreaterThan(big(plan.coins.added));
    expect(big(plan.coins.transfer) - big(plan.coins.added)).toBe(big(feeOn(plan.coins.added, { bps: 300, maximumFee: new BN("18446744073709551615") })));
    expect(big(plan.quote.transfer)).toBe(big(plan.quote.added));
    // The rule's account is a Token-2022 account of the coin, apart from the wallet's associated one, where a Reward
    // Launch's harvested tax is kept.
    const account = (await connection().getAccountInfo(after.ruleAccount, "confirmed"))!;
    expect(account.owner.equals(TOKEN_2022_PROGRAM_ID)).toBe(true);
    expect(after.ruleAccount.equals(getAssociatedTokenAddressSync(new PublicKey(coin.mint), ops(), true, TOKEN_2022_PROGRAM_ID))).toBe(false);
    // The largest transaction the rule ever makes: a Token-2022 coin's first addition paid in SOL names both token
    // programs in full. It is six bytes under a packet's 1,232.
    expect(await bytesOf(buyback.signature)).toBe(1226);
    // The rewards page counts the tax the wallet has collected for the holders, which is in its associated account,
    // and never the coins the rule keeps beside it.
    expect(after.onHand).toBeGreaterThan(0n);
    const rewards = CoinRewards.parse(await (await api(`/v1/launches/${coin.mint}/rewards`)).json());
    expect(rewards.waiting.collected).toBe(after.walletCoins.toString());
    // The new position's first look happens here, not in another file's run of the collector.
    await collect();
  });

  it("adds to a pool whose Quote Asset has a transfer fee of its own, paid on top of both the buy and the deposit", { timeout: 180_000 }, async () => {
    const coin = await liquidityCoin({ quoteMint: TAXQ });
    const pool = await graduate(coin, 300_000_000n);
    await collect();
    // Anyone can work out where the rule will keep this coin and send that address SOL before the rule opens it. An
    // account cannot be created at an address that holds lamports, so the rule tops it up and allocates it instead.
    const account = await liquidityCoinAccount(ops(), new PublicKey(coin.mint), TOKEN_PROGRAM_ID);
    await sendAndConfirmTransaction(connection(), new Transaction().add(SystemProgram.transfer({ fromPubkey: coin.trader.publicKey, toPubkey: account.address, lamports: 1_000_000 })), [coin.trader]);
    const { plan, spent, pot, buyback, after } = await addLiquidity(coin, pool);
    expect(after.ruleAccount.equals(account.address)).toBe(true);
    expect(await connection().getBalance(account.address, "confirmed")).toBe(await connection().getMinimumBalanceForRentExemption(ACCOUNT_SIZE));
    expect(big(plan.quote.transfer)).toBeGreaterThan(big(plan.quote.added));
    expect(await bytesOf(buyback.signature)).toBe(1156);
    expect(big(plan.coins.transfer)).toBe(big(plan.coins.added));
    // What left the wallet is what the pot was charged, issuer's fee included, and never more than the pot held.
    expect(spent).toBeLessThanOrEqual(BigInt(pot.waiting!));
    expect((await connection().getAccountInfo(getAssociatedTokenAddressSync(TAXQ, ops(), true, TOKEN_2022_PROGRAM_ID), "confirmed"))!.owner.equals(TOKEN_2022_PROGRAM_ID)).toBe(true);
    await collect();
  });
});
