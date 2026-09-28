import { PublicKey, TransactionInstruction, type Connection } from "@solana/web3.js";
import BN from "bn.js";
import {
  cpmmSolSwap, loadPool, poolSwap, poolSwapExactOut, RATE_DENOMINATOR, WSOL_MINT, type SolSwapBuilder,
} from "@launchpad/chain";
import type { SolRouteSource } from "@launchpad/contract";

/**
 * Where a buy paid with SOL gets its Quote Asset. Like pricing (./quotes/pricing), the source is pluggable: Jupiter on
 * mainnet, and on the local chain and devnet Raydium CPMM pools of SOL against the Quote Asset that we name in
 * configuration. Every source buys an exact amount of the Quote Asset, so the trade after it can spend all of it.
 */

/** Buying exactly `quoteOut` of a Quote Asset with SOL, as a source would do it right now. */
export type SolRoutePlan = {
  source: SolRouteSource;
  via: string[];
  /** Lamports the swap costs at the current price. */
  solIn: BN;
  /** The most lamports the swap may take. */
  maxSolIn: BN;
  quoteOut: BN;
  /** The swap's fees in lamports and their rate in bps, when the source says. */
  fee: BN | null;
  feeBps: number | null;
  swap: SolSwapBuilder;
};

export interface SolRoutes {
  source: SolRouteSource;
  /** Lookup tables every routed buy compiles with, beyond what the swap brings. */
  lookupTables: PublicKey[];
  /** The Quote Asset `lamports` of SOL buys right now; null when there is no route to it. */
  exactIn(quoteMint: PublicKey, lamports: BN): Promise<BN | null>;
  /** How to buy exactly `quoteOut` of the Quote Asset with at most `routeSlippageBps` over its price; null without a route. */
  exactOut(quoteMint: PublicKey, quoteOut: BN, routeSlippageBps: number): Promise<SolRoutePlan | null>;
}

const bps = (rate: BN) => (Number(rate.toString()) * 10_000) / RATE_DENOMINATOR;

/**
 * Raydium CPMM pools of SOL against Quote Assets, one per Quote Asset, named in configuration. The route's math is the
 * program's own (`swap_base_output`), so the quote is exact. Reads each pool once per request.
 */
export function cpmmSolRoutes(connection: Connection, cpmm: PublicKey, pools: Map<string, PublicKey>, lookupTables: PublicKey[]): SolRoutes {
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
    lookupTables,
    async exactIn(quoteMint, lamports) {
      const p = await pool(quoteMint);
      return p ? poolSwap(p, WSOL_MINT, lamports).amountOut : null;
    },
    async exactOut(quoteMint, quoteOut, routeSlippageBps) {
      const p = await pool(quoteMint);
      const s = p && poolSwapExactOut(p, WSOL_MINT, quoteOut);
      if (!p || !s) return null;
      const maxSolIn = s.amountIn.muln(10_000 + routeSlippageBps).divn(10_000);
      const fee = s.tradeFee.add(s.creatorFeeOnInput ? s.creatorFee : new BN(0));
      return {
        source: "raydium-cpmm",
        via: ["Raydium CPMM"],
        solIn: s.amountIn,
        maxSolIn,
        quoteOut,
        fee,
        feeBps: bps(p.rates.trade.add(s.creatorFeeOnInput ? p.rates.creator : new BN(0))),
        swap: cpmmSolSwap(connection, { cpmm, pool: p, amountOut: quoteOut, maxAmountIn: maxSolIn }),
      };
    },
  };
}

type JupiterQuote = {
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: "ExactIn" | "ExactOut";
  routePlan: { swapInfo: { label?: string } }[];
};
type JupiterInstruction = { programId: string; accounts: { pubkey: string; isSigner: boolean; isWritable: boolean }[]; data: string };
type JupiterSwapInstructions = {
  setupInstructions?: JupiterInstruction[];
  swapInstruction: JupiterInstruction;
  cleanupInstruction?: JupiterInstruction | null;
  otherInstructions?: JupiterInstruction[];
  addressLookupTableAddresses?: string[];
  computeUnitLimit?: number;
};

/**
 * Accounts Jupiter may use for its route, leaving room in the transaction for the trade after it (about 20 accounts
 * on the curve or in the pool) under the 64-account lock limit.
 */
const JUPITER_MAX_ACCOUNTS = 36;
const JUPITER_COMPUTE_UNITS = 400_000;

/**
 * Jupiter's Swap API v1. Only its exact-out routes are used, since an exact-in route would leave whatever it bought
 * beyond the trade's amount in the wallet. As of 2026-09-28 Jupiter has exact-out routes from SOL to USDC and JTO but
 * none to NVDAx, so a Launch paired with an xStock can't be paid with SOL through it. Unproven on a real cluster: the
 * local chain has no Jupiter, so its tests exercise `cpmmSolRoutes`.
 */
export function jupiterSolRoutes(apiKey: string | undefined, lookupTables: PublicKey[]): SolRoutes {
  const host = apiKey ? "https://api.jup.ag" : "https://lite-api.jup.ag";
  const headers: Record<string, string> = { "content-type": "application/json", ...(apiKey ? { "x-api-key": apiKey } : {}) };
  const quote = async (quoteMint: PublicKey, amount: BN, swapMode: "ExactIn" | "ExactOut", slippageBps: number) => {
    const query = new URLSearchParams({
      inputMint: WSOL_MINT.toBase58(), outputMint: quoteMint.toBase58(), amount: amount.toString(), swapMode,
      slippageBps: String(slippageBps), maxAccounts: String(JUPITER_MAX_ACCOUNTS), restrictIntermediateTokens: "true",
    });
    const res = await fetch(`${host}/swap/v1/quote?${query}`, { headers });
    // Jupiter answers 400 NO_ROUTES_FOUND (or COULD_NOT_FIND_ANY_ROUTE) when there is none.
    if (res.status === 400) return null;
    if (!res.ok) throw new Error(`Jupiter quote failed: ${res.status}`);
    return (await res.json()) as JupiterQuote;
  };
  const instruction = (ix: JupiterInstruction) =>
    new TransactionInstruction({
      programId: new PublicKey(ix.programId),
      keys: ix.accounts.map((a) => ({ pubkey: new PublicKey(a.pubkey), isSigner: a.isSigner, isWritable: a.isWritable })),
      data: Buffer.from(ix.data, "base64"),
    });
  return {
    source: "jupiter",
    lookupTables,
    async exactIn(quoteMint, lamports) {
      const q = await quote(quoteMint, lamports, "ExactIn", 0);
      return q ? new BN(q.outAmount) : null;
    },
    async exactOut(quoteMint, quoteOut, routeSlippageBps) {
      const q = await quote(quoteMint, quoteOut, "ExactOut", routeSlippageBps);
      if (!q || q.swapMode !== "ExactOut" || !new BN(q.outAmount).eq(quoteOut)) return null;
      return {
        source: "jupiter",
        via: [...new Set(q.routePlan.map((h) => h.swapInfo.label ?? "Jupiter"))],
        solIn: new BN(q.inAmount),
        maxSolIn: new BN(q.otherAmountThreshold),
        quoteOut,
        fee: null,
        feeBps: null,
        swap: async (trader, destination) => {
          const res = await fetch(`${host}/swap/v1/swap-instructions`, {
            method: "POST",
            headers,
            // Jupiter wraps the SOL into the trader's wrapped-SOL account and unwraps what is left at the end.
            body: JSON.stringify({
              userPublicKey: trader.toBase58(), quoteResponse: q, wrapAndUnwrapSol: true, destinationTokenAccount: destination.toBase58(),
            }),
          });
          if (!res.ok) throw new Error(`Jupiter swap-instructions failed: ${res.status}`);
          const body = (await res.json()) as JupiterSwapInstructions;
          return {
            setup: (body.setupInstructions ?? []).map(instruction),
            swap: [instruction(body.swapInstruction)],
            cleanup: [...(body.cleanupInstruction ? [instruction(body.cleanupInstruction)] : []), ...(body.otherInstructions ?? []).map(instruction)],
            lookupTables: (body.addressLookupTableAddresses ?? []).map((a) => new PublicKey(a)),
            computeUnits: body.computeUnitLimit ?? JUPITER_COMPUTE_UNITS,
          };
        },
      };
    },
  };
}
