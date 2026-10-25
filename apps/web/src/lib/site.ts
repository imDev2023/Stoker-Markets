/**
 * Where the site points outside itself: the socials, the contact address and the public docs. The header and the
 * footer read from here, so a link is changed in one place.
 *
 * PLACEHOLDERS (owner, 2026-10-07): the X and Telegram addresses are the handles the owner intends and may not exist
 * yet; replace them before the site opens.
 */
export const SITE_LINKS = {
  x: { label: "X", href: "https://x.com/stokermarkets" },
  telegram: { label: "Telegram", href: "https://t.me/stokermarkets" },
  github: { label: "GitHub", href: "https://github.com/imDev2023/Stoker-Markets" },
  apiDocs: { label: "API docs", href: "https://github.com/imDev2023/Stoker-Markets/blob/main/docs/api.md" },
  email: "info@stoker.markets",
} as const;

/** Launching is the header's one button, not a link among the others; every launch button says this (owner, 2026-10-09). */
export const LAUNCH_LINK = { href: "/launch", label: "Stoke a coin" } as const;

/** The header's plain links, in order (owner, 2026-10-25: the board's link reads "Explore"); the footer repeats them under "Site", the launch link among them. */
export const NAV_LINKS = [
  { href: "/coins", label: "Explore" },
  { href: "/assets", label: "Assets" },
  { href: "/rewards", label: "Rewards" },
  { href: "/burns", label: "Burns" },
  { href: "/revenue", label: "Revenue" },
] as const;

/**
 * The lighter header candidates' sections (src/lib/header.ts; the names are the owner's, 2026-10-25): Burns and
 * Revenue under "Ledger", the glossary's word for the public record they are both entries on, current on either page,
 * and the API link left to the footer's Developers group.
 */
export const LIGHT_NAV_LINKS = [
  { href: "/coins", label: "Explore" },
  { href: "/assets", label: "Assets" },
  { href: "/rewards", label: "Rewards" },
  { href: "/revenue", label: "Ledger", also: "/burns" },
] as const;

export type NavLink = { href: string; label: string; also?: string };

// A Creator's earnings page is their own (owner, 2026-10-08): nothing links to it but the account menu, once the
// connected wallet has launched a coin.
export const FOOTER_GROUPS = [
  { title: "Site", links: [NAV_LINKS[0], LAUNCH_LINK, ...NAV_LINKS.slice(1), { href: "/announcements", label: "Announcements" }] },
  {
    title: "Creators",
    links: [LAUNCH_LINK],
  },
  {
    title: "Developers",
    links: [SITE_LINKS.apiDocs, SITE_LINKS.github],
  },
  {
    title: "Community",
    links: [SITE_LINKS.x, SITE_LINKS.telegram, { href: `mailto:${SITE_LINKS.email}`, label: SITE_LINKS.email }],
  },
] as const;
