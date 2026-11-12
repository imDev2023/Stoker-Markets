// CLAUDE.md is loaded whole into every agent session, so it stays an index:
// the frontier, the hard rules and pointers into docs/agents. This check fails
// the lint when it grows past the cap, so detail goes to the files it points at.
/* global console, process */
import { statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const LIMIT_BYTES = 20_000;
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const file = resolve(root, "CLAUDE.md");
const { size } = statSync(file);

if (size > LIMIT_BYTES) {
  console.error(
    `CLAUDE.md is ${size} bytes, over the ${LIMIT_BYTES} byte cap.\n` +
      "Move detail to docs/agents (traps/, settled.md, code-map.md, history.md) and keep one line here.",
  );
  process.exit(1);
}
console.log(`CLAUDE.md: ${size} of ${LIMIT_BYTES} bytes.`);
