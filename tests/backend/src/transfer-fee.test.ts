// Quote Assets whose issuer withholds a Token-2022 transfer fee on every transfer (issue #29): 33 of mainnet's Quote
// Assets do, PreStocks at 3%. The local chain's TAXQ charges 1%. Every quote must allow for what the issuer takes on the
// way into the curve or pool and on the way out, or trades fail on slippage or fill worse than shown.
import { describe, expect, it } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { FirstBuyQuote, PreparedLaunch, TradeQuote } from "@launchpad/contract";
import { LOCAL_QUOTES, TAXED_QUOTE_FEE_BPS, mintLocalQuote } from "@launchpad/localnet";
import { coinsOf, connection, deliverWebhook, env, fundedWallet, launch, listQuotes, prepare, quote, signAndSend, tokenBalance, trade } from "./client";

const TAXQ = LOCAL_QUOTES.TAXQ;
const taxq = (n: number) => BigInt(Math.round(n * 1_000_000));
const taxqOf = (owner: Keypair) => tokenBalance(getAssociatedTokenAddressSync(TAXQ, owner.publicKey, false, TOKEN_2022_PROGRAM_ID));
/** What the issuer withholds from a transfer of `amount`: 1%, rounded up. */
const withheld = (amount: bigint) => (amount * BigInt(TAXED_QUOTE_FEE_BPS) + 9_999n) / 10_000n;

async function taxedCoin() {
  const creator = await fundedWallet();
  const { prepared, signature } = await launch(creator, { symbol: "TAXED", quoteMint: TAXQ.toBase58() });
  await deliverWebhook([signature]);
  return { creator, mint: prepared.mint, pool: new PublicKey(prepared.pool) };
}

describe("a Quote Asset with a transfer fee", () => {
  it("is listed as launchable, with the fee in its quotes", async () => {
    const q = (await listQuotes()).find((q) => q.mint === TAXQ.toBase58());
    expect(q).toMatchObject({ symbol: "TAXQ", decimals: 6, tokenProgram: TOKEN_2022_PROGRAM_ID.toBase58(), launchable: true });
    // 150 USD of it at 1 USD: the Graduation Target is 150 TAXQ.
    expect(q!.graduationTarget).toMatchObject({ raw: "150000000" });
  });

  it("buys with the fee taken out first, so the curve fills exactly as quoted even at 0.5% slippage", async () => {
    const { mint } = await taxedCoin();
    const trader = await fundedWallet();
    await mintLocalQuote(connection(), TAXQ, trader.publicKey, taxq(50));
    const shown = TradeQuote.parse(await (await quote(mint, { side: "buy", amount: taxq(10).toString(), slippageBps: "50" })).json());
    // 1% of the 10 TAXQ never reaches the curve; the fees are on what does.
    expect(shown.transferFeeBps).toEqual({ quote: 100, base: 0 });
    expect(shown.transferFees).toEqual({ quote: withheld(taxq(10)).toString(), base: "0" });
    const arrived = taxq(10) - withheld(taxq(10));
    expect(BigInt(shown.fees.raydium) + BigInt(shown.fees.platform) + BigInt(shown.fees.creator)).toBe((arrived * 125n + 9_999n) / 10_000n);

    const { quote: q } = await trade(trader, mint, "buy", taxq(10), 50);
    expect(q.amountOut).toBe(shown.amountOut);
    expect(await coinsOf(mint, trader)).toBe(BigInt(q.amountOut));
    expect(await taxqOf(trader)).toBe(taxq(50) - taxq(10));
  });

  it("sells with the fee taken from what the curve pays, showing what really reaches the wallet", async () => {
    const { mint } = await taxedCoin();
    const trader = await fundedWallet();
    await mintLocalQuote(connection(), TAXQ, trader.publicKey, taxq(50));
    await trade(trader, mint, "buy", taxq(20));
    const coins = await coinsOf(mint, trader);
    const held = await taxqOf(trader);

    // At zero slippage the limit is exactly what the program pays out, which proves which figure it checks.
    const { quote: q } = await trade(trader, mint, "sell", coins / 2n, 0);
    expect(q.transferFeeBps.quote).toBe(100);
    expect(BigInt(q.transferFees.quote)).toBeGreaterThan(0n);
    expect(await coinsOf(mint, trader)).toBe(coins - coins / 2n);
    // The wallet receives the quoted amount to the unit, the issuer's cut already taken.
    expect((await taxqOf(trader)) - held).toBe(BigInt(q.amountOut));
    expect(BigInt(q.minAmountOut)).toBe(BigInt(q.amountOut));
  });

  it("takes only what is left on the curve when a buy would overshoot it, fee included", async () => {
    const { mint } = await taxedCoin();
    const trader = await fundedWallet();
    await mintLocalQuote(connection(), TAXQ, trader.publicKey, taxq(400));
    const held = await taxqOf(trader);
    const { quote: q } = await trade(trader, mint, "buy", taxq(300), 50);
    expect(q.completesCurve).toBe(true);
    expect(BigInt(q.amountIn)).toBeLessThan(taxq(300));
    expect(held - (await taxqOf(trader))).toBe(BigInt(q.amountIn));
    expect(await coinsOf(mint, trader)).toBe(BigInt(q.amountOut));
  });

  it("lands a launch with a First Buy, whose exact fill allows for the fee", async () => {
    const creator = await fundedWallet();
    await mintLocalQuote(connection(), TAXQ, creator.publicKey, taxq(30));
    const res = await fetch(`${env().apiUrl}/v1/launch-quote?${new URLSearchParams({ quoteMint: TAXQ.toBase58(), firstBuy: taxq(10).toString() })}`);
    const { firstBuy } = FirstBuyQuote.parse(await res.json());
    expect(firstBuy.transferFees.quote).toBe(withheld(taxq(10)).toString());

    const prepared = PreparedLaunch.parse(await (await prepare({ creator: creator.publicKey.toBase58(), quoteMint: TAXQ.toBase58(), firstBuy: taxq(10).toString() })).json());
    expect(prepared.firstBuy).toEqual(firstBuy);
    const held = await taxqOf(creator);
    await signAndSend(prepared, creator);
    expect(await coinsOf(prepared.mint, creator)).toBe(BigInt(firstBuy.amountOut));
    expect(held - (await taxqOf(creator))).toBe(BigInt(firstBuy.amountIn));
  });
});
