import type { CSSProperties } from "react";
import styles from "./PairMark.module.css";

type Size = "sm" | "md" | "lg" | "fit";

/**
 * A coin shown as the pair it trades as: the coin's ticker, a slash, and its Quote Asset.
 * `fit` scales the type to fill its container's width (the container must set `container-type: inline-size`).
 */
export function PairMark({ base, quote, size = "md" }: { base: string; quote: string; size?: Size }) {
  const style = size === "fit" ? ({ "--chars": base.length + quote.length + 1 } as CSSProperties) : undefined;
  return (
    <span className={`${styles.pair} ${styles[size]}`} style={style}>
      <span className="visually-hidden">{`${base} paired with ${quote}`}</span>
      <span aria-hidden className={styles.base}>{base}</span>
      <span aria-hidden className={styles.slash}>/</span>
      <span aria-hidden className={styles.quote}>{quote}</span>
    </span>
  );
}
