# shellcheck shell=bash
# drift-check.local.sh — what is THIS package's own, beside devkit's drift gate.
#
# scripts/drift-check.sh is devkit's template, byte-for-byte, and is never edited here: a fix found
# in this repo goes back to devkit and comes out again through `/harness sync`. This file is what
# the gate sources from beside itself: the stamp, the settings, and the checks only this package
# needs. It is not run on its own.
#
# The check below was scripts/drift-extra.sh until 2026-10-29, when the Owner folded it in here so
# one command runs every drift check, in the hook, in `npm run drift` and in CI alike. Its number
# matches api/scripts/drift-check.local.sh's check 1, so a cold session finds the same shape in
# either package.

# The devkit commit drift-check.sh was copied from: `/harness sync`'s base.
DEVKIT_GATE=69b1875

# Police client/ only, from client/ (devkit's template, DRIFT_ROOT). Every relative path in this
# package (./scripts/*, .harness-baseline, src/) assumes this directory, not the git root.
DRIFT_ROOT=package

#  1. BANNED COMPOUND IDENTIFIERS. The vocabulary the Student-entity migration replaced with a
#     single `name`, matched as a regex on added lines. This predates devkit's multi-word `_Avoid_`
#     matching (a run of segments, template 2026-09-24); until then a compound in GLOSSARY.md was
#     silently dead, which is how this check started. Found by breaking the gate on purpose during
#     /harness install.
#
# Escape hatch: `drift-ok` in a comment on the line, as everywhere in the gate. Paths are relative
# to client/: the gate's `added_lines` diffs with `--relative`, so this sees client/ alone.
local_checks() {
  local banned skip lines rx guidance hits

  banned=$(cat <<'EOT'
[Ss]tudent(First|Last)Name	Student has one normalized `name` field — the first/last split was removed by the Student-entity migration
student_(first|last)_name	same: use `name`
EOT
)

  # Prose and ledgers NAME the banned identifiers, and this file defines them, so neither is judged.
  # The regex reaches awk through ENVIRON, never -v (devkit's template says why: -v ate the `\.`).
  skip='(^|/)(CHANGELOG|README|REVIEW-DEBT|CODING_STANDARDS|GLOSSARY|GLOSSARY-MAP)\.md$|\.(md|txt|snap|svg|png|jpg|lock)$|(^|/)(vendor|node_modules|dist|build|coverage)/|-lock\.(json|yaml)$|(^|/)bun\.lockb$|(^|/)scripts/drift-check\.local\.sh$'
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
}
