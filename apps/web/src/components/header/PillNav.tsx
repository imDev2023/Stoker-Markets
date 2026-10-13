"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_LINKS, SITE_LINKS } from "@/lib/site";
import { isCurrent } from "../NavLinks";
import styles from "./PillHeader.module.css";

/** The pill: each link's word twice, one in view and one below it, so the hover can slide them. */
export function PillNav() {
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
