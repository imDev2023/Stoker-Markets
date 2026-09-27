import BN from "bn.js";
import { RATE_DENOMINATOR } from "./shape";

/**
 * Pricing on a LaunchLab constant-product curve, as the program computes it.
 * The curve trades as if it held `virtual_quote + real_quote` quote against `virtual_base - real_base` coins.
 * Every fee is taken from the quote side: from the amount paid on a buy, from the proceeds on a sell.
 */

/** A curve's reserves, in raw units, as stored in its PoolState. */
export type CurveReserves = { virtualBase: BN; virtualQuote: BN; realBase: BN; realQuote: BN; totalBaseSell: BN };

/** Fee rates in LaunchLab's 1e6 denominator: Raydium's protocol fee (the GlobalConfig `trade_fee_rate`), the Platform Fee and the Creator Fee. */
export type FeeRates = { protocol: BN; platform: BN; creator: BN };

export type TradeFees = { protocol: BN; platform: BN; creator: BN };

export type Side = "buy" | "sell";

export type TradeQuote = {
  side: Side;
  /** What the trader pays: Quote Asset for a buy (fees included), coins for a sell. */
  amountIn: BN;
  /** What the trader receives: coins for a buy, Quote Asset for a sell (fees already taken). */
  amountOut: BN;
  fees: TradeFees;
  after: CurveReserves;
};

const DENOMINATOR = new BN(RATE_DENOMINATOR);
const ceilDiv = (a: BN, b: BN) => a.add(b).subn(1).div(b);
const totalRate = (r: FeeRates) => r.protocol.add(r.platform).add(r.creator);

/** The program charges the total fee rounded up, then gives Platform and Creator their rounded-down shares; Raydium gets the rest. */
function splitFee(total: BN, rates: FeeRates): TradeFees {
  const rate = totalRate(rates);
  if (rate.isZero()) return { protocol: new BN(0), platform: new BN(0), creator: new BN(0) };
  const platform = total.mul(rates.platform).div(rate);
  const creator = total.mul(rates.creator).div(rate);
  return { protocol: total.sub(platform).sub(creator), platform, creator };
}

/**
 * Spending `amountIn` Quote Asset. If that would buy more coins than the curve has left, the buy takes exactly what is
 * left and charges only what those coins cost, so `amountIn` in the result can be less than asked.
 */
function quoteBuyExactIn(c: CurveReserves, rates: FeeRates, amountIn: BN): TradeQuote {
  const rate = totalRate(rates);
  const inputReserve = c.virtualQuote.add(c.realQuote);
  const outputReserve = c.virtualBase.sub(c.realBase);
  let paid = amountIn;
  let fee = ceilDiv(amountIn.mul(rate), DENOMINATOR);
  let net = amountIn.sub(fee);
  let out = net.mul(outputReserve).div(inputReserve.add(net));
  const remaining = c.totalBaseSell.sub(c.realBase);
  if (out.gt(remaining)) {
    out = remaining;
    net = ceilDiv(inputReserve.mul(out), outputReserve.sub(out));
    paid = ceilDiv(net.mul(DENOMINATOR), DENOMINATOR.sub(rate));
    fee = paid.sub(net);
  }
  return {
    side: "buy",
    amountIn: paid,
    amountOut: out,
    fees: splitFee(fee, rates),
    after: { ...c, realBase: c.realBase.add(out), realQuote: c.realQuote.add(net) },
  };
}

/** Selling `amountIn` coins back to the curve. */
function quoteSellExactIn(c: CurveReserves, rates: FeeRates, amountIn: BN): TradeQuote {
  const inputReserve = c.virtualBase.sub(c.realBase);
  const outputReserve = c.virtualQuote.add(c.realQuote);
  const gross = BN.min(amountIn.mul(outputReserve).div(inputReserve.add(amountIn)), c.realQuote);
  const fee = ceilDiv(gross.mul(totalRate(rates)), DENOMINATOR);
  return {
    side: "sell",
    amountIn,
    amountOut: gross.sub(fee),
    fees: splitFee(fee, rates),
    after: { ...c, realBase: c.realBase.sub(amountIn), realQuote: c.realQuote.sub(gross) },
  };
}

export function quoteTrade(c: CurveReserves, rates: FeeRates, side: Side, amountIn: BN): TradeQuote {
  return side === "buy" ? quoteBuyExactIn(c, rates, amountIn) : quoteSellExactIn(c, rates, amountIn);
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
