"use client";

import { useEffect, useState } from "react";
import styles from "./CoinImage.module.css";

/**
 * A coin's image with a fallback (principles, section 10: no broken-image glyph on a site that asks for money): until
 * the upload lands, or if the image fails, a tile on surface-2 with the ticker's first letter in the display face. The
 * same tile at every size, so a row, a card and a search result show the same thing for the same coin.
 */
export function CoinImage({
  src, symbol, size, className = "", loading,
}: { src: string | null; symbol: string; size: number; className?: string; loading?: "lazy" | "eager" }) {
  const [failed, setFailed] = useState(false);
  // A new address starts again: the failure was the old image's.
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) {
    return (
      <span className={`${styles.fallback} ${className}`} style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }} aria-hidden>
        {symbol.replace(/^\$/, "").slice(0, 1).toUpperCase()}
      </span>
    );
  }
  return <img className={`${styles.image} ${className}`} src={src} alt="" width={size} height={size} loading={loading} onError={() => setFailed(true)} />;
}
