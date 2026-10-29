"use client";

import { useEffect, useState } from "react";
import { SCHEME_COOKIE } from "@/lib/scheme";
import styles from "./SchemeToggle.module.css";

function Sun() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
      <circle cx="10" cy="10" r="3.6" />
      <path d="M10 2.5v1.8M10 15.7v1.8M2.5 10h1.8M15.7 10h1.8M4.7 4.7l1.3 1.3M14 14l1.3 1.3M4.7 15.3 6 14M14 6l1.3-1.3" />
    </svg>
  );
}

function Moon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16.5 12.3A6.8 6.8 0 0 1 7.7 3.5a6.8 6.8 0 1 0 8.8 8.8Z" />
    </svg>
  );
}

/**
 * Light or dark (owner, 2026-10-13): the page follows the visitor's system setting until this button is pressed, after
 * which the choice holds, as a cookie the layout reads so a page never paints the other mode first. The button shows
 * what pressing it brings: the moon in light mode, the sun in dark. `icon` is the square for the phone menu's foot;
 * `menu` is a row of the account menu (#131: a preference used once is not a top-level control), named the same.
 */
export function SchemeToggle({ className = "", variant = "icon" }: { className?: string; variant?: "icon" | "menu" }) {
  // Unknown until mounted: the server does not know the system setting, only an explicit choice.
  const [dark, setDark] = useState<boolean | null>(null);

  useEffect(() => {
    const system = matchMedia("(prefers-color-scheme: dark)");
    const read = () => {
      const explicit = document.documentElement.dataset.scheme;
      setDark(explicit ? explicit === "dark" : system.matches);
    };
    read();
    // Until a choice is made the page follows the system setting, which can change while the page is open.
    system.addEventListener("change", read);
    return () => system.removeEventListener("change", read);
  }, []);

  function flip() {
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.scheme = next;
    document.cookie = `${SCHEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    setDark(next === "dark");
  }

  const label = dark ? "Switch to light mode" : "Switch to dark mode";
  if (variant === "menu") {
    return (
      <button type="button" role="menuitem" className={`${styles.row} ${className}`} onClick={flip} aria-label={label} disabled={dark === null}>
        {dark ? <Sun /> : <Moon />}
        {dark ? "Light mode" : "Dark mode"}
      </button>
    );
  }
  return (
    <button type="button" className={`${styles.button} ${className}`} onClick={flip} aria-label={label} disabled={dark === null}>
      {dark ? <Sun /> : <Moon />}
    </button>
  );
}
