// Fails the lint when a module sets type, a radius, a shadow or a transition outside the tokens (#131, phase 1 of the
// rework: one type role table, one radius per role, four elevations, tokenised motion; docs/design/principles.md,
// section 10). Run: node apps/web/scripts/type.mjs
/* global console, process, URL */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Resolved from this file, never from the cwd, so it runs from any directory (and never from a URL's pathname, which keeps %20).
const root = fileURLToPath(new URL("../src", import.meta.url));

function* cssFiles(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* cssFiles(path);
    else if (name.endsWith(".module.css")) yield path;
  }
}

/** Each property a module may set only through a token, and what a value may look like. */
const RULES = [
  {
    prop: "font-size",
    why: "a type step from the role table (--text-*), the pair scale (--pair-*) or the wordmark",
    ok: (v) => /^(inherit|var\(--(text|pair)-[\w-]+\)|var\(--wordmark\)|min\(var\(--(text|pair)-[\w-]+\), [^;]+\))$/.test(v),
  },
  {
    prop: "border-radius",
    why: "one radius per role (--radius-control, --radius-card, --radius-pill), a circle, or a corner nested inside one",
    ok: (v) => /^(inherit|0|50%|var\(--radius-(control|card|pill)\)|calc\(var\(--radius-(control|card)\) - \d+px\)|var\(--radius-control\) var\(--radius-control\) 0 0)$/.test(v),
  },
  {
    prop: "box-shadow",
    why: "an elevation (--shadow-sunken, --shadow-raised, --shadow-overlay), the ring, the glow, the highlight, or an inset hairline",
    ok: (v) =>
      v
        .replace(/var\(--[\w-]+\)/g, "VAR")
        .replace(/color-mix\([^)]*\)/g, "MIX")
        .split(",")
        .every((part) => /^(none|VAR|inset VAR|inset 0 0 0 (1|2|2\.5)px (VAR|MIX)|0 0 0 \d+px (VAR|MIX))$/.test(part.trim())),
  },
  {
    prop: "transition",
    why: "a duration token (--dur-fast, --dur-base, --dur-slow) and never `all`",
    ok: (v) => v === "none" || (!/\b\d+(\.\d+)?m?s\b/.test(v) && !/(^|[\s,])all([\s,]|$)/.test(v)),
  },
  {
    prop: "text-transform",
    why: "no label in capitals outside the one eyebrow in globals.css",
    ok: (v) => v !== "uppercase",
  },
  {
    prop: "font-weight",
    why: "nothing lighter than 400",
    ok: (v) => !/^[1-3]00$/.test(v),
  },
];

let failed = 0;
const sizes = new Set();
for (const file of cssFiles(root)) {
  const css = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const lines = css.split("\n");
  lines.forEach((line, i) => {
    const m = line.match(/^\s*([a-z-]+)\s*:\s*([^;]+);/);
    if (!m) return;
    const [, prop, value] = m;
    const rule = RULES.find((r) => r.prop === prop);
    if (!rule) return;
    if (prop === "font-size") sizes.add(value.trim());
    if (!rule.ok(value.trim())) {
      failed++;
      console.log(`${file.slice(root.length + 1)}:${i + 1}  ${prop}: ${value.trim()}\n    wanted ${rule.why}`);
    }
  });
}

console.log(`${sizes.size} font-size value(s) in the modules: ${[...sizes].sort().join(", ")}`);
console.log(failed ? `\n${failed} declaration(s) outside the tokens` : "\nevery module sets type, radius, shadow and motion through the tokens");
process.exit(failed ? 1 : 0);
