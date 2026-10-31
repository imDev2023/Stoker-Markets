"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { CandleInterval, CandleList, HolderList, LaunchSummary, LaunchTrust, PlatformInfo, Trade } from "@launchpad/contract";
import { getCandles, getHolders, getLaunch, getTrust, listTrades } from "@/lib/api";
import { quoteTicker } from "@/lib/format";
import { CurveProgress } from "./CurveProgress";
import { Holders } from "./Holders";
import { PriceChart } from "./PriceChart";
import { TradeHistory } from "./TradeHistory";
import { TradePanel } from "./TradePanel";
import { TrustCard } from "./TrustCard";
import styles from "./CoinMarket.module.css";

const REFRESH_MS = 4_000;
/** Holders are read from the chain on every request, so they and the trust figures refresh less often, and right after the visitor trades. */
const HOLDERS_REFRESH_MS = 12_000;

/**
 * The live part of a coin page (docs/design/layout.md, the pair rail): the chart on the left with the trades and the
 * holders as tabs under it; on the right the pair's other half (the Quote Asset's card the page renders), the curve's
 * progress and the trade panel, kept up to date from the indexed trades and the chain. After Graduation the same page
 * trades in the coin's Raydium pool. The trust figures (#41) sit under the trade panel, where the buyer decides.
 */
export function CoinMarket({
  initial, platform, initialTrades, initialCandles, initialHolders, initialTrust, renderedAt, referrer = null, aside = null,
}: {
  initial: LaunchSummary;
  platform: PlatformInfo;
  /** The Quote Asset's card, first in the fixed column. */
  aside?: ReactNode;
  /** From the page's `?ref=` link: the wallet that earns the referral share fee on the visitor's curve trades. */
  referrer?: string | null;
  initialTrades: Trade[];
  initialCandles: CandleList;
  /** Null when the chain couldn't be read at render; the card retries. */
  initialHolders: HolderList | null;
  /** Null when the API couldn't answer at render; the card retries. */
  initialTrust: LaunchTrust | null;
  /** The server's clock at render, so relative trade times hydrate to the same text. */
  renderedAt: number;
}) {
  const [launch, setLaunch] = useState(initial);
  const [trades, setTrades] = useState(initialTrades);
  const [candleInterval, setCandleInterval] = useState(initialCandles.interval);
  const shownInterval = useRef(initialCandles.interval);
  const [candles, setCandles] = useState(initialCandles);
  const [holders, setHolders] = useState(initialHolders);
  const [trust, setTrust] = useState(initialTrust);
  const [now, setNow] = useState(renderedAt);
  const [tab, setTab] = useState<"trades" | "holders">("trades");
  const quote = quoteTicker(launch.quote);
  const snipers = new Set(trust?.snipers.wallets.map((w) => w.wallet));
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
    const [h, t] = await Promise.allSettled([getHolders(launch.mint), getTrust(launch.mint)]);
    // Keep showing the last good holders and figures; the next tick retries whichever failed.
    if (h.status === "fulfilled") setHolders(h.value);
    if (t.status === "fulfilled") setTrust(t.value);
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
    <div className={`grid ${styles.market}`}>
      <div className={`col-8 ${styles.main}`}>
        <div className={styles.chart}>
          <PriceChart data={candles} interval={candleInterval} onIntervalChange={changeInterval} price={price} quote={quote} />
        </div>
        {/* The tab is the panel's title: each panel keeps its heading for its region's name, unseen. */}
        <div className={`card ${styles.tabs}`}>
          <div className={styles.tabBar} role="tablist" aria-label="Activity">
            <button type="button" role="tab" aria-selected={tab === "trades"} onClick={() => setTab("trades")}>Trades</button>
            <button type="button" role="tab" aria-selected={tab === "holders"} onClick={() => setTab("holders")}>Top holders</button>
          </div>
          <div className={styles.tabPanel} role="tabpanel">
            {tab === "trades" ? (
              <TradeHistory trades={trades} symbol={launch.symbol} quote={launch.quote} platform={platform} now={now} graduation={launch.graduation} headingHidden />
            ) : (
              <Holders holders={holders} platform={platform} onRetry={() => void refreshHolders()} snipers={snipers} marketCapUsd={launch.market.marketCap?.usd ?? null} headingHidden />
            )}
          </div>
        </div>
      </div>
      <div className={`col-4 ${styles.side}`}>
        <div className={styles.aside}>{aside}</div>
        <div className={styles.progress}>
          <CurveProgress launch={launch} platform={platform} />
        </div>
        <div className={styles.trade}>
          <TradePanel launch={launch} platform={platform} referrer={referrer} onTraded={() => void Promise.all([refresh(), refreshHolders()])} />
        </div>
        <div className={styles.trust}>
          <TrustCard trust={trust} holders={holders} />
        </div>
      </div>
    </div>
  );
}
