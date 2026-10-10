import { useId } from "react";

/**
 * The mark inline (owner, 2026-10-09): E2, the heating ring on the dark graphite tile, the same drawing as /icon.svg.
 * Inline so it is crisp at any size and needs no request; the tile is dark in both modes, so the ring's ramp is fixed
 * rather than read from the theme. Gradient and filter ids are per instance, since a page can carry several marks.
 */
export function Mark({ size = 28, className }: { size?: number; className?: string }) {
  const id = useId();
  const heat = `${id}h`;
  const bloom = `${id}b`;
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={className} aria-hidden="true">
      <defs>
        <linearGradient id={heat} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#ff6a2a" />
          <stop offset="1" stopColor="#ffb020" />
        </linearGradient>
        <filter id={bloom} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.6" />
        </filter>
      </defs>
      <rect width="32" height="32" rx="7" fill="#141312" />
      <circle cx="16" cy="16" r="8.6" fill="none" stroke={`url(#${heat})`} strokeWidth="4.2" filter={`url(#${bloom})`} opacity="0.75" />
      <circle cx="16" cy="16" r="8.6" fill="none" stroke={`url(#${heat})`} strokeWidth="4.2" />
    </svg>
  );
}
