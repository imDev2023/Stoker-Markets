"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CURATED_LINK, LAUNCH_LINK, NAV_LINKS, type NavLink } from "@/lib/site";
import styles from "./SiteHeader.module.css";

const under = (href: string, pathname: string) => pathname === href || pathname.startsWith(`${href}/`) || (href === "/coins" && pathname.startsWith("/coin/"));

/**
 * A coin's page belongs under "Explore"; every other section is its own path and what hangs under it, and the one that
 * also covers a second page (Stats' Burns) is current there too.
 */
export const isCurrent = (link: NavLink, pathname: string) => under(link.href, pathname) || (link.also !== undefined && under(link.also, pathname));

/**
 * The header's pill: the sections in the order a trader reaches for them, the current one marked on the plate, and
 * Curated tagged "soon" until a Curated Launch exists (#118). Developers is the footer's (owner, 2026-10-30). Each word
 * is set twice, one in view and one below it, so the hover can slide them.
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
      {NAV_LINKS.map((l) => (
        <Link key={l.href} href={l.href} className={styles.link} aria-current={isCurrent(l, pathname) ? "page" : undefined}>
          {word(l.label)}
          {l.href === CURATED_LINK.href && <span className={`tag ${styles.soon}`}>soon</span>}
        </Link>
      ))}
    </nav>
  );
}

/**
 * The one filled action, marked current on the launch page (Baymard: the current place is marked in the navigation).
 * Its words are "Stoke a coin"; a narrow window shows "Stoke" and keeps the rest as the button's name (`wordClassName`).
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
