"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_LINKS, SITE_LINKS } from "@/lib/site";
import styles from "./SiteHeader.module.css";

/** A coin's page belongs under "Coins"; every other section is its own path and what hangs under it. */
const isCurrent = (href: string, pathname: string) =>
  href === "/" ? pathname === "/" || pathname.startsWith("/coin/") : pathname === href || pathname.startsWith(`${href}/`);

/** The header's links, the current section marked, and the API docs last since developers look for them here too. */
export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className={styles.nav} aria-label="Main">
      {NAV_LINKS.map((l) => (
        <Link key={l.href} href={l.href} className={styles.link} aria-current={isCurrent(l.href, pathname) ? "page" : undefined}>
          {l.label}
        </Link>
      ))}
      <a href={SITE_LINKS.apiDocs.href} className={styles.link} target="_blank" rel="noreferrer">API</a>
    </nav>
  );
}
