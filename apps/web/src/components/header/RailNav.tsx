"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LAUNCH_LINK, NAV_LINKS, SITE_LINKS } from "@/lib/site";
import { isCurrent } from "../NavLinks";
import { WalletButton } from "../WalletButton";
import { ICONS } from "./NavIcons";
import styles from "./RailHeader.module.css";

/** The rail's items: what a visitor does here first, then the platform's own pages, each with its glyph. */
const EXPLORE = NAV_LINKS.slice(0, 3);
const PLATFORM = NAV_LINKS.slice(3);

type NavLink = (typeof NAV_LINKS)[number];

export function RailNav() {
  const pathname = usePathname();
  const item = (l: NavLink) => {
    const Glyph = ICONS[l.href];
    return (
      <Link key={l.href} href={l.href} className={styles.item} aria-current={isCurrent(l.href, pathname) ? "page" : undefined}>
        <Glyph />
        {l.label}
      </Link>
    );
  };
  const Api = ICONS.api;
  const Plus = ICONS["/launch"];
  return (
    <nav className={styles.nav} aria-label="Main">
      <Link href={LAUNCH_LINK.href} className={`button button-primary ${styles.stoke}`}>
        <Plus width={16} height={16} />
        {LAUNCH_LINK.label}
      </Link>
      <div className={styles.group}>{EXPLORE.map(item)}</div>
      <div className={styles.group}>
        <span className={styles.groupTitle}>Platform</span>
        {PLATFORM.map(item)}
        <a href={SITE_LINKS.apiDocs.href} className={styles.item} target="_blank" rel="noreferrer">
          <Api />
          API
        </a>
      </div>
    </nav>
  );
}

/** The narrow window's dock: Coins, Assets, the launch button raised in the middle, Rewards and the account. */
export function Dock() {
  const pathname = usePathname();
  const Plus = ICONS["/launch"];
  const item = (l: NavLink) => {
    const Glyph = ICONS[l.href];
    return (
      <Link key={l.href} href={l.href} className={styles.dockItem} aria-current={isCurrent(l.href, pathname) ? "page" : undefined}>
        <Glyph />
        <span>{l.label}</span>
      </Link>
    );
  };
  return (
    <nav className={styles.dock} aria-label="Main">
      {item(NAV_LINKS[0])}
      {item(NAV_LINKS[1])}
      <Link href={LAUNCH_LINK.href} className={styles.dockItem} aria-label={LAUNCH_LINK.label}>
        <span className={`button button-primary ${styles.dockStoke}`}>
          <Plus width={18} height={18} />
        </span>
        <span>Stoke</span>
      </Link>
      {item(NAV_LINKS[2])}
      <WalletButton variant="dock" />
    </nav>
  );
}
