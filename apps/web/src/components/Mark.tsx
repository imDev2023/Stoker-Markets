import { useId } from "react";

/**
 * The mark inline (owner, 2026-10-09): E2, the heating ring, the same drawing as /icon.svg. Inline so it is crisp at any
 * size and needs no request. The ring's ramp is fixed (the heat is the same in every direction and mode); the tile is
 * the direction's dark canvas (`--tile`, docs/design/principles.md), so one mark serves both modes and the tile never
 * reads as a mistake beside the page. Gradient and filter ids are per instance, since a page can carry several marks.
 */
export function Mark({ size = 28, className }: { size?: number; className?: string }) {
  const id = useId();
  const heat = `${id}h`;
  const bloom = `${id}b`;
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={className} aria-hidden="true">
      <defs>
        <linearGradient id={heat} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#ff5a1f" />
          <stop offset="1" stopColor="#ffb020" />
        </linearGradient>
        <filter id={bloom} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.6" />
        </filter>
      </defs>
      <rect width="32" height="32" rx="7" fill="var(--tile)" />
      <circle cx="16" cy="16" r="8.6" fill="none" stroke={`url(#${heat})`} strokeWidth="4.2" filter={`url(#${bloom})`} opacity="0.75" />
      <circle cx="16" cy="16" r="8.6" fill="none" stroke={`url(#${heat})`} strokeWidth="4.2" />
    </svg>
  );
}

/**
 * The ring alone, at size, for an empty state or an error: the same drawing without its tile, its bloom wider so it
 * glows on the surface it sits on (principles, section 7: "the ring at size on surface-2 with one line and the action").
 */
export function Ring({ size = 96, className }: { size?: number; className?: string }) {
  const id = useId();
  const heat = `${id}h`;
  const bloom = `${id}b`;
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={className} aria-hidden="true">
      <defs>
        <linearGradient id={heat} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#ff5a1f" />
          <stop offset="1" stopColor="#ffb020" />
        </linearGradient>
        <filter id={bloom} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="2.4" />
        </filter>
      </defs>
      <circle cx="16" cy="16" r="8.6" fill="none" stroke={`url(#${heat})`} strokeWidth="4.2" filter={`url(#${bloom})`} opacity="0.6" />
      <circle cx="16" cy="16" r="8.6" fill="none" stroke={`url(#${heat})`} strokeWidth="4.2" />
    </svg>
  );
}
