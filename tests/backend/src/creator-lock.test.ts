// The Creator Lock on the chain (ADR 0023, the first half of #186): coins a launch keeps back from its curve's sale for
// the Creator, held by LaunchLab and claimed by the Creator's own wallet once the coin has graduated. This file works
// the chain alone, with `@launchpad/chain`'s builders: the API prepares no lock and the Indexer lists no coin with one
// until the second half. The Quote Registry writes no rule that admits a lock yet either, so the file opens two groups
// of its own on SOL's curve rule, with the constraints the registry will write, and closes them when it ends.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ComputeBudgetProgram, Keypair, PublicKey, type TransactionInstruction } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, getAccount, getAssociatedTokenAddressSync, getTransferFeeAmount } from "@solana/spl-token";
import BN from "bn.js";
import {
  closedLaunchConstraints, cpmmPdas, createVestingAccountIx, CREATOR_LOCK, creatorLockCapBps, creatorLockProblem, decodeTransaction, graduationBandOf,
  initialCurveReserves, initializeV2Ix, initializeWithToken2022Ix, launchlabCoder, launchlabPdas, LAUNCH_SHAPE, listGlobalConfigs, loadLookupTable, maxLockBpsOf,
  pinsLaunchShape, prepareCreatorLockClaim, prepareLaunch, programsFor, quoteFirstBuy, readCreatorLock, readCurveRuleGroups, REWARD_TAX_MAXIMUM_FEE,
  rewardLaunchConstraints, RuleField, RuleOp, saleWithLock, sameConstraints, standardLaunchConstraints, supplyShare, tradeInstructions, unlockedAmount,
  unlockEndsAt, updateCurveRuleIx, WSOL_MINT, type CreatorLock, type InitializeParams, type LaunchCreated, type TradeExecuted,
} from "@launchpad/chain";
import { localnetKeys, migrateCurve, send } from "@launchpad/localnet";
import { connection, deliverWebhook, env, fundedWallet, rawTransaction, signAndSend, tokenBalance } from "./client";

const programs = programsFor("localnet");
const program = () => new PublicKey(env().platform.launchlab);
const platformConfig = () => new PublicKey(env().platform.platformConfig);
const pdas = () => launchlabPdas(program());
const solConfig = () => pdas().globalConfig(WSOL_MINT);
const target = () => new BN(env().platform.graduationTargetLamports);
const DAY = 86_400;

/** The groups this file opens on SOL's rule: the ids after the Quote Registry's own two. */
const LOCK_GROUP = { standard: 2, reward: 3 } as const;

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

beforeAll(async () => {
  const { operations } = localnetKeys();
  const rules = (await readCurveRuleGroups(connection(), program(), platformConfig(), [solConfig()])).get(solConfig().toBase58())!;
  band = graduationBandOf(rules.get(0)!)!;
  const sol = (await listGlobalConfigs(connection(), program())).find((c) => c.quoteMint.equals(WSOL_MINT))!;
  capBps = creatorLockCapBps(sol);
  await send(connection(), [
    updateCurveRuleIx(program(), operations.publicKey, platformConfig(), solConfig(), LOCK_GROUP.standard, standardLaunchConstraints(band, { maxLockBps: capBps })),
    updateCurveRuleIx(program(), operations.publicKey, platformConfig(), solConfig(), LOCK_GROUP.reward, rewardLaunchConstraints(band, { maxLockBps: capBps })),
  ], [operations]);
});

afterAll(async () => {
  // No later file may find SOL's rule admitting a lock: both groups end as ones no launch can satisfy.
  const { operations } = localnetKeys();
  await send(connection(), [LOCK_GROUP.standard, LOCK_GROUP.reward].map((id) =>
    updateCurveRuleIx(program(), operations.publicKey, platformConfig(), solConfig(), id, closedLaunchConstraints())), [operations]);
});

describe("the curve rule of a Quote Asset that admits a Creator Lock", () => {
  it("is the rule of today, constraint for constraint, where no lock is allowed, so nothing is rewritten for it", async () => {
    const rules = (await readCurveRuleGroups(connection(), program(), platformConfig(), [solConfig()])).get(solConfig().toBase58())!;
    expect(sameConstraints(rules.get(0)!, standardLaunchConstraints(band))).toBe(true);
    expect(sameConstraints(rules.get(1)!, rewardLaunchConstraints(band, { maxLockBps: 0 }))).toBe(true);
    expect(maxLockBpsOf(rules.get(0)!)).toBe(0);
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

  it("is not listed yet: the Indexer leaves a coin with a lock alone until the pages can show it", async () => {
    const coin = await launchDirectly({ lock: { lockedAmount: supplyShare(2_000), cliffSeconds: 7 * DAY, unlockSeconds: 0 } });
    expect((await launchIn(coin.signature)).standardShape).toBe(true);
    const res = await deliverWebhook([coin.signature]);
    expect(await res.json()).toEqual({ launched: 0, traded: 0, graduated: 0, airdropped: 0 });
    expect((await fetch(`${env().apiUrl}/v1/launches/${coin.mint.toBase58()}`)).status).toBe(404);
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
