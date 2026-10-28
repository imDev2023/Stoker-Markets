"use client";

import { useEffect, useState } from "react";
import type { QuoteMarket } from "@launchpad/contract";
import styles from "./MarketChart.module.css";

/**
 * TradingView's Advanced Chart as its web component (widget docs, 2026-10-28): one module script defines
 * `<tv-advanced-chart>`, which embeds TradingView's hosted chart, reads its colours from the `--tv-widget-*` tokens on its
 * ancestors (`MarketChart.module.css`) and its light or dark look from the page's `color-scheme`. The script answers 403
 * outside a browser, and the UI suite serves it empty (`tests/ui/src/fixtures.ts`), so there the frame keeps its loading line.
 */
const WIDGET_SCRIPT = "https://widgets.tradingview-widget.com/w/en/tv-advanced-chart.js";
const ELEMENT = "tv-advanced-chart";

// React 19 types the custom element through its JSX namespace; the namespace is the one form this augmentation takes.
declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      "tv-advanced-chart": React.HTMLAttributes<HTMLElement> & {
        symbol: string;
        interval?: string;
        timezone?: string;
        "chart-type"?: string;
        "show-date-ranges"?: string;
        "hide-snapshot-button"?: string;
      };
    }
  }
}

type State = "loading" | "ready" | "failed";

/** TradingView's chart of the market behind a Quote Asset (#124), in a frame that says so while the chart loads, or when it can't. */
export function MarketChart({ market }: { market: QuoteMarket }) {
  const [state, setState] = useState<State>("loading");

  useEffect(() => {
    let gone = false;
    void customElements.whenDefined(ELEMENT).then(() => {
      if (!gone) setState("ready");
    });
    if (!customElements.get(ELEMENT) && !document.querySelector(`script[src="${WIDGET_SCRIPT}"]`)) {
      const script = document.createElement("script");
      script.type = "module";
      script.src = WIDGET_SCRIPT;
      script.onerror = () => {
        if (!gone) setState("failed");
      };
      document.head.append(script);
    }
    return () => {
      gone = true;
    };
  }, []);

  return (
    <div className={styles.frame} data-state={state}>
      <tv-advanced-chart
        className={styles.chart}
        symbol={market.symbol}
        interval="1D"
        timezone="Etc/UTC"
        chart-type="candles"
        show-date-ranges=""
        hide-snapshot-button=""
      />
      {state !== "ready" && (
        <p className={styles.status} role="status">
          {state === "loading" ? `Loading TradingView's chart of ${market.ticker}` : `TradingView's chart did not load here. Open ${market.ticker} on TradingView instead.`}
        </p>
      )}
    </div>
  );
}
