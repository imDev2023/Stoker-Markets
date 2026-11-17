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

/** The longest address a link may be (the contract's `optionalUrl`). */
export const LINK_MAX_LENGTH = 200;

/** A link as typed, with `https://` put before an address that names no scheme ("t.me/name"); anything else as it is. */
export function withScheme(value: string) {
  const text = value.trim();
  return text === "" || /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;
}

/**
 * What is wrong with the first link the API would refuse, in the form's words, or null: the contract takes a web
 * address over http or https, up to `LINK_MAX_LENGTH` characters, and answers anything else "invalid launch fields".
 */
export function linkProblem(links: Record<LinkKind, string>): string | null {
  for (const kind of LINK_KINDS) {
    const text = links[kind].trim();
    if (text === "") continue;
    let url: URL | null = null;
    try {
      url = new URL(text);
    } catch {
      // Not an address at all.
    }
    if (!url || !/^https?:$/.test(url.protocol) || !url.hostname.includes("."))
      return `The ${LINK_INFO[kind].label} link is not a web address. It starts with https://.`;
    if (text.length > LINK_MAX_LENGTH) return `The ${LINK_INFO[kind].label} link is longer than ${LINK_MAX_LENGTH} characters. Use a shorter address.`;
  }
  return null;
}

/** The kinds the launch form shows first; the rest wait behind "More links". */
export const FIRST_LINKS: readonly LinkKind[] = ["telegram", "x", "website"];
export const MORE_LINKS: readonly LinkKind[] = LINK_KINDS.filter((k) => !FIRST_LINKS.includes(k));
