import type { ReactNode } from "react";
import { OG_FONTS } from "./ogFonts";

/**
 * What every share card is made of (#83): the size, Teal's dark canvas and inks, the fonts and the mark. A card is one
 * image in every mode and on every host, drawn by `next/og` (Satori lays it out, so every box is a flex box and every
 * style is one Satori knows), the way the site draws the same things in CSS.
 */
export const SHARE_SIZE = { width: 1200, height: 630 };

/** Teal's dark block of globals.css, fixed here. */
export const CARD = {
  canvas: "#05090e",
  surface: "#0b1219",
  line: "rgba(255, 255, 255, 0.1)",
  ink: "#eaf3f5",
  ink2: "#a3b4bc",
  ink3: "#768a94",
  accent: "#2fd3c0",
  heatLow: "#ffb020",
  heatHigh: "#ff5a1f",
} as const;

export const DISPLAY = "Bricolage Grotesque";
export const BODY = "Instrument Sans";

type Font = { name: string; weight: 500 | 700 | 800; style: "normal"; data: ArrayBuffer };
let fonts: Font[] | undefined;

/** The fonts a card is set in, decoded once from the bundled subsets (scripts/og-fonts.py). */
export function shareFonts(): Font[] {
  fonts ??= OG_FONTS.map((f) => ({ name: f.name, weight: f.weight, style: "normal", data: decode(f.data) }));
  return fonts;
}

function decode(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

// Mark.tsx's drawing without its tile, which on the canvas is the canvas itself; the bloom is the ring's own glow.
const RING_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><defs>` +
  `<linearGradient id="h" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="${CARD.heatHigh}"/><stop offset="1" stop-color="${CARD.heatLow}"/></linearGradient>` +
  `<filter id="b" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="2.4"/></filter></defs>` +
  `<circle cx="16" cy="16" r="8.6" fill="none" stroke="url(#h)" stroke-width="4.2" filter="url(#b)" opacity="0.6"/>` +
  `<circle cx="16" cy="16" r="8.6" fill="none" stroke="url(#h)" stroke-width="4.2"/></svg>`;

/** The heating ring as an image Satori can place. */
export const RING = `data:image/svg+xml;base64,${btoa(RING_SVG)}`;

/** The display size a pair fits a card's column at: 100px for a short one, less for a long ticker, never under 44px. */
export function pairSize(pair: string, room = 690) {
  return Math.round(Math.max(44, Math.min(100, room / (pair.length * 0.66))));
}

/**
 * The frame every card shares: the canvas with the hero's glow at its top left, the content, and along the foot the
 * mark with the wordmark and the site's domain.
 */
export function ShareFrame({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        width: "100%", height: "100%", display: "flex", flexDirection: "column", position: "relative", padding: "56px 64px 120px",
        background: CARD.canvas, color: CARD.ink, fontFamily: BODY, fontWeight: 500,
      }}
    >
      <div
        style={{
          position: "absolute", left: -180, top: -320, width: 860, height: 760, display: "flex",
          background: "radial-gradient(circle at 50% 50%, rgba(47, 211, 192, 0.22) 0%, rgba(47, 211, 192, 0) 62%)",
        }}
      />
      {children}
      <div style={{ position: "absolute", left: 64, bottom: 44, display: "flex", alignItems: "center", gap: 10 }}>
        <img src={RING} width={48} height={48} alt="" />
        <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 36, color: CARD.ink }}>Stoker</span>
      </div>
      <div style={{ position: "absolute", right: 64, bottom: 54, display: "flex", fontSize: 24, color: CARD.ink3 }}>stoker.markets</div>
    </div>
  );
}
