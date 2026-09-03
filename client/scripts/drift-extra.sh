#!/usr/bin/env bash
# drift-extra.sh — the checks devkit's drift-check.sh cannot express for THIS repo.
#
# Named to match student-attendance-tracker-api/scripts/drift-extra.sh, so a cold session finds the
# same shape in either repo.
#
# WHY THIS EXISTS. drift-check.sh's vocabulary check splits every identifier into segments
# (`pupilName` -> `pupil` + `name`) and compares each segment against CONTEXT.md's `_Avoid_` list.
# That design is what stops it firing on `runtime` or `courseCredit`, and it is the right default.
# But it means a MULTI-WORD identifier can never be banned there: `studentFirstName` lowercases to
# `studentfirstname`, which equals no single segment, so the entry is silently dead.
#
# Discovered by breaking the gate on purpose (/harness step 5): the compound entry did not fire.
#
# So compound bans live here, as whole-identifier matches on added lines only. Kept as a SEPARATE
# script so devkit's drift-check.sh stays byte-identical to its template and future template
# updates still apply cleanly (ANTI-PATTERNS: two formats for one artifact).
#
# Escape hatch: `drift-ok` in a comment on the line, same convention as drift-check.sh.
#
# Usage: scripts/drift-extra.sh [<git range>]   (default: working tree + staged vs HEAD)
#        scripts/drift-extra.sh --cached        (staged only — the pre-commit form)

set -uo pipefail
# Anchor on THIS package, not on the git root. They were the same directory while client-app was
# its own repository; in the monorepo the git root is one level up and every relative path below
# (./scripts/*, .harness-baseline, src/) silently pointed at nothing.
cd "$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)" || exit 2

# Banned COMPOUND identifiers, with the canonical term to use instead.
# Format: regex<TAB>replacement guidance
BANNED=$(cat <<'EOT'
[Ss]tudent(First|Last)Name	Student has one normalized `name` field — the first/last split was removed by the Student-entity migration
student_(first|last)_name	same: use `name`
EOT
)

SKIP='(^|/)(CHANGELOG|README|REVIEW-DEBT|CODING_STANDARDS|CONTEXT|CONTEXT-MAP)\.md$|\.(md|txt|snap|svg|png|jpg|lock)$|(^|/)(vendor|node_modules|dist|build|coverage)/|-lock\.(json|yaml)$|(^|/)bun\.lockb$|(^|/)scripts/drift-extra\.sh$'

RANGE=("$@")
if [ ${#RANGE[@]} -eq 0 ]; then RANGE=(HEAD); fi

added_lines() {
  git diff --unified=0 "${RANGE[@]}" | awk '
    /^\+\+\+ /{ f=substr($0,5); sub(/^b\//,"",f); next }
    /^@@ /{ if (match($0, /\+[0-9]+/)) n = substr($0, RSTART+1, RLENGTH-1) + 0; next }
    /^\+/{ print f "\t" n "\t" substr($0,2); n++; next }
    /^[ ]/{ n++ }
  '
  if [ "${RANGE[0]}" = "HEAD" ]; then
    git ls-files --others --exclude-standard | while IFS= read -r u; do
      [ -n "$u" ] && [ -f "$u" ] && awk -v f="$u" '{ print f "\t" NR "\t" $0 }' "$u"
    done
  fi
}

violations=0
LINES="$(added_lines | awk -F'\t' -v skip="$SKIP" '$1 !~ skip' | grep -v 'drift-ok' || true)"

if [ -n "$LINES" ]; then
  while IFS=$'\t' read -r rx guidance; do
    [ -n "${rx:-}" ] || continue
    hits="$(printf '%s\n' "$LINES" | grep -E "$rx" || true)"
    if [ -n "$hits" ]; then
      violations=$((violations + 1))
      echo
      echo "EXTRA · banned compound identifier matching /$rx/"
      echo "  ↳ anti-pattern: two words for one thing — the project's language forks silently"
      echo "  ↳ fix: $guidance"
      printf '%s\n' "$hits" | head -10 | awk -F'\t' '{ printf "     %s:%s  ->  %s\n", $1, $2, substr($3,1,90) }'
    fi
  done <<<"$BANNED"
fi

echo
if [ "$violations" -gt 0 ]; then
  echo "drift-extra: $violations violation(s)."
  exit 1
fi
echo "drift-extra: clean (range: ${RANGE[*]})."
