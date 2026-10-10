import Link from "next/link";
import { LAUNCH_LINK } from "@/lib/site";
import { Mark } from "./Mark";
import { NavLinks } from "./NavLinks";
import { SearchPalette } from "./SearchPalette";
import { SocialLinks } from "./SocialLinks";
import { WalletButton } from "./WalletButton";
import styles from "./SiteHeader.module.css";

/** Every page's head: the mark, the sections, and on the right what a visitor does here: search, follow, launch, connect. */
export function SiteHeader({ cluster }: { cluster: string }) {
  return (
    <header className={styles.header}>
      <div className={styles.bar}>
        <Link href="/" className={styles.wordmark}>
          {/* The same mark the PlatformConfig names on-chain, /icon.png (runbook, section 2), drawn inline. */}
          <Mark className={styles.mark} />
          Stoker
          {cluster !== "mainnet" && <span className={styles.cluster}>{cluster}</span>}
        </Link>
        <NavLinks />
        <div className={styles.actions}>
          <SearchPalette />
          <div className={styles.social}>
            <SocialLinks />
          </div>
          <Link href={LAUNCH_LINK.href} className={`button button-primary ${styles.launch}`}>
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path d="M8 2.5v11M2.5 8h11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <span className={styles.launchWord}>{LAUNCH_LINK.label}</span>
          </Link>
          <WalletButton />
        </div>
      </div>
    </header>
  );
}
