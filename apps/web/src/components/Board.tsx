"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { LaunchSummary } from "@launchpad/contract";
import { listLaunches } from "@/lib/api";
import { LaunchCard } from "./LaunchCard";
import styles from "./Board.module.css";

const REFRESH_MS = 4_000;

/** `renderedAt` is the server's clock at render, so "launched Xs ago" hydrates to the same text the server sent. */
export function Board({ initial, renderedAt }: { initial: LaunchSummary[]; renderedAt: number }) {
  const [launches, setLaunches] = useState(initial);
  const [now, setNow] = useState(renderedAt);

  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      try {
        const { launches: next } = await listLaunches();
        if (!stopped) setLaunches(next);
      } catch {
        // keep showing the last good list; the next tick retries
      }
      if (!stopped) setNow(Date.now());
    };
    setNow(Date.now());
    const id = setInterval(tick, REFRESH_MS);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, []);

  return (
    <section className={`shell ${styles.section}`} aria-labelledby="board-title">
      <div className={styles.head}>
        <h2 id="board-title" className={styles.title}>New coins</h2>
        <span className={styles.live}>Updates every few seconds</span>
      </div>
      {launches.length === 0 ? (
        <div className={styles.empty}>
          <p>No coins yet. The first one could be yours.</p>
          <Link href="/launch" className={styles.cta}>Launch a coin</Link>
        </div>
      ) : (
        <ul className={styles.grid}>
          {launches.map((l) => (
            <li key={l.mint}>
              <LaunchCard launch={l} now={now} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
