"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LIGHT_NAV_LINKS } from "@/lib/site";
import { isCurrentLink } from "./NavLinks";
import facts from "./StatusLine.module.css";
import styles from "./SiteHeader.module.css";

/**
 * The two-tier candidate's lower tier (h6, src/lib/header.ts): the sections as a strip of tabs at the left, the current
 * one underlined in the accent, and on every page past the home the status line's facts at the right, so the terminal's
 * status line is not a third band under it. On a phone the facts go and the strip scrolls sideways.
 */
export function TierTwo({ facts: rows }: { facts: [string, string][] }) {
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
      {pathname !== "/" && (
        <dl className={`${facts.facts} ${styles.tierFacts}`}>
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
