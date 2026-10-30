import Link from "next/link";
import { BottomTabs } from "./BottomTabs";
import { GooeySearch } from "./GooeySearch";
import { Mark } from "./Mark";
import { LaunchLink, NavLinks } from "./NavLinks";
import { WalletButton } from "./WalletButton";
import styles from "./SiteHeader.module.css";

/**
 * Every page's head (owner, 2026-10-30, on #133: H9's structure with H4's pill kept). The sections in a detached pill
 * at the bar's middle (H4, owner 2026-10-13: surface-3, the raised shadow, the current one on the plate), the lockup
 * far left as one mark at 24px and, far right, the search opening in place from its disc ("/" or ⌘K), "Stoke a coin"
 * as the one filled action, and the wallet as a quiet ghost that is the avatar once connected, with the light-or-dark
 * toggle, the Creator's page and disconnect in its menu. The words are H9's six, ordered by a trader's frequency
 * (Explore, Swap, Assets, Rewards, Stats, then Curated tagged "soon" until a Curated Launch exists); Developers is the
 * footer's. The bar is opaque and still at 60px (52px on a phone) with no hairline, since the pill is its edge, and its
 * edges are the page column's. The pill keeps its six words down to 768px and the rest gives way around it: under 1100px
 * the launch button and the account keep their glyphs alone and the cluster tag goes, under 900px the words sit closer
 * and the lockup is the mark alone; under 768px the pill, the launch button and the account leave the bar for the
 * bottom tab bar, whose account tab opens a sheet with the wallet, the sections the tabs leave out, the socials and the
 * toggle.
 */
export function SiteHeader({ cluster }: { cluster: string }) {
  return (
    <>
      <header className={styles.header}>
        <div className={styles.bar}>
          <Link href="/" className={styles.wordmark}>
            {/* The same mark the PlatformConfig names on-chain, /icon.png (runbook, section 2), drawn inline. */}
            <Mark className={styles.mark} />
            <span className={styles.wordmarkWord}>Stoker</span>
            {cluster !== "mainnet" && <span className={`tag tag-accent ${styles.cluster}`}>{cluster}</span>}
          </Link>
          <NavLinks />
          <div className={styles.actions}>
            <GooeySearch />
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
