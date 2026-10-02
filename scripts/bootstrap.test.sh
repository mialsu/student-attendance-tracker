#!/usr/bin/env bash
# The pre-commit half of scripts/bootstrap.sh, run against every way core.hooksPath can be set.
#
# It works in a throwaway repository and never in this clone: core.hooksPath is one value shared by
# every worktree, so flipping it here, even for a second, changes what other sessions' commits run.
# The throwaway repository carries the two committed paths bootstrap.sh reads, plus stubs for the
# two gitignored ones (api/venv and client/node_modules), so the hook check alone sets the exit code.
#
# Nothing runs this on commit or in CI: the root hook gates api/, deployment/ and client/ only.
#
#   ./scripts/bootstrap.test.sh     # exit 0 when every case holds
set -euo pipefail

# Only the throwaway repository's own config counts, whatever this machine sets globally.
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1

bootstrap="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/bootstrap.sh"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

repo="$tmp/repo"; wt="$tmp/wt"
mkdir -p "$repo/scripts" "$repo/.githooks" "$tmp/elsewhere/.githooks"
cp "$bootstrap" "$repo/scripts/bootstrap.sh"
printf '#!/bin/sh\n' > "$repo/.githooks/pre-commit"
cp "$repo/.githooks/pre-commit" "$tmp/elsewhere/.githooks/pre-commit"
chmod +x "$repo/.githooks/pre-commit" "$tmp/elsewhere/.githooks/pre-commit"
git -C "$repo" init --quiet --initial-branch=main
git -C "$repo" add -A
git -C "$repo" -c user.name=test -c user.email=test@example.invalid commit --quiet -m init
git -C "$repo" worktree add --quiet "$wt"
for tree in "$repo" "$wt"; do
  mkdir -p "$tree/api/venv/bin" "$tree/client/node_modules"
  for tool in ruff mypy lint-imports; do
    printf '#!/bin/sh\n' > "$tree/api/venv/bin/$tool"
    chmod +x "$tree/api/venv/bin/$tool"
  done
done

set_hooks() {
  if [ -n "$1" ]; then git -C "$repo" config core.hooksPath "$1"
  else git -C "$repo" config --unset core.hooksPath || true; fi
}

failed=0
expect() {  # expect <case> <run in> <core.hooksPath, '' for unset> <exit code> <text the output holds>
  local out code line
  set_hooks "$3"
  out="$(cd "$2" && bash scripts/bootstrap.sh --check 2>&1)" && code=0 || code=$?
  if [ "$code" -eq "$4" ] && grep -qF -- "$5" <<<"$out"; then
    printf 'ok    %s\n' "$1"
  else
    printf 'FAIL  %s: exit %s, wanted %s and "%s"\n' "$1" "$code" "$4" "$5"
    while IFS= read -r line; do printf '        %s\n' "$line"; done <<<"$out"
    failed=$((failed + 1))
  fi
}

expect "unset fails"                       "$repo" ""                         1 "is not set"
expect ".githooks passes"                  "$repo" ".githooks"                0 "core.hooksPath -> .githooks"
expect "an absolute path into it passes"   "$repo" "$repo/.githooks"          0 "core.hooksPath -> $repo/.githooks"
expect "the same, from a worktree"         "$wt"   "$repo/.githooks"          0 "core.hooksPath -> $repo/.githooks"
expect ".githooks from a worktree passes"  "$wt"   ".githooks"                0 "core.hooksPath -> .githooks"
expect "another spelling of it passes"     "$repo" "./.githooks/"             0 "core.hooksPath -> ./.githooks/"
expect "another repo's hooks fail"         "$repo" "$tmp/elsewhere/.githooks" 1 "not this repo's .githooks"
expect "a missing directory fails"         "$repo" ".husky"                   1 "not this repo's .githooks"

# Repair writes the relative form over anything else, so a worktree commits through its own copy.
for start in "" "$repo/.githooks"; do
  set_hooks "$start"
  (cd "$repo" && bash scripts/bootstrap.sh >/dev/null)
  now="$(git -C "$repo" config core.hooksPath || true)"
  if [ "$now" = ".githooks" ]; then
    printf 'ok    repair writes .githooks over %s\n' "${start:-an unset value}"
  else
    printf 'FAIL  repair left "%s" over %s\n' "$now" "${start:-an unset value}"
    failed=$((failed + 1))
  fi
done

[ "$failed" -eq 0 ] || { printf '%s case(s) failed\n' "$failed"; exit 1; }
printf '✔ every case holds\n'
