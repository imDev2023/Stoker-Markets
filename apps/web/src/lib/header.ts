/**
 * The header's candidates (#133, owner 2026-10-30): H4, the pill header that stands since 2026-10-13 and the build's
 * default, and H9, the bar the research's navigation findings ask for (five words in the bar, Developers in the footer,
 * one filled button, the search opening in place, a bottom tab bar on a phone), seen on the real site before any pick.
 * `?header=` on any page sets the cookie the root layout reads, so the choice holds across the site until the next
 * `?header=` (components/HeaderOverride.tsx); a plain module, since a server component importing from a client module
 * gets a client reference in place of the string.
 */
export const HEADER_COOKIE = "header";
export const HEADER_VARIANTS = ["h4", "h9"] as const;
export type HeaderVariant = (typeof HEADER_VARIANTS)[number];
export const headerVariantFrom = (value: string | undefined): HeaderVariant =>
  (HEADER_VARIANTS as readonly string[]).includes(value ?? "") ? (value as HeaderVariant) : "h4";
