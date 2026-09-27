// Graduation: a curve that sells out waits for Raydium's crank to migrate it into a CPMM pool, and the coin then trades
// in that pool through the same API. On the local fork the tests play Raydium's crank with the GlobalConfig's migrate
// wallet, since only that wallet may migrate.
import { describe, expect, it } from "vitest";
import {
  ComputeBudgetProgram, Keypair, PublicKey, Transaction, VersionedTransaction, sendAndConfirmTransaction,
} from "@solana/web3.js";
import { ACCOUNT_SIZE, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import BN from "bn.js";
import {
  cpmmCoder, createCurveRuleIx, createPlatformConfigIx, graduationPoolAddress, initializeV2Ix, launchlabPdas, loadCurve, loadPool,
  prepareTrade as prepareCurveTrade, preparePoolTrade, programsFor, quoteTrade, sortMints, WSOL_MINT,
} from "@launchpad/chain";
import { CPSWAP_CONFIG, LOCAL_QUOTES, SOL_GLOBAL_CONFIG, migrateCurve, mintLocalQuote } from "@launchpad/localnet";
import { CandleList, CreatorFees, OperatorAlertList, TradeQuote } from "@launchpad/contract";
import {
  SOL, coinsOf, connection, deliverWebhook, env, fundedWallet, getLaunch, launch, launchedCoin, networkFee, prepared, quote, signAndSend,
  solOf, tokenBalance, trade, trades,
} from "./client";

const programs = programsFor("localnet");

/** A launched coin whose curve a trader has bought out, with the completing buy indexed. */
async function soldOutCoin() {
  const coin = await launchedCoin();
  const trader = await fundedWallet(10);
  const buyout = await trade(trader, coin.mint, "buy", SOL(2));
  expect(buyout.quote.completesCurve).toBe(true);
  await deliverWebhook([buyout.signature]);
  return { ...coin, trader, buyout };
}

/** A coin Raydium has migrated into its CPMM pool, with the migration indexed and the pool open for swaps. */
async function graduatedCoin() {
  const coin = await soldOutCoin();
  const migration = await migrateCurve(connection(), coin.pool);
  await deliverWebhook([migration.signature]);
  await poolOpen(coin.mint);
  return { ...coin, migration };
}

/** A migrated pool refuses swaps for its first second; the API says so until it opens. */
async function poolOpen(mint: string) {
  for (let i = 0; i < 40; i++) {
    const res = await quote(mint, { side: "buy", amount: SOL(0.01).toString() });
    if (res.ok) return;
    expect(((await res.json()) as { error: string }).error).toMatch(/opens in a moment/);
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("the pool never opened");
}

const runScheduledJobs = async () => {
  // The graduation watch's Cron Trigger (apps/api/wrangler.jsonc).
  const res = await fetch(`${env().apiUrl}/__scheduled?cron=${encodeURIComponent("* * * * *")}`);
  expect(res.ok).toBe(true);
};

async function alerts(token = env().operatorToken) {
  const res = await fetch(`${env().apiUrl}/v1/operator/alerts`, { headers: { authorization: `Bearer ${token}` } });
  return { status: res.status, alerts: res.ok ? OperatorAlertList.parse(await res.json()).alerts : [] };
}

async function alertsSentFor(mint: string) {
  const sent = (await (await fetch(env().alertSinkUrl)).json()) as { text: string; alert: { subject: string } }[];
  return sent.filter((a) => a.alert.subject === mint);
}

type CpmmPoolState = {
  pool_creator: PublicKey; token_0_mint: PublicKey; token_1_mint: PublicKey; creator_fees_token_0: BN; creator_fees_token_1: BN;
};

async function cpmmPool(address: PublicKey) {
  const account = await connection().getAccountInfo(address, "confirmed");
  return cpmmCoder.accounts.decode("PoolState", account!.data) as CpmmPoolState;
}

/** The pool's creator fee counter on the SOL side, which the platform collects as the pool's creator. */
async function poolCreatorFees(address: PublicKey) {
  const p = await cpmmPool(address);
  return BigInt((p.token_0_mint.equals(WSOL_MINT) ? p.creator_fees_token_0 : p.creator_fees_token_1).toString());
}

/** The programs a transaction invoked at its top level. */
async function programsCalled(signature: string) {
  const tx = await connection().getTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
  const keys = tx!.transaction.message.getAccountKeys({ accountKeysFromLookups: tx!.meta!.loadedAddresses });
  return tx!.transaction.message.compiledInstructions.map((ix) => keys.get(ix.programIdIndex)!.toBase58());
}

const waitSeconds = (s: number) => new Promise((r) => setTimeout(r, s * 1000));

describe("Graduation", () => {
  it("shows a sold-out Launch as graduating, then graduated once Raydium's migrate wallet moves it to its pool", async () => {
    const { mint, pool: curve, buyout } = await soldOutCoin();
    const graduating = (await getLaunch(mint)).launch!;
    expect(graduating.curve).toMatchObject({ status: "graduating", completedAt: expect.any(String) });
    expect(graduating.graduation).toBeNull();
    const refused = await quote(mint, { side: "buy", amount: SOL(0.01).toString() });
    expect(refused.status).toBe(409);
    expect(((await refused.json()) as { error: string }).error).toMatch(/Raydium is moving it to its pool/);

    const migration = await migrateCurve(connection(), curve);
    expect(await (await deliverWebhook([migration.signature])).json()).toEqual({ launched: 0, traded: 0, claimed: 0, graduated: 1 });
    const graduated = (await getLaunch(mint)).launch!;
    expect(graduated.curve).toEqual({ ...graduating.curve, status: "graduated" });
    expect(graduated.graduation).toEqual({
      pool: migration.pool.toBase58(),
      signature: migration.signature,
      graduatedAt: expect.any(String),
      price: null,
    });
    expect(Date.parse(graduated.graduation!.graduatedAt)).toBeGreaterThanOrEqual(Date.parse(graduating.curve.completedAt!));

    // The pool is the one the PlatformConfig's CPMM config fixes, and our platform is its creator, so the pool's
    // creator fee is platform revenue (ADR 0001).
    const [mintA] = sortMints(new PublicKey(mint), WSOL_MINT);
    const p = await cpmmPool(migration.pool);
    expect(p.token_0_mint.equals(mintA)).toBe(true);
    expect(p.pool_creator.toBase58()).toBe(env().platform.operationsWallet);
    expect(
      (await graduationPoolAddress(connection(), programs.cpmm, {
        platformConfig: new PublicKey(env().platform.platformConfig), baseMint: new PublicKey(mint), quoteMint: WSOL_MINT,
      })).equals(migration.pool),
    ).toBe(true);

    // Replays change nothing.
    expect(await (await deliverWebhook([migration.signature, buyout.signature])).json()).toEqual({ launched: 0, traded: 0, claimed: 0, graduated: 0 });
    expect((await getLaunch(mint)).launch).toEqual(graduated);
  });

  it("appears on the board as graduated", async () => {
    const { mint } = await graduatedCoin();
    const listed = ((await (await fetch(`${env().apiUrl}/v1/launches`)).json()) as { launches: { mint: string; curve: { status: string } }[] })
      .launches.find((l) => l.mint === mint);
    expect(listed?.curve.status).toBe("graduated");
  });
});

describe("trading after Graduation", () => {
  it("buys in the CPMM pool at exactly the quote, paying the pool fee and the platform's pool creator fee", async () => {
    const { mint, migration } = await graduatedCoin();
    const trader = await fundedWallet();
    const shown = TradeQuote.parse(await (await quote(mint, { side: "buy", amount: SOL(0.1).toString() })).json());
    expect(shown).toMatchObject({ venue: "pool", side: "buy", amountIn: SOL(0.1).toString(), completesCurve: false });
    expect(shown.feeBps).toEqual({ raydium: 25, platform: 25, creator: 0 });
    expect(shown.fees).toEqual({ raydium: "250000", platform: "250000", creator: "0" });

    const creatorFees = await poolCreatorFees(migration.pool);
    const sol = await solOf(trader);
    const { quote: q, signature } = await trade(trader, mint, "buy", SOL(0.1));
    expect(q).toEqual(shown);
    // It went through the pool: the only programs are the wallet plumbing and CPMM, never LaunchLab.
    const called = await programsCalled(signature);
    expect(called).toContain(programs.cpmm.toBase58());
    expect(called).not.toContain(programs.launchlab.toBase58());

    expect(await coinsOf(mint, trader)).toBe(BigInt(q.amountOut));
    const rent = BigInt(await connection().getMinimumBalanceForRentExemption(ACCOUNT_SIZE));
    expect(sol - (await solOf(trader))).toBe(BigInt(q.amountIn) + (await networkFee(signature)) + rent);
    expect((await poolCreatorFees(migration.pool)) - creatorFees).toBe(BigInt(q.fees.platform));
  });

  it("sells in the CPMM pool at exactly the quote, the pool fee taken in coins and the creator fee in SOL", async () => {
    const { mint, trader, migration } = await graduatedCoin();
    const coins = await coinsOf(mint, trader);
    const creatorFees = await poolCreatorFees(migration.pool);
    const sol = await solOf(trader);
    const { quote: q, signature } = await trade(trader, mint, "sell", coins / 3n);
    expect(q).toMatchObject({ venue: "pool", side: "sell", amountIn: (coins / 3n).toString() });
    // 0.25% of the coins sold, rounded up, stays in the pool; 0.25% of the SOL out goes to the pool's creator.
    expect(BigInt(q.fees.raydium)).toBe((coins / 3n * 2500n + 999_999n) / 1_000_000n);
    expect(BigInt(q.fees.platform)).toBeGreaterThan(0n);

    expect(await coinsOf(mint, trader)).toBe(coins - coins / 3n);
    expect((await solOf(trader)) - sol).toBe(BigInt(q.amountOut) - (await networkFee(signature)));
    expect((await poolCreatorFees(migration.pool)) - creatorFees).toBe(BigInt(q.fees.platform));
  });

  it("fails a pool trade that would fill worse than the chosen slippage, costing only the network fee", async () => {
    const { mint } = await graduatedCoin();
    const slow = await fundedWallet();
    const fast = await fundedWallet();
    const p = await prepared(slow, mint, "buy", SOL(0.1), 50);
    await trade(fast, mint, "buy", SOL(0.3));

    const sol = await solOf(slow);
    const tx = VersionedTransaction.deserialize(Buffer.from(p.transaction, "base64"));
    tx.sign([slow]);
    const conn = connection();
    const signature = await conn.sendTransaction(tx, { skipPreflight: true });
    const result = await conn.confirmTransaction(
      { signature, blockhash: tx.message.recentBlockhash, lastValidBlockHeight: p.lastValidBlockHeight },
      "confirmed",
    );
    expect(result.value.err).toEqual({ InstructionError: [expect.any(Number), { Custom: 6005 }] }); // CPMM ExceededSlippage
    expect(await coinsOf(mint, slow)).toBe(0n);
    expect(sol - (await solOf(slow))).toBe(await networkFee(signature));
  });

  it("carries on the same trade history, chart and price as the curve", async () => {
    const { mint, trader, buyout } = await graduatedCoin();
    const buy = await trade(trader, mint, "buy", SOL(0.05));
    const sell = await trade(trader, mint, "sell", (await coinsOf(mint, trader)) / 10n);
    expect(await (await deliverWebhook([buy.signature])).json()).toEqual({ launched: 0, traded: 1, claimed: 0, graduated: 0 });
    const fast = await fetch(`${env().apiUrl}/v1/transactions/${sell.signature}`, { method: "POST" });
    expect(await fast.json()).toEqual({ launched: 0, traded: 1, claimed: 0, graduated: 0 });
    expect(await (await deliverWebhook([buy.signature, sell.signature])).json()).toEqual({ launched: 0, traded: 0, claimed: 0, graduated: 0 });

    const history = await trades(mint);
    expect(history).toMatchObject([
      {
        signature: sell.signature, venue: "pool", side: "sell", baseAmount: sell.quote.amountIn, quoteAmount: sell.quote.amountOut,
        fees: sell.quote.fees, price: sell.quote.priceAfter,
      },
      {
        signature: buy.signature, venue: "pool", side: "buy", baseAmount: buy.quote.amountOut, quoteAmount: buy.quote.amountIn,
        fees: buy.quote.fees, price: buy.quote.priceAfter,
      },
      { signature: buyout.signature, venue: "curve", side: "buy" },
    ]);
    const launch = (await getLaunch(mint)).launch!;
    expect(launch.graduation?.price).toBe(sell.quote.priceAfter);
    expect(launch.curve.price).toBe(buyout.quote.priceAfter);

    const { candles } = CandleList.parse(await (await fetch(`${env().apiUrl}/v1/launches/${mint}/candles?interval=1d`)).json());
    expect(candles).toHaveLength(1);
    expect(candles[0]).toMatchObject({ open: buyout.quote.priceBefore, close: sell.quote.priceAfter });
    expect(candles[0]!.volume).toBe(
      (BigInt(buyout.quote.amountIn) + BigInt(buy.quote.amountIn) + BigInt(sell.quote.amountOut)).toString(),
    );
  });

  it("works the same for a coin whose mint sorts before SOL, which puts the coin first in the pool", async () => {
    // Anyone can launch on our PlatformConfig without our API, with a mint of their choosing; about 1 in 40 sorts first.
    let mint = Keypair.generate();
    while (!sortMints(mint.publicKey, WSOL_MINT)[0].equals(mint.publicKey)) mint = Keypair.generate();
    const creator = await fundedWallet();
    const platformConfig = new PublicKey(env().platform.platformConfig);
    const launched = await sendAndConfirmTransaction(connection(), new Transaction().add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
      initializeV2Ix({
        program: programs.launchlab, payer: creator.publicKey, creator: creator.publicKey, globalConfig: SOL_GLOBAL_CONFIG, platformConfig,
        baseMint: mint.publicKey, quoteMint: WSOL_MINT, quoteTokenProgram: TOKEN_PROGRAM_ID, name: "First", symbol: "FIRST",
        uri: "https://example.invalid/first.json", graduationTargetRaw: new BN(env().platform.graduationTargetLamports),
      }),
    ), [creator, mint], { commitment: "confirmed" });
    expect(await (await deliverWebhook([launched])).json()).toEqual({ launched: 1, traded: 0, claimed: 0, graduated: 0 });
    const coin = mint.publicKey.toBase58();
    const curve = launchlabPdas(programs.launchlab).pool(mint.publicKey, WSOL_MINT);
    const trader = await fundedWallet(10);
    const buyout = await trade(trader, coin, "buy", SOL(2));
    const migration = await migrateCurve(connection(), curve);
    expect((await cpmmPool(migration.pool)).token_0_mint.equals(mint.publicKey)).toBe(true);
    await poolOpen(coin);

    const sol = await solOf(trader);
    const buy = await trade(trader, coin, "buy", SOL(0.1));
    expect(buy.quote.fees).toEqual({ raydium: "250000", platform: "250000", creator: "0" });
    const sell = await trade(trader, coin, "sell", (await coinsOf(coin, trader)) / 2n);
    expect((await solOf(trader)) - sol).toBe(
      BigInt(sell.quote.amountOut) - BigInt(buy.quote.amountIn) - (await networkFee(buy.signature)) - (await networkFee(sell.signature)),
    );

    const signatures = [buyout.signature, migration.signature, buy.signature, sell.signature];
    expect(await (await deliverWebhook(signatures)).json()).toEqual({ launched: 0, traded: 3, claimed: 0, graduated: 1 });
    expect((await trades(coin)).map((t) => [t.venue, t.side, t.price])).toEqual([
      ["pool", "sell", sell.quote.priceAfter],
      ["pool", "buy", buy.quote.priceAfter],
      ["curve", "buy", buyout.quote.priceAfter],
    ]);
  });

  it("graduates a USDC-paired coin and trades it in its pool in USDC's raw units, every Quote Asset fee in USDC", async () => {
    const USDC = (n: number) => BigInt(Math.round(n * 1e6));
    const usdc = LOCAL_QUOTES.USDC;
    const usdcOf = (owner: Keypair) => tokenBalance(getAssociatedTokenAddressSync(usdc, owner.publicKey));
    const creator = await fundedWallet();
    const { prepared: coin, signature } = await launch(creator, { symbol: "USDG", quoteMint: usdc.toBase58() });
    await deliverWebhook([signature]);
    const trader = await fundedWallet();
    // The local Graduation Target is 1 SOL, which the stack prices at 150 USDC.
    await mintLocalQuote(connection(), usdc, trader.publicKey, USDC(400));
    const buyout = await trade(trader, coin.mint, "buy", USDC(200));
    expect(buyout.quote.completesCurve).toBe(true);
    const migration = await migrateCurve(connection(), new PublicKey(coin.pool));
    const p = await cpmmPool(migration.pool);
    expect([p.token_0_mint, p.token_1_mint].some((m) => m.equals(usdc))).toBe(true);
    expect(await (await deliverWebhook([buyout.signature, migration.signature])).json()).toEqual({ launched: 0, traded: 1, claimed: 0, graduated: 1 });
    await poolOpen(coin.mint);

    const usdcBefore = await usdcOf(trader);
    const coinsBefore = await coinsOf(coin.mint, trader);
    const buy = await trade(trader, coin.mint, "buy", USDC(20));
    // 0.25% pool fee and 0.25% pool creator fee, both on the USDC going in.
    expect(buy.quote).toMatchObject({ venue: "pool", amountIn: USDC(20).toString(), fees: { raydium: "50000", platform: "50000", creator: "0" } });
    expect(await usdcOf(trader)).toBe(usdcBefore - USDC(20));
    expect(await coinsOf(coin.mint, trader)).toBe(coinsBefore + BigInt(buy.quote.amountOut));

    const sell = await trade(trader, coin.mint, "sell", coinsBefore / 2n);
    expect(await usdcOf(trader)).toBe(usdcBefore - USDC(20) + BigInt(sell.quote.amountOut));
    expect(await (await deliverWebhook([buy.signature, sell.signature])).json()).toEqual({ launched: 0, traded: 2, claimed: 0, graduated: 0 });

    const launched = (await getLaunch(coin.mint)).launch!;
    expect(launched).toMatchObject({ quote: { symbol: "USDC", decimals: 6 }, curve: { status: "graduated" } });
    expect(launched.graduation).toMatchObject({ pool: migration.pool.toBase58(), price: sell.quote.priceAfter });
    // Whole USDC per whole coin: the pool opens with the 150 USDC the curve raised against the 206.9M coins it keeps.
    expect(buy.quote.priceBefore / (150 / 206_900_000) - 1).toBeCloseTo(0, 3);
    expect((await trades(coin.mint)).map((t) => [t.venue, t.side, t.quoteAmount])).toEqual([
      ["pool", "sell", sell.quote.amountOut],
      ["pool", "buy", USDC(20).toString()],
      ["curve", "buy", buyout.quote.amountIn],
    ]);
  });

  it("pays no Creator Fee on pool trades: the Creator's earnings stop at Graduation", async () => {
    const { creator, mint, trader, buyout } = await graduatedCoin();
    const fees = async () => CreatorFees.parse(await (await fetch(`${env().apiUrl}/v1/creators/${creator.publicKey.toBase58()}/fees`)).json());
    const before = await fees();
    expect(before.launches).toEqual([expect.objectContaining({ mint, status: "graduated", earned: buyout.quote.fees.creator })]);
    const vault = before.assets.find((a) => a.quote.mint === WSOL_MINT.toBase58())!;

    const buy = await trade(trader, mint, "buy", SOL(0.2));
    const sell = await trade(trader, mint, "sell", (await coinsOf(mint, trader)) / 3n);
    expect(buy.quote.fees.creator).toBe("0");
    expect(sell.quote.fees.creator).toBe("0");
    await deliverWebhook([buy.signature, sell.signature]);

    const after = await fees();
    expect(after.launches).toEqual(before.launches);
    // Nothing reached the Creator's vault either: after Graduation the pool's creator fee is the platform's (ADR 0001).
    expect(after.assets.find((a) => a.quote.mint === WSOL_MINT.toBase58())).toEqual(vault);
  });

  it("ignores migrations and pool trades of other platforms' coins", async () => {
    const other = await fundedWallet(20);
    const conn = connection();
    const program = programs.launchlab;
    const otherPlatform = launchlabPdas(program).platformConfig(other.publicKey);
    await sendAndConfirmTransaction(conn, new Transaction().add(
      createPlatformConfigIx(program, other.publicKey, {
        feeRate: new BN(10_000), creatorFeeRate: new BN(0), name: "Someone else", web: "", img: "",
        operationsWallet: other.publicKey, cpswapConfig: CPSWAP_CONFIG,
      }),
      createCurveRuleIx(program, other.publicKey, otherPlatform, SOL_GLOBAL_CONFIG),
    ), [other], { commitment: "confirmed" });
    const mint = Keypair.generate();
    await sendAndConfirmTransaction(conn, new Transaction().add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
      initializeV2Ix({
        program, payer: other.publicKey, creator: other.publicKey, globalConfig: SOL_GLOBAL_CONFIG, platformConfig: otherPlatform,
        baseMint: mint.publicKey, quoteMint: WSOL_MINT, quoteTokenProgram: TOKEN_PROGRAM_ID,
        name: "Elsewhere", symbol: "ELSE", uri: "https://example.invalid/else.json", graduationTargetRaw: new BN(SOL(0.5).toString()),
      }),
    ), [other, mint], { commitment: "confirmed" });
    const curveAddress = launchlabPdas(program).pool(mint.publicKey, WSOL_MINT);
    const curve = (await loadCurve(conn, curveAddress))!;
    const buyout = quoteTrade(curve.reserves, curve.rates, "buy", new BN(SOL(1).toString()));
    await signAndSend(await prepareCurveTrade(conn, {
      program, curve, trader: other.publicKey, side: "buy", amountIn: buyout.amountIn, minAmountOut: new BN(0),
    }), other);
    const migration = await migrateCurve(conn, curveAddress);

    // The pool opens a second after migration by the chain's clock, which can lag the wall clock.
    let pool = await loadPool(conn, migration.pool);
    while (pool!.chainTime < pool!.openTime) {
      await waitSeconds(0.25);
      pool = await loadPool(conn, migration.pool);
    }
    const swap = await signAndSend(await preparePoolTrade(conn, {
      cpmm: programs.cpmm, pool: pool!, baseMint: mint.publicKey, trader: other.publicKey, side: "buy",
      amountIn: new BN(SOL(0.01).toString()), minAmountOut: new BN(0),
    }), other);
    expect(await (await deliverWebhook([migration.signature, swap])).json()).toEqual({ launched: 0, traded: 0, claimed: 0, graduated: 0 });
    expect(await trades(mint.publicKey.toBase58())).toEqual([]);
  });
});

describe("the graduation watch", () => {
  it("alerts the operator once about a Launch stuck sold out past the threshold, and resolves it when Raydium migrates", async () => {
    const { mint, pool: curve } = await soldOutCoin();
    await runScheduledJobs();
    expect((await alerts()).alerts.filter((a) => a.subject === mint)).toEqual([]);

    await waitSeconds(env().graduationAlertAfterSeconds + 1);
    await runScheduledJobs();
    await runScheduledJobs();
    const raised = (await alerts()).alerts.filter((a) => a.subject === mint);
    expect(raised).toEqual([
      { kind: "graduation_stuck", subject: mint, message: expect.stringContaining("Raydium has not migrated it"), raisedAt: expect.any(String), resolvedAt: null },
    ]);
    const sent = await alertsSentFor(mint);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.text).toBe(raised[0]!.message);

    const migration = await migrateCurve(connection(), curve);
    await deliverWebhook([migration.signature]);
    const [resolved] = (await alerts()).alerts.filter((a) => a.subject === mint);
    expect(resolved?.resolvedAt).toEqual(expect.any(String));
    await runScheduledJobs();
    expect(await alertsSentFor(mint)).toHaveLength(1);
  });

  it("indexes a migration the webhook missed instead of alerting", async () => {
    const { mint, pool: curve } = await soldOutCoin();
    const migration = await migrateCurve(connection(), curve);
    await waitSeconds(env().graduationAlertAfterSeconds + 1);
    await runScheduledJobs();
    const launch = (await getLaunch(mint)).launch!;
    expect(launch.curve.status).toBe("graduated");
    expect(launch.graduation?.signature).toBe(migration.signature);
    expect((await alerts()).alerts.filter((a) => a.subject === mint)).toEqual([]);
    expect(await alertsSentFor(mint)).toEqual([]);
  });

  it("keeps operator alerts behind the operator token", async () => {
    expect((await alerts("wrong-token")).status).toBe(401);
    expect((await fetch(`${env().apiUrl}/v1/operator/alerts`)).status).toBe(401);
  });
});
