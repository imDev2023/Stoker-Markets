"use client";

import { useState } from "react";
import type { QuoteRef } from "@launchpad/contract";
import { quoteTicker } from "@/lib/format";
import styles from "./QuoteLogo.module.css";

/** A Quote Asset's logo, or its ticker's first letter when there is none or it fails to load. */
export function QuoteLogo({ quote, size = 28 }: { quote: Pick<QuoteRef, "mint" | "symbol" | "logo">; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (quote.logo && !failed)
    return <img className={styles.logo} src={quote.logo} alt="" width={size} height={size} onError={() => setFailed(true)} />;
  return (
    <span className={styles.monogram} style={{ width: size, height: size, fontSize: size * 0.46 }} aria-hidden>
      {quoteTicker(quote).charAt(0).toUpperCase()}
    </span>
  );
}
