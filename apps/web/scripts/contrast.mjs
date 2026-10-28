// Checks every text role against every fill it can sit on, in every direction, mode and hue candidate, from the tokens
// in globals.css: WCAG AA (4.5:1 for text, 3:1 for a glyph on a fill) and APCA (Lc 75 for body text, Lc 60 for the
// smaller text people must read, Lc 15 for a hairline), the two rulers the research asks for (principles, section 7;
// the dark theme needs the perceptual one). Also that the accent and the up colour sit at least 30 degrees of hue
// apart. Run: node apps/web/scripts/contrast.mjs
/* global console, process, URL */
import { readFileSync } from "node:fs";

// Resolved from this file, never from the cwd, so it runs from any directory.
const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/**
 * Every rule that sets custom properties, with where it applies: a direction (or every one), a mode, or the hue
 * candidate. Light blocks sit at the top level; dark ones under the media query (and again pinned by data-scheme).
 */
function rules() {
  const out = [];
  const re = /(@media \(prefers-color-scheme: dark\) \{\s*)?((?::root[^{]*))\{([^}]*)\}/g;
  for (const m of css.matchAll(re)) {
    const selector = m[2].replace(/\s+/g, " ").trim();
    const vars = {};
    for (const v of m[3].matchAll(/--([\w-]+):\s*([^;]+);/g)) vars[v[1]] = v[2].trim();
    if (!Object.keys(vars).length) continue;
    const dark = Boolean(m[1]) || /data-scheme="dark"/.test(selector);
    const theme = selector.match(/data-theme="(\w+)"/)?.[1] ?? null;
    const hue = /data-hue="accent"/.test(selector);
    out.push({ theme, dark, hue, vars });
  }
  return out;
}

const THEMES = ["teal", "cobalt", "violet"];

/** The resolved token set of one variant: the shared block, the direction's block, and the hue candidate's over them. */
function variant(theme, dark, hue) {
  const vars = {};
  for (const r of rules()) {
    if (r.dark !== dark) continue;
    if (r.hue) continue;
    if (r.theme === null || r.theme === theme) Object.assign(vars, r.vars);
  }
  if (hue) for (const r of rules()) if (r.hue && r.dark === dark) Object.assign(vars, r.vars);
  // The on-pairs point at other roles; follow them.
  for (let pass = 0; pass < 4; pass++) {
    for (const [k, v] of Object.entries(vars)) {
      const ref = v.match(/^var\(--([\w-]+)\)$/);
      if (ref && vars[ref[1]]) vars[k] = vars[ref[1]];
    }
  }
  return vars;
}

const hex = (s) => s.match(/^#([0-9a-f]{6})$/i)?.[1];
/** A colour as [r, g, b, alpha], from a hex or an `rgb(r g b / a%)`. */
const rgba = (s) => {
  const h = hex(s);
  if (h) return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).concat(1);
  const m = s.match(/^rgb\((\d+) (\d+) (\d+)(?: \/ (\d+)%)?\)$/);
  return m ? [+m[1], +m[2], +m[3], m[4] ? +m[4] / 100 : 1] : null;
};
/** A translucent colour laid over an opaque ground. */
const over = (fg, bg) => fg.slice(0, 3).map((c, i) => Math.round(c * fg[3] + bg[i] * (1 - fg[3])));

const lum = ([r, g, b]) => {
  const f = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

/** APCA (SAPC-4g, 0.0.98G): the perceptual lightness contrast of text on a background, as |Lc|. */
function apca(text, bg) {
  const y = ([r, g, b]) => 0.2126729 * (r / 255) ** 2.4 + 0.7151522 * (g / 255) ** 2.4 + 0.072175 * (b / 255) ** 2.4;
  const clamp = (v) => (v <= 0.022 ? v + (0.022 - v) ** 1.414 : v);
  const yt = clamp(y(text));
  const yb = clamp(y(bg));
  if (Math.abs(yb - yt) < 0.0005) return 0;
  let out;
  if (yb > yt) {
    const s = (yb ** 0.56 - yt ** 0.57) * 1.14;
    out = s < 0.1 ? 0 : s - 0.027;
  } else {
    const s = (yb ** 0.65 - yt ** 0.62) * 1.14;
    out = s > -0.1 ? 0 : s + 0.027;
  }
  return Math.abs(out * 100);
}

/** The hue of a colour in degrees, for the accent-against-up rule. */
function hueOf([r, g, b]) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60) % 360;
}

/**
 * Text roles and the fills each sits on, with the floors: the WCAG ratio and the APCA Lc. Body text (ink, ink-2) wants
 * Lc 75; the small text people must read (ink-3's captions, a tag's text, a button's word) Lc 60; a glyph on a fill 3:1.
 */
const PAIRS = [
  ["ink", ["bg", "surface", "surface-2", "surface-3", "sunken", "raised"], 4.5, 75],
  ["ink-2", ["bg", "surface", "surface-2", "surface-3", "sunken", "raised"], 4.5, 75],
  ["ink-3", ["bg", "surface", "surface-2", "sunken", "raised"], 4.5, 60],
  ["accent", ["bg", "surface", "surface-2", "raised"], 4.5, 60],
  ["on-plate", ["plate"], 4.5, 60],
  ["on-button", ["button"], 4.5, 60],
  ["on-accent", ["accent"], 3, 45],
  ["on-up-bg", ["up-bg"], 4.5, 60],
  ["on-down-bg", ["down-bg"], 4.5, 60],
  ["on-caution-bg", ["caution-bg"], 4.5, 60],
    ["on-tile", ["tile"], 4.5, 60],
  ["brand", ["bg", "surface", "raised"], 4.5, 60],
  ["up", ["surface", "bg"], 4.5, 60],
  ["down", ["surface", "bg"], 4.5, 60],
];
/** Hairlines want Lc 15 against the surface they sit on. */
const LINES = [["line", ["surface", "bg", "sunken"], 15]];

// The alternates (Cobalt, Violet) ride along unpicked: their misses are printed, only the active direction fails the lint.
let failed = 0;
let warned = 0;
const variants = [];
for (const theme of THEMES) for (const dark of [false, true]) variants.push([theme, dark, false]);
for (const dark of [false, true]) variants.push(["teal", dark, true]);

for (const [theme, dark, hue] of variants) {
  const vars = variant(theme, dark, hue);
  const key = `${theme} ${dark ? "dark" : "light"}${hue ? " (hue: accent)" : ""}`;
  const lines = [];
  const colour = (name, ground) => {
    const c = rgba(vars[name] ?? "");
    if (!c) return null;
    return c[3] < 1 && ground ? over(c, ground) : c.slice(0, 3);
  };
  for (const [text, grounds, floor, lc] of PAIRS) {
    for (const g of grounds) {
      const bg = colour(g);
      const fg = bg && colour(text, bg);
      if (!fg || !bg) continue;
      const r = ratio(fg, bg);
      const l = apca(fg, bg);
      const ok = r >= floor && l >= lc;
      if (theme === "teal") failed += ok ? 0 : 1;
      else warned += ok ? 0 : 1;
      lines.push(`  ${ok ? "ok " : "NO "} ${text.padEnd(14)} on ${g.padEnd(10)} ${r.toFixed(2)}:1 (${floor})  Lc ${l.toFixed(0).padStart(3)} (${lc})`);
    }
  }
  for (const [line, grounds, lc] of LINES) {
    for (const g of grounds) {
      const bg = colour(g);
      const fg = bg && colour(line, bg);
      if (!fg || !bg) continue;
      const l = apca(fg, bg);
      // APCA reads a hairline on a near-black canvas as nothing (its floor clamps to zero), so a dark hairline is a warning, not a failure.
      const ok = l >= lc;
      if (!dark && theme === "teal") failed += ok ? 0 : 1;
      else warned += ok ? 0 : 1;
      lines.push(`  ${ok ? "ok " : (dark ? "wrn" : "NO ")} ${line.padEnd(14)} on ${g.padEnd(10)} hairline Lc ${l.toFixed(0).padStart(3)} (${lc})`);
    }
  }
  const accent = colour("accent");
  const up = colour("up");
  if (accent && up) {
    const apart = Math.abs(((hueOf(accent) - hueOf(up) + 540) % 360) - 180);
    const ok = apart >= 30;
    if (theme === "teal") failed += ok ? 0 : 1;
      else warned += ok ? 0 : 1;
    lines.push(`  ${ok ? "ok " : "NO "} accent and up ${apart.toFixed(0)} degrees of hue apart (30)`);
  }
  console.log(`${key}\n${lines.join("\n")}`);
}
console.log(`\n${warned} warning(s) on the alternates and the dark hairlines`);
console.log(failed ? `${failed} check(s) below the floor in Teal` : "every Teal pair meets AA and APCA, and the accent sits clear of up");
process.exit(failed ? 1 : 0);
