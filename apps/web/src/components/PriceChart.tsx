"use client";

import { useEffect, useRef, useState } from "react";
import {
  CandlestickSeries, ColorType, CrosshairMode, createChart, type IChartApi, type ISeriesApi, type UTCTimestamp,
} from "lightweight-charts";
import { CANDLE_INTERVALS, type Candle, type CandleInterval, type CandleList } from "@launchpad/contract";
import { COIN_SUPPLY, formatPriceCompact } from "@/lib/format";
import { Price } from "./Price";
import styles from "./PriceChart.module.css";

const INTERVAL_LABEL: Record<CandleInterval, string> = {
  "1m": "1 minute", "5m": "5 minutes", "15m": "15 minutes", "1h": "1 hour", "4h": "4 hours", "1d": "1 day",
};

/** The smallest price step the chart draws: prices on a fresh curve are around 1e-8 SOL per coin. */
const MIN_MOVE = 1e-15;

/** Chart colors come from the design tokens, read again whenever the color scheme changes. */
function theme() {
  const css = getComputedStyle(document.documentElement);
  const token = (name: string) => css.getPropertyValue(name).trim();
  return {
    text: token("--ink-3"),
    line: token("--line"),
    up: token("--verified"),
    down: token("--danger"),
    crosshair: token("--ink-3"),
    font: token("--font-mono"),
  };
}

/** Candlestick price chart of a Launch, in whole Quote Asset units per whole coin. */
export function PriceChart({
  data, interval, onIntervalChange, price, quote,
}: {
  /** The candles on screen; they can lag `interval` for a moment after the trader picks another one. */
  data: CandleList;
  interval: CandleInterval;
  onIntervalChange: (i: CandleInterval) => void;
  price: number | null;
  quote: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<"Candlestick"> | null>(null);
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
    const s = c.addSeries(CandlestickSeries, {
      borderVisible: false,
      // The axis can place a tick a float's rounding error away from zero; below the smallest step it is zero.
      priceFormat: { type: "custom", formatter: (p: number) => formatPriceCompact(Math.abs(p) < MIN_MOVE ? 0 : p), minMove: MIN_MOVE },
    });
    const paint = () => {
      const t = theme();
      c.applyOptions({
        layout: { textColor: t.text, fontFamily: t.font },
        grid: { vertLines: { visible: false }, horzLines: { color: t.line } },
        crosshair: { vertLine: { color: t.crosshair, labelBackgroundColor: t.crosshair }, horzLine: { color: t.crosshair, labelBackgroundColor: t.crosshair } },
      });
      s.applyOptions({ upColor: t.up, downColor: t.down, wickUpColor: t.up, wickDownColor: t.down });
    };
    paint();
    const scheme = window.matchMedia("(prefers-color-scheme: dark)");
    scheme.addEventListener("change", paint);
    c.subscribeCrosshairMove((p) => setHovered(p.time === undefined ? null : (byTime.current.get(p.time as number) ?? null)));
    chart.current = c;
    series.current = s;
    return () => {
      scheme.removeEventListener("change", paint);
      c.remove();
      chart.current = null;
      series.current = null;
    };
  }, []);

  const candles = data.candles;
  useEffect(() => {
    byTime.current = new Map(candles.map((k) => [k.time, k]));
    series.current?.setData(candles.map((k) => ({ time: k.time as UTCTimestamp, open: k.open, high: k.high, low: k.low, close: k.close })));
    // A new interval opens on its latest candles; live updates of the same interval leave a trader's scroll and zoom alone.
    if (drawnInterval.current !== data.interval) {
      chart.current?.timeScale().scrollToRealTime();
      drawnInterval.current = data.interval;
    }
  }, [candles, data.interval]);

  const shown = hovered ?? candles.at(-1) ?? null;

  return (
    <section className={styles.card} aria-labelledby="chart-title">
      <div className={styles.head}>
        <div className={styles.headline}>
          <h2 id="chart-title" className={styles.title}>Price</h2>
          {price === null ? (
            <p className={styles.price}>No trades yet</p>
          ) : (
            <p className={styles.price}>
              <Price value={price} /> <span className={styles.unit}>{quote}</span>
              <span className={styles.cap}>
                Market cap <Price value={price * COIN_SUPPLY} /> {quote}
              </span>
            </p>
          )}
        </div>
        <div className={styles.intervals} role="group" aria-label="Candle interval">
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
      {shown && (
        <dl className={styles.ohlc} aria-label={hovered ? "Hovered candle" : "Latest candle"}>
          {(["Open", "High", "Low", "Close"] as const).map((label) => (
            <div key={label}>
              <dt>
                <span aria-hidden>{label[0]}</span>
                <span className="visually-hidden">{label}</span>
              </dt>
              <dd><Price value={shown[label.toLowerCase() as "open" | "high" | "low" | "close"]} /></dd>
            </div>
          ))}
        </dl>
      )}
      <div className={styles.plot}>
        <div ref={box} className={styles.canvas} />
        {candles.length === 0 && <p className={styles.empty}>The chart starts with the first trade.</p>}
      </div>
    </section>
  );
}
