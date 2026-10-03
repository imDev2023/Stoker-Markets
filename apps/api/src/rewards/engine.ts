// The Reward Engine (#17, amended by #43): Reward Rounds that collect a Reward Launch's withheld Reward Tax and pay it
// to holders pro rata in the Launch's Payout Asset: the coin itself, never sold, or its Quote Asset, bought with the
// tax through bounded Reward Sales (ADR 0006). A round is public from its snapshot to its last payout, resumable at
// any point, and never pays a holder twice: every payout is written down before it is sent, and a run that finds a
// payout in flight waits for its transaction to land or expire before sending another.
import { Connection, PublicKey, SystemProgram, type Keypair, type TransactionInstruction } from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction, createHarvestWithheldTokensToMintInstruction, createTransferCheckedInstruction,
  createWithdrawWithheldTokensFromMintInstruction, getAssociatedTokenAddressSync, getMint, getTransferFeeConfig, TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import { and, asc, desc, eq, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { signedTransaction, WSOL_MINT } from "@launchpad/chain";
import { launches, operatorAlerts, rewardPayouts, rewardRounds, rewardRules, rewardSales, type Db } from "@launchpad/db";
import type { Config } from "../env";
import { JobFailure } from "../jobs";
import { eligibleHolders, readCoinAccounts } from "./holders";
import { quotePot, sellSlice, settlePendingSales, unassignedSales, type SaleReport } from "./sales";

export type RewardEngineDeps = { db: Db; cfg: Config; operations: Keypair; now?: Date };

export type RewardRoundsSummary = {
  /** Coins whose withheld tax was harvested and withdrawn, with how much. */
  collected: { mint: string; amount: string }[];
  /** Reward Sales this run made, one slice per Quote Asset payout coin at most. */
  sold: SaleReport[];
  /** Coins whose slice was not sold this run, and why. */
  unsold: { mint: string; reason: string }[];
  /** Rounds opened this run, with their snapshot. */
  opened: { mint: string; round: string; holders: number; amount: string }[];
  /** Payouts sent this run, per round. */
  paid: { round: string; payouts: number }[];
  /** SOL payouts no transaction could land (under the rent minimum, to a wallet holding no SOL), back in the pot. */
  returned: { round: string; payouts: number }[];
  /** Rounds that finished this run. */
  finished: string[];
  /** Payouts and sales of earlier runs found landed or expired, now settled. */
  settled: { landed: number; expired: number; sales: { landed: number; failed: number; expired: number } };
  problems: string[];
};

/** A round still paying this long after it opened has stalled: something keeps its payouts from landing. */
const ROUND_STALL_SECONDS = 60 * 60;
/** Accounts a harvest instruction can take at once, within one transaction. */
const HARVEST_BATCH = 20;
/** Holders paid per transaction: a transfer and an idempotent account creation each. */
const PAYOUT_BATCH = 6;
const POLL_MS = 400;
const WSOL = WSOL_MINT.toBase58();

export type RewardRule = typeof rewardRules.$inferSelect;
type Round = typeof rewardRounds.$inferSelect;

/** A Reward Launch as the engine works on it. */
type Coin = { mint: string; symbol: string; decimals: number; pool: string; quoteMint: string; payout: "coin" | "quote" };

/** The rules version in force at `now`: the newest whose effective time has passed. Announced ones wait their turn. */
export async function rulesInForce(db: Db, now = new Date()): Promise<RewardRule> {
  const [rule] = await db
    .select()
    .from(rewardRules)
    .where(lte(rewardRules.effectiveAt, now))
    .orderBy(desc(rewardRules.effectiveAt), desc(rewardRules.version))
    .limit(1);
  if (!rule) throw new Error("no Reward Round rules are in force; the first version is missing");
  return rule;
}

/**
 * One run of the Reward Engine over every Reward Launch: settle payouts and sales in flight, harvest and withdraw
 * withheld tax, sell one slice of it where the Payout Asset is the Quote Asset, open a round where enough has
 * collected (or been sold), and pay the open rounds, at most `maxPayouts` payouts in all so a run stays within a Cron
 * Trigger's time.
 */
export async function runRewardRounds({ db, cfg, operations, now = new Date() }: RewardEngineDeps, maxPayouts = 200): Promise<RewardRoundsSummary> {
  const connection = new Connection(cfg.rpcUrl, "confirmed");
  const summary: RewardRoundsSummary = {
    collected: [], sold: [], unsold: [], opened: [], paid: [], returned: [], finished: [],
    settled: { landed: 0, expired: 0, sales: { landed: 0, failed: 0, expired: 0 } }, problems: [],
  };
  const rules = await rulesInForce(db, now);
  const coins: Coin[] = (
    await db
      .select({ mint: launches.mint, symbol: launches.symbol, decimals: launches.decimals, pool: launches.pool, quoteMint: launches.quoteMint, payout: launches.rewardPayout })
      .from(launches)
      .where(isNotNull(launches.rewardTaxBps))
      .orderBy(asc(launches.createdSlot))
  ).map((c) => ({ ...c, payout: c.payout ?? "coin" }));
  let budget = maxPayouts;
  for (const coin of coins) {
    try {
      const mint = new PublicKey(coin.mint);
      const settled = await settlePayouts(db, connection, mint);
      summary.settled.landed += settled.landed;
      summary.settled.expired += settled.expired;
      if (coin.payout === "quote") {
        const sales = await settlePendingSales(db, cfg, connection, operations.publicKey, coin);
        summary.settled.sales.landed += sales.landed;
        summary.settled.sales.failed += sales.failed;
        summary.settled.sales.expired += sales.expired;
      }

      const [open] = await db.select().from(rewardRounds).where(and(eq(rewardRounds.mint, coin.mint), eq(rewardRounds.status, "paying"))).limit(1);
      if (!open) {
        const collected = await collectTax(connection, operations, mint);
        if (collected > 0n) summary.collected.push({ mint: coin.mint, amount: collected.toString() });
        if (coin.payout === "quote") {
          const { sale, skipped } = await sellSlice(db, cfg, connection, operations, coin);
          if (sale) summary.sold.push(sale);
          if (skipped) summary.unsold.push({ mint: coin.mint, reason: skipped });
        }
        const opened = await openRound(db, connection, operations, coin, rules, now);
        if (opened) summary.opened.push({ mint: coin.mint, round: opened.id, holders: opened.holders, amount: opened.amount });
      }
      const [round] = await db.select().from(rewardRounds).where(and(eq(rewardRounds.mint, coin.mint), eq(rewardRounds.status, "paying"))).limit(1);
      if (!round || budget <= 0) continue;
      const { paid, returned } = await payRound(db, connection, operations, round, budget);
      budget -= paid;
      if (paid > 0) summary.paid.push({ round: round.id, payouts: paid });
      if (returned > 0) summary.returned.push({ round: round.id, payouts: returned });
      if (await finishIfPaid(db, round.id, now)) summary.finished.push(round.id);
    } catch (e) {
      summary.problems.push(`${coin.symbol} (${coin.mint}): ${(e as Error).message}`);
    }
  }
  await alertStalledRounds(db, now);
  if (summary.problems.length) throw new JobFailure(summary.problems.join("; "), summary);
  return summary;
}

/** Raises an alert for each round still paying long after it opened, and resolves the alerts of rounds since finished. */
async function alertStalledRounds(db: Db, now: Date) {
  const cutoff = new Date(now.getTime() - ROUND_STALL_SECONDS * 1000);
  const stalled = await db
    .select({ id: rewardRounds.id, mint: rewardRounds.mint, startedAt: rewardRounds.startedAt })
    .from(rewardRounds)
    .where(and(eq(rewardRounds.status, "paying"), lte(rewardRounds.startedAt, cutoff)));
  for (const r of stalled) {
    const minutes = Math.round((now.getTime() - r.startedAt.getTime()) / 60_000);
    await db
      .insert(operatorAlerts)
      .values({ kind: "reward_round_stalled", subject: r.id, message: `Reward Round ${r.id} on ${r.mint} opened ${minutes} min ago and is still paying. Check the operations wallet's SOL and the round's payouts.` })
      .onConflictDoNothing();
  }
  await db
    .update(operatorAlerts)
    .set({ resolvedAt: sql`now()` })
    .where(
      and(
        eq(operatorAlerts.kind, "reward_round_stalled"),
        isNull(operatorAlerts.resolvedAt),
        sql`${operatorAlerts.subject} in (select ${rewardRounds.id} from ${rewardRounds} where ${rewardRounds.status} <> 'paying')`,
      ),
    );
}

/**
 * Harvests the tax withheld in the coin's accounts to the mint, then withdraws the mint's withheld tax to the operations
 * wallet's account of the coin. Returns what the withdrawal moved. Anyone may harvest; only the withdraw authority
 * (ours from the launch) may withdraw.
 */
async function collectTax(connection: Connection, operations: Keypair, mint: PublicKey): Promise<bigint> {
  const ops = operations.publicKey;
  const accounts = (await readCoinAccounts(connection, mint)).filter((a) => a.withheld > 0n);
  for (let i = 0; i < accounts.length; i += HARVEST_BATCH) {
    const batch = accounts.slice(i, i + HARVEST_BATCH).map((a) => a.address);
    await sendAndWait(connection, operations, [createHarvestWithheldTokensToMintInstruction(mint, batch, TOKEN_2022_PROGRAM_ID)]);
  }
  const withheldInMint = getTransferFeeConfig(await getMint(connection, mint, "confirmed", TOKEN_2022_PROGRAM_ID))?.withheldAmount ?? 0n;
  if (withheldInMint === 0n) return 0n;
  const destination = getAssociatedTokenAddressSync(mint, ops, false, TOKEN_2022_PROGRAM_ID);
  await sendAndWait(connection, operations, [
    createAssociatedTokenAccountIdempotentInstruction(ops, destination, ops, mint, TOKEN_2022_PROGRAM_ID),
    createWithdrawWithheldTokensFromMintInstruction(mint, destination, ops, [], TOKEN_2022_PROGRAM_ID),
  ]);
  return withheldInMint;
}

/**
 * Opens a round when enough tax has collected under the rules' threshold, in coins either way: for a coin payout the
 * operations wallet holds at least that much of the coin, for a Quote Asset payout at least that many coins were sold
 * since the last round. Snapshots every eligible holder and writes each one's pro-rata share of the pot (the collected
 * coins, or what the sales brought in and no round has paid), all in one transaction so a round is never half written.
 */
async function openRound(db: Db, connection: Connection, operations: Keypair, coin: Coin, rules: RewardRule, now: Date) {
  const ops = operations.publicKey;
  const mint = new PublicKey(coin.mint);
  let pot: bigint;
  let payout: { mint: string; decimals: number; sold: string | null };
  if (coin.payout === "coin") {
    const source = getAssociatedTokenAddressSync(mint, ops, false, TOKEN_2022_PROGRAM_ID);
    pot = BigInt((await connection.getTokenAccountBalance(source, "confirmed").catch(() => null))?.value.amount ?? 0);
    if (pot < BigInt(rules.roundThreshold)) return null;
    payout = { mint: coin.mint, decimals: coin.decimals, sold: null };
  } else {
    const sales = await unassignedSales(db, coin.mint);
    if (sales.count === 0 || sales.coins < BigInt(rules.roundThreshold)) return null;
    pot = await quotePot(db, coin.mint);
    if (pot === 0n) return null;
    const [sale] = await db.select({ decimals: rewardSales.quoteDecimals }).from(rewardSales).where(and(eq(rewardSales.mint, coin.mint), eq(rewardSales.status, "landed"))).limit(1);
    payout = { mint: coin.quoteMint, decimals: sale!.decimals, sold: sales.coins.toString() };
  }
  const slot = await connection.getSlot("confirmed");
  const holders = eligibleHolders(await readCoinAccounts(connection, mint), ops, BigInt(rules.minHolding));
  const total = holders.reduce((s, h) => s + h.amount, 0n);
  if (holders.length === 0 || total === 0n) return null;
  const id = crypto.randomUUID();
  const payouts = holders.map((h) => ({ roundId: id, wallet: h.wallet, holding: h.amount.toString(), amount: ((pot * h.amount) / total).toString() })).filter((p) => p.amount !== "0");
  const distributable = payouts.reduce((s, p) => s + BigInt(p.amount), 0n);
  await db.transaction(async (tx) => {
    await tx.insert(rewardRounds).values({
      id, mint: coin.mint, rulesVersion: rules.version, status: "paying", snapshotSlot: slot, payoutMint: payout.mint, payoutDecimals: payout.decimals,
      pot: pot.toString(), sold: payout.sold, eligibleHolders: payouts.length, distributable: distributable.toString(), startedAt: now,
    });
    if (payouts.length) await tx.insert(rewardPayouts).values(payouts);
    // The sales this round pays out are its own from here; the next round counts from the next sale.
    if (coin.payout === "quote")
      await tx.update(rewardSales).set({ roundId: id }).where(and(eq(rewardSales.mint, coin.mint), eq(rewardSales.status, "landed"), isNull(rewardSales.roundId)));
  });
  return { id, holders: payouts.length, amount: distributable.toString() };
}

/**
 * Pays a round's unpaid holders, at most `budget` of them, a few per transaction, in the round's Payout Asset: the coin
 * or any other token into the holder's account (opened by the operations wallet if need be), SOL as plain SOL. Each
 * payout is marked as sent with its transaction and the block height it can still land at before the transaction goes
 * out, so a run that dies here leaves nothing that the next run could pay twice. A SOL payout under the rent-exempt
 * minimum to a wallet holding no SOL can never land: it is returned to the pot instead of failing the whole batch.
 */
async function payRound(db: Db, connection: Connection, operations: Keypair, round: Round, budget: number) {
  const ops = operations.publicKey;
  const payoutMint = new PublicKey(round.payoutMint);
  const inSol = round.payoutMint === WSOL;
  const tokenProgram = inSol ? null : (await connection.getAccountInfo(payoutMint, "confirmed"))?.owner ?? null;
  if (!inSol && !tokenProgram) throw new Error(`payout mint ${round.payoutMint} does not exist`);
  const source = inSol ? null : getAssociatedTokenAddressSync(payoutMint, ops, false, tokenProgram!);
  let unpaid = await db
    .select()
    .from(rewardPayouts)
    .where(and(eq(rewardPayouts.roundId, round.id), eq(rewardPayouts.status, "unpaid")))
    .orderBy(asc(rewardPayouts.wallet))
    .limit(budget);
  let returned = 0;
  if (inSol && unpaid.length) {
    const rentMinimum = BigInt(await connection.getMinimumBalanceForRentExemption(0, "confirmed"));
    const infos = await connection.getMultipleAccountsInfo(unpaid.map((p) => new PublicKey(p.wallet)), "confirmed");
    const unpayable = unpaid.filter((p, i) => BigInt(infos[i]?.lamports ?? 0) + BigInt(p.amount) < rentMinimum).map((p) => p.wallet);
    if (unpayable.length) {
      returned = (
        await db
          .update(rewardPayouts)
          .set({ status: "returned" })
          .where(and(eq(rewardPayouts.roundId, round.id), eq(rewardPayouts.status, "unpaid"), inArray(rewardPayouts.wallet, unpayable)))
          .returning({ wallet: rewardPayouts.wallet })
      ).length;
      unpaid = unpaid.filter((p) => !unpayable.includes(p.wallet));
    }
  }
  let paid = 0;
  for (let i = 0; i < unpaid.length; i += PAYOUT_BATCH) {
    const batch = unpaid.slice(i, i + PAYOUT_BATCH);
    const instructions: TransactionInstruction[] = [];
    for (const p of batch) {
      const wallet = new PublicKey(p.wallet);
      if (inSol) {
        instructions.push(SystemProgram.transfer({ fromPubkey: ops, toPubkey: wallet, lamports: BigInt(p.amount) }));
        continue;
      }
      const destination = getAssociatedTokenAddressSync(payoutMint, wallet, false, tokenProgram!);
      instructions.push(
        createAssociatedTokenAccountIdempotentInstruction(ops, destination, wallet, payoutMint, tokenProgram!),
        createTransferCheckedInstruction(source!, payoutMint, destination, ops, BigInt(p.amount), round.payoutDecimals, [], tokenProgram!),
      );
    }
    const tx = await signedTransaction(connection, operations, instructions);
    const { signature, lastValidBlockHeight } = tx;
    // Claimed before sending: only rows still unpaid are taken, so a concurrent run can't send the same payout.
    const claimed = await db
      .update(rewardPayouts)
      .set({ status: "sending", signature, sendableUntil: lastValidBlockHeight })
      .where(and(eq(rewardPayouts.roundId, round.id), eq(rewardPayouts.status, "unpaid"), inArray(rewardPayouts.wallet, batch.map((p) => p.wallet))))
      .returning({ wallet: rewardPayouts.wallet });
    if (claimed.length !== batch.length) throw new Error("another run is paying this round");
    await connection.sendRawTransaction(tx.serialized, { preflightCommitment: "confirmed" });
    const landed = await waitFor(connection, signature, lastValidBlockHeight);
    if (landed === "landed") {
      await db.update(rewardPayouts).set({ status: "paid", paidAt: sql`now()` }).where(and(eq(rewardPayouts.roundId, round.id), eq(rewardPayouts.signature, signature)));
      paid += batch.length;
    } else if (landed === "failed") {
      await db.update(rewardPayouts).set({ status: "unpaid", signature: null, sendableUntil: null }).where(and(eq(rewardPayouts.roundId, round.id), eq(rewardPayouts.signature, signature)));
      throw new Error(`payout transaction ${signature} failed on-chain`);
    }
    // Still in flight: the next run settles it.
  }
  return { paid, returned };
}

/** Marks a round paid once every payout is paid or returned, with the total that reached holders. */
async function finishIfPaid(db: Db, roundId: string, now: Date) {
  const [left] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(rewardPayouts)
    .where(and(eq(rewardPayouts.roundId, roundId), sql`${rewardPayouts.status} not in ('paid', 'returned')`));
  if (left!.n > 0) return false;
  const [sum] = await db
    .select({ paid: sql<string>`coalesce(sum(${rewardPayouts.amount}), 0)::text` })
    .from(rewardPayouts)
    .where(and(eq(rewardPayouts.roundId, roundId), eq(rewardPayouts.status, "paid")));
  const updated = await db
    .update(rewardRounds)
    .set({ status: "paid", paid: sum!.paid, finishedAt: now })
    .where(and(eq(rewardRounds.id, roundId), eq(rewardRounds.status, "paying")))
    .returning({ id: rewardRounds.id });
  return updated.length > 0;
}

/** Payouts sent by earlier runs: landed ones are marked paid, expired ones go back to unpaid to be sent again. */
async function settlePayouts(db: Db, connection: Connection, mint: PublicKey) {
  const inFlight = await db
    .select({ roundId: rewardPayouts.roundId, signature: rewardPayouts.signature, sendableUntil: rewardPayouts.sendableUntil })
    .from(rewardPayouts)
    .innerJoin(rewardRounds, eq(rewardRounds.id, rewardPayouts.roundId))
    .where(and(eq(rewardRounds.mint, mint.toBase58()), eq(rewardPayouts.status, "sending"), isNotNull(rewardPayouts.signature)))
    .groupBy(rewardPayouts.roundId, rewardPayouts.signature, rewardPayouts.sendableUntil);
  const out = { landed: 0, expired: 0 };
  if (!inFlight.length) return out;
  const height = await connection.getBlockHeight("confirmed");
  for (const f of inFlight) {
    const { value: [status] } = await connection.getSignatureStatuses([f.signature!], { searchTransactionHistory: true });
    const where = and(eq(rewardPayouts.roundId, f.roundId), eq(rewardPayouts.signature, f.signature!), eq(rewardPayouts.status, "sending"));
    if (status && !status.err && (status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized")) {
      out.landed += (await db.update(rewardPayouts).set({ status: "paid", paidAt: sql`now()` }).where(where).returning({ wallet: rewardPayouts.wallet })).length;
    } else if (status?.err || (!status && f.sendableUntil !== null && height > f.sendableUntil)) {
      out.expired += (await db.update(rewardPayouts).set({ status: "unpaid", signature: null, sendableUntil: null }).where(where).returning({ wallet: rewardPayouts.wallet })).length;
    }
  }
  return out;
}

async function waitFor(connection: Connection, signature: string, lastValidBlockHeight: number): Promise<"landed" | "failed" | "pending"> {
  for (;;) {
    const { value: [status] } = await connection.getSignatureStatuses([signature]);
    if (status?.err) return "failed";
    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") return "landed";
    if ((await connection.getBlockHeight("confirmed")) > lastValidBlockHeight) return "pending";
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

async function sendAndWait(connection: Connection, signer: Keypair, instructions: TransactionInstruction[]) {
  const tx = await signedTransaction(connection, signer, instructions);
  await connection.sendRawTransaction(tx.serialized, { preflightCommitment: "confirmed" });
  const outcome = await waitFor(connection, tx.signature, tx.lastValidBlockHeight);
  if (outcome !== "landed") throw new Error(`transaction ${tx.signature} ${outcome === "failed" ? "failed on-chain" : "expired unlanded"}`);
  return tx.signature;
}

/** What is waiting to be paid on a coin: tax withheld in its accounts and its mint, plus what the operations wallet holds of it. */
export async function taxWaiting(connection: Connection, operationsWallet: PublicKey, mint: PublicKey) {
  const accounts = await readCoinAccounts(connection, mint);
  const inAccounts = accounts.reduce((s, a) => s + a.withheld, 0n);
  const inMint = getTransferFeeConfig(await getMint(connection, mint, "confirmed", TOKEN_2022_PROGRAM_ID))?.withheldAmount ?? 0n;
  const held = accounts.find((a) => a.owner.equals(operationsWallet))?.amount ?? 0n;
  return { inAccounts, inMint, held, total: inAccounts + inMint + held };
}

/** The rules a Reward Round follows, as published: the version in force and any announced for later. */
export async function publishedRules(db: Db, now = new Date()) {
  const all = await db.select().from(rewardRules).orderBy(asc(rewardRules.effectiveAt), asc(rewardRules.version));
  const inForce = all.filter((r) => r.effectiveAt <= now).at(-1) ?? null;
  return { inForce, upcoming: all.filter((r) => r.effectiveAt > now) };
}
