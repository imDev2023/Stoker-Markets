"use client";

import { useEffect, useState } from "react";
import type { CopyCheck, CopyVerdict } from "@launchpad/contract";
import { checkCopy } from "@/lib/api";
import styles from "./CopyCheckCard.module.css";

type Field = "name" | "symbol" | "image";

/**
 * Copy Protection (#120, ADR 0012) as the Creator types: each of the name, the ticker and the image is checked against the
 * coins launched here inside their window, and the card says which is free, which is taken and by whom. The API gives
 * the same answer when the form is sent, so nothing here is a surprise at prepare time.
 */
export function CopyCheckCard({ name, symbol, image, creator }: { name: string; symbol: string; image: File | null; creator: string | null }) {
  const [result, setResult] = useState<CopyCheck | null>(null);
  const [pending, setPending] = useState(false);
  const trimmedName = name.trim();
  const trimmedSymbol = symbol.trim();
  const asked = { name: trimmedName.length > 0, symbol: trimmedSymbol.length > 0, image: image !== null };
  const anything = asked.name || asked.symbol || asked.image;

  useEffect(() => {
    if (!anything) return setResult(null);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setPending(true);
      try {
        const form = new FormData();
        if (creator) form.set("creator", creator);
        if (trimmedName) form.set("name", trimmedName);
        if (trimmedSymbol) form.set("symbol", trimmedSymbol);
        if (image) form.set("image", image);
        setResult(await checkCopy(form, controller.signal));
      } catch {
        // A failed check never blocks the form: prepare checks again and says what it refuses.
      } finally {
        if (!controller.signal.aborted) setPending(false);
      }
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [anything, trimmedName, trimmedSymbol, image, creator]);

  const days = result ? Math.round(result.protectionSeconds / 86_400) : null;
  const rows: { field: Field; label: string; verdict: CopyVerdict | null }[] = [
    { field: "name", label: "Name", verdict: asked.name ? (result?.name ?? null) : null },
    { field: "symbol", label: "Ticker", verdict: asked.symbol ? (result?.symbol ?? null) : null },
    { field: "image", label: "Image", verdict: asked.image ? (result?.image ?? null) : null },
  ];
  const taken = rows.filter((r) => r.verdict?.status === "taken");

  return (
    <section className={styles.card} aria-label="Copy check" aria-busy={pending} data-state={taken.length > 0 ? "taken" : anything && result ? "free" : "idle"}>
      <h3 className={styles.title}>Copy check</h3>
      <ul className={styles.rows}>
        {rows.map((r) => (
          <li key={r.field} className={styles.row} data-status={r.verdict?.status ?? (asked[r.field] ? "pending" : "empty")}>
            <span className={styles.mark} aria-hidden />
            <span className={styles.label}>{r.label}</span>
            <span className={styles.verdict}>{describe(r, asked[r.field])}</span>
          </li>
        ))}
      </ul>
      <p className={styles.note}>
        {days === null
          ? "A launched coin's name, ticker and image are its own for a while; nobody else can launch a copy here meanwhile."
          : `Once launched, nobody else can use your coin's name, ticker or image here for ${days} ${days === 1 ? "day" : "days"}.`}
      </p>
    </section>
  );
}

function describe(r: { field: Field; verdict: CopyVerdict | null }, asked: boolean): string {
  if (!asked) return r.field === "image" ? "Add one to check it" : "Type one to check it";
  if (!r.verdict) return "Checking";
  if (r.verdict.status === "free") return r.field === "image" ? "Not a copy of a protected coin's" : "Free";
  if (r.verdict.status === "unchecked") return "Can't be read for a copy (PNG or JPEG can)";
  const of = r.verdict.of!;
  const until = new Date(of.protectedUntil).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  if (r.verdict.kind === "near") return `Too close to ${of.symbol} (${of.name}), protected until ${until}`;
  if (r.field === "image") return `A copy of ${of.symbol}'s image, protected until ${until}`;
  return `Taken by ${of.name} (${of.symbol}) until ${until}`;
}
