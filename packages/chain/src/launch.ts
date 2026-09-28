import {
  ComputeBudgetProgram, Keypair, PACKET_DATA_SIZE, TransactionMessage, VersionedTransaction, type AddressLookupTableAccount,
  type Connection, type PublicKey,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import type BN from "bn.js";
import { initialCurveReserves, quoteTrade, type CurveReserves, type FeeRates, type TradeQuote } from "./curve";
import { initializeV2Ix } from "./instructions";
import { launchlabPdas } from "./pda";
import { LAUNCH_SHAPE } from "./shape";
import { loadFeeRates, tradeInstructions } from "./trade";

/** The Quote Asset a Launch is paired with, and the Graduation Target our curve rule pins for it. */
export type LaunchPairing = {
  globalConfig: PublicKey;
  quoteMint: PublicKey;
  quoteTokenProgram: PublicKey;
  graduationTargetRaw: BN;
};

/**
 * One launch interface for every launch mode: a standard coin, optionally with the Creator's own first buy in the same
 * transaction. An airdrop is paid from that first buy afterwards (see `prepareAirdrop`).
 */
export type LaunchRequest = LaunchPairing & {
  program: PublicKey;
  platformConfig: PublicKey;
  creator: PublicKey;
  name: string;
  symbol: string;
  uri: string;
  /**
   * The Creator's first buy, as `quoteFirstBuy` quoted it. It runs right after the curve is created, inside the same
   * transaction, so no other trade can come between them.
   */
  firstBuy?: TradeQuote | null;
  /** The Platform Lookup Table, which keeps a launch with a first buy within one transaction. */
  lookupTable: AddressLookupTableAccount;
};

export type PreparedLaunch = {
  /** Base64 of a v0 transaction, already signed by the new mint; the Creator's wallet adds the fee-payer signature. */
  transaction: string;
  mint: PublicKey;
  pool: PublicKey;
  lastValidBlockHeight: number;
};

export type FirstBuyQuote = { start: CurveReserves; rates: FeeRates; quote: TradeQuote };

const LAUNCH_COMPUTE_UNITS = 400_000;
const FIRST_BUY_COMPUTE_UNITS = 200_000;

/**
 * What a first buy of `amountIn` gets on a new curve. It is exact rather than an estimate: the buy is the curve's first
 * trade and lands in the launch transaction, so nothing can move the price first.
 */
export async function quoteFirstBuy(
  connection: Connection, r: Pick<LaunchRequest, "globalConfig" | "platformConfig" | "graduationTargetRaw">, amountIn: BN,
): Promise<FirstBuyQuote> {
  const { rates, migrateFee } = await loadFeeRates(connection, r.globalConfig, r.platformConfig);
  const start = initialCurveReserves({
    supply: LAUNCH_SHAPE.supply, totalBaseSell: LAUNCH_SHAPE.totalBaseSell, fundRaising: r.graduationTargetRaw, migrateFee,
  });
  return { start, rates, quote: quoteTrade(start, rates, "buy", amountIn) };
}

/**
 * A first buy that sells out the curve would graduate the coin in its own launch transaction, with the Creator holding
 * every coin sold; we refuse it.
 */
export const firstBuyTakesCurve = (q: TradeQuote) => q.after.realBase.eq(q.after.totalBaseSell);

/**
 * Builds the launch transaction server-side (ADR 0003). The Creator pays and signs; the mint key signs here.
 * Callers that need the mint address before building (for the metadata URI) pass the key themselves.
 */
export async function prepareLaunch(connection: Connection, r: LaunchRequest, mint: Keypair = Keypair.generate()): Promise<PreparedLaunch> {
  const pool = launchlabPdas(r.program).pool(mint.publicKey, r.quoteMint);
  const firstBuy = r.firstBuy ?? null;
  if (firstBuy && (firstBuy.side !== "buy" || firstBuyTakesCurve(firstBuy))) throw new Error("a first buy must be a buy that leaves coins on the curve");
  const instructions = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: LAUNCH_COMPUTE_UNITS + (firstBuy ? FIRST_BUY_COMPUTE_UNITS : 0) }),
    initializeV2Ix({
      program: r.program,
      payer: r.creator,
      creator: r.creator,
      globalConfig: r.globalConfig,
      platformConfig: r.platformConfig,
      baseMint: mint.publicKey,
      quoteMint: r.quoteMint,
      quoteTokenProgram: r.quoteTokenProgram,
      name: r.name,
      symbol: r.symbol,
      uri: r.uri,
      graduationTargetRaw: r.graduationTargetRaw,
    }),
  ];
  if (firstBuy) {
    instructions.push(...(await tradeInstructions(connection, {
      program: r.program,
      curve: {
        pool,
        globalConfig: r.globalConfig,
        platformConfig: r.platformConfig,
        creator: r.creator,
        baseMint: mint.publicKey,
        quoteMint: r.quoteMint,
        baseTokenProgram: TOKEN_PROGRAM_ID,
        quoteTokenProgram: r.quoteTokenProgram,
      },
      trader: r.creator,
      side: "buy",
      amountIn: firstBuy.amountIn,
      // Exact: the first buy is the curve's first trade. If the fee rates change before it lands, it fails whole.
      minAmountOut: firstBuy.amountOut,
    })));
  }
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const message = new TransactionMessage({ payerKey: r.creator, recentBlockhash: blockhash, instructions }).compileToV0Message([r.lookupTable]);
  const tx = new VersionedTransaction(message);
  tx.sign([mint]);
  const bytes = serialized(tx);
  return { transaction: Buffer.from(bytes).toString("base64"), mint: mint.publicKey, pool, lastValidBlockHeight };
}

/** Serializes a transaction, failing with a clear message if it is larger than Solana allows. */
export function serialized(tx: VersionedTransaction) {
  let bytes: Uint8Array;
  try {
    bytes = tx.serialize();
  } catch {
    throw new Error(`transaction is larger than the ${PACKET_DATA_SIZE} bytes Solana allows`);
  }
  if (bytes.length > PACKET_DATA_SIZE) throw new Error(`transaction is ${bytes.length} bytes, over the ${PACKET_DATA_SIZE} Solana allows`);
  return bytes;
}
