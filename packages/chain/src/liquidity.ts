import { ComputeBudgetProgram, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, TransactionInstruction, type AccountMeta, type Connection } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction, createCloseAccountInstruction,
  createInitializeAccountInstruction, createSyncNativeInstruction, getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import bs58 from "bs58";
import BN from "bn.js";
import { cpmmCoder, launchlabCoder, lockCoder } from "./coder";
import { depositIx, poolSides, poolSwap, poolSwapExactOut, swapBaseOutputIx, type Pool, type PoolSwap, type PoolToken } from "./cpmm";
import { programDataLogs, type RawTransaction } from "./decode";
import { cpmmPdas, lockPdas, metadataPda } from "./pda";
import { METADATA_PROGRAM, WSOL_MINT, type Programs } from "./programs";
import { RATE_DENOMINATOR } from "./shape";
import { grossForNet, withheldFee } from "./transferFee";

/**
 * Adding locked liquidity to a graduated Launch's pool (ADR 0011, #184), in one transaction: buy an exact number of
 * coins in the pool, deposit them with the matching Quote Asset for an exact number of LP tokens, and lock exactly those
 * LP tokens in Raydium's lock program, which opens a position of its own with a new Fee Key. The arithmetic here is the
 * programs' own (raydium-cp-swap's `swap_base_output` and `deposit`), so a plan made from a pool as it stands says, to
 * the unit, what the transaction does to that pool.
 */

const meta = (pubkey: PublicKey, isSigner = false, isWritable = false): AccountMeta => ({ pubkey, isSigner, isWritable });

const BPS = new BN(10_000);
const DENOMINATOR = new BN(RATE_DENOMINATOR);
const ceilDiv = (a: BN, b: BN) => a.add(b).subn(1).div(b);
/** `amount` with `bps` basis points of itself added, rounded up. */
const withAllowance = (amount: BN, bps: number) => amount.add(ceilDiv(amount.muln(bps), BPS));

/** How much more than its price at planning the buy may cost before the transaction fails, in basis points. */
export const LIQUIDITY_BUY_SLIPPAGE_BPS = 100;

/**
 * The slack a deposit is sized with, in basis points. The pool can move between the plan and the transaction, and a
 * deposit for a fixed number of LP tokens then takes a little more of one side and less of the other. So the deposit
 * is sized to use all but this share of the coins on hand, and may take this much more Quote Asset than planned. The
 * coins it leaves stay in the rule's own account and go into the coin's next addition.
 */
export const LIQUIDITY_DEPOSIT_SLACK_BPS = 100;

/** A deposit for an exact number of LP tokens, per token in the pool's order. */
export type PoolDeposit = {
  lpAmount: BN;
  /** What each reserve gains: the LP's share of it, rounded up. */
  amounts: [BN, BN];
  /** What leaves the depositor's accounts for it: the amounts, plus any Token-2022 transfer fee on top. */
  transfers: [BN, BN];
};

/**
 * `deposit` exactly as raydium-cp-swap computes it: each side is the LP amount's share of that reserve, rounded up
 * unless the share is worth less than one unit, and the depositor pays any transfer fee on top. Null when the LP amount
 * is worth nothing of either token, which the program refuses (ZeroTradingTokens).
 */
export function poolDeposit(pool: Pick<Pool, "tokens" | "lpSupply">, lpAmount: BN): PoolDeposit | null {
  if (lpAmount.isZero() || pool.lpSupply.isZero()) return null;
  const side = (t: PoolToken) => {
    const product = lpAmount.mul(t.reserve);
    const share = product.div(pool.lpSupply);
    return share.isZero() || product.mod(pool.lpSupply).isZero() ? share : share.addn(1);
  };
  const [t0, t1] = pool.tokens;
  const amounts: [BN, BN] = [side(t0), side(t1)];
  if (amounts[0].isZero() || amounts[1].isZero()) return null;
  return { lpAmount, amounts, transfers: [grossForNet(amounts[0], t0.transferFee), grossForNet(amounts[1], t1.transferFee)] };
}

/** The most LP tokens whose deposit takes no more than `available` out of an account of one of the pool's tokens. */
function lpBackedBy(pool: Pick<Pool, "lpSupply">, token: PoolToken, available: BN) {
  // What reaches the vault when all of it is sent: no smaller transfer delivers as much, so no larger share fits.
  const arriving = available.sub(withheldFee(available, token.transferFee));
  return arriving.mul(pool.lpSupply).div(token.reserve);
}

/**
 * The pool as the next instruction of the same transaction finds it after `swap`: what arrived joins the input reserve
 * less the fees the pool sets aside for collection (Raydium's protocol and fund shares of the trade fee, each rounded
 * down, and the creator fee), and what was paid out leaves the output reserve. The LP supply is untouched.
 */
export function poolAfterSwap(pool: Pool, inputMint: PublicKey, swap: PoolSwap): Pool {
  const inputIsToken0 = pool.tokens[0].mint.equals(inputMint);
  const [input, output] = inputIsToken0 ? pool.tokens : [pool.tokens[1], pool.tokens[0]];
  const setAside = swap.tradeFee.mul(pool.rates.protocol).div(DENOMINATOR).add(swap.tradeFee.mul(pool.rates.fund).div(DENOMINATOR));
  const none = new BN(0);
  const after = {
    input: { ...input, reserve: input.reserve.add(swap.amountIn).sub(swap.transferFees.input).sub(setAside).sub(swap.creatorFeeOnInput ? swap.creatorFee : none) },
    output: { ...output, reserve: output.reserve.sub(swap.amountOut).sub(swap.transferFees.output).sub(swap.creatorFeeOnInput ? none : swap.creatorFee) },
  };
  return { ...pool, tokens: inputIsToken0 ? [after.input, after.output] : [after.output, after.input] };
}

/** One side of an addition's deposit. */
export type DepositSide = {
  /** What the pool's reserve gains. */
  added: BN;
  /** What leaves the depositor's account: `added`, plus any Token-2022 transfer fee on top. */
  transfer: BN;
  /** The most the deposit may take from the account before it fails. */
  maximum: BN;
};

/** One addition of liquidity, as planned from a pool: what its transaction buys, deposits and may spend. */
export type LiquidityAddition = {
  /**
   * The buy: exactly `coins` reach the buyer's account for `amountIn` of the Quote Asset at the pool as planned, and
   * for no more than `maxAmountIn`. Null when the coins already on hand need all the Quote Asset there is to pair them.
   */
  buy: { coins: BN; amountIn: BN; maxAmountIn: BN } | null;
  /** The LP tokens the deposit mints and the lock takes. */
  lpAmount: BN;
  /** The deposit as the pool stands right after the buy, per token in the pool's order. */
  deposit: PoolDeposit;
  coins: DepositSide;
  quote: DepositSide;
  /** The most Quote Asset the transaction can take: the buy's limit plus the deposit's. Never above the amount planned with. */
  budget: BN;
};

/**
 * Plans an addition that may use at most `amount` of the Quote Asset, with `held` coins already on hand from earlier
 * additions. It buys as many coins as leave enough Quote Asset to pair all the coins then on hand, less the slack: about
 * half of the amount each way. Null when the amount adds no liquidity at all.
 */
export function planLiquidityAddition(pool: Pool, coin: PublicKey, amount: BN, held: BN): LiquidityAddition | null {
  const { base, quote } = poolSides(pool, coin);
  // A pool with an empty side has no price to buy at and no proportion to deposit in.
  if (base.reserve.isZero() || quote.reserve.isZero() || pool.lpSupply.isZero()) return null;
  const coinIsToken0 = pool.tokens[0].mint.equals(base.mint);
  const attempt = (coins: BN) => {
    const swap = coins.isZero() ? null : poolSwapExactOut(pool, quote.mint, coins);
    if (!coins.isZero() && !swap) return null;
    const maxAmountIn = swap ? withAllowance(swap.amountIn, LIQUIDITY_BUY_SLIPPAGE_BPS) : new BN(0);
    if (maxAmountIn.gt(amount)) return null;
    const after = swap ? poolAfterSwap(pool, quote.mint, swap) : pool;
    const sides = poolSides(after, coin);
    const onHand = held.add(coins);
    const byCoins = lpBackedBy(after, sides.base, onHand.muln(10_000 - LIQUIDITY_DEPOSIT_SLACK_BPS).div(BPS));
    // The deposit's limit on the Quote Asset is its planned transfer with the slack on top, and must fit what the buy leaves.
    const byQuote = lpBackedBy(after, sides.quote, amount.sub(maxAmountIn).mul(BPS).divn(10_000 + LIQUIDITY_DEPOSIT_SLACK_BPS));
    return { swap, maxAmountIn, after, onHand, byCoins, byQuote };
  };
  // The more coins the buy takes, the more LP tokens they back and the less Quote Asset is left to pair them with, so
  // the most coins that can still be paired is found by bisection, between none and what the whole amount would buy.
  let low = new BN(0);
  let high = poolSwap(pool, quote.mint, amount).amountOut;
  while (low.lt(high)) {
    const middle = low.add(high).addn(1).divn(2);
    const a = attempt(middle);
    if (a && a.byCoins.lte(a.byQuote)) low = middle;
    else high = middle.subn(1);
  }
  const chosen = attempt(low);
  if (!chosen) return null;
  const deposit = poolDeposit(chosen.after, BN.min(chosen.byCoins, chosen.byQuote));
  if (!deposit) return null;
  const [coinIndex, quoteIndex] = coinIsToken0 ? [0, 1] as const : [1, 0] as const;
  const quoteMaximum = withAllowance(deposit.transfers[quoteIndex], LIQUIDITY_DEPOSIT_SLACK_BPS);
  return {
    buy: chosen.swap ? { coins: low, amountIn: chosen.swap.amountIn, maxAmountIn: chosen.maxAmountIn } : null,
    lpAmount: deposit.lpAmount,
    deposit,
    // The deposit may take every coin on hand: the slack it was sized with is what a moved pool can use up.
    coins: { added: deposit.amounts[coinIndex], transfer: deposit.transfers[coinIndex], maximum: chosen.onHand },
    quote: { added: deposit.amounts[quoteIndex], transfer: deposit.transfers[quoteIndex], maximum: quoteMaximum },
    budget: chosen.maxAmountIn.add(quoteMaximum),
  };
}

/** A Fee Key's accounts for a position this owner opens: the NFT in the owner's associated account, and the lock's record. */
export function lockedPositionOf(lock: PublicKey, feeKey: PublicKey, owner: PublicKey) {
  return { feeKeyAccount: getAssociatedTokenAddressSync(feeKey, owner, true), lockedLiquidity: lockPdas(lock).lockedLiquidity(feeKey) };
}

/**
 * `lock_cp_liquidity`: moves exactly `lpAmount` LP tokens from the owner's account into the lock program's vault for
 * good, and opens a locked position whose trading fees the holder of a new Fee Key NFT collects (`collect_cp_fees`).
 * The Fee Key's mint is a fresh keypair that signs the transaction; the NFT goes to the owner's associated account.
 * The owner pays the rent of the mint, the NFT's account and the position's record, and of the NFT's metadata when asked.
 */
export function lockCpLiquidityIx(
  lock: PublicKey, pool: Pick<Pool, "address" | "lpMint" | "tokens">,
  p: { owner: PublicKey; lpAccount: PublicKey; feeKey: PublicKey; lpAmount: BN; withMetadata: boolean },
) {
  const lk = lockPdas(lock);
  const position = lockedPositionOf(lock, p.feeKey, p.owner);
  return new TransactionInstruction({
    programId: lock,
    data: lockCoder.instruction.encode("lock_cp_liquidity", { lp_amount: p.lpAmount, with_metadata: p.withMetadata }),
    keys: [
      meta(lk.authority),
      meta(p.owner, true, true),
      meta(p.owner, true),
      meta(p.owner),
      meta(p.feeKey, true, true),
      meta(position.feeKeyAccount, false, true),
      meta(pool.address),
      meta(position.lockedLiquidity, false, true),
      meta(pool.lpMint),
      meta(p.lpAccount, false, true),
      meta(getAssociatedTokenAddressSync(pool.lpMint, lk.authority, true), false, true),
      meta(pool.tokens[0].vault, false, true),
      meta(pool.tokens[1].vault, false, true),
      meta(metadataPda(p.feeKey), false, true),
      meta(SYSVAR_RENT_PUBKEY),
      meta(SystemProgram.programId),
      meta(TOKEN_PROGRAM_ID),
      meta(ASSOCIATED_TOKEN_PROGRAM_ID),
      meta(METADATA_PROGRAM),
    ],
  });
}

/**
 * Where the liquidity rule keeps a coin between its additions: a token account of the owner at an address derived from
 * the owner, the coin and the coin's token program, so it is the same for every addition and is never the owner's
 * associated account of the coin, which holds other things. The seed is sixteen characters from the middle of the
 * coin's address, clear of any vanity prefix or suffix; that is 93 bits, and a transaction has no room for more.
 */
export async function liquidityCoinAccount(owner: PublicKey, coin: PublicKey, tokenProgram: PublicKey) {
  const seed = coin.toBase58().slice(12, 28);
  return { seed, address: await PublicKey.createWithSeed(owner, seed, tokenProgram) };
}

/**
 * Opens a token account at an address derived from its owner and a seed. The address is funded and then allocated,
 * rather than created in one step: creating fails once an address holds any lamports, and anyone can send some to an
 * address they can work out. `lamports` is what the address holds now, `rent` what an account of `space` bytes must.
 */
export function openSeededTokenAccount(p: {
  owner: PublicKey; address: PublicKey; seed: string; mint: PublicKey; tokenProgram: PublicKey; space: number; rent: number; lamports: number;
}) {
  return [
    ...(p.lamports < p.rent ? [SystemProgram.transfer({ fromPubkey: p.owner, toPubkey: p.address, lamports: p.rent - p.lamports })] : []),
    SystemProgram.allocate({ accountPubkey: p.address, basePubkey: p.owner, seed: p.seed, space: p.space, programId: p.tokenProgram }),
    // The first initialize instruction takes the owner as an account the transaction already names, where the later
    // ones spend 32 bytes on it.
    createInitializeAccountInstruction(p.address, p.mint, p.owner, p.tokenProgram),
  ];
}

export type LiquidityAddRequest = {
  programs: Pick<Programs, "cpmm" | "lock">;
  /** The pool as the addition was planned from it. */
  pool: Pool;
  coin: PublicKey;
  /** Pays for everything and owns every account: the operations wallet. */
  owner: PublicKey;
  addition: LiquidityAddition;
  /** The rule's own account of the coin, with the instructions that open it when it does not exist yet. */
  coinAccount: { address: PublicKey; open: TransactionInstruction[] };
  /** The new Fee Key's mint, which signs beside the owner. */
  feeKey: PublicKey;
};

/**
 * The compute-unit limit of a liquidity addition. On the local chain one used 197,000 units with its accounts open
 * already and up to 216,000 when it opened them, with a Token-2022 coin; most of it is the lock, which creates the Fee
 * Key's mint, its account and the position's record. The rest is room for the addresses the programs derive, whose
 * cost varies from one to the next.
 */
const LIQUIDITY_ADD_COMPUTE_UNITS = 300_000;

/**
 * The instructions of one liquidity addition, for the owner and the new Fee Key's mint to sign: the buy, the deposit
 * and the lock, all or nothing. The Quote Asset comes from the owner's own account of it. SOL is wrapped for the
 * transaction, as much as it may take, and what it leaves is unwrapped at the end, so the owner pays in plain SOL.
 * The owner's LP account stays open, empty, for the pool's next addition.
 */
export function liquidityAddInstructions(r: LiquidityAddRequest): TransactionInstruction[] {
  const { programs, pool, owner, addition } = r;
  const { base, quote } = poolSides(pool, r.coin);
  const sol = quote.mint.equals(WSOL_MINT);
  const quoteAccount = getAssociatedTokenAddressSync(quote.mint, owner, true, quote.program);
  const lpAccount = getAssociatedTokenAddressSync(pool.lpMint, owner, true);
  const coinIsToken0 = pool.tokens[0].mint.equals(base.mint);
  const inPoolOrder = <T>(ofCoin: T, ofQuote: T): [T, T] => (coinIsToken0 ? [ofCoin, ofQuote] : [ofQuote, ofCoin]);
  return [
    ComputeBudgetProgram.setComputeUnitLimit({ units: LIQUIDITY_ADD_COMPUTE_UNITS }),
    ...r.coinAccount.open,
    ...(sol
      ? [
          createAssociatedTokenAccountIdempotentInstruction(owner, quoteAccount, owner, WSOL_MINT),
          SystemProgram.transfer({ fromPubkey: owner, toPubkey: quoteAccount, lamports: BigInt(addition.budget.toString()) }),
          createSyncNativeInstruction(quoteAccount),
        ]
      : []),
    ...(addition.buy
      ? [
          swapBaseOutputIx(programs.cpmm, pool, {
            payer: owner, input: quote, output: base, inputAccount: quoteAccount, outputAccount: r.coinAccount.address,
            amountOut: addition.buy.coins, maxAmountIn: addition.buy.maxAmountIn,
          }),
        ]
      : []),
    createAssociatedTokenAccountIdempotentInstruction(owner, lpAccount, owner, pool.lpMint),
    depositIx(programs.cpmm, pool, {
      owner, lpAccount, tokenAccounts: inPoolOrder(r.coinAccount.address, quoteAccount), lpAmount: addition.lpAmount,
      maximums: inPoolOrder(addition.coins.maximum, addition.quote.maximum),
    }),
    // No metadata for the Fee Key: the lock does not need it, and it would cost the position more rent than the rest.
    lockCpLiquidityIx(programs.lock, pool, { owner, lpAccount, feeKey: r.feeKey, lpAmount: addition.lpAmount, withMetadata: false }),
    ...(sol ? [createCloseAccountInstruction(quoteAccount, owner, owner)] : []),
  ];
}

/**
 * A coin's CPMM pool once Raydium has migrated its curve there, found from the curve alone; null while the coin still
 * trades on the curve or waits for the migration.
 */
export async function graduatedPool(connection: Connection, programs: Pick<Programs, "cpmm">, curve: PublicKey): Promise<PublicKey | null> {
  const account = await connection.getAccountInfo(curve, "confirmed");
  if (!account) throw new Error(`no curve at ${curve.toBase58()}`);
  const s = launchlabCoder.accounts.decode("PoolState", account.data) as { status: number; platform_config: PublicKey; base_mint: PublicKey; quote_mint: PublicKey };
  // 0 is trading and 1 sold out, waiting for the migration.
  if (s.status < 2) return null;
  const platform = await connection.getAccountInfo(s.platform_config, "confirmed");
  if (!platform) throw new Error(`curve ${curve.toBase58()} points at a missing PlatformConfig`);
  const p = launchlabCoder.accounts.decode("PlatformConfig", platform.data) as { cpswap_config: PublicKey };
  return cpmmPdas(programs.cpmm).pool(p.cpswap_config, s.base_mint, s.quote_mint);
}

/** What a landed liquidity addition did, read back from its transaction; raw units. */
export type LiquidityAdded = {
  /** Coins the buy delivered to the buyer's account. */
  coinsBought: BN;
  /** What the deposit added to the pool's two reserves. */
  coinsAdded: BN;
  quoteAdded: BN;
  /** The LP tokens the deposit minted. */
  lpAmount: BN;
};

type SwapEventData = { pool_id: PublicKey; output_amount: BN; output_transfer_fee: BN; output_mint: PublicKey };
type LpChangeEventData = { pool_id: PublicKey; token_0_amount: BN; token_1_amount: BN; change_type: number };

// Positions in `deposit`'s accounts, and the event type a deposit writes.
const DEPOSIT = { pool: 2, mint0: 10 } as const;
const LP_CHANGE_DEPOSIT = 0;

/**
 * Reads a liquidity addition back from its confirmed transaction: the coins its buy delivered, and what its deposit
 * added to each reserve, from the events the pool's program wrote for the two (a transfer's own amount would also count
 * any Token-2022 transfer fee, which never reaches the reserve). Null for a failed transaction or one with no deposit
 * into this pool.
 */
export function decodeLiquidityAddition(raw: RawTransaction, cpmm: PublicKey, pool: PublicKey, coin: PublicKey): LiquidityAdded | null {
  const txMeta = raw.meta;
  if (!txMeta || txMeta.err) return null;
  const keys = [...raw.transaction.message.accountKeys, ...(txMeta.loadedAddresses?.writable ?? []), ...(txMeta.loadedAddresses?.readonly ?? [])];
  const deposit = raw.transaction.message.instructions.find((ix) => {
    if (keys[ix.programIdIndex] !== cpmm.toBase58() || keys[ix.accounts[DEPOSIT.pool]!] !== pool.toBase58()) return false;
    return safely(() => cpmmCoder.instruction.decode(Buffer.from(bs58.decode(ix.data))))?.name === "deposit";
  });
  if (!deposit) return null;
  const args = cpmmCoder.instruction.decode(Buffer.from(bs58.decode(deposit.data)))!.data as { lp_token_amount: BN };
  const events = programDataLogs(txMeta.logMessages ?? [], cpmm.toBase58()).flatMap((data) => safely(() => cpmmCoder.events.decode(data)) ?? []);
  const swaps = events.filter((e) => e.name === "SwapEvent").map((e) => e.data as SwapEventData).filter((e) => e.pool_id.equals(pool) && e.output_mint.equals(coin));
  const added = events.filter((e) => e.name === "LpChangeEvent").map((e) => e.data as LpChangeEventData).find((e) => e.pool_id.equals(pool) && e.change_type === LP_CHANGE_DEPOSIT);
  if (!added) throw new Error(`transaction ${raw.transaction.signatures[0]} deposits into pool ${pool.toBase58()} but its log has no event for it`);
  const coinIsToken0 = keys[deposit.accounts[DEPOSIT.mint0]!] === coin.toBase58();
  return {
    coinsBought: swaps.reduce((sum, e) => sum.add(e.output_amount).sub(e.output_transfer_fee), new BN(0)),
    coinsAdded: coinIsToken0 ? added.token_0_amount : added.token_1_amount,
    quoteAdded: coinIsToken0 ? added.token_1_amount : added.token_0_amount,
    lpAmount: args.lp_token_amount,
  };
}

function safely<T>(decode: () => T): T | null {
  try {
    return decode();
  } catch {
    return null;
  }
}
