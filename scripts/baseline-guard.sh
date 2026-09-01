#!/usr/bin/env bash
# baseline-guard.sh — turn a currently-RED check into a real gate without mass-exempting it.
#
# The problem this solves (/harness, "Retrofitting an existing project"): a gate must pass on a
# clean tree before you can prove it bites, but `tsc` and `eslint` are red on this repo's clean
# tree. Deleting the rules to get to green would be "a gate tuned until it's silent" — the same as
# no gate. So instead the CURRENT error count is recorded, and the gate fails when the count GROWS.
#
# It is a ratchet, not an exemption: new violations are blocked today, and every time the count
# drops the baseline is lowered so the ground gained cannot be given back.
#
# Usage: scripts/baseline-guard.sh <name> <cmd...>
# Baselines live in .harness-baseline (committed, one `name=count` per line).
#
# Modes: typecheck/lint = count matching lines; tests = parse vitest's summary; ruff = parse
# ruff's "Found N errors" line.
#
# Honest limits, stated because a false gate is worse than none:
#   - It counts violations; it does not know WHICH. Fixing one error and adding another nets zero
#     and passes. It stops accumulation, not substitution.
#   - Per-file scoping is what lint-staged does on commit; this is the whole-repo umbrella number.

set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 2

NAME="${1:?usage: baseline-guard.sh <name> <cmd...>}"; shift
BASELINE_FILE=".harness-baseline"
[ -f "$BASELINE_FILE" ] || : > "$BASELINE_FILE"

# Count lines that look like a reported problem, per tool.
# Two counting modes: `lines` greps matching problem lines; `extract` pulls a number the tool
# already reports. `extract` matters for vitest, whose per-failure output spans many lines.
MODE=lines
case "$NAME" in
  typecheck) PATTERN='error TS[0-9]+' ;;
  lint)      PATTERN='^[[:space:]]+[0-9]+:[0-9]+[[:space:]]+error' ;;
  tests)     MODE=extract; PATTERN='Tests' ;;
  ruff)      MODE=ruff ;;
  *)         PATTERN='error' ;;
esac

out="$("$@" 2>&1)"
# Strip ANSI colour once, up front: every downstream match is anchored at line start, and the
# escape sequence sits BEFORE the leading whitespace in vitest's summary line.
out="$(printf '%s\n' "$out" | sed -e 's/\x1b\[[0-9;]*m//g')"
if [ "$MODE" = ruff ]; then
  # ruff prints "Found N errors." (or nothing at all when clean).
  count="$(printf '%s\n' "$out" | grep -oE 'Found [0-9]+ error' | grep -oE '[0-9]+' | tail -1)"
  count="${count:-0}"
elif [ "$MODE" = extract ]; then
  # "Tests  25 failed | 65 passed (90)"  -> 25 ; "Tests  90 passed (90)" -> 0
  count="$(printf '%s\n' "$out" \
            | grep -E '^[[:space:]]*Tests[[:space:]]' | tail -1 \
            | grep -oE '[0-9]+ failed' | grep -oE '[0-9]+' | head -1)"
  count="${count:-0}"
  if ! printf '%s\n' "$out" | grep -qE '^[[:space:]]*Tests[[:space:]]'; then
    echo "$out" | tail -30
    echo "baseline-guard[$NAME]: FAIL — the runner produced no test summary at all (crash, not failures)."
    exit 1
  fi
else
  count="$(printf '%s\n' "$out" | grep -cE "$PATTERN")"
fi
baseline="$(sed -n "s/^${NAME}=//p" "$BASELINE_FILE" | head -1)"

# BASELINE_FROZEN=1 (set by CI): never write to the baseline file. On an ephemeral runner the
# write is discarded anyway, so doing it silently would make CI look like it ratcheted when it did
# not. Frozen mode reports and lets the human ratchet locally, where the change can be committed.
FROZEN="${BASELINE_FROZEN:-0}"

if [ -z "$baseline" ]; then
  if [ "$FROZEN" = 1 ]; then
    echo "baseline-guard[$NAME]: FAIL — no baseline recorded for '$NAME' and BASELINE_FROZEN=1."
    echo "  ↳ Run it locally once to seed $BASELINE_FILE, then commit that file."
    exit 1
  fi
  printf '%s=%s\n' "$NAME" "$count" >> "$BASELINE_FILE"
  echo "baseline-guard[$NAME]: no baseline recorded — writing $count. Review and commit $BASELINE_FILE."
  exit 0
fi

if [ "$count" -gt "$baseline" ]; then
  echo "$out" | tail -40
  echo
  echo "baseline-guard[$NAME]: FAIL — $count problem(s), baseline is $baseline (+$((count - baseline)))."
  echo "  ↳ This diff ADDS $NAME problems. Fix them; do not raise the baseline to pass."
  echo "  ↳ Raising it is only legitimate alongside a REVIEW-DEBT.md entry saying why."
  exit 1
fi

if [ "$count" -lt "$baseline" ]; then
  if [ "$FROZEN" = 1 ]; then
    echo "baseline-guard[$NAME]: improved — $count (was $baseline), but BASELINE_FROZEN=1 so the file"
    echo "  was NOT rewritten. Run the gate locally to ratchet $BASELINE_FILE down, and commit it."
    exit 0
  fi
  sed -i "s/^${NAME}=.*/${NAME}=${count}/" "$BASELINE_FILE"
  echo "baseline-guard[$NAME]: improved — $count (was $baseline). Baseline RATCHETED down; commit $BASELINE_FILE."
  exit 0
fi

echo "baseline-guard[$NAME]: ok — $count problem(s), at baseline ($baseline). Not growing."
