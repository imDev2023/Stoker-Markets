"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { API_LINK, NAV_LINKS } from "@/lib/site";
import styles from "./SiteHeader.module.css";

/** A coin's page belongs under "Coins"; every other section is its own path and what hangs under it. */
const isCurrent = (href: string, pathname: string) =>
  href === "/" ? pathname === "/" || pathname.startsWith("/coin/") : pathname === href || pathname.startsWith(`${href}/`);

const LINKS = [...NAV_LINKS, API_LINK];

/** The header's links, the current section marked, and the API page last since developers look for it here too. */
export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className={styles.nav} aria-label="Main">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} className={styles.link} aria-current={isCurrent(l.href, pathname) ? "page" : undefined}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
