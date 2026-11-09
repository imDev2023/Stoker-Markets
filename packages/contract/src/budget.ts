import { z } from "zod";

/**
 * The Budget Table (ADR 0019): how the Platform Net, the Ledger's revenue less the Creators' share, is divided. One
 * table, versioned, every share in basis points of the net; a version's shares sum to 100% and apply to the net
 * collected while it is in force.
 */

const raw = z.string().regex(/^\d+$/, "must be a whole number of raw units");
const bps = z.number().int().min(0).max(10_000);

/**
 * The table's rows, in the order they are shown: the Burn and the Flywheel (ADR 0006), the trader programs (volume
 * rebates, the off-chain referral program for every pair, the integrator share; each 0 until it is built), and the
 * treasury, which takes the remainder.
 */
export const BUDGET_ROWS = ["burn", "flywheel", "rebates", "referrals", "integrators", "treasury"] as const;
export const BudgetRow = z.enum(BUDGET_ROWS);
export type BudgetRow = z.infer<typeof BudgetRow>;

/** The rows that spend through a job of their own; the treasury's is whatever they leave, moved by the sweep. */
export const SPENDING_ROWS = ["burn", "flywheel", "rebates", "referrals", "integrators"] as const satisfies readonly BudgetRow[];
export type SpendingRow = (typeof SPENDING_ROWS)[number];

/** The trader programs' rows, which the Burn's row pays for as each goes live (owner, 2026-11-09). */
export const TRADER_PROGRAM_ROWS = ["rebates", "referrals", "integrators"] as const satisfies readonly BudgetRow[];

/** A share of the whole in basis points: what the shares of one version sum to. */
export const BUDGET_TOTAL_BPS = 10_000;

/**
 * The most the trader programs may take together (owner, 2026-11-09): a fifth of the Platform Net, out of the Burn's
 * share alone. A larger figure is a new decision, recorded as an amendment of ADR 0019, before it is a table.
 */
export const TRADER_PROGRAMS_MAX_BPS = 2_000;

/** Every row's share, in basis points of the Platform Net. */
export const BudgetShares = z
  .object({ burn: bps, flywheel: bps, rebates: bps, referrals: bps, integrators: bps, treasury: bps })
  .refine((s) => BUDGET_ROWS.reduce((sum, row) => sum + s[row], 0) === BUDGET_TOTAL_BPS, { message: "the shares must sum to 10000 basis points (100%)" })
  .refine((s) => TRADER_PROGRAM_ROWS.reduce((sum, row) => sum + s[row], 0) <= TRADER_PROGRAMS_MAX_BPS, {
    message: `the trader programs (rebates, referrals, integrators) may take ${TRADER_PROGRAMS_MAX_BPS} basis points together at most`,
  });
export type BudgetShares = z.infer<typeof BudgetShares>;

/** One published version of the table. */
export const BudgetTableVersion = z.object({
  version: z.number().int(),
  shares: BudgetShares,
  note: z.string().nullable(),
  announcedAt: z.iso.datetime(),
  /** The first version's shares cover everything collected before the second takes effect, whatever its own time says. */
  effectiveAt: z.iso.datetime(),
});
export type BudgetTableVersion = z.infer<typeof BudgetTableVersion>;

/** The table as published: the version in force and any announced for later, soonest first. */
export const PublishedBudgetTable = z.object({ inForce: BudgetTableVersion, upcoming: z.array(BudgetTableVersion) });
export type PublishedBudgetTable = z.infer<typeof PublishedBudgetTable>;

/** Operator: the next version. It takes effect no sooner than the fee change's lead time after it is announced, and after every earlier version. */
export const AnnounceBudgetTable = z.object({
  shares: BudgetShares,
  effectiveAt: z.iso.datetime(),
  note: z.string().trim().max(200).optional(),
});
export type AnnounceBudgetTable = z.infer<typeof AnnounceBudgetTable>;

/** What one row has been allotted and what is left of it, in lamports. */
export const RowBudget = z.object({
  row: BudgetRow,
  /** The row's share in the version in force. */
  shareBps: bps,
  /** Its share of the net collected under each version, summed over the versions so far. */
  allottedLamports: raw,
  /** What the Ledger shows it spent; null for the treasury, whose share leaves by the sweep. */
  spentLamports: raw.nullable(),
  /** What it has left to spend, kept in the operations wallet by the sweep; null for the treasury. */
  availableLamports: raw.nullable(),
});
export type RowBudget = z.infer<typeof RowBudget>;

/** `GET /v1/budgets`: the Platform Net and what every row of the Budget Table has been allotted, has spent and has left. */
export const BudgetsPage = z.object({
  /** The Ledger's revenue less the Creators' share, valued in SOL at the latest prices, in lamports. */
  netLamports: raw,
  /** Every version there is, oldest first, those announced for later included: with the Ledger, enough to redo each allotment. */
  versions: z.array(BudgetTableVersion),
  /** The version in force. */
  inForce: z.number().int(),
  rows: z.array(RowBudget),
});
export type BudgetsPage = z.infer<typeof BudgetsPage>;
