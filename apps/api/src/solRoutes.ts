import { PublicKey, TransactionInstruction, type Connection } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import BN from "bn.js";
import {
  cpmmSolSwapIn, loadPool, poolSwap, RATE_DENOMINATOR, ROUTE_TOLERANCE_BPS, WSOL_MINT, type SolSwap,
} from "@launchpad/chain";
import type { SolRouteSource } from "@launchpad/contract";

/**
 * Where a buy paid with SOL gets its Quote Asset. Like pricing (./quotes/pricing), the source is pluggable: Jupiter on
 * mainnet, and on the local chain Raydium CPMM pools of SOL against the Quote Asset that we name in configuration.
 * Every source swaps an exact amount of SOL and promises the least it will deliver, `ROUTE_TOLERANCE_BPS` under what
 * the current price gives, into the taker's own account for the Quote Asset. Jupiter's Swap API offers nothing else
 * (v2 has no exact-out), so the local source works the same way and the tests run what mainnet runs.
 */

/** Swapping exactly `solIn` lamports into a Quote Asset for one taker, as a source would do it right now. */
export type SolRoutePlan = {
  source: SolRouteSource;
  via: string[];
  solIn: BN;
  /** Quote Asset the swap delivers at the current price. */
  expectedOut: BN;
  /** The least it may deliver; under this the swap fails. */
  minOut: BN;
  /** The swap's fees in lamports and their rate in bps, when the source says. */
  fee: BN | null;
  feeBps: number | null;
  /** The swap's instructions, delivering into the taker's associated token account for the Quote Asset. */
  swap: () => Promise<SolSwap>;
};

export interface SolRoutes {
  source: SolRouteSource;
  /** How to swap `lamports` of SOL into the Quote Asset for `taker`; null when there is no route to it. */
  swapIn(quote: { mint: PublicKey; tokenProgram: PublicKey }, lamports: BN, taker: PublicKey): Promise<SolRoutePlan | null>;
}

const BPS = 10_000;
const bps = (rate: BN) => (Number(rate.toString()) * BPS) / RATE_DENOMINATOR;
const leastOf = (expected: BN) => expected.muln(BPS - ROUTE_TOLERANCE_BPS).divn(BPS);

/**
 * Raydium CPMM pools of SOL against Quote Assets, one per Quote Asset, named in configuration. The route's math is the
 * program's own (`swap_base_input`), so the quote is exact. Reads each pool once per request.
 */
export function cpmmSolRoutes(connection: Connection, cpmm: PublicKey, pools: Map<string, PublicKey>): SolRoutes {
  const loaded = new Map<string, ReturnType<typeof loadPool>>();
  const pool = async (quoteMint: PublicKey) => {
    const address = pools.get(quoteMint.toBase58());
    if (!address) return null;
    if (!loaded.has(address.toBase58())) loaded.set(address.toBase58(), loadPool(connection, address));
    const p = await loaded.get(address.toBase58())!;
    // A pool that is paused or not open yet is no route right now.
    if (!p || !p.swapEnabled || p.chainTime < p.openTime) return null;
    if (!p.tokens.some((t) => t.mint.equals(WSOL_MINT)) || !p.tokens.some((t) => t.mint.equals(quoteMint))) return null;
    return p;
  };
  return {
    source: "raydium-cpmm",
    async swapIn(quote, lamports, taker) {
      const p = await pool(quote.mint);
      if (!p) return null;
      const s = poolSwap(p, WSOL_MINT, lamports);
      const minOut = leastOf(s.amountOut);
      return {
        source: "raydium-cpmm",
        via: ["Raydium CPMM"],
        solIn: lamports,
        expectedOut: s.amountOut,
        minOut,
        fee: s.tradeFee.add(s.creatorFeeOnInput ? s.creatorFee : new BN(0)),
        feeBps: bps(p.rates.trade.add(s.creatorFeeOnInput ? p.rates.creator : new BN(0))),
        swap: () =>
          cpmmSolSwapIn(connection, { cpmm, pool: p, amountIn: lamports, minAmountOut: minOut })(
            taker, getAssociatedTokenAddressSync(quote.mint, taker, false, quote.tokenProgram),
          ),
      };
    },
  };
}

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

/**
 * Accounts Jupiter may use for its route, leaving room in the transaction for the trade after it (about 20 accounts
 * on the curve or in the pool) under the 64-account lock limit.
 */
const JUPITER_MAX_ACCOUNTS = 36;
const JUPITER_COMPUTE_UNITS = 400_000;
const JUPITER_API = "https://api.jup.ag";
const COMPUTE_BUDGET_PROGRAM = "ComputeBudget111111111111111111111111111111";
const SET_COMPUTE_UNIT_LIMIT = 2;

/**
 * Jupiter's Swap API v2, its `/build` endpoint: Metis routing, returned as raw instructions for our own transaction.
 * It swaps an exact amount in and names the least it delivers (`otherAmountThreshold`); v2 has no exact-out. By default
 * the swap wraps the taker's SOL, opens and delivers into the taker's associated token account for the output, and
 * unwraps what is left. Unproven on the local chain, which has no Jupiter: `tools/mainnet/jupiter-route.ts` simulates
 * its swap on mainnet, and the local tests exercise `cpmmSolRoutes` through the same code.
 */
export function jupiterSolRoutes(apiKey: string | undefined, apiUrl = JUPITER_API): SolRoutes {
  const headers: Record<string, string> = apiKey ? { "x-api-key": apiKey } : {};
  const instruction = (ix: JupiterInstruction) =>
    new TransactionInstruction({
      programId: new PublicKey(ix.programId),
      keys: ix.accounts.map((a) => ({ pubkey: new PublicKey(a.pubkey), isSigner: a.isSigner, isWritable: a.isWritable })),
      data: Buffer.from(ix.data, "base64"),
    });
  return {
    source: "jupiter",
    async swapIn(quote, lamports, taker) {
      const query = new URLSearchParams({
        inputMint: WSOL_MINT.toBase58(), outputMint: quote.mint.toBase58(), amount: lamports.toString(), taker: taker.toBase58(),
        slippageBps: String(ROUTE_TOLERANCE_BPS), maxAccounts: String(JUPITER_MAX_ACCOUNTS),
      });
      const res = await fetch(`${apiUrl}/swap/v2/build?${query}`, { headers });
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
      const swap: SolSwap = {
        setup: (b.setupInstructions ?? []).map(instruction),
        swap: [instruction(b.swapInstruction)],
        cleanup: [...(b.cleanupInstruction ? [instruction(b.cleanupInstruction)] : []), ...(b.otherInstructions ?? []).map(instruction)],
        lookupTables: Object.keys(b.addressesByLookupTableAddress ?? {}).map((a) => new PublicKey(a)),
        computeUnits: limit ? limit.readUInt32LE(1) : JUPITER_COMPUTE_UNITS,
      };
      return {
        source: "jupiter",
        via: [...new Set(b.routePlan.map((h) => h.swapInfo.label ?? "Jupiter"))],
        solIn: lamports,
        expectedOut: new BN(b.outAmount),
        minOut: new BN(b.otherAmountThreshold),
        fee: null,
        feeBps: null,
        swap: () => Promise.resolve(swap),
      };
    },
  };
}
