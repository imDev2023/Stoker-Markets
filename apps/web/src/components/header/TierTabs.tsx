"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_LINKS, SITE_LINKS } from "@/lib/site";
import { isCurrent } from "../NavLinks";
import styles from "./TiersHeader.module.css";

/** The sections as a tab strip on the second tier, the current one raised as the segmented control raises its choice. */
export function TierTabs() {
  const pathname = usePathname();
  return (
    <nav className={styles.tabs} aria-label="Main">
      {NAV_LINKS.map((l) => (
        <Link key={l.href} href={l.href} className={styles.tab} aria-current={isCurrent(l.href, pathname) ? "page" : undefined}>
          {l.label}
        </Link>
      ))}
      <a href={SITE_LINKS.apiDocs.href} className={`${styles.tab} ${styles.api}`} target="_blank" rel="noreferrer">
        API
      </a>
    </nav>
  );
}
