import type { Connection, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import BN from "bn.js";
import {
  cpmmSolSwapIn, jupiterSwapIn, loadPool, poolSwap, RATE_DENOMINATOR, ROUTE_TOLERANCE_BPS, WSOL_MINT, type SolSwap,
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

/**
 * Jupiter's Swap API v2 (`jupiterSwapIn` in `packages/chain`). Unproven on the local chain, which has no Jupiter:
 * `tools/mainnet/jupiter-route.ts` simulates its swap on mainnet, and the local tests exercise `cpmmSolRoutes` through
 * the same code.
 */
export function jupiterSolRoutes(apiKey: string | undefined): SolRoutes {
  return {
    source: "jupiter",
    async swapIn(quote, lamports, taker) {
      const j = await jupiterSwapIn({ apiKey }, quote.mint, lamports, taker);
      return j && { source: "jupiter", via: j.via, solIn: j.solIn, expectedOut: j.expectedOut, minOut: j.minOut, fee: null, feeBps: null, swap: () => Promise.resolve(j.swap) };
    },
  };
}
