"use client";

import { useEffect, useState } from "react";
import type { CopyCheck, CopyVerdict } from "@launchpad/contract";
import { checkCopy } from "@/lib/api";

export type CopyField = "name" | "symbol" | "image";
/** What a field's mark shows: nothing until the field has a value, then the check's answer. */
export type CopyStatus = "empty" | "pending" | "free" | "taken" | "unchecked";

const DEBOUNCE_MS = 350;

/**
 * Copy Protection (#120, ADR 0012) as the Creator types: each of the name, the ticker and the image is checked against the
 * coins launched here inside their window, and each field wears the verdict beside it (phase 5, #136: no box of empty
 * rows before anything is typed). The API gives the same answer when the form is sent, so nothing here is a surprise at
 * prepare time.
 */
export function useCopyCheck({ name, symbol, image, creator }: { name: string; symbol: string; image: File | null; creator: string | null }) {
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
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [anything, trimmedName, trimmedSymbol, image, creator]);

  const field = (f: CopyField) => {
    const verdict = asked[f] ? (result?.[f] ?? null) : null;
    const status: CopyStatus = !asked[f] ? "empty" : !verdict ? "pending" : verdict.status === "taken" ? "taken" : verdict.status === "unchecked" ? "unchecked" : "free";
    return { status, text: asked[f] ? describe(f, verdict) : null };
  };

  return {
    pending,
    /** The window every launch gets, once the API has said; null before the first answer. */
    protectionSeconds: result?.protectionSeconds ?? null,
    name: field("name"),
    symbol: field("symbol"),
    image: field("image"),
  };
}

function describe(field: CopyField, verdict: CopyVerdict | null): string {
  if (!verdict) return "Checking";
  if (verdict.status === "free") return field === "image" ? "Not a protected coin's image" : "Free";
  if (verdict.status === "unchecked") return "Can't be read for a copy (PNG or JPEG can)";
  const of = verdict.of!;
  const until = new Date(of.protectedUntil).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  if (verdict.kind === "near") return `Too close to ${of.symbol} (${of.name}), protected until ${until}`;
  if (field === "image") return `A copy of ${of.symbol}'s image, protected until ${until}`;
  return `Taken by ${of.name} (${of.symbol}) until ${until}`;
}

/** The window as words in its natural unit: "7 days" deployed, "45 seconds" on a test stack, never "0 days". */
export function windowWords(seconds: number): string {
  const unit = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  if (seconds >= 86_400 && seconds % 86_400 === 0) return unit(seconds / 86_400, "day");
  if (seconds >= 3_600 && seconds % 3_600 === 0) return unit(seconds / 3_600, "hour");
  if (seconds >= 60 && seconds % 60 === 0) return unit(seconds / 60, "minute");
  if (seconds >= 86_400) return unit(Math.round(seconds / 8_640) / 10, "day");
  return unit(seconds, "second");
}
