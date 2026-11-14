import BN from "bn.js";

/**
 * The launch shape every new Launch on our platform has, pinned on-chain by our curve rules (ADR 0005).
 * Supply 1T at 6 decimals (owner, 2026-11-02, #166), 793.1B sold on a constant-product curve, migration to CPMM, CPMM
 * creator fee on the quote side, and no vesting unless the Creator locks coins for themselves (a Creator Lock, below).
 * The share sold is the 1B shape's, so a Graduation Target raises the same amount and a coin's market cap is the same
 * figure; only the count of coins, and so the price of one, differs.
 */
export const LAUNCH_SHAPE = {
  decimals: 6,
  supply: new BN("1000000000000000000"),
  totalBaseSell: new BN("793100000000000000"),
  migrateType: 1, // CPMM
  curveType: 0, // constant product
  ammFeeOn: "QuoteToken" as const,
};

/**
 * The supplies and sales coins launched before the current shape have: 1B at 6 decimals with 793.1M sold, every coin
 * until #166. The curve rules pin only LAUNCH_SHAPE, so no new coin can launch on one of these, but a coin that did
 * keeps its shape for good, and the Indexer still takes its launch as ours (a webhook redelivery, a history backfill,
 * a launch prepared before the Quote Registry rewrote the rules).
 */
export const EARLIER_LAUNCH_SHAPES = [
  { supply: new BN("1000000000000000"), totalBaseSell: new BN("793100000000000") },
] as const;

/** Whether a launch's supply and sale, raw units, are the current launch shape's or one an earlier coin has. */
export const isOurSupplyAndSale = (supply: BN, totalBaseSell: BN) =>
  [LAUNCH_SHAPE, ...EARLIER_LAUNCH_SHAPES].some((s) => supply.eq(s.supply) && totalBaseSell.eq(s.totalBaseSell));

/**
 * A Creator Lock (ADR 0023, #186): coins set aside for the Creator at launch, which LaunchLab keeps in the curve's own
 * vault and releases to the Creator's wallet once the coin has graduated. Nothing unlocks for `cliffSeconds` after the
 * curve sells out, then the coins unlock evenly over `unlockSeconds`; with no unlock time they all unlock when the
 * cliff ends.
 */
export type CreatorLock = { lockedAmount: BN; cliffSeconds: number; unlockSeconds: number };

const DAY_SECONDS = 86_400;

/**
 * What a Creator Lock may be (owner, 2026-11-13): at most a fifth of the supply, and at least seven days from the
 * curve selling out until the last coin unlocks. The longest cliff and unlock time are four years each, which is what the
 * curve rules admit; the launch form offers its own steps inside these.
 */
export const CREATOR_LOCK = {
  maxBps: 2_000,
  minSeconds: 7 * DAY_SECONDS,
  maxCliffSeconds: 1_461 * DAY_SECONDS,
  maxUnlockSeconds: 1_461 * DAY_SECONDS,
} as const;

/** `bps` of the launch shape's supply, raw units. */
export const supplyShare = (bps: number) => LAUNCH_SHAPE.supply.muln(bps).divn(10_000);

/**
 * The coins a curve sells when `lockedAmount` of them are locked for the Creator. A lock comes out of the sale and never
 * out of the pool's share, so a coin with a lock raises the same Graduation Target for fewer coins and graduates at the
 * same market cap as one without (and Raydium's GlobalConfigs want at least 15% of the supply in the pool).
 */
export const saleWithLock = (lockedAmount: BN) => LAUNCH_SHAPE.totalBaseSell.sub(lockedAmount);

/** Why a Creator Lock is not one we launch or list, written for the Creator; null when it is. */
export function creatorLockProblem(lock: CreatorLock, maxBps: number = CREATOR_LOCK.maxBps): string | null {
  if (lock.lockedAmount.lten(0)) return "A lock needs some coins in it.";
  if (lock.lockedAmount.gt(supplyShare(maxBps))) return `A Creator can lock ${maxBps / 100}% of the supply at most.`;
  const whole = (n: number) => Number.isSafeInteger(n) && n >= 0;
  if (!whole(lock.cliffSeconds) || !whole(lock.unlockSeconds)) return "A lock's cliff and unlock time are whole numbers of seconds.";
  if (lock.cliffSeconds > CREATOR_LOCK.maxCliffSeconds || lock.unlockSeconds > CREATOR_LOCK.maxUnlockSeconds) return "A lock's cliff and its unlock time are four years each at most.";
  if (lock.cliffSeconds + lock.unlockSeconds < CREATOR_LOCK.minSeconds) return `A lock lasts at least ${CREATOR_LOCK.minSeconds / DAY_SECONDS} days after the curve sells out.`;
  return null;
}

/**
 * Whether a launch's supply, sale and vesting are the current launch shape with a Creator Lock we accept: the sale and
 * the lock add up to the shape's sale, which no curve rule can say (a rule compares each field with a constant), so the
 * Indexer is what holds a coin with a lock to it. Coins of an earlier shape never had a lock.
 */
export const isOurLockedShape = (supply: BN, totalBaseSell: BN, lock: CreatorLock) =>
  supply.eq(LAUNCH_SHAPE.supply) && totalBaseSell.add(lock.lockedAmount).eq(LAUNCH_SHAPE.totalBaseSell) && creatorLockProblem(lock) === null;

/**
 * The largest Creator Lock a Quote Asset's GlobalConfig leaves room for, in basis points of the supply: ours, Raydium's
 * own limit on a lock, and what the sale can give up before it falls under Raydium's least sale (rates in LaunchLab's
 * 1e6 denominator). 0 for a config that allows no lock.
 */
export function creatorLockCapBps(limits: { maxLockRate: BN; minBaseSellRate: BN }): number {
  const bps = (rate: BN) => rate.divn(RATE_DENOMINATOR / 10_000).toNumber();
  const saleBps = LAUNCH_SHAPE.totalBaseSell.muln(10_000).div(LAUNCH_SHAPE.supply).toNumber();
  // Rounded up, so a least sale of 1 in a million still leaves the sale a whole basis point.
  const leastSaleBps = limits.minBaseSellRate.addn(RATE_DENOMINATOR / 10_000 - 1).divn(RATE_DENOMINATOR / 10_000).toNumber();
  return Math.max(0, Math.min(CREATOR_LOCK.maxBps, bps(limits.maxLockRate), saleBps - leastSaleBps));
}

/** Rates use LaunchLab's 1e6 denominator: 5_000 is 0.5%. */
export const RATE_DENOMINATOR = 1_000_000;

/** The Reward Tax rates a Reward Launch may choose, in basis points: 1%, 2%, 3%, 4% or 5% (LaunchLab allows up to 5%). */
export const REWARD_TAX_BPS = [100, 200, 300, 400, 500] as const;
export type RewardTaxBps = (typeof REWARD_TAX_BPS)[number];

/** Curve rule groups: 0 pins a standard Launch, 1 a Reward Launch (a Token-2022 coin with a transfer fee). */
export const RULE_GROUP = { standard: 0, reward: 1 } as const;

// Curve rule field and operator codes, from raydium-sdk-V2 `LaunchpadCurveRuleField` / `LaunchpadCurveRuleOp`.
export const RuleField = {
  CurveType: 0, MigrateType: 1, MigrateCpmmFeeOn: 2, Supply: 3, TotalSellA: 4, TotalFundRaisingB: 5,
  TotalLockedAmount: 6, CliffPeriod: 7, UnlockPeriod: 8, BaseTokenProgram: 9, TransferFeeEnabled: 10,
} as const;
export const RuleOp = { Eq: 0, Gte: 1, Lte: 2, Neq: 3 } as const;

export type RuleConstraint = { field: number; op: number; value: BN };

/** The Graduation Targets, in the Quote Asset's raw units, a curve rule accepts. SOL's is a single value. */
export type GraduationBand = { min: BN; max: BN };

/**
 * What a rule group admits besides the launch shape: `maxLockBps` is the largest Creator Lock, in basis points of the
 * supply (see `creatorLockCapBps`). Left out or 0, the group pins a launch without one, exactly.
 */
export type LaunchRuleOptions = { maxLockBps?: number };

/** Constraints for a standard (SPL, no transfer fee) Launch against one Quote Asset. */
export function standardLaunchConstraints(band: GraduationBand, opts: LaunchRuleOptions = {}): RuleConstraint[] {
  return launchConstraints(band, { baseTokenProgram: 0, transferFeeEnabled: 0 }, opts);
}

/**
 * Constraints for a Reward Launch against one Quote Asset: the same shape on a Token-2022 coin with a transfer fee (its
 * Reward Tax). The rate itself is not a rule field; the Indexer keeps only launches at one of REWARD_TAX_BPS.
 */
export function rewardLaunchConstraints(band: GraduationBand, opts: LaunchRuleOptions = {}): RuleConstraint[] {
  return launchConstraints(band, { baseTokenProgram: 1, transferFeeEnabled: 1 }, opts);
}

function launchConstraints(band: GraduationBand, coin: { baseTokenProgram: 0 | 1; transferFeeEnabled: 0 | 1 }, opts: LaunchRuleOptions): RuleConstraint[] {
  const c = (field: number, op: number, value: BN | number) => ({ field, op, value: new BN(value.toString()) });
  const eq = (field: number, value: BN | number) => c(field, RuleOp.Eq, value);
  const target = band.min.eq(band.max)
    ? [eq(RuleField.TotalFundRaisingB, band.min)]
    : [c(RuleField.TotalFundRaisingB, RuleOp.Gte, band.min), c(RuleField.TotalFundRaisingB, RuleOp.Lte, band.max)];
  const maxLocked = supplyShare(opts.maxLockBps ?? 0);
  // With a Creator Lock allowed, the sale and the lock each get a range: a lock comes out of the sale, and a rule
  // cannot hold the two to one sum (ADR 0023). LaunchLab itself refuses a cliff or an unlock time without a lock.
  const sale = maxLocked.isZero()
    ? [eq(RuleField.TotalSellA, LAUNCH_SHAPE.totalBaseSell)]
    : [c(RuleField.TotalSellA, RuleOp.Gte, saleWithLock(maxLocked)), c(RuleField.TotalSellA, RuleOp.Lte, LAUNCH_SHAPE.totalBaseSell)];
  const lock = maxLocked.isZero()
    ? [eq(RuleField.TotalLockedAmount, 0), eq(RuleField.CliffPeriod, 0), eq(RuleField.UnlockPeriod, 0)]
    : [
      c(RuleField.TotalLockedAmount, RuleOp.Lte, maxLocked),
      c(RuleField.CliffPeriod, RuleOp.Lte, CREATOR_LOCK.maxCliffSeconds),
      c(RuleField.UnlockPeriod, RuleOp.Lte, CREATOR_LOCK.maxUnlockSeconds),
    ];
  return [
    eq(RuleField.CurveType, LAUNCH_SHAPE.curveType),
    eq(RuleField.MigrateType, LAUNCH_SHAPE.migrateType),
    eq(RuleField.MigrateCpmmFeeOn, 0),
    eq(RuleField.Supply, LAUNCH_SHAPE.supply),
    ...sale,
    ...target,
    ...lock,
    eq(RuleField.BaseTokenProgram, coin.baseTokenProgram),
    eq(RuleField.TransferFeeEnabled, coin.transferFeeEnabled),
  ];
}

/**
 * A group no launch can satisfy (a raise of at least 1 and at most 0), for a Quote Asset we can't price.
 * Needed because a Quote Asset with no curve rule at all is not restricted, even with `restrict_curve_param` on.
 */
export function closedLaunchConstraints(): RuleConstraint[] {
  return [
    { field: RuleField.TotalFundRaisingB, op: RuleOp.Gte, value: new BN(1) },
    { field: RuleField.TotalFundRaisingB, op: RuleOp.Lte, value: new BN(0) },
  ];
}

/**
 * Whether a group of constraints pins the current launch shape's supply and sale: the sale exactly, or, in a group that
 * admits a Creator Lock, as the most the curve may sell. A group written before #166 pins the 1B shape, which LaunchLab
 * then holds every new launch to, so a launch built on LAUNCH_SHAPE would fail with 6025 until the Quote Registry
 * rewrites the group.
 */
export function pinsLaunchShape(constraints: RuleConstraint[]) {
  const pins = (field: number, value: BN, ops: number[]) => constraints.some((c) => c.field === field && ops.includes(c.op) && c.value.eq(value));
  return pins(RuleField.Supply, LAUNCH_SHAPE.supply, [RuleOp.Eq]) && pins(RuleField.TotalSellA, LAUNCH_SHAPE.totalBaseSell, [RuleOp.Eq, RuleOp.Lte]);
}

/** The largest Creator Lock a group of constraints admits, in basis points of the supply; 0 for a group that pins none. */
export function maxLockBpsOf(constraints: RuleConstraint[]) {
  const limit = constraints.find((c) => c.field === RuleField.TotalLockedAmount && (c.op === RuleOp.Eq || c.op === RuleOp.Lte));
  return limit ? limit.value.muln(10_000).div(LAUNCH_SHAPE.supply).toNumber() : 0;
}

/** The Graduation Target band a group of constraints allows, or null when it allows none (a closed group). */
export function graduationBandOf(constraints: RuleConstraint[]): GraduationBand | null {
  let min: BN | null = null;
  let max: BN | null = null;
  for (const c of constraints) {
    if (c.field !== RuleField.TotalFundRaisingB) continue;
    if (c.op === RuleOp.Eq || c.op === RuleOp.Gte) min = min && min.gt(c.value) ? min : c.value;
    if (c.op === RuleOp.Eq || c.op === RuleOp.Lte) max = max && max.lt(c.value) ? max : c.value;
  }
  return min && max && min.lte(max) ? { min, max } : null;
}

export const sameConstraints = (a: RuleConstraint[], b: RuleConstraint[]) =>
  a.length === b.length && a.every((c, i) => c.field === b[i]!.field && c.op === b[i]!.op && c.value.eq(b[i]!.value));
