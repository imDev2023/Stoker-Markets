import Link from "next/link";
import type { HeaderCandidate } from "@/lib/header";
import { LAUNCH_LINK, LIGHT_NAV_LINKS } from "@/lib/site";
import { GooeySearch } from "./GooeySearch";
import { Mark } from "./Mark";
import { NavLinks } from "./NavLinks";
import { PhoneMenu } from "./PhoneMenu";
import { SchemeToggle } from "./SchemeToggle";
import { TierTwo } from "./TierTwo";
import { WalletButton } from "./WalletButton";
import styles from "./SiteHeader.module.css";

function LaunchButton({ className = "", glyphOnly = false }: { className?: string; glyphOnly?: boolean }) {
  return (
    <Link href={LAUNCH_LINK.href} className={`button button-primary ${styles.launch} ${glyphOnly ? styles.launchGlyph : ""} ${className}`}>
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <path d="M8 2.5v11M2.5 8h11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <span className={styles.launchWord}>{LAUNCH_LINK.label}</span>
    </Link>
  );
}

/**
 * Every page's head (owner, 2026-10-13, H4 on "Stoker Header"): the sections in a detached pill at the bar's middle,
 * raised off a bar with no hairline so the page's colour runs under it, the mark far left and, far right, the gooey
 * search, the light-or-dark toggle, "Stoke a coin" (the one filled action) and the account. The pill sits in the flow
 * between the wordmark and the actions, so it can never run into them; under 1200px it goes and a menu button opens
 * the full-height overlay; under 640px the search, the toggle and the launch button keep their glyphs alone.
 *
 * `candidate` draws one of the lighter headers instead (src/lib/header.ts; owner, 2026-10-25: the bar above is too
 * congested): no cluster chip, no toggle, four sections, the search a glyph until pressed; h6 adds the lower tier with
 * the sections, h7 puts the search in the pill, h8 the launch button. On a phone all four show the mark, the
 * search, the launch glyph and the menu, the account in the menu's foot.
 */
export function SiteHeader({ cluster, candidate = null }: { cluster: string; candidate?: HeaderCandidate | null }) {
  if (candidate === null) {
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
            <LaunchButton />
            <div className={styles.wallet}>
              <WalletButton />
            </div>
            <PhoneMenu className={styles.menu} />
          </div>
        </div>
      </header>
    );
  }

  const wordmark = (
    <Link href="/" className={styles.wordmark}>
      <Mark className={styles.mark} />
      Stoker
    </Link>
  );
  const wallet = (
    <div className={`${styles.wallet} ${styles.walletLight}`}>
      <WalletButton schemeToggle />
    </div>
  );
  const menu = <PhoneMenu className={styles.menu} />;

  return (
    <header className={`${styles.header} ${styles.light} ${styles[candidate]}`} data-header={candidate}>
      <div className={styles.bar}>
        {wordmark}
        {candidate === "h5" && <NavLinks links={LIGHT_NAV_LINKS} api={false} />}
        {candidate === "h7" && (
          <NavLinks links={LIGHT_NAV_LINKS} api={false} className={styles.onePill}>
            <GooeySearch compact inPill />
          </NavLinks>
        )}
        {candidate === "h8" && (
          <NavLinks links={LIGHT_NAV_LINKS} api={false} className={styles.launchPill}>
            <LaunchButton className={styles.pillLaunch} />
          </NavLinks>
        )}
        <div className={styles.actions}>
          {candidate !== "h7" && <GooeySearch compact />}
          {/* h8 keeps the launch in the pill on a wide window; under 1200px, where the pill goes, this one takes its place. */}
          <LaunchButton className={candidate === "h8" ? styles.launchPhone : ""} />
          {wallet}
          {menu}
        </div>
      </div>
      {candidate === "h6" && <TierTwo />}
    </header>
  );
}
