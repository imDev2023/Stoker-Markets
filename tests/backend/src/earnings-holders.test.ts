// Creator Earnings paid to a coin's holders (ADR 0011, #113): a Creator who points their earnings at the holders at
// launch never receives a forward for that coin. The Creator Forward job opens a Reward Round of source `earnings` on
// the coin's own pot instead, pro rata in the Quote Asset; the Reward Engine pays it, and every payout transaction is
// one `holder_dividend` entry on the Ledger. A standard coin has such rounds as well as a Reward Launch, whose tax
// rounds keep a pot of their own.
import { afterAll, describe, expect, it } from "vitest";
import { Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction, createTransferCheckedInstruction, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { WSOL_MINT } from "@launchpad/chain";
import {
  CoinEarnings, CoinRewards, CreatorEarnings, CreatorForwardList, JobRun, LedgerPage, RewardRoundDetail, RewardRulesPage, WalletRewards, type LedgerEntry,
} from "@launchpad/contract";
import { LOCAL_QUOTES, mintLocalQuote } from "@launchpad/localnet";
import {
  SOL, coinsOf, connection, deliverWebhook, env, fundedWallet, getLaunch, launch, launchedCoin, rawTransaction, solOf, tokenBalance, trade, trades,
} from "./client";

const WSOL = WSOL_MINT.toBase58();
const USDC = LOCAL_QUOTES.USDC;
const usdc = (n: number) => BigInt(Math.round(n * 1e6));
const ops = () => env().platform.operationsWallet;
const api = (path: string, init?: RequestInit) => fetch(`${env().apiUrl}${path}`, init);
const operator = () => ({ authorization: `Bearer ${env().operatorToken}`, "content-type": "application/json" });
const sum = (xs: bigint[]) => xs.reduce((a, b) => a + b, 0n);
const lamportsOf = async (wallet: PublicKey) => BigInt(await connection().getBalance(wallet, "confirmed"));
const usdcOf = (wallet: PublicKey) => tokenBalance(getAssociatedTokenAddressSync(USDC, wallet));

type Dividend = { mint: string; round: string; holders: number; amount: string };
type ForwardSummary = {
  sent: { creator: string; mint: string; amount: string }[];
  rules: { dividends: Dividend[]; belowMinimum: number; skipped: { mint: string; reason: string }[]; problems: string[] };
};
type RoundsSummary = {
  sold: { mint: string; signature: string; venue: "curve" | "pool"; coins: string; proceeds: string | null; outcome: string }[];
  opened: { mint: string; round: string }[];
  paid: { round: string; payouts: number }[];
  returned: { round: string; payouts: number }[];
  finished: string[];
};

/** Runs one job now, as the operator would; it must succeed. Every job here works on the whole stack, not on one coin. */
async function runJob(job: "fee-collector" | "creator-forward" | "reward-rounds", query = "") {
  const res = await api(`/v1/operator/jobs/${job}${query}`, { method: "POST", headers: operator() });
  const run = JobRun.parse(await res.json());
  expect(res.status, JSON.stringify(run)).toBe(200);
  expect(run.status, JSON.stringify(run)).toBe("succeeded");
  return run;
}

/** The Fee Collector: claims what the trades paid, after which a Creator's share of them is collected and can be used. */
const collect = () => runJob("fee-collector");
/** The Creator Forward: pays wallets, then applies every coin's rule, which for `holders` opens an earnings round. */
const forward = async () => (await runJob("creator-forward")).summary as ForwardSummary;
/** The Reward Engine, which pays the open rounds; `maxPayouts` cuts a run short, as a crash mid-round would. */
const payRounds = async (maxPayouts?: number) => (await runJob("reward-rounds", maxPayouts ? `?maxPayouts=${maxPayouts}` : "")).summary as RoundsSummary;

const coinEarnings = async (mint: string) => CoinEarnings.parse(await (await api(`/v1/launches/${mint}/earnings`)).json());
const creatorEarnings = async (creator: PublicKey) => CreatorEarnings.parse(await (await api(`/v1/creators/${creator.toBase58()}/earnings`)).json());
const creatorForwards = async (creator: PublicKey) => CreatorForwardList.parse(await (await api(`/v1/creators/${creator.toBase58()}/forwards`)).json()).forwards;
const roundDetail = async (id: string) => RewardRoundDetail.parse(await (await api(`/v1/rewards/rounds/${id}`)).json());
const rewards = async (mint: string) => CoinRewards.parse(await (await api(`/v1/launches/${mint}/rewards`)).json());
const walletRewards = async (wallet: PublicKey) => WalletRewards.parse(await (await api(`/v1/wallets/${wallet.toBase58()}/rewards`)).json()).rewards;

/** Every Ledger entry, or those of one kind, newest first, following the cursor to the end. */
async function ledger(kind?: string) {
  const entries: LedgerEntry[] = [];
  let before: string | null = null;
  do {
    const params = new URLSearchParams({ limit: "100", ...(kind ? { kind } : {}), ...(before ? { before } : {}) });
    const page = LedgerPage.parse(await (await api(`/v1/ledger?${params}`)).json());
    entries.push(...page.entries);
    before = page.next;
  } while (before);
  return entries;
}

/** The Ledger's `holder_dividend` entries of one coin: what the Ledger says its holders were paid. */
const dividendsOf = async (mint: string) => (await ledger("holder_dividend")).filter((e) => e.launch?.mint === mint);

/** A coin whose Creator Earnings go to its holders, launched and indexed. */
async function holdersCoin(creator: Keypair, form: Parameters<typeof launch>[1] = {}) {
  const { prepared, signature } = await launch(creator, { symbol: "DIVS", earningsDestination: "holders", ...form });
  await deliverWebhook([signature]);
  return prepared.mint;
}

/** A buy on a coin's curve, indexed; returns the Creator's share of it, half of its Platform Fee (ADR 0009). */
async function buy(trader: Keypair, mint: string, amount: bigint) {
  const t = await trade(trader, mint, "buy", amount);
  await deliverWebhook([t.signature]);
  return BigInt(t.quote.fees.platform) / 2n;
}

/** The Creator's share of every indexed curve trade of a coin, the Reward Engine's own sales among them: each trade's half, rounded down. */
const shareOfTrades = async (mint: string) => sum((await trades(mint)).filter((t) => t.venue === "curve").map((t) => BigInt(t.fees.platform) / 2n));

/**
 * Hands coins of a standard coin (a classic SPL Token mint) to a wallet, the sender paying for its coin account: how a
 * wallet with no SOL comes to hold a coin.
 */
async function giveCoins(from: Keypair, mint: string, to: PublicKey, amount: bigint) {
  const m = new PublicKey(mint);
  const destination = getAssociatedTokenAddressSync(m, to);
  const tx = new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(from.publicKey, destination, to, m),
    createTransferCheckedInstruction(getAssociatedTokenAddressSync(m, from.publicKey), m, destination, from.publicKey, amount, 6),
  );
  await sendAndConfirmTransaction(connection(), tx, [from], { commitment: "confirmed" });
}

/** What a round's payouts must be: each holder's share of the pot pro rata to what it held, rounded down. */
function proRata(pot: bigint, holdings: Map<string, bigint>) {
  const total = sum([...holdings.values()]);
  return new Map([...holdings].map(([wallet, holding]) => [wallet, (pot * holding) / total]));
}

/** A paid round's payouts by the transaction that carried them: what each `holder_dividend` entry must say. */
function byTransaction(detail: RewardRoundDetail) {
  const paid = new Map<string, bigint>();
  for (const p of detail.payouts) if (p.status === "paid") paid.set(p.signature!, (paid.get(p.signature!) ?? 0n) + BigInt(p.amount));
  return paid;
}

afterAll(async () => {
  // Every Reward Engine run above also sold a slice of tax for each Quote Asset payout coin on the stack, other files'
  // coins among them, and each sale on a curve left a Platform Fee in its Quote Asset's vault that is too small to be
  // claimed on its own. `fee-collector.test.ts` allows for that in USDC's vault but starts from an empty SOL one, so
  // this file leaves it empty: one buy whose fee is worth claiming, and a collection, which takes whatever is there.
  const { mint } = await launchedCoin();
  await buy(await fundedWallet(), mint, SOL(0.02));
  await collect();
});

describe("a standard coin whose Creator Earnings go to its holders", () => {
  it("pays the Creator's share to the holders pro rata in SOL, round by round, each payout transaction on the Ledger, and the Creator's wallet nothing", async () => {
    const creator = await fundedWallet();
    const mint = await holdersCoin(creator);
    expect((await getLaunch(mint)).launch).toMatchObject({ earningsDestination: "holders", rewardTax: null });

    // Seven wallets buy, so a round's payouts take two transactions. Two more hold the coin without buying: one that
    // has no SOL at all, and one under the rules' minimum holding.
    const buyers = await Promise.all(Array.from({ length: 7 }, () => fundedWallet(2)));
    let share = await buy(buyers[0]!, mint, SOL(0.2));
    for (const b of buyers.slice(1)) share += await buy(b, mint, SOL(0.04));
    const [empty, dust] = [Keypair.generate().publicKey, Keypair.generate().publicKey];
    await giveCoins(buyers[0]!, mint, empty, (await coinsOf(mint, buyers[0]!)) / 25n);
    await giveCoins(buyers[0]!, mint, dust, 1_000_000_000n);
    const holdingOf = (wallet: PublicKey) => tokenBalance(getAssociatedTokenAddressSync(new PublicKey(mint), wallet));
    const minLamports = env().creatorForwardMinLamports;
    expect(share).toBeGreaterThan(BigInt(minLamports));

    // Earned from the moment the trades are indexed, but nothing is in the coin's pot until the platform has collected
    // the fees it comes from: a forward run before that opens nothing.
    const none = { paidToHolders: "0", rounds: 0, spent: "0", buybacks: 0, burned: "0", coinsAdded: "0", quoteAdded: "0" };
    expect(await coinEarnings(mint)).toEqual({
      mint, destination: "holders", quote: expect.objectContaining({ mint: WSOL, symbol: "SOL", decimals: 9 }), collected: "0", withheld: "0", applied: "0", waiting: "0",
      minLamports, waitsForGraduation: false, rounds: [], buybacks: [], totals: none,
    });
    expect((await forward()).rules.dividends.filter((d) => d.mint === mint)).toEqual([]);

    await collect();
    expect(await coinEarnings(mint)).toMatchObject({ collected: share.toString(), applied: "0", waiting: share.toString(), rounds: [] });

    // The forward run opens the round: a snapshot of the holders and each one's share of the whole pot.
    const holders = new Map<string, bigint>();
    for (const w of [...buyers.map((b) => b.publicKey), empty]) holders.set(w.toBase58(), await holdingOf(w));
    const rules = RewardRulesPage.parse(await (await api("/v1/rewards/rules")).json()).inForce!;
    expect(await holdingOf(dust)).toBeLessThan(BigInt(rules.minHolding));
    expect(holders.get(empty.toBase58())!).toBeGreaterThanOrEqual(BigInt(rules.minHolding));
    const expected = proRata(share, holders);
    const distributable = sum([...expected.values()]);
    const creatorSol = await solOf(creator);
    const opened = await forward();
    const [dividend, ...more] = opened.rules.dividends.filter((d) => d.mint === mint);
    expect(more).toEqual([]);
    expect(dividend).toEqual({ mint, round: expect.any(String), holders: 8, amount: distributable.toString() });
    // No Creator Forward for this coin, in this run or any other: the share is the holders'.
    expect(opened.sent.filter((f) => f.creator === creator.publicKey.toBase58())).toEqual([]);

    const paying = await coinEarnings(mint);
    expect(paying).toMatchObject({ collected: share.toString(), applied: distributable.toString(), waiting: (share - distributable).toString(), totals: { paidToHolders: "0" } });
    expect(paying.rounds).toEqual([{
      id: dividend!.round, mint, rulesVersion: rules.version, status: "paying", source: "earnings", snapshotSlot: expect.any(Number),
      payout: { asset: "quote", mint: WSOL, symbol: "SOL", decimals: 9 }, pot: share.toString(), sold: null, eligibleHolders: 8, distributable: distributable.toString(),
      paid: "0", startedAt: expect.any(String), finishedAt: null,
    }]);
    // The round is public before anything is paid, every payout pro rata to the holding at the snapshot.
    const snapshot = await roundDetail(dividend!.round);
    expect(new Map(snapshot.payouts.map((p) => [p.wallet, [p.holding, p.amount, p.status]]))).toEqual(
      new Map([...holders].map(([wallet, holding]) => [wallet, [holding.toString(), expected.get(wallet)!.toString(), "unpaid"]])),
    );
    // Nothing has left the operations wallet yet, so the Ledger has nothing to say.
    expect(await dividendsOf(mint)).toEqual([]);

    // While the round is paying, more of the Creator's share is collected: it waits for the next round, since a coin
    // never has two earnings rounds paying at once.
    const late = await fundedWallet(2);
    const lateShare = await buy(late, mint, SOL(0.05));
    await collect();
    const waited = await forward();
    expect(waited.rules.dividends.filter((d) => d.mint === mint)).toEqual([]);
    expect(waited.rules.skipped.filter((s) => s.mint === mint)).toEqual([{ mint, reason: `earnings round ${dividend!.round} is still paying` }]);
    expect(await coinEarnings(mint)).toMatchObject({ collected: (share + lateShare).toString(), applied: distributable.toString(), waiting: (share + lateShare - distributable).toString() });

    // The Reward Engine pays it: plain SOL, the whole share, to every holder that can receive it. Its first run is cut
    // short after one payout at most, as a crash would cut it: what the round, the coin's page and the Ledger each say
    // was paid is the same at that moment, whether or not that one payout was this round's.
    const before = new Map<string, bigint>();
    for (const w of [...buyers.map((b) => b.publicKey), empty, dust, late.publicKey]) before.set(w.toBase58(), await lamportsOf(w));
    const cut = await payRounds(1);
    const partial = await roundDetail(dividend!.round);
    const soFar = sum(partial.payouts.filter((p) => p.status === "paid").map((p) => BigInt(p.amount)));
    expect(partial).toMatchObject({ status: "paying", paid: soFar.toString(), finishedAt: null });
    expect(partial.payouts.filter((p) => p.status === "paid").length).toBeLessThanOrEqual(1);
    expect(sum((await dividendsOf(mint)).map((e) => BigInt(e.amount)))).toBe(soFar);
    expect((await coinEarnings(mint)).totals.paidToHolders).toBe(soFar.toString());

    // The next run pays the rest and closes the round, nobody twice.
    const run = await payRounds();
    const ofRound = (xs: { round: string; payouts: number }[]) => xs.filter((p) => p.round === dividend!.round).reduce((n, p) => n + p.payouts, 0);
    expect(ofRound(cut.paid) + ofRound(run.paid)).toBe(7);
    // The wallet with no SOL is owed less than an account's rent minimum, which no transfer can land: its share goes
    // back into the pot, and the round finishes without it.
    expect(ofRound(cut.returned) + ofRound(run.returned)).toBe(1);
    expect(cut.finished).not.toContain(dividend!.round);
    expect(run.finished).toContain(dividend!.round);
    // The engine opens tax rounds only; an earnings round is never one of its own.
    expect([...cut.opened, ...run.opened].filter((o) => o.mint === mint)).toEqual([]);
    for (const b of buyers) expect((await lamportsOf(b.publicKey)) - before.get(b.publicKey.toBase58())!, b.publicKey.toBase58()).toBe(expected.get(b.publicKey.toBase58())!);
    for (const w of [empty, dust, late.publicKey]) expect(await lamportsOf(w)).toBe(before.get(w.toBase58())!);
    expect(await solOf(creator)).toBe(creatorSol);

    const returned = expected.get(empty.toBase58())!;
    const paid = distributable - returned;
    const detail = await roundDetail(dividend!.round);
    expect(detail).toMatchObject({ status: "paid", source: "earnings", paid: paid.toString(), finishedAt: expect.any(String) });
    expect(detail.payouts.find((p) => p.wallet === empty.toBase58())).toMatchObject({ amount: returned.toString(), status: "returned", signature: null });
    expect(detail.payouts.filter((p) => p.status === "paid")).toHaveLength(7);

    // The Ledger: one `holder_dividend` entry per payout transaction, the SOL it sent from the operations wallet to the
    // holders of the coin, which the entry names. Six payouts fit a transaction, and the first run sent one at most, so
    // the seven took two.
    const carried = byTransaction(detail);
    expect(carried.size).toBe(2);
    const entries = await dividendsOf(mint);
    expect(new Map(entries.map((e) => [e.signature, e.amount]))).toEqual(new Map([...carried].map(([signature, amount]) => [signature, amount.toString()])));
    for (const e of entries) {
      expect(e).toEqual({
        signature: e.signature, index: 0, kind: "holder_dividend", asset: expect.objectContaining({ mint: WSOL, symbol: "SOL", decimals: 9 }), amount: e.amount,
        source: ops(), destination: mint, launch: expect.objectContaining({ mint }), slot: (await rawTransaction(e.signature)).slot, time: expect.any(String),
      });
    }
    expect(sum(entries.map((e) => BigInt(e.amount)))).toBe(paid);

    // What was returned is back in the pot with the late buy's share and the rounding; what was paid is applied.
    const collected = share + lateShare;
    expect(await coinEarnings(mint)).toMatchObject({
      collected: collected.toString(), applied: paid.toString(), waiting: (collected - paid).toString(),
      rounds: [{ id: dividend!.round, status: "paid", paid: paid.toString() }], totals: { ...none, paidToHolders: paid.toString(), rounds: 1 },
    });
    // The Creator's page: everything this coin earned went to its rule, and nothing is forwarded or pending.
    const page = await creatorEarnings(creator.publicKey);
    expect(page.assets).toEqual([{ quote: expect.objectContaining({ mint: WSOL }), earned: collected.toString(), withheld: "0", forwarded: "0", toRule: collected.toString(), pending: "0" }]);
    expect(page.launches).toMatchObject([{ mint, curve: collected.toString(), pool: "0", destination: "holders", applied: paid.toString() }]);
    expect(await creatorForwards(creator.publicKey)).toEqual([]);
    // A holder finds the dividend with their other Holder Rewards.
    expect(await walletRewards(buyers[0]!.publicKey)).toMatchObject([{ round: dividend!.round, mint, source: "earnings", payout: { asset: "quote", symbol: "SOL" }, amount: expected.get(buyers[0]!.publicKey.toBase58())!.toString(), status: "paid" }]);

    // The next forward run opens the next round on what is in the pot now, the late buyer among its holders.
    const pot2 = collected - paid;
    holders.set(late.publicKey.toBase58(), await holdingOf(late.publicKey));
    const expected2 = proRata(pot2, holders);
    const next = await forward();
    const [second] = next.rules.dividends.filter((d) => d.mint === mint);
    expect(second).toEqual({ mint, round: expect.any(String), holders: 9, amount: sum([...expected2.values()]).toString() });
    expect(second!.round).not.toBe(dividend!.round);
    expect((await coinEarnings(mint)).rounds.map((r) => [r.id, r.status, r.pot])).toEqual([[second!.round, "paying", pot2.toString()], [dividend!.round, "paid", share.toString()]]);
    const lateSol = await lamportsOf(late.publicKey);
    const run2 = await payRounds();
    expect(run2.paid.filter((p) => p.round === second!.round)).toEqual([{ round: second!.round, payouts: 8 }]);
    expect(run2.finished).toContain(second!.round);
    // Nothing of the first round is paid again.
    expect(run2.paid.filter((p) => p.round === dividend!.round)).toEqual([]);
    expect((await lamportsOf(late.publicKey)) - lateSol).toBe(expected2.get(late.publicKey.toBase58())!);
    const paid2 = sum([...expected2.values()]) - expected2.get(empty.toBase58())!;

    // Both rounds on the Ledger add up to what the coin's page says its holders were paid.
    const all = await dividendsOf(mint);
    expect(all.map((e) => e.signature).sort()).toEqual([...carried.keys(), ...byTransaction(await roundDetail(second!.round)).keys()].sort());
    expect(sum(all.map((e) => BigInt(e.amount)))).toBe(paid + paid2);
    const settled = await coinEarnings(mint);
    expect(settled).toMatchObject({ applied: (paid + paid2).toString(), waiting: (collected - paid - paid2).toString(), totals: { ...none, paidToHolders: (paid + paid2).toString(), rounds: 2 } });
    expect(BigInt(settled.waiting!)).toBeLessThan(BigInt(minLamports));

    // With nothing new collected, further runs open no round and pay nobody twice.
    const idle = await forward();
    expect(idle.rules.dividends.filter((d) => d.mint === mint)).toEqual([]);
    expect(idle.rules.skipped.filter((s) => s.mint === mint)).toEqual([]);
    const idleRounds = await payRounds();
    expect(idleRounds.paid.filter((p) => [dividend!.round, second!.round].includes(p.round))).toEqual([]);
    expect((await dividendsOf(mint)).map((e) => e.signature).sort()).toEqual(all.map((e) => e.signature).sort());
    expect(await solOf(creator)).toBe(creatorSol);
  }, 300_000);

  it("lets a pot under the minimum wait, and pays it whole once it has grown past it", async () => {
    const creator = await fundedWallet();
    const mint = await holdersCoin(creator);
    const holder = await fundedWallet(2);
    // Half of a 1% fee on 0.015 SOL is 75,000 lamports, under the stack's 100,000 minimum.
    const small = await buy(holder, mint, SOL(0.015));
    expect(small).toBeLessThan(BigInt(env().creatorForwardMinLamports));
    await collect();
    expect((await forward()).rules.dividends.filter((d) => d.mint === mint)).toEqual([]);
    expect(await coinEarnings(mint)).toMatchObject({ collected: small.toString(), applied: "0", waiting: small.toString(), minLamports: env().creatorForwardMinLamports, rounds: [] });

    const more = await buy(holder, mint, SOL(0.1));
    await collect();
    const [dividend] = (await forward()).rules.dividends.filter((d) => d.mint === mint);
    // One holder: the whole pot, to the lamport.
    expect(dividend).toEqual({ mint, round: expect.any(String), holders: 1, amount: (small + more).toString() });
    const held = await solOf(holder);
    expect((await payRounds()).finished).toContain(dividend!.round);
    expect((await solOf(holder)) - held).toBe(small + more);
    expect(await coinEarnings(mint)).toMatchObject({ applied: (small + more).toString(), waiting: "0", totals: { paidToHolders: (small + more).toString(), rounds: 1 } });
    expect((await dividendsOf(mint)).map((e) => e.amount)).toEqual([(small + more).toString()]);
  }, 180_000);
});

describe("a coin paired with USDC whose Creator Earnings go to its holders", () => {
  it("pays the holders in USDC, into each one's own account, opened for a wallet that has none", async () => {
    const creator = await fundedWallet();
    const mint = await holdersCoin(creator, { quoteMint: USDC.toBase58() });
    const [first, second] = [await fundedWallet(2), await fundedWallet(2)];
    await mintLocalQuote(connection(), USDC, first.publicKey, usdc(100));
    await mintLocalQuote(connection(), USDC, second.publicKey, usdc(100));
    const share = (await buy(first, mint, usdc(40))) + (await buy(second, mint, usdc(20)));
    // A third holder with no SOL and no USDC account: a token payout needs neither.
    const fresh = Keypair.generate().publicKey;
    await giveCoins(first, mint, fresh, (await coinsOf(mint, first)) / 4n);
    const holders = new Map<string, bigint>();
    for (const w of [first.publicKey, second.publicKey, fresh]) holders.set(w.toBase58(), await tokenBalance(getAssociatedTokenAddressSync(new PublicKey(mint), w)));
    const expected = proRata(share, holders);
    const distributable = sum([...expected.values()]);

    await collect();
    expect(await coinEarnings(mint)).toMatchObject({ quote: { mint: USDC.toBase58(), symbol: "USDC", decimals: 6 }, collected: share.toString(), waiting: share.toString(), rounds: [] });
    const opened = await forward();
    const [dividend] = opened.rules.dividends.filter((d) => d.mint === mint);
    expect(dividend).toEqual({ mint, round: expect.any(String), holders: 3, amount: distributable.toString() });
    expect(opened.sent.filter((f) => f.creator === creator.publicKey.toBase58())).toEqual([]);
    expect((await coinEarnings(mint)).rounds).toMatchObject([{ id: dividend!.round, source: "earnings", status: "paying", payout: { asset: "quote", mint: USDC.toBase58(), symbol: "USDC", decimals: 6 }, pot: share.toString() }]);

    const before = { first: await usdcOf(first.publicKey), second: await usdcOf(second.publicKey) };
    expect(await connection().getAccountInfo(getAssociatedTokenAddressSync(USDC, fresh), "confirmed")).toBeNull();
    const run = await payRounds();
    expect(run.paid.filter((p) => p.round === dividend!.round)).toEqual([{ round: dividend!.round, payouts: 3 }]);
    expect(run.finished).toContain(dividend!.round);
    expect((await usdcOf(first.publicKey)) - before.first).toBe(expected.get(first.publicKey.toBase58())!);
    expect((await usdcOf(second.publicKey)) - before.second).toBe(expected.get(second.publicKey.toBase58())!);
    expect(await usdcOf(fresh)).toBe(expected.get(fresh.toBase58())!);
    expect(await lamportsOf(fresh)).toBe(0n);
    // The Creator was sent no USDC.
    expect(await usdcOf(creator.publicKey)).toBe(0n);

    // Three payouts fit one transaction: one Ledger entry, in USDC, for all three.
    const detail = await roundDetail(dividend!.round);
    expect(detail).toMatchObject({ status: "paid", paid: distributable.toString() });
    const [entry, ...others] = await dividendsOf(mint);
    expect(others).toEqual([]);
    expect(entry).toMatchObject({
      signature: detail.payouts[0]!.signature, index: 0, kind: "holder_dividend", asset: { mint: USDC.toBase58(), symbol: "USDC", decimals: 6 }, amount: distributable.toString(),
      source: ops(), destination: mint, launch: { mint },
    });
    expect(await coinEarnings(mint)).toMatchObject({ applied: distributable.toString(), waiting: (share - distributable).toString(), totals: { paidToHolders: distributable.toString(), rounds: 1 } });
    const page = await creatorEarnings(creator.publicKey);
    expect(page.assets).toMatchObject([{ quote: { mint: USDC.toBase58() }, earned: share.toString(), forwarded: "0", toRule: share.toString(), pending: "0" }]);
    expect(page.launches).toMatchObject([{ mint, destination: "holders", applied: distributable.toString() }]);
  }, 180_000);
});

describe("a Reward Launch whose Creator Earnings also go to its holders", () => {
  it("keeps the tax and the earnings in separate pots, each with rounds of its own, paying side by side", async () => {
    // Settle every other coin's rounds first, so the runs below are quick to read.
    await payRounds();
    const creator = await fundedWallet(10);
    // Both pots in one asset, the hard case: the tax is sold for USDC and the Creator's share is collected in USDC, into
    // the same account of the operations wallet. (USDC, not SOL: this coin's tax goes on being sold in slices by every
    // later Reward Engine run on the stack, each leaving a little Platform Fee in the Quote Asset's vault, which
    // `fee-collector.test.ts` allows for in USDC alone.)
    const mint = await holdersCoin(creator, { symbol: "BOTH", quoteMint: USDC.toBase58(), rewardTax: "500", rewardPayout: "quote" });
    expect((await getLaunch(mint)).launch).toMatchObject({ earningsDestination: "holders", rewardTax: { bps: 500, payout: "quote" } });
    const mine = <T extends { mint: string }>(xs: T[]) => xs.filter((x) => x.mint === mint);
    const [big, mid] = [await fundedWallet(10), await fundedWallet(10)];
    for (const w of [big, mid]) await mintLocalQuote(connection(), USDC, w.publicKey, usdc(500));
    // Half the curve between them (it graduates at 150 USDC here), so the tax withheld is far more than one slice.
    await buy(big, mint, usdc(50));
    await buy(mid, mint, usdc(25));
    const held = (wallet: PublicKey) => tokenBalance(getAssociatedTokenAddressSync(new PublicKey(mint), wallet, false, TOKEN_2022_PROGRAM_ID));
    const holders = new Map([[big.publicKey.toBase58(), await held(big.publicKey)], [mid.publicKey.toBase58(), await held(mid.publicKey)]]);
    const before = { big: await usdcOf(big.publicKey), mid: await usdcOf(mid.publicKey) };
    const payout = { asset: "quote", mint: USDC.toBase58(), symbol: "USDC", decimals: 6 };

    // The engine collects the tax, sells a slice of it and opens a tax round on what the sale brought in. The run is
    // cut short after one payout at most, so the round is still paying.
    const first = await payRounds(1);
    const [sale] = mine(first.sold);
    expect(sale).toMatchObject({ venue: "curve", outcome: "landed" });
    const [taxOpened] = mine(first.opened);
    expect(taxOpened).toBeDefined();
    const taxPayouts = proRata(BigInt(sale!.proceeds!), holders);
    const taxPot = BigInt(sale!.proceeds!) - sum([...taxPayouts.values()]);
    expect(await rewards(mint)).toMatchObject({
      rounds: [{ id: taxOpened!.round, source: "tax", status: "paying", payout, pot: sale!.proceeds, sold: sale!.coins, eligibleHolders: 2 }], waiting: { pot: taxPot.toString() },
    });

    // The Creator's share of every curve trade so far, the engine's own sale among them, is collected and goes to the
    // holders too: an earnings round opens while the tax round is still paying, on the share alone.
    await collect();
    const share = await shareOfTrades(mint);
    expect(await coinEarnings(mint)).toMatchObject({ destination: "holders", collected: share.toString(), applied: "0", waiting: share.toString(), rounds: [] });
    const [dividend] = mine((await forward()).rules.dividends);
    const dividendPayouts = proRata(share, holders);
    expect(dividend).toEqual({ mint, round: expect.any(String), holders: 2, amount: sum([...dividendPayouts.values()]).toString() });
    expect(dividend!.round).not.toBe(taxOpened!.round);
    expect((await coinEarnings(mint)).rounds).toMatchObject([{ id: dividend!.round, source: "earnings", status: "paying", payout, pot: share.toString(), sold: null }]);
    // The dividend's payouts are committed out of the Creator's share: the tax round and the tax pot are as they were.
    expect(await rewards(mint)).toMatchObject({ rounds: [{ id: taxOpened!.round, source: "tax", status: "paying", pot: sale!.proceeds }], waiting: { pot: taxPot.toString() } });

    // One run pays what is left of both. With a tax round paying, nothing more is sold or opened.
    const second = await payRounds();
    expect(mine(second.sold)).toEqual([]);
    expect(mine(second.opened)).toEqual([]);
    expect(second.finished).toEqual(expect.arrayContaining([taxOpened!.round, dividend!.round]));
    const [taxRound, dividendRound] = [await roundDetail(taxOpened!.round), await roundDetail(dividend!.round)];
    const amounts = (detail: RewardRoundDetail) => new Map(detail.payouts.map((p) => [p.wallet, [p.amount, p.status]]));
    expect(taxRound).toMatchObject({ source: "tax", status: "paid", pot: sale!.proceeds, paid: sum([...taxPayouts.values()]).toString() });
    expect(amounts(taxRound)).toEqual(new Map([...taxPayouts].map(([wallet, amount]) => [wallet, [amount.toString(), "paid"]])));
    expect(dividendRound).toMatchObject({ source: "earnings", status: "paid", pot: share.toString(), paid: sum([...dividendPayouts.values()]).toString() });
    expect(amounts(dividendRound)).toEqual(new Map([...dividendPayouts].map(([wallet, amount]) => [wallet, [amount.toString(), "paid"]])));
    // Each holder got both, in USDC: its share of the tax pot and its share of the Creator's.
    expect((await usdcOf(big.publicKey)) - before.big).toBe(taxPayouts.get(big.publicKey.toBase58())! + dividendPayouts.get(big.publicKey.toBase58())!);
    expect((await usdcOf(mid.publicKey)) - before.mid).toBe(taxPayouts.get(mid.publicKey.toBase58())! + dividendPayouts.get(mid.publicKey.toBase58())!);

    // Each page lists its own rounds, and the tax pot still holds exactly what the tax round's rounding left in it.
    expect(await rewards(mint)).toMatchObject({ rounds: [{ id: taxOpened!.round, source: "tax", status: "paid" }], waiting: { pot: taxPot.toString() } });
    expect((await rewards(mint)).rounds).toHaveLength(1);
    const earned = await coinEarnings(mint);
    expect(earned.rounds.map((r) => [r.id, r.source, r.status])).toEqual([[dividend!.round, "earnings", "paid"]]);
    expect(earned.totals).toMatchObject({ paidToHolders: dividendRound.paid, rounds: 1 });
    // Only the dividend is on the Ledger: the tax was the holders' own money all along, never revenue.
    const dividendTransactions = byTransaction(dividendRound);
    const everything = await ledger();
    expect(new Map(everything.filter((e) => e.kind === "holder_dividend" && e.launch?.mint === mint).map((e) => [e.signature, e.amount]))).toEqual(
      new Map([...dividendTransactions].map(([signature, amount]) => [signature, amount.toString()])),
    );
    const taxTransactions = [...byTransaction(taxRound).keys()];
    expect(taxTransactions.length).toBeGreaterThan(0);
    expect(everything.filter((e) => taxTransactions.includes(e.signature))).toEqual([]);

    // The other way round: an earnings round is paying when the engine's turn comes for the coin's tax. It is not
    // taken for the tax round, so the next slice is sold and the next tax round opens, on the tax pot alone.
    await buy(big, mint, usdc(15));
    holders.set(big.publicKey.toBase58(), await held(big.publicKey));
    await collect();
    const pot2 = (await shareOfTrades(mint)) - BigInt(dividendRound.paid);
    const [dividend2] = mine((await forward()).rules.dividends);
    expect(dividend2).toEqual({ mint, round: expect.any(String), holders: 2, amount: sum([...proRata(pot2, holders).values()]).toString() });
    expect((await coinEarnings(mint)).rounds[0]).toMatchObject({ id: dividend2!.round, source: "earnings", status: "paying", pot: pot2.toString() });
    const last = await payRounds();
    const [sale2] = mine(last.sold);
    expect(sale2).toMatchObject({ outcome: "landed" });
    const [taxOpened2] = mine(last.opened);
    expect(taxOpened2).toBeDefined();
    expect(last.finished).toEqual(expect.arrayContaining([taxOpened2!.round, dividend2!.round]));
    // Its pot is what the first round's rounding left and the new sale's proceeds: no dividend, paid or still to be
    // paid, came out of it.
    expect(await roundDetail(taxOpened2!.round)).toMatchObject({ source: "tax", status: "paid", pot: (taxPot + BigInt(sale2!.proceeds!)).toString(), eligibleHolders: 2 });
    const dividendRound2 = await roundDetail(dividend2!.round);
    expect(dividendRound2).toMatchObject({ source: "earnings", status: "paid", pot: pot2.toString(), eligibleHolders: 2 });

    expect((await rewards(mint)).rounds.map((r) => [r.id, r.source])).toEqual([[taxOpened2!.round, "tax"], [taxOpened!.round, "tax"]]);
    const settled = await coinEarnings(mint);
    expect(settled.rounds.map((r) => [r.id, r.source])).toEqual([[dividend2!.round, "earnings"], [dividend!.round, "earnings"]]);
    expect(settled.totals).toMatchObject({ paidToHolders: (BigInt(dividendRound.paid) + BigInt(dividendRound2.paid)).toString(), rounds: 2 });
    expect(sum((await dividendsOf(mint)).map((e) => BigInt(e.amount)))).toBe(BigInt(dividendRound.paid) + BigInt(dividendRound2.paid));
    // A holder's own lookup shows all four, each under its source.
    expect((await walletRewards(big.publicKey)).filter((r) => r.mint === mint).map((r) => r.source).sort()).toEqual(["earnings", "earnings", "tax", "tax"]);

    // The holders sell out. The Creator's share of those sells is collected, but with nobody left to pay it opens no
    // round: it waits in the pot. (This also leaves the coin without a tax round on every later run of the engine,
    // whose payouts `reward-rounds.test.ts` counts run by run.)
    for (const w of [big, mid]) {
      const sold = await trade(w, mint, "sell", await held(w.publicKey));
      await deliverWebhook([sold.signature]);
      expect(await held(w.publicKey)).toBe(0n);
    }
    await collect();
    const idle = await forward();
    expect(mine(idle.rules.dividends)).toEqual([]);
    expect(mine(idle.rules.skipped)).toEqual([{ mint, reason: "no wallet holds enough of the coin to be paid" }]);
    const waiting = await coinEarnings(mint);
    expect(waiting.rounds).toHaveLength(2);
    expect(BigInt(waiting.waiting!)).toBe((await shareOfTrades(mint)) - BigInt(dividendRound.paid) - BigInt(dividendRound2.paid));
    const quiet = await payRounds();
    expect(mine(quiet.opened)).toEqual([]);

    // The Creator was forwarded nothing along the way.
    expect(await creatorForwards(creator.publicKey)).toEqual([]);
    expect(await usdcOf(creator.publicKey)).toBe(0n);
  }, 300_000);
});
