import { SEARCH_MAX } from "@/lib/board";
import styles from "./LandingSearch.module.css";

/**
 * The landing's search field, under the hero's actions (owner, 2026-10-31, B on "Stoker Search" over none and a field
 * in Trending's head): a plain form that opens the board with the query, so it works before the page's script and the
 * board does the finding. The field primitive with the glyph as its hint, as the board's own.
 */
export function LandingSearch({ className }: { className?: string }) {
  return (
    <form role="search" action="/coins" method="get" className={`${styles.form} ${className ?? ""}`}>
      <label className={`input ${styles.field}`}>
        <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
          <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="m13 13 4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <input
          type="search"
          name="q"
          maxLength={SEARCH_MAX}
          placeholder="Search name, ticker or contract address"
          aria-label="Search coins"
          autoComplete="off"
          spellCheck={false}
        />
      </label>
    </form>
  );
}
