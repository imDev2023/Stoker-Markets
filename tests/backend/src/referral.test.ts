// Referral share fee (#21): a referrer who routes a trade earns LaunchLab's share fee on it, paid by the chain into the
// referrer's account of the Quote Asset, on the Quote Assets whose GlobalConfig allows a share fee. The API says per
// Quote Asset whether it applies, and a trade on one that doesn't is quoted without it.
import { describe, expect, it } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, NATIVE_MINT } from "@solana/spl-token";
import { PreparedTrade, TradeList, TradeQuote } from "@launchpad/contract";
import { LOCAL_QUOTES, mintLocalQuote } from "@launchpad/localnet";
import { connection, deliverWebhook, env, fundedWallet, launch, launchedCoin, listQuotes, quote, signAndSend, tokenBalance } from "./client";

const api = (path: string, init?: RequestInit) => fetch(`${env().apiUrl}${path}`, init);

async function referredTrade(trader: Keypair, mint: string, amount: bigint, referrer: PublicKey) {
  const res = await api("/v1/trades/prepare", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ mint, trader: trader.publicKey.toBase58(), side: "buy", amount: amount.toString(), slippageBps: 100, referrer: referrer.toBase58() }),
  });
  if (!res.ok) throw new Error(`prepare failed: ${res.status} ${await res.text()}`);
  const prepared = PreparedTrade.parse(await res.json());
  const signature = await signAndSend(prepared, trader);
  await deliverWebhook([signature]);
  return { quote: prepared.quote, signature };
}

describe("the referral share fee", () => {
  it("is reported per Quote Asset: allowed where the GlobalConfig has a share fee rate, not where it is zero", async () => {
    const quotes = await listQuotes();
    const sol = quotes.find((q) => q.mint === NATIVE_MINT.toBase58())!;
    const jto = quotes.find((q) => q.mint === LOCAL_QUOTES.JTO.toBase58())!;
    expect(sol.referralShare).toEqual({ allowed: true, bps: env().referralShareBps });
    // The local chain gives JTO a GlobalConfig whose share fee rate is zero, as most mainnet Quote Assets have.
    expect(jto.referralShare).toEqual({ allowed: false, bps: 0 });
  });

  it("pays the referrer the share fee on a referred buy, shown in the quote and recorded on the trade", async () => {
    const { mint, pool } = await launchedCoin();
    const trader = await fundedWallet();
    const referrer = Keypair.generate();
    const shown = TradeQuote.parse(await (await quote(mint, { side: "buy", amount: "100000000", referrer: referrer.publicKey.toBase58() })).json());
    expect(shown.referral).toMatchObject({ referrer: referrer.publicKey.toBase58(), applies: true, bps: env().referralShareBps });
    expect(BigInt(shown.referral!.fee)).toBeGreaterThan(0n);
    // Without a referrer the trader gets slightly more coins: the share fee comes out of what reaches the curve.
    const plain = TradeQuote.parse(await (await quote(mint, { side: "buy", amount: "100000000" })).json());
    expect(plain.referral).toBeNull();
    expect(BigInt(plain.amountOut)).toBeGreaterThan(BigInt(shown.amountOut));

    const { quote: q, signature } = await referredTrade(trader, mint, 100000000n, referrer.publicKey);
    expect(q.referral).toEqual(shown.referral);
    // SOL arrives wrapped in the referrer's wrapped-SOL account, theirs to unwrap.
    const received = await tokenBalance(getAssociatedTokenAddressSync(NATIVE_MINT, referrer.publicKey));
    expect(received).toBe(BigInt(q.referral!.fee));
    const { trades } = TradeList.parse(await (await api(`/v1/launches/${mint}/trades`)).json());
    expect(trades.find((t) => t.signature === signature)).toMatchObject({ referral: { referrer: referrer.publicKey.toBase58(), fee: q.referral!.fee } });
    void pool;
  });

  it("does not apply on a Quote Asset whose GlobalConfig allows none, and the quote says so", async () => {
    const creator = await fundedWallet();
    const { prepared, signature } = await launch(creator, { symbol: "NOSHR", quoteMint: LOCAL_QUOTES.JTO.toBase58() });
    await deliverWebhook([signature]);
    const referrer = Keypair.generate();
    const shown = TradeQuote.parse(await (await quote(prepared.mint, { side: "buy", amount: "1000000000", referrer: referrer.publicKey.toBase58() })).json());
    expect(shown.referral).toMatchObject({ referrer: referrer.publicKey.toBase58(), applies: false, fee: "0", bps: 0 });
    expect(shown.referral!.reason).toMatch(/JTO/);
    const trader = await fundedWallet();
    await mintLocalQuote(connection(), LOCAL_QUOTES.JTO, trader.publicKey, 10_000_000_000n);
    const { quote: q } = await referredTrade(trader, prepared.mint, 1_000_000_000n, referrer.publicKey);
    expect(q.referral!.applies).toBe(false);
    expect(await tokenBalance(getAssociatedTokenAddressSync(LOCAL_QUOTES.JTO, referrer.publicKey))).toBe(0n);
  });

  it("refuses a referrer that is the trader, or not a wallet", async () => {
    const { mint } = await launchedCoin();
    const trader = await fundedWallet();
    const self = await quote(mint, { side: "buy", amount: "1000000", referrer: trader.publicKey.toBase58() });
    void self; // a trader may not refer themselves: checked at prepare time below
    const res = await api("/v1/trades/prepare", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ mint, trader: trader.publicKey.toBase58(), side: "buy", amount: "1000000", referrer: trader.publicKey.toBase58() }),
    });
    expect(res.status).toBe(400);
    const bad = await quote(mint, { side: "buy", amount: "1000000", referrer: "not-an-address" });
    expect(bad.status).toBe(400);
  });
});
