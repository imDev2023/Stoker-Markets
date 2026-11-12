# Traps: the shell, git, CI and the tools

Read before writing a shell or perl one-liner, driving `agent-browser`, publishing an artifact page, or merging a stacked branch.
Moved out of `CLAUDE.md` on 2026-11-12 so it is read on demand; `CLAUDE.md` keeps the index.
The text is the original's, one sentence a line.

## Shell and editing

- `grep` in this shell is aliased to ugrep with different flags; use `/usr/bin/grep` in scripts.
- Editing traps met on the rework (2026-10-28 and 2026-10-29): a `perl -0pi` replacement containing `$/` writes a NUL byte (`-0` sets `$/` to NUL; escape it as `\$\/`); a `perl` substitution delimited by `|` turns an escaped `\|` in its pattern into an alternation and matches every line that ends like the second half (`env.ts` took eight insertions that way); `tsx` adds `__name` helpers to functions, so a Playwright `addInitScript` run through `tsx` throws `__name is not defined` in the page (run such scripts through Playwright's own runner with a throwaway config); zsh does not word-split `$files` in a `for` loop (use `find -exec` or `$(...)`).
  Exact-string edits through a short Python script that asserts one match per replacement are safer than any of them.
- TypeScript is pinned to 6.0 because typescript-eslint doesn't support 7. pnpm 11 needs `allowBuilds` in `pnpm-workspace.yaml` for native deps.

## Git and CI

- A squash-merged PR conflicts with a branch stacked on it; when main equals a commit the branch already contains, `git merge -s ours origin/main` records it without touching files; but `-s ours` silently drops every commit of the merged PR the branch was cut before (api-curated was cut before #117's last commit and lost its 132 baselines that way, 2026-10-25), so check `git diff --name-only origin/main` lists only the branch's own files afterwards and cherry-pick what is missing.
  Force pushes are blocked for agents here, so merge main in rather than rebasing a pushed branch.
- Actions was off from 2026-10-07 (the owner's GitHub account flagged "ineligible for transactions", GitHub Support ticket #4832216) and runs again since 2026-11-05 at the latest (`sign-in`, `dark-default`, #173): CI's `check` (lint and typecheck) and `backend` jobs run on every push, and the UI suite never runs there (darwin baselines), so wait for CI on a PR's head and still run the suite its change touches locally, saying so in the PR.
  The repository is public since 2026-10-07; StonkFun's saved pages and social material are in the private `imDev2023/Stoker-Markets-research` and must never come back.

## The browser and artifacts

- `agent-browser screenshot` needs absolute paths.
  The nvm `agent-browser` is a symlink into another project's `node_modules` and is now and then "command not found" from a script; `/usr/local/bin/agent-browser` (Homebrew) always works.
  In zsh wrap it in a function (`b() { agent-browser --session x "$@"; }`), never a variable (no word-splitting), and never name a variable `path` in a zsh script: it is tied to `PATH`, and `path=/` left `sleep` and `agent-browser` unfound (2026-10-10).
  Firecrawl is out of credits.
  Google sign-in fails in an agent-browser window: for a site behind the owner's Google login use a Browser Use cloud browser with a saved profile (`BROWSERUSE_API_KEY` in `.env`, spelled without the second underscore), driven with `agent-browser connect <cdpUrl>`, and stop it through the API or it keeps billing.
- An `agent-browser screenshot --full` of a page taller than about 16,000px comes back scrambled (a 32k page showed the top's content at offsets 16k down); capture a long page one section at a time with a tall viewport (`set viewport 1440 5200`, open `file.html#section`, plain `screenshot`).
  A local HTML fragment without a doctype renders in quirks mode (tables stop inheriting colour), so screenshot a doctype-wrapped copy of an artifact page, which is how the artifact serves it.
- An artifact page cannot load images from other hosts, so download them and publish them as the artifact's `files`.
  Image generation (the fal.ai routes, their costs, `FAL_KEY`) is the marketing folder's concern and documented in its `CLAUDE.md`.
