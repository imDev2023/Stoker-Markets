import { getPlatform, listQuotes } from "@/lib/api";
import { creatorEarnings } from "@/lib/fees";
import { formatUnits, SOL_DECIMALS } from "@/lib/format";

/**
 * The terminal's facts, the ones a trader checks once, every one read from the chain or the registry at render, never a
 * constant: the status line shows them under the header, and the two-tier header candidate (h6) in its lower tier.
 */
export async function platformFacts(): Promise<[string, string][]> {
  const [platform, quotes] = await Promise.all([getPlatform(), listQuotes().catch(() => null)]);
  const earns = creatorEarnings(platform);
  return [
    ["net", platform.cluster],
    ["quote assets", quotes ? quotes.quotes.filter((q) => q.launchable).length.toLocaleString("en-US") : "-"],
    ["platform fee", `${Number((platform.platformFeeBps / 100).toFixed(3))}%`],
    ["creator share", `${earns.curve}%`],
    ["graduation", `${formatUnits(platform.graduationTargetLamports, SOL_DECIMALS, 2)} SOL`],
  ];
}
