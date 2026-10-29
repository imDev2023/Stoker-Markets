/**
 * Where the site points outside itself: the socials, the contact address and the repository. The header and the
 * footer read from here, so a link is changed in one place.
 *
 * PLACEHOLDERS (owner, 2026-10-07): the X and Telegram addresses are the handles the owner intends and may not exist
 * yet; replace them before the site opens.
 */
export const SITE_LINKS = {
  x: { label: "X", href: "https://x.com/stokermarkets" },
  telegram: { label: "Telegram", href: "https://t.me/stokermarkets" },
  github: { label: "GitHub", href: "https://github.com/imDev2023/Stoker-Markets" },
  email: "info@stoker.markets",
} as const;

/** Launching is the header's one button, not a link among the others; every launch button says this (owner, 2026-10-09). */
export const LAUNCH_LINK = { href: "/launch", label: "Stoke a coin" } as const;

export type NavLink = { href: string; label: string; also?: string };

/**
 * The header's sections, in order (owner, 2026-10-25: the board's link reads "Explore"; "Curated" is the platform's
 * own approved launches, open to STOKER stakers, #118; Burns and Revenue sit under "Stats" (owner, 2026-10-25, renamed
 * from Ledger the same night; the Ledger stays the glossary's word for the public record), current on either page).
 */
export const NAV_LINKS = [
  { href: "/coins", label: "Explore" },
  { href: "/curated", label: "Curated" },
  { href: "/assets", label: "Assets" },
  { href: "/rewards", label: "Rewards" },
  { href: "/revenue", label: "Stats", also: "/burns" },
] as const satisfies readonly NavLink[];

/**
 * The API's reference is a page of the site (owner, 2026-10-25: everything on the page, no link out to the repository),
 * set last in the pill and the menu as "Developers" (owner, 2026-10-25), and in the footer as "API".
 */
export const API_LINK = { href: "/api", label: "Developers" } as const satisfies NavLink;

/** The legal pages (#131): drafts the owner approves before the site opens, linked from both footers. */
export const LEGAL_LINKS = [
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/risk", label: "Risk disclosure" },
] as const satisfies readonly NavLink[];

/**
 * The landing's footer, grouped by audience (#131, after the research's footers): what a trader opens, what a creator
 * opens, the platform's own records, and the legal pages with the contact. A Creator's earnings page is their own
 * (owner, 2026-10-08): nothing links to it but the account menu, once the connected wallet has launched a coin.
 */
export const FOOTER_GROUPS = [
  { title: "Trade", links: [NAV_LINKS[0], NAV_LINKS[2], NAV_LINKS[3]] },
  { title: "Create", links: [LAUNCH_LINK, NAV_LINKS[1]] },
  {
    title: "Platform",
    links: [
      { href: "/revenue", label: "Revenue" },
      { href: "/burns", label: "Burns" },
      { href: "/announcements", label: "Announcements" },
      { href: API_LINK.href, label: "API" },
      SITE_LINKS.github,
    ],
  },
  { title: "Legal", links: [...LEGAL_LINKS, { href: `mailto:${SITE_LINKS.email}`, label: "Contact" }] },
] as const;

/** The one-row footer of every terminal page: the developers' page and the legal pages, so the page ends with its data. */
export const COMPACT_FOOTER_LINKS = [{ href: API_LINK.href, label: "API" }, ...LEGAL_LINKS] as const satisfies readonly NavLink[];
