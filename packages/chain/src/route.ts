import { ComputeBudgetProgram, PublicKey, type Connection, type TransactionInstruction } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction, getAssociatedTokenAddressSync, getMint,
  getTransferFeeConfig,
} from "@solana/spl-token";
import BN from "bn.js";
import { poolSides, poolTradeIx, swapBaseOutputIx, type Pool } from "./cpmm";
import { WSOL_MINT } from "./programs";
import { curveTradeIx, type Curve } from "./trade";
import { steppedTransaction, temporaryTokenAccount, type PreparedTrade } from "./wallet";

/**
 * Buying a Launch's coin with SOL when its Quote Asset is something else: one transaction that swaps SOL for exactly the
 * Quote Asset the trade spends, then trades it. The swap and the trade are separate steps with separate slippage limits,
 * and the Quote Asset passes through a temporary account that must end empty, so the transaction either does both or
 * nothing, and never leaves Quote Asset behind in the wallet.
 */

/** The swap that turns SOL into an exact amount of a Quote Asset, delivered into `destination`, as instructions. */
export type SolSwap = {
  /** Wrapping SOL and opening accounts the swap needs. */
  setup: TransactionInstruction[];
  swap: TransactionInstruction[];
  /** Unwrapping what SOL the swap didn't use, back into the wallet. */
  cleanup: TransactionInstruction[];
  /** Address lookup tables the swap's accounts are in, if any. */
  lookupTables: PublicKey[];
  computeUnits: number;
};

/** Builds a SOL swap for a trader into a token account; the route source decides how. */
export type SolSwapBuilder = (trader: PublicKey, destination: PublicKey) => Promise<SolSwap>;

const BPS = 10_000;

/**
 * Splits a slippage tolerance between the swap (which may cost `route` bps more SOL) and the trade (which may give
 * `trade` bps fewer coins), as evenly as whole basis points allow, so that paying the most SOL and getting the fewest
 * coins together is still within `bps` of the quoted SOL per coin:
 * (1 + route) / (1 - trade) <= 1 / (1 - bps).
 */
export function splitSlippage(bps: number): { route: number; trade: number } {
  const route = Math.floor(bps / 2);
  // The largest trade tolerance with (BPS - trade) * BPS >= (BPS - bps) * (BPS + route).
  const need = (BPS - bps) * (BPS + route);
  const trade = BPS - Math.ceil(need / BPS);
  return { route, trade: Math.max(trade, 0) };
}

/**
 * The limits of a buy paid with SOL, rounded so the split never adds up to more than the trader allowed: the most SOL
 * the swap may take (`solIn` plus `route` bps, rounded down) and the fewest coins the trade may give (`coins` less
 * `trade` bps, rounded up).
 */
export function routedLimits(solIn: BN, coins: BN, split: { route: number; trade: number }) {
  return {
    maxSolIn: solIn.muln(BPS + split.route).divn(BPS),
    minCoins: coins.muln(BPS - split.trade).addn(BPS - 1).divn(BPS),
  };
}

/**
 * The highest Token-2022 transfer fee a mint is set to charge, now or from its next epoch, in basis points; 0 for SPL
 * Token mints and Token-2022 mints without one.
 * A buy paid with SOL can't route through such a mint yet: the fee is withheld in the temporary account the Quote Asset
 * passes through, which can't then be closed, and the curve would get less than the swap bought (issue #29).
 */
export async function transferFeeBps(connection: Connection, mint: PublicKey, tokenProgram: PublicKey) {
  if (!tokenProgram.equals(TOKEN_2022_PROGRAM_ID)) return 0;
  const config = getTransferFeeConfig(await getMint(connection, mint, "confirmed", TOKEN_2022_PROGRAM_ID));
  if (!config) return 0;
  return Math.max(config.olderTransferFee.transferFeeBasisPoints, config.newerTransferFee.transferFeeBasisPoints);
}

/** A SOL swap through one Raydium CPMM pool of SOL against the Quote Asset: `swap_base_output` for exactly `amountOut`. */
export function cpmmSolSwap(
  connection: Connection, s: { cpmm: PublicKey; pool: Pool; amountOut: BN; maxAmountIn: BN },
): SolSwapBuilder {
  return async (trader, destination) => {
    const wsol = s.pool.tokens.find((t) => t.mint.equals(WSOL_MINT));
    const quote = s.pool.tokens.find((t) => !t.mint.equals(WSOL_MINT));
    if (!wsol || !quote) throw new Error(`pool ${s.pool.address.toBase58()} does not trade SOL`);
    const source = await temporaryTokenAccount(connection, { owner: trader, mint: WSOL_MINT, tokenProgram: TOKEN_PROGRAM_ID, lamports: s.maxAmountIn });
    return {
      setup: source.open,
      swap: [
        swapBaseOutputIx(s.cpmm, s.pool, {
          payer: trader, input: wsol, output: quote, inputAccount: source.address, outputAccount: destination,
          amountOut: s.amountOut, maxAmountIn: s.maxAmountIn,
        }),
      ],
      cleanup: [source.close],
      lookupTables: [],
      computeUnits: 100_000,
    };
  };
}

/** Where the bought Quote Asset is spent: the Launch's curve, or its CPMM pool once it has graduated. */
export type RoutedMarket =
  | { venue: "curve"; program: PublicKey; curve: Curve }
  | { venue: "pool"; cpmm: PublicKey; pool: Pool; baseMint: PublicKey; baseTokenProgram: PublicKey };

export type RoutedBuyRequest = {
  trader: PublicKey;
  market: RoutedMarket;
  quoteMint: PublicKey;
  quoteTokenProgram: PublicKey;
  /** Quote Asset the swap buys and the trade spends, exactly. */
  quoteAmount: BN;
  /** The least number of coins the trade may give. */
  minAmountOut: BN;
  swap: SolSwapBuilder;
  /** Lookup tables for the trade's shared accounts; the swap brings its own. */
  lookupTables: PublicKey[];
};

const CURVE_COMPUTE_UNITS = 200_000;
const POOL_COMPUTE_UNITS = 150_000;
const ACCOUNTS_COMPUTE_UNITS = 60_000;

/**
 * Builds a buy paid with SOL server-side (ADR 0003); the trader is the only signer.
 * The Quote Asset lands in a temporary account the trade spends from and which is closed at the end, so the trader's own
 * Quote Asset balance is never touched, and if the trade could not spend all of it, the close fails the transaction.
 */
export async function prepareRoutedBuy(connection: Connection, r: RoutedBuyRequest): Promise<PreparedTrade> {
  const { trader, market } = r;
  const quote = await temporaryTokenAccount(connection, { owner: trader, mint: r.quoteMint, tokenProgram: r.quoteTokenProgram });
  const swap = await r.swap(trader, quote.address);
  let baseMint: PublicKey;
  let baseTokenProgram: PublicKey;
  let trade: TransactionInstruction;
  if (market.venue === "curve") {
    baseMint = market.curve.baseMint;
    baseTokenProgram = market.curve.baseTokenProgram;
  } else {
    baseMint = market.baseMint;
    baseTokenProgram = market.baseTokenProgram;
    if (!poolSides(market.pool, baseMint).quote.mint.equals(r.quoteMint)) throw new Error("the pool does not trade this Quote Asset");
  }
  const base = getAssociatedTokenAddressSync(baseMint, trader, false, baseTokenProgram);
  const t = { trader, side: "buy" as const, baseAccount: base, quoteAccount: quote.address, amountIn: r.quoteAmount, minAmountOut: r.minAmountOut };
  if (market.venue === "curve") trade = curveTradeIx(market.program, market.curve, t);
  else trade = poolTradeIx(market.cpmm, market.pool, baseMint, t);
  const units = swap.computeUnits + (market.venue === "curve" ? CURVE_COMPUTE_UNITS : POOL_COMPUTE_UNITS) + ACCOUNTS_COMPUTE_UNITS;
  return steppedTransaction(
    connection,
    trader,
    [
      {
        step: "setup",
        instructions: [
          ComputeBudgetProgram.setComputeUnitLimit({ units }),
          ...quote.open,
          createAssociatedTokenAccountIdempotentInstruction(trader, base, trader, baseMint, baseTokenProgram),
          ...swap.setup,
        ],
      },
      { step: "route", instructions: swap.swap },
      { step: "trade", instructions: [trade] },
      { step: "cleanup", instructions: [quote.close, ...swap.cleanup] },
    ],
    [...r.lookupTables, ...swap.lookupTables],
  );
}
