"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { LaunchQuote, LaunchSummary } from "@launchpad/contract";
import { listLaunchQuotes, listLaunches, type BoardQuery } from "@/lib/api";
import { boardSearch, DEFAULT_BOARD, inChip, SEARCH_MAX, SORT_LABELS, SORT_ORDER, type PairedChip } from "@/lib/board";
import { AssetRail } from "./AssetRail";
import { COLUMNS, CoinRow } from "./CoinRow";
import { Ring } from "./Mark";
import styles from "./Board.module.css";

const REFRESH_MS = 4_000;
/** How long after the last keystroke the search is sent. */
const SEARCH_DEBOUNCE_MS = 250;

const sameQuery = (a: BoardQuery, b: BoardQuery) =>
  a.sort === b.sort && a.category === b.category && a.issuer === b.issuer && a.quote === b.quote && a.q === b.q;

/**
 * The token board: every coin as the pair it trades as, searched, sorted and filtered by what it is paired with, which
 * the asset rail beside it does (docs/design/layout.md: the pair is the unit). The query lives in the page's URL, so a
 * sorted or filtered board can be shared and survives a reload. The controls are there before the first coin too, so
 * a visitor to a new platform sees what the board does. `renderedAt` is the server's clock at render, so "launched Xs
 * ago" hydrates to the same text the server sent.
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

  /** A kind of Quote Asset keeps the sort and shows only coins paired with that kind; a chosen asset outside it no longer applies. */
  function chooseKind(chip: PairedChip) {
    const next = { ...query, category: chip.category, issuer: chip.issuer };
    const quote = quotes.find((q) => q.mint === query.quote);
    change({ ...next, quote: quote && !inChip(quote, next) ? null : query.quote });
  }

  /** One Quote Asset: the board narrows to that pair, whatever kind was chosen. */
  const chooseAsset = (quote: string) => change({ ...query, category: null, issuer: null, quote });

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
  // A sort is not a filter: with nothing launched at all, the invitation shows whatever the sort in the URL.
  const nothingLaunched = launches.length === 0 && !shown.category && !shown.issuer && !shown.quote && !shown.q;

  const body = nothingLaunched ? (
    <div className={`card card-raised ${styles.empty}`}>
      <Ring size={80} className={styles.ring} />
      <p>No coins yet. The first one could be yours.</p>
      <Link href="/launch" className="button button-primary">Stoke a coin</Link>
    </div>
  ) : launches.length === 0 ? (
    <div className={`card ${styles.empty}`} aria-busy={loading}>
      <p>{shown.q ? `No coins match "${shown.q}".` : "No coins match these filters."}</p>
      <button type="button" className="button button-ghost" onClick={reset}>
        Show all coins
      </button>
    </div>
  ) : (
    <div className={`card ${styles.table}`}>
      {/* The column names once, above the rows; each row names its own figures where the window is too narrow for columns. */}
      <div className={styles.columns} aria-hidden>
        {COLUMNS.map((c) => (
          <span key={c}>{c}</span>
        ))}
      </div>
      <ul className={styles.rows} aria-busy={loading} aria-label="Coins">
        {launches.map((l) => (
          <li key={l.mint}>
            <CoinRow launch={l} now={now} />
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <section className={`shell ${styles.section}`} aria-labelledby="board-title">
      <AssetRail quotes={quotes} launches={launches} query={query} onKind={chooseKind} onAsset={chooseAsset} />
      <div className={styles.main}>
        <div className={styles.head}>
          <h2 id="board-title" className={`t-h2 ${styles.title}`}>Coins</h2>
          <span className={styles.live}>Updates every few seconds</span>
        </div>
        <div className={styles.toolbar}>
          <label className={`input ${styles.search}`}>
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
          <div className={styles.sorts}>
            <span className={styles.sortLabel}>Sort</span>
            <div className="segmented" role="group" aria-label="Sort coins">
              {SORT_ORDER.map((s) => (
                <button key={s} type="button" aria-pressed={query.sort === s} onClick={() => change({ ...query, sort: s })}>
                  {SORT_LABELS[s]}
                </button>
              ))}
            </div>
          </div>
        </div>
        {body}
      </div>
    </section>
  );
}
