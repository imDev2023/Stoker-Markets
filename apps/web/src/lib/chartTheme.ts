import type { ChartWidget } from "./charting";

/**
 * Advanced Charts in the site's own tokens (#126): the chart draws in an iframe of its own, so nothing in the page's CSS
 * reaches it. Each token is read from `<html>` and handed over three ways: the theme (light or dark, from `data-scheme`),
 * `overrides` for what the canvas draws, and the library's `--tv-color-*` custom properties for its toolbars and menus.
 * Read again whenever `data-scheme` or `data-theme` changes, as the old chart did (the trap in CLAUDE.md).
 */

let probe: CanvasRenderingContext2D | null = null;

/**
 * A token as a colour the library parses: the canvas normalises any CSS colour to `#rrggbb` or `rgba(r, g, b, a)`, and
 * our tokens are written as `rgb(255 255 255 / 8%)`, which the library's own parser does not read.
 */
function color(value: string) {
  probe ??= document.createElement("canvas").getContext("2d");
  if (!probe) return value;
  probe.fillStyle = "#000000";
  probe.fillStyle = value;
  return String(probe.fillStyle);
}

/** The same colour at an opacity, for the volume bars under the candles. */
function withAlpha(normal: string, alpha: number) {
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(normal);
  if (hex) return `rgba(${parseInt(hex[1]!, 16)}, ${parseInt(hex[2]!, 16)}, ${parseInt(hex[3]!, 16)}, ${alpha})`;
  const rgba = /^rgba?\((\d+), (\d+), (\d+)/.exec(normal);
  return rgba ? `rgba(${rgba[1]}, ${rgba[2]}, ${rgba[3]}, ${alpha})` : normal;
}

export type ChartLook = ReturnType<typeof chartLook>;

/** The chart's colours and type, from the tokens `<html>` carries now. */
export function chartLook() {
  const root = document.documentElement;
  const css = getComputedStyle(root);
  const token = (name: string) => color(css.getPropertyValue(name).trim());
  const look = {
    scheme: (root.dataset.scheme === "light" ? "light" : "dark") as "light" | "dark",
    surface: token("--surface"),
    surface2: token("--surface-2"),
    surface3: token("--surface-3"),
    line: token("--line"),
    ink: token("--ink"),
    ink2: token("--ink-2"),
    ink3: token("--ink-3"),
    accent: token("--accent"),
    up: token("--up"),
    down: token("--down"),
    font: css.getPropertyValue("--font-mono").trim(),
  };
  return look;
}

/** What the canvas draws: the pane on the card's own surface, a quiet grid and scale, candles in the up and down colours. */
export function chartOverrides(l: ChartLook): Record<string, string | number | boolean> {
  return {
    "paneProperties.backgroundType": "solid",
    // Room above the highest candle for the marks stacked on it (#160): the library's 10% left them cut at the top.
    "paneProperties.topMargin": 22,
    "paneProperties.background": l.surface,
    "paneProperties.vertGridProperties.color": withAlpha(l.surface, 0),
    "paneProperties.horzGridProperties.color": l.line,
    "paneProperties.crossHairProperties.color": l.ink3,
    "paneProperties.separatorColor": l.line,
    "scalesProperties.textColor": l.ink3,
    "scalesProperties.lineColor": l.line,
    "mainSeriesProperties.candleStyle.upColor": l.up,
    "mainSeriesProperties.candleStyle.downColor": l.down,
    "mainSeriesProperties.candleStyle.drawBorder": false,
    "mainSeriesProperties.candleStyle.wickUpColor": l.up,
    "mainSeriesProperties.candleStyle.wickDownColor": l.down,
    "mainSeriesProperties.hollowCandleStyle.upColor": l.up,
    "mainSeriesProperties.hollowCandleStyle.downColor": l.down,
    "mainSeriesProperties.hollowCandleStyle.wickUpColor": l.up,
    "mainSeriesProperties.hollowCandleStyle.wickDownColor": l.down,
    "mainSeriesProperties.barStyle.upColor": l.up,
    "mainSeriesProperties.barStyle.downColor": l.down,
    "mainSeriesProperties.lineStyle.color": l.accent,
    "mainSeriesProperties.areaStyle.linecolor": l.accent,
    "mainSeriesProperties.areaStyle.color1": withAlpha(l.accent, 0.28),
    "mainSeriesProperties.areaStyle.color2": withAlpha(l.accent, 0.02),
  };
}

/** The volume under the candles, in the same up and down colours, faded so the candles lead. */
export function chartStudiesOverrides(l: ChartLook): Record<string, string | number | boolean> {
  return {
    "volume.volume.color.0": withAlpha(l.down, 0.4),
    "volume.volume.color.1": withAlpha(l.up, 0.4),
  };
}

/** The library's toolbars and menus (its "Custom CSS properties" guide), in the page's surfaces, inks and accent. */
function chartProperties(l: ChartLook): Record<string, string> {
  return {
    "--tv-color-platform-background": l.surface,
    "--tv-color-pane-background": l.surface,
    "--tv-color-toolbar-button-background-hover": l.surface2,
    "--tv-color-toolbar-button-background-expanded": l.surface2,
    "--tv-color-toolbar-button-background-active": l.surface3,
    "--tv-color-toolbar-button-background-active-hover": l.surface3,
    "--tv-color-toolbar-button-text": l.ink3,
    "--tv-color-toolbar-button-text-hover": l.ink,
    "--tv-color-toolbar-button-text-active": l.accent,
    "--tv-color-toolbar-button-text-active-hover": l.accent,
    "--tv-color-item-active-text": l.accent,
    "--tv-color-toolbar-toggle-button-background-active": l.accent,
    "--tv-color-toolbar-toggle-button-background-active-hover": l.accent,
    "--tv-color-toolbar-divider-background": l.line,
    "--tv-color-toolbar-save-layout-loader": l.ink3,
    "--tv-color-popup-background": l.surface3,
    "--tv-color-popup-element-text": l.ink2,
    "--tv-color-popup-element-text-hover": l.ink,
    "--tv-color-popup-element-background-hover": l.surface2,
    "--tv-color-popup-element-divider-background": l.line,
    "--tv-color-popup-element-secondary-text": l.ink3,
    "--tv-color-popup-element-hint-text": l.ink3,
    "--tv-color-popup-element-text-active": l.accent,
    "--tv-color-popup-element-background-active": l.surface2,
    "--tv-color-popup-element-toolbox-text": l.ink3,
    "--tv-color-popup-element-toolbox-text-hover": l.ink,
    "--tv-color-popup-element-toolbox-text-active-hover": l.ink,
    "--tv-color-popup-element-toolbox-background-hover": l.surface2,
    "--tv-color-popup-element-toolbox-background-active-hover": l.surface2,
  };
}

/** Paints a chart that is ready in the tokens of now. The theme goes first, since a change of theme resets the colours. */
export async function paintChart(widget: ChartWidget, l: ChartLook) {
  await widget.changeTheme(l.scheme, { disableUndo: true });
  for (const [name, value] of Object.entries(chartProperties(l))) widget.setCSSCustomProperty(name, value);
  widget.applyOverrides(chartOverrides(l));
  // The volume's last bar on the price scale reads as a price, so the legend alone carries it. A setting of the chart
  // itself: as a default (the constructor's `overrides` or the widget's `applyOverrides`) the library warns that the path
  // does not exist, though its typings list it.
  widget.activeChart().applyOverrides({ "scalesProperties.showStudyLastValue": false });
  widget.applyStudiesOverrides(chartStudiesOverrides(l));
}

/**
 * The page's own web fonts inside the chart's frame, so its scales draw in the site's monospace: the frame is a document
 * of its own, so the `@font-face` rules of the page's stylesheets (all from our origin) are copied into it once it loads.
 */
export function shareFonts(frame: HTMLIFrameElement) {
  const copy = () => {
    const doc = frame.contentDocument;
    if (!doc?.head || doc.getElementById("site-fonts")) return;
    const rules: string[] = [];
    for (const sheet of document.styleSheets) {
      let list: CSSRuleList;
      try {
        list = sheet.cssRules;
      } catch {
        continue; // a stylesheet from another origin keeps its rules to itself
      }
      // A rule's `url()` is relative to its stylesheet, which the frame's document is not beside: made absolute here.
      const base = sheet.href ?? document.baseURI;
      for (const rule of list) {
        if (rule instanceof CSSFontFaceRule) rules.push(rule.cssText.replace(/url\((["']?)([^"')]+)\1\)/g, (_, q: string, url: string) => `url(${q}${new URL(url, base).href}${q})`));
      }
    }
    const style = doc.createElement("style");
    style.id = "site-fonts";
    style.textContent = rules.join("\n");
    doc.head.append(style);
  };
  frame.addEventListener("load", copy);
  copy();
}
