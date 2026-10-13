"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_LINKS } from "@/lib/site";
import { isCurrent } from "../NavLinks";
import styles from "./CommandHeader.module.css";

/** The sections as chips inside the field, the current one pressed; the last two give way first as the window narrows. */
export function CommandChips() {
  const pathname = usePathname();
  return (
    <nav className={styles.chips} aria-label="Main">
      {NAV_LINKS.map((l, i) => (
        <Link key={l.href} href={l.href} className={`chip ${i >= 3 ? styles.late : ""}`} aria-current={isCurrent(l.href, pathname) ? "page" : undefined}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
