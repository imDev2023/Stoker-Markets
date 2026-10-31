import type { HolderList, HolderKind } from "@launchpad/contract";
import { Address } from "./Address";
import { ErrorState } from "./EmptyState";
import { formatShare as percent } from "@/lib/format";
import styles from "./Holders.module.css";

/** How many holders the card lists; the API returns up to 20. */
const SHOWN = 10;

const LABELS: Partial<Record<HolderKind, string>> = { curve: "Curve", pool: "Raydium pool" };

/** Holders named next to their address: the Creator, and the platform's own wallets, which a Fee Key pays in the coin. */
const BADGES: Partial<Record<HolderKind, string>> = { creator: "Creator", treasury: "Platform treasury", operations: "Platform operations" };

/** What a holding is worth at the market cap: the share of the supply times what the whole supply is worth. */
const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n < 1 ? 4 : n < 1000 ? 2 : 0 });

function creatorLine(h: HolderList) {
  if (h.creator.status === "holding") return `The Creator holds ${percent(h.creator.share)} of the supply.`;
  if (h.creator.status === "sold") return "The Creator has sold all their coins.";
  return "The Creator holds none of this coin.";
}

/**
 * The coin's largest holders, read from the chain, and whether its Creator still holds. The curve (and after Graduation,
 * the Raydium pool) is named rather than linked: it holds the coins nobody has bought yet.
 */
export function Holders({ holders, platform, onRetry, snipers = new Set(), marketCapUsd = null, headingHidden = false }: {
  holders: HolderList | null;
  platform: { cluster: string; rpcUrl: string };
  /** Asks the chain again now, for the error state's button; the card retries on its own meanwhile. */
  onRetry?: () => void;
  /** Wallets Bundle Radar saw buy in the Snipe Window (`TrustCard`), marked in the list. */
  snipers?: Set<string>;
  /** What the whole supply is worth, for a value beside each share; null when the Quote Asset has no reliable price. */
  marketCapUsd?: number | null;
  /** When a tab names the panel: the heading stays as the region's name, unseen. */
  headingHidden?: boolean;
}) {
  return (
    <section className={`card ${styles.card}`} aria-labelledby="holders-title">
      <h2 id="holders-title" className={headingHidden ? "visually-hidden" : `t-h3 ${styles.title}`}>Top holders</h2>
      {holders === null ? (
        <ErrorState bare title="The holders could not be read" onRetry={onRetry}>
          The chain did not answer. The list asks again on its own every half minute.
        </ErrorState>
      ) : (
        <>
          <p className={`${styles.creator} ${holders.creator.status === "sold" ? styles.sold : ""}`}>{creatorLine(holders)}</p>
          <ol className={styles.list}>
            {holders.holders.slice(0, SHOWN).map((h, i) => (
              <li key={h.owner} className={styles.row}>
                <span className={styles.rank}>{i + 1}</span>
                <span className={styles.who}>
                  {LABELS[h.kind] ? (
                    <span className={styles.program}>{LABELS[h.kind]}</span>
                  ) : (
                    <Address value={h.owner} platform={platform} />
                  )}
                  {BADGES[h.kind] && <span className={styles.badge}>{BADGES[h.kind]}</span>}
                  {snipers.has(h.owner) && <span className={`${styles.badge} ${styles.sniper}`}>Sniper</span>}
                </span>
                <span className={`mono ${styles.share}`}>
                  {percent(h.share)}
                  {marketCapUsd !== null && <span className={styles.value}>{usd(h.share * marketCapUsd)}</span>}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
