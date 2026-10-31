"use client";

import { useEffect } from "react";
import { THEMES } from "@/lib/theme";

/**
 * `?theme=` on any page shows one of the alternate schemes without a deploy (unlisted, for the owner's eye;
 * src/lib/theme.ts). It applies after hydration, so an override view paints the built scheme for a frame first; a
 * script in the head would avoid that, but a not-found page client-renders the layout, where React never runs a
 * script element and warns about it.
 */
export function ThemeOverride() {
  useEffect(() => {
    const theme = new URLSearchParams(window.location.search).get("theme");
    if (theme && (THEMES as readonly string[]).includes(theme)) document.documentElement.setAttribute("data-theme", theme);
  }, []);
  return null;
}
