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

/** The header's links, in order; the footer repeats them under "Explore". */
export const NAV_LINKS = [
  { href: "/", label: "Coins" },
  { href: "/launch", label: "Launch a coin" },
  { href: "/rewards", label: "Rewards" },
  { href: "/burns", label: "Burns" },
  { href: "/revenue", label: "Revenue" },
  { href: "/creator", label: "Creator Fee" },
] as const;

export const FOOTER_GROUPS = [
  { title: "Explore", links: [...NAV_LINKS, { href: "/announcements", label: "Announcements" }] },
  {
    title: "Creators",
    links: [
      { href: "/launch", label: "Launch a coin" },
      { href: "/creator", label: "Your Creator Fee" },
      { href: "/docs/claim-creator-fee", label: "How to claim without the site" },
    ],
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
