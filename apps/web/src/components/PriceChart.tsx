"use client";

import { useEffect, useRef, useState } from "react";
import {
  CandlestickSeries, ColorType, CrosshairMode, LineSeries, createChart, type IChartApi, type ISeriesApi, type UTCTimestamp,
} from "lightweight-charts";
import { CANDLE_INTERVALS, type Candle, type CandleInterval, type CandleList, type Trade } from "@launchpad/contract";
import { COIN_SUPPLY, formatPriceCompact } from "@/lib/format";
import { Price } from "./Price";
import styles from "./PriceChart.module.css";

const INTERVAL_LABEL: Record<CandleInterval, string> = {
  "1m": "1 minute", "5m": "5 minutes", "15m": "15 minutes", "1h": "1 hour", "4h": "4 hours", "1d": "1 day",
};

/** The smallest price step the chart draws: prices on a fresh curve are around 1e-8 of the Quote Asset per coin. */
const MIN_MOVE = 1e-15;

/**
 * Under this many candles the interval has too few bars to read as a chart (a new coin is one bar), so the trades are
 * drawn instead: a line through each trade's price with a dot per trade (#134, after the research's empty-state rule).
 */
const FEW_CANDLES = 6;

/** Chart colors come from the design tokens, read again whenever the color scheme changes. */
function theme() {
  const css = getComputedStyle(document.documentElement);
  const token = (name: string) => css.getPropertyValue(name).trim();
  return {
    text: token("--ink-3"),
    line: token("--line"),
    up: token("--up"),
    down: token("--down"),
    accent: token("--accent"),
    crosshair: token("--ink-3"),
    font: token("--font-mono"),
  };
}

/**
 * The trades as points on the time axis, oldest first. The chart wants strictly rising times, and a burst of trades can
 * land in one second (a bundle, a seed), so each later trade of a second is set a second after the one before it: every
 * trade stays a dot of its own, a moment late at most.
 */
function tradePoints(trades: Trade[]) {
  const points: { time: UTCTimestamp; value: number }[] = [];
  let last = -Infinity;
  for (const t of [...trades].reverse()) {
    const time = Math.max(Math.floor(new Date(t.time).getTime() / 1000), last + 1);
    points.push({ time: time as UTCTimestamp, value: t.price });
    last = time;
  }
  return points;
}

const compact = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: n < 1 ? 4 : n < 1000 ? 2 : 0 });

/**
 * The coin page's dominant panel (#134): the price over time in whole Quote Asset units per whole coin, as candles once
 * there are enough, as the trades' line before; the market cap and the day's volume in its head, each shown once on the page.
 */
export function PriceChart({
  data, interval, onIntervalChange, price, quote, trades, volume24h,
}: {
  /** The candles on screen; they can lag `interval` for a moment after the trader picks another one. */
  data: CandleList;
  interval: CandleInterval;
  onIntervalChange: (i: CandleInterval) => void;
  price: number | null;
  quote: string;
  /** The latest trades, newest first, for the line a young coin's chart draws. */
  trades: Trade[];
  /** Quote Asset traded over the last 24 hours, whole units. */
  volume24h: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const line = useRef<ISeriesApi<"Line"> | null>(null);
  const byTime = useRef(new Map<number, Candle>());
  const drawnInterval = useRef<CandleInterval | null>(null);
  const [hovered, setHovered] = useState<Candle | null>(null);

  useEffect(() => {
    const el = box.current!;
    const c = createChart(el, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, fontSize: 11 },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.12, bottom: 0.08 } },
      // Room after the last candle keeps its time label clear of the price axis.
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false, rightOffset: 4, barSpacing: 12 },
      crosshair: { mode: CrosshairMode.Magnet },
      handleScale: { axisPressedMouseMove: false },
    });
    // The axis can place a tick a float's rounding error away from zero; below the smallest step it is zero.
    const priceFormat = { type: "custom" as const, formatter: (p: number) => formatPriceCompact(Math.abs(p) < MIN_MOVE ? 0 : p), minMove: MIN_MOVE };
    const s = c.addSeries(CandlestickSeries, { borderVisible: false, priceFormat });
    const l = c.addSeries(LineSeries, { priceFormat, lineWidth: 2, pointMarkersVisible: true, pointMarkersRadius: 4, lastValueVisible: true, priceLineVisible: false });
    const paint = () => {
      const t = theme();
      c.applyOptions({
        layout: { textColor: t.text, fontFamily: t.font },
        grid: { vertLines: { visible: false }, horzLines: { color: t.line } },
        crosshair: { vertLine: { color: t.crosshair, labelBackgroundColor: t.crosshair }, horzLine: { color: t.crosshair, labelBackgroundColor: t.crosshair } },
      });
      s.applyOptions({ upColor: t.up, downColor: t.down, wickUpColor: t.up, wickDownColor: t.down });
      l.applyOptions({ color: t.accent });
    };
    paint();
    const scheme = window.matchMedia("(prefers-color-scheme: dark)");
    scheme.addEventListener("change", paint);
    // The header's toggle (SchemeToggle) and `?theme=` (ThemeOverride) change the tokens through <html>'s attributes.
    const attrs = new MutationObserver(paint);
    attrs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-scheme", "data-theme"] });
    c.subscribeCrosshairMove((p) => setHovered(p.time === undefined ? null : (byTime.current.get(p.time as number) ?? null)));
    chart.current = c;
    series.current = s;
    line.current = l;
    return () => {
      scheme.removeEventListener("change", paint);
      attrs.disconnect();
      c.remove();
      chart.current = null;
      series.current = null;
      line.current = null;
    };
  }, []);

  const candles = data.candles;
  const asLine = candles.length < FEW_CANDLES && trades.length > 0;
  useEffect(() => {
    byTime.current = asLine ? new Map() : new Map(candles.map((k) => [k.time, k]));
    // TradingView's attribution logo stays with the drawn chart, not floating in an empty one.
    chart.current?.applyOptions({ layout: { attributionLogo: candles.length > 0 || trades.length > 0 } });
    series.current?.setData(asLine ? [] : candles.map((k) => ({ time: k.time as UTCTimestamp, open: k.open, high: k.high, low: k.low, close: k.close })));
    line.current?.setData(asLine ? tradePoints(trades) : []);
    // A new interval opens on its latest candles; live updates of the same interval leave a trader's scroll and zoom alone.
    if (drawnInterval.current !== data.interval || asLine) {
      chart.current?.timeScale().fitContent();
      drawnInterval.current = data.interval;
    }
  }, [candles, data.interval, trades, asLine]);

  const shown = hovered ?? (asLine ? null : candles.at(-1) ?? null);

  return (
    <section className={`card ${styles.card}`} aria-labelledby="chart-title">
      <div className={styles.head}>
        <div className={styles.figures}>
          <h2 id="chart-title" className={styles.title}>Price</h2>
          {price !== null && (
            <p className={styles.cap}>
              Market cap <Price value={price * COIN_SUPPLY} /> {quote}
            </p>
          )}
          <p className={styles.cap}>
            24h volume <span className="price">{compact(volume24h)}</span> {quote}
          </p>
        </div>
        <div className={`segmented ${styles.intervals}`} role="group" aria-label="Candle interval">
          {CANDLE_INTERVALS.map((i) => (
            <button
              key={i}
              type="button"
              aria-pressed={i === interval}
              title={`${INTERVAL_LABEL[i]} candles`}
              onClick={() => onIntervalChange(i)}
            >
              {i}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.plot}>
        <div ref={box} className={styles.canvas} />
        {candles.length === 0 && trades.length === 0 && (
          <p className={styles.empty}>
            <span>The chart starts with the first trade.</span>
            {price !== null && <span>The curve opens at <Price value={price} /> {quote} a coin.</span>}
          </p>
        )}
      </div>
      {shown && (
        <dl className={styles.ohlc} aria-label={hovered ? "Hovered candle" : "Latest candle"}>
          {(["Open", "High", "Low", "Close"] as const).map((label) => (
            <div key={label}>
              <dt>
                <span aria-hidden>{label[0]}</span>
                <span className="visually-hidden">{label}</span>
              </dt>
              <dd><Price className="mono" value={shown[label.toLowerCase() as "open" | "high" | "low" | "close"]} /></dd>
            </div>
          ))}
        </dl>
      )}
      {asLine && <p className={styles.few}>Each dot is a trade; candles take over once there are enough of them.</p>}
    </section>
  );
}
