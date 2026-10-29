# shellcheck shell=bash
# drift-check.local.sh — what is THIS package's own, beside devkit's drift gate.
#
# scripts/drift-check.sh is devkit's template, byte-for-byte, and is never edited here: a fix found
# in this repo goes back to devkit and comes out again through `/harness sync`. This file is what
# the gate sources from beside itself: the stamp, the tunables, and the checks only this package
# needs. It is not run on its own.
#
# The checks below were scripts/drift-extra.sh until 2026-10-29, when the Owner folded it in here so
# one command runs every drift check, in the hook, in `just drift` and in CI alike. Their numbering
# is kept (check 4, check 5) because INVARIANTS.md, specs and REVIEW-DEBT.md cite them by number.

# The devkit commit drift-check.sh was copied from: `/harness sync`'s base.
DEVKIT_GATE=69b1875

# Police api/ only, from api/ (devkit's template, DRIFT_ROOT). Every relative path in this package
# (./venv/bin/ruff, .harness-baseline, app/, tests/) assumes this directory, not the git root.
DRIFT_ROOT=package

# A separate, looser cap for test files, and NOT a blanket exemption — see CODING_STANDARDS.md.
# The 400 cap's stated anti-pattern is "several modules in a trench coat", which is about a
# production module with muddled responsibilities. A test file's length tracks the surface it
# covers: this repo's convention is one test file per service, and tests/test_service_attendance.py
# was already 637 lines before this gate existed. Splitting tests/test_service_student.py to satisfy
# a byte count would have forked that convention at seams chosen by arithmetic. The cap stays alive
# at 1000 rather than being removed, because a 3000-line test file really would be several files.
MAX_NEW_TEST_FILE_LINES=1000

# pip-tools (ADR-0010): requirements*.in are what a person edits, requirements*.txt are pip-compile's
# output. The template counts the .txt files as manifests, so every transitive package `just lock`
# or Dependabot pulls in would need an ADR naming it, a dependency nobody chose. So the dependency
# check judges the .in files, and checks 6 and 7 below police the compiled ones. Found 2026-10-29,
# when the first run over this package's history named 53 compiled runtime packages, 46 transitive.
# The substitution fails loudly if the template stops spelling the pattern this way, rather than
# letting the dependency check quietly judge the wrong files.
local_settings() {
  local before="$MANIFESTS"
  MANIFESTS="${MANIFESTS/"requirements[^/]*\.txt"/"requirements[^/]*\.in"}"
  if [ "$MANIFESTS" = "$before" ]; then
    echo "drift-check.local.sh: the template's MANIFESTS no longer names requirements*.txt; revisit local_settings" >&2
    exit 2
  fi
}

# The checks devkit's gate cannot express for this package.
#
#  1. BANNED COMPOUND IDENTIFIERS. A compound that must never come back, matched as a regex on
#     added lines. These predate devkit's multi-word `_Avoid_` matching (a run of segments,
#     template 2026-09-24); until then a compound in GLOSSARY.md was silently dead, which is how
#     this check started. Found by breaking the gate on purpose during /harness install.
#
#  2. HAND-EDITED APPLIED MIGRATION. devkit's generated-file check covers `migrations/` and
#     `drizzle/`; alembic puts them in `alembic/versions/`, so that check is inert here. An applied
#     migration is history: editing one makes every deployed database disagree with the file that
#     supposedly created it. New migrations are fine; MODIFYING an existing one is not.
#
#  3. AN AGE CUTOFF ON A CREATION DATE. spec 0002 moved the legacy-student rule off
#     `Student.created_at` and onto first attendance, because `created_at` is the migration date
#     for every Student the entity migration created. `find_legacy_student_ids` is now the one
#     place that decides who is old. Nothing stops a later session writing a second, differently
#     worded cutoff against a creation date — the suite would stay green and the rule would fork,
#     which is exactly how this feature came to have two dates. Half of spec 0002's AC-8 was
#     review-only until this check existed.
#
#  4. AN OWNERSHIP COMPARISON OUTSIDE ITS SINGLE OWNER (INV-1). INV-1 is decided by
#     `class_service.verify_class_ownership` and nowhere else (spec 0003). It reached seven sites
#     the first time — two duplicate helpers, one of them under a second name, and three inline
#     `teacher_id !=` comparisons — and every one of them grew while the suite was green, because
#     a copy of a correct check is still correct. What a copy is not is *maintained*: shared
#     classes change the definition of "associated with a Class", and a copy nobody remembered
#     would keep enforcing the old one.
#
#  5. A STUDENT'S NAME IN A LOG LINE, and the log's own vocabulary (INV-9; spec 0005, ADR-0007).
#     A log line identifies people by opaque id. Nothing in the language stops a later session
#     adding `name=student.name` to a logger call "just for debugging" -- the argument ADR-0007
#     records as rejected -- and the runtime test only catches it on a route it exercises. This
#     half fails the DIFF, so the leak becomes unlandable rather than merely noticed later. The
#     second half closes the vocabulary: `event`, `rule` and `reason` are plain strings, and a
#     tenth `reason` or `rule="INV3"` would log happily while silently breaking the grep a reader
#     relies on. Delegated to `scripts/log_lint.py`, which parses the file with `ast`: keywords
#     are checked against an ALLOWLIST, and a multi-line call is seen whole whether or not the diff
#     contains its opening line.
#
#  6. A TEST OR LINT PACKAGE IN THE RUNTIME REQUIREMENTS (spec 0007, AC-7). api/Dockerfile installs
#     requirements.txt and nothing else, so the split between it and requirements-dev.txt is the
#     only thing keeping pytest, ruff and mypy out of the container that serves student data.
#
#  7. A COMPILED REQUIREMENT THAT IS NOT EXACT, OR TWO LOCKS THAT DISAGREE (spec 0007, AC-8). The
#     .txt files are pip-compile's output. A `>=` line in one, or a runtime package at a different
#     version in each, means the image and the suite no longer install the same thing.
#
# Escape hatch: `drift-ok` in a comment on the line, as everywhere in the gate. Every path below is
# relative to api/: the gate's `added_lines` diffs with `--relative`, so this sees api/ alone.
local_checks() {
  local banned skip migrations lines rx guidance hits found end_rev log_out log_keywords log_vocab
  local test_and_lint not_exact disagreeing missing_from_dev

  banned=$(cat <<'EOT'
student_(first|last)_name	Student has one normalized `name` column — the first/last split was removed by the Student-entity migration
[Ss]tudent(First|Last)Name	same: use `name`
verify_class_access	INV-1 has one check and one name: class_service.verify_class_ownership. `verify_class_access` was a second name for the same rule until spec 0003 deleted it
EOT
)

  # Prose and ledgers NAME the banned identifiers, and this file defines them, so neither is judged.
  # The regex reaches awk through ENVIRON, never -v (devkit's template says why: -v ate the `\.`).
  skip='(^|/)(CHANGELOG|README|REVIEW-DEBT|CODING_STANDARDS|GLOSSARY|GLOSSARY-MAP)\.md$|\.(md|txt|snap|svg|png|jpg|lock)$|(^|/)(venv|htmlcov|__pycache__)/|(^|/)scripts/drift-check\.local\.sh$'
  migrations='(^|/)alembic/versions/.*\.py$'
  lines="$(added_lines | SKIP="$skip" awk -F'\t' '$1 !~ ENVIRON["SKIP"]' | grep -v 'drift-ok' || true)"

  # --- 1. banned compound identifiers ---------------------------------------
  if [ -n "$lines" ]; then
    while IFS=$'\t' read -r rx guidance; do
      [ -n "${rx:-}" ] || continue
      hits="$(printf '%s\n' "$lines" | grep -E "$rx" || true)"
      if [ -n "$hits" ]; then
        report "banned compound identifier matching /$rx/" \
                "two words for one thing — the project's language forks silently" \
                "$guidance"
        printf '%s\n' "$hits" | head -10 | awk -F'\t' '{ printf "     %s:%s  ->  %s\n", $1, $2, substr($3,1,90) }'
      fi
    done <<<"$banned"
  fi

  # --- 2. an existing migration modified in place ---------------------------
  found="$(git diff --relative --diff-filter=M --name-only "${RANGE[@]}" | grep -E "$migrations" || true)"
  if [ -n "$found" ]; then
    report "an existing alembic migration was modified in place" \
            "reformatting generated files — an applied migration is history, not source" \
            "write a NEW migration (\`just migrate-create \"...\"\`). Every deployed database"
    say "         already ran the old one; editing it makes the file and the schema disagree."
    while IFS= read -r f; do say "     $f"; done <<<"$found"
  fi

  # --- 3. an age cutoff on a creation date ----------------------------------
  # Scoped to app/: a test may legitimately compare a creation date, production code deciding
  # who is *old* may not.
  found="$(printf '%s\n' "$lines" | awk -F'\t' '$1 ~ /(^|\/)app\// && $3 ~ /created_at[[:space:]]*[<>]/' || true)"
  if [ -n "$found" ]; then
    report "an age cutoff compared against a creation date" \
            "two words for one thing — 'old student' already means first attendance" \
            "use attendance_service.find_legacy_student_ids, which reads"
    say "         COALESCE(MIN(AttendanceRecord.timestamp), Student.created_at) and is the one"
    say "         place that decides. See specs/0002-legacy-student-cutoff.md. A creation date is"
    say "         the MIGRATION date for every Student 01edea317e5e created."
    say "         A legitimate date filter (not an age rule) takes \`drift-ok\` on the line."
    printf '%s\n' "$found" | head -10 | awk -F'\t' '{ printf "     %s:%s  ->  %s\n", $1, $2, substr($3,1,90) }'
  fi

  # --- 4. an ownership comparison outside the single owner (INV-1) ----------
  # Scoped to app/: a test may legitimately compare teacher_id (and does), production code
  # deciding who may touch a class may not. class_service.py is the one file exempt, because it
  # holds both the check and the list filter that cannot use it.
  # Operand order is deliberately NOT assumed. `teacher_id != x`, `teacher.id != x` and
  # `current_user.id != x.teacher_id` are the same defect written three ways, and the first version
  # of this check only caught the first -- proven by planting a reversed comparison and watching
  # the gate report clean. So the rule is: a teacher's id mentioned on a line that also compares.
  # Broad on purpose; `app/` outside class_service.py contains no such line at all, so the false
  # positive rate is measured rather than hoped for, and `drift-ok` covers the exception.
  found="$(printf '%s\n' "$lines" | awk -F'\t' '
    $1 ~ /(^|\/)app\// && $1 !~ /class_service\.py$/ &&
    $3 ~ /(teacher_id|teacher\.id)/ && $3 ~ /(!=|==)/
  ' || true)"
  if [ -n "$found" ]; then
    report "an ownership comparison outside class_service.verify_class_ownership (INV-1)" \
            "rebuilding what you already have — aimed at the one behaviour where a divergence is a data leak. INV-1 reached SEVEN sites this way, all of them correct and all of them green" \
            "call class_service.verify_class_ownership(db, class_id, teacher, action=...)."
    say "         It returns the Class, so it replaces the fetch as well as the check, and its"
    say "         \`action\` phrase keeps your refusal saying what it refused. See"
    say "         specs/0003-consolidate-inv-1.md and INVARIANTS.md's INV-1 row."
    say "         A comparison that is NOT an access decision takes \`drift-ok\` on the line."
    printf '%s\n' "$found" | head -10 | awk -F'\t' '{ printf "     %s:%s  ->  %s\n", $1, $2, substr($3,1,90) }'
  fi

  # --- 5. INV-9 and the log's vocabulary ------------------------------------
  # Delegated to scripts/log_lint.py, which parses the FILE with `ast` rather than matching the
  # diff's text: the awk version this replaced was false-clean on the leak's normal shape, one
  # keyword line added to a logger call that already existed. The diff still decides WHICH calls
  # are judged, so this remains a diff gate.
  #
  # Content is read at the END of the range: the index for `--cached` (what the hook judges), a
  # commit for CI's resolved range, the working tree otherwise. Checks 6 and 7 read files the same
  # way.
  case "${RANGE[0]}" in
    --cached) end_rev=":" ;;
    HEAD)     end_rev="" ;;
    *)        end_rev="${RANGE[${#RANGE[@]}-1]##*..}" ;;
  esac

  log_out="$(printf '%s\n' "$lines" | python3 scripts/log_lint.py "$end_rev" || true)"
  log_keywords="$(grep -E '^(keyword|unparsed)\b' <<<"$log_out" || true)"
  log_vocab="$(grep -E '^vocab\b' <<<"$log_out" || true)"

  if [ -n "$log_keywords" ]; then
    report "a log field outside the sanctioned set (INV-9)" \
            "the argument ADR-0007 records as REJECTED — 'log the name, it makes this so much easier to debug'. The sink rotates by SIZE only, so at this app's volume a name written today effectively never ages out" \
            "log an id and a COUNT. They answer every question a name would, without making"
    say "         a copy that outlives the deletion GLOSSARY.md treats as complete. If the field is"
    say "         genuinely not a person, ADD it to ALLOWED_KEYWORDS in scripts/log_lint.py in"
    say "         THIS commit — an allowlist, so a synonym (\`who=\`, \`search=\`) cannot slip past"
    say "         a word list. See api/docs/adr/0007-personal-data-in-logs.md and INV-9's row."
    printf '%s\n' "$log_keywords" | head -10 | awk -F'\t' '{ printf "     %s:%s  ->  %s\n", $2, $3, $4 }'
  fi

  if [ -n "$log_vocab" ]; then
    report "a log value outside the known vocabulary" \
            "a standard with no enforcer — \`event\`, \`rule\` and \`reason\` are plain strings, so a typo (\`rule=INV3\`, \`reason=inactive-class\`) logs happily and the grep a reader relies on misses it silently" \
            "use an existing value, or add the new one to KNOWN_EVENTS / KNOWN_RULES /"
    say "         KNOWN_REASONS in scripts/log_lint.py in the same commit. Widening the"
    say "         vocabulary is fine; widening it by accident is not. A rule id must match"
    say "         INV-<n> exactly as INVARIANTS.md spells it."
    printf '%s\n' "$log_vocab" | head -10 | awk -F'\t' '{ printf "     %s:%s  ->  %s\n", $2, $3, $4 }'
  fi

  # --- 6 and 7 judge the requirements FILES, not the diff -------------------
  # Both read each file as the range leaves it, so they hold for a Dependabot pull request that
  # never touched a .in file as much as for a hand edit. A file that does not exist reads as empty.
  _at_end() {                   # _at_end <path under api/>
    case "$end_rev" in
      "")  cat "$1" 2>/dev/null ;;
      ":") git show ":./$1" 2>/dev/null ;;
      *)   git show "$end_rev:./$1" 2>/dev/null ;;
    esac
  }
  _names() { sed 's/[[:space:]]*#.*//' | grep -oE '^[A-Za-z0-9._-]+' | tr 'A-Z_.' 'a-z--'; }
  _pins()  { sed 's/[[:space:]]*#.*//' | grep -E '^[A-Za-z0-9._-]+==' | sed 's/==/ /; s/[[:space:]]*;.*//' \
               | awk '{ n=tolower($1); gsub(/[_.]+/, "-", n); print n, $2 }' | LC_ALL=C sort; }

  # --- 6. a test or lint package in the runtime requirements ----------------
  # spec 0007, AC-7. The list is AC-6's, plus any pytest plugin. httpx is left off on purpose: it is
  # a general HTTP client a future feature could need at runtime, and the split keeps it out of the
  # image only because nothing in app/ calls it today.
  test_and_lint='pytest|pytest-.+|faker|aiosqlite|ruff|mypy|import-linter|coverage'
  found="$(
    for f in requirements.in requirements.txt; do
      _at_end "$f" | _names | grep -xE "$test_and_lint" | sed "s|^|$f: |"
    done
  )"
  if [ -n "$found" ]; then
    report "a test or lint package in the runtime requirements" \
            "the image is not what the gates tested — requirements.txt is what api/Dockerfile installs, so this ships next to student data (spec 0007, US-4)" \
            "move it to requirements-dev.in and run \`just lock\`. If production really needs"
    say "         it, that is a decision for spec 0007's AC-6 list, not for this file."
    printf '%s\n' "$found" | head -10 | sed 's/^/     /'
  fi

  # --- 7. the compiled requirements: exact, and the same in both ------------
  # spec 0007, AC-8, plus the static half of AC-9. Every package line must be `name==version`, and
  # every runtime package must appear in requirements-dev.txt at the same version: `-c
  # requirements.txt` makes pip-compile produce exactly that, so a mismatch means somebody, or a
  # bot, edited one compiled file and not the other.
  not_exact="$(
    for f in requirements.txt requirements-dev.txt; do
      _at_end "$f" | sed 's/[[:space:]]*#.*//' | grep -vE '^[[:space:]]*$' \
        | grep -vE '^[A-Za-z0-9._-]+==[^[:space:];]+([[:space:]]*;.*)?$' | sed "s|^|$f: |"
    done
  )"
  disagreeing="$(LC_ALL=C join <(_at_end requirements.txt | _pins) <(_at_end requirements-dev.txt | _pins) \
                 | awk '$2 != $3 { print $1 ": requirements.txt " $2 ", requirements-dev.txt " $3 }')"
  missing_from_dev="$(LC_ALL=C join -v 1 <(_at_end requirements.txt | _pins) <(_at_end requirements-dev.txt | _pins) \
                      | awk '{ print $1 "==" $2 " is in requirements.txt and not in requirements-dev.txt" }')"
  found="$(printf '%s\n%s\n%s\n' "$not_exact" "$disagreeing" "$missing_from_dev" | grep -v '^$' || true)"
  if [ -n "$found" ]; then
    report "a compiled requirement that is not exact, or the two locks disagree" \
            "reformatting generated files — requirements*.txt are pip-compile's output, and a hand edit lets the suite and the image install different versions" \
            "put the change in requirements.in or requirements-dev.in and run \`just lock\`,"
    say "         which writes both files from one resolution (spec 0007, ADR-0010)."
    printf '%s\n' "$found" | head -10 | sed 's/^/     /'
  fi
}
