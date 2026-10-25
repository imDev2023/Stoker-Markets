"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { NAV_LINKS, SITE_LINKS, type NavLink } from "@/lib/site";
import styles from "./SiteHeader.module.css";

/** A coin's page belongs under "Coins"; every other section is its own path and what hangs under it. */
export const isCurrent = (href: string, pathname: string) =>
  pathname === href || pathname.startsWith(`${href}/`) || (href === "/coins" && pathname.startsWith("/coin/"));

/** A section is current on its own path and on the one it also covers (the Treasury's Burns). */
export const isCurrentLink = (link: NavLink, pathname: string) => isCurrent(link.href, pathname) || (link.also !== undefined && isCurrent(link.also, pathname));

/**
 * The header's pill: the sections with the current one marked and the API docs last, since developers look for them
 * here too. Each word is set twice, one in view and one below it, so the hover can slide them. A candidate header gives
 * it its own sections and a last segment (the search, or the launch button) in place of the API link.
 */
export function NavLinks({ links = NAV_LINKS, api = true, className = "", children }: { links?: readonly NavLink[]; api?: boolean; className?: string; children?: ReactNode }) {
  const pathname = usePathname();
  const word = (label: string) => (
    <span className={styles.swap}>
      <span className={styles.word}>{label}</span>
      <span className={styles.under} aria-hidden="true">{label}</span>
    </span>
  );
  return (
    <nav className={`${styles.pill} ${className}`} aria-label="Main">
      {links.map((l) => (
        <Link key={l.href} href={l.href} className={styles.link} aria-current={isCurrentLink(l, pathname) ? "page" : undefined}>
          {word(l.label)}
        </Link>
      ))}
      {api && (
        <a href={SITE_LINKS.apiDocs.href} className={styles.link} target="_blank" rel="noreferrer">
          {word("API")}
        </a>
      )}
      {children}
    </nav>
  );
}
