// Paying with SOL on a Launch paired with another Quote Asset: one transaction swaps SOL for exactly the Quote Asset the
// trade spends and then trades it. On the local fork the swap goes through a Raydium CPMM pool of SOL against USDC,
// standing in for Jupiter (the API's "raydium-cpmm" route source); tools/localnet seeds it at SOL = 150 USDC.
import { describe, expect, it } from "vitest";
import { Keypair, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { ACCOUNT_SIZE, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import type BN from "bn.js";
import { launchlabCoder, launchlabPdas, loadPool, programsFor, splitSlippage, WSOL_MINT } from "@launchpad/chain";
import { LOCAL_QUOTES, migrateCurve, mintLocalQuote } from "@launchpad/localnet";
import { swapThroughSolRoute } from "@launchpad/localnet/routes";
import { PlatformInfo, PreparedTrade, TradeQuote } from "@launchpad/contract";
import {
  SOL, coinsOf, connection, deliverWebhook, env, fundedWallet, launch, launchedCoin, networkFee, prepareTrade, quote, signAndSend, solOf,
  tokenBalance, trade, trades,
} from "./client";

const USDC = LOCAL_QUOTES.USDC;
const usdc = (n: number) => BigInt(Math.round(n * 1e6));
const programs = programsFor("localnet");
const routePool = (mint = USDC) => new PublicKey(env().solRoutes.pools[mint.toBase58()]!);
const rent = async () => BigInt(await connection().getMinimumBalanceForRentExemption(ACCOUNT_SIZE));

async function usdcCoin(symbol = "PAYS") {
  const creator = await fundedWallet();
  const { prepared, signature } = await launch(creator, { symbol, quoteMint: USDC.toBase58() });
  await deliverWebhook([signature]);
  return { creator, mint: prepared.mint, pool: new PublicKey(prepared.pool) };
}

const solQuery = (lamports: bigint, slippageBps = 100): Record<string, string> => ({
  side: "buy", amount: lamports.toString(), slippageBps: String(slippageBps), payWith: "sol",
});

async function preparedWithSol(trader: Keypair, mint: string, lamports: bigint, slippageBps = 100) {
  const res = await prepareTrade({ mint, trader: trader.publicKey.toBase58(), side: "buy", amount: lamports.toString(), slippageBps, payWith: "sol" });
  if (!res.ok) throw new Error(`prepare failed: ${res.status} ${await res.text()}`);
  return PreparedTrade.parse(await res.json());
}

/** Sends a signed transaction without the RPC's preflight, so a failing one lands on-chain and charges its fee. */
async function sendLanding(p: PreparedTrade, signer: Keypair) {
  const tx = VersionedTransaction.deserialize(Buffer.from(p.transaction, "base64"));
  tx.sign([signer]);
  const conn = connection();
  const signature = await conn.sendTransaction(tx, { skipPreflight: true });
  const result = await conn.confirmTransaction(
    { signature, blockhash: tx.message.recentBlockhash, lastValidBlockHeight: p.lastValidBlockHeight },
    "confirmed",
  );
  return { signature, err: result.value.err as { InstructionError?: [number, unknown] } | null };
}

/** Every token account a wallet holds under the SPL Token program, with balances. */
async function tokenAccounts(owner: Keypair) {
  const { value } = await connection().getParsedTokenAccountsByOwner(owner.publicKey, { programId: TOKEN_PROGRAM_ID }, "confirmed");
  return value.map((a) => ({ mint: a.account.data.parsed.info.mint as string, amount: a.account.data.parsed.info.tokenAmount.amount as string }));
}

/** Someone else swaps SOL for USDC in the route pool, which makes USDC dearer in SOL for the next buyer. */
async function moveRoutePool(lamports: bigint) {
  await swapThroughSolRoute(connection(), await fundedWallet(Number(lamports / SOL(1)) + 2), USDC, lamports);
}

/** Where a curve trade's USDC fees end up: Raydium's counter in the curve, the Platform Fee vault and the Creator Fee vault. */
async function usdcFees(curve: PublicKey, creator: Keypair) {
  const pdas = launchlabPdas(programs.launchlab);
  const account = await connection().getAccountInfo(curve, "confirmed");
  const state = launchlabCoder.accounts.decode("PoolState", account!.data) as { quote_protocol_fee: BN };
  return {
    raydium: BigInt(state.quote_protocol_fee.toString()),
    platform: await tokenBalance(pdas.platformFeeVault(new PublicKey(env().platform.platformConfig), USDC)),
    creator: await tokenBalance(pdas.creatorFeeVault(creator.publicKey, USDC)),
  };
}

async function routeVaults() {
  const pool = (await loadPool(connection(), routePool()))!;
  const vault = (mint: PublicKey) => pool.tokens.find((t) => t.mint.equals(mint))!.vault;
  return { sol: await tokenBalance(vault(WSOL_MINT)), usdc: await tokenBalance(vault(USDC)) };
}

describe("paying with SOL on a USDC-paired Launch", () => {
  it("is offered by the platform, through the local chain's Raydium pool", async () => {
    const info = PlatformInfo.parse(await (await fetch(`${env().apiUrl}/v1/platform`)).json());
    expect(info.solRoute).toBe("raydium-cpmm");
  });

  it("swaps SOL for exactly the USDC the buy spends, and the trader ends up with the coins and nothing else", async () => {
    const { creator, mint, pool } = await usdcCoin();
    const trader = await fundedWallet();
    const shown = TradeQuote.parse(await (await quote(mint, solQuery(SOL(0.1)))).json());
    // 0.1 SOL buys about 14.96 USDC in the 1,000 SOL : 150,000 USDC pool after its 0.25% fee.
    expect(shown.route).toEqual({
      source: "raydium-cpmm",
      via: ["Raydium CPMM"],
      solIn: expect.any(String),
      maxSolIn: expect.any(String),
      quoteOut: shown.amountIn,
      fee: expect.any(String),
      feeBps: 25,
      slippageBps: { route: 50, trade: 50 },
    });
    const r = shown.route!;
    expect(BigInt(r.solIn)).toBeLessThanOrEqual(SOL(0.1));
    expect(BigInt(r.solIn)).toBeGreaterThan(SOL(0.0999));
    expect(BigInt(r.quoteOut)).toBeGreaterThan(usdc(14.9));
    expect(BigInt(r.quoteOut)).toBeLessThan(usdc(15));
    expect(BigInt(r.fee!)).toBe((BigInt(r.solIn) * 2500n + 999_999n) / 1_000_000n);
    // The trade's fees are 1.25% of the USDC it spends, in USDC.
    expect(Object.values(shown.fees).reduce((a, b) => a + BigInt(b), 0n)).toBe((BigInt(r.quoteOut) * 12_500n + 999_999n) / 1_000_000n);

    const fees = await usdcFees(pool, creator);
    const vaults = await routeVaults();
    const newFeeVaults = (await Promise.all([
      launchlabPdas(programs.launchlab).platformFeeVault(new PublicKey(env().platform.platformConfig), USDC),
      launchlabPdas(programs.launchlab).creatorFeeVault(creator.publicKey, USDC),
    ].map((v) => connection().getAccountInfo(v)))).filter((a) => !a).length;
    const sol = await solOf(trader);

    const p = await preparedWithSol(trader, mint, SOL(0.1));
    expect(p.quote).toEqual(shown);
    const signature = await signAndSend(p, trader);

    expect(await coinsOf(mint, trader)).toBe(BigInt(shown.amountOut));
    // The trader pays exactly the swap's cost, the network fee, and rent for their coin account and any fee vault this
    // trade opens; the temporary SOL and USDC accounts are closed and refunded.
    expect(sol - (await solOf(trader))).toBe(BigInt(r.solIn) + (await networkFee(signature)) + (await rent()) * BigInt(1 + newFeeVaults));
    expect(await tokenAccounts(trader)).toEqual([{ mint, amount: shown.amountOut }]);
    // The route pool took exactly the SOL and gave exactly the USDC quoted; the curve's fees landed where they belong.
    const after = await routeVaults();
    expect(after.sol - vaults.sol).toBe(BigInt(r.solIn));
    expect(vaults.usdc - after.usdc).toBe(BigInt(r.quoteOut));
    const d = await usdcFees(pool, creator);
    expect({ raydium: d.raydium - fees.raydium, platform: d.platform - fees.platform, creator: d.creator - fees.creator }).toEqual({
      raydium: BigInt(shown.fees.raydium), platform: BigInt(shown.fees.platform), creator: BigInt(shown.fees.creator),
    });

    // The Indexer sees a USDC buy on the curve; the route's swap is in a pool none of our Launches graduated into.
    expect(await (await deliverWebhook([signature])).json()).toEqual({ launched: 0, traded: 1, claimed: 0, graduated: 0 });
    expect(await trades(mint)).toMatchObject([
      { signature, venue: "curve", side: "buy", trader: trader.publicKey.toBase58(), baseAmount: shown.amountOut, quoteAmount: r.quoteOut },
    ]);
  });

  it("never touches USDC the trader already holds", async () => {
    const { mint } = await usdcCoin();
    const trader = await fundedWallet();
    await mintLocalQuote(connection(), USDC, trader.publicKey, usdc(7));
    const p = await preparedWithSol(trader, mint, SOL(0.05));
    await signAndSend(p, trader);
    expect(await tokenBalance(getAssociatedTokenAddressSync(USDC, trader.publicKey))).toBe(usdc(7));
    expect(await coinsOf(mint, trader)).toBe(BigInt(p.quote.amountOut));
  });

  it("splits the slippage so the worst fill of both steps together stays within what the trader chose", async () => {
    const { mint } = await usdcCoin();
    for (const bps of [0, 50, 100, 300, 5_000]) {
      const q = TradeQuote.parse(await (await quote(mint, solQuery(SOL(0.2), bps))).json());
      const r = q.route!;
      expect(r.slippageBps).toEqual(splitSlippage(bps));
      expect(BigInt(r.maxSolIn)).toBe((BigInt(r.solIn) * BigInt(10_000 + r.slippageBps.route)) / 10_000n);
      // Most SOL for fewest coins is no worse than the quoted SOL per coin less the slippage:
      // maxSolIn / minAmountOut <= (solIn / amountOut) / (1 - bps).
      expect(BigInt(r.maxSolIn) * BigInt(q.amountOut) * BigInt(10_000 - bps)).toBeLessThanOrEqual(
        BigInt(r.solIn) * BigInt(q.minAmountOut) * 10_000n,
      );
    }
  });

  it("marks which instructions are the swap and which the trade", async () => {
    const { mint } = await usdcCoin();
    const p = await preparedWithSol(await fundedWallet(), mint, SOL(0.01));
    const tx = VersionedTransaction.deserialize(Buffer.from(p.transaction, "base64"));
    expect(p.steps).toHaveLength(tx.message.compiledInstructions.length);
    // Programs an instruction calls are always written out in the message, never looked up.
    const keys = tx.message.staticAccountKeys;
    const programOf = (step: string) => p.steps.flatMap((s, i) => (s === step ? [keys[tx.message.compiledInstructions[i]!.programIdIndex]!.toBase58()] : []));
    expect(programOf("route")).toEqual([programs.cpmm.toBase58()]);
    expect(programOf("trade")).toEqual([programs.launchlab.toBase58()]);
    // It goes out as v0 through the route's lookup table, which keeps it under the size limit.
    expect(tx.message.addressTableLookups.map((l) => l.accountKey.toBase58())).toEqual([env().solRoutes.lookupTable]);
    expect(Buffer.from(p.transaction, "base64").length).toBeLessThanOrEqual(1232);
  });

  it("fails as a whole when SOL got dearer than the swap's slippage allows, costing only the network fee", async () => {
    const { mint } = await usdcCoin();
    const trader = await fundedWallet();
    const p = await preparedWithSol(trader, mint, SOL(0.1), 100);
    // Someone swaps 20 SOL for USDC first, which moves the route pool about 4%, past the swap's 0.5%.
    await moveRoutePool(SOL(20));
    const sol = await solOf(trader);
    const { signature, err } = await sendLanding(p, trader);
    expect(err).toEqual({ InstructionError: [expect.any(Number), { Custom: 6005 }] }); // CPMM ExceededSlippage
    expect(p.steps[err!.InstructionError![0]]).toBe("route");
    expect(sol - (await solOf(trader))).toBe(await networkFee(signature));
    expect(await tokenAccounts(trader)).toEqual([]);
  });

  it("fails as a whole when the coin moved more than the trade's slippage allows, costing only the network fee", async () => {
    const { mint } = await usdcCoin();
    const trader = await fundedWallet();
    const p = await preparedWithSol(trader, mint, SOL(0.1), 100);
    const fast = await fundedWallet();
    await mintLocalQuote(connection(), USDC, fast.publicKey, usdc(40));
    await trade(fast, mint, "buy", usdc(40));
    const sol = await solOf(trader);
    const { signature, err } = await sendLanding(p, trader);
    expect(err).toEqual({ InstructionError: [expect.any(Number), { Custom: 6004 }] }); // LaunchLab ExceededSlippage
    expect(p.steps[err!.InstructionError![0]]).toBe("trade");
    expect(sol - (await solOf(trader))).toBe(await networkFee(signature));
    expect(await tokenAccounts(trader)).toEqual([]);
  });

  it("buys only the USDC the rest of the curve costs when the SOL would overshoot it, and starts Graduation", async () => {
    const { mint, pool } = await usdcCoin();
    const trader = await fundedWallet(10);
    // The local Graduation Target is 150 USDC (1 SOL); 2 SOL buys about 297 USDC, far more than the curve still needs.
    const p = await preparedWithSol(trader, mint, SOL(2));
    const r = p.quote.route!;
    expect(p.quote.completesCurve).toBe(true);
    expect(BigInt(r.quoteOut)).toBeLessThan(usdc(160));
    expect(BigInt(r.solIn)).toBeLessThan(SOL(1.1));
    const sol = await solOf(trader);
    const signature = await signAndSend(p, trader);
    const state = launchlabCoder.accounts.decode("PoolState", (await connection().getAccountInfo(pool, "confirmed"))!.data) as {
      status: number; total_base_sell: BN;
    };
    expect(state.status).toBe(1);
    expect(await coinsOf(mint, trader)).toBe(BigInt(state.total_base_sell.toString()));
    expect(await tokenAccounts(trader)).toEqual([{ mint, amount: state.total_base_sell.toString() }]);
    const spent = sol - (await solOf(trader)) - (await networkFee(signature));
    expect(spent - BigInt(r.solIn)).toBeGreaterThanOrEqual(await rent());
    expect(spent - BigInt(r.solIn)).toBeLessThanOrEqual((await rent()) * 3n);
  });

  it("works in a graduated coin's pool too", async () => {
    const { mint, pool: curve } = await usdcCoin("GRAD");
    const holder = await fundedWallet();
    await mintLocalQuote(connection(), USDC, holder.publicKey, usdc(400));
    await trade(holder, mint, "buy", usdc(200));
    const migration = await migrateCurve(connection(), curve);
    await deliverWebhook([migration.signature]);
    for (let i = 0; i < 40 && !(await quote(mint, solQuery(SOL(0.01)))).ok; i++) await new Promise((r) => setTimeout(r, 250));

    const trader = await fundedWallet();
    const shown = TradeQuote.parse(await (await quote(mint, solQuery(SOL(0.1)))).json());
    expect(shown).toMatchObject({ venue: "pool", route: { source: "raydium-cpmm", quoteOut: shown.amountIn } });
    const sol = await solOf(trader);
    const p = await preparedWithSol(trader, mint, SOL(0.1));
    const signature = await signAndSend(p, trader);
    expect(await coinsOf(mint, trader)).toBe(BigInt(shown.amountOut));
    expect(sol - (await solOf(trader))).toBe(BigInt(shown.route!.solIn) + (await networkFee(signature)) + (await rent()));
    expect(await tokenAccounts(trader)).toEqual([{ mint, amount: shown.amountOut }]);
    expect(await (await deliverWebhook([signature])).json()).toEqual({ launched: 0, traded: 1, claimed: 0, graduated: 0 });
    expect((await trades(mint))[0]).toMatchObject({ signature, venue: "pool", side: "buy", quoteAmount: shown.amountIn });
  });
});

describe("paying with SOL where it doesn't apply", () => {
  it("says so for a Quote Asset without a SOL route", async () => {
    const creator = await fundedWallet();
    const { prepared, signature } = await launch(creator, { symbol: "NOROUTE", quoteMint: LOCAL_QUOTES.NVDAx.toBase58() });
    await deliverWebhook([signature]);
    const res = await quote(prepared.mint, solQuery(SOL(0.1)));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "There's no SOL route to NVDAx right now. Pay in NVDAx instead." });
  });

  it("refuses a sell paid out in SOL", async () => {
    const { mint } = await usdcCoin();
    const res = await quote(mint, { ...solQuery(SOL(0.1)), side: "sell" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Only a buy can be paid with SOL; a sell pays out the coin's Quote Asset." });
  });

  it("is the ordinary SOL buy on a SOL-paired Launch", async () => {
    const { mint } = await launchedCoin();
    const withSol = TradeQuote.parse(await (await quote(mint, solQuery(SOL(0.1)))).json());
    const plain = TradeQuote.parse(await (await quote(mint, { side: "buy", amount: SOL(0.1).toString() })).json());
    expect(withSol).toEqual(plain);
    expect(withSol.route).toBeNull();
  });
});
