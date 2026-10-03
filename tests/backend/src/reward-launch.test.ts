// A Reward Launch (#16): a Token-2022 coin whose every transfer withholds a Reward Tax of 1%, 3% or 5% for its holders.
// LaunchLab's own authority holds the coin's fee-config authority until Graduation, so nobody can change the tax; the
// migration hands it to the operations wallet, which gives it up for good.
import { describe, expect, it } from "vitest";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync, getMint, getTransferFeeConfig } from "@solana/spl-token";
import { launchlabPdas } from "@launchpad/chain";
import { LaunchSummary, PreparedLaunch, TradeQuote } from "@launchpad/contract";
import { LOCAL_QUOTES, migrateCurve, mintLocalQuote } from "@launchpad/localnet";
import { connection, deliverWebhook, env, fundedWallet, getLaunch, prepare, quote, signAndSend, tokenBalance, trade } from "./client";

const withheld = (amount: bigint, bps: number) => (amount * BigInt(bps) + 9_999n) / 10_000n;
/** A Reward Launch's coin is a Token-2022 mint, so its accounts live under that program. */
const coinsOf = (mint: string, owner: { publicKey: PublicKey }) => tokenBalance(getAssociatedTokenAddressSync(new PublicKey(mint), owner.publicKey, false, TOKEN_2022_PROGRAM_ID));

async function rewardCoin(rewardTax: 100 | 300 | 500, quoteMint?: string, firstBuy?: string) {
  const creator = await fundedWallet(10);
  const res = await prepare({ creator: creator.publicKey.toBase58(), rewardTax: String(rewardTax), symbol: `RW${rewardTax}`, ...(quoteMint ? { quoteMint } : {}), ...(firstBuy ? { firstBuy } : {}) });
  if (!res.ok) throw new Error(`prepare failed: ${res.status} ${await res.text()}`);
  const prepared = PreparedLaunch.parse(await res.json());
  const signature = await signAndSend(prepared, creator);
  await deliverWebhook([signature]);
  return { creator, prepared, signature, mint: prepared.mint, pool: new PublicKey(prepared.pool) };
}

async function taxConfig(mint: string) {
  return getTransferFeeConfig(await getMint(connection(), new PublicKey(mint), "confirmed", TOKEN_2022_PROGRAM_ID));
}

describe("a Reward Launch", () => {
  it.each([100, 300, 500] as const)("launches with a %i bps Reward Tax on SOL, as a Token-2022 coin nobody can retax", async (bps) => {
    const { prepared, mint } = await rewardCoin(bps);
    expect(prepared.rewardTax).toEqual({ bps, payout: "coin" });
    const account = await connection().getAccountInfo(new PublicKey(mint));
    expect(account!.owner.toBase58()).toBe(TOKEN_2022_PROGRAM_ID.toBase58());
    const config = (await taxConfig(mint))!;
    expect(config.newerTransferFee.transferFeeBasisPoints).toBe(bps);
    expect(config.olderTransferFee.transferFeeBasisPoints).toBe(bps);
    // Until Graduation LaunchLab's own authority holds the fee-config authority: no key anyone holds.
    const launchlabAuthority = launchlabPdas(new PublicKey(env().platform.launchlab)).authority;
    expect(config.transferFeeConfigAuthority.toBase58()).toBe(launchlabAuthority.toBase58());
    // The withheld tax is ours to pay out to holders from the start.
    expect(config.withdrawWithheldAuthority.toBase58()).toBe(env().platform.operationsWallet);

    const summary = LaunchSummary.parse((await getLaunch(mint)).launch);
    expect(summary.rewardTax).toEqual({ bps, payout: "coin", locked: null });
  });

  it("withholds the tax on every trade, which the quote shows and the wallet confirms", async () => {
    const { mint } = await rewardCoin(300);
    const trader = await fundedWallet();
    const shown = TradeQuote.parse(await (await quote(mint, { side: "buy", amount: "100000000" })).json());
    expect(shown.transferFeeBps).toEqual({ quote: 0, base: 300 });
    // The curve pays out `programAmountOut`; 3% of it never reaches the wallet.
    const paidOut = BigInt(shown.amountOut) + BigInt(shown.transferFees.base);
    expect(BigInt(shown.transferFees.base)).toBe(withheld(paidOut, 300));

    const { quote: q } = await trade(trader, mint, "buy", 100000000n, 0);
    expect(await coinsOf(mint, trader)).toBe(BigInt(q.amountOut));

    // Selling loses 3% of the coins on the way into the curve, and the fees are on what arrives.
    const coins = await coinsOf(mint, trader);
    const sell = TradeQuote.parse(await (await quote(mint, { side: "sell", amount: coins.toString() })).json());
    expect(BigInt(sell.transferFees.base)).toBe(withheld(coins, 300));
    const { quote: sold } = await trade(trader, mint, "sell", coins, 0);
    expect(sold.amountOut).toBe(sell.amountOut);
    expect(await coinsOf(mint, trader)).toBe(0n);
  });

  it("fixes the Payout Asset at launch: prepared, kept by a retry, shown on the Launch, and never for a standard coin", async () => {
    const creator = await fundedWallet(10);
    // The payout asset is a Reward Launch's choice alone.
    const standard = await prepare({ creator: creator.publicKey.toBase58(), rewardPayout: "quote" });
    expect(standard.status).toBe(400);
    expect(await standard.text()).toMatch(/only for a Reward Launch/);

    const res = await prepare({ creator: creator.publicKey.toBase58(), rewardTax: "300", rewardPayout: "quote", symbol: "RWQ" });
    expect(res.status, await res.clone().text()).toBe(200);
    const prepared = PreparedLaunch.parse(await res.json());
    expect(prepared.rewardTax).toEqual({ bps: 300, payout: "quote" });
    // A retry rebuilds the same launch with the same choice; nothing about it can be sent again differently.
    const again = PreparedLaunch.parse(await (await fetch(`${env().apiUrl}/v1/launches/${prepared.mint}/prepare`, { method: "POST" })).json());
    expect(again.mint).toBe(prepared.mint);
    expect(again.rewardTax).toEqual({ bps: 300, payout: "quote" });
    const signature = await signAndSend(again, creator);
    await deliverWebhook([signature]);
    expect(LaunchSummary.parse((await getLaunch(prepared.mint)).launch).rewardTax).toEqual({ bps: 300, payout: "quote", locked: null });

    // Left out, a Reward Launch pays in the coin, as every one did before the choice existed.
    const coin = await rewardCoin(100);
    expect(coin.prepared.rewardTax).toEqual({ bps: 100, payout: "coin" });
    expect(LaunchSummary.parse((await getLaunch(coin.mint)).launch).rewardTax).toEqual({ bps: 100, payout: "coin", locked: null });
  });

  it("works on a Quote Asset other than SOL, with a first buy that allows for the tax", async () => {
    const creator = await fundedWallet();
    await mintLocalQuote(connection(), LOCAL_QUOTES.USDC, creator.publicKey, 50_000_000n);
    const res = await prepare({ creator: creator.publicKey.toBase58(), rewardTax: "500", quoteMint: LOCAL_QUOTES.USDC.toBase58(), firstBuy: "10000000" });
    expect(res.status).toBe(200);
    const prepared = PreparedLaunch.parse(await res.json());
    expect(prepared.firstBuy!.transferFeeBps).toEqual({ quote: 0, base: 500 });
    await signAndSend(prepared, creator);
    expect(await coinsOf(prepared.mint, creator)).toBe(BigInt(prepared.firstBuy!.amountOut));
  });

  it("refuses a tax at any other rate", async () => {
    const creator = await fundedWallet();
    for (const rewardTax of ["200", "600", "abc"]) {
      const res = await prepare({ creator: creator.publicKey.toBase58(), rewardTax });
      expect(res.status, rewardTax).toBe(400);
    }
  });

  it("has its tax authority given up for good once it graduates, recorded on the coin", async () => {
    const { mint, pool } = await rewardCoin(100);
    const trader = await fundedWallet(10);
    const buyout = await trade(trader, mint, "buy", 2_000_000_000n);
    expect(buyout.quote.completesCurve).toBe(true);
    await deliverWebhook([buyout.signature]);
    const migration = await migrateCurve(connection(), pool);
    await deliverWebhook([migration.signature]);
    // The migration hands the fee-config authority to the operations wallet.
    expect((await taxConfig(mint))!.transferFeeConfigAuthority.toBase58()).toBe(env().platform.operationsWallet);

    const run = await fetch(`${env().apiUrl}/__scheduled?cron=${encodeURIComponent("* * * * *")}`);
    expect(run.ok).toBe(true);
    const config = (await taxConfig(mint))!;
    expect(config.transferFeeConfigAuthority.toBase58()).toBe(PublicKey.default.toBase58());
    expect(config.newerTransferFee.transferFeeBasisPoints).toBe(100);
    const summary = LaunchSummary.parse((await getLaunch(mint)).launch);
    expect(summary.rewardTax!.locked).not.toBeNull();
    const locked = await connection().getTransaction(summary.rewardTax!.locked!.signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    expect(locked?.meta?.err).toBeNull();

    // Trading in the pool withholds the tax too, and the quote says so (the pool opens a second after the migration).
    let pooled: TradeQuote | null = null;
    for (let i = 0; i < 40 && !pooled; i++) {
      const res = await quote(mint, { side: "buy", amount: "10000000" });
      if (res.ok) pooled = TradeQuote.parse(await res.json());
      else await new Promise((r) => setTimeout(r, 250));
    }
    expect(pooled!.venue).toBe("pool");
    expect(pooled!.transferFeeBps.base).toBe(100);
  });
});
