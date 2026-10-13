"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import type { LaunchSummary } from "@launchpad/contract";
import { listLaunches } from "@/lib/api";
import { formatMarketValue, SEARCH_MAX } from "@/lib/board";
import { quoteTicker } from "@/lib/format";
import { LAUNCH_LINK, NAV_LINKS } from "@/lib/site";
import { PairMark } from "./PairMark";
import styles from "./SearchPalette.module.css";

/** How long after the last keystroke the search is sent. */
const DEBOUNCE_MS = 200;
/** An open palette asks again this often, like the board: a coin launched a moment ago turns up without retyping. */
const REFRESH_MS = 4_000;
/** Enough to pick from; the board has the rest. */
const RESULTS = 8;

function SearchGlyph() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
      <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="m13 13 4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Search from any page: a button in the header (or ⌘K, Ctrl+K elsewhere) opens a palette that finds coins by name,
 * ticker or contract address through the same API search as the board, and opens the chosen coin's page. The header
 * candidates (src/lib/header.ts) place the trigger differently: `button` is the bar's field-like button, `small` the same
 * a size down, `wide` fills its row, `bare` fills a well of its own drawing, `glyph` is the icon alone at every width;
 * `pages` lists the site's sections before anything is typed (the command bar's palette).
 */
export function SearchPalette({ variant = "button", word = "Search", pages = false }: { variant?: "button" | "small" | "wide" | "bare" | "glyph"; word?: string; pages?: boolean }) {
  const router = useRouter();
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // Null until a search has answered: the palette then shows how to use it instead of "no coins match".
  const [results, setResults] = useState<LaunchSummary[] | null>(null);
  const [active, setActive] = useState(0);
  const [searching, setSearching] = useState(false);
  const [tick, setTick] = useState(0);
  // The query the shown results answer, so a refresh is told from a new search (which dims the list and resets the choice).
  const answered = useRef("");
  // Rendered as ⌘K first (the server has no idea of the keyboard), corrected once on the client.
  const [mac, setMac] = useState(true);

  useEffect(() => {
    setMac(/Mac|iPhone|iPad/.test(navigator.platform));
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // A fresh palette each time, and the page behind it stays put.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setResults(null);
    setActive(0);
    answered.current = "";
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const refresh = setInterval(() => setTick((t) => t + 1), REFRESH_MS);
    return () => {
      clearInterval(refresh);
      document.body.style.overflow = overflow;
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
    trigger.current?.focus();
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

  const optionId = (l: LaunchSummary) => `${id}-${l.mint}`;
  const activeLaunch = results?.[active];

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={`${styles.trigger} ${styles[variant]}`}
        onClick={() => setOpen(true)}
        aria-label="Search"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <SearchGlyph />
        <span className={styles.word}>{word}</span>
        <kbd className={styles.kbd}>{mac ? "⌘K" : "Ctrl K"}</kbd>
      </button>

      {/* Into the body: the header's backdrop filter makes it the containing block of anything fixed inside it, and the backdrop would cover the header's band alone. */}
      {open && createPortal(
        <div
          className={styles.backdrop}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div className={styles.panel} role="dialog" aria-modal="true" aria-label="Search coins">
            <div className={styles.field}>
              <SearchGlyph />
              <input
                role="combobox"
                aria-label="Search coins"
                aria-expanded={results !== null}
                aria-controls={`${id}-list`}
                aria-autocomplete="list"
                aria-activedescendant={activeLaunch ? optionId(activeLaunch) : undefined}
                placeholder="Name, ticker or contract address"
                value={query}
                maxLength={SEARCH_MAX}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                autoFocus
                autoComplete="off"
                spellCheck={false}
              />
              {/* A key hint where there is a keyboard, a plain cross where there is not. */}
              <button type="button" className={styles.close} onClick={close} aria-label="Close search">
                <span className={styles.closeKey}>Esc</span>
                <svg className={styles.closeCross} viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                  <path d="m3.5 3.5 9 9m0-9-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            {results === null ? (
              <>
                {pages && (
                  <nav className={styles.pages} aria-label="Go to">
                    {[NAV_LINKS[0], LAUNCH_LINK, ...NAV_LINKS.slice(1)].map((l) => (
                      <Link key={l.href} href={l.href} className={styles.page} onClick={close}>
                        {l.label}
                      </Link>
                    ))}
                  </nav>
                )}
                <p className={styles.hint}>Type a coin&rsquo;s name, ticker or contract address. Coins appear as you type.</p>
              </>
            ) : results.length === 0 ? (
              <p className={styles.hint}>No coins match &ldquo;{query.trim()}&rdquo;.</p>
            ) : (
              <ul id={`${id}-list`} className={styles.list} role="listbox" aria-label="Coins found" aria-busy={searching}>
                {results.map((l, i) => (
                  <li
                    key={l.mint}
                    id={optionId(l)}
                    role="option"
                    aria-selected={i === active}
                    className={`${styles.option} ${i === active ? styles.active : ""}`}
                    onMouseEnter={() => setActive(i)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => go(l)}
                  >
                    {l.image ? <img className={styles.image} src={l.image} alt="" width={36} height={36} /> : <span className={styles.image} aria-hidden />}
                    <span className={styles.titles}>
                      <PairMark base={l.symbol} quote={quoteTicker(l.quote)} size="sm" />
                      <span className={styles.name}>{l.name}</span>
                    </span>
                    <span className={styles.cap}>{l.market.marketCap ? formatMarketValue(l.market.marketCap, l.quote) : "-"}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className={styles.keys} aria-hidden="true">
              <span><kbd>↑</kbd><kbd>↓</kbd> move</span>
              <span><kbd>↵</kbd> open</span>
              <span><kbd>esc</kbd> close</span>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
