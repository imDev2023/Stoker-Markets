"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { HEADER_COOKIE, headerFrom, type HeaderCandidate } from "@/lib/header";

/**
 * `?header=<id>` on any page keeps one of the lighter header candidates (src/lib/header.ts) in a cookie and redraws the
 * page from the server, where the root layout reads it; `?header=h4` (or any other word) clears it. Unlisted, for the
 * owner's eye, like `?theme=`; the pick removes it.
 */
export function HeaderOverride({ current }: { current: HeaderCandidate | null }) {
  const router = useRouter();
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("header");
    if (wanted === null) return;
    const next = headerFrom(wanted);
    if (next === current) return;
    document.cookie = next ? `${HEADER_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax` : `${HEADER_COOKIE}=; path=/; max-age=0`;
    router.refresh();
  }, [current, router]);
  return null;
}
