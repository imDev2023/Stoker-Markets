import { ComputeBudgetProgram, type Connection, type PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import type BN from "bn.js";
import { launchlabCoder } from "./coder";
import type { CurveReserves, FeeRates, Side } from "./curve";
import { tradeExactInIx } from "./instructions";
import { tradeAccounts, unsignedTransaction, type UnsignedTransaction } from "./wallet";

/** Where a curve is in its life: trading, sold out and waiting for Raydium to migrate it, or migrated to a CPMM pool. */
export type CurveStatus = "live" | "graduating" | "graduated";
const CURVE_STATUS: readonly CurveStatus[] = ["live", "graduating", "graduated"];

/** Everything needed to price and build a trade on one Launch's curve, read from the chain. */
export type Curve = {
  pool: PublicKey;
  status: CurveStatus;
  reserves: CurveReserves;
  rates: FeeRates;
  graduationTarget: BN;
  baseDecimals: number;
  quoteDecimals: number;
  globalConfig: PublicKey;
  platformConfig: PublicKey;
  creator: PublicKey;
  baseMint: PublicKey;
  quoteMint: PublicKey;
  baseTokenProgram: PublicKey;
  quoteTokenProgram: PublicKey;
};

type PoolState = {
  status: number; base_decimals: number; quote_decimals: number; token_program_flag: number;
  virtual_base: BN; virtual_quote: BN; real_base: BN; real_quote: BN; total_base_sell: BN; total_quote_fund_raising: BN;
  global_config: PublicKey; platform_config: PublicKey; creator: PublicKey; base_mint: PublicKey; quote_mint: PublicKey;
};

/** Reads a curve with its current fee rates: Raydium's from the GlobalConfig, ours from the PlatformConfig. Null if there is no pool. */
export async function loadCurve(connection: Connection, pool: PublicKey): Promise<Curve | null> {
  const account = await connection.getAccountInfo(pool, "confirmed");
  if (!account) return null;
  const s = launchlabCoder.accounts.decode("PoolState", account.data) as PoolState;
  const [global, platform] = await connection.getMultipleAccountsInfo([s.global_config, s.platform_config], "confirmed");
  if (!global || !platform) throw new Error(`curve ${pool.toBase58()} points at a missing config account`);
  const g = launchlabCoder.accounts.decode("GlobalConfig", global.data) as { trade_fee_rate: BN };
  const p = launchlabCoder.accounts.decode("PlatformConfig", platform.data) as { fee_rate: BN; creator_fee_rate: BN };
  const tokenProgram = (bit: number) => (s.token_program_flag & bit ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID);
  return {
    pool,
    status: CURVE_STATUS[s.status] ?? "graduated",
    reserves: {
      virtualBase: s.virtual_base, virtualQuote: s.virtual_quote, realBase: s.real_base, realQuote: s.real_quote,
      totalBaseSell: s.total_base_sell,
    },
    rates: { protocol: g.trade_fee_rate, platform: p.fee_rate, creator: p.creator_fee_rate },
    graduationTarget: s.total_quote_fund_raising,
    baseDecimals: s.base_decimals,
    quoteDecimals: s.quote_decimals,
    globalConfig: s.global_config,
    platformConfig: s.platform_config,
    creator: s.creator,
    baseMint: s.base_mint,
    quoteMint: s.quote_mint,
    baseTokenProgram: tokenProgram(1),
    quoteTokenProgram: tokenProgram(2),
  };
}

export type TradeRequest = {
  program: PublicKey;
  curve: Curve;
  trader: PublicKey;
  side: Side;
  amountIn: BN;
  minAmountOut: BN;
};

export type PreparedTrade = UnsignedTransaction;

const TRADE_COMPUTE_UNITS = 200_000;

/** Builds a buy or sell on the curve server-side (ADR 0003). The trader is the only signer. */
export async function prepareTrade(connection: Connection, r: TradeRequest): Promise<PreparedTrade> {
  const { curve: c, trader, side } = r;
  const accounts = await tradeAccounts(connection, { ...c, trader, side, amountIn: r.amountIn });
  return unsignedTransaction(connection, trader, [
    ComputeBudgetProgram.setComputeUnitLimit({ units: TRADE_COMPUTE_UNITS }),
    ...accounts.setup,
    tradeExactInIx(side, {
      program: r.program,
      trader,
      pool: c.pool,
      globalConfig: c.globalConfig,
      platformConfig: c.platformConfig,
      creator: c.creator,
      baseMint: c.baseMint,
      quoteMint: c.quoteMint,
      baseTokenProgram: c.baseTokenProgram,
      quoteTokenProgram: c.quoteTokenProgram,
      traderBaseAccount: accounts.base,
      traderQuoteAccount: accounts.quote,
      amountIn: r.amountIn,
      minAmountOut: r.minAmountOut,
    }),
    ...accounts.cleanup,
  ]);
}
