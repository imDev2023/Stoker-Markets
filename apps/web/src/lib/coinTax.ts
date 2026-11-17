import type { LaunchSummary, LaunchTrust } from "@launchpad/contract";
import { formatSupplyShare } from "./format";

/** The tax a coin withholds on every transfer, in basis points: a Reward Launch's Reward Tax or a Liquidity Launch's own; 0 for any other coin. */
export const coinTaxBps = (launch: Pick<LaunchSummary, "rewardTax" | "liquidityTax">) => launch.rewardTax?.bps ?? launch.liquidityTax?.bps ?? 0;

/**
 * What reaches a wallet of `amount` raw coins sent to it, after the coin's tax. Token-2022 withholds the rate rounded up
 * to a whole unit, and a coin launched here sets no cap on it (`withheldFee` and `REWARD_TAX_MAXIMUM_FEE` in
 * `@launchpad/chain`, which the web never imports, ADR 0003).
 */
export function afterCoinTax(amount: bigint, taxBps: number) {
  if (taxBps === 0 || amount === 0n) return amount;
  return amount - (amount * BigInt(taxBps) + 9_999n) / 10_000n;
}

/**
 * The Creator's First Buy as a share of the supply, or null when the launch had none. The trust figures carry the
 * curve's amount, which on a coin with a tax is more than reached the Creator's wallet: the launch summary promised the
 * wallet's share ("You get ..."), so the coin's page repeats that one, in the summary's own format (#221).
 */
export function firstBuyShare(trust: LaunchTrust, taxBps: number) {
  const { firstBuy } = trust.creator;
  return firstBuy ? formatSupplyShare(afterCoinTax(BigInt(firstBuy.amount), taxBps), BigInt(trust.supply)) : null;
}
