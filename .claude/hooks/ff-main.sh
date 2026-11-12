#!/usr/bin/env bash
# SessionStart hook: fast-forward the main checkout so a session starts on the current CLAUDE.md.
# It only ever fast-forwards, only on `main`, only when no tracked file is modified and nothing
# (a dev stack, a suite) runs from this checkout, since a pull would hot-reload the API or the web
# under a run. It never blocks a session: every path exits 0. Its stdout reaches the session as context.
set -u

dir="${CLAUDE_PROJECT_DIR:-}"
[ -n "$dir" ] && [ -d "$dir" ] || exit 0
cd "$dir" 2>/dev/null || exit 0
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0
[ "$(git symbolic-ref --quiet --short HEAD 2>/dev/null)" = "main" ] || exit 0

# A fetch that cannot connect or stalls must not hold the session: git gives up by its own timeouts
# (a stalled HTTPS transfer after 5 s, an SSH connection after 5 s), nothing is killed from here, and
# the hook's own timeout in .claude/settings.json is the outer bound. A failed fetch is silent.
GIT_TERMINAL_PROMPT=0 GIT_SSH_COMMAND="ssh -o BatchMode=yes -o ConnectTimeout=5" \
  git -c http.lowSpeedLimit=1000 -c http.lowSpeedTime=5 fetch origin main --quiet >/dev/null 2>&1 || exit 0

old="$(git rev-parse --short HEAD 2>/dev/null)" || exit 0
behind="$(git rev-list --count HEAD..origin/main 2>/dev/null)" || exit 0
[ "${behind:-0}" -gt 0 ] 2>/dev/null || exit 0

stale() {
  echo "main is $behind commits behind origin/main and was not fast-forwarded because $1; the loaded CLAUDE.md may be stale."
  exit 0
}

[ -z "$(git status --porcelain --untracked-files=no 2>/dev/null)" ] || stale "tracked files are modified or staged"
git merge-base --is-ancestor HEAD origin/main 2>/dev/null || stale "local main has commits origin/main lacks"

# A dev or test process of this checkout: its command line names the checkout, or its working directory is inside it.
top="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
running=""
while IFS= read -r line; do
  pid="${line%% *}"
  cmd="${line#* }"
  # A shell only carries the text of what it was asked to run; the process it started is listed itself.
  exe="${cmd%% *}"
  case "${exe##*/}" in
    sh|bash|zsh|-sh|-bash|-zsh|fish|ps|sed|grep|rg) continue ;;
  esac
  case "$cmd" in
    *wrangler*|*workerd*|*next\ dev*|*next-server*|*vitest*|*playwright*|*tsx*|*solana-test-validator*|*surfpool*) ;;
    *) continue ;;
  esac
  case "$cmd" in
    *"$top/.claude/worktrees/"*) continue ;;
    *"$top"*) running="$pid"; break ;;
  esac
  cwd="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p')"
  case "$cwd" in
    "$top/.claude/worktrees/"*) ;;
    "$top"|"$top"/*) running="$pid"; break ;;
  esac
done < <(ps -axo pid=,command= 2>/dev/null | sed 's/^ *//')
[ -z "$running" ] || stale "a dev or test process (pid $running) is running from this checkout"

changed="$(git diff --name-only HEAD origin/main -- CLAUDE.md docs/agents 2>/dev/null)"
git merge --ff-only --quiet origin/main >/dev/null 2>&1 || stale "the fast-forward failed"
new="$(git rev-parse --short HEAD 2>/dev/null)"

if [ -n "$changed" ]; then
  what="CLAUDE.md"
  case "$changed" in
    *docs/agents*) case "$changed" in *CLAUDE.md*) what="CLAUDE.md and docs/agents" ;; *) what="docs/agents" ;; esac ;;
  esac
  echo "fast-forwarded main from $old to $new; $what changed, re-read it."
else
  echo "fast-forwarded main from $old to $new."
fi
exit 0
