// Burn and Flywheel (#18): on a public schedule, 60% of platform revenue buys the Platform Token and burns it, and 5%
// buys the top Launches by the published rule and burns them. Budgets come from the Ledger, so every SOL spent is
// accounted for against revenue already recorded, and every buy and burn goes on the Ledger with its transaction.
import { Connection, PublicKey, type Keypair, type TransactionInstruction } from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction, createBurnCheckedInstruction, createCloseAccountInstruction, getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import BN from "bn.js";
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import {
  cpmmSolSwap, graduationPoolAddress, loadCurve, loadPool, poolSides, poolSwap, poolSwapExactOut, routedQuoteAccount, signedTransaction,
  swapBaseOutputIx, transferFeeBps, WSOL_MINT, type SolSwap,
} from "@launchpad/chain";
import { graduations, launches, ledgerEntries, platformSettings, quoteAssets, trades, type Db } from "@launchpad/db";
import type { Config } from "../env";
import { JobFailure } from "../jobs";
import type { SolRoutes } from "../solRoutes";
import { creatorMoney } from "../fees/creatorShares";
import { recordBurn } from "./decode";

export type BurnDeps = { db: Db; cfg: Config; operations: Keypair; routes: SolRoutes | null };

/** What the Burn and Flywheel have to spend, in lamports, from the Ledger. */
export type Budgets = {
  /**
   * Every Platform Fee, pool fee and Fee Key collection so far, less what of it is the Creators' (ADR 0009), valued in
   * SOL at the Quote Registry's latest prices.
   */
  revenueLamports: bigint;
  burn: { shareBps: number; spent: bigint; available: bigint };
  flywheel: { shareBps: number; spent: bigint; available: bigint };
};

/** Budgets as a job summary carries them: strings, since a summary is stored and logged as JSON. */
export type BudgetsView = {
  revenueLamports: string;
  burn: { shareBps: number; spent: string; available: string };
  flywheel: { shareBps: number; spent: string; available: string };
};

export function budgetsView(b: Budgets): BudgetsView {
  const share = (s: Budgets["burn"]) => ({ shareBps: s.shareBps, spent: s.spent.toString(), available: s.available.toString() });
  return { revenueLamports: b.revenueLamports.toString(), burn: share(b.burn), flywheel: share(b.flywheel) };
}

export type BurnSummary = {
  platformToken: string | null;
  budgets: BudgetsView;
  /** The Platform Token burn this run, if any. */
  burned: { signature: string; lamports: string; amount: string } | null;
  /** The Flywheel buys and burns this run, one per coin. */
  flywheel: { mint: string; signature: string; lamports: string; amount: string }[];
  /** Coins the Flywheel rule picked but could not buy: no SOL route (paired with something else), or too little budget. */
  skipped: { mint: string; reason: string }[];
  problems: string[];
};

export const PLATFORM_TOKEN_SETTING = "platform_token_mint";
/** How much worse than quoted a buy may fill before it fails and nothing is spent. */
const SLIPPAGE_BPS = 100;
const POLL_MS = 400;
const LAMPORTS_PER_SOL = 1_000_000_000n;

/** The Platform Token, once the operator has named it: Launch #1, fair-launched on our own platform. */
export async function platformToken(db: Db): Promise<PublicKey | null> {
  const [row] = await db.select().from(platformSettings).where(eq(platformSettings.key, PLATFORM_TOKEN_SETTING)).limit(1);
  return row?.value ? new PublicKey(row.value) : null;
}

/**
 * Budgets from the Ledger: revenue entries, net of the Creators' share, valued in SOL at the registry's latest price per Quote Asset (SOL at par;
 * an asset without a price, or a coin a Fee Key paid out, counts for nothing), less what earlier burns spent.
 */
export async function budgets(db: Db, cfg: Config): Promise<Budgets> {
  const collected = await db
    .select({ mint: ledgerEntries.assetMint, decimals: ledgerEntries.assetDecimals, amount: sql<string>`sum(${ledgerEntries.amount})::text` })
    .from(ledgerEntries)
    .where(inArray(ledgerEntries.kind, ["platform_fee", "pool_fee", "fee_key"]))
    .groupBy(ledgerEntries.assetMint, ledgerEntries.assetDecimals);
  const priced = new Map(
    (await db.select({ mint: quoteAssets.mint, priceSol: quoteAssets.priceSol, decimals: quoteAssets.decimals }).from(quoteAssets).where(isNotNull(quoteAssets.priceSol)))
      .map((q) => [q.mint, q]),
  );
  // What was collected for Creators (ADR 0009) is theirs, forwarded or not, and no part of any budget.
  const creators = await creatorMoney(db);
  let revenue = 0n;
  for (const c of collected) {
    const gross = BigInt(c.amount);
    const theirs = creators.get(c.mint)?.accrued ?? 0n;
    const amount = gross > theirs ? gross - theirs : 0n;
    if (c.mint === WSOL_MINT.toBase58()) {
      revenue += amount;
      continue;
    }
    const q = priced.get(c.mint);
    if (!q) continue;
    const [whole, fraction = ""] = q.priceSol!.split(".");
    const price = BigInt(whole! + fraction);
    revenue += (amount * price * LAMPORTS_PER_SOL) / (10n ** BigInt(q.decimals) * 10n ** BigInt(fraction.length));
  }
  const spent = async (kind: string) => {
    const [row] = await db
      .select({ lamports: sql<string>`coalesce(sum(${ledgerEntries.amount}), 0)::text` })
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.kind, kind), eq(ledgerEntries.assetMint, WSOL_MINT.toBase58())));
    return BigInt(row!.lamports);
  };
  const share = (bps: number, used: bigint) => {
    const total = (revenue * BigInt(bps)) / 10_000n;
    return { shareBps: bps, spent: used, available: total > used ? total - used : 0n };
  };
  return {
    revenueLamports: revenue,
    burn: share(cfg.burnShareBps, await spent("burn")),
    flywheel: share(cfg.flywheelShareBps, await spent("flywheel")),
  };
}

/** SOL the Fee Collector's sweep must leave in the operations wallet: what the Burn and Flywheel have not spent yet. */
export async function reservedLamports(db: Db, cfg: Config) {
  const b = await budgets(db, cfg);
  return b.burn.available + b.flywheel.available;
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
  const before = await budgets(db, cfg);
  const summary: BurnSummary = { platformToken: token?.toBase58() ?? null, budgets: budgetsView(before), burned: null, flywheel: [], skipped: [], problems: [] };
  // Below the minimum a buy isn't worth its network fee; the budget waits.
  const minSpend = cfg.burnMinSpendLamports;
  if (token && before.burn.available >= minSpend) {
    try {
      const done = await buyAndBurn(db, cfg, connection, operations, routes, token, before.burn.available, "burn");
      summary.burned = done ?? null;
      if (!done) summary.skipped.push({ mint: token.toBase58(), reason: "no SOL route to the Platform Token" });
    } catch (e) {
      summary.problems.push(`burn: ${(e as Error).message}`);
    }
  }
  const picks = await flywheelPicks(db, cfg.flywheelTopN);
  if (picks.length && before.flywheel.available >= minSpend) {
    const each = before.flywheel.available / BigInt(picks.length);
    for (const pick of picks) {
      if (each < minSpend) {
        summary.skipped.push({ mint: pick.mint, reason: "the Flywheel budget is too small to split this far" });
        continue;
      }
      try {
        const done = await buyAndBurn(db, cfg, connection, operations, routes, new PublicKey(pick.mint), each, "flywheel");
        if (done) summary.flywheel.push({ mint: pick.mint, ...done });
        else summary.skipped.push({ mint: pick.mint, reason: `no SOL route to ${pick.symbol}` });
      } catch (e) {
        summary.problems.push(`flywheel ${pick.symbol}: ${(e as Error).message}`);
      }
    }
  }
  summary.budgets = budgetsView(await budgets(db, cfg));
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
  for (;;) {
    const { value: [status] } = await connection.getSignatureStatuses([tx.signature]);
    if (status?.err) throw new Error(`${kind} of ${mint.toBase58()} failed on-chain: ${JSON.stringify(status.err)}`);
    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") break;
    if ((await connection.getBlockHeight("confirmed")) > tx.lastValidBlockHeight) throw new Error(`${kind} of ${mint.toBase58()} expired unlanded`);
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
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
