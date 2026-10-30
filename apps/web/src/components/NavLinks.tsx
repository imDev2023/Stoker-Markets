"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { API_LINK, ASSETS_LINK, CURATED_LINK, EXPLORE_LINK, LAUNCH_LINK, NAV_LINKS, REWARDS_LINK, STATS_LINK, SWAP_LINK, type NavLink } from "@/lib/site";
import styles from "./SiteHeader.module.css";
import h9 from "./SiteHeaderH9.module.css";

const under = (href: string, pathname: string) => pathname === href || pathname.startsWith(`${href}/`) || (href === "/coins" && pathname.startsWith("/coin/"));

/**
 * A coin's page belongs under "Explore"; every other section is its own path and what hangs under it, and the one that
 * also covers a second page (Stats' Burns) is current there too.
 */
export const isCurrent = (link: NavLink, pathname: string) => under(link.href, pathname) || (link.also !== undefined && under(link.also, pathname));

/** The pill's and the menu's links: the sections, then the API's page last as "Developers" (owner, 2026-10-25). */
export const HEADER_LINKS: readonly NavLink[] = [...NAV_LINKS, API_LINK];

/**
 * The header's pill: the sections with the current one marked and Developers last. Each word is set twice, one in view
 * and one below it, so the hover can slide them.
 */
export function NavLinks() {
  const pathname = usePathname();
  const word = (label: string) => (
    <span className={styles.swap}>
      <span className={styles.word}>{label}</span>
      <span className={styles.under} aria-hidden="true">{label}</span>
    </span>
  );
  return (
    <nav className={styles.pill} aria-label="Main">
      {HEADER_LINKS.map((l) => (
        <Link key={l.href} href={l.href} className={styles.link} aria-current={isCurrent(l, pathname) ? "page" : undefined}>
          {word(l.label)}
        </Link>
      ))}
    </nav>
  );
}

/**
 * The one filled action, marked current on the launch page (Baymard: the current place is marked in the navigation).
 * Its words are "Stoke a coin"; a phone shows "Stoke" and keeps the rest as the button's name (`wordClassName`).
 */
export function LaunchLink({ className = "", wordClassName = "" }: { className?: string; wordClassName?: string }) {
  const pathname = usePathname();
  return (
    <Link href={LAUNCH_LINK.href} className={`button button-primary ${className}`} aria-current={pathname === LAUNCH_LINK.href ? "page" : undefined}>
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <path d="M8 2.5v11M2.5 8h11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <span>
        Stoke<span className={wordClassName}> a coin</span>
      </span>
    </Link>
  );
}

/**
 * H9's words (#133, owner 2026-10-30), ordered by a trader's frequency: Explore, Swap (a section since the same day),
 * Assets, Rewards, Stats, then Curated tagged "soon" until a Curated Launch exists (#118). Developers is the footer's.
 */
export const H9_LINKS: readonly NavLink[] = [EXPLORE_LINK, SWAP_LINK, ASSETS_LINK, REWARDS_LINK, STATS_LINK, CURATED_LINK];

/** The words in the bar, the current one marked by the ink, the weight and a bar in the accent under it. */
export function NavLinksH9() {
  const pathname = usePathname();
  return (
    <nav className={h9.nav} aria-label="Main">
      {H9_LINKS.map((l) => (
        <Link key={l.href} href={l.href} className={h9.link} aria-current={isCurrent(l, pathname) ? "page" : undefined}>
          {l.label}
          {l.href === "/curated" && <span className={`tag ${h9.soon}`}>soon</span>}
        </Link>
      ))}
    </nav>
  );
}
