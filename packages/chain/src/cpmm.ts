import {
  ComputeBudgetProgram, PublicKey, SYSVAR_CLOCK_PUBKEY, TransactionInstruction, type AccountMeta, type Connection,
} from "@solana/web3.js";
import BN from "bn.js";
import { cpmmCoder, launchlabCoder } from "./coder";
import type { Side, TradeFees } from "./curve";
import { cpmmPdas } from "./pda";
import { RATE_DENOMINATOR } from "./shape";
import { tradeAccounts, unsignedTransaction, type UnsignedTransaction } from "./wallet";

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
  /** Unix seconds before which the pool refuses swaps: a migrated pool opens one second after its migration. */
  openTime: number;
  /** The chain's clock when the pool was read, in Unix seconds; it can lag the wall clock, and it is what `openTime` is checked against. */
  chainTime: number;
  swapEnabled: boolean;
};

type PoolStateData = {
  amm_config: PublicKey; pool_creator: PublicKey; token_0_vault: PublicKey; token_1_vault: PublicKey;
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
  const [config, vault0, vault1, clock] = await connection.getMultipleAccountsInfo(
    [s.amm_config, s.token_0_vault, s.token_1_vault, SYSVAR_CLOCK_PUBKEY],
    "confirmed",
  );
  if (!config || !vault0 || !vault1 || !clock) throw new Error(`pool ${address.toBase58()} points at a missing config or vault`);
  const c = cpmmCoder.accounts.decode("AmmConfig", config.data) as AmmConfigData;
  const token = (mint: PublicKey, vault: PublicKey, program: PublicKey, decimals: number, balance: BN, ...held: BN[]): PoolToken => ({
    mint, vault, program, decimals, reserve: held.reduce((left, fee) => left.sub(fee), balance),
  });
  return {
    address,
    ammConfig: s.amm_config,
    observation: s.observation_key,
    creator: s.pool_creator,
    tokens: [
      token(s.token_0_mint, s.token_0_vault, s.token_0_program, s.mint_0_decimals, tokenAmount(vault0.data),
        s.protocol_fees_token_0, s.fund_fees_token_0, s.creator_fees_token_0),
      token(s.token_1_mint, s.token_1_vault, s.token_1_program, s.mint_1_decimals, tokenAmount(vault1.data),
        s.protocol_fees_token_1, s.fund_fees_token_1, s.creator_fees_token_1),
    ],
    rates: {
      trade: c.trade_fee_rate,
      creator: s.enable_creator_fee ? c.creator_fee_rate : new BN(0),
      protocol: c.protocol_fee_rate,
      fund: c.fund_fee_rate,
    },
    creatorFeeOn: s.creator_fee_on,
    openTime: s.open_time.toNumber(),
    chainTime: new BN(clock.data.subarray(CLOCK_UNIX_TIMESTAMP_OFFSET, CLOCK_UNIX_TIMESTAMP_OFFSET + 8), "le").toNumber(),
    swapEnabled: (s.status & SWAP_DISABLED) === 0,
  };
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
  amountIn: BN;
  /** What the trader receives, after the creator fee when it comes out of the output. */
  amountOut: BN;
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

export function poolSwap(pool: Pool, inputMint: PublicKey, amountIn: BN): PoolSwap {
  const inputIsToken0 = pool.tokens[0].mint.equals(inputMint);
  const [input, output] = inputIsToken0 ? pool.tokens : [pool.tokens[1], pool.tokens[0]];
  const { trade, creator } = pool.rates;
  const onInput = isCreatorFeeOnInput(pool.creatorFeeOn, inputIsToken0);
  let tradeFee: BN;
  let creatorFee = new BN(0);
  let net: BN;
  if (onInput) {
    const both = trade.add(creator);
    const total = ceilDiv(amountIn.mul(both), DENOMINATOR);
    creatorFee = both.isZero() ? new BN(0) : total.mul(creator).div(both);
    tradeFee = total.sub(creatorFee);
    net = amountIn.sub(total);
  } else {
    tradeFee = ceilDiv(amountIn.mul(trade), DENOMINATOR);
    net = amountIn.sub(tradeFee);
  }
  const swapped = net.mul(output.reserve).div(input.reserve.add(net));
  if (!onInput) creatorFee = ceilDiv(swapped.mul(creator), DENOMINATOR);
  return {
    amountIn,
    amountOut: onInput ? swapped : swapped.sub(creatorFee),
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
  amountOut: BN;
  /**
   * In the Quote Asset, except that on a sell the pool takes Raydium's trade fee from the coins going in.
   * `platform` is the pool creator fee: our platform is every graduated pool's creator (ADR 0001).
   */
  fees: TradeFees;
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
    fees: { protocol: s.tradeFee, platform: s.creatorFee, creator: new BN(0) },
    priceBefore: price(s.before),
    priceAfter: price(s.after),
  };
}

const meta = (pubkey: PublicKey, isSigner = false, isWritable = false): AccountMeta => ({ pubkey, isSigner, isWritable });

export function swapBaseInputIx(
  cpmm: PublicKey, pool: Pool, p: { payer: PublicKey; input: PoolToken; output: PoolToken; inputAccount: PublicKey; outputAccount: PublicKey; amountIn: BN; minAmountOut: BN },
) {
  return new TransactionInstruction({
    programId: cpmm,
    data: cpmmCoder.instruction.encode("swap_base_input", { amount_in: p.amountIn, minimum_amount_out: p.minAmountOut }),
    keys: [
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
    ],
  });
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
export async function preparePoolTrade(connection: Connection, r: PoolTradeRequest): Promise<UnsignedTransaction> {
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
  const buy = r.side === "buy";
  return unsignedTransaction(connection, r.trader, [
    ComputeBudgetProgram.setComputeUnitLimit({ units: SWAP_COMPUTE_UNITS }),
    ...accounts.setup,
    swapBaseInputIx(r.cpmm, r.pool, {
      payer: r.trader,
      input: buy ? quote : base,
      output: buy ? base : quote,
      inputAccount: buy ? accounts.quote : accounts.base,
      outputAccount: buy ? accounts.base : accounts.quote,
      amountIn: r.amountIn,
      minAmountOut: r.minAmountOut,
    }),
    ...accounts.cleanup,
  ]);
}
