"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { HEADER_COOKIE, HEADER_VARIANTS } from "@/lib/header";

/**
 * `?header=` on any page shows one of the header candidates (unlisted, for the owner's eye; src/lib/header.ts): the
 * choice is kept as a cookie the root layout reads, so it holds across the site, and the page is refreshed once so the
 * header the server drew gives way to the one asked for. A client effect rather than a script element, for the same
 * reason as ThemeOverride.
 */
export function HeaderOverride({ current }: { current: string }) {
  const router = useRouter();
  useEffect(() => {
    const header = new URLSearchParams(window.location.search).get("header");
    if (!header || !(HEADER_VARIANTS as readonly string[]).includes(header) || header === current) return;
    document.cookie = `${HEADER_COOKIE}=${header}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }, [current, router]);
  return null;
}
