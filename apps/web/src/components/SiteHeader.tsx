import Link from "next/link";
import { LAUNCH_LINK } from "@/lib/site";
import { GooeySearch } from "./GooeySearch";
import { Mark } from "./Mark";
import { NavLinks } from "./NavLinks";
import { PhoneMenu } from "./PhoneMenu";
import { SchemeToggle } from "./SchemeToggle";
import { WalletButton } from "./WalletButton";
import styles from "./SiteHeader.module.css";

/**
 * Every page's head (owner, 2026-10-13, H4 on "Stoker Header"): the sections in a detached pill at the bar's middle,
 * raised off a bar with no hairline so the page's colour runs under it, the mark far left and, far right, the gooey
 * search, the light-or-dark toggle, "Stoke a coin" (the one filled action) and the account. The pill sits in the flow
 * between the wordmark and the actions, so it can never run into them; under 1300px it goes and a menu button opens
 * the full-height overlay; under 640px the search, the toggle and the launch button keep their glyphs alone.
 */
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
          <GooeySearch />
          {/* On a phone the toggle sits in the menu's foot instead: the bar has no room beside a connected wallet. */}
          <SchemeToggle className={styles.scheme} />
          <Link href={LAUNCH_LINK.href} className={`button button-primary ${styles.launch}`}>
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path d="M8 2.5v11M2.5 8h11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <span className={styles.launchWord}>{LAUNCH_LINK.label}</span>
          </Link>
          <div className={styles.wallet}>
            <WalletButton />
          </div>
          <PhoneMenu className={styles.menu} />
        </div>
      </div>
    </header>
  );
}
