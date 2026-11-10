// Where a Creator's earnings go when not to their wallet (ADR 0011, #113, #184): run by the Creator Forward job right
// after the wallet forwards, once per coin with a rule. Each coin has a pot of its own, in its Quote Asset: what the
// platform collected for its Creator on it, less its Graduation Fee, less what its rule has already paid out or spent.
// A run uses the pot once it is worth the minimum:
// - `holders`: opens a Reward Round that pays it to the coin's holders, which the Reward Engine then pays;
// - `burn`: buys the coin in its own market and burns what it bought;
// - `liquidity`: once the coin has graduated, buys the coin, pairs it and adds it to the pool as locked liquidity.
// Nothing here is trustless: the rule is applied by this job, and every action is on the public Ledger.
import { PublicKey } from "@solana/web3.js";
import { readTokenHoldings, WSOL_MINT } from "@launchpad/chain";
import { rulePots } from "../creatorShares";
import { revenueHeld } from "../held";
import { valuer } from "../value";
import { planBurn } from "./burn";
import { sendBuyback, settlePendingBuybacks, type BuybackReport } from "./buyback";
import { openDividendRound, type DividendRound } from "./holders";
import { planLiquidityAdd } from "./liquidity";
import { isSkipped, type RuleDeps } from "./types";

const WSOL = WSOL_MINT.toBase58();

export type RulesSummary = {
  /** Buybacks of earlier runs that were still in flight, now settled. */
  settled: { signature: string; outcome: string }[];
  /** Earnings rounds opened this run, one per coin at most. */
  dividends: DividendRound[];
  /** Buybacks sent this run, one per coin at most. */
  buybacks: BuybackReport[];
  /** Coins whose pot is not yet worth a run; it waits and grows. */
  belowMinimum: number;
  /** Coins whose rule did nothing this run, and why. */
  skipped: { mint: string; reason: string }[];
  /** What could not even be tried, or failed outright. */
  problems: string[];
};

const min = (...values: bigint[]) => values.reduce((a, b) => (a < b ? a : b));

/** One run over every coin with a rule. A coin that fails does not stop the others; its problem is in the summary. */
export async function applyEarningsRules(deps: RuleDeps, now = new Date()): Promise<RulesSummary> {
  const { db, cfg, operations, connection } = deps;
  const summary: RulesSummary = { settled: [], dividends: [], buybacks: [], belowMinimum: 0, skipped: [], problems: [] };
  // Anything an earlier run sent but could not see land is settled first; a coin with a buyback still in flight waits.
  const { settled, busy } = await settlePendingBuybacks(deps);
  summary.settled = settled;

  const pots = (await rulePots(db)).filter((p) => p.available > 0n);
  if (!pots.length) return summary;
  const [worthARun, worthAPosition] = await Promise.all([valuer(db, cfg.creatorForwardMinLamports), valuer(db, cfg.liquidityAddMinLamports)]);
  // Only revenue is ever used: the wallet's account of a token can also hold a Reward Round's pot.
  const tokenMints = [...new Set(pots.map((p) => p.quoteMint).filter((m) => m !== WSOL))];
  const held = new Map((await readTokenHoldings(connection, operations.publicKey, tokenMints.map((m) => new PublicKey(m)))).map((t) => [t.mint.toBase58(), t.amount]));
  const revenue = await revenueHeld(db, tokenMints);

  for (const pot of pots) {
    if (busy.has(pot.mint)) {
      summary.skipped.push({ mint: pot.mint, reason: "an earlier buyback may still land" });
      continue;
    }
    const amount = pot.quoteMint === WSOL ? pot.available : min(pot.available, held.get(pot.quoteMint) ?? 0n, revenue.get(pot.quoteMint) ?? 0n);
    if (amount < pot.available) summary.problems.push(`${pot.symbol} (${pot.mint}) has ${pot.available} of ${pot.quoteMint} in its pot, but the operations wallet holds only ${amount} of it as revenue`);
    if (!worthARun(pot.quoteMint, amount) || (pot.destination === "liquidity" && !worthAPosition(pot.quoteMint, amount))) {
      summary.belowMinimum++;
      continue;
    }
    try {
      if (pot.destination === "holders") {
        const round = await openDividendRound(deps, pot, amount, now);
        if (isSkipped(round)) summary.skipped.push({ mint: pot.mint, reason: round.skipped });
        else summary.dividends.push(round);
        // A round commits its payouts; they leave the wallet as the Reward Engine pays them.
        if (!isSkipped(round) && pot.quoteMint !== WSOL) spend(held, revenue, pot.quoteMint, BigInt(round.amount));
        continue;
      }
      const plan = pot.destination === "burn" ? await planBurn(deps, pot, amount) : await planLiquidityAdd(deps, pot, amount);
      if (isSkipped(plan)) {
        summary.skipped.push({ mint: pot.mint, reason: plan.skipped });
        continue;
      }
      if (plan.budget > amount) throw new Error(`the plan may spend ${plan.budget}, more than the ${amount} in the pot`);
      const report = await sendBuyback(deps, pot, pot.destination, plan);
      summary.buybacks.push(report);
      if (pot.quoteMint !== WSOL) spend(held, revenue, pot.quoteMint, report.spent ? BigInt(report.spent) : plan.budget);
      if (report.outcome === "failed" || report.outcome === "expired")
        summary.problems.push(`${pot.destination} of ${pot.symbol} (${pot.mint}): ${report.outcome}${report.error ? ` (${report.error})` : ""}`);
    } catch (e) {
      summary.problems.push(`${pot.destination} of ${pot.symbol} (${pot.mint}): ${(e as Error).message}`);
    }
  }
  return summary;
}

function spend(held: Map<string, bigint>, revenue: Map<string, bigint>, mint: string, amount: bigint) {
  held.set(mint, (held.get(mint) ?? 0n) - amount);
  revenue.set(mint, (revenue.get(mint) ?? 0n) - amount);
}
