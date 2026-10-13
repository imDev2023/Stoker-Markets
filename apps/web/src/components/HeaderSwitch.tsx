"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { HEADER_COOKIE, HEADERS } from "@/lib/header";

/**
 * `?header=` on any page picks one of the header candidates (src/lib/header.ts): the choice is written to a cookie the
 * root layout reads, and the page is refreshed so the server renders that header. Nothing happens without the param,
 * so the suite and every visitor see the built header.
 */
export function HeaderSwitch() {
  const router = useRouter();
  useEffect(() => {
    const kind = new URLSearchParams(window.location.search).get("header");
    if (!kind || !(HEADERS as readonly string[]).includes(kind)) return;
    if (document.documentElement.dataset.header === kind) return;
    document.cookie = `${HEADER_COOKIE}=${kind}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }, [router]);
  return null;
}
