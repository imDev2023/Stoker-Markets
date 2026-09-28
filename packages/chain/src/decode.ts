import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import BN from "bn.js";
import { launchlabCoder } from "./coder";
import type { CurveReserves, Side, TradeFees } from "./curve";
import { LAUNCH_SHAPE } from "./shape";
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
      instructions: RawInstruction[];
    };
  };
  meta: {
    err: unknown;
    loadedAddresses?: { writable: string[]; readonly: string[] };
    innerInstructions?: { index: number; instructions: RawInstruction[] }[];
    postTokenBalances?: { mint: string; uiTokenAmount: { decimals: number } }[];
  } | null;
};

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
  supply: BN;
  totalBaseSell: BN;
  graduationTargetRaw: BN;
  /**
   * Whether the launch has the shape our curve rules pin on-chain (LAUNCH_SHAPE, an SPL coin, no vesting). A launch
   * against a GlobalConfig our rules don't cover yet can have any shape (ADR 0005).
   */
  standardShape: boolean;
};

/** One trade on a curve: the program's own TradeEvent plus the accounts of the instruction that emitted it. */
export type TradeExecuted = {
  kind: "trade";
  signature: string;
  slot: number;
  blockTime: number | null;
  /** Position among the trades in this transaction, so a transaction with several trades indexes each one once. */
  index: number;
  trader: PublicKey;
  pool: PublicKey;
  platformConfig: PublicKey;
  baseMint: PublicKey;
  quoteMint: PublicKey;
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

/** A Creator moved their Creator Fee for one Quote Asset out of its vault. */
export type CreatorFeeClaimed = {
  kind: "creator_fee_claimed";
  signature: string;
  slot: number;
  blockTime: number | null;
  /** Position among the claims in this transaction. */
  index: number;
  creator: PublicKey;
  quoteMint: PublicKey;
  vault: PublicKey;
  /** Raw units of the Quote Asset that left the vault. */
  amount: BN;
  quoteDecimals: number;
};

export type ChainEvent = LaunchCreated | TradeExecuted | CreatorFeeClaimed;

const INITIALIZE_IXS = new Set(["initialize", "initialize_v2", "initialize_with_token_2022"]);
// Account positions shared by all three initialize instructions.
const IX_ACCOUNT = { creator: 1, globalConfig: 2, platformConfig: 3, pool: 5, baseMint: 6, quoteMint: 7 } as const;

const TRADE_IXS = new Set(["buy_exact_in", "buy_exact_out", "sell_exact_in", "sell_exact_out"]);
// Account positions shared by all four trade instructions.
const TRADE_ACCOUNT = { trader: 0, platformConfig: 3, pool: 4, baseMint: 9, quoteMint: 10 } as const;

// Account positions in claim_creator_fee.
const CLAIM_ACCOUNT = { creator: 0, vault: 2, quoteMint: 4 } as const;
// The token programs a claim pays out through, and their Transfer and TransferChecked instruction tags.
const TOKEN_PROGRAMS = new Set([
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
]);
const TOKEN_TRANSFER = 3;
const TOKEN_TRANSFER_CHECKED = 12;

// Anchor's `emit_cpi!` invokes the program itself with this tag, followed by the event's discriminator and data.
const EVENT_IX_TAG = Buffer.from("e445a52e51cb9a1d", "hex");
const STATUS: Record<string, CurveStatus> = { Fund: "live", Migrate: "graduating", Trade: "graduated" };

type TradeEventData = {
  pool_state: PublicKey; total_base_sell: BN; virtual_base: BN; virtual_quote: BN;
  real_base_before: BN; real_quote_before: BN; real_base_after: BN; real_quote_after: BN;
  amount_in: BN; amount_out: BN; protocol_fee: BN; platform_fee: BN; creator_fee: BN;
  trade_direction: { Buy?: object; Sell?: object }; pool_status: Record<string, object>;
};

type TradeAccounts = Pick<TradeExecuted, "trader" | "platformConfig" | "pool" | "baseMint" | "quoteMint">;

/** Turns one confirmed transaction into the LaunchLab events we index. Failed transactions yield nothing. */
export function decodeTransaction(raw: RawTransaction, launchlab: PublicKey): ChainEvent[] {
  const meta = raw.meta;
  if (!meta || meta.err) return [];
  const keys = [
    ...raw.transaction.message.accountKeys,
    ...(meta.loadedAddresses?.writable ?? []),
    ...(meta.loadedAddresses?.readonly ?? []),
  ];
  const program = launchlab.toBase58();
  const signature = raw.transaction.signatures[0]!;
  // Both mints always have a balance entry: every trade moves tokens through the curve's two vaults.
  const decimalsOf = (mint: PublicKey) => {
    const balance = meta.postTokenBalances?.find((b) => b.mint === mint.toBase58());
    if (!balance) throw new Error(`transaction ${signature} has no token balance for ${mint.toBase58()}`);
    return balance.uiTokenAmount.decimals;
  };
  // Each top-level instruction followed by the instructions it invoked, in execution order,
  // so a TradeEvent comes right after the trade instruction that emitted it.
  const groups = raw.transaction.message.instructions.map((ix, i) => [
    ix,
    ...(meta.innerInstructions?.find((g) => g.index === i)?.instructions ?? []),
  ]);
  const events: ChainEvent[] = [];
  let tradeIndex = 0;
  let claimIndex = 0;
  for (const group of groups) {
    let trade: TradeAccounts | null = null;
    // A claim instruction waiting for the token transfer out of its vault, which says how much it paid.
    let claim: Pick<CreatorFeeClaimed, "creator" | "quoteMint" | "vault"> | null = null;
    for (const ix of group) {
      if (claim && TOKEN_PROGRAMS.has(keys[ix.programIdIndex]!)) {
        const amount = vaultTransfer(ix, keys, claim.vault.toBase58());
        if (amount) {
          if (!amount.isZero())
            events.push({
              kind: "creator_fee_claimed", signature, slot: raw.slot, blockTime: raw.blockTime, index: claimIndex++, ...claim, amount,
              quoteDecimals: decimalsOf(claim.quoteMint),
            });
          claim = null;
        }
        continue;
      }
      if (keys[ix.programIdIndex] !== program) continue;
      const acct = (i: number) => new PublicKey(keys[ix.accounts[i]!]!);
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
          index: tradeIndex++,
          ...trade,
          side: e.trade_direction.Buy ? "buy" : "sell",
          amountIn: e.amount_in,
          amountOut: e.amount_out,
          fees: { protocol: e.protocol_fee, platform: e.platform_fee, creator: e.creator_fee },
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
      if (decoded.name === "claim_creator_fee") {
        claim = { creator: acct(CLAIM_ACCOUNT.creator), quoteMint: acct(CLAIM_ACCOUNT.quoteMint), vault: acct(CLAIM_ACCOUNT.vault) };
        continue;
      }
      if (TRADE_IXS.has(decoded.name)) {
        trade = {
          trader: acct(TRADE_ACCOUNT.trader),
          platformConfig: acct(TRADE_ACCOUNT.platformConfig),
          pool: acct(TRADE_ACCOUNT.pool),
          baseMint: acct(TRADE_ACCOUNT.baseMint),
          quoteMint: acct(TRADE_ACCOUNT.quoteMint),
        };
        continue;
      }
      if (!INITIALIZE_IXS.has(decoded.name)) continue;
      const data = decoded.data as {
        base_mint_param: { decimals: number; name: string; symbol: string; uri: string };
        curve_param: { Constant?: { data: { supply: BN; total_base_sell: BN; total_quote_fund_raising: BN; migrate_type: number } } };
        vesting_param: { total_locked_amount: BN; cliff_period: BN; unlock_period: BN };
        amm_fee_on?: Record<string, object>;
      };
      const curve = data.curve_param.Constant?.data;
      if (!curve) continue; // our platform only allows the constant-product curve
      const vesting = data.vesting_param;
      const standardShape =
        decoded.name !== "initialize_with_token_2022" &&
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
        supply: curve.supply,
        totalBaseSell: curve.total_base_sell,
        graduationTargetRaw: curve.total_quote_fund_raising,
        standardShape,
      });
    }
  }
  return events;
}

/** The amount of a token Transfer or TransferChecked out of `source`; null for any other token instruction. */
function vaultTransfer(ix: RawInstruction, keys: string[], source: string): BN | null {
  const data = Buffer.from(bs58.decode(ix.data));
  if ((data[0] !== TOKEN_TRANSFER && data[0] !== TOKEN_TRANSFER_CHECKED) || data.length < 9) return null;
  if (keys[ix.accounts[0]!] !== source) return null;
  return new BN(data.subarray(1, 9), "le");
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
