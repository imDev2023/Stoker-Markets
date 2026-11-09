/**
 * TradingView's Advanced Charts library (#126, ADR 0017): the few parts of its API the coin page uses, typed here because
 * the library's own typings ship inside the library, which is fetched at build time and never committed
 * (`scripts/charting-library.mjs`). Each name and shape below is the library's own (v33.0.0's `charting_library.d.ts`
 * and `datafeed-api.d.ts`); nothing here is invented, and anything the page does not use is left out.
 */

/** Where the build puts the library, served from our own origin as a static asset. */
export const LIBRARY_PATH = "/charting_library/";

/** `1`, `5`, `60` (minutes), `1D` (a day): the library's resolution strings, a branded string as the library types it. */
export type ResolutionString = string & { readonly [Symbol.species]: "ResolutionString" };

/** One bar: `time` in milliseconds since the epoch, UTC, at the start of the bar. */
export interface Bar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface LibrarySymbolInfo {
  name: string;
  ticker?: string;
  description: string;
  type: string;
  session: string;
  exchange: string;
  listed_exchange: string;
  timezone: "Etc/UTC";
  format: "price" | "volume";
  pricescale: number;
  minmov: number;
  has_intraday?: boolean;
  has_daily?: boolean;
  has_weekly_and_monthly?: boolean;
  supported_resolutions?: ResolutionString[];
  intraday_multipliers?: string[];
  daily_multipliers?: string[];
  visible_plots_set?: "ohlcv" | "ohlc" | "c";
  volume_precision?: number;
  data_status?: "streaming" | "endofday" | "delayed_streaming";
}

export interface PeriodParams {
  /** Unix seconds; an estimate the library makes from `countBack`. */
  from: number;
  /** Unix seconds, exclusive. */
  to: number;
  countBack: number;
  firstDataRequest: boolean;
}

export interface HistoryMetadata {
  noData?: boolean;
  nextTime?: number | null;
}

/** A mark on a bar (`getMarks`): a circle on the bar at `time` (Unix seconds, a bar's own time), its ring `color.border`. */
export interface Mark {
  id: string | number;
  time: number;
  color: { border: string; background: string };
  /** What the mark's tooltip says. */
  text: string;
  /** The letter inside the circle, shown until `imageUrl` loads. */
  label: string;
  labelFontColor: string;
  minSize: number;
  borderWidth?: number;
  hoveredBorderWidth?: number;
  /** A square picture to fill the circle with. */
  imageUrl?: string;
  showLabelWhenImageLoaded?: boolean;
}

export interface DatafeedConfiguration {
  supported_resolutions?: ResolutionString[];
  exchanges?: { value: string; name: string; desc: string }[];
  symbols_types?: { name: string; value: string }[];
  supports_marks?: boolean;
  supports_timescale_marks?: boolean;
  supports_time?: boolean;
}

/** The library's `IBasicDataFeed`: what it calls to draw a series, on its own schedule. */
export interface Datafeed {
  onReady(callback: (configuration: DatafeedConfiguration) => void): void;
  searchSymbols(userInput: string, exchange: string, symbolType: string, onResult: (items: never[]) => void): void;
  resolveSymbol(symbolName: string, onResolve: (symbolInfo: LibrarySymbolInfo) => void, onError: (reason: string) => void): void;
  getBars(
    symbolInfo: LibrarySymbolInfo,
    resolution: ResolutionString,
    periodParams: PeriodParams,
    onResult: (bars: Bar[], meta?: HistoryMetadata) => void,
    onError: (reason: string) => void,
  ): void;
  subscribeBars(
    symbolInfo: LibrarySymbolInfo,
    resolution: ResolutionString,
    onTick: (bar: Bar) => void,
    listenerGuid: string,
    onResetCacheNeededCallback: () => void,
  ): void;
  unsubscribeBars(listenerGuid: string): void;
  /** Called only when `supports_marks` is set: the marks of the bars from `from` to `to` (Unix seconds), answered once. */
  getMarks?(symbolInfo: LibrarySymbolInfo, from: number, to: number, onDataCallback: (marks: Mark[]) => void, resolution: ResolutionString): void;
}

/** A value formatter: the price scale, the legend and the crosshair's label all read prices through it. */
export interface ValueFormatter {
  format(price: number, signPositive?: boolean): string;
}

export interface WidgetOptions {
  container: HTMLElement;
  library_path: string;
  datafeed: Datafeed;
  symbol: string;
  interval: ResolutionString;
  locale: "en";
  autosize?: boolean;
  theme?: "light" | "dark";
  timezone?: string;
  custom_font_family?: string;
  custom_formatters?: { priceFormatterFactory?: (symbolInfo: LibrarySymbolInfo | null, minTick: string) => ValueFormatter | null };
  disabled_features?: string[];
  enabled_features?: string[];
  overrides?: Record<string, string | number | boolean>;
  studies_overrides?: Record<string, string | number | boolean>;
  loading_screen?: { backgroundColor?: string; foregroundColor?: string };
  time_frames?: { text: string; resolution: ResolutionString; description?: string; title?: string }[];
}

export interface Subscription<T extends (...args: never[]) => void> {
  subscribe(obj: object | null, member: T): void;
  unsubscribe(obj: object | null, member: T): void;
}

export interface ChartApi {
  setSymbol(symbol: string): Promise<boolean>;
  setResolution(resolution: ResolutionString): Promise<boolean>;
  resolution(): ResolutionString;
  resetData(): void;
  applyOverrides(overrides: Record<string, string | number | boolean>): void;
  onIntervalChanged(): Subscription<(interval: ResolutionString) => void>;
  /** Asks the datafeed for the visible bars' marks again; the marks already drawn stay unless cleared. */
  refreshMarks(): void;
  /** Removes the marks drawn. */
  clearMarks(): void;
}

/** The library's `IChartingLibraryWidget`. */
export interface ChartWidget {
  headerReady(): Promise<void>;
  chartReady(): Promise<void>;
  activeChart(): ChartApi;
  changeTheme(themeName: "light" | "dark", options?: { disableUndo?: boolean }): Promise<void>;
  applyOverrides(overrides: Record<string, string | number | boolean>): void;
  applyStudiesOverrides(overrides: Record<string, string | number | boolean>): void;
  setCSSCustomProperty(name: string, value: string): void;
  /** A click on a mark on a bar names the mark's id. */
  subscribe(event: "onMarkClick", callback: (markId: Mark["id"]) => void): void;
  remove(): void;
}

type WidgetConstructor = new (options: WidgetOptions) => ChartWidget;

declare global {
  interface Window {
    TradingView?: { widget: WidgetConstructor; version(): string };
  }
}

let library: Promise<WidgetConstructor> | null = null;

/**
 * Loads the library once per page, from our own origin. The promise lives outside any mount, so React's development
 * double-mount never hands the script's outcome to a closure already cleaned up (the trap `MarketChart` met); a failed
 * load is forgotten, so the next mount tries again.
 */
export function loadChartingLibrary(): Promise<WidgetConstructor> {
  if (window.TradingView?.widget) return Promise.resolve(window.TradingView.widget);
  library ??= new Promise<WidgetConstructor>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `${LIBRARY_PATH}charting_library.standalone.js`;
    script.async = true;
    script.onload = () => (window.TradingView?.widget ? resolve(window.TradingView.widget) : reject(new Error("the charting library defined no widget")));
    script.onerror = () => reject(new Error("the charting library did not load"));
    document.head.append(script);
  });
  library.catch(() => {
    library = null;
  });
  return library;
}
