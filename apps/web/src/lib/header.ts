/**
 * The lighter header candidates (owner, 2026-10-25, on the merged pill header seen live: the bar is too congested), shown
 * on the real site through `?header=<id>` until the owner picks one; the built header (H4, the pill of 2026-10-13) stays
 * the default. The header is drawn by the root layout, which has no query to read, so the choice is kept in a cookie
 * that `?header=` sets (components/HeaderOverride.tsx); `?header=h4` clears it. The pick removes this file and the
 * losers' code.
 *
 * Each candidate takes things out of the bar rather than shrinking them. All four drop the cluster chip (the devnet
 * rehearsal's notice says the network, and the footer's legal line does), the toggle (the footer carries it, and the account menu once connected), the API link (the footer's
 * Developers group) and two sections (Burns and Revenue under "Treasury"); they differ in where the rest goes:
 *   h5  Trimmed: the same arrangement, the search a glyph until pressed.
 *   h6  Two tiers: the wordmark and the actions above, the sections as tabs in one thin tier below.
 *   h7  One pill: the search is the pill's last segment and the pill becomes the field.
 *   h8  Launch in the pill: "Stoke a coin" is the pill's filled last segment; the bar's right holds the search and the account.
 */
export const HEADER_COOKIE = "header";
export const HEADERS = ["h5", "h6", "h7", "h8"] as const;
export type HeaderCandidate = (typeof HEADERS)[number];

export function headerFrom(value: string | undefined): HeaderCandidate | null {
  return (HEADERS as readonly string[]).includes(value ?? "") ? (value as HeaderCandidate) : null;
}
