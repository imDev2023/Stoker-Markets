// The Creator Lock (ADR 0023, #186): coins a launch keeps back from its curve's sale for the Creator, held by LaunchLab
// and claimed by the Creator's own wallet once the coin has graduated. The first describes work the chain with
// `@launchpad/chain`'s builders, on the rule groups the Quote Registry writes (a range for the sale and a ceiling for the
// lock where a Quote Asset allows one); the rest go through the API: the prepare field, the Indexer's listing, the
// coin's lock and its claim, and what LaunchLab's vault must stay out of after Graduation.
import { beforeAll, describe, expect, it } from "vitest";
import { ComputeBudgetProgram, Keypair, PublicKey, type TransactionInstruction } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, getAccount, getAssociatedTokenAddressSync, getTransferFeeAmount } from "@solana/spl-token";
import BN from "bn.js";
import {
  cpmmPdas, createVestingAccountIx, curvePrice, CREATOR_LOCK, creatorLockCapBps, creatorLockProblem, decodeTransaction, graduationBandOf,
  initialCurveReserves, initializeV2Ix, initializeWithToken2022Ix, launchlabCoder, launchlabPdas, LAUNCH_SHAPE, listGlobalConfigs, loadLookupTable, maxLockBpsOf,
  pinsLaunchShape, prepareCreatorLockClaim, prepareLaunch, programsFor, quoteFirstBuy, readCreatorLock, readCurveRuleGroups, REWARD_TAX_MAXIMUM_FEE,
  rewardLaunchConstraints, rewardTaxFee, RuleField, RuleOp, saleWithLock, sameConstraints, standardLaunchConstraints, supplyShare, tradeInstructions,
  unlockedAmount, unlockEndsAt, withheldFee, WSOL_MINT, type CreatorLock, type InitializeParams, type LaunchCreated, type TradeExecuted,
} from "@launchpad/chain";
import {
  CreatorLockStatus, FirstBuyQuote, HolderList, LaunchTrust, PreparedCreatorLockClaim, PreparedLaunch, RewardRoundDetail, WalletHolding,
} from "@launchpad/contract";
import { migrateCurve, send } from "@launchpad/localnet";
import {
  SOL, connection, deliverWebhook, env, fundedWallet, getLaunch, listQuotes, prepare, rawTransaction, refreshQuoteRegistry, signAndSend, tokenBalance, trade,
} from "./client";

const programs = programsFor("localnet");
const program = () => new PublicKey(env().platform.launchlab);
const platformConfig = () => new PublicKey(env().platform.platformConfig);
const pdas = () => launchlabPdas(program());
const solConfig = () => pdas().globalConfig(WSOL_MINT);
const target = () => new BN(env().platform.graduationTargetLamports);
const DAY = 86_400;

// LaunchLab's errors, as a failed send names them.
const NOT_ON_A_RULE = /0x1789|CurveParamNotMatchPlatformRule/;
const NOTHING_LEFT_TO_GIVE = /0x177a|VestingRatioTooHigh/;
const NOT_GRADUATED = /0x177f|PoolNotMigrated/;
const CLIFF_RUNNING = /0x177c|VestingNotStarted/;
const NOTHING_UNLOCKED = /0x1779|NoAssetsToCollect/;

const chainTime = async () => (await connection().getBlockTime(await connection().getSlot("confirmed")))!;
async function chainTimeReaches(time: number) {
  while ((await chainTime()) < time) await new Promise((r) => setTimeout(r, 250));
}
const blockTimeOf = async (signature: string) => (await rawTransaction(signature)).blockTime!;

type Direct = { lock: CreatorLock | null; rewardTaxBps?: number; totalBaseSell?: BN };

/**
 * A launch sent straight to the chain with our builders, the lock's coins given to the Creator in the same transaction,
 * as `prepareLaunch` does it. `totalBaseSell` other than what the lock leaves makes a sale and a lock that do not add up.
 */
async function launchDirectly(d: Direct) {
  const creator = await fundedWallet(10);
  const mint = Keypair.generate();
  const pool = pdas().pool(mint.publicKey, WSOL_MINT);
  const params: InitializeParams = {
    program: program(), payer: creator.publicKey, creator: creator.publicKey, globalConfig: solConfig(), platformConfig: platformConfig(),
    baseMint: mint.publicKey, quoteMint: WSOL_MINT, quoteTokenProgram: TOKEN_PROGRAM_ID,
    name: "Locked", symbol: "LOCK", uri: "https://example.invalid/l.json", graduationTargetRaw: target(), lock: d.lock,
  };
  const name = d.rewardTaxBps ? "initialize_with_token_2022" : "initialize_v2";
  const init = d.rewardTaxBps ? initializeWithToken2022Ix({ ...params, rewardTaxBps: d.rewardTaxBps, maximumFee: REWARD_TAX_MAXIMUM_FEE }) : initializeV2Ix(params);
  if (d.totalBaseSell) {
    const args = launchlabCoder.instruction.decode(init.data)!.data as { curve_param: { Constant: { data: { total_base_sell: BN } } } };
    args.curve_param.Constant.data.total_base_sell = d.totalBaseSell;
    init.data = launchlabCoder.instruction.encode(name, args);
  }
  const ixs: TransactionInstruction[] = [ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }), init];
  if (d.lock) ixs.push(createVestingAccountIx({ program: program(), creator: creator.publicKey, beneficiary: creator.publicKey, pool, shareAmount: d.lock.lockedAmount }));
  const signature = await send(connection(), ixs, [creator, mint]);
  return { creator, mint: mint.publicKey, pool, signature, tokenProgram: d.rewardTaxBps ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID };
}

type Coin = Awaited<ReturnType<typeof launchDirectly>>;

/** A trader buys every coin the curve sells; returns the buy's signature. */
async function sellOut(coin: Coin) {
  const trader = await fundedWallet(10);
  const ixs = await tradeInstructions(connection(), {
    program: program(),
    curve: {
      pool: coin.pool, globalConfig: solConfig(), platformConfig: platformConfig(), creator: coin.creator.publicKey, baseMint: coin.mint,
      quoteMint: WSOL_MINT, baseTokenProgram: coin.tokenProgram, quoteTokenProgram: TOKEN_PROGRAM_ID,
    },
    trader: trader.publicKey, side: "buy", amountIn: target().muln(2), minAmountOut: new BN(0),
  });
  return send(connection(), [ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }), ...ixs], [trader]);
}

const lockOf = async (coin: Coin, wallet = coin.creator.publicKey) => (await readCreatorLock(connection(), program(), coin.pool, wallet))!;
const claim = async (coin: Coin, wallet = coin.creator) =>
  signAndSend(await prepareCreatorLockClaim(connection(), { program: program(), pool: coin.pool, wallet: wallet.publicKey }), wallet);
const heldBy = (coin: Coin, owner: PublicKey) => getAccount(connection(), getAssociatedTokenAddressSync(coin.mint, owner, true, coin.tokenProgram), "confirmed", coin.tokenProgram);
const decoded = async (signature: string) => decodeTransaction(await rawTransaction(signature), { launchlab: program(), cpmm: programs.cpmm });
const launchIn = async (signature: string) => (await decoded(signature)).find((e): e is LaunchCreated => e.kind === "launch_created")!;

let band: { min: BN; max: BN };
let capBps: number;

const solRules = async () => (await readCurveRuleGroups(connection(), program(), platformConfig(), [solConfig()])).get(solConfig().toBase58())!;

beforeAll(async () => {
  await refreshQuoteRegistry();
  band = graduationBandOf((await solRules()).get(0)!)!;
  capBps = creatorLockCapBps((await listGlobalConfigs(connection(), program())).find((c) => c.quoteMint.equals(WSOL_MINT))!);
});

describe("the curve rule of a Quote Asset that admits a Creator Lock", () => {
  it("is written by the Quote Registry in both of the asset's groups, up to the cap its GlobalConfig leaves room for, which the quotes list says", async () => {
    const rules = await solRules();
    expect(sameConstraints(rules.get(0)!, standardLaunchConstraints(band, { maxLockBps: capBps }))).toBe(true);
    expect(sameConstraints(rules.get(1)!, rewardLaunchConstraints(band, { maxLockBps: capBps }))).toBe(true);
    expect(maxLockBpsOf(rules.get(0)!)).toBe(2_000);
    expect((await listQuotes()).find((q) => q.mint === WSOL_MINT.toBase58())?.creatorLockCapBps).toBe(2_000);
    // A second refresh finds the groups as they should be and writes nothing.
    await refreshQuoteRegistry();
    expect(sameConstraints((await solRules()).get(0)!, rules.get(0)!)).toBe(true);
  });

  it("is the rule of before ADR 0023, constraint for constraint, where no lock is allowed", () => {
    const exact = standardLaunchConstraints(band, { maxLockBps: 0 });
    expect(sameConstraints(exact, standardLaunchConstraints(band))).toBe(true);
    expect(maxLockBpsOf(exact)).toBe(0);
    expect(exact.find((c) => c.field === RuleField.TotalSellA)).toMatchObject({ op: RuleOp.Eq });
  });

  it("gives the lock and the sale a range each and keeps everything else pinned, in a group no larger than today's by more than one constraint", () => {
    const exact = standardLaunchConstraints(band);
    const ranged = standardLaunchConstraints(band, { maxLockBps: 2_000 });
    expect(ranged.length).toBe(exact.length + 1);
    expect(pinsLaunchShape(ranged)).toBe(true);
    const admitted = graduationBandOf(ranged)!;
    expect([admitted.min.toString(), admitted.max.toString()]).toEqual([band.min.toString(), band.max.toString()]);
    expect(maxLockBpsOf(ranged)).toBe(2_000);
    const of = (field: number) => ranged.filter((c) => c.field === field).map((c) => [c.op, c.value.toString()]);
    expect(of(RuleField.TotalSellA)).toEqual([[RuleOp.Gte, "593100000000000000"], [RuleOp.Lte, "793100000000000000"]]);
    expect(of(RuleField.TotalLockedAmount)).toEqual([[RuleOp.Lte, "200000000000000000"]]);
    expect(of(RuleField.CliffPeriod)).toEqual([[RuleOp.Lte, String(1_461 * DAY)]]);
    expect(of(RuleField.UnlockPeriod)).toEqual([[RuleOp.Lte, String(1_461 * DAY)]]);
    expect(of(RuleField.Supply)).toEqual([[RuleOp.Eq, LAUNCH_SHAPE.supply.toString()]]);
  });

  it("caps the lock by what Raydium's GlobalConfig leaves room for, as mainnet's four kinds of config have it", () => {
    const cap = (maxLockRate: number, minBaseSellRate: number) => creatorLockCapBps({ maxLockRate: new BN(maxLockRate), minBaseSellRate: new BN(minBaseSellRate) });
    expect(CREATOR_LOCK.maxBps).toBe(2_000);
    // SOL's and USD1's: a lock of 80% at most and 20% sold at least. Nearly every other config: no real limit.
    expect(cap(800_000, 200_000)).toBe(2_000);
    expect(cap(999_999, 1)).toBe(2_000);
    // One community token's config allows no lock at all, so its rule stays the exact one.
    expect(cap(0, 750_000)).toBe(0);
    // Raydium's limits win where they are tighter than ours: a lock of 5% at most, or a sale of 70% at least.
    expect(cap(50_000, 1)).toBe(500);
    expect(cap(999_999, 700_000)).toBe(931);
    // The local chain's SOL config is devnet's loose one, so the stack's cap is ours.
    expect(capBps).toBe(2_000);
  });

  it("says what is wrong with a lock we do not launch", () => {
    const lock = (bps: number, cliffSeconds: number, unlockSeconds: number): CreatorLock => ({ lockedAmount: supplyShare(bps), cliffSeconds, unlockSeconds });
    expect(creatorLockProblem(lock(2_000, 7 * DAY, 0))).toBeNull();
    expect(creatorLockProblem(lock(1, 0, 7 * DAY))).toBeNull();
    expect(creatorLockProblem(lock(500, 3 * DAY, 4 * DAY))).toBeNull();
    expect(creatorLockProblem(lock(2_001, 30 * DAY, 0))).toBe("A Creator can lock 20% of the supply at most.");
    expect(creatorLockProblem(lock(1_000, 30 * DAY, 0), 500)).toBe("A Creator can lock 5% of the supply at most.");
    expect(creatorLockProblem(lock(1_000, 3 * DAY, 4 * DAY - 1))).toBe("A lock lasts at least 7 days after the curve sells out.");
    expect(creatorLockProblem(lock(1_000, 1_462 * DAY, 0))).toBe("A lock's cliff and its unlock time are four years each at most.");
    expect(creatorLockProblem(lock(0, 30 * DAY, 0))).toBe("A lock needs some coins in it.");
  });
});

describe("a launch with a Creator Lock", () => {
  it("fits one transaction with the longest name and a First Buy, gives the Creator the whole lock, and prices the First Buy on the smaller sale", async () => {
    const creator = await fundedWallet(10);
    const lock: CreatorLock = { lockedAmount: supplyShare(1_000), cliffSeconds: 30 * DAY, unlockSeconds: 180 * DAY };
    const pairing = { globalConfig: solConfig(), quoteMint: WSOL_MINT, quoteTokenProgram: TOKEN_PROGRAM_ID, graduationTargetRaw: target() };
    const first = await quoteFirstBuy(connection(), { ...pairing, platformConfig: platformConfig(), lock }, new BN(100_000_000));
    const without = await quoteFirstBuy(connection(), { ...pairing, platformConfig: platformConfig() }, new BN(100_000_000));
    // The same raise sells 69.31% of the supply instead of 79.31%, so the same SOL buys fewer coins.
    expect(first.quote.amountOut.lt(without.quote.amountOut)).toBe(true);

    const prepared = await prepareLaunch(connection(), {
      ...pairing, program: program(), platformConfig: platformConfig(), creator: creator.publicKey,
      // The longest name and ticker the form takes, and a metadata address as long as Arweave's.
      name: "N".repeat(32), symbol: "S".repeat(10), uri: `https://arweave.net/${"a".repeat(43)}`,
      firstBuy: first.quote, lookupTable: (await loadLookupTable(connection(), new PublicKey(env().platform.lookupTable)))!, lock,
    });
    expect(Buffer.from(prepared.transaction, "base64").length).toBeLessThanOrEqual(1_232);
    const signature = await signAndSend(prepared, creator);
    const coin: Coin = { creator, mint: prepared.mint, pool: prepared.pool, signature, tokenProgram: TOKEN_PROGRAM_ID };

    // The First Buy was exact, so the Creator holds what it was quoted and nothing of the lock.
    expect((await heldBy(coin, creator.publicKey)).amount).toBe(BigInt(first.quote.amountOut.toString()));
    const state = await lockOf(coin);
    expect(state).toMatchObject({ status: "live", cliffSeconds: 30 * DAY, unlockSeconds: 180 * DAY, unlockStartsAt: null });
    expect(state.lockedAmount.toString()).toBe("100000000000000000");
    expect(state.allocatedAmount.eq(state.lockedAmount)).toBe(true);
    expect(state.share && [state.share.amount.toString(), state.share.claimed.toString()]).toEqual(["100000000000000000", "0"]);
    expect(unlockEndsAt(state)).toBeNull();
    // Every coin is in the curve's vault until the curve sells them: the sale, the pool's share and the lock.
    expect(await tokenBalance(pdas().vault(coin.pool, coin.mint))).toBe(BigInt(LAUNCH_SHAPE.supply.toString()) - BigInt(first.quote.programAmountOut.toString()));

    // The decoder reads the lock off the launch and takes it as ours; the curve started where our own arithmetic says.
    const events = await decoded(signature);
    const launched = events.find((e): e is LaunchCreated => e.kind === "launch_created")!;
    expect(launched.standardShape).toBe(true);
    expect(launched.totalBaseSell.toString()).toBe("693100000000000000");
    expect(launched.lock && { ...launched.lock, lockedAmount: launched.lock.lockedAmount.toString() }).toEqual({ lockedAmount: "100000000000000000", cliffSeconds: 30 * DAY, unlockSeconds: 180 * DAY });
    const firstBuy = events.find((e): e is TradeExecuted => e.kind === "trade")!;
    const start = initialCurveReserves({ supply: LAUNCH_SHAPE.supply, totalBaseSell: saleWithLock(lock.lockedAmount), fundRaising: target(), lockedAmount: lock.lockedAmount });
    expect([firstBuy.before.virtualBase.toString(), firstBuy.before.virtualQuote.toString()]).toEqual([start.virtualBase.toString(), start.virtualQuote.toString()]);
    expect(firstBuy.amountOut.toString()).toBe(first.quote.programAmountOut.toString());

    // Nothing is left to give to anyone else, and nothing can be claimed while the curve sells.
    const other = Keypair.generate().publicKey;
    await expect(send(connection(), [createVestingAccountIx({ program: program(), creator: creator.publicKey, beneficiary: other, pool: coin.pool, shareAmount: new BN(1) })], [creator]))
      .rejects.toThrow(NOTHING_LEFT_TO_GIVE);
    await expect(claim(coin)).rejects.toThrow(NOT_GRADUATED);
    // A wallet that was given nothing has no share to read.
    expect((await lockOf(coin, other)).share).toBeNull();
  });

  it("refuses a lock we do not launch before building anything", async () => {
    const creator = await fundedWallet();
    const request = (lock: CreatorLock) => prepareLaunch(connection(), {
      globalConfig: solConfig(), quoteMint: WSOL_MINT, quoteTokenProgram: TOKEN_PROGRAM_ID, graduationTargetRaw: target(), program: program(),
      platformConfig: platformConfig(), creator: creator.publicKey, name: "Too Much", symbol: "MUCH", uri: "https://example.invalid/m.json",
      lookupTable: null as never, lock,
    });
    await expect(request({ lockedAmount: supplyShare(2_100), cliffSeconds: 30 * DAY, unlockSeconds: 0 })).rejects.toThrow("A Creator can lock 20% of the supply at most.");
    await expect(request({ lockedAmount: supplyShare(500), cliffSeconds: DAY, unlockSeconds: DAY })).rejects.toThrow("A lock lasts at least 7 days after the curve sells out.");
  });

  it("is listed with its lock when it is ours, whoever built it: the Indexer takes any size up to the cap from the chain", async () => {
    const coin = await launchDirectly({ lock: { lockedAmount: supplyShare(1_234), cliffSeconds: 7 * DAY, unlockSeconds: 0 } });
    expect((await launchIn(coin.signature)).standardShape).toBe(true);
    expect(await (await deliverWebhook([coin.signature])).json()).toMatchObject({ launched: 1 });
    const { launch } = await getLaunch(coin.mint.toBase58());
    expect(launch?.creatorLock).toEqual({ bps: 1_234, amount: supplyShare(1_234).toString(), cliffSeconds: 7 * DAY, unlockSeconds: 0 });
    // The curve's price starts on the smaller sale, as the chain's does.
    const start = initialCurveReserves({ supply: LAUNCH_SHAPE.supply, totalBaseSell: saleWithLock(supplyShare(1_234)), fundRaising: target(), lockedAmount: supplyShare(1_234) });
    expect(launch!.market.price).toBe(curvePrice(start, LAUNCH_SHAPE.decimals, 9));
  });
});

describe("what the chain and the Indexer each hold a lock to", () => {
  it("the rule refuses a lock above the cap and a cliff past four years", async () => {
    await expect(launchDirectly({ lock: { lockedAmount: supplyShare(2_100), cliffSeconds: 30 * DAY, unlockSeconds: 0 } })).rejects.toThrow(NOT_ON_A_RULE);
    await expect(launchDirectly({ lock: { lockedAmount: supplyShare(1_000), cliffSeconds: 1_462 * DAY, unlockSeconds: 0 } })).rejects.toThrow(NOT_ON_A_RULE);
  });

  it("the rule cannot refuse a sale and a lock that do not add up, nor a lock shorter than seven days, so the decoder does", async () => {
    // A tenth less sold and nothing locked: the pool would get 30.69% of the supply instead of 20.69%.
    const short = await launchDirectly({ lock: null, totalBaseSell: saleWithLock(supplyShare(1_000)) });
    const offSum = await launchIn(short.signature);
    expect(offSum.lock).toBeNull();
    expect(offSum.standardShape).toBe(false);
    // A lock that is all claimable an hour after the curve sells out.
    const brief = await launchIn((await launchDirectly({ lock: { lockedAmount: supplyShare(1_000), cliffSeconds: 3_600, unlockSeconds: 0 } })).signature);
    expect(brief.lock?.cliffSeconds).toBe(3_600);
    expect(brief.standardShape).toBe(false);
    // Neither reaches the board.
    expect(await (await deliverWebhook([short.signature])).json()).toEqual({ launched: 0, traded: 0, graduated: 0, airdropped: 0 });
  });

  it("LaunchLab itself refuses a cliff or an unlock time on a launch that locks nothing", async () => {
    await expect(launchDirectly({ lock: { lockedAmount: new BN(0), cliffSeconds: 60, unlockSeconds: 0 } })).rejects.toThrow(/0x9c5|RequireEqViolated/);
  });
});

describe("claiming a Creator Lock", () => {
  // Seconds instead of days, so a test sees a cliff end and coins unlock; a lock this short is one only a launch sent
  // straight to the chain can have.
  const lock: CreatorLock = { lockedAmount: supplyShare(1_000), cliffSeconds: 6, unlockSeconds: 40 };

  it("starts its clock when the curve sells out, keeps the coins in LaunchLab's vault through Graduation, and pays the Creator what has unlocked", { timeout: 180_000 }, async () => {
    const coin = await launchDirectly({ lock });
    const creator = coin.creator.publicKey;
    expect((await lockOf(coin)).unlockStartsAt).toBeNull();

    // The buy that sells the curve out starts the clock: the cliff runs from that block, whenever Raydium migrates.
    const soldOutAt = await blockTimeOf(await sellOut(coin));
    const waiting = await lockOf(coin);
    expect(waiting).toMatchObject({ status: "graduating", unlockStartsAt: soldOutAt + lock.cliffSeconds });
    expect(unlockEndsAt(waiting)).toBe(soldOutAt + lock.cliffSeconds + lock.unlockSeconds);
    await expect(claim(coin)).rejects.toThrow(NOT_GRADUATED);

    const migration = await migrateCurve(connection(), coin.pool);
    const state = await lockOf(coin);
    expect(state).toMatchObject({ status: "graduated", unlockStartsAt: soldOutAt + lock.cliffSeconds });
    // The pool got its 20.69% of the supply and the vault keeps the lock, owned by LaunchLab's authority as before.
    const vault = await getAccount(connection(), pdas().vault(coin.pool, coin.mint), "confirmed");
    expect(vault.amount).toBe(BigInt(lock.lockedAmount.toString()));
    expect(vault.owner.equals(pdas().authority)).toBe(true);
    expect(await tokenBalance(cpmmPdas(programs.cpmm).vault(migration.pool, coin.mint))).toBe(206_900_000_000_000_000n);
    expect((await connection().getTokenSupply(coin.mint)).value.amount).toBe(LAUNCH_SHAPE.supply.toString());

    // While the cliff runs nothing is claimable.
    if ((await chainTime()) < state.unlockStartsAt! - 1) await expect(claim(coin)).rejects.toThrow(CLIFF_RUNNING);
    expect(unlockedAmount(lock.lockedAmount, state, state.unlockStartsAt! - 1).isZero()).toBe(true);

    // Part of the way through the unlock time a claim pays that part, counted by the chain's clock at the claim.
    await chainTimeReaches(state.unlockStartsAt! + 5);
    const first = await claim(coin);
    const at = await blockTimeOf(first);
    const paid = (await heldBy(coin, creator)).amount;
    // The program reads its own clock, which a block's time can trail by a second.
    const unlockedAt = (t: number) => BigInt(unlockedAmount(lock.lockedAmount, state, t).toString());
    expect(paid).toBeGreaterThanOrEqual(unlockedAt(at - 1));
    expect(paid).toBeLessThanOrEqual(unlockedAt(at + 1));
    expect(paid).toBeLessThan(BigInt(lock.lockedAmount.toString()));
    expect((await lockOf(coin)).share!.claimed.toString()).toBe(paid.toString());
    expect(await tokenBalance(pdas().vault(coin.pool, coin.mint))).toBe(BigInt(lock.lockedAmount.toString()) - paid);

    // Once the unlock time has passed a claim pays the rest, and after that there is nothing to claim.
    await chainTimeReaches(unlockEndsAt(state)! + 1);
    await claim(coin);
    expect((await heldBy(coin, creator)).amount).toBe(BigInt(lock.lockedAmount.toString()));
    const done = await lockOf(coin);
    expect(done.share!.claimed.eq(done.share!.amount)).toBe(true);
    expect(await tokenBalance(pdas().vault(coin.pool, coin.mint))).toBe(0n);
    await expect(claim(coin)).rejects.toThrow(NOTHING_UNLOCKED);

    // A wallet with no share cannot claim a coin.
    const stranger = await fundedWallet();
    await expect(claim(coin, stranger)).rejects.toThrow(/AccountNotInitialized|0xbc4/);
  });

  it("withholds a Reward Launch's Reward Tax on what the Creator claims, like any transfer of the coin", { timeout: 180_000 }, async () => {
    const coin = await launchDirectly({ lock: { ...lock, cliffSeconds: 2, unlockSeconds: 0 }, rewardTaxBps: 500 });
    expect((await launchIn(coin.signature)).rewardTaxBps).toBe(500);
    await sellOut(coin);
    await migrateCurve(connection(), coin.pool);
    const state = await lockOf(coin);
    await chainTimeReaches(state.unlockStartsAt! + 1);
    await claim(coin);
    // The whole share left the vault; a twentieth of it sits withheld in the Creator's account for the holders.
    const held = await heldBy(coin, coin.creator.publicKey);
    const share = BigInt(lock.lockedAmount.toString());
    expect(getTransferFeeAmount(held)?.withheldAmount).toBe(share / 20n);
    expect(held.amount).toBe(share - share / 20n);
    expect((await lockOf(coin)).share!.claimed.toString()).toBe(share.toString());
    expect(await getAccount(connection(), pdas().vault(coin.pool, coin.mint), "confirmed", TOKEN_2022_PROGRAM_ID).then((v) => v.amount)).toBe(0n);
  });
});

const api = (path: string, init?: RequestInit) => fetch(`${env().apiUrl}${path}`, init);
const operator = () => ({ authorization: `Bearer ${env().operatorToken}` });
const errorOf = async (res: Response) => ((await res.json()) as { error: string }).error;
const lockStatus = async (mint: string) => CreatorLockStatus.parse(await (await api(`/v1/launches/${mint}/lock`)).json());
const askClaim = (mint: string, wallet: PublicKey) =>
  api(`/v1/launches/${mint}/lock/claim`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ wallet: wallet.toBase58() }) });
const holders = async (mint: string) => HolderList.parse(await (await api(`/v1/launches/${mint}/holders`)).json());
const authority = () => pdas().authority.toBase58();
const seconds = (iso: string | null) => (iso === null ? null : Date.parse(iso) / 1000);

type LockForm = { lockBps?: string; lockCliffSeconds?: string; lockUnlockSeconds?: string; rewardTax?: string; firstBuy?: string };

/** A coin launched through the API, as the launch form would ask for it, and indexed. */
async function launchWithLock(form: LockForm) {
  const creator = await fundedWallet(10);
  const res = await prepare({ creator: creator.publicKey.toBase58(), ...form });
  expect(res.status, await res.clone().text()).toBe(200);
  const prepared = PreparedLaunch.parse(await res.json());
  const signature = await signAndSend(prepared, creator);
  expect(await (await deliverWebhook([signature])).json()).toMatchObject({ launched: 1 });
  return { creator, mint: prepared.mint, pool: prepared.pool, prepared, tokenProgram: form.rewardTax ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID };
}

/** A trader buys the curve out, Raydium's migrate wallet graduates it, and both are indexed; returns when the curve sold out. */
async function graduate(coin: { mint: string; pool: string }) {
  const trader = await fundedWallet(10);
  const bought = await trade(trader, coin.mint, "buy", SOL(2));
  expect(bought.quote.completesCurve).toBe(true);
  const migration = await migrateCurve(connection(), new PublicKey(coin.pool));
  await deliverWebhook([bought.signature, migration.signature]);
  return { trader, soldOutAt: await blockTimeOf(bought.signature) };
}

describe("preparing a Creator Lock through the API", () => {
  it("refuses a lock we do not launch, saying why", async () => {
    const creator = (await fundedWallet(1)).publicKey.toBase58();
    const refused = async (form: LockForm, why: RegExp) => {
      const res = await prepare({ creator, ...form });
      expect(res.status).toBe(400);
      expect(await errorOf(res)).toMatch(why);
    };
    await refused({ lockCliffSeconds: String(30 * DAY) }, /schedule needs coins to lock/);
    await refused({ lockBps: "2001", lockCliffSeconds: String(30 * DAY) }, /lock 20% of the supply at most/);
    await refused({ lockBps: "1000", lockCliffSeconds: String(3 * DAY), lockUnlockSeconds: String(3 * DAY) }, /at least 7 days after the curve sells out/);
    await refused({ lockBps: "1000", lockCliffSeconds: String(1_462 * DAY) }, /four years each at most/);
    expect((await prepare({ creator, lockBps: "ten" })).status).toBe(400);
  });

  it("builds the lock into the launch, prices the First Buy on the smaller sale, keeps it for a retry, and lists the coin with it", async () => {
    const quoteOf = async (query: string) => FirstBuyQuote.parse(await (await api(`/v1/launch-quote?quoteMint=${WSOL_MINT.toBase58()}&firstBuy=100000000${query}`)).json()).firstBuy;
    const [plain, locked] = [await quoteOf(""), await quoteOf("&lockBps=1000")];
    expect(BigInt(locked.amountOut)).toBeLessThan(BigInt(plain.amountOut));
    expect(locked.priceBefore).toBeGreaterThan(plain.priceBefore);

    const coin = await launchWithLock({ lockBps: "1000", lockCliffSeconds: String(30 * DAY), lockUnlockSeconds: String(180 * DAY), firstBuy: "100000000" });
    const terms = { bps: 1_000, amount: "100000000000000000", cliffSeconds: 30 * DAY, unlockSeconds: 180 * DAY };
    expect(coin.prepared.creatorLock).toEqual(terms);
    expect(coin.prepared.firstBuy?.amountOut).toBe(locked.amountOut);
    // The draft keeps the lock, so a retry would have built the same launch (and answers 409 now it has landed).
    expect((await api(`/v1/launches/${coin.mint}/prepare`, { method: "POST" })).status).toBe(409);
    expect((await getLaunch(coin.mint)).launch?.creatorLock).toEqual(terms);

    // Nothing has unlocked or can be claimed while the curve sells; the whole lock is the Creator's.
    expect(await lockStatus(coin.mint)).toEqual({
      mint: coin.mint, creator: coin.creator.publicKey.toBase58(), terms, curve: "live", unlockStartsAt: null, unlockEndsAt: null, asOf: expect.any(String),
      creatorShare: { amount: terms.amount, unlocked: "0", claimed: "0", claimable: "0" }, stillLocked: terms.amount, rewardTaxBps: null,
    });
    const early = await askClaim(coin.mint, coin.creator.publicKey);
    expect(early.status).toBe(409);
    expect(await errorOf(early)).toMatch(/once the coin has graduated/);
    expect((await askClaim(coin.mint, Keypair.generate().publicKey)).status).toBe(403);
    // Before Graduation the curve's vault holds the sale and the lock together, labelled as the curve.
    expect((await holders(coin.mint)).holders.find((h) => h.owner === authority())?.kind).toBe("curve");
  });

  it("answers 404 for a coin without a lock", async () => {
    const coin = await launchWithLock({});
    expect((await getLaunch(coin.mint)).launch?.creatorLock).toBeNull();
    expect((await api(`/v1/launches/${coin.mint}/lock`)).status).toBe(404);
  });
});

describe("a Creator Lock after Graduation, through the API", () => {
  it("refuses a claim while the cliff runs, saying when the coins start to unlock", { timeout: 120_000 }, async () => {
    const coin = await launchWithLock({ lockBps: "500", lockCliffSeconds: String(7 * DAY) });
    const { soldOutAt } = await graduate(coin);
    const status = await lockStatus(coin.mint);
    expect(status).toMatchObject({ curve: "graduated", creatorShare: { claimable: "0", unlocked: "0" } });
    expect(seconds(status.unlockStartsAt)).toBe(soldOutAt + 7 * DAY);
    const res = await askClaim(coin.mint, coin.creator.publicKey);
    expect(res.status).toBe(409);
    expect(await errorOf(res)).toBe(`Nothing unlocks until ${status.unlockStartsAt}.`);
  });

  it("pays the Creator what has unlocked, and keeps LaunchLab's vault out of the holder count, the trust figures and the holder list's people", { timeout: 180_000 }, async () => {
    // No cliff and the shortest unlock time: a week, so some coins unlock every second from the sell-out.
    const coin = await launchWithLock({ lockBps: "1000", lockUnlockSeconds: String(7 * DAY) });
    const { trader, soldOutAt } = await graduate(coin);
    await chainTimeReaches(soldOutAt + 3);
    const before = await lockStatus(coin.mint);
    expect(before).toMatchObject({ curve: "graduated", unlockStartsAt: new Date(soldOutAt * 1000).toISOString(), unlockEndsAt: new Date((soldOutAt + 7 * DAY) * 1000).toISOString() });
    expect(BigInt(before.creatorShare!.claimable)).toBeGreaterThan(0n);
    expect(before.creatorShare!.claimable).toBe(before.creatorShare!.unlocked);

    const res = await askClaim(coin.mint, coin.creator.publicKey);
    expect(res.status, await res.clone().text()).toBe(200);
    const claim = PreparedCreatorLockClaim.parse(await res.json());
    expect(claim.received).toBe(claim.amount);
    await signAndSend(claim, coin.creator);
    // The claim pays what had unlocked when it landed: at least what was quoted.
    const paid = (await heldBy({ mint: new PublicKey(coin.mint), tokenProgram: TOKEN_PROGRAM_ID } as Coin, coin.creator.publicKey)).amount;
    expect(paid).toBeGreaterThanOrEqual(BigInt(claim.amount));
    const after = await lockStatus(coin.mint);
    expect(after.creatorShare!.claimed).toBe(paid.toString());
    expect(after.stillLocked).toBe((100_000_000_000_000_000n - paid).toString());

    // After Graduation LaunchLab's vault holds only what is still locked, under its own label, never as a person.
    const list = await holders(coin.mint);
    expect(list.holders.find((h) => h.owner === authority())).toMatchObject({ kind: "lock", amount: after.stillLocked });
    // The board counts holders by their trades, so the Creator's claim is not one and the vault never is: the trader alone.
    expect((await getLaunch(coin.mint)).launch?.market.holders).toBe(1);
    const trust = LaunchTrust.parse(await (await api(`/v1/launches/${coin.mint}/trust`)).json());
    expect(trust.snipers.wallets.map((w) => w.wallet)).not.toContain(authority());
    expect(trust.creator.firstBuy).toBeNull();
    expect(trader).toBeDefined();
  });

  it("withholds a Reward Launch's Reward Tax on a claim, and leaves LaunchLab's vault out of the Holding Check and the Reward Round", { timeout: 240_000 }, async () => {
    const runRounds = async () => {
      const res = await api("/v1/operator/jobs/reward-rounds", { method: "POST", headers: operator() });
      expect(res.status, await res.clone().text()).toBe(200);
      return ((await res.json()) as { summary: { holdingChecks: { checked: { mint: string; wallets: number }[] }; opened: { mint: string; round: string }[] } }).summary;
    };
    const coin = await launchWithLock({ lockBps: "1000", lockUnlockSeconds: String(7 * DAY), rewardTax: "500" });
    const { trader, soldOutAt } = await graduate(coin);
    await chainTimeReaches(soldOutAt + 3);
    const res = await askClaim(coin.mint, coin.creator.publicKey);
    expect(res.status, await res.clone().text()).toBe(200);
    const claim = PreparedCreatorLockClaim.parse(await res.json());
    expect((await lockStatus(coin.mint)).rewardTaxBps).toBe(500);
    const amount = new BN(claim.amount);
    expect(claim.received).toBe(amount.sub(withheldFee(amount, rewardTaxFee(500))).toString());
    expect(BigInt(claim.received)).toBeLessThan(BigInt(claim.amount));
    await signAndSend(claim, coin.creator);
    const held = await heldBy({ mint: new PublicKey(coin.mint), tokenProgram: TOKEN_2022_PROGRAM_ID } as Coin, coin.creator.publicKey);
    expect(getTransferFeeAmount(held)?.withheldAmount).toBeGreaterThan(0n);

    // The Holding Check records the wallets that hold the coin, the trader and the Creator, and never the vault, which
    // holds most of the lock still; a Reward Round snapshots the same wallets.
    const wallets = [trader.publicKey.toBase58(), coin.creator.publicKey.toBase58()].sort();
    let checked: { wallets: number } | undefined;
    const opened: string[] = [];
    for (let i = 0; i < 20 && (!checked || opened.length === 0); i++) {
      const run = await runRounds();
      checked ??= run.holdingChecks.checked.find((c) => c.mint === coin.mint);
      opened.push(...run.opened.filter((o) => o.mint === coin.mint).map((o) => o.round));
      if (!checked || opened.length === 0) await new Promise((r) => setTimeout(r, env().holdingDaySeconds * 1000));
    }
    expect(checked?.wallets).toBe(2);
    const vault = WalletHolding.parse(await (await api(`/v1/launches/${coin.mint}/holdings/${authority()}`)).json());
    expect(vault.held).toBe("0");
    expect(opened.length).toBeGreaterThan(0);
    const round = RewardRoundDetail.parse(await (await api(`/v1/rewards/rounds/${opened[0]}`)).json());
    // Who is paid is whoever holds the round's minimum, so the Creator's few claimed coins may fall under it; the vault never counts.
    const paid = round.payouts.map((p) => p.wallet);
    expect(paid).toContain(trader.publicKey.toBase58());
    expect(paid.every((w) => wallets.includes(w))).toBe(true);
  });
});
