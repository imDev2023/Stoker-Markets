// Puts TradingView's Advanced Charts library (#126) into `public/charting_library/`, where the web serves it from our own
// origin, the web Worker's static assets once built. The library is private (`tradingview/charting_library`, licensed to
// the owner's site only) and this repository is public, so it is never committed: it is fetched at build time with a
// GitHub token that can read that repository, pinned to one release, and the folder is git-ignored (ADR 0017).
//
// Run: node apps/web/scripts/charting-library.mjs [--optional]
// The token is GITHUB_TOKEN or GH_TOKEN, or else the GitHub CLI's own (`gh auth token`). Without one the build fails,
// since a deploy without the library has no chart; `--optional` (the dev server) warns and leaves the chart's "not
// installed" state instead.
/* global Buffer, console, fetch, process, URL */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** The release the site is built and tested with; a new one is a change of this line and a UI run. */
export const VERSION = "v33.0.0";
const REPOSITORY = "tradingview/charting_library";

// Resolved from this file, never from the cwd, and never from a URL's pathname, which keeps %20 for the space.
const publicDir = fileURLToPath(new URL("../public", import.meta.url));
const target = join(publicDir, "charting_library");
const optional = process.argv.includes("--optional");

/** The release a folder holds, from the library's own package description ("CL v33.0.0 (internal id ...)"). */
function installedVersion() {
  try {
    const description = JSON.parse(readFileSync(join(target, "package.json"), "utf8")).description ?? "";
    return /^CL (v\d+\.\d+\.\d+)\b/.exec(description)?.[1] ?? null;
  } catch {
    return null;
  }
}

function token() {
  const env = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (env) return env;
  const gh = spawnSync("gh", ["auth", "token"], { encoding: "utf8" });
  return gh.status === 0 ? gh.stdout.trim() : null;
}

function fail(message) {
  if (optional) {
    console.warn(`charting-library: ${message}; the coin pages' chart says it is not installed.`);
    process.exit(0);
  }
  console.error(`charting-library: ${message}.`);
  process.exit(1);
}

if (installedVersion() === VERSION) process.exit(0);

const auth = token();
if (!auth) fail(`no GitHub token (GITHUB_TOKEN, GH_TOKEN or a signed-in gh) to fetch ${REPOSITORY} ${VERSION}`);

const res = await fetch(`https://api.github.com/repos/${REPOSITORY}/tarball/${VERSION}`, {
  headers: { authorization: `Bearer ${auth}`, accept: "application/vnd.github+json", "user-agent": "stoker-web-build" },
}).catch((e) => fail(`fetching ${REPOSITORY} ${VERSION} failed: ${e.message}`));
if (!res.ok) fail(`fetching ${REPOSITORY} ${VERSION} answered ${res.status}: the token needs read access to that private repository`);

// Unpacked beside the target and moved into place whole, so an interrupted fetch never leaves half a library behind.
const work = mkdtempSync(join(publicDir, ".charting_library-"));
let problem = null;
try {
  const archive = join(work, "library.tar.gz");
  writeFileSync(archive, Buffer.from(await res.arrayBuffer()));
  const tar = spawnSync("tar", ["-xzf", archive, "-C", work], { encoding: "utf8" });
  // The tarball's one top folder is named after the commit (tradingview-charting_library-<sha>).
  const top = readdirSync(work).find((name) => name !== "library.tar.gz");
  const unpacked = top ? join(work, top, "charting_library") : null;
  if (tar.status !== 0) problem = `unpacking ${REPOSITORY} ${VERSION} failed: ${tar.stderr}`;
  else if (!unpacked || !existsSync(join(unpacked, "charting_library.standalone.js"))) problem = `${REPOSITORY} ${VERSION} has no charting_library folder`;
  else {
    rmSync(target, { recursive: true, force: true });
    renameSync(unpacked, target);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
if (problem) fail(problem);

if (installedVersion() !== VERSION) fail(`the unpacked library does not say ${VERSION}`);
console.log(`charting-library: ${REPOSITORY} ${VERSION} is in apps/web/public/charting_library (never committed).`);
