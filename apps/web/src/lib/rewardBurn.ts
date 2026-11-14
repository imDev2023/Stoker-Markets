import type { RewardBurnBps } from "@launchpad/contract";

/**
 * The Reward Burn (#183) in words, as the launch summary, the coin's facts and its rewards card say it: the share of
 * every reward a Reward Launch burns instead of paying out. The rate itself is on /fees with the other figures (owner,
 * 2026-10-30); null for no burn, which those places leave unsaid.
 */
const WORDS: Record<number, string> = { 1000: "a tenth", 2500: "a quarter", 5000: "half" };

export function burnShareWords(bps: RewardBurnBps | number): string | null {
  return WORDS[bps] ?? null;
}

/** The same words opening a sentence: "A quarter". */
export function burnShareTitle(bps: RewardBurnBps | number): string | null {
  const words = burnShareWords(bps);
  return words && words[0]!.toUpperCase() + words.slice(1);
}
