"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LIGHT_NAV_LINKS } from "@/lib/site";
import { isCurrentLink } from "./NavLinks";
import styles from "./SiteHeader.module.css";

/**
 * The two-tier candidate's lower tier (h6, src/lib/header.ts): the sections as a strip of tabs at the left, the current
 * one underlined in the accent. On a phone the strip scrolls sideways.
 */
export function TierTwo() {
  const pathname = usePathname();
  return (
    <div className={styles.tier}>
      <nav className={styles.tabs} aria-label="Main">
        {LIGHT_NAV_LINKS.map((l) => (
          <Link key={l.href} href={l.href} className={styles.tab} aria-current={isCurrentLink(l, pathname) ? "page" : undefined}>
            {l.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
