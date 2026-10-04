// Paying with SOL on a Launch paired with another Quote Asset: one transaction swaps an exact amount of SOL into the
// Quote Asset, in the trader's own account for it, and then trades the least the swap may deliver; the rest of what it
// delivers stays in the wallet. On the local fork the swap goes through a Raydium CPMM pool of SOL against USDC,
// standing in for Jupiter (the API's "raydium-cpmm" route source); tools/localnet seeds it at SOL = 150 USDC.
import { describe, expect, it } from "vitest";
import { Keypair, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { ACCOUNT_SIZE, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import type BN from "bn.js";
import { launchlabCoder, launchlabPdas, loadPool, programsFor, ROUTE_TOLERANCE_BPS, WSOL_MINT } from "@launchpad/chain";
import { LOCAL_QUOTES, migrateCurve, mintLocalQuote } from "@launchpad/localnet";
import { swapThroughSolRoute } from "@launchpad/localnet/routes";
import { PlatformInfo, PreparedTrade, TradeQuote } from "@launchpad/contract";
import {
  SOL, coinsOf, connection, deliverWebhook, env, fundedWallet, launch, launchedCoin, networkFee, prepareTrade, quote, signAndSend, solOf,
  sendLanding, tokenBalance, trade, trades,
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

/** Every token account a wallet holds under the SPL Token program, with balances, in the order of their mints. */
async function tokenAccounts(owner: Keypair) {
  const { value } = await connection().getParsedTokenAccountsByOwner(owner.publicKey, { programId: TOKEN_PROGRAM_ID }, "confirmed");
  return value
    .map((a) => ({ mint: a.account.data.parsed.info.mint as string, amount: a.account.data.parsed.info.tokenAmount.amount as string }))
    .sort((a, b) => a.mint.localeCompare(b.mint));
}

/** What a trader holds after a buy paid with SOL: the coins, and the USDC the swap delivered beyond what the trade spent. */
const holdings = (mint: string, coins: string, kept: string) =>
  [{ mint, amount: coins }, { mint: USDC.toBase58(), amount: kept }].sort((a, b) => a.mint.localeCompare(b.mint));

/** The least a swap may deliver of what it is expected to. */
const leastOf = (expected: bigint) => (expected * BigInt(10_000 - ROUTE_TOLERANCE_BPS)) / 10_000n;

/** Someone else swaps SOL for USDC in the route pool, so the next buyer's SOL buys less USDC. */
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

  it("swaps exactly the SOL, spends the least USDC the swap may deliver, and leaves the rest of it in the trader's wallet", async () => {
    const { creator, mint, pool } = await usdcCoin();
    const trader = await fundedWallet();
    const shown = TradeQuote.parse(await (await quote(mint, solQuery(SOL(0.1)))).json());
    // 0.1 SOL buys about 14.96 USDC in the 1,000 SOL : 150,000 USDC pool after its 0.25% fee.
    expect(shown.route).toEqual({
      source: "raydium-cpmm",
      via: ["Raydium CPMM"],
      solIn: SOL(0.1).toString(),
      maxSolIn: SOL(0.1).toString(),
      quoteOut: shown.amountIn,
      kept: expect.any(String),
      fee: expect.any(String),
      feeBps: 25,
      slippageBps: { route: ROUTE_TOLERANCE_BPS, trade: 100 },
    });
    const r = shown.route!;
    const expected = BigInt(r.quoteOut) + BigInt(r.kept);
    expect(expected).toBeGreaterThan(usdc(14.9));
    expect(expected).toBeLessThan(usdc(15));
    // The trade spends what the swap is sure to deliver: 0.3% under what the price gives now.
    expect(BigInt(r.quoteOut)).toBe(leastOf(expected));
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
    // The trader pays exactly the SOL they named, the network fee, and rent for their coin account, their USDC account
    // and any fee vault this trade opens; the temporary wrapped-SOL account is closed and refunded.
    expect(sol - (await solOf(trader))).toBe(SOL(0.1) + (await networkFee(signature)) + (await rent()) * BigInt(2 + newFeeVaults));
    // Nothing moved in the route pool since the quote, so the swap delivered what was expected and the trader keeps
    // the difference in USDC.
    expect(await tokenAccounts(trader)).toEqual(holdings(mint, shown.amountOut, r.kept));
    const after = await routeVaults();
    expect(after.sol - vaults.sol).toBe(SOL(0.1));
    expect(vaults.usdc - after.usdc).toBe(expected);
    const d = await usdcFees(pool, creator);
    expect({ raydium: d.raydium - fees.raydium, platform: d.platform - fees.platform, creator: d.creator - fees.creator }).toEqual({
      raydium: BigInt(shown.fees.raydium), platform: BigInt(shown.fees.platform), creator: BigInt(shown.fees.creator),
    });

    // The Indexer sees a USDC buy on the curve; the route's swap is in a pool none of our Launches graduated into.
    expect(await (await deliverWebhook([signature])).json()).toEqual({ launched: 0, traded: 1, claimed: 0, graduated: 0, airdropped: 0 });
    expect(await trades(mint)).toMatchObject([
      { signature, venue: "curve", side: "buy", trader: trader.publicKey.toBase58(), baseAmount: shown.amountOut, quoteAmount: r.quoteOut },
    ]);
  });

  it("never spends USDC the trader already holds", async () => {
    const { mint } = await usdcCoin();
    const trader = await fundedWallet();
    await mintLocalQuote(connection(), USDC, trader.publicKey, usdc(7));
    const p = await preparedWithSol(trader, mint, SOL(0.05));
    await signAndSend(p, trader);
    expect(await tokenBalance(getAssociatedTokenAddressSync(USDC, trader.publicKey))).toBe(usdc(7) + BigInt(p.quote.route!.kept));
    expect(await coinsOf(mint, trader)).toBe(BigInt(p.quote.amountOut));
  });

  it("gives the trade the trader's whole slippage: the SOL paid and the USDC spent are exact", async () => {
    const { mint } = await usdcCoin();
    for (const bps of [0, 50, 100, 300, 5_000]) {
      const q = TradeQuote.parse(await (await quote(mint, solQuery(SOL(0.2), bps))).json());
      const r = q.route!;
      expect(r.slippageBps).toEqual({ route: ROUTE_TOLERANCE_BPS, trade: bps });
      expect([r.solIn, r.maxSolIn]).toEqual([SOL(0.2).toString(), SOL(0.2).toString()]);
      expect(BigInt(r.quoteOut)).toBe(leastOf(BigInt(r.quoteOut) + BigInt(r.kept)));
      // The fewest coins are the quoted coins less the slippage, and no fewer.
      expect(BigInt(q.minAmountOut)).toBeLessThanOrEqual(BigInt(q.amountOut));
      expect(BigInt(q.minAmountOut)).toBeGreaterThanOrEqual((BigInt(q.amountOut) * BigInt(10_000 - bps)) / 10_000n);
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
    // It goes out as v0 through the Platform Lookup Table, which holds the route pools' accounts too and keeps it under
    // the size limit.
    expect(tx.message.addressTableLookups.map((l) => l.accountKey.toBase58())).toEqual([env().platform.lookupTable]);
    expect(Buffer.from(p.transaction, "base64").length).toBeLessThanOrEqual(1232);
  });

  it("fails as a whole when the SOL buys less USDC than the swap's allowance, costing only the network fee", async () => {
    const { mint } = await usdcCoin();
    const trader = await fundedWallet();
    const p = await preparedWithSol(trader, mint, SOL(0.1), 100);
    // Someone swaps 20 SOL for USDC first, which moves the route pool about 4%, past the swap's 0.3%.
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
    // The swap is for only the SOL that much USDC costs, so little is left over: well under 1% of what the trade spends.
    expect(BigInt(r.solIn)).toBeLessThan(SOL(1.1));
    expect(BigInt(r.kept) * 100n).toBeLessThan(BigInt(r.quoteOut));
    const sol = await solOf(trader);
    const signature = await signAndSend(p, trader);
    const state = launchlabCoder.accounts.decode("PoolState", (await connection().getAccountInfo(pool, "confirmed"))!.data) as {
      status: number; total_base_sell: BN;
    };
    expect(state.status).toBe(1);
    expect(await coinsOf(mint, trader)).toBe(BigInt(state.total_base_sell.toString()));
    expect(await tokenAccounts(trader)).toEqual(holdings(mint, state.total_base_sell.toString(), r.kept));
    // Rent for the coin account and the USDC account, and for up to two fee vaults.
    const spent = sol - (await solOf(trader)) - (await networkFee(signature));
    expect(spent - BigInt(r.solIn)).toBeGreaterThanOrEqual((await rent()) * 2n);
    expect(spent - BigInt(r.solIn)).toBeLessThanOrEqual((await rent()) * 4n);
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
    expect(sol - (await solOf(trader))).toBe(SOL(0.1) + (await networkFee(signature)) + (await rent()) * 2n);
    expect(await tokenAccounts(trader)).toEqual(holdings(mint, shown.amountOut, shown.route!.kept));
    expect(await (await deliverWebhook([signature])).json()).toEqual({ launched: 0, traded: 1, claimed: 0, graduated: 0, airdropped: 0 });
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
