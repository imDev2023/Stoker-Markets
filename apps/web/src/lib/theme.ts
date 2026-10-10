/**
 * The colour scheme the site is built with (owner, 2026-10-09): Graphite is the primary, and Oxblood and Midnight ride
 * along as alternates. Every scheme is one block of the same role tokens in globals.css; `NEXT_PUBLIC_THEME` at build
 * picks the active one, applied as `data-theme` on <html>, and `?theme=` on any page shows an alternate without a deploy
 * (unlisted, for the owner's eye; components/ThemeOverride.tsx). A switch after launch is that one setting plus a
 * re-baseline run and re-rendered marks.
 */
export const THEMES = ["graphite", "oxblood", "midnight"] as const;
export type Theme = (typeof THEMES)[number];

export const DEFAULT_THEME: Theme = "graphite";

export function themeFrom(value: string | undefined): Theme {
  return (THEMES as readonly string[]).includes(value ?? "") ? (value as Theme) : DEFAULT_THEME;
}

/** The page ground of each scheme in each mode, for the browser's own chrome (`theme-color`). */
export const THEME_GROUNDS: Record<Theme, { light: string; dark: string }> = {
  graphite: { light: "#f4f3f0", dark: "#141312" },
  oxblood: { light: "#f6f3f0", dark: "#110e10" },
  midnight: { light: "#f3f5f9", dark: "#0a0e1a" },
};
