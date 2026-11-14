import { describe, expect, it } from "vitest";
import { ComputeBudgetProgram, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import BN from "bn.js";
import {
  creatorLockCapBps, EARLIER_LAUNCH_SHAPES, graduationBandOf, initializeV2Ix, listGlobalConfigs, LAUNCH_SHAPE, launchlabCoder, launchlabPdas, readCurveRuleGroups, rewardLaunchConstraints, RuleField, RuleOp,
  standardLaunchConstraints, updateCurveRuleIx, WSOL_MINT, type InitializeParams, type RuleConstraint,
} from "@launchpad/chain";
import { PreparedTrade, TradeList, type TradeSide } from "@launchpad/contract";
import { LOCAL_QUOTES, localnetKeys, mintLocalQuote, send } from "@launchpad/localnet";
import {
  connection, deliverWebhook, env, feeAt, feeRates, fundedWallet, getLaunch, launch, listQuotes, prepare, prepared, refreshQuoteRegistry, signAndSend,
} from "./client";

// The stack prices the local quotes in USD (tools/localnet LOCAL_QUOTE_PRICES_USD): SOL 150, USDC 1, NVDAx 180, JTO 2.5,
// and leaves BULLWHALE unpriced. Its Graduation Target is 1 SOL, so each Quote Asset's target is 150 USD worth of it.
const EXPECTED_TARGETS = [
  { symbol: "USDC", mint: LOCAL_QUOTES.USDC, decimals: 6, tokenProgram: TOKEN_PROGRAM_ID, raw: "150000000" }, // 150 USDC
  { symbol: "NVDAx", mint: LOCAL_QUOTES.NVDAx, decimals: 8, tokenProgram: TOKEN_2022_PROGRAM_ID, raw: "83333333" }, // 0.83333333 NVDAx
  { symbol: "JTO", mint: LOCAL_QUOTES.JTO, decimals: 9, tokenProgram: TOKEN_PROGRAM_ID, raw: "60000000000" }, // 60 JTO
];

const program = () => new PublicKey(env().platform.launchlab);
const globalConfigOf = (mint: PublicKey) => launchlabPdas(program()).globalConfig(mint);

type PoolState = { quote_mint: PublicKey; quote_vault: PublicKey; quote_decimals: number; total_quote_fund_raising: BN; platform_config: PublicKey };
async function poolState(pool: string) {
  const account = await connection().getAccountInfo(new PublicKey(pool));
  return launchlabCoder.accounts.decode("PoolState", account!.data) as PoolState;
}

/**
 * A launch built straight from the IDL, bypassing our API, as anyone could send it. `totalBaseSell` other than our launch
 * shape's makes an off-shape launch; `supply` other than its supply, a launch on another shape (the 1B one of earlier coins).
 */
async function launchDirectly(
  quoteMint: PublicKey, quoteTokenProgram: PublicKey, graduationTargetRaw: BN, totalBaseSell = LAUNCH_SHAPE.totalBaseSell, supply = LAUNCH_SHAPE.supply,
) {
  const creator = await fundedWallet();
  const mint = Keypair.generate();
  const params: InitializeParams = {
    program: program(), payer: creator.publicKey, creator: creator.publicKey, globalConfig: globalConfigOf(quoteMint),
    platformConfig: new PublicKey(env().platform.platformConfig), baseMint: mint.publicKey, quoteMint, quoteTokenProgram,
    name: "Direct", symbol: "DRCT", uri: "https://example.invalid/d.json", graduationTargetRaw,
  };
  const ix = initializeV2Ix(params);
  if (!totalBaseSell.eq(LAUNCH_SHAPE.totalBaseSell) || !supply.eq(LAUNCH_SHAPE.supply)) {
    const args = launchlabCoder.instruction.decode(ix.data)!.data as { curve_param: { Constant: { data: { supply: BN; total_base_sell: BN } } } };
    args.curve_param.Constant.data.total_base_sell = totalBaseSell;
    args.curve_param.Constant.data.supply = supply;
    ix.data = launchlabCoder.instruction.encode("initialize_v2", args);
  }
  const tx = new Transaction().add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }), ix);
  return sendAndConfirmTransaction(connection(), tx, [creator, mint], { commitment: "confirmed" });
}

describe("the Quote Registry", () => {
  it("lists the quote mint of every GlobalConfig on the chain, with its metadata, after a refresh", async () => {
    await refreshQuoteRegistry();
    const accounts = await connection().getProgramAccounts(program(), { filters: [{ memcmp: launchlabCoder.accounts.memcmp("GlobalConfig") }] });
    const onChain = accounts.map((a) => (launchlabCoder.accounts.decode("GlobalConfig", a.account.data) as { quote_mint: PublicKey }).quote_mint.toBase58());

    const quotes = await listQuotes();
    expect(quotes.map((q) => q.mint).sort()).toEqual([...new Set(onChain)].sort());
    expect(quotes[0]).toMatchObject({ mint: WSOL_MINT.toBase58(), symbol: "SOL", decimals: 9, tokenProgram: TOKEN_PROGRAM_ID.toBase58() });
    const bySymbol = Object.fromEntries(quotes.map((q) => [q.symbol, q]));
    for (const e of EXPECTED_TARGETS) {
      expect(bySymbol[e.symbol]).toMatchObject({
        mint: e.mint.toBase58(),
        globalConfig: globalConfigOf(e.mint).toBase58(),
        decimals: e.decimals,
        tokenProgram: e.tokenProgram.toBase58(),
      });
    }
    expect(bySymbol.NVDAx!.name).toBe("NVIDIA xStock");
    expect(bySymbol.BULLWHALE).toMatchObject({ mint: LOCAL_QUOTES.BULLWHALE.toBase58(), decimals: 6, tokenProgram: TOKEN_2022_PROGRAM_ID.toBase58() });
  });

  it("names the market behind each Quote Asset as TradingView does, from the issuer's ticker or the mint, never a name", async () => {
    const bySymbol = Object.fromEntries((await listQuotes()).map((q) => [q.symbol, q]));
    // The stock NVDAx tracks, known from xStocks' authorities on the mint and the ticker xStocks gave it.
    expect(bySymbol.NVDAx!.market).toEqual({ symbol: "NASDAQ:NVDA", venue: "NASDAQ", ticker: "NVDA" });
    // A coin's own market, by mint: TradingView's index across exchanges.
    expect(bySymbol.SOL!.market).toEqual({ symbol: "CRYPTO:SOLUSD", venue: "CRYPTO", ticker: "SOLUSD" });
    expect(bySymbol.USDC!.market).toEqual({ symbol: "CRYPTO:USDCUSD", venue: "CRYPTO", ticker: "USDCUSD" });
    expect(bySymbol.JTO!.market).toEqual({ symbol: "CRYPTO:JTOUSD", venue: "CRYPTO", ticker: "JTOUSD" });
    // A pump.fun coin and the local taxed quote are no one's record: no market, whatever they are called.
    expect(bySymbol.BULLWHALE!.market).toBeNull();
    expect(bySymbol.TAXQ!.market).toBeNull();
  });

  it("prices each Quote Asset in SOL and USD", async () => {
    const quotes = Object.fromEntries((await listQuotes()).map((q) => [q.symbol, q]));
    expect(quotes.SOL!.price).toMatchObject({ sol: "1", usd: "150" });
    expect(quotes.USDC!.price).toMatchObject({ sol: "0.006666666666666666", usd: "1" });
    expect(quotes.NVDAx!.price).toMatchObject({ sol: "1.2", usd: "180" });
  });

  it("shows a Quote Asset without a reliable price, but refuses to launch against it", async () => {
    const bullwhale = (await listQuotes()).find((q) => q.mint === LOCAL_QUOTES.BULLWHALE.toBase58());
    const reason = "No reliable price for BULLWHALE yet, so its Graduation Target can't be set.";
    expect(bullwhale).toMatchObject({ price: null, graduationTarget: null, launchable: false, reason });

    const creator = await fundedWallet();
    const res = await prepare({ creator: creator.publicKey.toBase58(), quoteMint: LOCAL_QUOTES.BULLWHALE.toBase58() });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: reason });
  });

  it("refuses a mint that is not a Quote Asset", async () => {
    const res = await prepare({ creator: Keypair.generate().publicKey.toBase58(), quoteMint: Keypair.generate().publicKey.toBase58() });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "That mint isn't a Quote Asset. Choose one from the Quote Asset list." });
  });
});

describe("launching against a non-SOL Quote Asset", () => {
  it.each(EXPECTED_TARGETS)(
    "fixes the Graduation Target at the SOL-equivalent in $symbol's raw units ($decimals decimals)",
    async ({ symbol, mint, decimals, raw }) => {
      const listed = (await listQuotes()).find((q) => q.symbol === symbol);
      expect(listed).toMatchObject({ launchable: true, reason: null, graduationTarget: { raw, lamports: env().platform.graduationTargetLamports } });

      const creator = await fundedWallet();
      const { prepared, signature } = await launch(creator, { symbol: "PAIR", quoteMint: mint.toBase58() });
      expect(prepared.graduationTarget).toEqual({ raw, lamports: env().platform.graduationTargetLamports });

      const pool = await poolState(prepared.pool);
      expect(pool.quote_mint.toBase58()).toBe(mint.toBase58());
      expect(pool.quote_decimals).toBe(decimals);
      expect(pool.total_quote_fund_raising.toString()).toBe(raw);

      await deliverWebhook([signature]);
      const { launch: summary } = await getLaunch(prepared.mint);
      expect(summary).toMatchObject({ symbol: expect.stringMatching(/^PAIR/), graduationTarget: raw, quote: { mint: mint.toBase58(), symbol, decimals } });
    },
  );

  it("works end to end on a Token-2022 tokenized stock with issuer extensions", async () => {
    const creator = await fundedWallet();
    const { prepared, signature } = await launch(creator, { name: "Stock Pair", symbol: "STK", quoteMint: LOCAL_QUOTES.NVDAx.toBase58() });
    const pool = await poolState(prepared.pool);
    expect(pool.platform_config.toBase58()).toBe(env().platform.platformConfig);
    // The curve's quote vault is a Token-2022 account of the stock mint.
    const vault = await connection().getAccountInfo(pool.quote_vault);
    expect(vault!.owner.toBase58()).toBe(TOKEN_2022_PROGRAM_ID.toBase58());

    const res = await fetch(`${env().apiUrl}/v1/transactions/${signature}`, { method: "POST" });
    expect(await res.json()).toEqual({ launched: 1, traded: 0, graduated: 0, airdropped: 0 });
    expect((await getLaunch(prepared.mint)).launch?.quote).toMatchObject({ symbol: "NVDAx", name: "NVIDIA xStock", decimals: 8 });
  });
});

describe("curve rules cover every Quote Asset on-chain", () => {
  const usdc = EXPECTED_TARGETS[0]!;

  it("accept a direct launch whose target is within 10% of the latest price", async () => {
    await expect(launchDirectly(usdc.mint, TOKEN_PROGRAM_ID, new BN(usdc.raw).muln(105).divn(100))).resolves.toBeTypeOf("string");
  });

  it.each([
    ["more than 10% below", 89],
    ["more than 10% above", 111],
  ])("reject a direct launch whose target is %s the latest price", async (_label, pct) => {
    await expect(launchDirectly(usdc.mint, TOKEN_PROGRAM_ID, new BN(usdc.raw).muln(pct).divn(100))).rejects.toThrow(
      /0x1789|CurveParamNotMatchPlatformRule/,
    );
  });

  it("reject every direct launch against a Quote Asset without a price", async () => {
    await expect(launchDirectly(LOCAL_QUOTES.BULLWHALE, TOKEN_2022_PROGRAM_ID, new BN(150_000_000))).rejects.toThrow(
      /0x1789|CurveParamNotMatchPlatformRule/,
    );
  });
});

describe("a GlobalConfig our curve rules don't cover yet", () => {
  const jto = EXPECTED_TARGETS[2]!;
  // 55% of the supply sold, not our 79.31% (LaunchLab's curve needs more than half sold, or it panics computing it), and
  // under the 59.31% a rule that admits the largest Creator Lock lets through (ADR 0023): a sale inside that range with
  // no lock passes the rule, and the Indexer ignores it (`creator-lock.test.ts`).
  const offShape = LAUNCH_SHAPE.supply.muln(55).divn(100);

  it("lets an off-shape launch onto our PlatformConfig, which the Indexer ignores, until the refresh writes its rule", async () => {
    // As for a GlobalConfig Raydium created after the last refresh: a rule that pins nothing but a positive raise.
    const { operations } = localnetKeys();
    const loose = [{ field: RuleField.TotalFundRaisingB, op: RuleOp.Gte, value: new BN(1) }];
    await send(connection(), [
      updateCurveRuleIx(program(), operations.publicKey, new PublicKey(env().platform.platformConfig), globalConfigOf(jto.mint), 0, loose),
    ], [operations]);

    const signature = await launchDirectly(jto.mint, TOKEN_PROGRAM_ID, new BN(jto.raw), offShape);
    const res = await deliverWebhook([signature]);
    expect(await res.json()).toEqual({ launched: 0, traded: 0, graduated: 0, airdropped: 0 });

    await refreshQuoteRegistry();
    await expect(launchDirectly(jto.mint, TOKEN_PROGRAM_ID, new BN(jto.raw), offShape)).rejects.toThrow(/0x1789|CurveParamNotMatchPlatformRule/);
    expect((await listQuotes()).find((q) => q.symbol === "JTO")).toMatchObject({ launchable: true, graduationTarget: { raw: jto.raw } });
  });
});

describe("the launch shape of 1T coins (#166) and the coins launched on the 1B shape before it", () => {
  const jto = EXPECTED_TARGETS[2]!;
  const platformConfig = () => new PublicKey(env().platform.platformConfig);
  const [earlier] = EARLIER_LAUNCH_SHAPES;
  /** A rule group as the Quote Registry wrote it before #166: the same constraints with the 1B supply and sale. */
  const onEarlierShape = (group: RuleConstraint[]) =>
    group.map((c) => c.field === RuleField.Supply ? { ...c, value: earlier.supply } : c.field === RuleField.TotalSellA ? { ...c, value: earlier.totalBaseSell } : c);
  const rulesOnChain = async () => {
    const groups = await readCurveRuleGroups(connection(), program(), platformConfig(), [globalConfigOf(jto.mint)]);
    return groups.get(globalConfigOf(jto.mint).toBase58())!;
  };
  /** A field's pinned value, or its ceiling in a group that gives it a range (the sale, where a Creator Lock is allowed, ADR 0023). */
  const valueOf = (group: RuleConstraint[], field: number) => group.find((c) => c.field === field && c.op !== RuleOp.Gte)!.value.toString();

  it("pins a supply of 1T coins, 793.1B of them sold on the curve, in both of every Quote Asset's rule groups", async () => {
    expect(LAUNCH_SHAPE.supply.toString()).toBe("1000000000000000000");
    expect(LAUNCH_SHAPE.totalBaseSell.toString()).toBe("793100000000000000");
    const rules = await rulesOnChain();
    for (const id of [0, 1]) {
      expect(valueOf(rules.get(id)!, RuleField.Supply)).toBe(LAUNCH_SHAPE.supply.toString());
      expect(valueOf(rules.get(id)!, RuleField.TotalSellA)).toBe(LAUNCH_SHAPE.totalBaseSell.toString());
    }
  });

  it("keeps a coin launched on the 1B shape as it is: indexed, priced on its own supply and tradable, while the refresh moves the rules to 1T", async () => {
    // The chain as it stood before #166: JTO's two groups pinning the 1B shape.
    const { operations } = localnetKeys();
    const band = graduationBandOf((await rulesOnChain()).get(0)!)!;
    await send(connection(), [
      updateCurveRuleIx(program(), operations.publicKey, platformConfig(), globalConfigOf(jto.mint), 0, onEarlierShape(standardLaunchConstraints(band))),
      updateCurveRuleIx(program(), operations.publicKey, platformConfig(), globalConfigOf(jto.mint), 1, onEarlierShape(rewardLaunchConstraints(band))),
    ], [operations]);
    // While they do, the new shape is refused on-chain, so the API hands out no launch against JTO and says why, and a
    // launch on the old shape lands and is indexed as ours.
    await expect(launchDirectly(jto.mint, TOKEN_PROGRAM_ID, new BN(jto.raw))).rejects.toThrow(/0x1789|CurveParamNotMatchPlatformRule/);
    const refused = await prepare({ creator: (await fundedWallet()).publicKey.toBase58(), quoteMint: jto.mint.toBase58() });
    expect(refused.status).toBe(422);
    expect(await refused.text()).toMatch(/Launches against JTO open once its launch rules are set on-chain/);
    const signature = await launchDirectly(jto.mint, TOKEN_PROGRAM_ID, new BN(jto.raw), earlier.totalBaseSell, earlier.supply);
    expect(await (await deliverWebhook([signature])).json()).toMatchObject({ launched: 1 });
    const tx = await connection().getTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    const mint = tx!.meta!.postTokenBalances!.find((b) => b.mint !== jto.mint.toBase58())!.mint;

    // The refresh rewrites both groups to the 1T shape; from then on only that shape launches.
    await refreshQuoteRegistry();
    const rules = await rulesOnChain();
    expect(valueOf(rules.get(0)!, RuleField.Supply)).toBe(LAUNCH_SHAPE.supply.toString());
    expect(valueOf(rules.get(1)!, RuleField.TotalSellA)).toBe(LAUNCH_SHAPE.totalBaseSell.toString());
    await expect(launchDirectly(jto.mint, TOKEN_PROGRAM_ID, new BN(jto.raw), earlier.totalBaseSell, earlier.supply)).rejects.toThrow(
      /0x1789|CurveParamNotMatchPlatformRule/,
    );
    await expect(launchDirectly(jto.mint, TOKEN_PROGRAM_ID, new BN(jto.raw))).resolves.toBeTypeOf("string");
    expect((await listQuotes()).find((q) => q.symbol === "JTO")).toMatchObject({ launchable: true, graduationTarget: { raw: jto.raw } });

    // The earlier coin keeps its 1B supply: its market cap is its price times 1B coins, and it still trades through the API.
    const trader = await fundedWallet();
    await mintLocalQuote(connection(), jto.mint, trader.publicKey, 10_000_000_000n);
    const p = await prepared(trader, mint, "buy", 1_000_000_000n);
    await deliverWebhook([await signAndSend(p, trader)]);
    const { launch: coin } = await getLaunch(mint);
    expect(coin!.curve.status).toBe("live");
    expect(coin!.market.price).toBeGreaterThan(0);
    expect(coin!.market.marketCap!.quote).toBeCloseTo(coin!.market.price! * 1_000_000_000, 6);
    expect(coin!.supply).toBe(earlier.supply.toString());
    const holders = await (await fetch(`${env().apiUrl}/v1/launches/${mint}/holders`)).json() as { supply: string };
    expect(holders.supply).toBe(earlier.supply.toString());
  });
});

describe("the 1T shape at the largest Graduation Target a curve rule allows", () => {
  const jto = EXPECTED_TARGETS[2]!;

  it("launches and trades: LaunchLab's curve maths holds 1T coins against a raise near the u64 limit", async () => {
    // The refresh keeps a band's top within a u64 (rules.ts targetFits), so the largest target it ever pins is u64 max / 1.1.
    // Raised against 1e18 raw coins it is the far end of the curve's u128 arithmetic; a loose rule lets it launch here.
    const largest = new BN("18446744073709551615").muln(10).divn(11);
    const { operations } = localnetKeys();
    const loose = [{ field: RuleField.TotalFundRaisingB, op: RuleOp.Gte, value: new BN(1) }];
    const platformConfig = new PublicKey(env().platform.platformConfig);
    await send(connection(), [updateCurveRuleIx(program(), operations.publicKey, platformConfig, globalConfigOf(jto.mint), 0, loose)], [operations]);
    try {
      const signature = await launchDirectly(jto.mint, TOKEN_PROGRAM_ID, largest);
      expect(await (await deliverWebhook([signature])).json()).toMatchObject({ launched: 1 });
      const tx = await connection().getTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
      const mint = tx!.meta!.postTokenBalances!.find((b) => b.mint !== jto.mint.toBase58())!.mint;
      const trader = await fundedWallet();
      // 10 JTO: enough to move the curve, small enough that its Platform Fee leaves later tests' Ledger figures alone.
      const spend = 10_000_000_000n;
      await mintLocalQuote(connection(), jto.mint, trader.publicKey, spend);
      const p = await prepared(trader, mint, "buy", spend);
      await deliverWebhook([await signAndSend(p, trader)]);
      const bought = BigInt(p.quote.amountOut);
      expect(bought).toBeGreaterThan(0n);
      const sold = await prepared(trader, mint, "sell", bought / 2n);
      await deliverWebhook([await signAndSend(sold, trader)]);
      expect(BigInt(sold.quote.amountOut)).toBeGreaterThan(0n);
    } finally {
      await refreshQuoteRegistry();
    }
    expect((await listQuotes()).find((q) => q.symbol === "JTO")).toMatchObject({ launchable: true, graduationTarget: { raw: jto.raw } });
  });
});

describe("the refresh moves a band only once the target has drifted 5% from its centre (ADR 0005)", () => {
  const jto = EXPECTED_TARGETS[2]!;
  const target = BigInt(jto.raw);
  const platformConfig = () => new PublicKey(env().platform.platformConfig);
  const bandAround = (centre: bigint) => ({ min: new BN(((centre * 9_000n) / 10_000n).toString()), max: new BN(((centre * 11_000n) / 10_000n).toString()) });
  /**
   * Writes JTO's two groups as the refresh would for a target at `centre`, with the Creator Lock JTO's GlobalConfig
   * leaves room for (ADR 0023), signed by the operations wallet as the refresh is.
   */
  const writeBandAround = async (centre: bigint) => {
    const { operations } = localnetKeys();
    const band = bandAround(centre);
    const maxLockBps = creatorLockCapBps((await listGlobalConfigs(connection(), program())).find((c) => c.quoteMint.equals(jto.mint))!);
    return send(connection(), [
      updateCurveRuleIx(program(), operations.publicKey, platformConfig(), globalConfigOf(jto.mint), 0, standardLaunchConstraints(band, { maxLockBps })),
      updateCurveRuleIx(program(), operations.publicKey, platformConfig(), globalConfigOf(jto.mint), 1, rewardLaunchConstraints(band, { maxLockBps })),
    ], [operations]);
  };
  const bandOnChain = async () => {
    const groups = await readCurveRuleGroups(connection(), program(), platformConfig(), [globalConfigOf(jto.mint)]);
    const band = graduationBandOf(groups.get(globalConfigOf(jto.mint).toBase58())!.get(0)!)!;
    return { min: band.min.toString(), max: band.max.toString() };
  };
  const asStrings = (b: { min: BN; max: BN }) => ({ min: b.min.toString(), max: b.max.toString() });

  it("leaves a band whose centre is 4% from the target, which still accepts the target", async () => {
    await writeBandAround((target * 104n) / 100n);
    await refreshQuoteRegistry();
    expect(await bandOnChain()).toEqual(asStrings(bandAround((target * 104n) / 100n)));
    expect((await listQuotes()).find((q) => q.symbol === "JTO")).toMatchObject({ launchable: true, graduationTarget: { raw: jto.raw } });
  });

  it("re-centres a band whose centre is 6% from the target", async () => {
    await writeBandAround((target * 106n) / 100n);
    await refreshQuoteRegistry();
    expect(await bandOnChain()).toEqual(asStrings(bandAround(target)));
    expect((await listQuotes()).find((q) => q.symbol === "JTO")).toMatchObject({ launchable: true, graduationTarget: { raw: jto.raw } });
  });
});

describe("trading on a non-SOL curve", () => {
  const usdc = EXPECTED_TARGETS[0]!;
  const USDC = (n: number) => BigInt(Math.round(n * 1e6));
  const usdcOf = async (owner: Keypair) => {
    const res = await connection().getTokenAccountBalance(getAssociatedTokenAddressSync(usdc.mint, owner.publicKey), "confirmed").catch(() => null);
    return BigInt(res?.value.amount ?? 0);
  };

  async function trade(trader: Keypair, mint: string, side: TradeSide, amount: bigint) {
    const res = await fetch(`${env().apiUrl}/v1/trades/prepare`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mint, trader: trader.publicKey.toBase58(), side, amount: amount.toString(), slippageBps: 100 }),
    });
    if (!res.ok) throw new Error(`prepare trade failed: ${res.status} ${await res.text()}`);
    const prepared = PreparedTrade.parse(await res.json());
    const signature = await signAndSend(prepared, trader);
    await deliverWebhook([signature]);
    return prepared.quote;
  }

  it("buys and sells in USDC's raw units, with every fee paid in USDC, and indexes the trades", async () => {
    const creator = await fundedWallet();
    const { prepared: coin, signature } = await launch(creator, { symbol: "USDP", quoteMint: usdc.mint.toBase58() });
    await deliverWebhook([signature]);
    const trader = await fundedWallet();
    await mintLocalQuote(connection(), usdc.mint, trader.publicKey, USDC(50));

    const buy = await trade(trader, coin.mint, "buy", USDC(10));
    // 1.25% of 10 USDC in fees: 0.025 to Raydium, the rest split between the Platform Fee and Creator Fee as the chain has them.
    const rates = await feeRates();
    expect(buy.fees).toEqual({ raydium: "25000", platform: feeAt(USDC(10), rates.platform).toString(), creator: feeAt(USDC(10), rates.creator).toString() });
    expect(BigInt(buy.fees.platform) + BigInt(buy.fees.creator)).toBe(USDC(0.1));
    expect(await usdcOf(trader)).toBe(USDC(40));
    const coins = BigInt(buy.amountOut);

    const sell = await trade(trader, coin.mint, "sell", coins);
    expect(await usdcOf(trader)).toBe(USDC(40) + BigInt(sell.amountOut));
    expect(BigInt(sell.amountOut)).toBeGreaterThan(USDC(9.7));

    const { trades } = TradeList.parse(await (await fetch(`${env().apiUrl}/v1/launches/${coin.mint}/trades`)).json());
    expect(trades.map((t) => [t.side, t.quoteAmount, t.baseAmount])).toEqual([
      ["sell", sell.amountOut, coins.toString()],
      ["buy", USDC(10).toString(), coins.toString()],
    ]);
    // The price is in whole USDC per whole coin: a fresh curve raising 150 USDC for 793.1B coins starts near 5e-11.
    expect(trades[1]!.price).toBeGreaterThan(1e-11);
    expect(trades[1]!.price).toBeLessThan(1e-9);
    const { launch: summary } = await getLaunch(coin.mint);
    expect(summary).toMatchObject({ quote: { symbol: "USDC", decimals: 6 }, graduationTarget: usdc.raw, curve: { status: "live" } });
    expect(BigInt(summary!.curve.raised)).toBeLessThan(USDC(0.2));
  });
});
