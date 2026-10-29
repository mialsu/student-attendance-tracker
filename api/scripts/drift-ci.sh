#!/usr/bin/env bash
# drift-ci.sh — run the drift gate in CI, over the commits the event actually brought.
#
# drift-check.sh is a DIFF gate. With no range it compares the working tree with HEAD, which on a
# clean CI checkout is nothing, so it says clean whatever was pushed. Every project then wrote its
# own range logic into its workflow, three different ways, two of which quietly narrowed to the
# last commit when the base was missing (2026-10-29). This is that logic, once.
#
# Usage (in a workflow, after a checkout with `fetch-depth: 0`):
#   scripts/drift-ci.sh "${{ github.event.pull_request.base.sha || github.event.before }}"
#   scripts/drift-ci.sh --print <base>     # print the resolved range only; for testing
#
# The range, from the base the workflow passes. A commit in this clone (a pull request's base, a
# push's before) checks everything since it. No base, or the all-zero sha of a new branch, checks
# the last commit; on a root commit, every line counts as new. A base NOT in this clone fails: a
# force-push leaves `before` unreachable, and checking only the last commit instead would pass
# whatever the rewritten history added, so rerun the workflow by hand, which checks the last
# commit. A shallow clone fails too, since no range can be trusted without the history.
#
# THIS FILE IS NOT EDITED IN A PROJECT. Like drift-check.sh, every project carries it byte-identical
# to devkit's template, and `/harness sync` brings both back together. It calls the drift-check.sh
# beside it, so a monorepo package's copy runs that package's gate.

set -uo pipefail

case "$0" in /*) SELF="$0" ;; *) SELF="$PWD/$0" ;; esac
GATE="${SELF%/*}/drift-check.sh"

PRINT=0
[ "${1:-}" = "--print" ] && { PRINT=1; shift; }
BASE="${1:-}"

fail() { echo "drift-ci: $1" >&2; exit 2; }

if [ "$(git rev-parse --is-shallow-repository 2>/dev/null)" = "true" ]; then
  fail "this is a shallow clone, so no range can be checked; check out with fetch-depth: 0"
fi

case "$BASE" in
  ""|0000000000000000000000000000000000000000)
    if git rev-parse --verify -q 'HEAD~1' >/dev/null 2>&1; then
      RANGE="HEAD~1...HEAD"
    else
      RANGE="$(git hash-object -t tree /dev/null)...HEAD"
    fi ;;
  *)
    git cat-file -e "${BASE}^{commit}" 2>/dev/null \
      || fail "the base $BASE is not in this clone (a force-push?), so nothing was checked; rerun the workflow by hand to check the last commit"
    RANGE="$BASE...HEAD" ;;
esac

if [ "$PRINT" = 1 ]; then printf '%s\n' "$RANGE"; exit 0; fi

echo "drift-ci: range = $RANGE"
exec bash "$GATE" "$RANGE"
