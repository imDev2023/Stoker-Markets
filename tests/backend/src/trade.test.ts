import { describe, expect, it } from "vitest";
import {
  ComputeBudgetProgram, Keypair, PublicKey, Transaction, VersionedTransaction, sendAndConfirmTransaction,
} from "@solana/web3.js";
import { ACCOUNT_SIZE, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import BN from "bn.js";
import {
  createCurveRuleIx, createPlatformConfigIx, initializeV2Ix, launchlabCoder, launchlabPdas, loadCurve, prepareTrade as buildTrade,
  WSOL_MINT,
} from "@launchpad/chain";
import { CPSWAP_CONFIG, SOL_GLOBAL_CONFIG } from "@launchpad/localnet";
import { CandleList, TradeQuote } from "@launchpad/contract";
import {
  SOL, coinsOf, connection, deliverWebhook, env, feeAt, feeRates, fundedWallet, getLaunch, launchedCoin, networkFee, prepareTrade, prepared, quote,
  signAndSend, solOf, tokenBalance, trade, trades, confirmOutcome,
} from "./client";

async function poolState(pool: PublicKey) {
  const account = await connection().getAccountInfo(pool, "confirmed");
  return launchlabCoder.accounts.decode("PoolState", account!.data) as {
    quote_protocol_fee: BN; real_quote: BN; real_base: BN; total_base_sell: BN; status: number;
  };
}

/** The Platform Fee vault and the Creator's Creator Fee vault for SOL. */
function feeVaults(creator: Keypair) {
  const pdas = launchlabPdas(new PublicKey(env().platform.launchlab));
  return [pdas.platformFeeVault(new PublicKey(env().platform.platformConfig), WSOL_MINT), pdas.creatorFeeVault(creator.publicKey, WSOL_MINT)] as const;
}

/** Where a curve trade's fees end up on-chain: Raydium's counter in the curve, and the Platform Fee and Creator Fee vaults. */
async function feesOnChain(pool: PublicKey, creator: Keypair) {
  const [platform, creatorVault] = feeVaults(creator);
  return {
    raydium: BigInt((await poolState(pool)).quote_protocol_fee.toString()),
    platform: await tokenBalance(platform),
    creator: await tokenBalance(creatorVault),
  };
}

const diff = (after: Record<string, bigint>, before: Record<string, bigint>) =>
  Object.fromEntries(Object.entries(after).map(([k, v]) => [k, v - before[k]!]));
const quotedFees = (q: TradeQuote) => ({ raydium: BigInt(q.fees.raydium), platform: BigInt(q.fees.platform), creator: BigInt(q.fees.creator) });

describe("buying on the curve", () => {
  it("charges exactly the fees shown before signing: 0.25% to Raydium, and the Platform Fee and Creator Fee the chain has", async () => {
    const { creator, mint, pool } = await launchedCoin();
    const trader = await fundedWallet();
    const shown = TradeQuote.parse(await (await quote(mint, { side: "buy", amount: SOL(0.1).toString() })).json());
    expect(shown.venue).toBe("curve");
    const rates = await feeRates();
    expect(shown.feeBps).toEqual({ raydium: 25, ...rates });
    expect(shown.fees).toEqual({ raydium: "250000", platform: feeAt(SOL(0.1), rates.platform).toString(), creator: feeAt(SOL(0.1), rates.creator).toString() });
    // A trader pays 1.25% in all, whatever the split between the platform and the Creator.
    expect(25 + rates.platform + rates.creator).toBe(125);

    const fees = await feesOnChain(pool, creator);
    const newVaults = (await Promise.all(feeVaults(creator).map((v) => connection().getAccountInfo(v)))).filter((a) => !a).length;
    const sol = await solOf(trader);
    const { quote: q, signature } = await trade(trader, mint, "buy", SOL(0.1));
    expect(q).toEqual(shown);

    expect(diff(await feesOnChain(pool, creator), fees)).toEqual(quotedFees(q));
    expect(await coinsOf(mint, trader)).toBe(BigInt(q.amountOut));
    // The trader pays the quoted amount, the network fee, and rent for their new coin account and for any fee vault this
    // trade opens (the first trade on a Creator's coins opens their Creator Fee vault). The wrapped-SOL account is refunded.
    const rent = BigInt(await connection().getMinimumBalanceForRentExemption(ACCOUNT_SIZE));
    expect(newVaults).toBeGreaterThan(0);
    expect(sol - (await solOf(trader))).toBe(BigInt(q.amountIn) + (await networkFee(signature)) + rent * BigInt(1 + newVaults));
  });

  it("needs only the trader's signature", async () => {
    const { mint } = await launchedCoin();
    const trader = Keypair.generate();
    const p = await prepared(trader, mint, "buy", SOL(0.01));
    const tx = VersionedTransaction.deserialize(Buffer.from(p.transaction, "base64"));
    const signers = tx.message.staticAccountKeys.slice(0, tx.message.header.numRequiredSignatures).map((k) => k.toBase58());
    expect(signers).toEqual([trader.publicKey.toBase58()]);
  });

  it("takes only what is left on the curve when a buy would overshoot it, and starts Graduation", async () => {
    const { creator, mint, pool } = await launchedCoin();
    const trader = await fundedWallet();
    const fees = await feesOnChain(pool, creator);
    const { quote: q } = await trade(trader, mint, "buy", SOL(2));
    expect(q.completesCurve).toBe(true);
    expect(BigInt(q.amountIn)).toBeLessThan(SOL(2));

    const state = await poolState(pool);
    expect(await coinsOf(mint, trader)).toBe(BigInt(state.total_base_sell.toString()));
    expect(BigInt(q.amountOut)).toBe(BigInt(state.total_base_sell.toString()));
    expect(state.status).toBe(1);
    expect(BigInt(state.real_quote.toString())).toBeGreaterThanOrEqual(BigInt(env().platform.graduationTargetLamports));
    expect(diff(await feesOnChain(pool, creator), fees)).toEqual(quotedFees(q));

    const more = await quote(mint, { side: "buy", amount: SOL(0.01).toString() });
    expect(more.status).toBe(409);
  });
});

describe("selling on the curve", () => {
  it("pays out SOL less exactly the fees shown before signing", async () => {
    const { creator, mint, pool } = await launchedCoin();
    const trader = await fundedWallet();
    await trade(trader, mint, "buy", SOL(0.2));
    const coins = await coinsOf(mint, trader);

    const fees = await feesOnChain(pool, creator);
    const sol = await solOf(trader);
    const { quote: q, signature } = await trade(trader, mint, "sell", coins / 2n);
    expect(q.amountIn).toBe((coins / 2n).toString());

    expect(diff(await feesOnChain(pool, creator), fees)).toEqual(quotedFees(q));
    expect(await coinsOf(mint, trader)).toBe(coins - coins / 2n);
    expect((await solOf(trader)) - sol).toBe(BigInt(q.amountOut) - (await networkFee(signature)));
    // Fees are 1.25% of the gross proceeds, so they are about 1.27% of what the trader receives.
    const total = Object.values(quotedFees(q)).reduce((a, b) => a + b);
    expect(Number(total) / Number(BigInt(q.amountOut) + total)).toBeCloseTo(0.0125, 5);
  });
});

describe("slippage protection", () => {
  it("fails a trade that would fill worse than the chosen slippage, costing only the network fee", async () => {
    const { mint } = await launchedCoin();
    const slow = await fundedWallet();
    const fast = await fundedWallet();
    const p = await prepared(slow, mint, "buy", SOL(0.1), 50);

    // Someone else buys first and moves the price well past 0.5%.
    await trade(fast, mint, "buy", SOL(0.3));

    const sol = await solOf(slow);
    const tx = VersionedTransaction.deserialize(Buffer.from(p.transaction, "base64"));
    tx.sign([slow]);
    const conn = connection();
    const signature = await conn.sendTransaction(tx, { skipPreflight: true });
    const { err } = await confirmOutcome(conn, signature, tx.message.recentBlockhash, p.lastValidBlockHeight);
    expect(err).toEqual({ InstructionError: [expect.any(Number), { Custom: 6004 }] }); // ExceededSlippage
    expect(await coinsOf(mint, slow)).toBe(0n);
    expect(sol - (await solOf(slow))).toBe(await networkFee(signature));
  });
});

describe("curve progress, trade history and candles", () => {
  it("follow the indexed trades", async () => {
    const { mint, pool } = await launchedCoin();
    expect((await getLaunch(mint)).launch?.curve).toEqual({ status: "live", raised: "0", price: null, completedAt: null });

    const trader = await fundedWallet();
    const buy = await trade(trader, mint, "buy", SOL(0.25));
    expect(await (await deliverWebhook([buy.signature])).json()).toEqual({ launched: 0, traded: 1, claimed: 0, graduated: 0, airdropped: 0 });
    let curve = (await getLaunch(mint)).launch!.curve;
    expect(curve).toEqual({ status: "live", raised: (await poolState(pool)).real_quote.toString(), price: buy.quote.priceAfter, completedAt: null });

    const sell = await trade(trader, mint, "sell", (await coinsOf(mint, trader)) / 4n);
    // The fast path the web app uses after a trade confirms indexes it the same way.
    const fast = await fetch(`${env().apiUrl}/v1/transactions/${sell.signature}`, { method: "POST" });
    expect(await fast.json()).toEqual({ launched: 0, traded: 1, claimed: 0, graduated: 0, airdropped: 0 });
    curve = (await getLaunch(mint)).launch!.curve;
    expect(curve.raised).toBe((await poolState(pool)).real_quote.toString());
    expect(curve.price).toBe(sell.quote.priceAfter);
    expect(curve.price!).toBeLessThan(buy.quote.priceAfter);

    const history = await trades(mint);
    expect(history).toMatchObject([
      {
        signature: sell.signature, venue: "curve", trader: trader.publicKey.toBase58(), side: "sell", baseAmount: sell.quote.amountIn,
        quoteAmount: sell.quote.amountOut, fees: sell.quote.fees, price: sell.quote.priceAfter,
      },
      {
        signature: buy.signature, venue: "curve", trader: trader.publicKey.toBase58(), side: "buy", baseAmount: buy.quote.amountOut,
        quoteAmount: buy.quote.amountIn, fees: buy.quote.fees, price: buy.quote.priceAfter,
      },
    ]);

    const { candles } = CandleList.parse(await (await fetch(`${env().apiUrl}/v1/launches/${mint}/candles?interval=1d`)).json());
    expect(candles).toEqual([
      {
        time: expect.any(Number),
        open: buy.quote.priceBefore,
        high: buy.quote.priceAfter,
        low: buy.quote.priceBefore,
        close: sell.quote.priceAfter,
        volume: (BigInt(buy.quote.amountIn) + BigInt(sell.quote.amountOut)).toString(),
      },
    ]);
  });

  it("stay the same however often and in whatever order trades are delivered", async () => {
    const { mint } = await launchedCoin();
    const trader = await fundedWallet();
    const buy = await trade(trader, mint, "buy", SOL(0.1));
    const sell = await trade(trader, mint, "sell", (await coinsOf(mint, trader)) / 2n);
    expect(await (await deliverWebhook([sell.signature, buy.signature])).json()).toEqual({ launched: 0, traded: 2, claimed: 0, graduated: 0, airdropped: 0 });
    const latest = (await getLaunch(mint)).launch!.curve;
    expect(latest.price).toBe(sell.quote.priceAfter);

    expect(await (await deliverWebhook([buy.signature, sell.signature, buy.signature])).json()).toEqual({ launched: 0, traded: 0, claimed: 0, graduated: 0, airdropped: 0 });
    expect(await trades(mint)).toHaveLength(2);
    expect((await getLaunch(mint)).launch!.curve).toEqual(latest);
  });

  it("ignore trades on curves of other platforms", async () => {
    const other = await fundedWallet(20);
    const program = new PublicKey(env().platform.launchlab);
    const otherPlatform = launchlabPdas(program).platformConfig(other.publicKey);
    const mint = Keypair.generate();
    const conn = connection();
    await sendAndConfirmTransaction(conn, new Transaction().add(
      createPlatformConfigIx(program, other.publicKey, {
        feeRate: new BN(10_000), creatorFeeRate: new BN(0), name: "Someone else", web: "", img: "",
        operationsWallet: other.publicKey, cpswapConfig: CPSWAP_CONFIG,
      }),
      createCurveRuleIx(program, other.publicKey, otherPlatform, SOL_GLOBAL_CONFIG),
    ), [other], { commitment: "confirmed" });
    await sendAndConfirmTransaction(conn, new Transaction().add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
      initializeV2Ix({
        program, payer: other.publicKey, creator: other.publicKey, globalConfig: SOL_GLOBAL_CONFIG, platformConfig: otherPlatform,
        baseMint: mint.publicKey, quoteMint: WSOL_MINT, quoteTokenProgram: TOKEN_PROGRAM_ID,
        name: "Elsewhere", symbol: "ELSE", uri: "https://example.invalid/else.json", graduationTargetRaw: new BN(30_000_000_000),
      }),
    ), [other, mint], { commitment: "confirmed" });

    const curve = (await loadCurve(conn, launchlabPdas(program).pool(mint.publicKey, WSOL_MINT)))!;
    const p = await buildTrade(conn, {
      program, curve, trader: other.publicKey, side: "buy", amountIn: new BN(SOL(0.01).toString()), minAmountOut: new BN(0),
    });
    const signature = await signAndSend(p, other);
    expect(await (await deliverWebhook([signature])).json()).toEqual({ launched: 0, traded: 0, claimed: 0, graduated: 0, airdropped: 0 });
    expect(await trades(mint.publicKey.toBase58())).toEqual([]);
  });
});

describe("trade validation", () => {
  it("refuses unknown coins, zero amounts, too much slippage and selling more than the curve sold", async () => {
    const { mint } = await launchedCoin();
    expect((await quote(Keypair.generate().publicKey.toBase58(), { side: "buy", amount: "1000" })).status).toBe(404);
    expect((await quote(mint, { side: "buy", amount: "0" })).status).toBe(400);
    expect((await quote(mint, { side: "buy", amount: "1.5" })).status).toBe(400);
    expect((await quote(mint, { side: "buy", amount: "1000000", slippageBps: "5001" })).status).toBe(400);
    expect((await quote(mint, { side: "sell", amount: "1000" })).status).toBe(400);
    const bad = await prepareTrade({ mint, trader: "not-an-address", side: "buy", amount: "1000000" });
    expect(bad.status).toBe(400);
  });
});
