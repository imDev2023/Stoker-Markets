"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { LaunchQuote, LaunchSummary } from "@launchpad/contract";
import { listLaunchQuotes, listLaunches, type BoardQuery } from "@/lib/api";
import { boardSearch, DEFAULT_BOARD, inChip, PAIRED_CHIPS, SEARCH_MAX, SORT_LABELS, SORT_ORDER, type PairedChip } from "@/lib/board";
import { LaunchCard } from "./LaunchCard";
import { QuoteFilter } from "./QuoteFilter";
import styles from "./Board.module.css";

const REFRESH_MS = 4_000;
/** How long after the last keystroke the search is sent. */
const SEARCH_DEBOUNCE_MS = 250;

const sameQuery = (a: BoardQuery, b: BoardQuery) =>
  a.sort === b.sort && a.category === b.category && a.issuer === b.issuer && a.quote === b.quote && a.q === b.q;

/**
 * The token board: every coin, searched, sorted and filtered by what it is paired with. The query lives in the page's URL,
 * so a sorted or filtered board can be shared and survives a reload. `renderedAt` is the server's clock at render, so
 * "launched Xs ago" hydrates to the same text the server sent.
 */
export function Board({
  initial, initialQuery, quotes: initialQuotes, renderedAt,
}: { initial: LaunchSummary[]; initialQuery: BoardQuery; quotes: LaunchQuote[]; renderedAt: number }) {
  const [launches, setLaunches] = useState(initial);
  const [query, setQuery] = useState(initialQuery);
  const [shown, setShown] = useState(initialQuery);
  const [quotes, setQuotes] = useState(initialQuotes);
  const [now, setNow] = useState(renderedAt);
  const [typed, setTyped] = useState(initialQuery.q);
  const latest = useRef(initialQuery);
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);

  const load = useCallback(async (q: BoardQuery) => {
    try {
      const [{ launches: next }, { quotes: inUse }] = await Promise.all([listLaunches(q), listLaunchQuotes()]);
      // A slow answer for a query the visitor has since changed is dropped.
      if (!sameQuery(q, latest.current)) return;
      setLaunches(next);
      setShown(q);
      setQuotes(inUse);
    } catch {
      // keep showing the last good list; the next tick retries
    }
    setNow(Date.now());
  }, []);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => void load(latest.current), REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  function change(next: BoardQuery) {
    latest.current = next;
    setQuery(next);
    window.history.replaceState(null, "", `${window.location.pathname}${boardSearch(next)}`);
    void load(next);
  }

  function choosePaired(chip: PairedChip) {
    const next = { ...query, category: chip.category, issuer: chip.issuer };
    const quote = quotes.find((q) => q.mint === query.quote);
    // A chosen Quote Asset outside the new chip no longer applies.
    change({ ...next, quote: quote && !inChip(quote, next) ? null : query.quote });
  }

  function search(text: string) {
    setTyped(text);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => change({ ...latest.current, q: text.trim().slice(0, SEARCH_MAX) }), SEARCH_DEBOUNCE_MS);
  }

  function reset() {
    setTyped("");
    change({ ...DEFAULT_BOARD, sort: query.sort });
  }

  const loading = !sameQuery(query, shown);
  // A sort is not a filter: with nothing launched at all, the empty state shows whatever the sort in the URL.
  const nothingLaunched = launches.length === 0 && !shown.category && !shown.issuer && !shown.quote && !shown.q;
  const chosen = PAIRED_CHIPS.find((c) => c.category === query.category && c.issuer === query.issuer) ?? PAIRED_CHIPS[0];

  return (
    <section className={`shell ${styles.section}`} aria-labelledby="board-title">
      <div className={styles.head}>
        <h2 id="board-title" className={styles.title}>Coins</h2>
        <span className={styles.live}>Updates every few seconds</span>
      </div>
      {nothingLaunched ? (
        <div className={styles.empty}>
          <p>No coins yet. The first one could be yours.</p>
          <Link href="/launch" className={styles.cta}>Launch a coin</Link>
        </div>
      ) : (
        <>
          <div className={styles.toolbar}>
            <label className={styles.search}>
              <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
                <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
                <path d="m13 13 4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              <input
                type="search"
                value={typed}
                maxLength={SEARCH_MAX}
                placeholder="Search name, ticker or contract address"
                aria-label="Search coins"
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => search(e.target.value)}
              />
            </label>
            <div className={styles.sorts} role="group" aria-label="Sort coins">
              <span className={styles.sortLabel}>Sort</span>
              {SORT_ORDER.map((s) => (
                <button key={s} type="button" aria-pressed={query.sort === s} onClick={() => change({ ...query, sort: s })}>
                  {SORT_LABELS[s]}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.filters}>
            <div className={styles.paired} role="group" aria-label="Paired with">
              <span className={styles.pairedLabel}>Paired with</span>
              {PAIRED_CHIPS.map((c) => (
                <button key={c.label} type="button" aria-pressed={c === chosen} onClick={() => choosePaired(c)}>
                  {c.label}
                </button>
              ))}
            </div>
            <QuoteFilter quotes={quotes.filter((q) => inChip(q, query))} value={query.quote} onChange={(quote) => change({ ...query, quote })} />
          </div>
          {launches.length === 0 ? (
            <div className={styles.empty} aria-busy={loading}>
              <p>{shown.q ? `No coins match "${shown.q}".` : "No coins match these filters."}</p>
              <button type="button" className={styles.reset} onClick={reset}>
                Show all coins
              </button>
            </div>
          ) : (
            <ul className={styles.grid} aria-busy={loading} aria-label="Coins">
              {launches.map((l) => (
                <li key={l.mint}>
                  <LaunchCard launch={l} now={now} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
