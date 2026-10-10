import { getPlatform, listQuotes } from "@/lib/api";
import { creatorEarnings } from "@/lib/fees";
import { formatUnits, SOL_DECIMALS } from "@/lib/format";
import styles from "./StatusLine.module.css";

/**
 * The terminal's status line, under the header on every page past the home: the facts a trader checks once, every
 * one of them read from the chain or the registry at render, never a constant.
 */
export async function StatusLine() {
  const [platform, quotes] = await Promise.all([getPlatform(), listQuotes().catch(() => null)]);
  const earns = creatorEarnings(platform);
  const facts: [string, string][] = [
    ["net", platform.cluster],
    ["quote assets", quotes ? quotes.quotes.filter((q) => q.launchable).length.toLocaleString("en-US") : "-"],
    ["platform fee", `${Number((platform.platformFeeBps / 100).toFixed(3))}%`],
    ["creator share", `${earns.curve}%`],
    ["graduation", `${formatUnits(platform.graduationTargetLamports, SOL_DECIMALS, 2)} SOL`],
  ];
  return (
    <div className={styles.line}>
      <dl className={`shell ${styles.facts}`}>
        {facts.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
