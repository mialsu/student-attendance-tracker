#!/usr/bin/env bash
# One-time setup for a fresh clone of this monorepo. Idempotent: safe to re-run.
#
# WHY THIS EXISTS. Three things the gates need live OUTSIDE git and therefore do not arrive with a
# `git pull`: `core.hooksPath` (it is in the untracked .git/config), `api/venv` (gitignored) and
# `client/node_modules` (gitignored). A clone missing the first commits with NO GATES AT ALL and
# says nothing about it, which is the dangerous kind of failure -- you commit, see no complaint,
# and assume the gates ran.
#
# The old answer was prose: `just install-hooks`, plus a paragraph per machine about what was
# installed where. That does not scale past one machine and it rots, because the facts it records
# (which interpreter, which tools) are exactly the ones that differ between machines. This script
# is the answer instead: it DETECTS rather than documents, so no document has to name a machine.
#
#   ./scripts/bootstrap.sh          # set up whatever is missing
#   ./scripts/bootstrap.sh --check  # report only, change nothing; exit 1 if setup is incomplete
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

CHECK=0
[ "${1:-}" = "--check" ] && CHECK=1

ok=0; missing=0
say()  { printf '%s\n' "$*"; }
good() { printf '  ✓ %s\n' "$*"; ok=$((ok+1)); }
bad()  { printf '  ✗ %s\n' "$*"; missing=$((missing+1)); }

say "▸ pre-commit hook"
# core.hooksPath is ONE value for the whole repository, every worktree included, and git reads a
# relative value against the root of the working tree being committed. Any value that points at
# this repository's .githooks gates every commit, however it is spelled, so the check resolves it
# rather than comparing strings. Repair still writes `.githooks` over anything else: under it a
# worktree commits through its own copy of the hook, and under an absolute path through the main
# checkout's. scripts/bootstrap.test.sh runs every case.
hooks="$(git config --type=path core.hooksPath || true)"
dir=""
if [ -n "$hooks" ]; then
  case "$hooks" in /*) dir="$hooks" ;; *) dir="$PWD/$hooks" ;; esac
  dir="$(cd "$dir" 2>/dev/null && pwd -P)" || dir=""
fi
main="$(git worktree list --porcelain | sed -n '1s/^worktree //p')"
ours=0
for tree in "$PWD" "$main"; do
  if [ -n "$dir" ] && [ "$dir" = "$(cd "$tree" && pwd -P)/.githooks" ]; then ours=1; fi
done
if [ "$hooks" = ".githooks" ]; then
  good "core.hooksPath -> .githooks"
elif [ "$CHECK" -eq 1 ] && [ "$ours" -eq 1 ]; then
  good "core.hooksPath -> $hooks (gated; without --check this rewrites it as .githooks)"
elif [ "$CHECK" -eq 1 ] && [ -z "$hooks" ]; then
  bad "core.hooksPath is not set -- commits from this clone run NO gates"
elif [ "$CHECK" -eq 1 ]; then
  bad "core.hooksPath is $hooks, not this repo's .githooks -- commits from this clone skip its gates"
else
  git config core.hooksPath .githooks
  good "core.hooksPath -> .githooks (set${hooks:+, was $hooks})"
fi

say "▸ api/venv (the api hook calls ./venv/bin/{lint-imports,ruff,mypy})"
if [ -x api/venv/bin/ruff ] && [ -x api/venv/bin/mypy ] && [ -x api/venv/bin/lint-imports ]; then
  good "api/venv has the gate tools"
elif [ "$CHECK" -eq 1 ]; then
  bad "api/venv is missing or incomplete -- the api half of the hook cannot run"
else
  # `python -m venv` needs ensurepip, which the python3.12-venv OS package provides and which is
  # NOT installed everywhere; uv needs no root and bundles its own installer. Try uv first.
  # Either way PIN THE INTERPRETER: an unpinned `uv venv` picks whatever python it finds first,
  # and a 3.8 fails the resolve on OpenTelemetry's `Python>=3.10` with a confusing message.
  py="$(command -v python3.12 || command -v python3 || true)"
  [ -n "$py" ] || { echo "no python3 on PATH; install Python 3.12" >&2; exit 1; }
  if command -v uv >/dev/null 2>&1; then
    ( cd api && uv venv venv --python "$py" >/dev/null && \
                uv pip install --quiet --python venv/bin/python -r requirements-dev.txt )
    good "api/venv created with uv ($("$py" --version))"
  elif "$py" -c "import ensurepip" 2>/dev/null; then
    ( cd api && "$py" -m venv venv && ./venv/bin/pip install --quiet -r requirements-dev.txt )
    good "api/venv created with python -m venv ($("$py" --version))"
  else
    bad "cannot create api/venv: no uv, and this python has no ensurepip"
    say "    fix either way:  sudo apt install python3.12-venv   OR   install uv"
    exit 1
  fi
fi

say "▸ client/node_modules"
if [ -d client/node_modules ]; then
  good "present"
elif [ "$CHECK" -eq 1 ]; then
  bad "client/node_modules is missing -- the client half of the hook cannot run"
else
  ( cd client && npm ci --silent )
  good "installed with npm ci"
fi

say ""
if [ "$missing" -gt 0 ]; then
  say "$missing item(s) still missing. Run ./scripts/bootstrap.sh (without --check) to fix."
  exit 1
fi
say "✔ $ok/3 ready. The hook runs on the next commit; prove it by planting a violation."
say "  e.g. add an unused import under api/app/, stage it, and watch the commit be refused."
