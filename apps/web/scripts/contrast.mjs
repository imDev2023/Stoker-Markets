// Checks every text role against every surface it can sit on, in every direction and mode, from the tokens in
// globals.css (principle 10: AA computed from the tokens, never eyeballed). Run: node apps/web/scripts/contrast.mjs
/* global console, process, URL */
import { readFileSync } from "node:fs";

// Resolved from this file, never from the cwd, so it runs from any directory.
const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

/** The token blocks, keyed "<direction> <mode>", from the selectors and media queries that scope them. */
function blocks() {
  const out = {};
  const re = /(@media \(prefers-color-scheme: dark\) \{\s*)?:root(?:,\s*:root\[data-theme="(\w+)"\]|\[data-theme="(\w+)"\])\s*\{([^}]*)\}/g;
  for (const m of css.matchAll(re)) {
    const theme = m[2] ?? m[3];
    if (!theme) continue;
    const mode = m[1] ? "dark" : "light";
    const vars = {};
    for (const v of m[4].matchAll(/--([\w-]+):\s*([^;]+);/g)) vars[v[1]] = v[2].trim();
    out[`${theme} ${mode}`] = vars;
  }
  // The shared block (heat, up, down, caution) applies to every direction.
  const shared = { light: {}, dark: {} };
  for (const m of css.matchAll(/(@media \(prefers-color-scheme: dark\) \{\s*)?:root \{([^}]*)\}/g)) {
    const mode = m[1] ? "dark" : "light";
    for (const v of m[2].matchAll(/--([\w-]+):\s*(#[0-9a-f]{6});/g)) shared[mode][v[1]] = v[2];
  }
  for (const [key, vars] of Object.entries(out)) Object.assign(vars, shared[key.split(" ")[1]]);
  return out;
}

const hex = (s) => s.match(/^#([0-9a-f]{6})$/i)?.[1];
const rgb = (s) => {
  const h = hex(s);
  if (h) return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  const m = s.match(/^rgb\((\d+) (\d+) (\d+)(?: \/ (\d+)%)?\)$/);
  return m ? [+m[1], +m[2], +m[3], m[4] ? +m[4] / 100 : 1] : null;
};
const lum = ([r, g, b]) => {
  const f = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

/** Text roles and the surfaces each is used on (globals.css header); text needs 4.5:1, a glyph on a fill 3:1. */
const PAIRS = [
  ["ink", ["bg", "surface", "surface-2", "surface-3", "sunken", "raised"]],
  ["ink-2", ["bg", "surface", "surface-2", "surface-3", "sunken", "raised"]],
  ["ink-3", ["bg", "surface", "surface-2", "sunken", "raised"]],
  ["accent", ["bg", "surface", "surface-2", "raised"]],
  ["accent-strong", ["plate", "surface", "bg"]],
  ["on-button", ["button"]],
  ["on-accent", ["accent"], 3],
  ["brand", ["bg", "surface", "raised"]],
  ["up", ["up-bg", "surface", "bg"]],
  ["down", ["down-bg", "surface", "bg"]],
  ["caution", ["caution-bg"]],
];

let failed = 0;
for (const [key, vars] of Object.entries(blocks())) {
  const lines = [];
  for (const [text, grounds, floor = 4.5] of PAIRS) {
    const fg = rgb(vars[text] ?? "");
    if (!fg) continue;
    for (const g of grounds) {
      const bg = rgb(vars[g] ?? "");
      if (!bg) continue;
      const r = ratio(fg, bg);
      const ok = r >= floor;
      if (!ok) failed++;
      lines.push(`  ${ok ? "ok " : "AA!"} ${text.padEnd(14)} on ${g.padEnd(10)} ${r.toFixed(2)} (${floor}:1)`);
    }
  }
  console.log(`${key}\n${lines.join("\n")}`);
}
console.log(failed ? `\n${failed} pair(s) below AA` : "\nevery pair meets AA");
process.exit(failed ? 1 : 0);
