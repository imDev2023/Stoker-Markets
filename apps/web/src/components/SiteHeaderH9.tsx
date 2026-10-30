import Link from "next/link";
import { BottomTabs } from "./BottomTabs";
import { GooeySearch } from "./GooeySearch";
import { Mark } from "./Mark";
import { LaunchLink, NavLinksH9 } from "./NavLinks";
import { WalletButton } from "./WalletButton";
import styles from "./SiteHeaderH9.module.css";

/**
 * Candidate H9 (#133, owner 2026-10-30, after the research's navigation findings; `?header=h9`): a visible top bar
 * on desktop, no left sidebar and no pill. Five words in the bar, ordered by a trader's frequency (Explore, Assets,
 * Rewards, Stats, Curated tagged "soon" until a Curated Launch exists), with the current one marked in more than
 * colour; Developers in the footer, where its audience arrives by the docs URL; one filled button. The right side
 * keeps two targets short of H4's four: the search opens in place from its icon (the "/" shortcut, its results in a
 * panel over a scrim), then "Stoke a coin", then the wallet as a quiet ghost that is the avatar once connected, with
 * the light-or-dark toggle in its menu. The lockup is one mark at 24px; the bar 60px and opaque, 52px on a phone,
 * where a bottom tab bar replaces the full-height overlay.
 */
export function SiteHeaderH9({ cluster }: { cluster: string }) {
  return (
    <>
      <header className={styles.header}>
        <div className={styles.bar}>
          <Link href="/" className={styles.wordmark}>
            <Mark className={styles.mark} />
            Stoker
            {cluster !== "mainnet" && <span className={`tag tag-accent ${styles.cluster}`}>{cluster}</span>}
          </Link>
          <NavLinksH9 />
          <div className={styles.actions}>
            <GooeySearch variant="icon" />
            <LaunchLink className={styles.launch} wordClassName={styles.launchRest} />
            <div className={styles.wallet}>
              <WalletButton />
            </div>
          </div>
        </div>
      </header>
      <div className={styles.tabs}>
        <BottomTabs />
      </div>
    </>
  );
}
