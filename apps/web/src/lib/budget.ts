import type { BudgetRow, BudgetShares } from "@launchpad/contract";
import { BUDGET_ROWS } from "@launchpad/contract";
import { pct } from "./fees";

/** The Budget Table's rows as the site names them (ADR 0019), one source for the Fees page and the announcements. */
export const BUDGET_ROW_LABELS: Record<BudgetRow, string> = {
  burn: "The Burn",
  flywheel: "The Flywheel",
  rebates: "Volume rebates",
  referrals: "Referrals on every pair",
  integrators: "Integrator share",
  treasury: "Treasury",
};

/** A version's division in one line: every row with a share, in the table's order. */
export function budgetLine(shares: BudgetShares) {
  return BUDGET_ROWS.filter((row) => shares[row] > 0).map((row) => `${BUDGET_ROW_LABELS[row]} ${pct(shares[row])}`).join(", ");
}
