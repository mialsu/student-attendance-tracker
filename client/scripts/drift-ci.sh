#!/usr/bin/env bash
# drift-ci.sh — run the drift gates over the range CI actually needs to police.
#
# WHY THIS EXISTS. drift-check.sh is a DIFF gate. Run with no arguments it compares the working tree
# against HEAD — which, on a clean CI checkout, is nothing at all, so it reports "clean" no matter
# what was pushed. That is a false pass at the exact moment the gate is supposed to be load-bearing.
# This resolves the real range from the GitHub event and passes it through.
#
# Range resolution, in order:
#   pull_request      -> origin/<base>...HEAD   (everything the branch adds)
#   push              -> <event.before>...HEAD  (the commits this push introduced)
#   force push / new branch / workflow_dispatch -> HEAD~1...HEAD
#   root commit       -> <empty tree>...HEAD    (every line counts as new)
#
# Usage: scripts/drift-ci.sh          # resolve and run
#        scripts/drift-ci.sh --print  # print the resolved range only (for testing)

set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 2

resolve_range() {
  if [ "${GITHUB_EVENT_NAME:-}" = "pull_request" ] && [ -n "${GITHUB_BASE_REF:-}" ]; then
    git fetch --no-tags --quiet origin "$GITHUB_BASE_REF" >/dev/null 2>&1 || true
    if git rev-parse --verify -q "origin/${GITHUB_BASE_REF}" >/dev/null 2>&1; then
      printf 'origin/%s...HEAD' "$GITHUB_BASE_REF"; return
    fi
    echo "drift-ci: WARNING base ref '$GITHUB_BASE_REF' not fetchable; falling back." >&2
  fi

  local before="${GITHUB_EVENT_BEFORE:-}"
  if [ -n "$before" ] \
     && [ "$before" != "0000000000000000000000000000000000000000" ] \
     && git cat-file -e "${before}^{commit}" >/dev/null 2>&1; then
    printf '%s...HEAD' "$before"; return
  fi

  if git rev-parse --verify -q 'HEAD~1' >/dev/null 2>&1; then
    printf 'HEAD~1...HEAD'; return
  fi

  printf '%s...HEAD' "$(git hash-object -t tree /dev/null)"
}

RANGE="$(resolve_range)"

if [ "${1:-}" = "--print" ]; then printf '%s\n' "$RANGE"; exit 0; fi

echo "drift-ci: range = $RANGE"
rc=0
./scripts/drift-check.sh "$RANGE" || rc=1
[ -x ./scripts/drift-extra.sh ] && { ./scripts/drift-extra.sh "$RANGE" || rc=1; }
exit "$rc"
