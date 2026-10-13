import type { HolderList, HolderKind } from "@launchpad/contract";
import { explorerUrl, shortAddress } from "@/lib/format";
import styles from "./Holders.module.css";

/** How many holders the card lists; the API returns up to 20. */
const SHOWN = 10;

const LABELS: Partial<Record<HolderKind, string>> = { curve: "Curve", pool: "Raydium pool" };

/** Holders named next to their address: the Creator, and the platform's own wallets, which a Fee Key pays in the coin. */
const BADGES: Partial<Record<HolderKind, string>> = { creator: "Creator", treasury: "Platform treasury", operations: "Platform operations" };

/** A share of the supply as a percentage: two decimals below 1%, one above. */
function percent(share: number) {
  const pct = share * 100;
  if (pct > 0 && pct < 0.01) return "<0.01%";
  return `${pct.toFixed(pct < 1 ? 2 : 1)}%`;
}

function creatorLine(h: HolderList) {
  if (h.creator.status === "holding") return `The Creator holds ${percent(h.creator.share)} of the supply.`;
  if (h.creator.status === "sold") return "The Creator has sold all their coins.";
  return "The Creator holds none of this coin.";
}

/**
 * The coin's largest holders, read from the chain, and whether its Creator still holds. The curve (and after Graduation,
 * the Raydium pool) is named rather than linked: it holds the coins nobody has bought yet.
 */
export function Holders({ holders, platform, headingHidden = false }: {
  holders: HolderList | null;
  platform: { cluster: string; rpcUrl: string };
  /** When a tab names the panel: the heading stays as the region's name, unseen. */
  headingHidden?: boolean;
}) {
  return (
    <section className={`card ${styles.card}`} aria-labelledby="holders-title">
      <h2 id="holders-title" className={headingHidden ? "visually-hidden" : `t-h3 ${styles.title}`}>Top holders</h2>
      {holders === null ? (
        <p className={styles.note}>Couldn&rsquo;t read the holders from the chain. Retrying.</p>
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
                    <a className="mono" href={explorerUrl("address", h.owner, platform)} target="_blank" rel="noreferrer">
                      {shortAddress(h.owner)}
                    </a>
                  )}
                  {BADGES[h.kind] && <span className={styles.badge}>{BADGES[h.kind]}</span>}
                </span>
                <span className={`mono ${styles.share}`}>{percent(h.share)}</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
