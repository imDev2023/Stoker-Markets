import type { ReactElement, SVGProps } from "react";

/** The sections' glyphs for the rail and the dock: 20px line icons at one stroke, drawn in the current colour. */
const Icon = ({ children, ...rest }: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
    {children}
  </svg>
);

export type IconKey = "/coins" | "/assets" | "/rewards" | "/burns" | "/revenue" | "/launch" | "api";

export const ICONS: Record<IconKey, (props: SVGProps<SVGSVGElement>) => ReactElement> = {
  /* Two coins, the pair. */
  "/coins": (p) => (
    <Icon {...p}>
      <circle cx="7.5" cy="10" r="5.25" />
      <path d="M11.6 5.3a5.25 5.25 0 1 1 0 9.4" />
    </Icon>
  ),
  "/assets": (p) => (
    <Icon {...p}>
      <rect x="3" y="3" width="6" height="6" rx="1.5" />
      <rect x="11" y="3" width="6" height="6" rx="1.5" />
      <rect x="3" y="11" width="6" height="6" rx="1.5" />
      <rect x="11" y="11" width="6" height="6" rx="1.5" />
    </Icon>
  ),
  "/rewards": (p) => (
    <Icon {...p}>
      <path d="m10 2.8 2.2 4.5 4.9.7-3.6 3.5.9 4.9L10 14.1l-4.4 2.3.9-4.9L2.9 8l4.9-.7L10 2.8Z" />
    </Icon>
  ),
  "/burns": (p) => (
    <Icon {...p}>
      <path d="M10 17.5c3.3 0 5.5-2.2 5.5-5.3 0-2.6-1.6-4.3-3-6.3-.3 1.6-1 2.6-2 3.1 0-2.4-1.1-5-3.1-6.5.2 2.5-1 3.8-2 5.3-.9 1.3-1.4 2.6-1.4 4.2 0 3.3 2.5 5.5 6 5.5Z" />
    </Icon>
  ),
  "/revenue": (p) => (
    <Icon {...p}>
      <path d="M3.5 16.5h13" />
      <path d="M5.5 13.5v-4M10 13.5v-7M14.5 13.5V3.5" />
    </Icon>
  ),
  "/launch": (p) => (
    <Icon {...p}>
      <path d="M10 4v12M4 10h12" strokeWidth="2.2" />
    </Icon>
  ),
  api: (p) => (
    <Icon {...p}>
      <path d="m7 6-4 4 4 4M13 6l4 4-4 4" />
    </Icon>
  ),
};

export function MenuGlyph({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      {open ? <path d="m5 5 10 10M15 5 5 15" /> : <path d="M3.5 6h13M3.5 10h13M3.5 14h13" />}
    </svg>
  );
}
