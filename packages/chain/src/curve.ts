import BN from "bn.js";
import { RATE_DENOMINATOR } from "./shape";
import { grossForNet, withheldFee, type TransferFee } from "./transferFee";

/**
 * Pricing on a LaunchLab constant-product curve, as the program computes it.
 * The curve trades as if it held `virtual_quote + real_quote` quote against `virtual_base - real_base` coins.
 * Every fee is taken from the quote side: from the amount paid on a buy, from the proceeds on a sell.
 */

/** A curve's reserves, in raw units, as stored in its PoolState. */
export type CurveReserves = { virtualBase: BN; virtualQuote: BN; realBase: BN; realQuote: BN; totalBaseSell: BN };

/**
 * Fee rates in LaunchLab's 1e6 denominator: Raydium's protocol fee (the GlobalConfig `trade_fee_rate`), the Platform Fee,
 * the Creator Fee, and the share fee a referred trade pays its referrer (`share_fee_rate` in the trade instruction; 0 or
 * absent when nobody referred it).
 */
export type FeeRates = { protocol: BN; platform: BN; creator: BN; share?: BN };

export type TradeFees = { protocol: BN; platform: BN; creator: BN; share: BN };

export type Side = "buy" | "sell";

/** The transfer fees a mint's issuer withholds on the way in and out of a trade, when the coin or its Quote Asset has one. */
export type TradeTransferFees = { quote?: TransferFee | null; base?: TransferFee | null };

export type TradeQuote = {
  side: Side;
  /** What the trader pays: Quote Asset for a buy (fees included), coins for a sell. */
  amountIn: BN;
  /** What reaches the trader's wallet: coins for a buy, Quote Asset for a sell, every fee already taken. */
  amountOut: BN;
  /**
   * What the program pays out before the received asset's own transfer fee is withheld; the same as `amountOut` unless
   * that asset carries one. (LaunchLab checks a trade's `minimum_amount_out` against `amountOut`, the received figure.)
   */
  programAmountOut: BN;
  fees: TradeFees;
  /** Withheld by the issuers: of the Quote Asset (paid on a buy, received on a sell) and of the coin (received on a buy, paid on a sell). */
  transferFees: { quote: BN; base: BN };
  after: CurveReserves;
};

const DENOMINATOR = new BN(RATE_DENOMINATOR);
const ceilDiv = (a: BN, b: BN) => a.add(b).subn(1).div(b);
const ZERO = new BN(0);
const totalRate = (r: FeeRates) => r.protocol.add(r.platform).add(r.creator).add(r.share ?? ZERO);

/**
 * The program charges the total fee rounded up, then gives the Platform, the Creator and the referrer their rounded-down
 * shares; Raydium gets the rest.
 */
function splitFee(total: BN, rates: FeeRates): TradeFees {
  const rate = totalRate(rates);
  if (rate.isZero()) return { protocol: ZERO, platform: ZERO, creator: ZERO, share: ZERO };
  const platform = total.mul(rates.platform).div(rate);
  const creator = total.mul(rates.creator).div(rate);
  const share = total.mul(rates.share ?? ZERO).div(rate);
  return { protocol: total.sub(platform).sub(creator).sub(share), platform, creator, share };
}

/**
 * Spending `amountIn` Quote Asset. The program prices the trade on what reaches the curve, which is the amount paid
 * less any transfer fee the Quote Asset's issuer withholds on the way in. If that would buy more coins than the curve
 * has left, the buy takes exactly what is left and charges only what those coins cost (plus the transfer fee on that),
 * so `amountIn` in the result can be less than asked.
 */
function quoteBuyExactIn(c: CurveReserves, rates: FeeRates, amountIn: BN, transfer: TradeTransferFees): TradeQuote {
  const rate = totalRate(rates);
  const inputReserve = c.virtualQuote.add(c.realQuote);
  const outputReserve = c.virtualBase.sub(c.realBase);
  let paid = amountIn;
  let quoteTransferFee = withheldFee(paid, transfer.quote ?? null);
  let arrived = paid.sub(quoteTransferFee);
  let fee = ceilDiv(arrived.mul(rate), DENOMINATOR);
  let net = arrived.sub(fee);
  let out = net.mul(outputReserve).div(inputReserve.add(net));
  const remaining = c.totalBaseSell.sub(c.realBase);
  if (out.gt(remaining)) {
    out = remaining;
    net = ceilDiv(inputReserve.mul(out), outputReserve.sub(out));
    arrived = ceilDiv(net.mul(DENOMINATOR), DENOMINATOR.sub(rate));
    fee = arrived.sub(net);
    paid = grossForNet(arrived, transfer.quote ?? null);
    quoteTransferFee = paid.sub(arrived);
  }
  const baseTransferFee = withheldFee(out, transfer.base ?? null);
  return {
    side: "buy",
    amountIn: paid,
    amountOut: out.sub(baseTransferFee),
    programAmountOut: out,
    fees: splitFee(fee, rates),
    transferFees: { quote: quoteTransferFee, base: baseTransferFee },
    after: { ...c, realBase: c.realBase.add(out), realQuote: c.realQuote.add(net) },
  };
}

/**
 * Selling `amountIn` coins back to the curve. A Reward Launch's coin loses its Reward Tax on the way in, so the curve
 * prices what arrives; the Quote Asset paid out loses its own transfer fee, if any, on the way to the wallet.
 */
function quoteSellExactIn(c: CurveReserves, rates: FeeRates, amountIn: BN, transfer: TradeTransferFees): TradeQuote {
  const baseTransferFee = withheldFee(amountIn, transfer.base ?? null);
  const arrived = amountIn.sub(baseTransferFee);
  const inputReserve = c.virtualBase.sub(c.realBase);
  const outputReserve = c.virtualQuote.add(c.realQuote);
  const gross = BN.min(arrived.mul(outputReserve).div(inputReserve.add(arrived)), c.realQuote);
  const fee = ceilDiv(gross.mul(totalRate(rates)), DENOMINATOR);
  const paidOut = gross.sub(fee);
  const quoteTransferFee = withheldFee(paidOut, transfer.quote ?? null);
  return {
    side: "sell",
    amountIn,
    amountOut: paidOut.sub(quoteTransferFee),
    programAmountOut: paidOut,
    fees: splitFee(fee, rates),
    transferFees: { quote: quoteTransferFee, base: baseTransferFee },
    after: { ...c, realBase: c.realBase.sub(arrived), realQuote: c.realQuote.sub(gross) },
  };
}

/** Prices a buy or sell on a curve, allowing for the transfer fees of the coin and its Quote Asset, if they carry any. */
export function quoteTrade(c: CurveReserves, rates: FeeRates, side: Side, amountIn: BN, transfer: TradeTransferFees = {}): TradeQuote {
  return side === "buy" ? quoteBuyExactIn(c, rates, amountIn, transfer) : quoteSellExactIn(c, rates, amountIn, transfer);
}

/** The price of one whole coin in whole Quote Asset units. */
export function curvePrice(c: Pick<CurveReserves, "virtualBase" | "virtualQuote" | "realBase" | "realQuote">, baseDecimals: number, quoteDecimals: number) {
  const quote = Number(c.virtualQuote.add(c.realQuote).toString());
  const base = Number(c.virtualBase.sub(c.realBase).toString());
  return (quote / base) * 10 ** (baseDecimals - quoteDecimals);
}

/** The least the trader accepts: the quoted output less the slippage tolerance, in basis points. */
export function minAmountOut(amountOut: BN, slippageBps: number) {
  return amountOut.muln(10_000 - slippageBps).divn(10_000);
}

/**
 * A new curve's reserves, as LaunchLab sets them at launch from the curve's parameters (raydium-sdk-V2
 * `ConstantProductCurve.getInitParam`): nothing sold or raised yet, and virtual reserves that make the curve raise
 * exactly `fundRaising` by the time `totalBaseSell` coins are sold. `migrateFee` is the GlobalConfig's (0 on every
 * Raydium config).
 */
export function initialCurveReserves(p: { supply: BN; totalBaseSell: BN; fundRaising: BN; lockedAmount?: BN; migrateFee?: BN }): CurveReserves {
  const left = p.supply.sub(p.totalBaseSell).sub(p.lockedAmount ?? new BN(0));
  const raise = p.fundRaising.sub(p.migrateFee ?? new BN(0));
  if (left.lten(0) || raise.lten(0)) throw new Error("curve parameters leave nothing to migrate");
  const numerator = raise.mul(p.totalBaseSell).mul(p.totalBaseSell).div(left);
  const denominator = raise.mul(p.totalBaseSell).div(left).sub(p.fundRaising);
  if (denominator.lten(0)) throw new Error("curve parameters give no valid curve");
  return {
    virtualBase: numerator.div(denominator),
    virtualQuote: p.fundRaising.mul(p.fundRaising).div(denominator),
    realBase: new BN(0),
    realQuote: new BN(0),
    totalBaseSell: p.totalBaseSell,
  };
}
