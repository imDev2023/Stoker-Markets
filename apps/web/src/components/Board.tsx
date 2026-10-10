"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { LaunchQuote, LaunchSummary } from "@launchpad/contract";
import { listLaunchQuotes, listLaunches, type BoardQuery } from "@/lib/api";
import { boardSearch, DEFAULT_BOARD, inChip, PAIRED_CHIPS, SEARCH_MAX, SORT_LABELS, SORT_ORDER, type PairedChip } from "@/lib/board";
import { COIN_COLUMNS, CoinRow, PAIR_COLUMNS } from "./CoinRow";
import { Ring } from "./Mark";
import { QuoteFilter } from "./QuoteFilter";
import { AssetRail, AssetStrip, assetGroups, compactUsd } from "./AssetRail";
import { QuoteLogo } from "./QuoteLogo";
import type { BoardLayout } from "@/lib/layout";
import { quoteTicker } from "@/lib/format";
import { quoteKind } from "@/lib/landing";
import styles from "./Board.module.css";

const REFRESH_MS = 4_000;
/** How long after the last keystroke the search is sent. */
const SEARCH_DEBOUNCE_MS = 250;

const sameQuery = (a: BoardQuery, b: BoardQuery) =>
  a.sort === b.sort && a.category === b.category && a.issuer === b.issuer && a.quote === b.quote && a.q === b.q;

/**
 * The token board: every coin, searched, sorted and filtered by what it is paired with. The query lives in the page's URL,
 * so a sorted or filtered board can be shared and survives a reload. The controls are there before the first coin too, so
 * a visitor to a new platform sees what the board does. `renderedAt` is the server's clock at render, so "launched Xs ago"
 * hydrates to the same text the server sent.
 */
export function Board({
  initial, initialQuery, quotes: initialQuotes, renderedAt, layout = null,
}: { initial: LaunchSummary[]; initialQuery: BoardQuery; quotes: LaunchQuote[]; renderedAt: number; layout?: BoardLayout | null }) {
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
    const search = boardSearch(next);
    // A layout candidate stays in the URL through every change of query.
    const withLayout = layout ? `${search}${search ? "&" : "?"}layout=${layout}` : search;
    window.history.replaceState(null, "", `${window.location.pathname}${withLayout}`);
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
  // A sort is not a filter: with nothing launched at all, the invitation shows whatever the sort in the URL.
  const nothingLaunched = launches.length === 0 && !shown.category && !shown.issuer && !shown.quote && !shown.q;
  const chosen = PAIRED_CHIPS.find((c) => c.category === query.category && c.issuer === query.issuer) ?? PAIRED_CHIPS[0];
  const pair = layout !== null;
  const columns = pair ? PAIR_COLUMNS : COIN_COLUMNS;
  // B2 groups the rows under their Quote Asset, the busiest asset first.
  const bands = layout === "b2"
    ? assetGroups(quotes, launches).flatMap((g) => g.assets).map((a) => ({ ...a, rows: launches.filter((l) => l.quote.mint === a.quote.mint) })).filter((a) => a.rows.length > 0)
    : null;
  const chooseAsset = (quote: string | null) => change({ ...query, category: null, issuer: null, quote });

  const table = (
    <div className={`card ${styles.table} ${pair ? styles.pairTable : ""}`}>
      {/* The column names once, above the rows; each row names its own figures where the window is too narrow for columns. */}
      <div className={styles.columns} aria-hidden>
        {columns.map((c) => (
          <span key={c}>{c}</span>
        ))}
      </div>
      {bands ? (
        bands.map(({ quote, volumeUsd, rows }) => (
          <div key={quote.mint} className={styles.band}>
            <button type="button" className={styles.bandHead} aria-pressed={query.quote === quote.mint} onClick={() => chooseAsset(query.quote === quote.mint ? null : quote.mint)}>
              <QuoteLogo quote={quote} size={20} />
              <span className={styles.bandTicker}>{quoteTicker(quote)}</span>
              <span className={styles.bandKind}>{quoteKind(quote)}</span>
              <span className={styles.bandFigures}>
                <span>{rows.length} {rows.length === 1 ? "coin" : "coins"}</span>
                <span>{compactUsd(volumeUsd)} 24h</span>
              </span>
            </button>
            <ul className={styles.rows} aria-busy={loading} aria-label={`Coins paired with ${quoteTicker(quote)}`}>
              {rows.map((l) => (
                <li key={l.mint}>
                  <CoinRow launch={l} now={now} pair />
                </li>
              ))}
            </ul>
          </div>
        ))
      ) : (
        <ul className={styles.rows} aria-busy={loading} aria-label="Coins">
          {launches.map((l) => (
            <li key={l.mint}>
              <CoinRow launch={l} now={now} pair={pair} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );

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
  ) : table;

  return (
    <section className={`shell ${styles.section} ${layout === "b1" ? styles.withRail : ""}`} aria-labelledby="board-title">
      {layout === "b1" && <AssetRail quotes={quotes} launches={launches} value={query.quote} onChange={chooseAsset} />}
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
      {/* B1's rail and B3's strip are the "paired with" control; B2 keeps the chips and drops the dropdown, since a band is the filter. */}
      {layout !== "b1" && (
        <div className={styles.filters}>
          {layout !== "b3" && (
            <div className={styles.paired} role="group" aria-label="Paired with">
              <span className={styles.pairedLabel}>Paired with</span>
              {PAIRED_CHIPS.map((c) => (
                <button key={c.label} type="button" className="chip" aria-pressed={c === chosen} onClick={() => choosePaired(c)}>
                  {c.label}
                </button>
              ))}
            </div>
          )}
          {layout === null && (
            <QuoteFilter quotes={quotes.filter((q) => inChip(q, query))} value={query.quote} onChange={(quote) => change({ ...query, quote })} />
          )}
        </div>
      )}
      {layout === "b3" && <AssetStrip quotes={quotes} launches={launches} value={query.quote} onChange={chooseAsset} />}
      {body}
      </div>
    </section>
  );
}
