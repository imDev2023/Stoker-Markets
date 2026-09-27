import { describe, expect, it } from "vitest";
import { ComputeBudgetProgram, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import BN from "bn.js";
import { initializeV2Ix, launchlabCoder, launchlabPdas, WSOL_MINT } from "@launchpad/chain";
import { LOCAL_QUOTES } from "@launchpad/localnet";
import { connection, deliverWebhook, env, fundedWallet, getLaunch, launch, listQuotes, prepare, refreshQuoteRegistry } from "./client";

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

/** A launch built straight from the IDL, bypassing our API, as anyone could send it. */
async function launchDirectly(quoteMint: PublicKey, quoteTokenProgram: PublicKey, graduationTargetRaw: BN) {
  const creator = await fundedWallet();
  const mint = Keypair.generate();
  const tx = new Transaction().add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
    initializeV2Ix({
      program: program(), payer: creator.publicKey, creator: creator.publicKey, globalConfig: globalConfigOf(quoteMint),
      platformConfig: new PublicKey(env().platform.platformConfig), baseMint: mint.publicKey, quoteMint, quoteTokenProgram,
      name: "Direct", symbol: "DRCT", uri: "https://example.invalid/d.json", graduationTargetRaw,
    }),
  );
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
      expect(summary).toMatchObject({ symbol: "PAIR", graduationTarget: raw, quote: { mint: mint.toBase58(), symbol, decimals } });
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
    expect(await res.json()).toEqual({ launched: 1 });
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
