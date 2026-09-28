"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CandleInterval, CandleList, HolderList, LaunchSummary, PlatformInfo, Trade } from "@launchpad/contract";
import { getCandles, getHolders, getLaunch, listTrades } from "@/lib/api";
import { quoteTicker } from "@/lib/format";
import { CurveProgress } from "./CurveProgress";
import { Holders } from "./Holders";
import { PriceChart } from "./PriceChart";
import { TradeHistory } from "./TradeHistory";
import { TradePanel } from "./TradePanel";
import styles from "./CoinMarket.module.css";

const REFRESH_MS = 4_000;
/** Holders are read from the chain on every request, so they refresh less often, and right after the visitor trades. */
const HOLDERS_REFRESH_MS = 12_000;

/**
 * The live part of a coin page: curve progress, chart, trades, the trade panel and top holders, kept up to date from the
 * indexed trades and the chain. After Graduation the same page trades in the coin's Raydium pool.
 */
export function CoinMarket({
  initial, platform, initialTrades, initialCandles, initialHolders, renderedAt, referrer = null,
}: {
  initial: LaunchSummary;
  platform: PlatformInfo;
  /** From the page's `?ref=` link: the wallet that earns the referral share fee on the visitor's curve trades. */
  referrer?: string | null;
  initialTrades: Trade[];
  initialCandles: CandleList;
  /** Null when the chain couldn't be read at render; the card retries. */
  initialHolders: HolderList | null;
  /** The server's clock at render, so relative trade times hydrate to the same text. */
  renderedAt: number;
}) {
  const [launch, setLaunch] = useState(initial);
  const [trades, setTrades] = useState(initialTrades);
  const [candleInterval, setCandleInterval] = useState(initialCandles.interval);
  const shownInterval = useRef(initialCandles.interval);
  const [candles, setCandles] = useState(initialCandles);
  const [holders, setHolders] = useState(initialHolders);
  const [now, setNow] = useState(renderedAt);
  const quote = quoteTicker(launch.quote);
  // The latest trade's price on the curve or, after Graduation, in the pool; before any trade, the curve's starting price.
  const price = launch.market.price;

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

  const refreshHolders = useCallback(async () => {
    try {
      setHolders(await getHolders(launch.mint));
    } catch {
      // keep showing the last good holders; the next tick retries
    }
  }, [launch.mint]);

  useEffect(() => {
    const id = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    const id = setInterval(refreshHolders, HOLDERS_REFRESH_MS);
    return () => clearInterval(id);
  }, [refreshHolders]);

  function changeInterval(next: CandleInterval) {
    shownInterval.current = next;
    setCandleInterval(next);
    loadCandles(next).catch(() => undefined);
  }

  return (
    <div className={styles.market}>
      <div className={styles.main}>
        <div className={styles.chart}>
          <PriceChart data={candles} interval={candleInterval} onIntervalChange={changeInterval} price={price} quote={quote} />
        </div>
        <div className={styles.history}>
          <TradeHistory trades={trades} symbol={launch.symbol} quote={launch.quote} platform={platform} now={now} graduation={launch.graduation} />
        </div>
      </div>
      <div className={styles.side}>
        <div className={styles.progress}>
          <CurveProgress launch={launch} platform={platform} />
        </div>
        <div className={styles.trade}>
          <TradePanel launch={launch} platform={platform} referrer={referrer} onTraded={() => void Promise.all([refresh(), refreshHolders()])} />
        </div>
        <div className={styles.holders}>
          <Holders holders={holders} platform={platform} />
        </div>
      </div>
    </div>
  );
}
