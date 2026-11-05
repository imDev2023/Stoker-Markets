import { LINK_INFO, type LinkKind } from "@/lib/links";

/**
 * One mark per link kind, drawn at one size and one stroke so they sit level beside a field, in a chip or in the
 * summary: the X and Telegram marks the site's socials already use, a globe for a website, and Discord, TikTok,
 * Instagram and YouTube in the same weight. Decorative: the word beside it (`LinkName`) carries the name.
 */
export function LinkIcon({ kind, size = 16, className }: { kind: LinkKind; size?: number; className?: string }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", className, "aria-hidden": true as const, focusable: false };
  switch (kind) {
    case "x":
      return (
        <svg {...common}>
          <path fill="currentColor" d="M18.9 2H22l-7.1 8.1L23 22h-6.6l-5.2-6.7L5.3 22H2.2l7.6-8.6L2 2h6.8l4.7 6.2L18.9 2Zm-1.1 18h1.7L7.3 3.9H5.5L17.8 20Z" />
        </svg>
      );
    case "telegram":
      return (
        <svg {...common}>
          <path fill="currentColor" d="M21.6 3.3 2.9 10.5c-1.1.4-1.1 1.1-.2 1.4l4.7 1.5 1.8 5.6c.2.6.1.8.7.8.5 0 .7-.2 1-.5l2.3-2.2 4.7 3.5c.9.5 1.5.2 1.7-.8l3.1-14.7c.3-1.3-.5-1.8-1.1-1.8Zm-3.4 4.3-8.6 7.8-.3 3.2-1.5-4.7 10-6.3c.5-.3.9 0 .4.3v-.3Z" />
        </svg>
      );
    case "website":
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
        </svg>
      );
    case "discord":
      return (
        <svg {...common}>
          <path fill="currentColor" d="M19.5 5.6a16.4 16.4 0 0 0-4-1.3l-.5 1a15.3 15.3 0 0 0-6 0l-.5-1a16.4 16.4 0 0 0-4 1.3C2 9.4 1.3 13.1 1.6 16.7a16.6 16.6 0 0 0 5 2.5l1-1.6a10.5 10.5 0 0 1-1.6-.8l.4-.3a11.8 11.8 0 0 0 11.2 0l.4.3c-.5.3-1 .6-1.6.8l1 1.6a16.6 16.6 0 0 0 5-2.5c.4-4.2-.7-7.8-2.9-11.1ZM8.7 14.5c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Zm6.6 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Z" />
        </svg>
      );
    case "tiktok":
      return (
        <svg {...common}>
          <path fill="currentColor" d="M16.6 2h-3.1v13.4a2.9 2.9 0 1 1-2.9-2.9c.3 0 .6 0 .9.1V9.5a6 6 0 1 0 5.1 5.9V8.6a7.2 7.2 0 0 0 4.2 1.3V6.8A4.2 4.2 0 0 1 16.6 2Z" />
        </svg>
      );
    case "instagram":
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.4" cy="6.6" r="0.9" fill="currentColor" stroke="none" />
        </svg>
      );
    case "youtube":
      return (
        <svg {...common}>
          <path fill="currentColor" d="M22.5 7.2a2.8 2.8 0 0 0-2-2C18.8 4.8 12 4.8 12 4.8s-6.8 0-8.5.4a2.8 2.8 0 0 0-2 2A29 29 0 0 0 1 12a29 29 0 0 0 .5 4.8 2.8 2.8 0 0 0 2 2c1.7.4 8.5.4 8.5.4s6.8 0 8.5-.4a2.8 2.8 0 0 0 2-2A29 29 0 0 0 23 12a29 29 0 0 0-.5-4.8ZM9.8 15.1V8.9l5.7 3.1-5.7 3.1Z" />
        </svg>
      );
  }
}

/** A link kind's name in a chip: the word, or, where the mark is the word (X), text for assistive technology alone. */
export function LinkName({ kind }: { kind: LinkKind }) {
  const info = LINK_INFO[kind];
  return info.markAlone ? <span className="visually-hidden">{info.label}</span> : <>{info.label}</>;
}
