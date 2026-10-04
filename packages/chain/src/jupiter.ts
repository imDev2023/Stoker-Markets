import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import BN from "bn.js";
import { WSOL_MINT } from "./programs";
import { ROUTE_TOLERANCE_BPS, type SolSwap } from "./route";

/**
 * Jupiter's Swap API v2, its `/build` endpoint: Metis routing, returned as raw instructions for our own transaction.
 * It swaps an exact amount in and names the least it delivers (`otherAmountThreshold`); v2 has no exact-out. By default
 * the swap wraps the taker's SOL, opens and delivers into the taker's associated token account for the output, and
 * unwraps what is left. The local chain has no Jupiter: `tools/mainnet/jupiter-route.ts` simulates this swap on mainnet.
 */

type JupiterInstruction = { programId: string; accounts: { pubkey: string; isSigner: boolean; isWritable: boolean }[]; data: string };
/** `GET /swap/v2/build`: the quote and the swap's instructions in one answer. */
type JupiterBuild = {
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  routePlan: { swapInfo: { label?: string } }[];
  computeBudgetInstructions?: JupiterInstruction[];
  setupInstructions?: JupiterInstruction[];
  swapInstruction: JupiterInstruction;
  cleanupInstruction?: JupiterInstruction | null;
  otherInstructions?: JupiterInstruction[];
  addressesByLookupTableAddress?: Record<string, string[]> | null;
};

/** A swap of exactly `solIn` lamports into a token, as Jupiter would route it right now. */
export type JupiterSwapIn = {
  /** The venues Jupiter routes through. */
  via: string[];
  solIn: BN;
  /** What the swap delivers at the current price. */
  expectedOut: BN;
  /** The least it may deliver; under this the swap fails. */
  minOut: BN;
  swap: SolSwap;
};

export const JUPITER_API = "https://api.jup.ag";
/**
 * Accounts Jupiter may use for its route, leaving room in the transaction for the trade after it (about 20 accounts
 * on the curve or in the pool) under the 64-account lock limit.
 */
const JUPITER_MAX_ACCOUNTS = 36;
const JUPITER_COMPUTE_UNITS = 400_000;
const COMPUTE_BUDGET_PROGRAM = "ComputeBudget111111111111111111111111111111";
const SET_COMPUTE_UNIT_LIMIT = 2;

const instruction = (ix: JupiterInstruction) =>
  new TransactionInstruction({
    programId: new PublicKey(ix.programId),
    keys: ix.accounts.map((a) => ({ pubkey: new PublicKey(a.pubkey), isSigner: a.isSigner, isWritable: a.isWritable })),
    data: Buffer.from(ix.data, "base64"),
  });

/**
 * Asks Jupiter to swap exactly `lamports` of the taker's SOL into `outputMint`, delivering at least
 * `ROUTE_TOLERANCE_BPS` under what the price gives now into the taker's associated token account. Null when Jupiter
 * has no route; throws when Jupiter itself fails.
 */
export async function jupiterSwapIn(
  j: { apiUrl?: string; apiKey?: string }, outputMint: PublicKey, lamports: BN, taker: PublicKey,
): Promise<JupiterSwapIn | null> {
  const query = new URLSearchParams({
    inputMint: WSOL_MINT.toBase58(), outputMint: outputMint.toBase58(), amount: lamports.toString(), taker: taker.toBase58(),
    slippageBps: String(ROUTE_TOLERANCE_BPS), maxAccounts: String(JUPITER_MAX_ACCOUNTS),
  });
  const res = await fetch(`${j.apiUrl ?? JUPITER_API}/swap/v2/build?${query}`, { headers: j.apiKey ? { "x-api-key": j.apiKey } : {} });
  // Jupiter answers 400 or 404 when it has no route.
  if (res.status === 400 || res.status === 404) return null;
  if (!res.ok) throw new Error(`Jupiter build failed: ${res.status}`);
  const b = (await res.json()) as JupiterBuild;
  if (b.swapMode !== "ExactIn" || !new BN(b.inAmount).eq(lamports)) return null;
  // Jupiter's own compute unit limit for the route, when it sends one; the caller sets the transaction's.
  const limit = (b.computeBudgetInstructions ?? [])
    .filter((ix) => ix.programId === COMPUTE_BUDGET_PROGRAM)
    .map((ix) => Buffer.from(ix.data, "base64"))
    .find((data) => data[0] === SET_COMPUTE_UNIT_LIMIT && data.length >= 5);
  return {
    via: [...new Set(b.routePlan.map((h) => h.swapInfo.label ?? "Jupiter"))],
    solIn: lamports,
    expectedOut: new BN(b.outAmount),
    minOut: new BN(b.otherAmountThreshold),
    swap: {
      setup: (b.setupInstructions ?? []).map(instruction),
      swap: [instruction(b.swapInstruction)],
      cleanup: [...(b.cleanupInstruction ? [instruction(b.cleanupInstruction)] : []), ...(b.otherInstructions ?? []).map(instruction)],
      lookupTables: Object.keys(b.addressesByLookupTableAddress ?? {}).map((a) => new PublicKey(a)),
      computeUnits: limit ? limit.readUInt32LE(1) : JUPITER_COMPUTE_UNITS,
    },
  };
}
