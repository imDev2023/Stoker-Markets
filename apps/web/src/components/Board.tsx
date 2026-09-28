"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { LAUNCH_SORTS, QUOTE_CATEGORIES, type LaunchQuote, type LaunchSummary, type QuoteCategory } from "@launchpad/contract";
import { listLaunchQuotes, listLaunches, type BoardQuery } from "@/lib/api";
import { boardSearch, CATEGORY_LABELS, DEFAULT_BOARD, SORT_LABELS } from "@/lib/board";
import { LaunchCard } from "./LaunchCard";
import { QuoteFilter } from "./QuoteFilter";
import styles from "./Board.module.css";

const REFRESH_MS = 4_000;

const sameQuery = (a: BoardQuery, b: BoardQuery) => a.sort === b.sort && a.category === b.category && a.quote === b.quote;

/**
 * The token board: every coin, sorted and filtered by Quote Asset. The query lives in the page's URL, so a sorted or
 * filtered board can be shared and survives a reload. `renderedAt` is the server's clock at render, so "launched Xs ago"
 * hydrates to the same text the server sent.
 */
export function Board({
  initial, initialQuery, quotes: initialQuotes, renderedAt,
}: { initial: LaunchSummary[]; initialQuery: BoardQuery; quotes: LaunchQuote[]; renderedAt: number }) {
  const [launches, setLaunches] = useState(initial);
  const [query, setQuery] = useState(initialQuery);
  const [shown, setShown] = useState(initialQuery);
  const [quotes, setQuotes] = useState(initialQuotes);
  const [now, setNow] = useState(renderedAt);
  const latest = useRef(initialQuery);

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

  function chooseCategory(category: QuoteCategory | null) {
    const quote = quotes.find((q) => q.mint === query.quote);
    // A chosen Quote Asset outside the new category no longer applies.
    change({ ...query, category, quote: quote && category && quote.category !== category ? null : query.quote });
  }

  const loading = !sameQuery(query, shown);
  // A sort is not a filter: with nothing launched at all, the empty state shows whatever the sort in the URL.
  const nothingLaunched = launches.length === 0 && !shown.category && !shown.quote;

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
            <div className={styles.sorts} role="group" aria-label="Sort coins">
              {LAUNCH_SORTS.map((s) => (
                <button key={s} type="button" aria-pressed={query.sort === s} onClick={() => change({ ...query, sort: s })}>
                  {SORT_LABELS[s]}
                </button>
              ))}
            </div>
            <div className={styles.filters}>
              <div className={styles.categories} role="group" aria-label="Quote Asset category">
                <button type="button" aria-pressed={query.category === null} onClick={() => chooseCategory(null)}>All</button>
                {QUOTE_CATEGORIES.map((c) => (
                  <button key={c} type="button" aria-pressed={query.category === c} onClick={() => chooseCategory(c)}>
                    {CATEGORY_LABELS[c]}
                  </button>
                ))}
              </div>
              <QuoteFilter
                quotes={query.category ? quotes.filter((q) => q.category === query.category) : quotes}
                value={query.quote}
                onChange={(quote) => change({ ...query, quote })}
              />
            </div>
          </div>
          {launches.length === 0 ? (
            <div className={styles.empty} aria-busy={loading}>
              <p>No coins match these filters.</p>
              <button type="button" className={styles.reset} onClick={() => change({ ...DEFAULT_BOARD, sort: query.sort })}>
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
