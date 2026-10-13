"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_LINKS, SITE_LINKS } from "@/lib/site";
import styles from "./SiteHeader.module.css";

/** A coin's page belongs under "Coins"; every other section is its own path and what hangs under it. */
export const isCurrent = (href: string, pathname: string) =>
  pathname === href || pathname.startsWith(`${href}/`) || (href === "/coins" && pathname.startsWith("/coin/"));

/**
 * The header's pill: the sections with the current one marked and the API docs last, since developers look for them
 * here too. Each word is set twice, one in view and one below it, so the hover can slide them.
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
        <Link key={l.href} href={l.href} className={styles.link} aria-current={isCurrent(l.href, pathname) ? "page" : undefined}>
          {word(l.label)}
        </Link>
      ))}
      <a href={SITE_LINKS.apiDocs.href} className={styles.link} target="_blank" rel="noreferrer">
        {word("API")}
      </a>
    </nav>
  );
}
