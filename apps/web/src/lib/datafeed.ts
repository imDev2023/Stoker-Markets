import { CANDLE_INTERVALS, CANDLES_MAX, type Candle, type CandleInterval } from "@launchpad/contract";
import { getCandles } from "./api";
import type { Bar, Datafeed, LibrarySymbolInfo, PeriodParams, ResolutionString } from "./charting";
import { COIN_SUPPLY } from "./format";

/**
 * The coin page's datafeed for Advanced Charts (#126): the library asks, on its own schedule, for a coin's candles from
 * our public API (`GET /v1/launches/:mint/candles`, ADR 0003), and this answers by the rules of TradingView's datafeed
 * skill: bar times in milliseconds at the start of each candle, history paged back with `before` (exclusive) and
 * `countBack`, every callback once and asynchronously, fresh objects in every answer, and the live candle polled.
 */

/** Our candle intervals as the library's resolutions; the library builds none of them, every one is served as it is. */
export const RESOLUTION = { "1m": "1", "5m": "5", "15m": "15", "1h": "60", "4h": "240", "1d": "1D" } as Record<CandleInterval, ResolutionString>;
const RESOLUTIONS = CANDLE_INTERVALS.map((i) => RESOLUTION[i]);

/** The interval a resolution the library names stands for: it normalises a day to `1D`, and `D` is the same thing. */
export function intervalOf(resolution: string): CandleInterval | null {
  const normal = resolution === "D" ? "1D" : resolution;
  return CANDLE_INTERVALS.find((i) => RESOLUTION[i] === normal) ?? null;
}

/** What the chart draws: the coin's price or its market cap (the price times the supply), in the Quote Asset or in USD. */
export type ChartMeasure = "price" | "marketCap";
export type ChartCurrency = "quote" | "usd";
export type ChartSeries = { measure: ChartMeasure; currency: ChartCurrency };

const MEASURES: readonly ChartMeasure[] = ["price", "marketCap"];
const CURRENCIES: readonly ChartCurrency[] = ["quote", "usd"];

/** One symbol per series of one coin; a mint is base58, which has no underscore. */
export function tickerOf(mint: string, series: ChartSeries) {
  return `${mint}_${series.measure}_${series.currency}`;
}

function seriesOf(ticker: string, mint: string): ChartSeries | null {
  const [m, measure, currency] = ticker.split("_");
  if (m !== mint || !MEASURES.includes(measure as ChartMeasure) || !CURRENCIES.includes(currency as ChartCurrency)) return null;
  return { measure: measure as ChartMeasure, currency: currency as ChartCurrency };
}

/** How long one request may take before the chart is told it failed, rather than loading for ever. */
const TIMEOUT_MS = 10_000;
/**
 * How many of the latest candles each poll reads: the live one, the ones before it that a late-indexed trade could still
 * change, and the ones a sleeping tab missed. A gap longer than this reloads the series instead.
 */
const POLL_CANDLES = 50;

/** Significant digits a value keeps on the price scale. */
const SIGNIFICANT = 4;

/** The library's price scale: 10 to the number of decimals that shows `value` to four significant digits. */
function priceScale(value: number | null) {
  if (value === null || !(value > 0)) return 10 ** 10;
  const decimals = Math.min(18, Math.max(0, SIGNIFICANT - 1 - Math.floor(Math.log10(value))));
  return 10 ** decimals;
}

const later = (fn: () => void) => void setTimeout(fn, 0);

type Coin = { mint: string; symbol: string; quote: string; quoteDecimals: number };

type Live = {
  /** The coin's latest price in whole Quote Asset units, which sizes the price scale; null before the first. */
  price: () => number | null;
  /** USD for one whole unit of the Quote Asset; null when the Quote Registry has no USD price for it. */
  usdPerQuote: () => number | null;
  /** The series was reset (a candle already drawn changed): the page reloads it with `resetData()`. */
  onReset: () => void;
};

type Subscription = {
  ticker: string;
  interval: CandleInterval;
  scale: Scale;
  onTick: (bar: Bar) => void;
  onReset: () => void;
  /** The candles drawn so far that a poll still reads, by start time, as last sent. */
  recent: Map<number, Bar>;
  /** Start of the newest candle drawn, in milliseconds; null while the series has none. */
  last: number | null;
};

/** How a series turns a candle into a bar: prices times `value`, the Quote Asset's raw volume into whole units times `volume`. */
type Scale = { value: number; volume: number };

function toBar(c: Candle, scale: Scale, quoteDecimals: number): Bar {
  return {
    time: c.time * 1000,
    open: c.open * scale.value,
    high: c.high * scale.value,
    low: c.low * scale.value,
    close: c.close * scale.value,
    volume: (Number(c.volume) / 10 ** quoteDecimals) * scale.volume,
  };
}

const sameBar = (a: Bar, b: Bar) => a.open === b.open && a.high === b.high && a.low === b.low && a.close === b.close && a.volume === b.volume;

/**
 * A datafeed for one coin's chart. `poll` reads the live candles, on the page's clock; `dispose` stops it when the chart
 * goes. Give every chart its own: the library names a subscription after its series alone.
 */
export function createDatafeed(coin: Coin, live: Live) {
  /** The USD rate each USD series was opened at, so its history and its live candle convert alike for the chart's life. */
  const rates = new Map<string, number>();
  /** The newest candles of each series' first history answer, which seed its subscription. */
  const seeds = new Map<string, Bar[]>();
  const subscriptions = new Map<string, Subscription>();
  let polling = false;
  let disposed = false;

  const seriesKey = (ticker: string, interval: CandleInterval) => `${ticker}|${interval}`;

  function scaleOf(ticker: string): Scale | null {
    const series = seriesOf(ticker, coin.mint);
    if (!series) return null;
    const usd = series.currency === "usd" ? rates.get(ticker) : 1;
    if (usd === undefined) return null;
    return { value: (series.measure === "marketCap" ? COIN_SUPPLY : 1) * usd, volume: usd };
  }

  function describe(series: ChartSeries) {
    const unit = series.currency === "usd" ? "USD" : coin.quote;
    return series.measure === "price" ? `${coin.symbol} / ${unit}` : `${coin.symbol} market cap in ${unit}`;
  }

  async function poll() {
    if (polling || disposed || subscriptions.size === 0) return;
    polling = true;
    try {
      // One read per interval, however many series of it are drawn.
      const intervals = [...new Set([...subscriptions.values()].map((s) => s.interval))];
      const answers = await Promise.allSettled(
        intervals.map((i) => getCandles(coin.mint, i, { limit: POLL_CANDLES, signal: AbortSignal.timeout(TIMEOUT_MS) })),
      );
      const byInterval = new Map(intervals.map((i, n) => [i, answers[n]!]));
      // A copy: resetting a series makes the library unsubscribe it from inside the callback.
      for (const [guid, sub] of [...subscriptions]) {
        const answer = byInterval.get(sub.interval);
        // A failed read is retried by the next poll, which reads every candle since the last one drawn.
        if (!subscriptions.has(guid) || answer?.status !== "fulfilled") continue;
        update(sub, answer.value.candles.map((c) => toBar(c, sub.scale, coin.quoteDecimals)));
      }
    } finally {
      polling = false;
    }
  }

  /** Sends what changed since the last poll, oldest first; a change to a candle before the newest drawn reloads the series. */
  function update(sub: Subscription, bars: Bar[]) {
    const last = sub.last;
    const changedBefore = last !== null && bars.some((b) => b.time < last && sub.recent.has(b.time) && !sameBar(sub.recent.get(b.time)!, b));
    // Every candle read is newer than the newest drawn, and the read was full: candles in between may be missing.
    const gap = last !== null && bars.length === POLL_CANDLES && bars[0]!.time > last;
    if (changedBefore || gap) {
      sub.onReset();
      live.onReset();
      return;
    }
    for (const bar of bars) {
      if (last !== null && bar.time < last) continue;
      const sent = sub.recent.get(bar.time);
      if (sent && sameBar(sent, bar)) continue;
      sub.onTick({ ...bar });
      sub.recent.set(bar.time, bar);
      sub.last = Math.max(sub.last ?? bar.time, bar.time);
    }
    // Only what a poll can still read is kept.
    const times = [...sub.recent.keys()].sort((a, b) => a - b);
    for (const t of times.slice(0, Math.max(0, times.length - POLL_CANDLES))) sub.recent.delete(t);
  }

  const datafeed: Datafeed = {
    onReady(callback) {
      later(() =>
        callback({
          supported_resolutions: [...RESOLUTIONS],
          exchanges: [],
          symbols_types: [],
          supports_marks: false,
          supports_timescale_marks: false,
          supports_time: false,
        }),
      );
    },

    // The chart shows one coin; the symbol search is switched off, and an empty answer is the interface's "none".
    searchSymbols(_input, _exchange, _type, onResult) {
      later(() => onResult([]));
    },

    resolveSymbol(name, onResolve, onError) {
      const series = seriesOf(name, coin.mint);
      if (!series) return later(() => onError("unknown_symbol"));
      if (series.currency === "usd" && !rates.has(name)) {
        const usd = live.usdPerQuote();
        if (usd === null || !(usd > 0)) return later(() => onError("no USD price for the Quote Asset"));
        rates.set(name, usd);
      }
      const scale = scaleOf(name)!;
      const info: LibrarySymbolInfo = {
        name: coin.symbol,
        ticker: name,
        description: describe(series),
        type: "crypto",
        session: "24x7",
        exchange: "Stoker",
        listed_exchange: "Stoker",
        timezone: "Etc/UTC",
        format: "price",
        pricescale: priceScale(live.price() === null ? null : live.price()! * scale.value),
        minmov: 1,
        has_intraday: true,
        has_daily: true,
        has_weekly_and_monthly: false,
        supported_resolutions: [...RESOLUTIONS],
        intraday_multipliers: RESOLUTIONS.filter((r) => !r.endsWith("D")),
        daily_multipliers: ["1"],
        visible_plots_set: "ohlcv",
        volume_precision: 2,
        data_status: "streaming",
      };
      later(() => onResolve(info));
    },

    getBars(symbolInfo, resolution, periodParams: PeriodParams, onResult, onError) {
      const interval = intervalOf(resolution);
      const ticker = symbolInfo.ticker ?? symbolInfo.name;
      const scale = scaleOf(ticker);
      if (!interval || !scale) return later(() => onError(interval ? "unknown_symbol" : "unsupported resolution"));
      const limit = Math.min(Math.max(periodParams.countBack, 1), CANDLES_MAX);
      getCandles(coin.mint, interval, { before: periodParams.to, limit, signal: AbortSignal.timeout(TIMEOUT_MS) }).then(
        ({ candles }) => {
          // The API answers only candles that start before `to`; one that ignored `before` (an older deploy) is held to it here.
          const kept = candles.filter((c) => c.time < periodParams.to);
          const bars = kept.map((c) => toBar(c, scale, coin.quoteDecimals));
          if (periodParams.firstDataRequest) seeds.set(seriesKey(ticker, interval), bars.slice(-POLL_CANDLES).map((b) => ({ ...b })));
          // Fewer candles than asked for means none are older: the API answers the latest `limit` before `to`.
          onResult(bars, { noData: kept.length < limit });
        },
        (e: unknown) => onError(e instanceof Error && e.message ? e.message.replace(/:/g, " ") : "the candles could not be read"),
      );
    },

    subscribeBars(symbolInfo, resolution, onTick, listenerGuid, onResetCacheNeededCallback) {
      const interval = intervalOf(resolution);
      const ticker = symbolInfo.ticker ?? symbolInfo.name;
      const scale = scaleOf(ticker);
      if (!interval || !scale) return;
      const seed = seeds.get(seriesKey(ticker, interval)) ?? [];
      subscriptions.set(listenerGuid, {
        ticker,
        interval,
        scale,
        onTick,
        onReset: onResetCacheNeededCallback,
        recent: new Map(seed.map((b) => [b.time, b])),
        last: seed.at(-1)?.time ?? null,
      });
    },

    unsubscribeBars(listenerGuid) {
      subscriptions.delete(listenerGuid);
    },
  };

  return {
    datafeed,
    /**
     * Reads the live candles of every series drawn and sends what changed. The page calls it on its own refresh (every
     * four seconds, and at once after the visitor's own trade), so the chart and the rest of the page read the API in
     * one burst on one clock.
     */
    poll,
    dispose() {
      disposed = true;
      subscriptions.clear();
    },
  };
}
