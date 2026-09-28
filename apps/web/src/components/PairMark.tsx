"use client";

import { useLayoutEffect, useRef, type CSSProperties } from "react";
import styles from "./PairMark.module.css";

type Size = "sm" | "md" | "lg" | "fit";

/** Largest size a `fit` pair grows to, matching the CSS cap. */
const FIT_MAX_PX = 84;
/** Below this share of its set size a pair stops shrinking and the ticker is cut with an ellipsis instead. */
const MIN_SCALE = 0.5;

/**
 * A coin shown as the pair it trades as: the coin's ticker, a slash, and its Quote Asset.
 * The pair always fits its container on one line: it shrinks for long tickers, and `fit` also grows to fill the width.
 * CSS gives a close first paint (`fit` needs its container to set `container-type: inline-size`); the browser then
 * measures the real glyphs, since wide letters like W make any per-character estimate wrong.
 */
export function PairMark({ base, quote, size = "md" }: { base: string; quote: string; size?: Size }) {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    const box = el?.parentElement;
    if (!el || !box) return;
    const range = document.createRange();
    const textWidth = (node: Element) => {
      range.selectNodeContents(node);
      return range.getBoundingClientRect().width;
    };
    const fit = () => {
      // Measure at the CSS size: the room is read after the reset, so a box that wraps its content can't ratchet down.
      el.style.fontSize = "";
      const boxStyle = getComputedStyle(box);
      const room = box.clientWidth - parseFloat(boxStyle.paddingLeft) - parseFloat(boxStyle.paddingRight);
      const cssSize = parseFloat(getComputedStyle(el).fontSize);
      const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
      const parts = [...el.children].filter((c) => c.getAttribute("aria-hidden") !== null);
      const natural = parts.reduce((w, p) => w + textWidth(p), 0) + gap * (parts.length - 1);
      if (!natural || !room) return;
      // A hair under the exact fit, so subpixel rounding never triggers the ellipsis.
      const exact = (cssSize * (room - 1)) / natural;
      const target = size === "fit" ? Math.min(FIT_MAX_PX, exact) : Math.min(cssSize, exact);
      el.style.fontSize = `${Math.max(cssSize * MIN_SCALE, target)}px`;
    };
    fit();
    // Refit when the room changes, and when the glyphs do: a web font can swap in after first paint without a load
    // event (already cached, applied on the next style pass), and only the untruncated slash and quote show it.
    // The refit runs on the next frame, since resizing observed elements inside the callback is a ResizeObserver loop;
    // a refit that lands on the same size changes nothing, so it settles after one round.
    let frame = 0;
    const refit = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fit);
    };
    const observer = new ResizeObserver(refit);
    observer.observe(box);
    for (const part of el.querySelectorAll(`.${styles.slash}, .${styles.quote}`)) observer.observe(part);
    void document.fonts.ready.then(fit);
    document.fonts.addEventListener("loadingdone", fit);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.fonts.removeEventListener("loadingdone", fit);
    };
  }, [base, quote, size]);

  const style = size === "fit" ? ({ "--chars": base.length + quote.length + 1 } as CSSProperties) : undefined;
  return (
    <span ref={ref} className={`${styles.pair} ${styles[size]}`} style={style}>
      <span className="visually-hidden">{`${base} paired with ${quote}`}</span>
      <span aria-hidden className={styles.base}>{base}</span>
      <span aria-hidden className={styles.slash}>/</span>
      <span aria-hidden className={styles.quote}>{quote}</span>
    </span>
  );
}
