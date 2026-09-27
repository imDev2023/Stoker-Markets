import BN from "bn.js";

/**
 * The launch shape every Launch on our platform has, pinned on-chain by our curve rules.
 * Supply 1B at 6 decimals, 793.1M sold on a constant-product curve, migration to CPMM, no vesting,
 * CPMM creator fee on the quote side.
 */
export const LAUNCH_SHAPE = {
  decimals: 6,
  supply: new BN("1000000000000000"),
  totalBaseSell: new BN("793100000000000"),
  migrateType: 1, // CPMM
  curveType: 0, // constant product
  ammFeeOn: "QuoteToken" as const,
};

/** Rates use LaunchLab's 1e6 denominator: 5_000 is 0.5%. */
export const RATE_DENOMINATOR = 1_000_000;

// Curve rule field and operator codes, from raydium-sdk-V2 `LaunchpadCurveRuleField` / `LaunchpadCurveRuleOp`.
export const RuleField = {
  CurveType: 0, MigrateType: 1, MigrateCpmmFeeOn: 2, Supply: 3, TotalSellA: 4, TotalFundRaisingB: 5,
  TotalLockedAmount: 6, CliffPeriod: 7, UnlockPeriod: 8, BaseTokenProgram: 9, TransferFeeEnabled: 10,
} as const;
export const RuleOp = { Eq: 0, Gte: 1, Lte: 2, Neq: 3 } as const;

export type RuleConstraint = { field: number; op: number; value: BN };

/** Constraints for a standard (SPL, no transfer fee) Launch against one Quote Asset with a fixed Graduation Target. */
export function standardLaunchConstraints(graduationTargetRaw: BN): RuleConstraint[] {
  const eq = (field: number, value: BN | number) => ({ field, op: RuleOp.Eq, value: new BN(value.toString()) });
  return [
    eq(RuleField.CurveType, LAUNCH_SHAPE.curveType),
    eq(RuleField.MigrateType, LAUNCH_SHAPE.migrateType),
    eq(RuleField.MigrateCpmmFeeOn, 0),
    eq(RuleField.Supply, LAUNCH_SHAPE.supply),
    eq(RuleField.TotalSellA, LAUNCH_SHAPE.totalBaseSell),
    eq(RuleField.TotalFundRaisingB, graduationTargetRaw),
    eq(RuleField.TotalLockedAmount, 0),
    eq(RuleField.CliffPeriod, 0),
    eq(RuleField.UnlockPeriod, 0),
    eq(RuleField.BaseTokenProgram, 0),
    eq(RuleField.TransferFeeEnabled, 0),
  ];
}
