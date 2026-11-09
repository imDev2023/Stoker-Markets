"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { LaunchQuote, LaunchSummary } from "@launchpad/contract";
import { listLaunchQuotes, listLaunches, type BoardQuery } from "@/lib/api";
import {
  BOARD_VIEW_COOKIE, BOARD_VIEWS, boardViewSearch, DEFAULT_BOARD, inChip, SEARCH_MAX, SORT_FACTS, SORT_LABELS, SORT_ORDER, VIEW_LABELS,
  type BoardView, type PairedChip,
} from "@/lib/board";
import { timeAgo } from "@/lib/format";
import { SEARCH_HASH } from "@/lib/search";
import { AssetBar } from "./AssetBar";
import type { ExplorerCluster } from "./CoinActions";
import { CoinGrid } from "./CoinGrid";
import { CoinTable } from "./CoinTable";
import { EmptyState } from "./EmptyState";
import styles from "./Board.module.css";

const REFRESH_MS = 4_000;
/** How long after the last keystroke the search is sent. */
const SEARCH_DEBOUNCE_MS = 250;
/** How long the feed may go without an answer before the status line says it has paused. */
const PAUSED_AFTER_MS = 15_000;

/** What a list asks the API for in a view: the cards draw each coin's day as a line, which the table leaves out. */
const fieldsFor = (view: BoardView) => (view === "cards" ? (["sparkline"] as const) : []);

const sameQuery = (a: BoardQuery, b: BoardQuery) =>
  a.sort === b.sort && a.category === b.category && a.issuer === b.issuer && a.quote === b.quote && a.q === b.q;

/**
 * The token board: every coin as the pair it trades as, searched, sorted and filtered by what it is paired with, which
 * the asset bar above the table does (owner, 2026-10-31, a sliding row after Pump.fun's; a rail beside the board from
 * the layout pick of 2026-10-11 until then; docs/design/layout.md: the pair is the unit). The query lives in the page's URL, so a
 * sorted or filtered board can be shared and survives a reload. The controls are there before the first coin too, so
 * a visitor to a new platform sees what the board does. `renderedAt` is the server's clock at render, so "launched Xs
 * ago" hydrates to the same text the server sent. The status line names the list as the fact it is and says when it
 * last updated, and says so when the feed has stopped answering (#135). The list shows as the table or as cards (#161),
 * by the toggle beside the sorts; the choice is the visitor's cookie and the address's `?view=` (src/lib/board.ts).
 */
export function Board({
  initial, initialMore, initialQuery, initialView, platform, quotes: initialQuotes, renderedAt,
}: {
  initial: LaunchSummary[];
  initialMore: boolean;
  initialQuery: BoardQuery;
  initialView: BoardView;
  /** Where the rows' and cards' explorer links point. */
  platform: ExplorerCluster;
  quotes: LaunchQuote[];
  renderedAt: number;
}) {
  const [launches, setLaunches] = useState(initial);
  const [more, setMore] = useState(initialMore);
  const [query, setQuery] = useState(initialQuery);
  const [shown, setShown] = useState(initialQuery);
  const [quotes, setQuotes] = useState(initialQuotes);
  const [now, setNow] = useState(renderedAt);
  // The clock behind the status line's "updated 4s ago" and the last answer that counted; separate from `now`, which
  // the rows read, so a tick never re-renders the table.
  const [tick, setTick] = useState(renderedAt);
  const [updatedAt, setUpdatedAt] = useState(renderedAt);
  const [typed, setTyped] = useState(initialQuery.q);
  const [view, setView] = useState(initialView);
  const latest = useRef(initialQuery);
  const viewRef = useRef(initialView);
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);
  const field = useRef<HTMLInputElement>(null);

  // Sent here by "/" or ⌘K from another page (SearchShortcut): the field takes focus and the hash goes.
  useEffect(() => {
    if (window.location.hash !== SEARCH_HASH) return;
    field.current?.focus();
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  }, []);

  // The view came from the visitor's cookie when the address named none: the address says it too, so a link copied
  // from here opens in the same shape. A passive effect runs a moment after hydration, and a click on the toggle can
  // land in that moment (the suite's board flow did, now and then): it reads the view the visitor holds now, never the
  // one the page was born with, so it never writes back a view the click has just left.
  useEffect(() => {
    if (initialView === "cards" && viewRef.current === "cards" && !new URLSearchParams(window.location.search).has("view")) {
      window.history.replaceState(null, "", `${window.location.pathname}${boardViewSearch(latest.current, "cards")}${window.location.hash}`);
    }
  }, [initialView]);

  const load = useCallback(async (q: BoardQuery) => {
    try {
      const asked = viewRef.current;
      const [{ launches: next, nextOffset }, { quotes: inUse }] = await Promise.all([listLaunches({ ...q, fields: [...fieldsFor(asked)] }), listLaunchQuotes()]);
      // A slow answer for a query the visitor has since changed is dropped, and one without the lines the cards now want.
      if (!sameQuery(q, latest.current) || (asked !== viewRef.current && viewRef.current === "cards")) return;
      setLaunches(next);
      setMore(nextOffset !== null);
      setShown(q);
      setQuotes(inUse);
      setUpdatedAt(Date.now());
    } catch {
      // keep showing the last good list; the next tick retries, and the status line says how old the list is
    }
    setNow(Date.now());
  }, []);

  useEffect(() => {
    setNow(Date.now());
    setTick(Date.now());
    setUpdatedAt(Date.now());
    const id = setInterval(() => void load(latest.current), REFRESH_MS);
    const clock = setInterval(() => setTick(Date.now()), 1_000);
    return () => {
      clearInterval(id);
      clearInterval(clock);
    };
  }, [load]);

  function change(next: BoardQuery) {
    latest.current = next;
    setQuery(next);
    window.history.replaceState(null, "", `${window.location.pathname}${boardViewSearch(next, viewRef.current)}`);
    void load(next);
  }

  /** The other shape: remembered for this browser, said in the address, and the cards' lines fetched with the next list. */
  function chooseView(next: BoardView) {
    if (next === viewRef.current) return;
    viewRef.current = next;
    setView(next);
    document.cookie = `${BOARD_VIEW_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    window.history.replaceState(null, "", `${window.location.pathname}${boardViewSearch(latest.current, next)}`);
    if (next === "cards" && launches.some((l) => l.sparkline === undefined)) void load(latest.current);
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
  const paused = tick - updatedAt > PAUSED_AFTER_MS;
  const count = launches.length;
  // "60 coins by market cap", "The first 60 coins by 24h volume" when more wait past the page, "No coins yet" before any.
  const fact = count === 0 ? "No coins yet" : `${more ? `The first ${count}` : count} ${count === 1 ? "coin" : "coins"} ${SORT_FACTS[shown.sort]}`;

  const body = nothingLaunched ? (
    <EmptyState title="Be the first to stoke a coin" action={<Link href="/launch" className="button button-primary">Stoke a coin</Link>}>
      Nothing has launched yet. Pair a coin with any asset Raydium quotes and open the board.
    </EmptyState>
  ) : launches.length === 0 ? (
    <EmptyState
      title="Nothing matches"
      busy={loading}
      action={<button type="button" className="button button-ghost" onClick={reset}>Show all coins</button>}
    >
      {shown.q ? `No coins match "${shown.q}".` : "No coins match these filters."}
    </EmptyState>
  ) : view === "cards" ? (
    <CoinGrid launches={launches} now={now} platform={platform} busy={loading} />
  ) : (
    <CoinTable launches={launches} now={now} platform={platform} busy={loading} />
  );

  return (
    <section className={`shell grid ${styles.section}`} aria-labelledby="board-title">
      <div className={`col-12 ${styles.main}`}>
        <div className={styles.head}>
          <h2 id="board-title" className={`t-h2 ${styles.title}`}>Coins</h2>
          {/* The list named as the fact it is, and how fresh: the feed polls every few seconds, and says so when it stops. */}
          <p className={`${styles.status} ${paused ? styles.paused : ""}`} role="status" data-updated>
            {paused ? (
              <>Feed paused, last update <time dateTime={new Date(updatedAt).toISOString()}>{timeAgo(new Date(updatedAt).toISOString(), tick)}</time>. Retrying.</>
            ) : (
              <>{fact}, updated <time dateTime={new Date(updatedAt).toISOString()}>{timeAgo(new Date(updatedAt).toISOString(), tick)}</time></>
            )}
          </p>
        </div>
        <div className={styles.toolbar}>
          <label className={`input ${styles.search}`}>
            <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
              <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <path d="m13 13 4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <input
              ref={field}
              data-site-search=""
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
            <span className={`${styles.sortLabel} ${styles.viewLabel}`}>View</span>
            <div className="segmented" role="group" aria-label="View coins as">
              {BOARD_VIEWS.map((v) => (
                <button key={v} type="button" aria-pressed={view === v} onClick={() => chooseView(v)}>
                  {VIEW_LABELS[v]}
                </button>
              ))}
            </div>
          </div>
        </div>
        <AssetBar quotes={quotes} query={query} onKind={chooseKind} onAsset={chooseAsset} />
        {body}
      </div>
    </section>
  );
}
