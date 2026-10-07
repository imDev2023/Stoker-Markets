import { beforeAll, describe, expect, it } from "vitest";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { createAssociatedTokenAccountIdempotentInstruction, createTransferInstruction, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { cpmmPdas, curvePrice, launchlabPdas, loadCurve, loadPool, programsFor, WSOL_MINT } from "@launchpad/chain";
import {
  HolderList, LaunchList, LaunchQuoteList, LaunchSummary, PreparedTrade, TradeQuote, type LaunchListQuery, type TradeSide,
} from "@launchpad/contract";
import { LOCAL_QUOTES, migrateCurve, mintLocalQuote } from "@launchpad/localnet";
import { connection, deliverWebhook, env, fundedWallet, launch, listQuotes, signAndSend } from "./client";

// Board discovery through the public read API: sorts, filters and pages over indexed Launches, market figures that
// follow the chain, the Quote Assets in use, and top holders read from the chain. The stack prices SOL at 150 USD and
// USDC at 1, and every Launch graduates at 1 SOL worth of its Quote Asset.

const SOL = (n: number) => BigInt(Math.round(n * LAMPORTS_PER_SOL));
const USDC = (n: number) => BigInt(n * 1_000_000);
const COIN_SUPPLY_WHOLE = 1_000_000_000;

async function board(query: Partial<Record<keyof LaunchListQuery, string | number>> = {}) {
  const params = new URLSearchParams(Object.fromEntries(Object.entries(query).map(([k, v]) => [k, String(v)])));
  const res = await fetch(`${env().apiUrl}/v1/launches?${params}`);
  if (!res.ok) throw new Error(`list failed: ${res.status} ${await res.text()}`);
  return LaunchList.parse(await res.json());
}

async function detail(mint: string) {
  const res = await fetch(`${env().apiUrl}/v1/launches/${mint}`);
  return LaunchSummary.parse(await res.json());
}

async function holders(mint: string) {
  const res = await fetch(`${env().apiUrl}/v1/launches/${mint}/holders`);
  if (!res.ok) throw new Error(`holders failed: ${res.status} ${await res.text()}`);
  return HolderList.parse(await res.json());
}

async function launchCoin(creator: Keypair, symbol: string, quoteMint?: PublicKey) {
  const { prepared, signature } = await launch(creator, { name: `Board ${symbol}`, symbol, ...(quoteMint ? { quoteMint: quoteMint.toBase58() } : {}) });
  await deliverWebhook([signature]);
  return prepared.mint;
}

/** What a trader does: ask the API for the trade, sign it, send it; then the webhook delivers it to the Indexer. */
async function trade(trader: Keypair, mint: string, side: TradeSide, amount: bigint) {
  const res = await fetch(`${env().apiUrl}/v1/trades/prepare`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mint, trader: trader.publicKey.toBase58(), side, amount: amount.toString(), slippageBps: 500 }),
  });
  if (!res.ok) throw new Error(`prepare trade failed: ${res.status} ${await res.text()}`);
  const prepared = PreparedTrade.parse(await res.json());
  const signature = await signAndSend(prepared, trader);
  await deliverWebhook([signature]);
  return { signature, quote: prepared.quote };
}

async function quote(mint: string, side: TradeSide, amount: bigint) {
  const res = await fetch(`${env().apiUrl}/v1/launches/${mint}/quote?side=${side}&amount=${amount}`);
  return TradeQuote.parse(await res.json());
}

async function tokenBalance(owner: PublicKey, mint: string) {
  const res = await connection().getTokenAccountBalance(getAssociatedTokenAddressSync(new PublicKey(mint), owner, true), "confirmed").catch(() => null);
  return BigInt(res?.value.amount ?? 0);
}

/** The pool vault holding a graduated coin's coins. */
async function poolCoinVault(pool: PublicKey, mint: string) {
  const p = (await loadPool(connection(), pool))!;
  return (p.tokens[0].mint.toBase58() === mint ? p.tokens[0] : p.tokens[1]).vault;
}

/** Raydium's crank, played by the local migrate wallet: moves a sold-out curve into its pool, then waits for the pool to open. */
async function graduate(mint: string, curve: string) {
  const migration = await migrateCurve(connection(), new PublicKey(curve));
  await deliverWebhook([migration.signature]);
  for (let i = 0; i < 40; i++) {
    const res = await fetch(`${env().apiUrl}/v1/launches/${mint}/quote?side=buy&amount=1000000`);
    if (res.ok) return migration.pool;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`the pool of ${mint} never opened`);
}

/** The curve's price on-chain right now, in whole Quote Asset units per whole coin. */
async function chainPrice(pool: string) {
  const curve = (await loadCurve(connection(), new PublicKey(pool)))!;
  return curvePrice(curve.reserves, curve.baseDecimals, curve.quoteDecimals);
}

const mints = (l: LaunchList) => l.launches.map((x) => x.mint);

describe("Quote Asset categories", () => {
  it("puts every local Quote Asset in its category, by mint address or issuer authority", async () => {
    const byMint = new Map((await listQuotes()).map((q) => [q.mint, q.category]));
    expect(byMint.get(WSOL_MINT.toBase58())).toBe("sol");
    expect(byMint.get(LOCAL_QUOTES.USDC.toBase58())).toBe("stablecoin");
    // NVDAx's freeze authority and permanent delegate are Backed's, the xStocks issuer.
    expect(byMint.get(LOCAL_QUOTES.NVDAx.toBase58())).toBe("tokenized_stock");
    expect(byMint.get(LOCAL_QUOTES.JTO.toBase58())).toBe("community");
    expect(byMint.get(LOCAL_QUOTES.BULLWHALE.toBase58())).toBe("community");
  });
});

describe("a new Launch's market", () => {
  it("opens at the curve's starting price, so it has a market cap before anyone trades", async () => {
    const creator = await fundedWallet();
    const mint = await launchCoin(creator, "OPEN");
    const l = await detail(mint);
    // The curve's own price on-chain, and the price the first trade would start from.
    const onChain = await chainPrice(l.pool);
    expect(l.market.price).toBeCloseTo(onChain, 15);
    expect(l.market.price).toBeCloseTo((await quote(mint, "buy", SOL(0.01))).priceBefore, 15);
    expect(l.market.marketCap!.quote).toBeCloseTo(onChain * COIN_SUPPLY_WHOLE, 6);
    expect(l.market.marketCap!.sol).toBeCloseTo(onChain * COIN_SUPPLY_WHOLE, 6);
    expect(l.market.marketCap!.usd).toBeCloseTo(onChain * COIN_SUPPLY_WHOLE * 150, 4);
    expect(l.market.volume24h).toEqual({ raw: "0", quote: 0, sol: 0, usd: 0 });
    expect(l.market.lastTradeAt).toBeNull();
  });

  it("follows every trade, and a replayed trade changes nothing", async () => {
    const creator = await fundedWallet();
    const trader = await fundedWallet();
    const mint = await launchCoin(creator, "FOLW");
    const { signature: buy } = await trade(trader, mint, "buy", SOL(0.2));
    await trade(trader, mint, "sell", 1_000_000n * 1_000_000n);
    const l = await detail(mint);
    const onChain = await chainPrice(l.pool);
    expect(l.market.price).toBeCloseTo(onChain, 15);
    expect(l.market.marketCap!.sol).toBeCloseTo(onChain * COIN_SUPPLY_WHOLE, 6);
    expect(l.market.lastTradeAt).not.toBeNull();
    const volume = l.market.volume24h;
    expect(BigInt(volume.raw)).toBeGreaterThan(SOL(0.2));
    expect(volume.sol).toBeCloseTo(Number(volume.raw) / LAMPORTS_PER_SOL, 9);
    expect(volume.usd).toBeCloseTo((Number(volume.raw) / LAMPORTS_PER_SOL) * 150, 6);

    await deliverWebhook([buy]);
    expect((await detail(mint)).market).toEqual(l.market);
  });
});

describe("sorting and filtering the board", () => {
  // One Creator's Launches, so each query can be narrowed to them whatever else the suite has launched.
  let creator: Keypair;
  const coin = { quiet: "", small: "", big: "", dollar: "", sold: "" };
  const only = (q: Partial<Record<keyof LaunchListQuery, string | number>> = {}) => board({ creator: creator.publicKey.toBase58(), ...q });

  beforeAll(async () => {
    creator = await fundedWallet(10);
    const trader = await fundedWallet(10);
    coin.quiet = await launchCoin(creator, "QUIET");
    coin.small = await launchCoin(creator, "SMALL");
    coin.big = await launchCoin(creator, "BIG");
    coin.dollar = await launchCoin(creator, "DLR", LOCAL_QUOTES.USDC);
    coin.sold = await launchCoin(creator, "SOLD");
    await trade(trader, coin.small, "buy", SOL(0.1));
    await trade(trader, coin.big, "buy", SOL(0.3));
    // 30 USDC is 0.2 SOL at the stack's prices: between SMALL and BIG in SOL terms, though far more in raw units.
    await mintLocalQuote(connection(), LOCAL_QUOTES.USDC, trader.publicKey, USDC(30));
    await trade(trader, coin.dollar, "buy", USDC(30));
    // More than the 1 SOL Graduation Target: the buy takes the rest of the curve, which starts Graduation.
    await trade(trader, coin.sold, "buy", SOL(2));
  }, 180_000);

  it("sorts newest first by default", async () => {
    expect(mints(await only())).toEqual([coin.sold, coin.dollar, coin.big, coin.small, coin.quiet]);
    expect(mints(await only({ sort: "new" }))).toEqual([coin.sold, coin.dollar, coin.big, coin.small, coin.quiet]);
  });

  it("sorts trending by the last day's volume in SOL terms, across Quote Assets", async () => {
    const list = await only({ sort: "trending" });
    expect(mints(list)).toEqual([coin.sold, coin.big, coin.dollar, coin.small, coin.quiet]);
    const dollar = list.launches.find((l) => l.mint === coin.dollar)!;
    expect(dollar.market.volume24h.raw).toBe(USDC(30).toString());
    expect(dollar.market.volume24h.sol).toBeCloseTo(0.2, 9);
  });

  it("sorts by market cap in SOL terms, matching the prices on-chain", async () => {
    const list = await only({ sort: "market_cap" });
    expect(mints(list)).toEqual([coin.sold, coin.big, coin.dollar, coin.small, coin.quiet]);
    for (const l of list.launches) {
      const price = await chainPrice(l.pool);
      const solPerQuote = l.quote.mint === LOCAL_QUOTES.USDC.toBase58() ? 1 / 150 : 1;
      expect(l.market.marketCap!.quote).toBeCloseTo(price * COIN_SUPPLY_WHOLE, 4);
      expect(l.market.marketCap!.sol! / (price * COIN_SUPPLY_WHOLE * solPerQuote)).toBeCloseTo(1, 9);
    }
  });

  it("sorts live curves closest to Graduation first, then graduating ones", async () => {
    const list = await only({ sort: "graduation" });
    expect(mints(list)).toEqual([coin.big, coin.dollar, coin.small, coin.quiet, coin.sold]);
    expect(list.launches.map((l) => l.curve.status)).toEqual(["live", "live", "live", "live", "graduating"]);
    // BIG raised 0.3 SOL less fees of its 1 SOL target; DLR 30 USDC less fees of 150: BIG is closer.
    const progress = (l: LaunchSummary) => Number(l.curve.raised) / Number(l.graduationTarget);
    const shares = list.launches.slice(0, 4).map(progress);
    expect(shares).toEqual([...shares].sort((a, b) => b - a));
  });

  it("filters by Quote Asset, category, status and Creator", async () => {
    expect(mints(await only({ quote: LOCAL_QUOTES.USDC.toBase58() }))).toEqual([coin.dollar]);
    expect(mints(await only({ category: "stablecoin" }))).toEqual([coin.dollar]);
    expect(mints(await only({ category: "sol" }))).toEqual([coin.sold, coin.big, coin.small, coin.quiet]);
    expect(mints(await only({ category: "tokenized_stock" }))).toEqual([]);
    expect(mints(await only({ issuer: "xstocks" }))).toEqual([]);
    // No local Quote Asset is a leveraged token, a collectible or a Tessera stock; the filters are known and find nothing.
    expect(mints(await only({ category: "leveraged" }))).toEqual([]);
    expect(mints(await only({ category: "collectible" }))).toEqual([]);
    expect(mints(await only({ issuer: "tessera" }))).toEqual([]);
    expect(mints(await only({ status: "graduating" }))).toEqual([coin.sold]);
    expect(mints(await only({ status: "live", sort: "market_cap" }))).toEqual([coin.big, coin.dollar, coin.small, coin.quiet]);
    expect(mints(await only({ status: "graduated" }))).toEqual([]);
    expect(mints(await board({ creator: Keypair.generate().publicKey.toBase58() }))).toEqual([]);
    // Every Launch on the whole board that the category filter returns is paired with a Quote Asset of that category.
    const stable = await board({ category: "stablecoin", limit: 100 });
    expect(stable.launches.length).toBeGreaterThan(0);
    expect(stable.launches.every((l) => l.quote.category === "stablecoin")).toBe(true);
  });

  // Their own Creator, so the paging test below still sees exactly the five coins above.
  const mine = (own: Keypair, q: Partial<Record<keyof LaunchListQuery, string | number>> = {}) => board({ creator: own.publicKey.toBase58(), ...q });

  it("filters by a stock issuer, finer than the category", async () => {
    const own = await fundedWallet(5);
    const stock = await launchCoin(own, "STK", LOCAL_QUOTES.NVDAx);
    expect(mints(await mine(own, { issuer: "xstocks" }))).toEqual([stock]);
    expect(mints(await mine(own, { category: "tokenized_stock" }))).toEqual([stock]);
    expect(mints(await mine(own, { issuer: "prestocks" }))).toEqual([]);
    const list = await mine(own, { issuer: "xstocks" });
    expect(list.launches[0]?.quote).toMatchObject({ symbol: "NVDAx", category: "tokenized_stock", issuer: "xstocks" });
    // The Quote Assets in use say their issuer too, so a filter can offer the right ones.
    const { quotes } = LaunchQuoteList.parse(await (await fetch(`${env().apiUrl}/v1/launches/quotes`)).json());
    expect(quotes.find((q) => q.mint === LOCAL_QUOTES.NVDAx.toBase58())).toMatchObject({ issuer: "xstocks" });
    expect(quotes.find((q) => q.mint === LOCAL_QUOTES.USDC.toBase58())).toMatchObject({ issuer: null });
  });

  it("searches by name, ticker or the start of the mint address, in any case", async () => {
    const own = await fundedWallet(5);
    const named = await launchCoin(own, "NDL");
    await launchCoin(own, "OTHER");
    // The helper names the coin "Board NDL": the search is on the name and the ticker, whatever the case.
    expect(mints(await mine(own, { q: "board ndl" }))).toEqual([named]);
    expect(mints(await mine(own, { q: "ndl" }))).toEqual([named]);
    expect(mints(await mine(own, { q: named.slice(0, 10) }))).toEqual([named]);
    // A mint address matches from its start, not its middle.
    expect(mints(await mine(own, { q: named.slice(2, 12) }))).toEqual([]);
    expect(mints(await mine(own, { q: "no such coin" }))).toEqual([]);
    // LIKE's own wildcards are plain characters in a search.
    expect(mints(await mine(own, { q: "%" }))).toEqual([]);
    expect(mints(await mine(own, { q: "_" }))).toEqual([]);
    // Whitespace around the search is ignored, and an empty search is no filter at all.
    expect(mints(await mine(own, { q: "  ndl " }))).toEqual([named]);
    expect((await mine(own, { q: "" })).launches.length).toBe(2);
    // A search combines with the other filters, and one too long is refused.
    expect(mints(await mine(own, { q: "ndl", category: "stablecoin" }))).toEqual([]);
    expect(mints(await mine(own, { q: "ndl", sort: "market_cap" }))).toEqual([named]);
    expect((await fetch(`${env().apiUrl}/v1/launches?q=${"x".repeat(65)}`)).status).toBe(400);
  });

  it("pages through results with limit and offset", async () => {
    const first = await only({ limit: 2 });
    expect(mints(first)).toEqual([coin.sold, coin.dollar]);
    expect(first.nextOffset).toBe(2);
    const second = await only({ limit: 2, offset: first.nextOffset! });
    expect(mints(second)).toEqual([coin.big, coin.small]);
    const last = await only({ limit: 2, offset: second.nextOffset! });
    expect(mints(last)).toEqual([coin.quiet]);
    expect(last.nextOffset).toBeNull();
  });

  it("refuses a query it doesn't understand instead of ignoring it", async () => {
    for (const q of ["sort=hot", "category=memes", "status=dead", "limit=0", "limit=101", "offset=-1", "quote=not-a-mint"]) {
      const res = await fetch(`${env().apiUrl}/v1/launches?${q}`);
      expect(res.status, q).toBe(400);
    }
  });

  it("lists the Quote Assets in use with how many Launches each has, most used first", async () => {
    const res = await fetch(`${env().apiUrl}/v1/launches/quotes`);
    const { quotes } = LaunchQuoteList.parse(await res.json());
    const counts = quotes.map((q) => q.launches);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
    const usdc = quotes.find((q) => q.mint === LOCAL_QUOTES.USDC.toBase58())!;
    expect(usdc).toMatchObject({ symbol: "USDC", decimals: 6, category: "stablecoin" });
    expect(usdc.launches).toBe((await board({ quote: usdc.mint, limit: 100 })).launches.length);
    // Quote Assets nobody has launched against are not offered.
    expect(quotes.map((q) => q.mint)).not.toContain(LOCAL_QUOTES.BULLWHALE.toBase58());
  });
});

describe("holders", () => {
  it("shows the curve holding the whole supply before anyone buys, and a Creator who never bought", async () => {
    const creator = await fundedWallet();
    const mint = await launchCoin(creator, "HOLD");
    const h = await holders(mint);
    expect(h.supply).toBe((await connection().getTokenSupply(new PublicKey(mint))).value.amount);
    expect(h.holders).toEqual([{ owner: launchlabPdas(new PublicKey(env().platform.launchlab)).authority.toBase58(), kind: "curve", amount: h.supply, share: 1 }]);
    expect(h.creator).toEqual({ address: creator.publicKey.toBase58(), amount: "0", share: 0, status: "none" });
  });

  it("match on-chain balances, including coins that moved without a trade, and tell when the Creator sold", async () => {
    const creator = await fundedWallet();
    const trader = await fundedWallet();
    const friend = Keypair.generate();
    const mint = await launchCoin(creator, "HLDR");
    await trade(creator, mint, "buy", SOL(0.05));
    await trade(trader, mint, "buy", SOL(0.3));
    // A plain transfer, not a trade: only the chain knows the friend holds these.
    const coin = new PublicKey(mint);
    const from = getAssociatedTokenAddressSync(coin, trader.publicKey);
    const to = getAssociatedTokenAddressSync(coin, friend.publicKey);
    const gift = (await tokenBalance(trader.publicKey, mint)) / 3n;
    await sendAndConfirmTransaction(
      connection(),
      new Transaction().add(
        createAssociatedTokenAccountIdempotentInstruction(trader.publicKey, to, friend.publicKey, coin),
        createTransferInstruction(from, to, trader.publicKey, gift),
      ),
      [trader],
      { commitment: "confirmed" },
    );

    const h = await holders(mint);
    const supply = BigInt(h.supply);
    const curve = launchlabPdas(new PublicKey(env().platform.launchlab)).authority;
    const expected = [
      { owner: curve, kind: "curve" },
      { owner: trader.publicKey, kind: "holder" },
      { owner: friend.publicKey, kind: "holder" },
      { owner: creator.publicKey, kind: "creator" },
    ];
    // The curve's coins sit in its vault, a program address rather than an associated token account.
    const vault = launchlabPdas(new PublicKey(env().platform.launchlab)).vault(new PublicKey((await detail(mint)).pool), coin);
    const balanceOf = async (e: (typeof expected)[number]) =>
      e.kind === "curve" ? BigInt((await connection().getTokenAccountBalance(vault, "confirmed")).value.amount) : tokenBalance(e.owner, mint);
    const onChain = await Promise.all(expected.map(async (e) => ({ ...e, amount: await balanceOf(e) })));
    onChain.sort((a, b) => (a.amount > b.amount ? -1 : a.amount < b.amount ? 1 : 0));
    expect(h.holders).toEqual(
      onChain.map((e) => ({ owner: e.owner.toBase58(), kind: e.kind, amount: e.amount.toString(), share: Number((e.amount * 1_000_000_000n) / supply) / 1_000_000_000 })),
    );
    expect(onChain.find((e) => e.owner.equals(friend.publicKey))!.amount).toBe(gift);
    const creatorHolds = await tokenBalance(creator.publicKey, mint);
    expect(creatorHolds).toBeGreaterThan(0n);
    expect(h.creator).toMatchObject({ amount: creatorHolds.toString(), status: "holding" });

    await trade(creator, mint, "sell", creatorHolds);
    const after = await holders(mint);
    expect(after.creator).toEqual({ address: creator.publicKey.toBase58(), amount: "0", share: 0, status: "sold" });
    expect(after.holders.map((x) => x.kind)).not.toContain("creator");
  });

  it("answers 404 for a coin that isn't a Launch", async () => {
    const res = await fetch(`${env().apiUrl}/v1/launches/${Keypair.generate().publicKey.toBase58()}/holders`);
    expect(res.status).toBe(404);
  });
});

describe("a graduated Launch on the board", () => {
  // One Creator's coins at each stage, so each query can be narrowed to them.
  let creator: Keypair;
  let trader: Keypair;
  let pool: PublicKey;
  const coin = { live: "", graduating: "", graduated: "" };
  const only = (q: Partial<Record<keyof LaunchListQuery, string | number>> = {}) => board({ creator: creator.publicKey.toBase58(), ...q });

  beforeAll(async () => {
    creator = await fundedWallet(10);
    trader = await fundedWallet(20);
    coin.graduated = await launchCoin(creator, "GRAD");
    coin.graduating = await launchCoin(creator, "GING");
    coin.live = await launchCoin(creator, "GLIV");
    await trade(trader, coin.graduated, "buy", SOL(2));
    pool = await graduate(coin.graduated, (await detail(coin.graduated)).pool);
    await trade(trader, coin.graduating, "buy", SOL(2));
    await trade(trader, coin.live, "buy", SOL(0.5));
  }, 180_000);

  it("follows the coin into its pool: pool trades move its price, market cap and volume", async () => {
    const before = await detail(coin.graduated);
    expect(before.curve.status).toBe("graduated");
    const buy = await trade(trader, coin.graduated, "buy", SOL(0.5));
    expect(buy.quote.venue).toBe("pool");
    const afterBuy = await detail(coin.graduated);
    // The pool's price after the trade, as the pool quoted it, and as the coin page shows it.
    const price = buy.quote.priceAfter;
    expect(afterBuy.market.price).toBe(price);
    expect(afterBuy.graduation!.price).toBe(price);
    expect(afterBuy.market.price).toBeGreaterThan(before.market.price!);
    expect(afterBuy.market.marketCap!.sol).toBeCloseTo(price * COIN_SUPPLY_WHOLE, 6);
    // A buy's volume is what the trader paid, fees included.
    expect(BigInt(afterBuy.market.volume24h.raw) - BigInt(before.market.volume24h.raw)).toBe(SOL(0.5));
    expect(Date.parse(afterBuy.market.lastTradeAt!)).toBeGreaterThanOrEqual(Date.parse(before.market.lastTradeAt!));

    const sell = await trade(trader, coin.graduated, "sell", (await tokenBalance(trader.publicKey, coin.graduated)) / 10n);
    const afterSell = await detail(coin.graduated);
    expect(afterSell.market.price).toBe(sell.quote.priceAfter);
    expect(afterSell.market.price).toBeLessThan(afterBuy.market.price!);
    expect(BigInt(afterSell.market.volume24h.raw)).toBeGreaterThan(BigInt(afterBuy.market.volume24h.raw));
  });

  it("sorts graduated Launches after live and graduating ones when looking for coins near Graduation", async () => {
    const list = await only({ sort: "graduation" });
    expect(mints(list)).toEqual([coin.live, coin.graduating, coin.graduated]);
    expect(list.launches.map((l) => l.curve.status)).toEqual(["live", "graduating", "graduated"]);
  });

  it("filters by each status, graduated included", async () => {
    expect(mints(await only({ status: "live" }))).toEqual([coin.live]);
    expect(mints(await only({ status: "graduating" }))).toEqual([coin.graduating]);
    expect(mints(await only({ status: "graduated" }))).toEqual([coin.graduated]);
    const graduated = await board({ status: "graduated", limit: 100 });
    expect(graduated.launches.every((l) => l.curve.status === "graduated" && l.graduation !== null)).toBe(true);
  });

  it("labels the Raydium pool among the holders once the curve's coins have moved into it", async () => {
    const h = await holders(coin.graduated);
    const coinVault = await poolCoinVault(pool, coin.graduated);
    const inPool = BigInt((await connection().getTokenAccountBalance(coinVault, "confirmed")).value.amount);
    expect(h.holders.find((x) => x.kind === "pool")).toEqual({
      owner: cpmmPdas(programsFor("localnet").cpmm).authority.toBase58(),
      kind: "pool",
      amount: inPool.toString(),
      share: Number((inPool * 1_000_000_000n) / BigInt(h.supply)) / 1_000_000_000,
    });
    // The curve's vault is empty after the migration, so the curve no longer holds any.
    expect(h.holders.map((x) => x.kind)).not.toContain("curve");
    const traderHolds = await tokenBalance(trader.publicKey, coin.graduated);
    expect(h.holders.find((x) => x.owner === trader.publicKey.toBase58())?.amount).toBe(traderHolds.toString());
  });
});
