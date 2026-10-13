import Link from "next/link";
import { LAUNCH_LINK } from "@/lib/site";
import { Mark } from "../Mark";
import { SearchPalette } from "../SearchPalette";
import { WalletButton } from "../WalletButton";
import { PhoneMenu } from "./PhoneMenu";
import { PillNav } from "./PillNav";
import styles from "./PillHeader.module.css";

/**
 * H4, the floating pill: the sections in a detached pill at the bar's middle, raised off a bar with no hairline, the mark
 * far left and search, the launch button and the account far right; a link's word slides up and its twin in from below on
 * hover (the Codrops inline treatment in CSS transforms). On a narrow window the pill goes and the menu button opens the
 * full-height overlay with the links set large.
 */
export function PillHeader({ cluster }: { cluster: string }) {
  return (
    <header className={styles.header}>
      <div className={styles.bar}>
        <Link href="/" className={styles.wordmark}>
          <Mark className={styles.mark} />
          Stoker
          {cluster !== "mainnet" && <span className={styles.cluster}>{cluster}</span>}
        </Link>
        <PillNav />
        <div className={styles.actions}>
          <SearchPalette variant="glyph" />
          <Link href={LAUNCH_LINK.href} className={`button button-primary ${styles.launch}`}>
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path d="M8 2.5v11M2.5 8h11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <span className={styles.launchWord}>{LAUNCH_LINK.label}</span>
          </Link>
          <div className={styles.wallet}>
            <WalletButton />
          </div>
          <PhoneMenu kind="overlay" className={styles.menu} />
        </div>
      </div>
    </header>
  );
}
