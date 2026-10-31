"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { CandleInterval, CandleList, HolderList, LaunchSummary, LaunchTrust, PlatformInfo, QuoteAsset, Trade, TradeSide } from "@launchpad/contract";
import { getCandles, getHolders, getLaunch, getTrust, listTrades } from "@/lib/api";
import { quoteTicker } from "@/lib/format";
import { Change } from "./Change";
import { CurveProgress } from "./CurveProgress";
import { Holders } from "./Holders";
import { PairLockup, QuoteCard } from "./PairCards";
import { PairMark } from "./PairMark";
import { Price } from "./Price";
import { PriceChart } from "./PriceChart";
import { TradeHistory } from "./TradeHistory";
import { TradePanel } from "./TradePanel";
import { TrustCard, TrustMarks } from "./TrustCard";
import styles from "./CoinMarket.module.css";

const REFRESH_MS = 4_000;

/** A link the title row shows after the coin's name: its label, where it goes, and whether it leaves for a site the Creator named. */
export type CoinLink = { label: string; href: string; external: boolean };

/** The title row's left side: the lockup at 40px, the pair at the title size, the name with the coin's links after it. */
function Title({ launch, quote, links }: { launch: LaunchSummary; quote: string; links: CoinLink[] }) {
  return (
    <div className={styles.title}>
      <PairLockup launch={launch} size={40} />
      <div className={styles.words}>
        <h1 className={styles.pair}>
          <PairMark base={launch.symbol} quote={quote} size="lg" />
        </h1>
        <p className={styles.name}>
          <span className={styles.coinName}>{launch.name}</span>
          {links.map((l) => (
            // The dot between the links is its own element: generated content on the link would join its accessible name.
            <span key={l.label} className={styles.link}>
              <span aria-hidden>·</span>
              <a href={l.href} target="_blank" rel={l.external ? "noreferrer nofollow" : "noreferrer"}>{l.label}</a>
            </span>
          ))}
        </p>
      </div>
    </div>
  );
}
/** Holders are read from the chain on every request, so they and the trust figures refresh less often, and right after the visitor trades. */
const HOLDERS_REFRESH_MS = 12_000;

/**
 * The live part of a coin page (#134, phase 3 of the rework): the title row with the price, the day's change and the
 * three trust marks (which open the "Before you buy" card), then the chart in eight columns with the graduation bar and
 * the trades and holders as tabs under it, and the trade panel docked in the other four with the pair's other half under
 * it, all kept up to date from the indexed trades and the chain. After Graduation the same page trades in the coin's
 * Raydium pool. On a phone the columns stack and a Buy / Sell bar at the foot brings the trade panel up.
 */
export function CoinMarket({
  initial, platform, quoteAsset, links, initialTrades, initialCandles, initialHolders, initialTrust, renderedAt, referrer = null, notice = null,
}: {
  initial: LaunchSummary;
  platform: PlatformInfo;
  /** The pair's other half, for its card under the trade panel; null when the registry could not be read. */
  quoteAsset: QuoteAsset | null;
  /** The coin's own links and the explorer, after its name in the title row. */
  links: CoinLink[];
  /** Something the page puts between the title row and the market: an Airdrop its Creator still has to send. */
  notice?: ReactNode;
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
  const [trustOpen, setTrustOpen] = useState(false);
  const [sideRequest, setSideRequest] = useState<{ side: TradeSide; seq: number } | null>(null);
  const trustBox = useRef<HTMLDivElement>(null);
  const tradeBox = useRef<HTMLDivElement>(null);
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

  // The trust card closes as a menu does: on Escape, or a press anywhere outside it and its marks.
  useEffect(() => {
    if (!trustOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setTrustOpen(false);
    const onPress = (e: PointerEvent) => {
      if (!trustBox.current?.contains(e.target as Node)) setTrustOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPress);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPress);
    };
  }, [trustOpen]);

  function changeInterval(next: CandleInterval) {
    shownInterval.current = next;
    setCandleInterval(next);
    loadCandles(next).catch(() => undefined);
  }

  /** The phone's bar: the panel takes the side and scrolls into view under the header. */
  function goTrade(side: TradeSide) {
    setSideRequest({ side, seq: Date.now() });
    tradeBox.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <>
      <header className={styles.head}>
        <Title launch={launch} quote={quote} links={links} />
        <div className={styles.trust} ref={trustBox}>
          <button type="button" className={styles.marks} aria-expanded={trustOpen} aria-controls="trust-panel" onClick={() => setTrustOpen((o) => !o)}>
            <span className="visually-hidden">Before you buy: </span>
            <TrustMarks trust={trust} holders={holders} />
            <svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={styles.chevron}>
              <path d="m2.5 4.5 3.5 3.5 3.5-3.5" />
            </svg>
          </button>
          {trustOpen && (
            <div id="trust-panel" className={styles.trustPanel}>
              <TrustCard trust={trust} holders={holders} />
            </div>
          )}
        </div>
        <p className={styles.price}>
          {price === null ? (
            <span className={styles.noPrice}>No price yet</span>
          ) : (
            <>
              <Price value={price} /> <span className={styles.unit}>{quote}</span>
            </>
          )}
          <Change value={launch.market.change24h} className={styles.change} />
        </p>
      </header>

      {notice}

      <div className={`grid ${styles.market}`}>
        <div className={`col-8 ${styles.main}`}>
          <div className={styles.chart}>
            <PriceChart data={candles} interval={candleInterval} onIntervalChange={changeInterval} price={price} quote={quote} trades={trades} volume24h={launch.market.volume24h.quote} />
          </div>
          <div className={styles.progress}>
            <CurveProgress launch={launch} platform={platform} />
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
          <div className={styles.trade} ref={tradeBox}>
            <TradePanel launch={launch} platform={platform} referrer={referrer} sideRequest={sideRequest} onTraded={() => void Promise.all([refresh(), refreshHolders()])} />
          </div>
          <div className={styles.aside}>
            <QuoteCard launch={launch} quoteAsset={quoteAsset} />
          </div>
        </div>
      </div>

      {/* The phone's Buy / Sell bar, above the site's tab bar: each button brings the trade panel up on its side. */}
      <div className={styles.tradeBar} data-trade-bar>
        <button type="button" className={`button button-primary ${styles.barBuy}`} onClick={() => goTrade("buy")}>Buy</button>
        <button type="button" className="button button-ghost" onClick={() => goTrade("sell")}>Sell</button>
      </div>
    </>
  );
}
