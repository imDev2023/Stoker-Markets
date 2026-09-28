"use client";

import { useState } from "react";
import styles from "./CopyButton.module.css";

export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={styles.copy}
      aria-label={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        } catch {
          // clipboard unavailable; the address is still selectable
        }
      }}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
