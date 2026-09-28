import { describe, expect, it } from "vitest";
import { Keypair, LAMPORTS_PER_SOL, PACKET_DATA_SIZE, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import BN from "bn.js";
import { launchlabCoder, launchlabPdas, standardLaunchConstraints, updateCurveRuleIx, WSOL_MINT } from "@launchpad/chain";
import { LOCAL_QUOTES, localnetKeys, mintLocalQuote, send } from "@launchpad/localnet";
import { AirdropStatus, CreatorFees, FirstBuyQuote, HolderList, PreparedAirdrop, PreparedLaunch, TradeList } from "@launchpad/contract";
import {
  connection, deliverWebhook, env, fundedWallet, getLaunch, launch, listLaunches, prepare, refreshQuoteRegistry, signAndSend,
} from "./client";

const SOL = (n: number) => BigInt(Math.round(n * LAMPORTS_PER_SOL));
/** Whole coins in raw units: every coin has 6 decimals. */
const COINS = (n: number) => BigInt(n) * 1_000_000n;

const api = (path: string, init?: RequestInit) => fetch(`${env().apiUrl}${path}`, init);

async function launchQuote(firstBuy: bigint, quoteMint = WSOL_MINT.toBase58()) {
  const res = await api(`/v1/launch-quote?${new URLSearchParams({ quoteMint, firstBuy: firstBuy.toString() })}`);
  if (!res.ok) throw new Error(`launch quote failed: ${res.status} ${await res.text()}`);
  return FirstBuyQuote.parse(await res.json());
}

async function coinsOf(mint: string, owner: PublicKey) {
  const res = await connection().getTokenAccountBalance(getAssociatedTokenAddressSync(new PublicKey(mint), owner), "confirmed").catch(() => null);
  return BigInt(res?.value.amount ?? 0);
}

const solOf = async (owner: PublicKey) => BigInt(await connection().getBalance(owner, "confirmed"));

async function poolState(pool: string) {
  const account = await connection().getAccountInfo(new PublicKey(pool), "confirmed");
  return account && (launchlabCoder.accounts.decode("PoolState", account.data) as { real_base: BN; real_quote: BN });
}

const retry = (mint: string) => api(`/v1/launches/${mint}/prepare`, { method: "POST" });
const airdropStatus = async (mint: string) => AirdropStatus.parse(await (await api(`/v1/launches/${mint}/airdrop`)).json());
const prepareAirdrop = (mint: string) => api(`/v1/launches/${mint}/airdrop/prepare`, { method: "POST" });

/** Signs and sends each airdrop transaction, confirming all of them. */
async function sendAll(transactions: string[], lastValidBlockHeight: number, creator: Keypair) {
  return Promise.all(transactions.map((transaction) => signAndSend({ transaction, lastValidBlockHeight }, creator)));
}

async function blockHeightPast(height: number) {
  while ((await connection().getBlockHeight("confirmed")) <= height) await new Promise((r) => setTimeout(r, 1_000));
}

const wallets = (n: number) => Array.from({ length: n }, () => Keypair.generate().publicKey);

describe("a first buy", () => {
  it("lands in the launch transaction itself and gets exactly the coins quoted beforehand", async () => {
    const creator = await fundedWallet();
    const quote = await launchQuote(SOL(0.2));
    expect(quote.firstBuy).toMatchObject({ side: "buy", amountIn: SOL(0.2).toString(), slippageBps: 0, completesCurve: false });
    expect(quote.firstBuy.minAmountOut).toBe(quote.firstBuy.amountOut);

    const { prepared, signature } = await launch(creator, { firstBuy: SOL(0.2).toString() });
    expect(prepared.firstBuy).toEqual(quote.firstBuy);
    expect(prepared.airdrop).toBeNull();

    // The Creator holds exactly what was quoted, and it is everything the curve has sold: nobody bought before them.
    const bought = BigInt(quote.firstBuy.amountOut);
    expect(await coinsOf(prepared.mint, creator.publicKey)).toBe(bought);
    expect(BigInt((await poolState(prepared.pool))!.real_base.toString())).toBe(bought);
    // A First Buy is a curve trade, so it pays the Creator Fee too: into the Creator's own vault, theirs to claim back.
    const vault = launchlabPdas(new PublicKey(env().platform.launchlab)).creatorFeeVault(creator.publicKey, WSOL_MINT);
    const vaultBalance = await connection().getTokenAccountBalance(vault, "confirmed");
    expect(vaultBalance.value.amount).toBe(quote.firstBuy.fees.creator);

    // One transaction created the coin and made the buy.
    expect(await (await deliverWebhook([signature])).json()).toEqual({ launched: 1, traded: 1, claimed: 0, graduated: 0, airdropped: 0 });
    const { trades } = TradeList.parse(await (await api(`/v1/launches/${prepared.mint}/trades`)).json());
    expect(trades).toMatchObject([
      { signature, trader: creator.publicKey.toBase58(), side: "buy", baseAmount: quote.firstBuy.amountOut, fees: quote.firstBuy.fees },
    ]);
    expect((await getLaunch(prepared.mint)).launch?.curve.price).toBe(quote.firstBuy.priceAfter);
    // The board's market figures count it like any trade: the price it left, and its SOL as the day's volume.
    const { market } = (await getLaunch(prepared.mint)).launch!;
    expect(market.price).toBe(quote.firstBuy.priceAfter);
    expect(market.marketCap?.quote).toBeCloseTo(quote.firstBuy.priceAfter * 1_000_000_000, 6);
    expect(market.volume24h.raw).toBe(quote.firstBuy.amountIn);
    // The Creator's Creator Fee page counts it like any other trade's fee.
    const fees = CreatorFees.parse(await (await api(`/v1/creators/${creator.publicKey.toBase58()}/fees`)).json());
    expect(fees.assets).toMatchObject([{ quote: { mint: WSOL_MINT.toBase58() }, claimable: quote.firstBuy.fees.creator, earned: quote.firstBuy.fees.creator }]);
    expect(fees.launches).toMatchObject([{ mint: prepared.mint, earned: quote.firstBuy.fees.creator }]);
  });

  it("can't be separated from its launch: if the buy fails, no coin is created", async () => {
    const creator = await fundedWallet(1);
    const res = await prepare({ creator: creator.publicKey.toBase58(), firstBuy: SOL(0.99).toString() });
    const prepared = PreparedLaunch.parse(await res.json());
    const tx = VersionedTransaction.deserialize(Buffer.from(prepared.transaction, "base64"));
    tx.sign([creator]);
    const conn = connection();
    // Past the wallet's own preflight check, so the chain itself runs it.
    const signature = await conn.sendTransaction(tx, { skipPreflight: true });
    const result = await conn.confirmTransaction(
      { signature, blockhash: tx.message.recentBlockhash, lastValidBlockHeight: prepared.lastValidBlockHeight }, "confirmed",
    );
    expect(result.value.err).not.toBeNull();
    expect(await poolState(prepared.pool)).toBeNull();
    expect(await conn.getAccountInfo(new PublicKey(prepared.mint))).toBeNull();
  });

  it("works in a Quote Asset other than SOL, in its own raw units, paid from the Creator's account of it", async () => {
    const usdc = LOCAL_QUOTES.USDC;
    const creator = await fundedWallet();
    const USDC = (n: number) => BigInt(n) * 1_000_000n;
    // Too little USDC is refused before anything is built, in words the Creator can act on.
    await mintLocalQuote(connection(), usdc, creator.publicKey, USDC(10));
    const short = await prepare({ creator: creator.publicKey.toBase58(), quoteMint: usdc.toBase58(), firstBuy: USDC(20).toString() });
    expect(short.status).toBe(400);
    expect(await short.json()).toMatchObject({ error: "Your wallet doesn't hold enough USDC for this first buy. Add USDC or buy less." });

    await mintLocalQuote(connection(), usdc, creator.publicKey, USDC(40));
    const quote = await launchQuote(USDC(20), usdc.toBase58());
    expect(quote.firstBuy).toMatchObject({ amountIn: USDC(20).toString(), completesCurve: false });
    // 1.25% of the 20 USDC goes to fees, all in USDC.
    expect(Object.values(quote.firstBuy.fees).reduce((s, f) => s + BigInt(f), 0n)).toBe(250_000n);
    const { prepared, signature } = await launch(creator, { quoteMint: usdc.toBase58(), firstBuy: USDC(20).toString() });
    expect(prepared.firstBuy).toEqual(quote.firstBuy);
    expect(Buffer.from(prepared.transaction, "base64").length).toBeLessThanOrEqual(PACKET_DATA_SIZE);

    expect(await coinsOf(prepared.mint, creator.publicKey)).toBe(BigInt(quote.firstBuy.amountOut));
    const usdcLeft = await connection().getTokenAccountBalance(getAssociatedTokenAddressSync(usdc, creator.publicKey), "confirmed");
    expect(BigInt(usdcLeft.value.amount)).toBe(USDC(30));
    expect(await (await deliverWebhook([signature])).json()).toEqual({ launched: 1, traded: 1, claimed: 0, graduated: 0, airdropped: 0 });
    expect((await getLaunch(prepared.mint)).launch).toMatchObject({ quote: { mint: usdc.toBase58(), symbol: "USDC", decimals: 6 } });
  });

  it("is refused when it would take every coin on the curve, or get none", async () => {
    const creator = Keypair.generate().publicKey.toBase58();
    // The test platform graduates at 1 SOL.
    for (const firstBuy of [SOL(5), 1n]) {
      const res = await prepare({ creator, firstBuy: firstBuy.toString() });
      expect(res.status, `first buy of ${firstBuy}`).toBe(400);
      expect((await api(`/v1/launch-quote?quoteMint=${WSOL_MINT.toBase58()}&firstBuy=${firstBuy}`)).status).toBe(400);
    }
    for (const firstBuy of ["0", "-1", "0.5", "abc"]) expect((await prepare({ creator, firstBuy })).status, firstBuy).toBe(400);
  });
});

describe("retrying a launch", () => {
  it("prepares the same coin again, so only one of the two transactions can ever land", async () => {
    const creator = await fundedWallet();
    const first = PreparedLaunch.parse(await (await prepare({ creator: creator.publicKey.toBase58(), firstBuy: SOL(0.1).toString() })).json());
    const again = await retry(first.mint);
    expect(again.status).toBe(200);
    const second = PreparedLaunch.parse(await again.json());
    expect(second).toMatchObject({ mint: first.mint, pool: first.pool, metadataUri: first.metadataUri, firstBuy: first.firstBuy });

    await signAndSend(second, creator);
    // The first transaction is still valid, but its coin now exists.
    await expect(signAndSend(first, creator)).rejects.toThrow();
    expect(await coinsOf(first.mint, creator.publicKey)).toBe(BigInt(first.firstBuy!.amountOut));
  });

  it("answers that the coin already launched, and indexes it, when an earlier attempt landed unseen", async () => {
    const creator = await fundedWallet();
    const { prepared, signature } = await launch(creator);
    expect((await getLaunch(prepared.mint)).status).toBe(404);

    const res = await retry(prepared.mint);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "This coin has already launched.", details: { mint: prepared.mint } });
    expect((await getLaunch(prepared.mint)).launch?.createdSignature).toBe(signature);
    expect((await listLaunches()).filter((l) => l.mint === prepared.mint)).toHaveLength(1);
  });

  it("keeps the Graduation Target it was prepared at, and refuses once the price has moved our curve rule past it", async () => {
    const usdc = LOCAL_QUOTES.USDC;
    const creator = await fundedWallet();
    const first = PreparedLaunch.parse(await (await prepare({ creator: creator.publicKey.toBase58(), quoteMint: usdc.toBase58() })).json());
    const again = PreparedLaunch.parse(await (await retry(first.mint)).json());
    expect(again.graduationTarget).toEqual(first.graduationTarget);

    // USDC's price moves far enough that our curve rule no longer accepts the old target.
    const { operations } = localnetKeys();
    const platformConfig = new PublicKey(env().platform.platformConfig);
    const program = new PublicKey(env().platform.launchlab);
    const target = new BN(first.graduationTarget.raw);
    await send(connection(), [
      updateCurveRuleIx(program, operations.publicKey, platformConfig, launchlabPdas(program).globalConfig(usdc), 0, standardLaunchConstraints({
        min: target.muln(2), max: target.muln(3),
      })),
    ], [operations]);
    try {
      const moved = await retry(first.mint);
      expect(moved.status).toBe(409);
      expect(((await moved.json()) as { error: string }).error).toMatch(/price moved.*Start a new launch\.$/);
    } finally {
      // The refresh puts the rule back where the price is.
      await refreshQuoteRegistry();
    }
    expect((await retry(first.mint)).status).toBe(200);
  });

  it("needs a launch that was prepared", async () => {
    expect((await retry(Keypair.generate().publicKey.toBase58())).status).toBe(404);
  });
});

describe("an airdrop", () => {
  it("pays every listed wallet exactly its amount, over as many transactions as it takes", async () => {
    const creator = await fundedWallet();
    const list = wallets(25).map((w, i) => ({ wallet: w.toBase58(), amount: COINS(1_000 + i).toString() }));
    const total = list.reduce((s, r) => s + BigInt(r.amount), 0n);
    const { prepared, signature } = await launch(creator, { firstBuy: SOL(0.3).toString(), airdrop: list });
    expect(prepared.airdrop).toMatchObject({ recipients: 25, amount: total.toString() });
    expect(prepared.airdrop!.transactions).toBeGreaterThan(1);
    await deliverWebhook([signature]);
    expect((await airdropStatus(prepared.mint)).recipients.map((r) => r.status)).toEqual(list.map(() => "unpaid"));

    const res = await prepareAirdrop(prepared.mint);
    expect(res.status).toBe(200);
    const airdrop = PreparedAirdrop.parse(await res.json());
    expect(airdrop.recipients).toBe(25);
    expect(airdrop.transactions).toHaveLength(prepared.airdrop!.transactions);
    for (const tx of airdrop.transactions) expect(Buffer.from(tx, "base64").length).toBeLessThanOrEqual(PACKET_DATA_SIZE);

    const sol = await solOf(creator.publicKey);
    const signatures = await sendAll(airdrop.transactions, airdrop.lastValidBlockHeight, creator);
    // The review showed what the airdrop costs the Creator: new coin accounts' rent plus network fees.
    expect(sol - (await solOf(creator.publicKey))).toBe(BigInt(prepared.airdrop!.costLamports));

    // Payments are indexed from the webhook and from the web app's fast path alike.
    const [viaWebhook, ...viaClient] = signatures;
    let indexed = ((await (await deliverWebhook([viaWebhook!])).json()) as { airdropped: number }).airdropped;
    for (const s of viaClient) indexed += ((await (await api(`/v1/transactions/${s}`, { method: "POST" })).json()) as { airdropped: number }).airdropped;
    expect(indexed).toBe(25);

    for (const r of list) expect(await coinsOf(prepared.mint, new PublicKey(r.wallet))).toBe(BigInt(r.amount));
    expect(await coinsOf(prepared.mint, creator.publicKey)).toBe(BigInt(prepared.firstBuy!.amountOut) - total);
    // Top holders come from the chain: the largest airdrop wallets are there, and the Creator keeps the rest.
    const holders = HolderList.parse(await (await api(`/v1/launches/${prepared.mint}/holders`)).json());
    const largest = list.at(-1)!;
    expect(holders.holders).toContainEqual(expect.objectContaining({ owner: largest.wallet, kind: "holder", amount: largest.amount }));
    expect(holders.creator).toMatchObject({ status: "holding", amount: (BigInt(prepared.firstBuy!.amountOut) - total).toString() });
    const status = await airdropStatus(prepared.mint);
    expect(status).toMatchObject({ mint: prepared.mint, creator: creator.publicKey.toBase58(), amount: total.toString(), paid: total.toString() });
    expect(status.recipients.every((r) => r.status === "paid" && signatures.includes(r.signature!))).toBe(true);

    const done = await prepareAirdrop(prepared.mint);
    expect(done.status).toBe(409);
    expect(await done.json()).toMatchObject({ error: "Every wallet in this airdrop has been paid." });
  });

  it("never pays a wallet twice, however often the Creator asks again", async () => {
    const creator = await fundedWallet();
    const list = wallets(14).map((w) => ({ wallet: w.toBase58(), amount: COINS(5_000).toString() }));
    const { prepared } = await launch(creator, { firstBuy: SOL(0.2).toString(), airdrop: list });

    const first = PreparedAirdrop.parse(await (await prepareAirdrop(prepared.mint)).json());
    expect(first.transactions.length).toBeGreaterThan(1);
    // While those transactions can still land, no wallet gets a second one.
    const early = await prepareAirdrop(prepared.mint);
    expect(early.status).toBe(409);
    expect(await early.json()).toMatchObject({ details: { retryAfterSeconds: expect.any(Number) } });
    expect((await airdropStatus(prepared.mint)).recipients.every((r) => r.status === "sending")).toBe(true);

    // One lands without anyone reporting it (the tab closed); the rest are never sent and expire.
    const [landed] = await sendAll(first.transactions.slice(0, 1), first.lastValidBlockHeight, creator);
    await blockHeightPast(first.lastValidBlockHeight);
    await expect(sendAll(first.transactions.slice(1), first.lastValidBlockHeight, creator)).rejects.toThrow();

    // Asking again finds the unreported payment on-chain and pays only the others.
    const second = PreparedAirdrop.parse(await (await prepareAirdrop(prepared.mint)).json());
    const paidByFirst = (await airdropStatus(prepared.mint)).recipients.filter((r) => r.signature === landed);
    expect(paidByFirst.length).toBeGreaterThan(0);
    expect(second.recipients).toBe(list.length - paidByFirst.length);
    await sendAll(second.transactions, second.lastValidBlockHeight, creator);

    for (const r of list) expect(await coinsOf(prepared.mint, new PublicKey(r.wallet))).toBe(BigInt(r.amount));
    expect((await airdropStatus(prepared.mint)).recipients.filter((r) => r.status === "paid")).toHaveLength(list.length);
  }, 240_000);

  it("waits for its coin to launch", async () => {
    const creator = await fundedWallet();
    const res = await prepare({
      creator: creator.publicKey.toBase58(), firstBuy: SOL(0.1).toString(), airdrop: [{ wallet: wallets(1)[0]!.toBase58(), amount: "1" }],
    });
    const prepared = PreparedLaunch.parse(await res.json());
    const early = await prepareAirdrop(prepared.mint);
    expect(early.status).toBe(409);
    expect(await early.json()).toMatchObject({ error: "The coin hasn't launched yet. Launch it first, then send the airdrop." });
    expect((await api(`/v1/launches/${Keypair.generate().publicKey.toBase58()}/airdrop`)).status).toBe(404);
  });

  it("refuses lists it could not pay", async () => {
    const creator = Keypair.generate().publicKey.toBase58();
    const one = (amount = "1000000") => ({ wallet: wallets(1)[0]!.toBase58(), amount });
    const firstBuy = SOL(0.1).toString();
    const programAccount = launchlabPdas(new PublicKey(env().platform.launchlab)).platformFeeVault(new PublicKey(env().platform.platformConfig), WSOL_MINT);
    const same = one();
    const cases: [string, Parameters<typeof prepare>[0]][] = [
      ["no first buy to pay it from", { creator, airdrop: [one()] }],
      ["more coins than the first buy gets", { creator, firstBuy, airdrop: [one(COINS(900_000_000).toString())] }],
      ["the same wallet twice", { creator, firstBuy, airdrop: [same, same] }],
      ["the Creator's own wallet", { creator, firstBuy, airdrop: [{ wallet: creator, amount: "1" }] }],
      ["a program account", { creator, firstBuy, airdrop: [{ wallet: programAccount.toBase58(), amount: "1" }] }],
      ["no wallets", { creator, firstBuy, airdrop: [] }],
      ["too many wallets", { creator, firstBuy, airdrop: Array.from({ length: 201 }, () => one("1")) }],
      ["a zero amount", { creator, firstBuy, airdrop: [one("0")] }],
      ["text that is not JSON", { creator, firstBuy, airdrop: "wallet,1" }],
    ];
    for (const [label, form] of cases) expect((await prepare(form)).status, label).toBe(400);
  });
});
