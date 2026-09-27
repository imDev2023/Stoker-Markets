"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { LaunchQuote } from "@launchpad/contract";
import { quoteTicker, shortAddress } from "@/lib/format";
import { QuoteLogo } from "./QuoteLogo";
import styles from "./QuoteFilter.module.css";

/** The name, unless it only repeats the ticker (common for memecoins). */
const distinctName = (q: LaunchQuote) => (q.name && q.name.toLowerCase() !== q.symbol?.toLowerCase() ? q.name : null);

function search(quotes: LaunchQuote[], query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return quotes;
  return quotes.filter(
    (a) => (a.symbol ?? "").toLowerCase().includes(q) || (a.name ?? "").toLowerCase().includes(q) || a.mint.toLowerCase().startsWith(q),
  );
}

/**
 * The board's Quote Asset filter: a button showing the choice, opening a searchable list of the Quote Assets that coins
 * are paired with, most used first. `null` is every Quote Asset.
 */
export function QuoteFilter({ quotes, value, onChange }: { quotes: LaunchQuote[]; value: string | null; onChange: (mint: string | null) => void }) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const selected = value ? (quotes.find((q) => q.mint === value) ?? null) : null;
  // The first option is "every Quote Asset"; a search narrows the rest.
  const options: (LaunchQuote | null)[] = useMemo(() => [...(query.trim() ? [] : [null]), ...search(quotes, query)], [quotes, query]);
  const optionId = (q: LaunchQuote | null) => `${id}-option-${q?.mint ?? "all"}`;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const activeId = options[active] !== undefined ? optionId(options[active]) : undefined;
  useEffect(() => {
    if (open && activeId) document.getElementById(activeId)?.scrollIntoView({ block: "nearest" });
  }, [open, activeId]);

  function openList() {
    setQuery("");
    setActive(Math.max(0, value ? quotes.findIndex((q) => q.mint === value) + 1 : 0));
    setOpen(true);
  }

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }

  function choose(q: LaunchQuote | null | undefined) {
    if (q === undefined) return;
    onChange(q?.mint ?? null);
    close();
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    const last = options.length - 1;
    if (e.key === "ArrowDown") setActive((i) => Math.min(last, i + 1));
    else if (e.key === "ArrowUp") setActive((i) => Math.max(0, i - 1));
    else if (e.key === "Home") setActive(0);
    else if (e.key === "End") setActive(last);
    else if (e.key === "Enter") choose(options[active]);
    else if (e.key === "Escape") close();
    else if (e.key === "Tab") setOpen(false);
    else return;
    if (e.key !== "Tab") e.preventDefault();
  }

  return (
    <div className={styles.filter} ref={root}>
      <button
        ref={trigger}
        type="button"
        className={styles.trigger}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Quote Asset: ${selected ? quoteTicker(selected) : value ? shortAddress(value) : "all"}`}
        onClick={() => (open ? setOpen(false) : openList())}
      >
        {selected ? <QuoteLogo quote={selected} size={22} /> : <span className={styles.allMark} aria-hidden />}
        <span className={styles.value}>{selected ? quoteTicker(selected) : value ? shortAddress(value) : "All Quote Assets"}</span>
        <span className={styles.chevron} aria-hidden />
      </button>

      {open && (
        <div className={styles.popover}>
          <input
            className={styles.search}
            role="combobox"
            aria-expanded
            aria-controls={`${id}-list`}
            aria-autocomplete="list"
            aria-activedescendant={activeId}
            aria-label="Search Quote Assets"
            placeholder="Search by name, ticker or mint"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            autoFocus
            spellCheck={false}
            autoComplete="off"
          />
          <ul className={styles.list} id={`${id}-list`} role="listbox" aria-label="Quote Assets">
            {options.map((q, i) => (
              <li
                key={q?.mint ?? "all"}
                id={optionId(q)}
                role="option"
                aria-selected={(q?.mint ?? null) === value}
                className={`${styles.option} ${i === active ? styles.active : ""}`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(q)}
              >
                {q ? <QuoteLogo quote={q} size={26} /> : <span className={styles.allMark} aria-hidden />}
                <span className={styles.optionTitle}>
                  <span className={styles.ticker}>{q ? quoteTicker(q) : "All Quote Assets"}</span>
                  {q && distinctName(q) && <span className={styles.name}>{distinctName(q)}</span>}
                </span>
                {q && <span className={styles.count}>{q.launches === 1 ? "1 coin" : `${q.launches} coins`}</span>}
              </li>
            ))}
          </ul>
          {options.length === 0 && <p className={styles.note}>No coin is paired with a Quote Asset matching &ldquo;{query.trim()}&rdquo;.</p>}
        </div>
      )}
    </div>
  );
}
