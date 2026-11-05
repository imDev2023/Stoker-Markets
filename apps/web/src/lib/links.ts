import { LINK_KINDS, type LinkKind } from "@launchpad/contract";

export { LINK_KINDS, type LinkKind };

/**
 * Each link kind as the site names it and the address it starts a field with. A kind whose mark is its name (X's mark
 * is the letter) shows the mark alone in a chip, the word for assistive technology only (`LinkName`; owner, 2026-11-05:
 * "Only show X icon. No need to write X separately"); a field's label still says the word.
 */
export const LINK_INFO: Record<LinkKind, { label: string; placeholder: string; markAlone?: true }> = {
  telegram: { label: "Telegram", placeholder: "https://t.me/" },
  x: { label: "X", placeholder: "https://x.com/", markAlone: true },
  website: { label: "Website", placeholder: "https://" },
  discord: { label: "Discord", placeholder: "https://discord.gg/" },
  tiktok: { label: "TikTok", placeholder: "https://tiktok.com/@" },
  instagram: { label: "Instagram", placeholder: "https://instagram.com/" },
  youtube: { label: "YouTube", placeholder: "https://youtube.com/@" },
};

/** The kinds the launch form shows first; the rest wait behind "More links". */
export const FIRST_LINKS: readonly LinkKind[] = ["telegram", "x", "website"];
export const MORE_LINKS: readonly LinkKind[] = LINK_KINDS.filter((k) => !FIRST_LINKS.includes(k));
