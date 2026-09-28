import {
  ComputeBudgetProgram, PublicKey, SYSVAR_CLOCK_PUBKEY, TransactionInstruction, type AccountMeta, type Connection,
} from "@solana/web3.js";
import BN from "bn.js";
import { cpmmCoder, launchlabCoder } from "./coder";
import type { Side, TradeFees } from "./curve";
import { cpmmPdas } from "./pda";
import { RATE_DENOMINATOR } from "./shape";
import { grossForNet, transferFeeOf, withheldFee, type TransferFee } from "./transferFee";
import { steppedTransaction, tradeAccounts, type PreparedTrade } from "./wallet";

/**
 * Trading a graduated Launch in its Raydium CPMM pool, as the program computes it (raydium-cp-swap `swap_base_input`).
 * The pool's Raydium trade fee is taken from what goes in. Its creator fee, which LaunchLab puts on the Quote Asset side
 * at migration and which our platform collects as the pool's creator (ADR 0001), is taken from the Quote Asset: from what
 * goes in on a buy, from what comes out on a sell.
 */

export type PoolToken = {
  mint: PublicKey;
  vault: PublicKey;
  program: PublicKey;
  decimals: number;
  /** What the pool trades with: the vault balance less the protocol, fund and creator fees it holds for collection. */
  reserve: BN;
  /** The mint's Token-2022 transfer fee, withheld on the way into and out of the pool; null without one. */
  transferFee: TransferFee | null;
};

/** CPMM fee rates in its 1e6 denominator. `protocol` and `fund` are shares of the trade fee, not of the trade. */
export type PoolFeeRates = { trade: BN; creator: BN; protocol: BN; fund: BN };

export type Pool = {
  address: PublicKey;
  ammConfig: PublicKey;
  observation: PublicKey;
  creator: PublicKey;
  /** Token 0 and token 1, in the pool's own order. */
  tokens: [PoolToken, PoolToken];
  rates: PoolFeeRates;
  /** 0: on whichever token goes in; 1: only token 0; 2: only token 1. */
  creatorFeeOn: number;
  /** The pool creator's fees waiting in the vaults for `collect_creator_fee`, per token in the pool's order. */
  creatorFees: [BN, BN];
  /** The pool's LP mint; the locked LP behind a Fee Key is in it. */
  lpMint: PublicKey;
  /** Unix seconds before which the pool refuses swaps: a migrated pool opens one second after its migration. */
  openTime: number;
  /** The chain's clock when the pool was read, in Unix seconds; it can lag the wall clock, and it is what `openTime` is checked against. */
  chainTime: number;
  swapEnabled: boolean;
};

type PoolStateData = {
  amm_config: PublicKey; pool_creator: PublicKey; lp_mint: PublicKey; token_0_vault: PublicKey; token_1_vault: PublicKey;
  token_0_mint: PublicKey; token_1_mint: PublicKey; token_0_program: PublicKey; token_1_program: PublicKey;
  observation_key: PublicKey; status: number; mint_0_decimals: number; mint_1_decimals: number;
  protocol_fees_token_0: BN; protocol_fees_token_1: BN; fund_fees_token_0: BN; fund_fees_token_1: BN;
  creator_fees_token_0: BN; creator_fees_token_1: BN; open_time: BN; creator_fee_on: number; enable_creator_fee: boolean;
};
type AmmConfigData = { trade_fee_rate: BN; creator_fee_rate: BN; protocol_fee_rate: BN; fund_fee_rate: BN };

// SPL and Token-2022 token accounts both keep the balance right after the mint and the owner.
const tokenAmount = (data: Buffer) => new BN(data.subarray(64, 72), "le");

// The Clock sysvar: slot, epoch start timestamp, epoch, leader schedule epoch, then the Unix timestamp.
const CLOCK_UNIX_TIMESTAMP_OFFSET = 32;

// Bit 2 of a pool's status switches swaps off.
const SWAP_DISABLED = 1 << 2;

/** Reads a CPMM pool with its fee rates and tradeable reserves. Null if there is no pool at the address. */
export async function loadPool(connection: Connection, address: PublicKey): Promise<Pool | null> {
  const account = await connection.getAccountInfo(address, "confirmed");
  if (!account) return null;
  const s = cpmmCoder.accounts.decode("PoolState", account.data) as PoolStateData;
  const [[config, vault0, vault1, clock, mint0, mint1], { epoch }] = await Promise.all([
    connection.getMultipleAccountsInfo([s.amm_config, s.token_0_vault, s.token_1_vault, SYSVAR_CLOCK_PUBKEY, s.token_0_mint, s.token_1_mint], "confirmed"),
    connection.getEpochInfo("confirmed"),
  ]);
  if (!config || !vault0 || !vault1 || !clock) throw new Error(`pool ${address.toBase58()} points at a missing config or vault`);
  const c = cpmmCoder.accounts.decode("AmmConfig", config.data) as AmmConfigData;
  const token = (
    mint: PublicKey, mintInfo: typeof mint0, vault: PublicKey, program: PublicKey, decimals: number, balance: BN, ...held: BN[]
  ): PoolToken => ({
    mint, vault, program, decimals, reserve: held.reduce((left, fee) => left.sub(fee), balance), transferFee: transferFeeOf(mint, mintInfo ?? null, epoch),
  });
  return {
    address,
    ammConfig: s.amm_config,
    observation: s.observation_key,
    creator: s.pool_creator,
    tokens: [
      token(s.token_0_mint, mint0, s.token_0_vault, s.token_0_program, s.mint_0_decimals, tokenAmount(vault0.data),
        s.protocol_fees_token_0, s.fund_fees_token_0, s.creator_fees_token_0),
      token(s.token_1_mint, mint1, s.token_1_vault, s.token_1_program, s.mint_1_decimals, tokenAmount(vault1.data),
        s.protocol_fees_token_1, s.fund_fees_token_1, s.creator_fees_token_1),
    ],
    rates: {
      trade: c.trade_fee_rate,
      creator: s.enable_creator_fee ? c.creator_fee_rate : new BN(0),
      protocol: c.protocol_fee_rate,
      fund: c.fund_fee_rate,
    },
    creatorFeeOn: s.creator_fee_on,
    creatorFees: [s.creator_fees_token_0, s.creator_fees_token_1],
    lpMint: s.lp_mint,
    openTime: s.open_time.toNumber(),
    chainTime: new BN(clock.data.subarray(CLOCK_UNIX_TIMESTAMP_OFFSET, CLOCK_UNIX_TIMESTAMP_OFFSET + 8), "le").toNumber(),
    swapEnabled: (s.status & SWAP_DISABLED) === 0,
  };
}

export type PoolTokenKeys = Pick<PoolToken, "mint" | "vault" | "program" | "decimals">;

/** A pool's accounts and the creator fees it holds, without its reserves: enough to collect its fees. */
export type PoolKeys = Pick<Pool, "address" | "ammConfig" | "creator" | "creatorFees" | "lpMint"> & { tokens: [PoolTokenKeys, PoolTokenKeys] };

/** Reads many CPMM pools' keys in a few requests; addresses with no pool are left out. */
export async function readPoolKeys(connection: Connection, addresses: PublicKey[]): Promise<PoolKeys[]> {
  const out: PoolKeys[] = [];
  for (let i = 0; i < addresses.length; i += 100) {
    const batch = addresses.slice(i, i + 100);
    const infos = await connection.getMultipleAccountsInfo(batch, "confirmed");
    batch.forEach((address, j) => {
      const info = infos[j];
      if (!info) return;
      const s = cpmmCoder.accounts.decode("PoolState", info.data) as PoolStateData;
      out.push({
        address,
        ammConfig: s.amm_config,
        creator: s.pool_creator,
        creatorFees: [s.creator_fees_token_0, s.creator_fees_token_1],
        lpMint: s.lp_mint,
        tokens: [
          { mint: s.token_0_mint, vault: s.token_0_vault, program: s.token_0_program, decimals: s.mint_0_decimals },
          { mint: s.token_1_mint, vault: s.token_1_vault, program: s.token_1_program, decimals: s.mint_1_decimals },
        ],
      });
    });
  }
  return out;
}

/** The CPMM pool a curve graduates into: fixed by the PlatformConfig's CPMM config and the two mints. */
export async function graduationPoolAddress(connection: Connection, cpmm: PublicKey, curve: { platformConfig: PublicKey; baseMint: PublicKey; quoteMint: PublicKey }) {
  const account = await connection.getAccountInfo(curve.platformConfig, "confirmed");
  if (!account) throw new Error(`missing PlatformConfig ${curve.platformConfig.toBase58()}`);
  const p = launchlabCoder.accounts.decode("PlatformConfig", account.data) as { cpswap_config: PublicKey };
  return cpmmPdas(cpmm).pool(p.cpswap_config, curve.baseMint, curve.quoteMint);
}

const DENOMINATOR = new BN(RATE_DENOMINATOR);
const ceilDiv = (a: BN, b: BN) => a.add(b).subn(1).div(b);

/** One swap's arithmetic, exactly as raydium-cp-swap's `CurveCalculator::swap_base_input` does it. */
export type PoolSwap = {
  /** What leaves the trader's account, any transfer fee of the input mint included. */
  amountIn: BN;
  /** What reaches the trader's account, after the creator fee when it comes out of the output and after any transfer fee. */
  amountOut: BN;
  /** The transfer fees the two mints' issuers withhold on the way in and out; zero without one. */
  transferFees: { input: BN; output: BN };
  /** Raydium's trade fee, in the input token. */
  tradeFee: BN;
  /** The pool creator's fee, in the input token when `creatorFeeOnInput`, otherwise in the output token. */
  creatorFee: BN;
  creatorFeeOnInput: boolean;
  /** The pool's constant-product position before and after, fees excluded, as [input, output] reserves. */
  before: [BN, BN];
  after: [BN, BN];
};

export function isCreatorFeeOnInput(creatorFeeOn: number, inputIsToken0: boolean) {
  return creatorFeeOn === 0 || (creatorFeeOn === 1 && inputIsToken0) || (creatorFeeOn === 2 && !inputIsToken0);
}

/**
 * `swap_base_input`: the pool prices what arrives after the input mint's transfer fee, and the trader receives the
 * output less the output mint's transfer fee; cp-swap checks `minimum_amount_out` against that received amount.
 */
export function poolSwap(pool: Pool, inputMint: PublicKey, amountIn: BN): PoolSwap {
  const inputIsToken0 = pool.tokens[0].mint.equals(inputMint);
  const [input, output] = inputIsToken0 ? pool.tokens : [pool.tokens[1], pool.tokens[0]];
  const { trade, creator } = pool.rates;
  const onInput = isCreatorFeeOnInput(pool.creatorFeeOn, inputIsToken0);
  const inputTransferFee = withheldFee(amountIn, input.transferFee);
  const arrived = amountIn.sub(inputTransferFee);
  let tradeFee: BN;
  let creatorFee = new BN(0);
  let net: BN;
  if (onInput) {
    const both = trade.add(creator);
    const total = ceilDiv(arrived.mul(both), DENOMINATOR);
    creatorFee = both.isZero() ? new BN(0) : total.mul(creator).div(both);
    tradeFee = total.sub(creatorFee);
    net = arrived.sub(total);
  } else {
    tradeFee = ceilDiv(arrived.mul(trade), DENOMINATOR);
    net = arrived.sub(tradeFee);
  }
  const swapped = net.mul(output.reserve).div(input.reserve.add(net));
  if (!onInput) creatorFee = ceilDiv(swapped.mul(creator), DENOMINATOR);
  const paidOut = onInput ? swapped : swapped.sub(creatorFee);
  const outputTransferFee = withheldFee(paidOut, output.transferFee);
  return {
    amountIn,
    amountOut: paidOut.sub(outputTransferFee),
    transferFees: { input: inputTransferFee, output: outputTransferFee },
    tradeFee,
    creatorFee,
    creatorFeeOnInput: onInput,
    before: [input.reserve, output.reserve],
    after: [input.reserve.add(net), output.reserve.sub(swapped)],
  };
}

/** Rounds up the amount that leaves `post` after a fee at `rate`: raydium-cp-swap's `Fees::calculate_pre_fee_amount`. */
const preFeeAmount = (post: BN, rate: BN) => (rate.isZero() ? post : ceilDiv(post.mul(DENOMINATOR), DENOMINATOR.sub(rate)));

/**
 * Receiving exactly `amountOut` of the other token, exactly as raydium-cp-swap's `CurveCalculator::swap_base_output`
 * does it: the pool pays out enough that `amountOut` arrives after the output mint's transfer fee, and takes enough
 * that what it needs arrives after the input mint's. `amountIn` is what leaves the trader, every fee included. Null
 * when the pool holds too little of the output token.
 */
export function poolSwapExactOut(pool: Pool, inputMint: PublicKey, amountOut: BN): PoolSwap | null {
  const inputIsToken0 = pool.tokens[0].mint.equals(inputMint);
  const [input, output] = inputIsToken0 ? pool.tokens : [pool.tokens[1], pool.tokens[0]];
  const { trade, creator } = pool.rates;
  const onInput = isCreatorFeeOnInput(pool.creatorFeeOn, inputIsToken0);
  const paidOut = grossForNet(amountOut, output.transferFee);
  const outputTransferFee = paidOut.sub(amountOut);
  const swapped = onInput ? paidOut : preFeeAmount(paidOut, creator);
  if (swapped.gte(output.reserve)) return null;
  const net = ceilDiv(input.reserve.mul(swapped), output.reserve.sub(swapped));
  let creatorFee = swapped.sub(paidOut);
  let arrived: BN;
  let tradeFee: BN;
  if (onInput) {
    const both = trade.add(creator);
    arrived = preFeeAmount(net, both);
    const total = arrived.sub(net);
    creatorFee = both.isZero() ? new BN(0) : total.mul(creator).div(both);
    tradeFee = total.sub(creatorFee);
  } else {
    arrived = preFeeAmount(net, trade);
    tradeFee = arrived.sub(net);
  }
  const amountIn = grossForNet(arrived, input.transferFee);
  return {
    amountIn,
    amountOut,
    transferFees: { input: amountIn.sub(arrived), output: outputTransferFee },
    tradeFee,
    creatorFee,
    creatorFeeOnInput: onInput,
    before: [input.reserve, output.reserve],
    after: [input.reserve.add(net), output.reserve.sub(swapped)],
  };
}

/** The price of one whole coin in whole Quote Asset units at a pair of reserves. */
export function poolPrice(baseReserve: BN, quoteReserve: BN, baseDecimals: number, quoteDecimals: number) {
  return (Number(quoteReserve.toString()) / Number(baseReserve.toString())) * 10 ** (baseDecimals - quoteDecimals);
}

export type PoolTradeQuote = {
  side: Side;
  amountIn: BN;
  /** What reaches the trader, every fee taken; cp-swap checks the slippage limit against this. */
  amountOut: BN;
  /**
   * In the Quote Asset, except that on a sell the pool takes Raydium's trade fee from the coins going in.
   * `platform` is the pool creator fee: our platform is every graduated pool's creator (ADR 0001).
   */
  fees: TradeFees;
  /** Withheld by the issuers of the Quote Asset and of the coin, whichever way each is moving. */
  transferFees: { quote: BN; base: BN };
  priceBefore: number;
  priceAfter: number;
};

/** A graduated Launch's pool, oriented as coin and Quote Asset. */
export function poolSides(pool: Pool, baseMint: PublicKey) {
  const baseIs0 = pool.tokens[0].mint.equals(baseMint);
  if (!baseIs0 && !pool.tokens[1].mint.equals(baseMint)) throw new Error(`pool ${pool.address.toBase58()} does not trade ${baseMint.toBase58()}`);
  const [base, quote] = baseIs0 ? pool.tokens : [pool.tokens[1], pool.tokens[0]];
  return { base, quote };
}

export function quotePoolTrade(pool: Pool, baseMint: PublicKey, side: Side, amountIn: BN): PoolTradeQuote {
  const { base, quote } = poolSides(pool, baseMint);
  const s = poolSwap(pool, side === "buy" ? quote.mint : base.mint, amountIn);
  const price = ([inRes, outRes]: [BN, BN]) =>
    side === "buy" ? poolPrice(outRes, inRes, base.decimals, quote.decimals) : poolPrice(inRes, outRes, base.decimals, quote.decimals);
  return {
    side,
    amountIn: s.amountIn,
    amountOut: s.amountOut,
    fees: { protocol: s.tradeFee, platform: s.creatorFee, creator: new BN(0), share: new BN(0) },
    transferFees: side === "buy" ? { quote: s.transferFees.input, base: s.transferFees.output } : { quote: s.transferFees.output, base: s.transferFees.input },
    priceBefore: price(s.before),
    priceAfter: price(s.after),
  };
}

const meta = (pubkey: PublicKey, isSigner = false, isWritable = false): AccountMeta => ({ pubkey, isSigner, isWritable });

type SwapAccounts = { payer: PublicKey; input: PoolToken; output: PoolToken; inputAccount: PublicKey; outputAccount: PublicKey };

export function swapBaseInputIx(cpmm: PublicKey, pool: Pool, p: SwapAccounts & { amountIn: BN; minAmountOut: BN }) {
  return new TransactionInstruction({
    programId: cpmm,
    data: cpmmCoder.instruction.encode("swap_base_input", { amount_in: p.amountIn, minimum_amount_out: p.minAmountOut }),
    keys: swapKeys(cpmm, pool, p),
  });
}

/** Buys exactly `amountOut`, taking at most `maxAmountIn`; above that it fails with ExceededSlippage (6005). */
export function swapBaseOutputIx(cpmm: PublicKey, pool: Pool, p: SwapAccounts & { amountOut: BN; maxAmountIn: BN }) {
  return new TransactionInstruction({
    programId: cpmm,
    data: cpmmCoder.instruction.encode("swap_base_output", { max_amount_in: p.maxAmountIn, amount_out: p.amountOut }),
    keys: swapKeys(cpmm, pool, p),
  });
}

function swapKeys(cpmm: PublicKey, pool: Pool, p: SwapAccounts): AccountMeta[] {
  return [
    meta(p.payer, true),
    meta(cpmmPdas(cpmm).authority),
    meta(pool.ammConfig),
    meta(pool.address, false, true),
    meta(p.inputAccount, false, true),
    meta(p.outputAccount, false, true),
    meta(p.input.vault, false, true),
    meta(p.output.vault, false, true),
    meta(p.input.program),
    meta(p.output.program),
    meta(p.input.mint),
    meta(p.output.mint),
    meta(pool.observation, false, true),
  ];
}

export type PoolTradeRequest = {
  cpmm: PublicKey;
  pool: Pool;
  baseMint: PublicKey;
  trader: PublicKey;
  side: Side;
  amountIn: BN;
  minAmountOut: BN;
};

const SWAP_COMPUTE_UNITS = 150_000;

/** Builds a buy or sell in a graduated Launch's CPMM pool server-side (ADR 0003). The trader is the only signer. */
export async function preparePoolTrade(connection: Connection, r: PoolTradeRequest): Promise<PreparedTrade> {
  const { base, quote } = poolSides(r.pool, r.baseMint);
  const accounts = await tradeAccounts(connection, {
    trader: r.trader,
    baseMint: base.mint,
    baseTokenProgram: base.program,
    quoteMint: quote.mint,
    quoteTokenProgram: quote.program,
    side: r.side,
    amountIn: r.amountIn,
  });
  return steppedTransaction(connection, r.trader, [
    { step: "setup", instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: SWAP_COMPUTE_UNITS }), ...accounts.setup] },
    {
      step: "trade",
      instructions: [
        poolTradeIx(r.cpmm, r.pool, r.baseMint, {
          trader: r.trader, side: r.side, baseAccount: accounts.base, quoteAccount: accounts.quote, amountIn: r.amountIn, minAmountOut: r.minAmountOut,
        }),
      ],
    },
    { step: "cleanup", instructions: accounts.cleanup },
  ]);
}

/** A buy (Quote Asset in) or sell (coins in) in a graduated Launch's pool, from and to the given token accounts. */
export function poolTradeIx(
  cpmm: PublicKey, pool: Pool, baseMint: PublicKey,
  t: { trader: PublicKey; side: Side; baseAccount: PublicKey; quoteAccount: PublicKey; amountIn: BN; minAmountOut: BN },
) {
  const { base, quote } = poolSides(pool, baseMint);
  const buy = t.side === "buy";
  return swapBaseInputIx(cpmm, pool, {
    payer: t.trader,
    input: buy ? quote : base,
    output: buy ? base : quote,
    inputAccount: buy ? t.quoteAccount : t.baseAccount,
    outputAccount: buy ? t.baseAccount : t.quoteAccount,
    amountIn: t.amountIn,
    minAmountOut: t.minAmountOut,
  });
}
