// Burn and Flywheel (#18): on a public schedule, the Burn's row of the Budget Table (ADR 0019; 60% of the Platform Net
// in its first version) buys the Platform Token and burns it, and the Flywheel's row (5%) buys the top Launches by the
// published rule and burns them. Budgets come from the Ledger, so every SOL spent is accounted for against revenue
// already recorded, and every buy and burn goes on the Ledger with its transaction. The operator can point either
// budget at locked liquidity in the coin's own pool instead of a burn (#184, `./liquidity`).
import { Connection, PublicKey, type Keypair, type TransactionInstruction } from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction, createBurnCheckedInstruction, createCloseAccountInstruction, getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import BN from "bn.js";
import { desc, eq, sql } from "drizzle-orm";
import {
  cpmmSolSwap, graduationPoolAddress, loadCurve, loadPool, poolSides, poolSwap, poolSwapExactOut, routedQuoteAccount, signedTransaction,
  swapBaseOutputIx, transferFeeBps, WSOL_MINT, type SolSwap,
} from "@launchpad/chain";
import { graduations, launches, platformSettings, quoteAssets, trades, type Db } from "@launchpad/db";
import type { Config } from "../env";
import { JobFailure } from "../jobs";
import type { SolRoutes } from "../solRoutes";
import { budgets, type Budgets, type RowBudget } from "../fees/budget";
import { recordBurn } from "./decode";
import { addLiquidity, budgetDestinations, landed, type Destinations } from "./liquidity";

export type BurnDeps = { db: Db; cfg: Config; operations: Keypair; routes: SolRoutes | null };

/** Budgets as a job summary carries them: strings, since a summary is stored and logged as JSON. */
export type BudgetsView = {
  revenueLamports: string;
  burn: { shareBps: number; spent: string; available: string };
  flywheel: { shareBps: number; spent: string; available: string };
};

export function budgetsView(b: Budgets): BudgetsView {
  const share = (s: RowBudget) => ({ shareBps: s.shareBps, spent: s.spent.toString(), available: s.available.toString() });
  return { revenueLamports: b.revenueLamports.toString(), burn: share(b.rows.burn), flywheel: share(b.rows.flywheel) };
}

export type BurnSummary = {
  platformToken: string | null;
  /** Where each budget's buys went this run. */
  destinations: Destinations;
  budgets: BudgetsView;
  /** The Platform Token burn this run, if any. */
  burned: { signature: string; lamports: string; amount: string } | null;
  /** The Platform Token added to its pool as locked liquidity this run, if any: `amount` is the coins that went in. */
  added: { signature: string; lamports: string; amount: string; position: string; feeKey: string } | null;
  /** The Flywheel buys this run, one per coin: burned, or added to the coin's pool where the Flywheel points at liquidity. */
  flywheel: { mint: string; signature: string; lamports: string; amount: string; destination: "burn" | "liquidity" }[];
  /**
   * Coins a budget would have bought but could not: no SOL route (paired with something else), too little budget, or,
   * for liquidity, a pool that cannot take an addition this run.
   */
  skipped: { mint: string; reason: string }[];
  problems: string[];
};

export const PLATFORM_TOKEN_SETTING = "platform_token_mint";
/** How much worse than quoted a buy may fill before it fails and nothing is spent. */
const SLIPPAGE_BPS = 100;

/** The Platform Token, once the operator has named it: Launch #1, fair-launched on our own platform. */
export async function platformToken(db: Db): Promise<PublicKey | null> {
  const [row] = await db.select().from(platformSettings).where(eq(platformSettings.key, PLATFORM_TOKEN_SETTING)).limit(1);
  return row?.value ? new PublicKey(row.value) : null;
}

/**
 * The Flywheel rule, published on the burns page: the top `n` graduated Launches by trading volume over the last 24
 * hours (in Quote Asset terms valued in SOL), each bought with an equal share of the Flywheel budget and burned.
 * Reproducible from indexed trades alone.
 */
export async function flywheelPicks(db: Db, n: number) {
  const rows = await db
    .select({ mint: launches.mint, symbol: launches.symbol, quoteMint: launches.quoteMint })
    .from(graduations)
    .innerJoin(launches, eq(launches.mint, graduations.mint))
    .leftJoin(quoteAssets, eq(quoteAssets.mint, launches.quoteMint))
    .orderBy(
      desc(sql`coalesce((select sum(${trades.quoteAmount}) from ${trades} where ${trades.mint} = ${launches.mint} and ${trades.blockTime} > now() - interval '24 hours'), 0)
        * coalesce(${quoteAssets.priceSol}, 0) / power(10, ${quoteAssets.decimals})`),
      desc(graduations.slot),
    )
    .limit(n);
  return rows;
}

/** One run: burn the Platform Token with the burn budget, then run the Flywheel with its budget. */
export async function runBurns({ db, cfg, operations, routes }: BurnDeps): Promise<BurnSummary> {
  const connection = new Connection(cfg.rpcUrl, "confirmed");
  const token = await platformToken(db);
  const [before, destinations] = await Promise.all([budgets(db), budgetDestinations(db)]);
  const summary: BurnSummary = {
    platformToken: token?.toBase58() ?? null, destinations, budgets: budgetsView(before), burned: null, added: null, flywheel: [], skipped: [], problems: [],
  };
  // Below the minimum a buy isn't worth its network fee, and an addition, a position of its own with its rent and its
  // collections, not worth keeping; the budget waits and grows.
  const minSpend = (budget: keyof Destinations) =>
    destinations[budget] === "liquidity" && cfg.liquidityAddMinLamports > cfg.burnMinSpendLamports ? cfg.liquidityAddMinLamports : cfg.burnMinSpendLamports;
  if (token && before.rows.burn.available >= minSpend("burn")) {
    try {
      if (destinations.burn === "liquidity") {
        const done = await addLiquidity(db, cfg, connection, operations, token, before.rows.burn.available, "burn");
        if ("skipped" in done) summary.skipped.push({ mint: token.toBase58(), reason: done.skipped });
        else summary.added = done;
      } else {
        const done = await buyAndBurn(db, cfg, connection, operations, routes, token, before.rows.burn.available, "burn");
        summary.burned = done ?? null;
        if (!done) summary.skipped.push({ mint: token.toBase58(), reason: "no SOL route to the Platform Token" });
      }
    } catch (e) {
      summary.problems.push(`burn: ${(e as Error).message}`);
    }
  }
  const picks = await flywheelPicks(db, cfg.flywheelTopN);
  if (picks.length && before.rows.flywheel.available >= minSpend("flywheel")) {
    const each = before.rows.flywheel.available / BigInt(picks.length);
    for (const pick of picks) {
      if (each < minSpend("flywheel")) {
        summary.skipped.push({ mint: pick.mint, reason: "the Flywheel budget is too small to split this far" });
        continue;
      }
      try {
        if (destinations.flywheel === "liquidity") {
          const done = await addLiquidity(db, cfg, connection, operations, new PublicKey(pick.mint), each, "flywheel");
          if ("skipped" in done) summary.skipped.push({ mint: pick.mint, reason: `${pick.symbol}: ${done.skipped}` });
          else summary.flywheel.push({ mint: pick.mint, signature: done.signature, lamports: done.lamports, amount: done.amount, destination: "liquidity" });
        } else {
          const done = await buyAndBurn(db, cfg, connection, operations, routes, new PublicKey(pick.mint), each, "flywheel");
          if (done) summary.flywheel.push({ mint: pick.mint, ...done, destination: "burn" });
          else summary.skipped.push({ mint: pick.mint, reason: `no SOL route to ${pick.symbol}` });
        }
      } catch (e) {
        summary.problems.push(`flywheel ${pick.symbol}: ${(e as Error).message}`);
      }
    }
  }
  summary.budgets = budgetsView(await budgets(db));
  if (summary.problems.length) throw new JobFailure(summary.problems.join("; "), summary);
  return summary;
}

/**
 * Buys a coin with at most `lamports` of SOL and burns every coin bought, in one transaction: the swap buys an exact
 * number of coins (what the budget buys at the current price, less the slippage allowance), so the burn knows what to
 * burn, and SOL the swap doesn't need goes back to the wallet. Returns null when there is no route to the coin.
 */
async function buyAndBurn(
  db: Db, cfg: Config, connection: Connection, operations: Keypair, routes: SolRoutes | null, mint: PublicKey, lamports: bigint, kind: "burn" | "flywheel",
) {
  const ops = operations.publicKey;
  const [launch] = await db.select({ pool: launches.pool }).from(launches).where(eq(launches.mint, mint.toBase58())).limit(1);
  const swap = await planSwap(cfg, connection, routes, ops, mint, launch?.pool, lamports);
  if (!swap) return null;
  const { amount, decimals, tokenProgram, build } = swap;
  const account = getAssociatedTokenAddressSync(mint, ops, false, tokenProgram);
  const s: SolSwap = await build(ops, account);
  // A Reward Launch's coin account stays open: the buy's own Reward Tax is withheld in it, which stops it closing, and
  // it is where the Reward Engine keeps the tax it has harvested for the holders. The burn takes only what was bought.
  const taxed = (await transferFeeBps(connection, mint, tokenProgram)) > 0;
  const instructions: TransactionInstruction[] = [
    ...s.setup,
    createAssociatedTokenAccountIdempotentInstruction(ops, account, ops, mint, tokenProgram),
    ...s.swap,
    createBurnCheckedInstruction(account, mint, ops, BigInt(amount.toString()), decimals, [], tokenProgram),
    // Otherwise the wallet never keeps any of the coin: an empty account closes, giving its rent back.
    ...(taxed ? [] : [createCloseAccountInstruction(account, ops, ops, [], tokenProgram)]),
    ...s.cleanup,
  ];
  const tx = await signedTransaction(connection, operations, instructions, s.lookupTables.length ? await lookupTables(connection, s.lookupTables) : []);
  await connection.sendRawTransaction(tx.serialized, { preflightCommitment: "confirmed" });
  await landed(connection, tx, `${kind} of ${mint.toBase58()}`);
  const recorded = await recordBurn(db, cfg, tx.signature, kind, mint, ops);
  return { signature: tx.signature, lamports: recorded.lamports.toString(), amount: recorded.amount.toString() };
}

async function lookupTables(connection: Connection, addresses: PublicKey[]) {
  const tables = await Promise.all(addresses.map((a) => connection.getAddressLookupTable(a, { commitment: "confirmed" })));
  return tables.flatMap((t) => (t.value ? [t.value] : []));
}

type PlannedSwap = {
  /** Coins the swap buys exactly, and the burn burns. */
  amount: BN;
  decimals: number;
  tokenProgram: PublicKey;
  build: (trader: PublicKey, destination: PublicKey) => Promise<SolSwap>;
};

/**
 * How to buy the coin with SOL, always in the coin's own graduated pool, for an exact number of coins so the burn knows
 * what to burn. A coin paired with SOL is bought there directly. A coin paired with another Quote Asset takes two steps
 * in the one transaction: the route source (Jupiter on mainnet) swaps the budget into the Quote Asset, in the wallet's
 * own account for it, and the pool then sells the coins for no more than the least the route delivers. The route
 * never buys a coin itself, so no coin is left unburned; the Quote Asset the swap delivers beyond what the pool took
 * stays in the wallet, outside the Ledger's revenue, and no sweep takes it. Null when there is no such way.
 */
async function planSwap(
  cfg: Config, connection: Connection, routes: SolRoutes | null, ops: PublicKey, mint: PublicKey, pool: string | undefined, lamports: bigint,
): Promise<PlannedSwap | null> {
  if (!pool) return null;
  const budget = new BN(lamports.toString());
  const curve = await loadCurve(connection, new PublicKey(pool));
  if (!curve || curve.status !== "graduated") return null;
  const market = await loadPool(connection, await graduationPoolAddress(connection, cfg.cpmm, curve));
  if (!market || !market.swapEnabled || market.chainTime < market.openTime) return null;
  const { base, quote } = poolSides(market, mint);
  const least = (coins: BN) => coins.muln(10_000 - SLIPPAGE_BPS).divn(10_000);
  if (quote.mint.equals(WSOL_MINT)) {
    const bought = poolSwap(market, WSOL_MINT, budget).amountOut;
    if (bought.isZero()) return null;
    const amount = least(bought);
    const exact = poolSwapExactOut(market, WSOL_MINT, amount);
    if (!exact || exact.amountIn.gt(budget)) return null;
    return {
      amount,
      decimals: base.decimals,
      tokenProgram: base.program,
      build: cpmmSolSwap(connection, { cpmm: cfg.cpmm, pool: market, amountOut: amount, maxAmountIn: budget }),
    };
  }
  // A Quote Asset with a transfer fee delivers less than the route promised, which the pool's limit can't allow for.
  if (!routes || (await transferFeeBps(connection, quote.mint, quote.program)) > 0) return null;
  const route = await routes.swapIn({ mint: quote.mint, tokenProgram: quote.program }, budget, ops).catch(() => null);
  if (!route || route.minOut.isZero()) return null;
  const bought = poolSwap(market, quote.mint, route.minOut).amountOut;
  if (bought.isZero()) return null;
  const amount = least(bought);
  const exact = poolSwapExactOut(market, quote.mint, amount);
  if (!exact || exact.amountIn.gt(route.minOut)) return null;
  return {
    amount,
    decimals: base.decimals,
    tokenProgram: base.program,
    build: async (trader, destination) => {
      const s = await route.swap();
      const buy = swapBaseOutputIx(cfg.cpmm, market, {
        payer: trader, input: quote, output: base, inputAccount: routedQuoteAccount(trader, quote.mint, quote.program), outputAccount: destination,
        amountOut: amount, maxAmountIn: route.minOut,
      });
      return { ...s, swap: [...s.swap, buy], lookupTables: [cfg.lookupTable, ...s.lookupTables] };
    },
  };
}
