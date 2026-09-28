import { ComputeBudgetProgram, type Connection, type PublicKey, type TransactionInstruction } from "@solana/web3.js";
import { createAssociatedTokenAccountIdempotentInstruction, getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import type BN from "bn.js";
import { launchlabCoder } from "./coder";
import type { CurveReserves, FeeRates, Side } from "./curve";
import { tradeExactInIx } from "./instructions";
import { transferFeeOf, type TransferFee } from "./transferFee";
import { steppedTransaction, tradeAccounts, type PreparedTrade } from "./wallet";

/** Where a curve is in its life: trading, sold out and waiting for Raydium to migrate it, or migrated to a CPMM pool. */
export type CurveStatus = "live" | "graduating" | "graduated";
const CURVE_STATUS: readonly CurveStatus[] = ["live", "graduating", "graduated"];

/** Everything needed to price and build a trade on one Launch's curve, read from the chain. */
export type Curve = {
  pool: PublicKey;
  status: CurveStatus;
  reserves: CurveReserves;
  rates: FeeRates;
  /** The most a referred trade may pay its referrer, in the 1e6 denominator: the GlobalConfig's `max_share_fee_rate`, 0 on most. */
  maxShareFeeRate: BN;
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
  /** The Reward Tax of a Reward Launch's coin; null for a standard coin. */
  baseTransferFee: TransferFee | null;
  /** The Quote Asset issuer's transfer fee; null for SPL Token and untaxed Token-2022 Quote Assets. */
  quoteTransferFee: TransferFee | null;
};

type PoolState = {
  status: number; base_decimals: number; quote_decimals: number; token_program_flag: number;
  virtual_base: BN; virtual_quote: BN; real_base: BN; real_quote: BN; total_base_sell: BN; total_quote_fund_raising: BN;
  global_config: PublicKey; platform_config: PublicKey; creator: PublicKey; base_mint: PublicKey; quote_mint: PublicKey;
};

/**
 * The fee rates a curve trades at right now, Raydium's from the GlobalConfig and ours from the PlatformConfig, plus the
 * GlobalConfig's migrate fee, which shapes a new curve.
 */
export async function loadFeeRates(connection: Connection, globalConfig: PublicKey, platformConfig: PublicKey) {
  const [global, platform] = await connection.getMultipleAccountsInfo([globalConfig, platformConfig], "confirmed");
  if (!global) throw new Error(`GlobalConfig ${globalConfig.toBase58()} does not exist`);
  if (!platform) throw new Error(`PlatformConfig ${platformConfig.toBase58()} does not exist`);
  const g = launchlabCoder.accounts.decode("GlobalConfig", global.data) as { trade_fee_rate: BN; migrate_fee: BN; max_share_fee_rate: BN };
  const p = launchlabCoder.accounts.decode("PlatformConfig", platform.data) as { fee_rate: BN; creator_fee_rate: BN };
  const rates: FeeRates = { protocol: g.trade_fee_rate, platform: p.fee_rate, creator: p.creator_fee_rate };
  return { rates, migrateFee: g.migrate_fee, maxShareFeeRate: g.max_share_fee_rate };
}

/**
 * Reads a curve with its current fee rates (Raydium's from the GlobalConfig, ours from the PlatformConfig) and the
 * transfer fees of its two mints, which every quote must allow for. Null if there is no pool.
 */
export async function loadCurve(connection: Connection, pool: PublicKey): Promise<Curve | null> {
  const account = await connection.getAccountInfo(pool, "confirmed");
  if (!account) return null;
  const s = launchlabCoder.accounts.decode("PoolState", account.data) as PoolState;
  const [{ rates, maxShareFeeRate }, mints, { epoch }] = await Promise.all([
    loadFeeRates(connection, s.global_config, s.platform_config),
    connection.getMultipleAccountsInfo([s.base_mint, s.quote_mint], "confirmed"),
    connection.getEpochInfo("confirmed"),
  ]);
  const tokenProgram = (bit: number) => (s.token_program_flag & bit ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID);
  return {
    pool,
    status: CURVE_STATUS[s.status] ?? "graduated",
    reserves: {
      virtualBase: s.virtual_base, virtualQuote: s.virtual_quote, realBase: s.real_base, realQuote: s.real_quote,
      totalBaseSell: s.total_base_sell,
    },
    rates,
    maxShareFeeRate,
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
    baseTransferFee: transferFeeOf(s.base_mint, mints[0] ?? null, epoch),
    quoteTransferFee: transferFeeOf(s.quote_mint, mints[1] ?? null, epoch),
  };
}

export type TradeRequest = {
  program: PublicKey;
  curve: Curve;
  trader: PublicKey;
  side: Side;
  amountIn: BN;
  minAmountOut: BN;
  /** The referrer and the share fee rate a referred trade pays them; the trader opens the referrer's Quote Asset account if need be. */
  referral?: { referrer: PublicKey; rate: BN } | null;
};

const TRADE_COMPUTE_UNITS = 200_000;

/** Builds a buy or sell on the curve server-side (ADR 0003). The trader is the only signer. */
export async function prepareTrade(connection: Connection, r: TradeRequest): Promise<PreparedTrade> {
  const accounts = await tradeAccounts(connection, { ...r.curve, trader: r.trader, side: r.side, amountIn: r.amountIn });
  const share = shareAccounts(r.curve, r.trader, r.referral ?? null);
  return steppedTransaction(connection, r.trader, [
    { step: "setup", instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: TRADE_COMPUTE_UNITS }), ...accounts.setup, ...share.setup] },
    { step: "trade", instructions: [curveTradeIx(r.program, r.curve, { ...r, baseAccount: accounts.base, quoteAccount: accounts.quote, share: share.share })] },
    { step: "cleanup", instructions: accounts.cleanup },
  ]);
}

/**
 * The referrer's account of the Quote Asset, which the program pays the share fee into, opened by the trader if it
 * doesn't exist (a referrer paid in SOL gets it wrapped there, theirs to unwrap).
 */
function shareAccounts(c: CurveAccounts, trader: PublicKey, referral: { referrer: PublicKey; rate: BN } | null) {
  if (!referral || referral.rate.isZero()) return { setup: [] as TransactionInstruction[], share: null };
  const receiver = getAssociatedTokenAddressSync(c.quoteMint, referral.referrer, true, c.quoteTokenProgram);
  return {
    setup: [createAssociatedTokenAccountIdempotentInstruction(trader, receiver, referral.referrer, c.quoteMint, c.quoteTokenProgram)],
    share: { rate: referral.rate, receiver },
  };
}

/** The accounts a curve trade names; a First Buy names them before its curve exists. */
export type CurveAccounts = Pick<
  Curve, "pool" | "globalConfig" | "platformConfig" | "creator" | "baseMint" | "quoteMint" | "baseTokenProgram" | "quoteTokenProgram"
>;

/** The instructions of one buy or sell on a curve, with the trader's token accounts opened and closed around it. */
export async function tradeInstructions(
  connection: Connection,
  r: { program: PublicKey; curve: CurveAccounts; trader: PublicKey; side: Side; amountIn: BN; minAmountOut: BN },
): Promise<TransactionInstruction[]> {
  const accounts = await tradeAccounts(connection, { ...r.curve, trader: r.trader, side: r.side, amountIn: r.amountIn });
  return [
    ...accounts.setup,
    curveTradeIx(r.program, r.curve, { ...r, baseAccount: accounts.base, quoteAccount: accounts.quote }),
    ...accounts.cleanup,
  ];
}

/** A buy or sell on a curve from and to the given token accounts. */
export function curveTradeIx(
  program: PublicKey, c: CurveAccounts,
  t: { trader: PublicKey; side: Side; baseAccount: PublicKey; quoteAccount: PublicKey; amountIn: BN; minAmountOut: BN; share?: { rate: BN; receiver: PublicKey } | null },
) {
  return tradeExactInIx(t.side, {
    program,
    trader: t.trader,
    pool: c.pool,
    globalConfig: c.globalConfig,
    platformConfig: c.platformConfig,
    creator: c.creator,
    baseMint: c.baseMint,
    quoteMint: c.quoteMint,
    baseTokenProgram: c.baseTokenProgram,
    quoteTokenProgram: c.quoteTokenProgram,
    traderBaseAccount: t.baseAccount,
    traderQuoteAccount: t.quoteAccount,
    amountIn: t.amountIn,
    minAmountOut: t.minAmountOut,
    share: t.share ?? null,
  });
}
