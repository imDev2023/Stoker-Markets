import type { ReactNode } from "react";
import { Ring } from "./Mark";
import styles from "./EmptyState.module.css";

/** The ring's one size in every empty state: a spot illustration is never resized to fit its box. */
const RING = 72;

/**
 * The one empty state (#131, after the research's section 10): the ring at one size, a positive title, one sentence
 * and one action, with at most a quieter second. The caller decides the state: this renders only once a fetch has
 * answered with nothing, never while loading (a skeleton) and never for an error, which `ErrorState` carries. `bare`
 * is for a panel that is a card already; otherwise it is a raised card of its own.
 */
export function EmptyState({
  title, children, action, secondary, bare = false, busy = false, className = "",
}: {
  title: string;
  /** One sentence: what will appear here and what brings it. */
  children: ReactNode;
  action?: ReactNode;
  secondary?: ReactNode;
  bare?: boolean;
  /** While a new answer is on its way the state dims rather than vanishing, so a filter change never flashes a blank. */
  busy?: boolean;
  className?: string;
}) {
  return (
    <div className={`${bare ? "" : "card card-raised"} ${styles.state} ${bare ? styles.bare : ""} ${className}`} aria-busy={busy || undefined}>
      <Ring size={RING} className={styles.ring} />
      <p className={`t-h3 ${styles.title}`}>{title}</p>
      <p className={`t-body ${styles.text}`}>{children}</p>
      {(action || secondary) && (
        <div className={styles.actions}>
          {action}
          {secondary}
        </div>
      )}
    </div>
  );
}

/**
 * The error state of a list or panel: what could not be read, in plain words, and the way to try again. The last good
 * data stays on the page where there is any (the caller keeps it); this stands where there is none yet.
 */
export function ErrorState({
  title, children, onRetry, retryLabel = "Try again", bare = false, className = "",
}: {
  title: string;
  children: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  bare?: boolean;
  className?: string;
}) {
  return (
    <div className={`${bare ? "" : "card card-raised"} ${styles.state} ${styles.error} ${bare ? styles.bare : ""} ${className}`}>
      <p className={`t-h3 ${styles.title}`}>{title}</p>
      <p className={`t-body ${styles.text}`}>{children}</p>
      {onRetry && (
        <div className={styles.actions}>
          <button type="button" className="button button-ghost" onClick={onRetry}>{retryLabel}</button>
        </div>
      )}
    </div>
  );
}
