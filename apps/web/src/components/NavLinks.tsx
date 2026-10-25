"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { API_LINK, NAV_LINKS, type NavLink } from "@/lib/site";
import styles from "./SiteHeader.module.css";

const under = (href: string, pathname: string) => pathname === href || pathname.startsWith(`${href}/`) || (href === "/coins" && pathname.startsWith("/coin/"));

/**
 * A coin's page belongs under "Explore"; every other section is its own path and what hangs under it, and the one that
 * also covers a second page (the Ledger's Burns) is current there too.
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
