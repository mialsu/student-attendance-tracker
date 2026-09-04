#!/usr/bin/env bash
# drift-check.sh — devkit's drift gate: ANTI-PATTERNS.md, made executable.
#
# Typecheck, lint, tests and build catch BREAKAGE. Agents rarely break the build; they erode
# SHAPE — a second word for one concept, a quiet suppression, an undeclared dependency, a
# reformatted lockfile. This gate catches that, on the diff, before it lands.
#
# Usage:
#   scripts/drift-check.sh                 # working tree + staged, vs HEAD
#   scripts/drift-check.sh --cached        # staged only (use this in a pre-commit hook)
#   scripts/drift-check.sh main...HEAD     # a whole branch
#
# Escape hatch: put `drift-ok` in a comment on the offending line. Deliberate, and greppable —
# `git grep drift-ok` lists every exemption you've ever granted. For a suppression or a skipped
# test the intended remedy is a REVIEW-DEBT.md entry, not drift-ok.
#
# Sensitivity: the vocabulary check matches whole identifier SEGMENTS (clientId -> client + id),
# so it catches `createPurchase` without flagging `runtime`, `overrun`, or `setWindowFlags`. It
# still errs toward catching: a missed synonym silently forks the project's language (expensive),
# a false positive costs one `drift-ok` (cheap). If it is noisy, suspect CONTEXT.md first — an
# `_Avoid_` list should hold domain synonyms, not general programming words.
#
# Checks: vocabulary drift, unconfessed suppressions, undeclared dependencies, stray lockfiles,
# hand-edited generated files, oversized new files, invariants with no enforcer, accessibility
# rules with no enforcer, and blocks of commented-out code.
#
# Tunables (env): MAX_NEW_FILE_LINES, LEDGER, ADR_DIR, MIN_TERM_LEN, POLICE_STRINGS,
#                 MIN_COMMENTED_BLOCK.

set -uo pipefail

# Anchor on THIS package, not on the git root. They were the same directory while client-app was
# its own repository; in the monorepo the git root is one level up and every relative path below
# (./scripts/*, .harness-baseline, src/) silently pointed at nothing.
cd "$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)" || exit 2
# Every `git diff` below carries `--relative` because the cd above is only half the fix:
# `git ls-files` reports paths relative to the cwd, `git diff` reports them from the GIT
# ROOT. Checks that fed a diff path back to git matched nothing and reported clean. It is a
# NO-OP when the cwd is the git root, so this stays compatible with devkit's template.


MAX_NEW_FILE_LINES="${MAX_NEW_FILE_LINES:-400}"
LEDGER="${LEDGER:-REVIEW-DEBT.md}"
ADR_DIR="${ADR_DIR:-docs/adr}"
MIN_TERM_LEN="${MIN_TERM_LEN:-3}"
POLICE_STRINGS="${POLICE_STRINGS:-0}"
MIN_COMMENTED_BLOCK="${MIN_COMMENTED_BLOCK:-3}"

RANGE=("$@"); [ ${#RANGE[@]} -eq 0 ] && RANGE=(HEAD)
DEFAULT_MODE=0
{ [ ${#RANGE[@]} -eq 1 ] && [ "${RANGE[0]}" = "HEAD" ]; } && DEFAULT_MODE=1

# A repo with no commits has no HEAD to diff against — which is EXACTLY when a project installs
# this gate. Left alone, git prints `fatal: bad revision` for every check and the gate still reports
# clean: a false pass at the one moment someone is trying to prove the gate bites. Diff the empty
# tree instead, so a bootstrap commit is policed like any other diff.
if ! git rev-parse --verify -q HEAD >/dev/null 2>&1; then
  EMPTY_TREE="$(git hash-object -t tree /dev/null)"
  for i in "${!RANGE[@]}"; do
    [ "${RANGE[$i]}" = "HEAD" ] && RANGE[$i]="$EMPTY_TREE"
  done
  case " ${RANGE[*]} " in
    *" $EMPTY_TREE "*) : ;;
    *) RANGE+=("$EMPTY_TREE") ;;
  esac
  echo "drift-check: no commits yet — diffing against the empty tree (everything counts as new)."
fi

# Files whose CONTENT this gate does not police (prose, locks, generated, vendored, snapshots).
SKIP_CONTENT='(^|/)(CHANGELOG|README|REVIEW-DEBT|CODING_STANDARDS|CONTEXT|CONTEXT-MAP)\.md$|\.(md|txt|snap|svg|png|jpg|lock)$|(^|/)(vendor|node_modules|dist|build|\.venv)/|-lock\.(json|yaml)$|(^|/)(go\.sum|yarn\.lock|bun\.lockb)$|\.min\.|\.gen\.[a-z]+$|(^|/)drizzle/|(^|/)openapi\.json$|(^|/)schema\.d\.ts$'
# Files that are not yours to edit by hand (only through their generator), and that never change
# as a byproduct of normal work: vendored code, build output, an applied migration.
GENERATED='(^|/)(vendor|node_modules|dist|build)/|\.generated\.|(^|/)(migrations|drizzle)/|_pb2?\.py$|\.pb\.go$|\.g\.dart$|\.freezed\.dart$'
# Committed codegen output that legitimately changes whenever the source of truth changes (a router
# tree, a dumped API spec, generated types, a schema snapshot). Content is not policed and size is
# not capped, but a modification is NORMAL — flagging it would fire on every feature, and a gate
# that fires on every feature gets tuned to silence.
REGENERATED='\.gen\.[a-z]+$|(^|/)openapi\.json$|(^|/)schema\.d\.ts$|(^|/)drizzle/meta/'
# Dependency manifests.
MANIFESTS='(^|/)(package\.json|pyproject\.toml|requirements[^/]*\.txt|go\.mod|Cargo\.toml|Gemfile|composer\.json|pubspec\.yaml|[^/]+\.csproj|build\.gradle(\.kts)?)$'
# Suppressions and silenced tests.
HATCHES='TODO|FIXME|HACK|XXX|@ts-ignore|@ts-expect-error|eslint-disable|type:[[:space:]]*ignore|#[[:space:]]*noqa|#nosec|nolint|pytest\.mark\.skip|(it|test|describe|context)\.(skip|only)\(|^[[:space:]]*(xit|xdescribe|fit|fdescribe)\(|t\.Skip\(|#\[ignore\]'  # drift-ok: this line IS the pattern definition

violations=0
say() { printf '%s\n' "$*"; }
report() {                      # report <check> <anti-pattern> <fix>
  violations=$((violations + 1))
  say ""; say "DRIFT · $1"; say "  ↳ anti-pattern: $2"; say "  ↳ fix: $3"
}

# --- diff helpers ------------------------------------------------------------
# Default (no args) = "everything not yet committed", which INCLUDES untracked files —
# git diff alone cannot see them, and a brand-new file is exactly what needs checking.
if [ "$DEFAULT_MODE" = 1 ]; then
  UNTRACKED="$(git ls-files --others --exclude-standard)"
else
  UNTRACKED=""
fi

changed()     { { git diff --relative --name-only "${RANGE[@]}"; printf '%s' "$UNTRACKED"; } | grep -v '^$' | sort -u; }
added_files() { { git diff --relative --diff-filter=A --name-only "${RANGE[@]}"; printf '%s' "$UNTRACKED"; } | grep -v '^$' | sort -u; }

# path<TAB>lineno<TAB>content, for every ADDED line in the range (untracked files: every line).
added_lines() {
  git diff --relative --unified=0 "${RANGE[@]}" -- "$@" | awk '
    /^\+\+\+ /{ f=substr($0,5); sub(/^b\//,"",f); next }
    /^@@ /{ if (match($0, /\+[0-9]+/)) n = substr($0, RSTART+1, RLENGTH-1) + 0; next }
    /^\+/{ print f "\t" n "\t" substr($0,2); n++; next }
    /^[ ]/{ n++ }
  '
  while IFS= read -r u; do
    [ -n "$u" ] && [ -f "$u" ] && awk -v f="$u" '{ print f "\t" NR "\t" $0 }' "$u"
  done <<<"$UNTRACKED"
}
# Number of added lines per newly-added file: count<TAB>path.
added_sizes() {
  git diff --relative --diff-filter=A --numstat "${RANGE[@]}" | awk -F'\t' '$1!="-"{ print $1 "\t" $3 }'
  while IFS= read -r u; do
    [ -n "$u" ] && [ -f "$u" ] && printf '%s\t%s\n' "$(wc -l <"$u" | tr -d ' ')" "$u"
  done <<<"$UNTRACKED"
}
# Added lines in files this gate polices, minus any line the author exempted.
policed_lines() { added_lines | awk -F'\t' -v skip="$SKIP_CONTENT" '$1 !~ skip' | grep -v 'drift-ok'; }
loc()  { printf '%s:%s' "$(cut -f1 <<<"$1")" "$(cut -f2 <<<"$1")"; }
body() { cut -f3- <<<"$1"; }

LINES="$(policed_lines)"
CHANGED="$(changed)"

# --- 1. vocabulary drift: an _Avoid_ word entering the code ------------------
terms=""
while IFS= read -r ctx; do
  [ -f "$ctx" ] || continue
  terms+="$(sed -n 's/^_Avoid_:[[:space:]]*//p' "$ctx" | tr ',' '\n' \
            | sed 's/^[[:space:]]*//; s/[[:space:]]*$//' | grep -Ev '^(<.*>)?$')"$'\n'
done < <(git ls-files | grep -E '(^|/)CONTEXT\.md$')
terms="$(printf '%s' "$terms" | awk -v m="$MIN_TERM_LEN" 'length($0)>=m' | sort -fu)"

if [ -n "$terms" ] && [ -n "$LINES" ]; then
  # Match whole IDENTIFIER SEGMENTS, not substrings: clientId -> [client, id] flags `client`,
  # while runtime / overrun / lockstep / setWindowFlags do NOT match run / step / flag. Plurals
  # count only for terms of 5+ chars, so `flag` never flags Qt's `Flags` but `purchase` catches
  # `purchases`.
  hits="$(printf '%s\n' "$LINES" | awk -F'\t' -v terms="$terms" -v SQ="'" -v police="$POLICE_STRINGS" '
  function seglist(id, out,    i,c,prev,nxt,cur,k,isup,prevlow,nxtlow) {
    k=0; cur="";
    for (i=1; i<=length(id); i++) {
      c = substr(id,i,1);
      if (c=="_" || c=="-") { if (cur!="") { out[++k]=tolower(cur); cur="" } ; continue }
      isup    = (c ~ /[A-Z]/);
      prev    = (i>1) ? substr(id,i-1,1) : "";
      nxt     = (i<length(id)) ? substr(id,i+1,1) : "";
      prevlow = (prev ~ /[a-z0-9]/);
      nxtlow  = (nxt ~ /[a-z]/);
      if (isup && cur!="" && (prevlow || nxtlow)) { out[++k]=tolower(cur); cur="" }
      cur = cur c;
    }
    if (cur!="") out[++k]=tolower(cur);
    return k;
  }
  function banned(seg,   sing) {
    if (seg in BAN) return seg;
    if (length(seg) > 1 && substr(seg,length(seg)) == "s") {
      sing = substr(seg,1,length(seg)-1);
      if ((sing in BAN) && length(sing) >= 5) return sing;
    }
    return "";
  }
  BEGIN {
    n = split(terms, T, "\n");
    for (i=1;i<=n;i++) { t=tolower(T[i]); sub(/^[ \t]+/,"",t); sub(/[ \t]+$/,"",t); if (t!="") BAN[t]=1 }
  }
  {
    rest=$3; found=""; delete SEEN;
    # String literals hold enum VALUES, test fixtures and free text, where a banned word is
    # usually a value or prose rather than a name. Matching there is close to pure noise, and the
    # drift that matters shows up in identifiers. POLICE_STRINGS=1 restores strict matching, at
    # the cost of every enum value and every bit of user-facing copy.
    if (police != 1) {
      gsub(/"[^"]*"/, " ", rest);
      gsub("[" SQ "][^" SQ "]*[" SQ "]", " ", rest);
      gsub(/`[^`]*`/, " ", rest);
    }
    while (match(rest, /[A-Za-z_][A-Za-z0-9_]*/)) {
      id   = substr(rest, RSTART, RLENGTH);
      rest = substr(rest, RSTART+RLENGTH);
      k = seglist(id, S);
      for (j=1;j<=k;j++) {
        b = banned(S[j]);
        if (b != "") { if (!(id in SEEN)) { SEEN[id]=1; found = found (found==""?"":" ") id "(" b ")" } break }
      }
      delete S;
    }
    if (found != "") print $1 ":" $2 "  ->  " found;
  }')"
  if [ -n "$hits" ]; then
    count="$(printf '%s\n' "$hits" | wc -l | tr -d ' ')"
    report "vocabulary — a word CONTEXT.md says to avoid is entering the code ($count)" \
            "two words for one thing: the project's language forks silently" \
            "use the canonical CONTEXT.md term, or add \`drift-ok\` if this word genuinely means something else here"
    printf '%s\n' "$hits" | head -15 | sed 's/^/     /'
    if [ "$count" -gt 15 ]; then
      say "     … and $((count - 15)) more of the same kind. The cap is display-only — all $count are violations."
      say "     If most look like general programming words, the fix is CONTEXT.md: a domain glossary's"
      say "     _Avoid_ list should hold DOMAIN synonyms, not words like run/item/length/script."
    fi
  fi
fi

# --- 2. a suppression or silenced test with no confession -------------------
if [ -n "$LINES" ]; then
  hits="$(printf '%s\n' "$LINES" | grep -E "$HATCHES")"
  if [ -n "$hits" ] && ! grep -qxF "$LEDGER" <<<"$CHANGED"; then
    report "escape hatch — a suppression or silenced test landed without a confession" \
            "deferring the confession: 'I'll write down what I stubbed later' means you won't" \
            "add the entry to $LEDGER in THIS commit (PRINCIPLES #5)"
    while IFS= read -r h; do say "     $(loc "$h")  →  $(body "$h" | sed 's/^[[:space:]]*//' | cut -c1-100)"; done <<<"$hits"
  fi
fi

# --- 3. a new dependency with no ADR ----------------------------------------
# A dependency line is one that carries a VERSION. That discriminates a real dep from a manifest
# key far better than a denylist of key names — and a version *bump* shows the same name on both
# sides of the diff, so only genuinely NEW names survive.
#
# The name is cut at the first version operator. The cut class carried only ["':= ] until
# 2026-09-04, which is enough for JSON ("pkg": "^1.0") and for a pinned pip line (pkg==1.0) and
# WRONG for everything else: `pkg>=1.0` cut at the `=` left `pkg>` with the operator attached, and
# the charset filter below then dropped it. Every requirement in this project uses `>=`, so the
# check saw none of them. `<>~!` and `[` are now in the class too — the last one for extras, since
# `uvicorn[standard]>=0.24.0` otherwise survives as `uvicorn[standard]` and fails the same filter.
# Verified against all 22 requirement lines here plus JSON, scoped-JSON and pyproject shapes.
dep_names() {                   # dep_names <manifest> <+|->
  git diff --relative --unified=0 "${RANGE[@]}" -- "$1" \
    | grep "^[$2]" | grep -Ev '^[-+]{3}' | grep -v 'drift-ok' \
    | { if printf '%s' "$1" | grep -q 'requirements'; then cat; \
        else grep -E '[0-9]+\.[0-9]+|"\*"|latest|\{'; fi; } \
    | sed 's/^.//; s/^[[:space:]]*//; s/^["'"'"']//' | sed 's/["'"'"':=<>~![ ].*$//' \
    | grep -E '^[A-Za-z0-9@._/-]+$' \
    | grep -Eiv '^(version|name|description|license|author|authors|readme|repository|keywords|main|types|type|private|files|exports|scripts|engines|node|npm|packageManager|requires-python|python|edition|go|rust-version|module|require|tool|project|package|lib|bin|workspace|features|profile|target|(dev-|build-|optional|peer|dev|Dev|Peer|Optional|Build)?[dD]ependenc(y|ies)|dependency-groups|build-system|plugins|resolutions|overrides)$' \
    | sort -u
}
adr_added="$(added_files | grep -E "^$ADR_DIR/")"
while IFS= read -r m; do
  [ -n "$m" ] || continue
  new="$(comm -23 <(dep_names "$m" '+') <(dep_names "$m" '-'))"
  if [ -n "$new" ] && [ -z "$adr_added" ]; then
    report "dependency — $m gained a dependency with no ADR" \
            "rebuilding/absorbing what you already have, undocumented" \
            "add an ADR in $ADR_DIR saying what it replaces and what you rejected (PRINCIPLES #3, #7)"
    say "     $m  →  $(printf '%s' "$new" | paste -sd' ' -)"
  fi
done < <(changed | grep -E "$MANIFESTS")

# --- 4. a lockfile that moved on its own ------------------------------------
check_lock() {                  # check_lock <lock-regex> <manifest-regex> <manifest-name>
  printf '%s\n' "$CHANGED" | grep -qE "$1" || return 0
  printf '%s\n' "$CHANGED" | grep -qE "(^|/)$2$" && return 0
  report "lockfile — the lock for $3 changed but $3 didn't" \
          "reformatting generated or vendored files: touch them only through their generator" \
          "regenerate it from the manifest, or revert it"
}
check_lock '(^|/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?)$' 'package\.json' 'package.json'
check_lock '(^|/)(poetry\.lock|uv\.lock|pdm\.lock)$' 'pyproject\.toml' 'pyproject.toml'
check_lock '(^|/)Cargo\.lock$' 'Cargo\.toml' 'Cargo.toml'
check_lock '(^|/)go\.sum$' 'go\.mod' 'go.mod'
check_lock '(^|/)Gemfile\.lock$' 'Gemfile' 'Gemfile'
check_lock '(^|/)composer\.lock$' 'composer\.json' 'composer.json'
check_lock '(^|/)pubspec\.lock$' 'pubspec\.yaml' 'pubspec.yaml'

# --- 5. generated / vendored content edited by hand -------------------------
hand_edited="$(printf '%s\n' "$CHANGED" | grep -E "$GENERATED" | grep -Ev "$REGENERATED" | grep -vxF -f <(added_files; echo '/dev/null'))"
if [ -n "$hand_edited" ]; then
  report "generated — an existing generated/vendored/migration file was modified" \
          "reformatting generated or vendored files" \
          "change the generator (or write a NEW migration), never the output"
  while IFS= read -r f; do say "     $f"; done <<<"$hand_edited"
fi

# --- 6. an oversized new file ----------------------------------------------
while IFS=$'\t' read -r add path; do
  [ -n "${path:-}" ] || continue
  printf '%s\n' "$path" | grep -Eq "$SKIP_CONTENT" && continue
  if [ "$add" -gt "$MAX_NEW_FILE_LINES" ]; then
    report "size — new file is $add lines (cap $MAX_NEW_FILE_LINES)" \
            "backend/layer-only progress: a file this big is usually several modules in a trench coat" \
            "split it at a real seam, or raise MAX_NEW_FILE_LINES with a reason in CODING_STANDARDS.md"
    say "     $path"
  fi
done < <(added_sizes)

# --- 7. an invariant with no enforcer ---------------------------------------
# INVARIANTS.md is prose, so SKIP_CONTENT excludes it from every other check — but a row claiming
# a domain rule while naming no failing test is the pseudo-artifact this gate exists to refuse.
# Retired invariants strike their id (~~INV-3~~), so they don't match.
while IFS= read -r rec; do
  [ -n "$rec" ] || continue
  row="$(body "$rec")"
  if ! awk -F'|' '{ print $5 }' <<<"$row" | grep -qE 'test:|constraint:|type:|gate:|review-only'; then
    report "invariant — INV row at $(loc "$rec") names no enforcer" \
            "a standard with no enforcer (the pseudo-artifact): an invariant with no failing test is prose" \
            "name the test/constraint that fails when it is violated, or tag it [review-only] and confess it"
    say "     ${row:0:110}"
  fi
done < <(added_lines | awk -F'\t' '$1 ~ /(^|\/)INVARIANTS\.md$/ && $3 ~ /^[[:space:]]*\|[[:space:]]*INV-[0-9]/' | grep -v 'drift-ok')

# --- 8. an accessibility rule with no enforcer ------------------------------
# Check 7 aimed at the surface instead of the domain. DESIGN.md is prose, so an A11Y row promising
# something nothing checks is decoration — the same defect, one altitude up. The tag column carries
# the enforcer and that table has fewer columns than the invariants one, so match the whole row
# rather than a fixed field. Retired rows strike their id (~~A11Y-3~~) and stop matching.
while IFS= read -r rec; do
  [ -n "$rec" ] || continue
  row="$(body "$rec")"
  if ! grep -qE '\[(lint|test|live|types|boundary|script|gate|review-only)\]|test:|lint:|live:' <<<"$row"; then
    report "accessibility — A11Y row at $(loc "$rec") names no enforcer" \
            "a standard with no enforcer: an accessibility promise nothing checks is decoration" \
            "tag it [lint]/[test]/[live] with the real gate, or say [review-only] honestly and confess it"
    say "     ${row:0:110}"
  fi
done < <(added_lines | awk -F'\t' '$1 ~ /(^|\/)DESIGN\.md$/ && $3 ~ /^[[:space:]]*\|[[:space:]]*A11Y-[0-9]/' | grep -v 'drift-ok')

# --- 9. a block of commented-out code ---------------------------------------
# The cheapest dead code to prevent, and the one an agent produces most: the old version left
# commented out "just in case". Git already holds it, so the block is pure cost — it survives
# greps, confuses the next reader, and nothing ever deletes it. A single commented line is a note;
# a RUN of them that parses as code is a deletion someone did not finish. Doc comments (///, //!,
# /** */, jsdoc continuations, #! and #[...]) are excluded, and the body must look like code, so
# prose in a comment block does not fire. Exempt a deliberate block by putting drift-ok on any of
# its lines: that splits the run in two, and both halves fall under the threshold.
while IFS=$'\t' read -r path start count first; do
  [ -n "${path:-}" ] || continue
  report "dead code — $count consecutive commented-out lines at $path:$start" \
          "the code kept just in case: git already has it, so the comment is cost with no reader" \
          "delete it (git log -S recovers it), or if it is not in history yet, commit it before deleting"
  say "     ${first:0:110}"
done < <(printf '%s\n' "$LINES" | awk -F'\t' -v min="$MIN_COMMENTED_BLOCK" '
  function flush() {
    if (run >= min) print rpath "\t" rstart "\t" run "\t" rfirst
    run = 0
  }
  {
    path = $1; ln = $2 + 0; txt = $3; code = 0
    s = txt; sub(/^[[:space:]]+/, "", s)
    if (s ~ /^(\/\/\/|\/\/!|\/\*|\*|#!|#\[)/) {
      code = 0                                        # doc comment or attribute, never a deletion
    } else if (s ~ /^(\/\/|#|--)/) {                  # drift-ok: the comment tokens themselves
      b = s
      sub(/^(\/\/|#|--)[[:space:]]*/, "", b)          # drift-ok: same
      sub(/[[:space:]]+$/, "", b)
      if (b ~ /[;{}(),]$/) code = 1
      if (b ~ /^(if|for|while|return|const|let|var|function|def|class|import|from|export|console|await|async|elif|else|try|catch|except|match|fn|pub|impl|print)[ (]/) code = 1
    }
    if (code && run > 0 && path == rpath && ln == rprev + 1) { run++; rprev = ln }
    else if (code) { flush(); rpath = path; rstart = ln; rprev = ln; rfirst = txt; run = 1 }
    else { flush() }
  }
  END { flush() }
')

# --- verdict ---------------------------------------------------------------
say ""
if [ "$violations" -gt 0 ]; then
  say "drift-check: $violations violation(s). The diff erodes the project's shape — fix, confess, or exempt."
  exit 1
fi
say "drift-check: clean (range: ${RANGE[*]})."
