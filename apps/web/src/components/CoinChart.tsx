"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { CANDLE_INTERVALS, type CandleInterval, type LaunchSummary } from "@launchpad/contract";
import { LIBRARY_PATH, loadChartingLibrary, type ChartWidget } from "@/lib/charting";
import { chartLook, chartOverrides, chartStudiesOverrides, paintChart, shareFonts } from "@/lib/chartTheme";
import { createDatafeed, intervalOf, RESOLUTION, tickerOf, type ChartCurrency, type ChartMeasure, type ChartSeries } from "@/lib/datafeed";
import { formatPriceCompact } from "@/lib/format";
import { Price } from "./Price";
import styles from "./CoinChart.module.css";

const INTERVAL_LABEL: Record<CandleInterval, string> = {
  "1m": "1 minute", "5m": "5 minutes", "15m": "15 minutes", "1h": "1 hour", "4h": "4 hours", "1d": "1 day",
};

/** What the page's refresh calls while no chart is drawn. */
export const idle = async () => undefined;

/** The interval a coin page opens on: a young coin's trades are minutes apart. */
const FIRST_INTERVAL: CandleInterval = "1m";

/**
 * What the library's own header and menus offer, less what has nothing behind it here: one coin per chart (no symbol
 * search or compare), the intervals in our own control above the chart, no saved layouts or templates (no storage).
 */
const DISABLED_FEATURES = [
  "header_symbol_search",
  "symbol_search_hot_key",
  "header_compare",
  "header_resolutions",
  "header_saveload",
  "study_templates",
  "display_market_status",
];

/** Narrower than this, the chart is a phone's. */
const PHONE_WIDTH = 560;

/**
 * The bottom bar's ranges, each on one of our intervals, titled in capitals as traders write a range ("1M" a month)
 * beside the head's candle intervals ("1m" a minute).
 */
const TIME_FRAMES = [
  { text: "1d", title: "1D", resolution: RESOLUTION["1m"], description: "1 day" },
  { text: "5d", title: "5D", resolution: RESOLUTION["5m"], description: "5 days" },
  { text: "1m", title: "1M", resolution: RESOLUTION["1h"], description: "1 month" },
  { text: "3m", title: "3M", resolution: RESOLUTION["4h"], description: "3 months" },
  { text: "1y", title: "1Y", resolution: RESOLUTION["1d"], description: "1 year" },
];

const compact = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: n < 1 ? 4 : n < 1000 ? 2 : 0 });

/** The visitor's own time zone for the time scale, or the exchange's (UTC) where the browser names none. */
const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "exchange";

/** Where the chart stands, on its plot as `data-chart` (with `empty` before the first trade), which the UI suite waits on. */
type State = "loading" | "ready" | "failed";

/**
 * The coin page's dominant panel (#134, rebuilt on Advanced Charts for #126): TradingView's charting library, served from
 * our own origin and fed from our own candles (`lib/datafeed.ts`), with its indicators, drawing tools, chart types and
 * legend (open, high, low and close). The head above it is the site's: the market cap and the day's volume, what the
 * chart shows (the price or the market cap, in the Quote Asset or in USD) and the candle interval.
 */
export function CoinChart({ launch, quote, poll, hasTrades }: {
  launch: LaunchSummary;
  quote: string;
  /**
   * Where the chart puts its live read: the page calls it in its own refresh (every four seconds, and at once after the
   * visitor's trade), beside its other reads, so the page reads the API in one burst on one clock as it always has.
   */
  poll: RefObject<() => Promise<void>>;
  hasTrades: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<ChartWidget | null>(null);
  const [state, setState] = useState<State>("loading");
  const [interval, setIntervalState] = useState<CandleInterval>(FIRST_INTERVAL);
  const [series, setSeries] = useState<ChartSeries>({ measure: "price", currency: "quote" });

  const market = launch.market;
  // USD for one whole Quote Asset, from the market cap the API prices both ways; null when the asset has no USD price.
  const usdPerQuote = market.marketCap && market.marketCap.usd !== null && market.marketCap.quote > 0 ? market.marketCap.usd / market.marketCap.quote : null;
  const live = useRef({ price: market.price, usdPerQuote, interval, series });
  live.current = { price: market.price, usdPerQuote, interval, series };

  useEffect(() => {
    // Before the first trade there is nothing to draw: the note stands alone, and the library waits for that trade.
    if (!hasTrades) return;
    const el = box.current!;
    let gone = false;
    let chart: ChartWidget | null = null;
    const feed = createDatafeed(
      { mint: launch.mint, symbol: launch.symbol, quote, quoteDecimals: launch.quote.decimals },
      {
        price: () => live.current.price,
        usdPerQuote: () => live.current.usdPerQuote,
        onReset: () => chart?.activeChart().resetData(),
      },
    );
    poll.current = feed.poll;
    // The library builds its frame inside the box; the page's fonts go in as soon as it is there.
    const frames = new MutationObserver(() => {
      const frame = el.querySelector("iframe");
      if (!frame) return;
      frames.disconnect();
      shareFonts(frame);
    });
    frames.observe(el, { childList: true, subtree: true });
    const attrs = new MutationObserver(() => {
      if (chart && !gone) void paintChart(chart, chartLook());
    });

    loadChartingLibrary().then(
      (Widget) => {
        if (gone) return;
        const look = chartLook();
        const { interval: first, series: shown } = live.current;
        chart = new Widget({
          container: el,
          library_path: LIBRARY_PATH,
          datafeed: feed.datafeed,
          symbol: tickerOf(launch.mint, shown),
          interval: RESOLUTION[first],
          locale: "en",
          autosize: true,
          theme: look.scheme,
          timezone: timeZone(),
          custom_font_family: look.font,
          custom_formatters: { priceFormatterFactory: () => ({ format: (p: number) => formatPriceCompact(p) }) },
          disabled_features: DISABLED_FEATURES,
          // On a phone the drawing tools wait behind the toolbar's own button, leaving the width to the candles.
          enabled_features: el.clientWidth < PHONE_WIDTH ? ["hide_left_toolbar_by_default"] : [],
          overrides: chartOverrides(look),
          studies_overrides: chartStudiesOverrides(look),
          loading_screen: { backgroundColor: look.surface, foregroundColor: look.accent },
          time_frames: TIME_FRAMES,
        });
        widget.current = chart;
        const ready = chart;
        void ready.chartReady().then(async () => {
          if (gone) return;
          // The library's own interval menus (the bottom bar's ranges) move the control above the chart with them.
          ready.activeChart().onIntervalChanged().subscribe(null, (r) => {
            const i = intervalOf(r);
            if (i) setIntervalState(i);
          });
          // The fonts copied into the frame may still be loading: the chart is painted once they are in, which draws it again.
          await el.querySelector("iframe")?.contentDocument?.fonts.ready;
          await paintChart(ready, chartLook());
          if (gone) return;
          attrs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-scheme", "data-theme"] });
          setState("ready");
        });
      },
      () => {
        if (!gone) setState("failed");
      },
    );

    return () => {
      gone = true;
      frames.disconnect();
      attrs.disconnect();
      feed.dispose();
      poll.current = idle;
      widget.current = null;
      chart?.remove();
    };
  }, [launch.mint, launch.symbol, launch.quote.decimals, quote, hasTrades]);

  function changeInterval(next: CandleInterval) {
    setIntervalState(next);
    void widget.current?.activeChart().setResolution(RESOLUTION[next]);
  }

  function changeSeries(next: Partial<ChartSeries>) {
    const s = { ...series, ...next };
    setSeries(s);
    void widget.current?.activeChart().setSymbol(tickerOf(launch.mint, s));
  }

  const usd = series.currency === "usd";
  const unit = usd ? "USD" : quote;
  const marketCap = market.marketCap === null ? null : usd ? market.marketCap.usd : market.marketCap.quote;
  const volume = usd ? market.volume24h.usd : market.volume24h.quote;
  const price = market.price;

  return (
    <section className={`card ${styles.card}`} aria-labelledby="chart-title">
      <div className={styles.head}>
        <div className={styles.figures}>
          <h2 id="chart-title" className={styles.title}>{series.measure === "price" ? "Price" : "Market cap"}</h2>
          {marketCap !== null && (
            <p className={styles.cap}>
              Market cap <Price value={marketCap} /> {unit}
            </p>
          )}
          {volume !== null && (
            <p className={styles.cap}>
              24h volume <span className="price">{compact(volume)}</span> {unit}
            </p>
          )}
        </div>
        <div className={styles.controls}>
          <div className={`segmented ${styles.choice}`} role="group" aria-label="Chart shows">
            {(["price", "marketCap"] as const satisfies readonly ChartMeasure[]).map((m) => (
              <button key={m} type="button" aria-pressed={series.measure === m} onClick={() => changeSeries({ measure: m })}>
                {m === "price" ? "Price" : "Market cap"}
              </button>
            ))}
          </div>
          <div className={`segmented ${styles.choice}`} role="group" aria-label="Currency">
            {(["quote", "usd"] as const satisfies readonly ChartCurrency[]).map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={series.currency === c}
                // USD is the Quote Asset's latest price in dollars, so it waits for one.
                disabled={c === "usd" && usdPerQuote === null}
                title={c === "usd" ? (usdPerQuote === null ? `${quote} has no USD price yet` : `In USD at ${quote}'s latest price`) : `In ${quote}`}
                onClick={() => changeSeries({ currency: c })}
              >
                {c === "usd" ? "USD" : quote}
              </button>
            ))}
          </div>
          <div className={`segmented ${styles.intervals}`} role="group" aria-label="Candle interval">
            {CANDLE_INTERVALS.map((i) => (
              <button key={i} type="button" aria-pressed={i === interval} title={`${INTERVAL_LABEL[i]} candles`} onClick={() => changeInterval(i)}>
                {i}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className={styles.plot} data-chart={hasTrades ? state : "empty"}>
        <div ref={box} className={styles.canvas} />
        {state === "failed" ? (
          <p className={styles.note} role="status">The chart could not load. Reload the page to try again.</p>
        ) : !hasTrades ? (
          <p className={styles.note}>
            <span>The chart starts with the first trade.</span>
            {price !== null && <span>The curve opens at <Price value={price} /> {quote} a coin.</span>}
          </p>
        ) : null}
      </div>
    </section>
  );
}
