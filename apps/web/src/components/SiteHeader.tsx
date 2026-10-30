import Link from "next/link";
import { EXPLORE_LINK } from "@/lib/site";
import { GooeySearch } from "./GooeySearch";
import { Mark } from "./Mark";
import { LaunchLink, NavLinks } from "./NavLinks";
import { PhoneMenu } from "./PhoneMenu";
import { WalletButton } from "./WalletButton";
import styles from "./SiteHeader.module.css";

/**
 * Every page's head (owner, 2026-10-13, H4 on "Stoker Header", kept on 2026-10-28): the sections in a detached pill at
 * the bar's middle, the mark far left and, far right, the gooey search, "Stoke a coin" (the one filled action) and the
 * account. Fixed within the verdict by #131: the bar is opaque and still at 64px (52px on a phone), its edges on the
 * page column; the wallet is a ghost that becomes an avatar once connected and holds the light-or-dark toggle, the
 * Creator's page and disconnect in its menu; the launch button is marked current on its own page; the search's results
 * open in a panel over a scrim, never over the page's controls. Under 1300px the pill gives way to a menu button with
 * Explore kept visible beside it (combo navigation); under 640px the launch button reads "Stoke" and the search and the
 * account keep their glyphs alone.
 */
export function SiteHeader({ cluster }: { cluster: string }) {
  return (
    <header className={styles.header}>
      <div className={styles.bar}>
        <Link href="/" className={styles.wordmark}>
          {/* The same mark the PlatformConfig names on-chain, /icon.png (runbook, section 2), drawn inline. */}
          <Mark className={styles.mark} />
          Stoker
          {cluster !== "mainnet" && <span className={`tag tag-accent ${styles.cluster}`}>{cluster}</span>}
        </Link>
        <NavLinks />
        <div className={styles.actions}>
          {/* Visible beside the menu button once the pill has gone (NN/g: hidden navigation halves its use). */}
          <Link href={EXPLORE_LINK.href} className={styles.explore}>{EXPLORE_LINK.label}</Link>
          <GooeySearch />
          <LaunchLink className={styles.launch} wordClassName={styles.launchRest} />
          <div className={styles.wallet}>
            <WalletButton />
          </div>
          <PhoneMenu className={styles.menu} />
        </div>
      </div>
    </header>
  );
}
