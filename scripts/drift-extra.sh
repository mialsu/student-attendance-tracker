#!/usr/bin/env bash
# drift-extra.sh — the checks devkit's drift-check.sh cannot express for THIS repo.
#
# Kept separate on purpose so scripts/drift-check.sh stays byte-identical to devkit's template and
# future template updates still apply cleanly (ANTI-PATTERNS: two formats for one artifact).
#
# Two checks:
#
#  1. BANNED COMPOUND IDENTIFIERS. drift-check.sh's vocabulary check splits identifiers into
#     segments (`pupilName` -> `pupil` + `name`) and compares each segment against CONTEXT.md's
#     `_Avoid_` list. A multi-word entry therefore never matches — `student_first_name` equals no
#     single segment — so compound bans are silently dead there. Found by breaking the gate on
#     purpose during /harness install.
#
#  2. HAND-EDITED APPLIED MIGRATION. drift-check.sh's generated-file check covers
#     `migrations/` and `drizzle/`; alembic puts them in `alembic/versions/`, so the check is inert
#     here. An applied migration is history: editing one makes every deployed database disagree with
#     the file that supposedly created it. New migrations are fine; MODIFYING an existing one is not.
#
# Escape hatch: `drift-ok` in a comment on the line, same convention as drift-check.sh.
#
# Usage: scripts/drift-extra.sh [<git range>] | scripts/drift-extra.sh --cached

set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 2

BANNED=$(cat <<'EOT'
student_(first|last)_name	Student has one normalized `name` column — the first/last split was removed by the Student-entity migration
[Ss]tudent(First|Last)Name	same: use `name`
EOT
)

SKIP='(^|/)(CHANGELOG|README|REVIEW-DEBT|CODING_STANDARDS|CONTEXT|CONTEXT-MAP)\.md$|\.(md|txt|snap|svg|png|jpg|lock)$|(^|/)(venv|htmlcov|__pycache__)/|(^|/)scripts/drift-extra\.sh$'
MIGRATIONS='^alembic/versions/.*\.py$'

RANGE=("$@"); [ ${#RANGE[@]} -eq 0 ] && RANGE=(HEAD)

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

# --- 1. banned compound identifiers -----------------------------------------
if [ -n "$LINES" ]; then
  while IFS=$'\t' read -r rx guidance; do
    [ -n "${rx:-}" ] || continue
    hits="$(printf '%s\n' "$LINES" | grep -E "$rx" || true)"
    if [ -n "$hits" ]; then
      violations=$((violations + 1))
      echo; echo "EXTRA · banned compound identifier matching /$rx/"
      echo "  ↳ anti-pattern: two words for one thing — the project's language forks silently"
      echo "  ↳ fix: $guidance"
      printf '%s\n' "$hits" | head -10 | awk -F'\t' '{ printf "     %s:%s  ->  %s\n", $1, $2, substr($3,1,90) }'
    fi
  done <<<"$BANNED"
fi

# --- 2. an existing migration modified in place -----------------------------
modified_migrations="$(
  git diff --diff-filter=M --name-only "${RANGE[@]}" | grep -E "$MIGRATIONS" || true
)"
if [ -n "$modified_migrations" ]; then
  violations=$((violations + 1))
  echo; echo "EXTRA · an existing alembic migration was modified in place"
  echo "  ↳ anti-pattern: reformatting generated files — an applied migration is history, not source"
  echo "  ↳ fix: write a NEW migration (\`just migrate-create \"...\"\`). Every deployed database"
  echo "         already ran the old one; editing it makes the file and the schema disagree."
  while IFS= read -r f; do echo "     $f"; done <<<"$modified_migrations"
fi

echo
if [ "$violations" -gt 0 ]; then
  echo "drift-extra: $violations violation(s)."
  exit 1
fi
echo "drift-extra: clean (range: ${RANGE[*]})."
