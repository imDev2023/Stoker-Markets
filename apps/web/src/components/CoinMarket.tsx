"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CandleInterval, CandleList, LaunchSummary, PlatformInfo, Trade } from "@launchpad/contract";
import { getCandles, getLaunch, listTrades } from "@/lib/api";
import { quoteTicker } from "@/lib/format";
import { CurveProgress } from "./CurveProgress";
import { PriceChart } from "./PriceChart";
import { TradeHistory } from "./TradeHistory";
import { TradePanel } from "./TradePanel";
import styles from "./CoinMarket.module.css";

const REFRESH_MS = 4_000;

/** The live part of a coin page: curve progress, chart, trades and the trade panel, refreshed from the indexed trades. */
export function CoinMarket({
  initial, platform, initialTrades, initialCandles, renderedAt,
}: {
  initial: LaunchSummary;
  platform: PlatformInfo;
  initialTrades: Trade[];
  initialCandles: CandleList;
  /** The server's clock at render, so relative trade times hydrate to the same text. */
  renderedAt: number;
}) {
  const [launch, setLaunch] = useState(initial);
  const [trades, setTrades] = useState(initialTrades);
  const [candleInterval, setCandleInterval] = useState(initialCandles.interval);
  const shownInterval = useRef(initialCandles.interval);
  const [candles, setCandles] = useState(initialCandles);
  const [now, setNow] = useState(renderedAt);
  const quote = quoteTicker(launch.quote);

  // Candles for an interval the trader has since switched away from are dropped.
  const loadCandles = useCallback(async (i: CandleInterval) => {
    const c = await getCandles(launch.mint, i);
    if (c.interval === shownInterval.current) setCandles(c);
  }, [launch.mint]);

  const refresh = useCallback(async () => {
    try {
      const [l, t] = await Promise.all([getLaunch(launch.mint), listTrades(launch.mint), loadCandles(shownInterval.current)]);
      if (l) setLaunch(l);
      setTrades(t.trades);
    } catch {
      // keep showing the last good data; the next tick retries
    }
    setNow(Date.now());
  }, [launch.mint, loadCandles]);

  useEffect(() => {
    const id = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(id);
  }, [refresh]);

  function changeInterval(next: CandleInterval) {
    shownInterval.current = next;
    setCandleInterval(next);
    loadCandles(next).catch(() => undefined);
  }

  return (
    <div className={styles.market}>
      <div className={styles.main}>
        <div className={styles.chart}>
          <PriceChart data={candles} interval={candleInterval} onIntervalChange={changeInterval} price={launch.curve.price} quote={quote} />
        </div>
        <div className={styles.history}>
          <TradeHistory trades={trades} symbol={launch.symbol} quote={launch.quote} platform={platform} now={now} />
        </div>
      </div>
      <div className={styles.side}>
        <div className={styles.progress}>
          <CurveProgress launch={launch} />
        </div>
        <div className={styles.trade}>
          <TradePanel launch={launch} platform={platform} onTraded={() => void refresh()} />
        </div>
      </div>
    </div>
  );
}
