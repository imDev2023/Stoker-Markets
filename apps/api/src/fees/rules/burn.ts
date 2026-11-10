// The `burn` rule (ADR 0011): a coin's Creator Earnings buy the coin in its own market, on the curve before
// Graduation and in its pool after, and burn every coin bought, in one transaction.
//
// The coins never touch the operations wallet's own account of the coin. That account is shared: it holds the Reward
// Tax harvested for a Reward Launch's holders, and a standard coin's pool fees waiting for the sweep, and a burn out of
// it that was one coin off would destroy money that is not the rule's. So the buy delivers into an account that lives
// only inside the transaction, the burn empties it and it is closed again, which the token program refuses unless it
// is empty: the transaction burns exactly what the buy delivered, or does nothing at all. That also covers the one case
// where an exact buy is not exact, a curve with fewer coins left than were asked for, which LaunchLab fills with what
// is left instead of failing.
import { PublicKey, type Connection, type TransactionInstruction } from "@solana/web3.js";
import { createBurnCheckedInstruction, createHarvestWithheldTokensToMintInstruction, getAssociatedTokenAddressSync } from "@solana/spl-token";
import BN from "bn.js";
import {
  buyExactOutInstructions, cpmmSolSwap, graduationPoolAddress, loadCurve, loadPool, minAmountOut, poolSides, poolSwap, poolSwapExactOut, quoteBuyExactOut,
  quoteTrade, swapBaseOutputIx, temporaryTokenAccount, WSOL_MINT, type Curve, type RawTransaction,
} from "@launchpad/chain";
import type { Config } from "../../env";
import { decodeBurn } from "../../burn/decode";
import type { RulePot } from "../creatorShares";
import type { BuybackRow } from "./buyback";
import { isSkipped, type BuybackOutcome, type BuybackPlan, type RuleDeps, type Skipped } from "./types";

/** How much worse than priced a buy may fill before it fails and nothing is spent. */
const SLIPPAGE_BPS = 100;

/** A buy of an exact number of coins, priced and ready to be built once it knows where the coins arrive. */
type PlannedBuy = {
  venue: "curve" | "pool";
  market: PublicKey;
  /** Coins that reach the account the buy delivers into, any Reward Tax already withheld: what the burn destroys. */
  coins: BN;
  decimals: number;
  tokenProgram: PublicKey;
  /** The coin carries a Reward Tax, so the buy leaves a withheld share of it in the account it delivers into. */
  taxed: boolean;
  instructions: (destination: PublicKey) => Promise<TransactionInstruction[]>;
};

/**
 * Plans one buyback and burn for the coin with at most `amount` of its Quote Asset, which the operations wallet holds
 * for it: an exact number of coins bought (what the amount buys at the current price, less the slippage allowance), so
 * the burn knows what to burn. Skipped, with the reason, when the market cannot take a buy right now.
 */
export async function planBurn({ cfg, operations, connection }: RuleDeps, pot: RulePot, amount: bigint): Promise<BuybackPlan | Skipped> {
  const ops = operations.publicKey;
  const mint = new PublicKey(pot.mint);
  const curve = await loadCurve(connection, new PublicKey(pot.curve));
  if (!curve) throw new Error(`launch ${pot.mint} has no curve account at ${pot.curve}`);
  if (curve.status === "graduating") return { skipped: "the curve sold out and Raydium is moving the coin to its pool" };
  const budget = new BN(amount.toString());
  const buy = curve.status === "live" ? planCurveBuy(cfg, connection, ops, curve, budget) : await planPoolBuy(cfg, connection, ops, curve, budget);
  if (isSkipped(buy)) return buy;

  const account = await temporaryTokenAccount(connection, { owner: ops, mint, tokenProgram: buy.tokenProgram });
  return {
    venue: buy.venue,
    market: buy.market,
    // The buy's own limit: it fails on-chain rather than take more of the Quote Asset than the pot holds.
    budget: amount,
    instructions: [
      ...account.open,
      ...(await buy.instructions(account.address)),
      createBurnCheckedInstruction(account.address, mint, ops, BigInt(buy.coins.toString()), buy.decimals, [], buy.tokenProgram),
      // The buy's own Reward Tax is withheld in the account, which cannot close while it holds any. Harvesting moves it
      // to the mint, where the Reward Engine collects it for the holders with the tax of every other trade.
      ...(buy.taxed ? [createHarvestWithheldTokensToMintInstruction(mint, [account.address], buy.tokenProgram)] : []),
      account.close,
    ],
  };
}

/**
 * A buy on the curve: LaunchLab's exact-out buy, with the Platform Fee like any trade. The Quote Asset comes from the
 * wallet's own account of it, SOL through a wrapped-SOL account that lives inside the transaction.
 */
function planCurveBuy(cfg: Config, connection: Connection, ops: PublicKey, curve: Curve, budget: BN): PlannedBuy | Skipped {
  if (curve.reserves.realBase.gte(curve.reserves.totalBaseSell)) return { skipped: "the curve has no coins left to sell" };
  const fees = { quote: curve.quoteTransferFee, base: curve.baseTransferFee };
  const coins = minAmountOut(quoteTrade(curve.reserves, curve.rates, "buy", budget, fees).amountOut, SLIPPAGE_BPS);
  if (coins.isZero()) return { skipped: "the pot buys no coins at the curve's price" };
  const exact = quoteBuyExactOut(curve.reserves, curve.rates, coins, fees);
  if (!exact) return { skipped: "the curve has no coins left to sell" };
  if (exact.amountIn.gt(budget)) return { skipped: "the pot is too small to buy an exact number of coins within it" };
  return {
    venue: "curve",
    market: curve.pool,
    coins,
    decimals: curve.baseDecimals,
    tokenProgram: curve.baseTokenProgram,
    taxed: curve.baseTransferFee !== null,
    instructions: (destination) =>
      buyExactOutInstructions(connection, { program: cfg.launchlab, curve, trader: ops, amountOut: coins, maxAmountIn: budget, baseAccount: destination }),
  };
}

/** A buy in the coin's pool after Graduation: the CPMM's exact-out swap, paid as on the curve. */
async function planPoolBuy(cfg: Config, connection: Connection, ops: PublicKey, curve: Curve, budget: BN): Promise<PlannedBuy | Skipped> {
  const pool = await loadPool(connection, await graduationPoolAddress(connection, cfg.cpmm, curve));
  if (!pool) throw new Error(`launch ${curve.baseMint.toBase58()} is migrated but has no pool`);
  if (!pool.swapEnabled) return { skipped: "Raydium has paused trading in the pool" };
  if (pool.chainTime < pool.openTime) return { skipped: "the pool has not opened yet" };
  const { base, quote } = poolSides(pool, curve.baseMint);
  const coins = minAmountOut(poolSwap(pool, quote.mint, budget).amountOut, SLIPPAGE_BPS);
  if (coins.isZero()) return { skipped: "the pot buys no coins at the pool's price" };
  const exact = poolSwapExactOut(pool, quote.mint, coins);
  if (!exact) return { skipped: "the pool holds too few coins" };
  if (exact.amountIn.gt(budget)) return { skipped: "the pot is too small to buy an exact number of coins within it" };
  return {
    venue: "pool",
    market: pool.address,
    coins,
    decimals: base.decimals,
    tokenProgram: base.program,
    taxed: base.transferFee !== null,
    instructions: async (destination) => {
      if (quote.mint.equals(WSOL_MINT)) {
        const s = await cpmmSolSwap(connection, { cpmm: cfg.cpmm, pool, amountOut: coins, maxAmountIn: budget })(ops, destination);
        return [...s.setup, ...s.swap, ...s.cleanup];
      }
      return [
        swapBaseOutputIx(cfg.cpmm, pool, {
          payer: ops, input: quote, output: base, inputAccount: getAssociatedTokenAddressSync(quote.mint, ops, false, quote.program), outputAccount: destination,
          amountOut: coins, maxAmountIn: budget,
        }),
      ];
    },
  };
}

/** What a landed burn did: the coins its burn instruction destroyed, which are all it bought. */
export function decodeBurnRun(raw: RawTransaction, operationsWallet: PublicKey, row: BuybackRow): BuybackOutcome {
  const burned = decodeBurn(raw, operationsWallet, new PublicKey(row.mint))?.amount ?? 0n;
  return { coins: burned, burned };
}
