#!/usr/bin/env bash
# drift-extra.sh — the checks devkit's drift-check.sh cannot express for THIS repo.
#
# Kept separate on purpose so scripts/drift-check.sh stays byte-identical to devkit's template and
# future template updates still apply cleanly (ANTI-PATTERNS: two formats for one artifact).
#
# Four checks:
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
#  3. AN AGE CUTOFF ON A CREATION DATE. spec 0002 moved the legacy-student rule off
#     `Student.created_at` and onto first attendance, because `created_at` is the migration date
#     for every Student the entity migration created. `find_legacy_student_ids` is now the one
#     place that decides who is old. Nothing stops a later session writing a second, differently
#     worded cutoff against a creation date — the suite would stay green and the rule would fork,
#     which is exactly how this feature came to have two dates. Half of spec 0002's AC-8 was
#     review-only until this check existed.
#
#  4. AN OWNERSHIP COMPARISON OUTSIDE ITS SINGLE OWNER. INV-1 is decided by
#     `class_service.verify_class_ownership` and nowhere else (spec 0003). It reached seven sites
#     the first time — two duplicate helpers, one of them under a second name
#     (`verify_class_access`), and three inline `teacher_id !=` comparisons — and every one of
#     them grew while the suite was green, because a copy of a correct check is still correct.
#     What a copy is not is *maintained*: shared classes change the definition of "associated
#     with a Class", and a copy nobody remembered would keep enforcing the old one. Prose said
#     "intended single owner" in INVARIANTS.md for three days and three copies existed anyway.
#
# Escape hatch: `drift-ok` in a comment on the line, same convention as drift-check.sh.
#
# Usage: scripts/drift-extra.sh [<git range>] | scripts/drift-extra.sh --cached

set -uo pipefail
# Anchor on THIS package, not on the git root. They were the same thing while the API was its
# own repository; in the monorepo the git root is one level up and every relative path below
# (./venv/bin/ruff, .harness-baseline, app/, tests/) silently pointed at nothing.
cd "$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)" || exit 2

BANNED=$(cat <<'EOT'
student_(first|last)_name	Student has one normalized `name` column — the first/last split was removed by the Student-entity migration
[Ss]tudent(First|Last)Name	same: use `name`
verify_class_access	INV-1 has one check and one name: class_service.verify_class_ownership. `verify_class_access` was a second name for the same rule until spec 0003 deleted it — CONTEXT.md's `_Avoid_` cannot hold it because the segment matcher needs single words
EOT
)

# BACKLOG.html is exempt for the same reason the ledgers are: it is a document whose job is to
# NAME the banned identifiers, and on 2026-09-04 it was the first file this check ever failed --
# for a paragraph explaining that those identifiers are still in the client and still owed. A gate
# that fires on the document describing it teaches you to add `drift-ok` to prose, which is how an
# escape hatch becomes a habit. Only this one file, not all HTML: a template with real code in it
# should still be judged.
SKIP='(^|/)(CHANGELOG|README|REVIEW-DEBT|CODING_STANDARDS|CONTEXT|CONTEXT-MAP)\.md$|\.(md|txt|snap|svg|png|jpg|lock)$|(^|/)(venv|htmlcov|__pycache__)/|(^|/)scripts/drift-extra\.sh$|(^|/)BACKLOG\.html$'
# Anchored with (^|/) rather than ^: `git diff --name-only` reports paths from the GIT ROOT,
# which since the 2026-09-03 monorepo merge means `api/alembic/versions/...`. The bare ^ anchor
# matched nothing from that day until 2026-09-04, so this check reported clean while doing
# nothing — the same shape as the baseline guard that scored a crashed tool as 0 problems.
MIGRATIONS='(^|/)alembic/versions/.*\.py$'

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

# --- 3. an age cutoff on a creation date ------------------------------------
# Scoped to app/: a test may legitimately compare a creation date, production code deciding
# who is *old* may not. Escape hatch: `drift-ok` on the line, as everywhere else here.
created_at_cutoffs="$(
  printf '%s\n' "$LINES" | awk -F'\t' '$1 ~ /(^|\/)app\// && $3 ~ /created_at[[:space:]]*[<>]/' || true
)"
if [ -n "$created_at_cutoffs" ]; then
  violations=$((violations + 1))
  echo; echo "EXTRA · an age cutoff compared against a creation date"
  echo "  ↳ anti-pattern: two words for one thing — 'old student' already means first attendance"
  echo "  ↳ fix: use attendance_service.find_legacy_student_ids, which reads"
  echo "         COALESCE(MIN(AttendanceRecord.timestamp), Student.created_at) and is the one"
  echo "         place that decides. See specs/0002-legacy-student-cutoff.md. A creation date is"
  echo "         the MIGRATION date for every Student 01edea317e5e created."
  echo "         A legitimate date filter (not an age rule) takes \`drift-ok\` on the line."
  printf '%s\n' "$created_at_cutoffs" | head -10 | awk -F'\t' '{ printf "     %s:%s  ->  %s\n", $1, $2, substr($3,1,90) }'
fi

# --- 4. an ownership comparison outside the single owner --------------------
# Scoped to app/: a test may legitimately compare teacher_id (and does), production code
# deciding who may touch a class may not. class_service.py is the one file exempt, because it
# holds both the check and the list filter that cannot use it. Escape hatch: `drift-ok`.
# Operand order is deliberately NOT assumed. `teacher_id != x`, `teacher.id != x` and
# `current_user.id != x.teacher_id` are the same defect written three ways, and the first version
# of this check only caught the first -- proven by planting a reversed comparison and watching
# the gate report clean. So the rule is: a teacher's id mentioned on a line that also compares.
# Broad on purpose; `app/` outside class_service.py contains no such line at all, so the false
# positive rate is measured rather than hoped for, and `drift-ok` covers the exception.
ownership_checks="$(
  printf '%s\n' "$LINES" | awk -F'\t' '
    $1 ~ /(^|\/)app\// && $1 !~ /class_service\.py$/ &&
    $3 ~ /(teacher_id|teacher\.id)/ && $3 ~ /(!=|==)/
  ' || true
)"
if [ -n "$ownership_checks" ]; then
  violations=$((violations + 1))
  echo; echo "EXTRA · an ownership comparison outside class_service.verify_class_ownership"
  echo "  ↳ anti-pattern: rebuilding what you already have — aimed at the one behaviour where a"
  echo "     divergence is a data leak. INV-1 reached SEVEN sites this way, all of them correct"
  echo "     and all of them green."
  echo "  ↳ fix: call class_service.verify_class_ownership(db, class_id, teacher, action=...)."
  echo "         It returns the Class, so it replaces the fetch as well as the check, and its"
  echo "         \`action\` phrase keeps your refusal saying what it refused. See"
  echo "         specs/0003-consolidate-inv-1.md and INVARIANTS.md's INV-1 row."
  echo "         A comparison that is NOT an access decision takes \`drift-ok\` on the line."
  printf '%s\n' "$ownership_checks" | head -10 | awk -F'\t' '{ printf "     %s:%s  ->  %s\n", $1, $2, substr($3,1,90) }'
fi

echo
if [ "$violations" -gt 0 ]; then
  echo "drift-extra: $violations violation(s)."
  exit 1
fi
echo "drift-extra: clean (range: ${RANGE[*]})."
