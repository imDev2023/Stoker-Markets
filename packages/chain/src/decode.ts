import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import BN from "bn.js";
import { cpmmCoder, launchlabCoder } from "./coder";
import type { CurveReserves, Side, TradeFees } from "./curve";
import { LAUNCH_SHAPE, REWARD_TAX_BPS } from "./shape";
import type { Programs } from "./programs";
import type { CurveStatus } from "./trade";

type RawInstruction = { programIdIndex: number; accounts: number[]; data: string };

/**
 * The transaction shape Helius delivers in "raw" webhooks, which is the RPC `getTransaction` JSON encoding.
 * Only the fields the decoder reads are typed.
 */
export type RawTransaction = {
  slot: number;
  blockTime: number | null;
  transaction: {
    signatures: string[];
    message: {
      accountKeys: string[];
      /** Which of the static keys are signers and which read-only; the rest are writable. */
      header?: { numRequiredSignatures: number; numReadonlySignedAccounts: number; numReadonlyUnsignedAccounts: number };
      instructions: RawInstruction[];
    };
  };
  meta: {
    err: unknown;
    loadedAddresses?: { writable: string[]; readonly: string[] };
    innerInstructions?: { index: number; instructions: RawInstruction[] }[];
    preTokenBalances?: RawTokenBalance[];
    postTokenBalances?: RawTokenBalance[];
    logMessages?: string[] | null;
  } | null;
};

type RawTokenBalance = { accountIndex?: number; mint: string; owner?: string; uiTokenAmount: { amount: string; decimals: number } };

export type LaunchCreated = {
  kind: "launch_created";
  signature: string;
  slot: number;
  blockTime: number | null;
  pool: PublicKey;
  creator: PublicKey;
  globalConfig: PublicKey;
  platformConfig: PublicKey;
  baseMint: PublicKey;
  quoteMint: PublicKey;
  name: string;
  symbol: string;
  uri: string;
  decimals: number;
  /** The Quote Asset's decimals, from the launch's token balances (the launch opens the curve's quote vault). */
  quoteDecimals: number;
  supply: BN;
  totalBaseSell: BN;
  graduationTargetRaw: BN;
  /**
   * Whether the launch has the shape our curve rules pin on-chain (LAUNCH_SHAPE, no vesting; an SPL coin, or a Token-2022
   * coin with a Reward Tax at one of our rates). A launch against a GlobalConfig our rules don't cover yet can have any
   * shape (ADR 0005).
   */
  standardShape: boolean;
  /** The Reward Tax of a Reward Launch, in basis points; null for a standard coin. */
  rewardTaxBps: number | null;
  /** The coin's token program: SPL Token, or Token-2022 for a Reward Launch. */
  baseTokenProgram: PublicKey;
};

/** One trade on a curve: the program's own TradeEvent plus the accounts of the instruction that emitted it. */
export type TradeExecuted = {
  kind: "trade";
  signature: string;
  slot: number;
  blockTime: number | null;
  /** Position among the events in this transaction, so a transaction with several trades indexes each one once. */
  index: number;
  trader: PublicKey;
  pool: PublicKey;
  platformConfig: PublicKey;
  baseMint: PublicKey;
  quoteMint: PublicKey;
  /** A referred trade's share fee receiver (the referrer's Quote Asset account) and its owner, the referrer; null otherwise. */
  shareFeeReceiver: PublicKey | null;
  referrer: PublicKey | null;
  side: Side;
  /** Quote Asset paid including fees for a buy, coins for a sell. */
  amountIn: BN;
  /** Coins for a buy, Quote Asset received after fees for a sell. */
  amountOut: BN;
  fees: TradeFees;
  before: CurveReserves;
  after: CurveReserves;
  /** The curve's status after the trade; a buy that sells out the curve leaves it graduating. */
  status: CurveStatus;
  baseDecimals: number;
  quoteDecimals: number;
};

/** Raydium's migrate wallet moved a sold-out curve into its CPMM pool: the Launch has graduated. */
export type Graduated = {
  kind: "graduated";
  signature: string;
  slot: number;
  blockTime: number | null;
  /** The LaunchLab curve that sold out. */
  curve: PublicKey;
  /** The CPMM pool the Launch now trades in. */
  pool: PublicKey;
  platformConfig: PublicKey;
  baseMint: PublicKey;
  quoteMint: PublicKey;
};

/**
 * One swap in a CPMM pool: the program's own SwapEvent plus the accounts of the instruction that emitted it.
 * Any CPMM pool's swaps decode; the Indexer keeps those in pools our Launches graduated into.
 */
export type PoolSwapExecuted = {
  kind: "pool_swap";
  signature: string;
  slot: number;
  blockTime: number | null;
  /** Position among the events in this transaction. */
  index: number;
  trader: PublicKey;
  pool: PublicKey;
  inputMint: PublicKey;
  outputMint: PublicKey;
  /** What left the trader's account, including any Token-2022 transfer fee. */
  amountIn: BN;
  /** What reached the trader's account, after the creator fee and any transfer fee. */
  amountOut: BN;
  /** Raydium's trade fee, in the input token. */
  tradeFee: BN;
  /** The pool creator's fee, in the input token when `creatorFeeOnInput`, otherwise in the output token. */
  creatorFee: BN;
  creatorFeeOnInput: boolean;
  /** The pool's constant-product position before and after, fees excluded, as [input, output] reserves. */
  before: [BN, BN];
  after: [BN, BN];
  inputDecimals: number;
  outputDecimals: number;
};

/** The platform's admin changed the PlatformConfig: its fee rates, when the change names them. */
export type PlatformConfigUpdated = {
  kind: "platform_config_updated";
  signature: string;
  slot: number;
  blockTime: number | null;
  platformConfig: PublicKey;
  /** The Platform Fee and Creator Fee rates the change set, in the 1e6 denominator; null for a field it left alone. */
  feeRate: BN | null;
  creatorFeeRate: BN | null;
};

export type ChainEvent = LaunchCreated | TradeExecuted | Graduated | PoolSwapExecuted | PlatformConfigUpdated;

const INITIALIZE_IXS = new Set(["initialize", "initialize_v2", "initialize_with_token_2022"]);
// Account positions shared by all three initialize instructions.
const IX_ACCOUNT = { creator: 1, globalConfig: 2, platformConfig: 3, pool: 5, baseMint: 6, quoteMint: 7 } as const;

const TRADE_IXS = new Set(["buy_exact_in", "buy_exact_out", "sell_exact_in", "sell_exact_out"]);
// Account positions of `migrate_to_cpswap`.
const MIGRATE_ACCOUNT = { baseMint: 1, quoteMint: 2, platformConfig: 3, pool: 5, curve: 17 } as const;
// Account positions shared by CPMM's two swap instructions.
const SWAP_IXS = new Set(["swap_base_input", "swap_base_output"]);
const SWAP_ACCOUNT = { payer: 0, pool: 3 } as const;
// A referred trade names the referrer's Quote Asset account right after the fixed accounts, before the system program.
const SHARE_RECEIVER_ACCOUNT = 15;
const TRADE_ACCOUNTS_WITH_SHARE = 18;
const UPDATE_PLATFORM_ACCOUNT = { platformConfig: 1 } as const;
// Account positions shared by all four trade instructions.
const TRADE_ACCOUNT = { trader: 0, platformConfig: 3, pool: 4, baseMint: 9, quoteMint: 10 } as const;

// Anchor's `emit_cpi!` invokes the program itself with this tag, followed by the event's discriminator and data.
const EVENT_IX_TAG = Buffer.from("e445a52e51cb9a1d", "hex");
const STATUS: Record<string, CurveStatus> = { Fund: "live", Migrate: "graduating", Trade: "graduated" };

type TradeEventData = {
  pool_state: PublicKey; total_base_sell: BN; virtual_base: BN; virtual_quote: BN;
  real_base_before: BN; real_quote_before: BN; real_base_after: BN; real_quote_after: BN;
  amount_in: BN; amount_out: BN; protocol_fee: BN; platform_fee: BN; creator_fee: BN; share_fee: BN;
  trade_direction: { Buy?: object; Sell?: object }; pool_status: Record<string, object>;
};

type SwapEventData = {
  pool_id: PublicKey; input_vault_before: BN; output_vault_before: BN; input_amount: BN; output_amount: BN;
  input_transfer_fee: BN; output_transfer_fee: BN; input_mint: PublicKey; output_mint: PublicKey;
  trade_fee: BN; creator_fee: BN; creator_fee_on_input: boolean;
};

type TradeAccounts = Pick<TradeExecuted, "trader" | "platformConfig" | "pool" | "baseMint" | "quoteMint" | "shareFeeReceiver" | "referrer">;

/**
 * The accounts a confirmed transaction may have written: the static keys its header marks writable, and the writable
 * ones it loaded through lookup tables. What only changes a mint's settings (an authority, a fee, a pause) names the
 * mint writable, while a transfer or trade names it read-only, so this tells the Indexer which Quote Assets to re-read.
 */
export function writableAccounts(raw: RawTransaction): string[] {
  const { accountKeys, header } = raw.transaction.message;
  const loaded = raw.meta?.loadedAddresses?.writable ?? [];
  if (!header) return [...accountKeys, ...loaded];
  const signers = header.numRequiredSignatures;
  const writable = accountKeys.filter((_, i) =>
    i < signers ? i < signers - header.numReadonlySignedAccounts : i < accountKeys.length - header.numReadonlyUnsignedAccounts,
  );
  return [...writable, ...loaded];
}

/**
 * Turns one confirmed transaction into the LaunchLab and CPMM events we index, in execution order.
 * Failed transactions yield nothing.
 */
export function decodeTransaction(raw: RawTransaction, programs: Pick<Programs, "launchlab" | "cpmm">): ChainEvent[] {
  const meta = raw.meta;
  if (!meta || meta.err) return [];
  const keys = [
    ...raw.transaction.message.accountKeys,
    ...(meta.loadedAddresses?.writable ?? []),
    ...(meta.loadedAddresses?.readonly ?? []),
  ];
  const program = programs.launchlab.toBase58();
  const cpmm = programs.cpmm.toBase58();
  // CPMM writes its SwapEvent to the log rather than through a self-invocation, so swaps pair with their events in order.
  const swapEvents = programDataLogs(meta.logMessages ?? [], cpmm)
    .map((data) => safeDecodeCpmmEvent(data))
    .filter((e) => e?.name === "SwapEvent")
    .map((e) => e!.data as SwapEventData);
  const signature = raw.transaction.signatures[0]!;
  // Both mints always have a balance entry: every trade moves tokens through the curve's two vaults.
  const decimalsOf = (mint: PublicKey) => {
    const balance = meta.postTokenBalances?.find((b) => b.mint === mint.toBase58());
    if (!balance) throw new Error(`transaction ${signature} has no token balance for ${mint.toBase58()}`);
    return balance.uiTokenAmount.decimals;
  };
  // Who owns a token account the transaction touched, from its balance entries.
  const ownerOf = (account: PublicKey) =>
    [...(meta.postTokenBalances ?? []), ...(meta.preTokenBalances ?? [])].find((b) => b.accountIndex !== undefined && keys[b.accountIndex] === account.toBase58())?.owner ?? null;
  // Each top-level instruction followed by the instructions it invoked, in execution order,
  // so a TradeEvent comes right after the trade instruction that emitted it.
  const groups = raw.transaction.message.instructions.map((ix, i) => [
    ix,
    ...(meta.innerInstructions?.find((g) => g.index === i)?.instructions ?? []),
  ]);
  const events: ChainEvent[] = [];
  // One counter for every kind of event: `trades` rows are keyed by (signature, index) whatever the venue, so a
  // transaction that trades on a curve and swaps in a pool must give the two different indexes.
  let eventIndex = 0;
  // Pool swaps pair with the SwapEvents in the log by order, kept apart from the event index.
  let swapEventIndex = 0;
  for (const group of groups) {
    let trade: TradeAccounts | null = null;
    for (const ix of group) {
      const acct = (i: number) => new PublicKey(keys[ix.accounts[i]!]!);
      if (keys[ix.programIdIndex] === cpmm) {
        const swap = safeDecodeCpmmIx(Buffer.from(bs58.decode(ix.data)));
        if (!swap || !SWAP_IXS.has(swap.name)) continue;
        const e = swapEvents[swapEventIndex];
        if (!e || !e.pool_id.equals(acct(SWAP_ACCOUNT.pool))) continue;
        swapEventIndex++;
        const net = e.input_amount.sub(e.trade_fee).sub(e.creator_fee_on_input ? e.creator_fee : new BN(0));
        const swapped = e.output_amount.add(e.creator_fee_on_input ? new BN(0) : e.creator_fee);
        events.push({
          kind: "pool_swap",
          signature,
          slot: raw.slot,
          blockTime: raw.blockTime,
          index: eventIndex++,
          trader: acct(SWAP_ACCOUNT.payer),
          pool: e.pool_id,
          inputMint: e.input_mint,
          outputMint: e.output_mint,
          amountIn: e.input_amount.add(e.input_transfer_fee),
          amountOut: e.output_amount.sub(e.output_transfer_fee),
          tradeFee: e.trade_fee,
          creatorFee: e.creator_fee,
          creatorFeeOnInput: e.creator_fee_on_input,
          before: [e.input_vault_before, e.output_vault_before],
          after: [e.input_vault_before.add(net), e.output_vault_before.sub(swapped)],
          inputDecimals: decimalsOf(e.input_mint),
          outputDecimals: decimalsOf(e.output_mint),
        });
        continue;
      }
      if (keys[ix.programIdIndex] !== program) continue;
      const bytes = Buffer.from(bs58.decode(ix.data));
      if (bytes.subarray(0, 8).equals(EVENT_IX_TAG)) {
        const event = safeDecodeEvent(bytes.subarray(8));
        if (event?.name !== "TradeEvent" || !trade) continue;
        const e = event.data as TradeEventData;
        if (!e.pool_state.equals(trade.pool)) continue;
        const reserves = (realBase: BN, realQuote: BN): CurveReserves => ({
          virtualBase: e.virtual_base, virtualQuote: e.virtual_quote, realBase, realQuote, totalBaseSell: e.total_base_sell,
        });
        events.push({
          kind: "trade",
          signature,
          slot: raw.slot,
          blockTime: raw.blockTime,
          index: eventIndex++,
          ...trade,
          side: e.trade_direction.Buy ? "buy" : "sell",
          amountIn: e.amount_in,
          amountOut: e.amount_out,
          fees: { protocol: e.protocol_fee, platform: e.platform_fee, creator: e.creator_fee, share: e.share_fee ?? new BN(0) },
          before: reserves(e.real_base_before, e.real_quote_before),
          after: reserves(e.real_base_after, e.real_quote_after),
          status: STATUS[Object.keys(e.pool_status)[0]!] ?? "graduated",
          baseDecimals: decimalsOf(trade.baseMint),
          quoteDecimals: decimalsOf(trade.quoteMint),
        });
        trade = null;
        continue;
      }
      const decoded = safeDecodeIx(bytes);
      if (!decoded) continue;
      if (decoded.name === "update_platform_config") {
        const param = (decoded.data as { param: Record<string, Record<string, unknown>> }).param;
        const [variant, value] = Object.entries(param)[0] ?? ["", {}];
        const info = variant === "AllInfo" ? (value["0"] as { fee_rate: BN; creator_fee_rate: BN }) : null;
        events.push({
          kind: "platform_config_updated",
          signature,
          slot: raw.slot,
          blockTime: raw.blockTime,
          platformConfig: acct(UPDATE_PLATFORM_ACCOUNT.platformConfig),
          feeRate: info ? info.fee_rate : variant === "FeeRate" ? (value["0"] as BN) : null,
          creatorFeeRate: info ? info.creator_fee_rate : null,
        });
        continue;
      }
      if (TRADE_IXS.has(decoded.name)) {
        const shareFeeReceiver = ix.accounts.length >= TRADE_ACCOUNTS_WITH_SHARE ? acct(SHARE_RECEIVER_ACCOUNT) : null;
        const referrerOwner = shareFeeReceiver ? ownerOf(shareFeeReceiver) : null;
        trade = {
          trader: acct(TRADE_ACCOUNT.trader),
          platformConfig: acct(TRADE_ACCOUNT.platformConfig),
          pool: acct(TRADE_ACCOUNT.pool),
          baseMint: acct(TRADE_ACCOUNT.baseMint),
          quoteMint: acct(TRADE_ACCOUNT.quoteMint),
          shareFeeReceiver,
          referrer: referrerOwner ? new PublicKey(referrerOwner) : null,
        };
        continue;
      }
      if (decoded.name === "migrate_to_cpswap") {
        events.push({
          kind: "graduated",
          signature,
          slot: raw.slot,
          blockTime: raw.blockTime,
          curve: acct(MIGRATE_ACCOUNT.curve),
          pool: acct(MIGRATE_ACCOUNT.pool),
          platformConfig: acct(MIGRATE_ACCOUNT.platformConfig),
          baseMint: acct(MIGRATE_ACCOUNT.baseMint),
          quoteMint: acct(MIGRATE_ACCOUNT.quoteMint),
        });
        continue;
      }
      if (!INITIALIZE_IXS.has(decoded.name)) continue;
      const data = decoded.data as {
        base_mint_param: { decimals: number; name: string; symbol: string; uri: string };
        curve_param: { Constant?: { data: { supply: BN; total_base_sell: BN; total_quote_fund_raising: BN; migrate_type: number } } };
        vesting_param: { total_locked_amount: BN; cliff_period: BN; unlock_period: BN };
        amm_fee_on?: Record<string, object>;
        transfer_fee_extension_param?: { transfer_fee_basis_points: number; maximum_fee: BN } | null;
      };
      const curve = data.curve_param.Constant?.data;
      if (!curve) continue; // our platform only allows the constant-product curve
      const vesting = data.vesting_param;
      const token2022 = decoded.name === "initialize_with_token_2022";
      const taxBps = token2022 ? (data.transfer_fee_extension_param?.transfer_fee_basis_points ?? 0) : 0;
      // A Reward Launch: a Token-2022 coin taxed at one of our rates; a Token-2022 coin without one, or at another rate, is off-shape.
      const rewardShape = token2022 && (REWARD_TAX_BPS as readonly number[]).includes(taxBps);
      const standardShape =
        (!token2022 || rewardShape) &&
        data.base_mint_param.decimals === LAUNCH_SHAPE.decimals &&
        curve.supply.eq(LAUNCH_SHAPE.supply) &&
        curve.total_base_sell.eq(LAUNCH_SHAPE.totalBaseSell) &&
        curve.migrate_type === LAUNCH_SHAPE.migrateType &&
        vesting.total_locked_amount.isZero() && vesting.cliff_period.isZero() && vesting.unlock_period.isZero() &&
        // The original `initialize` has no fee-on argument, so only the rest of its shape is checked.
        (!data.amm_fee_on || LAUNCH_SHAPE.ammFeeOn in data.amm_fee_on);
      events.push({
        kind: "launch_created",
        signature,
        slot: raw.slot,
        blockTime: raw.blockTime,
        pool: acct(IX_ACCOUNT.pool),
        creator: acct(IX_ACCOUNT.creator),
        globalConfig: acct(IX_ACCOUNT.globalConfig),
        platformConfig: acct(IX_ACCOUNT.platformConfig),
        baseMint: acct(IX_ACCOUNT.baseMint),
        quoteMint: acct(IX_ACCOUNT.quoteMint),
        name: data.base_mint_param.name,
        symbol: data.base_mint_param.symbol,
        uri: data.base_mint_param.uri,
        decimals: data.base_mint_param.decimals,
        quoteDecimals: decimalsOf(acct(IX_ACCOUNT.quoteMint)),
        supply: curve.supply,
        totalBaseSell: curve.total_base_sell,
        graduationTargetRaw: curve.total_quote_fund_raising,
        standardShape,
        rewardTaxBps: rewardShape ? taxBps : null,
        baseTokenProgram: new PublicKey(token2022 ? "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb" : "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
      });
    }
  }
  return events;
}

/**
 * The `Program data:` payloads a program logged itself (Anchor's `emit!`), in order. Logs nest by invocation, so each
 * payload belongs to the program on top of the invocation stack when it was written.
 */
function programDataLogs(logs: string[], programId: string) {
  const stack: string[] = [];
  const out: string[] = [];
  for (const line of logs) {
    const invoke = /^Program (\S+) invoke \[\d+\]$/.exec(line);
    if (invoke) stack.push(invoke[1]!);
    else if (/^Program \S+ (success|failed)/.test(line)) stack.pop();
    else if (line.startsWith("Program data: ") && stack.at(-1) === programId) out.push(line.slice("Program data: ".length).split(" ")[0]!);
  }
  return out;
}

function safeDecodeCpmmIx(data: Buffer) {
  try {
    return cpmmCoder.instruction.decode(data);
  } catch {
    return null;
  }
}

function safeDecodeCpmmEvent(base64: string) {
  try {
    return cpmmCoder.events.decode(base64);
  } catch {
    return null;
  }
}

function safeDecodeIx(data: Buffer) {
  try {
    return launchlabCoder.instruction.decode(data);
  } catch {
    return null;
  }
}

function safeDecodeEvent(data: Uint8Array) {
  try {
    return launchlabCoder.events.decode(Buffer.from(data).toString("base64"));
  } catch {
    return null;
  }
}
