/**
 * web3.js's `confirmTransaction` reports a failure two ways: as `value.err` when it arrives on the confirmation
 * subscription, and as a rejection with the raw error object when the transaction had already failed by the time it
 * looked. Both mean the transaction landed and failed: nothing moved except the network fee.
 */
export function landedError(e: unknown): string | null {
  if (!e || typeof e !== "object" || e instanceof Error) return null;
  return "InstructionError" in e || "InsufficientFundsForFee" in e ? JSON.stringify(e) : null;
}
