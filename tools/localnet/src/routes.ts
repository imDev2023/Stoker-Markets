import {
  ComputeBudgetProgram, SYSVAR_RENT_PUBKEY, SystemProgram, TransactionInstruction, type AccountMeta, type Connection,
  type Keypair, type PublicKey,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction, createSyncNativeInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import BN from "bn.js";
import {
  cpmmCoder, cpmmPdas, loadPool, programsFor, sortMints, swapBaseInputIx, temporaryTokenAccount, WSOL_MINT,
} from "@launchpad/chain";
import { LOCAL_QUOTES, ROUTE_POOL_CONFIG, airdrop, ensureLookupTable, localnetKeys, mintLocalQuote, send } from "./index";

/**
 * The local chain's stand-in for the market a buy paid with SOL routes through. On mainnet the API asks Jupiter; the
 * fork has no market at all, so it gets Raydium CPMM pools of SOL against some Quote Assets, seeded by a local
 * liquidity key at the stack's prices, which the API's "raydium-cpmm" route source trades through. NVDAx is left
 * without one, so a Quote Asset with no route can be tested too (Jupiter has no exact-out route for xStocks either).
 */
export const LOCAL_SOL_ROUTES = [
  // 1,000 SOL against 150,000 USDC and 60,000 JTO: SOL at 150 USD, USDC at 1 and JTO at 2.5, as the stack prices them.
  { quote: LOCAL_QUOTES.USDC, sol: 1_000, quoteRaw: 150_000n * 10n ** 6n },
  { quote: LOCAL_QUOTES.JTO, sol: 1_000, quoteRaw: 60_000n * 10n ** 9n },
] as const;

export type SolRoutes = {
  /** The CPMM pool each Quote Asset is bought through, by quote mint. */
  pools: Record<string, string>;
};

const meta = (pubkey: PublicKey, isSigner = false, isWritable = false): AccountMeta => ({ pubkey, isSigner, isWritable });

/** CPMM `initialize`: a pool of two SPL mints on the devnet CPMM config, opened with the creator's first liquidity. */
function initializePoolIx(creator: PublicKey, mintA: PublicKey, amountA: BN, mintB: PublicKey, amountB: BN) {
  const { cpmm, cpmmCreatePoolFee } = programsFor("localnet");
  const pdas = cpmmPdas(cpmm);
  const [token0, token1] = sortMints(mintA, mintB);
  const pool = pdas.pool(ROUTE_POOL_CONFIG, token0, token1);
  const lpMint = pdas.lpMint(pool);
  const ata = (mint: PublicKey) => getAssociatedTokenAddressSync(mint, creator);
  const [amount0, amount1] = token0.equals(mintA) ? [amountA, amountB] : [amountB, amountA];
  const instruction = new TransactionInstruction({
    programId: cpmm,
    data: cpmmCoder.instruction.encode("initialize", { init_amount_0: amount0, init_amount_1: amount1, open_time: new BN(0) }),
    keys: [
      meta(creator, true, true),
      meta(ROUTE_POOL_CONFIG),
      meta(pdas.authority),
      meta(pool, false, true),
      meta(token0),
      meta(token1),
      meta(lpMint, false, true),
      meta(ata(token0), false, true),
      meta(ata(token1), false, true),
      meta(ata(lpMint), false, true),
      meta(pdas.vault(pool, token0), false, true),
      meta(pdas.vault(pool, token1), false, true),
      meta(cpmmCreatePoolFee, false, true),
      meta(pdas.observation(pool), false, true),
      meta(TOKEN_PROGRAM_ID),
      meta(TOKEN_PROGRAM_ID),
      meta(TOKEN_PROGRAM_ID),
      meta(ASSOCIATED_TOKEN_PROGRAM_ID),
      meta(SystemProgram.programId),
      meta(SYSVAR_RENT_PUBKEY),
    ],
  });
  return { instruction, pool, lpMint, vaults: [pdas.vault(pool, token0), pdas.vault(pool, token1)], observation: pdas.observation(pool) };
}

const LAMPORTS_PER_SOL = new BN(1_000_000_000);

/** Opens the route pools that don't exist yet, wrapping all the SOL they need in one go. */
async function createPools(connection: Connection, liquidity: Keypair) {
  const pools = LOCAL_SOL_ROUTES.map((route) => ({
    route,
    ...initializePoolIx(liquidity.publicKey, WSOL_MINT, LAMPORTS_PER_SOL.muln(route.sol), route.quote, new BN(route.quoteRaw.toString())),
  }));
  const missing = [];
  for (const p of pools) if (!(await connection.getAccountInfo(p.pool, "confirmed"))) missing.push(p);
  if (!missing.length) return pools;
  const sol = missing.reduce((sum, p) => sum + p.route.sol, 0);
  await airdrop(connection, liquidity.publicKey, sol + 10);
  const wsol = getAssociatedTokenAddressSync(WSOL_MINT, liquidity.publicKey);
  await send(connection, [
    createAssociatedTokenAccountIdempotentInstruction(liquidity.publicKey, wsol, liquidity.publicKey, WSOL_MINT),
    SystemProgram.transfer({ fromPubkey: liquidity.publicKey, toPubkey: wsol, lamports: BigInt(LAMPORTS_PER_SOL.muln(sol).toString()) }),
    createSyncNativeInstruction(wsol),
  ], [liquidity]);
  for (const p of missing) {
    await mintLocalQuote(connection, p.route.quote, liquidity.publicKey, p.route.quoteRaw);
    await send(connection, [ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }), p.instruction], [liquidity]);
  }
  return pools;
}

/**
 * Someone else trading in a route pool: swaps `lamports` of SOL for the Quote Asset, which makes it dearer in SOL for
 * the next buyer. Tests use it to move a route's price between a quote and a signature.
 */
export async function swapThroughSolRoute(connection: Connection, trader: Keypair, quoteMint: PublicKey, lamports: bigint) {
  const { cpmm } = programsFor("localnet");
  const pool = await loadPool(connection, cpmmPdas(cpmm).pool(ROUTE_POOL_CONFIG, WSOL_MINT, quoteMint));
  if (!pool) throw new Error(`no SOL route pool for ${quoteMint.toBase58()}`);
  const amountIn = new BN(lamports.toString());
  const wsol = await temporaryTokenAccount(connection, { owner: trader.publicKey, mint: WSOL_MINT, tokenProgram: TOKEN_PROGRAM_ID, lamports: amountIn });
  const out = getAssociatedTokenAddressSync(quoteMint, trader.publicKey);
  const [input, output] = pool.tokens[0].mint.equals(WSOL_MINT) ? pool.tokens : [pool.tokens[1], pool.tokens[0]];
  await send(connection, [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
    ...wsol.open,
    createAssociatedTokenAccountIdempotentInstruction(trader.publicKey, out, trader.publicKey, quoteMint),
    swapBaseInputIx(cpmm, pool, {
      payer: trader.publicKey, input, output, inputAccount: wsol.address, outputAccount: out, amountIn, minAmountOut: new BN(0),
    }),
    wsol.close,
  ], [trader]);
}

/**
 * Seeds the SOL route pools and adds their accounts to the Platform Lookup Table, which already holds the LaunchLab
 * accounts a routed buy names. Resolves once the pools trade; `ready` resolves once the table's new entries are usable,
 * about 15 s later on the local validator (see CLAUDE.md's Traps), so a caller can start other work in between.
 */
export async function createSolRoutes(connection: Connection): Promise<SolRoutes & { ready: Promise<unknown> }> {
  const { liquidity, operations } = localnetKeys();
  const { cpmm } = programsFor("localnet");
  const created = await createPools(connection, liquidity);
  const addresses = [
    cpmm, ROUTE_POOL_CONFIG, cpmmPdas(cpmm).authority, ...created.flatMap((c) => [c.pool, ...c.vaults, c.observation]),
  ];
  return {
    pools: Object.fromEntries(created.map((c) => [c.route.quote.toBase58(), c.pool.toBase58()])),
    ready: ensureLookupTable(connection, operations, addresses),
  };
}
