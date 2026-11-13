// Every table has Row-Level Security and no table ships without it (#201). The API reaches Postgres as the tables'
// owner, whom it does not apply to; with no policy every other role gets nothing, so a hosted Postgres's own HTTP API
// over the same schema (Supabase's Data API, on by default) has nothing to give away. This check reads the latest
// migration snapshot, which drizzle-kit writes from packages/db/src/schema.ts, and fails the lint when a table in it
// was declared without `.enableRLS()`.
//
// `node scripts/row-security.mjs [snapshot.json]`: the latest snapshot of packages/db/migrations unless one is named.
/* global console, process */
import { readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const meta = resolve(root, "packages/db/migrations/meta");

function latestSnapshot() {
  const { entries } = JSON.parse(readFileSync(resolve(meta, "_journal.json"), "utf8"));
  const last = entries.reduce((a, b) => (b.idx > a.idx ? b : a));
  return resolve(meta, `${String(last.idx).padStart(4, "0")}_snapshot.json`);
}

const file = process.argv[2] ? resolve(process.cwd(), process.argv[2]) : latestSnapshot();
const tables = Object.values(JSON.parse(readFileSync(file, "utf8")).tables);
const name = relative(root, file);

if (tables.length === 0) {
  console.error(`Row-Level Security: ${name} names no table, so there is nothing to check; is it a drizzle-kit snapshot?`);
  process.exit(1);
}

const open = tables.filter((t) => t.isRLSEnabled !== true).map((t) => (t.schema ? `${t.schema}.${t.name}` : t.name)).sort();
if (open.length) {
  console.error(
    `Row-Level Security: ${open.length} of ${tables.length} tables in ${name} lack it:\n` +
      open.map((t) => `  ${t}\n`).join("") +
      "Declare each with .enableRLS() in packages/db/src/schema.ts, then `pnpm --filter @launchpad/db generate`.\n" +
      "The API connects as the tables' owner, so nothing of ours changes; any other role reads nothing (#201).",
  );
  process.exit(1);
}
console.log(`Row-Level Security: on all ${tables.length} tables in ${name}.`);
