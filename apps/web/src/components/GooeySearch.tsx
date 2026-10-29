"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { LaunchSummary } from "@launchpad/contract";
import { listLaunches } from "@/lib/api";
import { formatMarketValue, SEARCH_MAX } from "@/lib/board";
import { quoteTicker } from "@/lib/format";
import { CoinImage } from "./CoinImage";
import { Price } from "./Price";
import { Skeleton } from "./Skeleton";
import { PairMark } from "./PairMark";
import styles from "./GooeySearch.module.css";

/** How long after the last keystroke the search is sent. */
const DEBOUNCE_MS = 200;
/** An open search asks again this often, like the board: a coin launched a moment ago turns up without retyping. */
const REFRESH_MS = 4_000;
/** Enough to pick from; the board has the rest. */
const RESULTS = 6;

function SearchGlyph() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
      <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="m13 13 4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/**
 * The header's search (owner, 2026-10-13, after Codrops' gooey search; kept 2026-10-28): a pill that reads "Search ⌘K";
 * pressed, or on ⌘K (Ctrl+K elsewhere), it stretches into a field and a disc with the glyph breaks off its right end,
 * joined to the bar as it goes by Lucas Bebber's goo (the group is blurred and its alpha pushed to hard edges, with the
 * crisp drawing laid back over it; Safari draws the filter wrong, so there the disc simply slides). The coins found
 * through the API's search (the board's, by name, ticker or contract address) open in a panel under the field, a layer
 * on surface-3 over a scrim that dims the page (#131: results never blend into the page's controls or rows). Arrows
 * move, Enter opens the coin, Escape closes and hands focus back; reduced motion gets the states without the springs.
 */
export function GooeySearch() {
  const router = useRouter();
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // Null until a search has answered, so an empty field shows nothing rather than "no coins match".
  const [results, setResults] = useState<LaunchSummary[] | null>(null);
  const [active, setActive] = useState(0);
  const [searching, setSearching] = useState(false);
  const [tick, setTick] = useState(0);
  // The query the shown results answer, so a refresh is told from a new search (which resets the choice).
  const answered = useRef("");
  // Rendered as ⌘K first (the server has no idea of the keyboard), corrected once on the client; likewise the goo.
  const [mac, setMac] = useState(true);
  const [goo, setGoo] = useState(true);

  useEffect(() => {
    setMac(/Mac|iPhone|iPad/.test(navigator.platform));
    const ua = navigator.userAgent;
    setGoo(!(/Safari/.test(ua) && !/Chrome|Chromium|Android/.test(ua)) && !/CriOS/.test(ua));
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // A fresh search each time; a press outside closes it.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setResults(null);
    setActive(0);
    answered.current = "";
    const refresh = setInterval(() => setTick((t) => t + 1), REFRESH_MS);
    const outside = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", outside);
    return () => {
      clearInterval(refresh);
      document.removeEventListener("mousedown", outside);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (!q) {
      answered.current = "";
      setResults(null);
      setSearching(false);
      return;
    }
    const changed = q !== answered.current;
    if (changed) setSearching(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const { launches } = await listLaunches({ q, sort: "market_cap", limit: RESULTS }, controller.signal);
        if (controller.signal.aborted) return;
        answered.current = q;
        setResults(launches);
        setActive((i) => (changed ? 0 : Math.max(0, Math.min(i, launches.length - 1))));
        setSearching(false);
      } catch {
        // superseded by a newer keystroke, or the API is away: the last list stays
        if (!controller.signal.aborted) setSearching(false);
      }
    }, changed ? DEBOUNCE_MS : 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, query, tick]);

  const close = useCallback(() => {
    setOpen(false);
    // The button is back in the DOM on the next paint.
    requestAnimationFrame(() => trigger.current?.focus());
  }, []);

  function go(l: LaunchSummary | undefined) {
    if (!l) return;
    setOpen(false);
    router.push(`/coin/${l.mint}`);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    const last = (results?.length ?? 0) - 1;
    if (e.key === "ArrowDown") setActive((i) => Math.min(last, i + 1));
    else if (e.key === "ArrowUp") setActive((i) => Math.max(0, i - 1));
    else if (e.key === "Enter") go(results?.[active]);
    else if (e.key === "Escape") close();
    else return;
    e.preventDefault();
  }

  const filterId = `${id}goo`;
  const optionId = (l: LaunchSummary) => `${id}-${l.mint}`;
  const activeLaunch = results?.[active];

  return (
    <div ref={root} className={`${styles.root} ${open ? styles.open : ""} ${goo ? "" : styles.plain}`} data-search-open={open || undefined}>
      <svg className={styles.defs} aria-hidden="true" focusable="false">
        <defs>
          <filter id={filterId}>
            <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur" />
            <feColorMatrix in="blur" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -15" result="goo" />
            <feComposite in="SourceGraphic" in2="goo" operator="atop" />
          </filter>
        </defs>
      </svg>
      {/* The page dims under an open search; a press on it closes the search. */}
      {open && <div className={styles.scrim} aria-hidden="true" />}
      <div className={styles.group} style={goo ? { filter: `url(#${filterId})` } : undefined}>
        <div className={styles.bar}>
          {open ? (
            <input
              className={styles.input}
              role="combobox"
              aria-label="Search coins"
              aria-expanded={results !== null}
              aria-controls={`${id}-list`}
              aria-autocomplete="list"
              aria-activedescendant={activeLaunch ? optionId(activeLaunch) : undefined}
              placeholder="Name, ticker or address"
              value={query}
              maxLength={SEARCH_MAX}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              autoFocus
              autoComplete="off"
              spellCheck={false}
            />
          ) : (
            <button ref={trigger} type="button" className={styles.trigger} onClick={() => setOpen(true)} aria-label="Search" aria-haspopup="listbox" aria-expanded={false}>
              <span className={styles.glyph}><SearchGlyph /></span>
              <span className={styles.word}>Search</span>
              <kbd className={styles.kbd}>{mac ? "⌘K" : "Ctrl K"}</kbd>
            </button>
          )}
        </div>
        {/* The disc that breaks off the bar's end: the glyph, or the ring turning while a search is out. */}
        <div className={styles.disc} aria-hidden="true">
          {searching ? <span className={styles.spinner} /> : <SearchGlyph />}
        </div>
      </div>
      {/* The results: a layer of their own, outside the goo (which would blur their text), over the scrim. */}
      {open && (results !== null || searching) && (
        <ul id={`${id}-list`} className={styles.panel} role="listbox" aria-label="Coins found" aria-busy={searching}>
          {results === null ? (
            <li className={styles.loading}>
              <Skeleton lines={3} height={44} />
            </li>
          ) : results.length === 0 ? (
            <li className={styles.empty}>
              No coins match &ldquo;{query.trim()}&rdquo;.
            </li>
          ) : (
            results.map((l, i) => (
              <li
                key={l.mint}
                id={optionId(l)}
                role="option"
                aria-selected={i === active}
                className={`${styles.result} ${i === active ? styles.active : ""}`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => go(l)}
              >
                <CoinImage src={l.image} symbol={l.symbol} size={28} />
                <span className={styles.titles}>
                  <PairMark base={l.symbol} quote={quoteTicker(l.quote)} size="md" />
                  <span className={styles.name}>{l.name}</span>
                </span>
                <span className={styles.figures}>
                  <span className={styles.price}>{l.market.price === null ? "-" : <><Price value={l.market.price} /> {quoteTicker(l.quote)}</>}</span>
                  <span className={styles.cap}>{l.market.marketCap ? `${formatMarketValue(l.market.marketCap, l.quote)} cap` : "No trades yet"}</span>
                </span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
