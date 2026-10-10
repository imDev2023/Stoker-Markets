/**
 * The colour direction the site is built with (docs/design/principles.md, 2026-10-10): Cobalt is the recommended one,
 * and Violet and Teal ride along for the owner's elimination. Every direction is one block of the same role tokens in
 * globals.css; `NEXT_PUBLIC_THEME` at build picks the active one, applied as `data-theme` on <html>, and `?theme=` on
 * any page shows another without a deploy (unlisted, for the owner's eye; components/ThemeOverride.tsx). A switch after
 * launch is that one setting plus a re-baseline run and re-rendered marks.
 */
export const THEMES = ["cobalt", "violet", "teal"] as const;
export type Theme = (typeof THEMES)[number];

export const DEFAULT_THEME: Theme = "cobalt";

export function themeFrom(value: string | undefined): Theme {
  return (THEMES as readonly string[]).includes(value ?? "") ? (value as Theme) : DEFAULT_THEME;
}

/** The page ground of each direction in each mode, for the browser's own chrome (`theme-color`). */
export const THEME_GROUNDS: Record<Theme, { light: string; dark: string }> = {
  cobalt: { light: "#f6f8fc", dark: "#070a12" },
  violet: { light: "#f7f6fc", dark: "#09081a" },
  teal: { light: "#f5f8f9", dark: "#05090e" },
};
