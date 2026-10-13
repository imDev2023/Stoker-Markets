import Link from "next/link";
import { LAUNCH_LINK } from "@/lib/site";
import { Mark } from "../Mark";
import { SearchPalette } from "../SearchPalette";
import { SocialLinks } from "../SocialLinks";
import { WalletButton } from "../WalletButton";
import { TierTabs } from "./TierTabs";
import styles from "./TiersHeader.module.css";

/**
 * H3, two tiers: a thin top line with the mark and the wordmark on the left and the socials, search and the account on
 * the right; under it a second tier with the sections as a tab strip and the launch button (Polymarket's and Kalshi's
 * shape). In the build the second tier would carry a page's own controls too (the board's sort, a coin page's tabs); the
 * candidate shows the strip. On a narrow window the strip tightens and, where it must, scrolls sideways under the top line.
 */
export function TiersHeader({ cluster }: { cluster: string }) {
  return (
    <header className={styles.header}>
      <div className={styles.top}>
        <Link href="/" className={styles.wordmark}>
          <Mark className={styles.mark} />
          Stoker
          {cluster !== "mainnet" && <span className={styles.cluster}>{cluster}</span>}
        </Link>
        <div className={styles.actions}>
          <div className={styles.social}>
            <SocialLinks />
          </div>
          <SearchPalette variant="small" />
          <WalletButton />
        </div>
      </div>
      <div className={styles.tier}>
        <TierTabs />
        <Link href={LAUNCH_LINK.href} className={`button button-primary ${styles.launch}`}>
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path d="M8 2.5v11M2.5 8h11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span className={styles.launchWord}>{LAUNCH_LINK.label}</span>
        </Link>
      </div>
    </header>
  );
}
