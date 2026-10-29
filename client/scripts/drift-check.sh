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
# and a multi-word banned term as a RUN of them (clientRef -> client + ref, which flags
# client_ref and clientRefId but not `ref`), so it catches `createPurchase` without
# flagging `runtime`, `overrun`, or `setWindowFlags`. It
# still errs toward catching: a missed synonym silently forks the project's language (expensive),
# a false positive costs one `drift-ok` (cheap). If it is noisy, suspect GLOSSARY.md first — an
# `_Avoid_` list should hold domain synonyms, not general programming words.
#
# Checks: vocabulary drift, unconfessed suppressions, undeclared dependencies, stray lockfiles,
# hand-edited generated files, oversized new files, invariants with no enforcer, accessibility
# rules with no enforcer, blocks of commented-out code, deliberate ceilings that name no
# upgrade path or arrive with no confession, token VALUES living in a markdown file, a regenerated
# ERD left out of the commit, and a diagram caption citing code that is not there.
#
# Tunables (env, or drift-check.local.sh): MAX_NEW_FILE_LINES, MAX_NEW_TEST_FILE_LINES, LEDGER,
#                 ADR_DIR, MIN_TERM_LEN, POLICE_STRINGS, MIN_COMMENTED_BLOCK, DRIFT_ROOT, ERD_CMD.
#
# THIS FILE IS NOT EDITED IN A PROJECT. Every project carries it byte-identical to devkit's
# template; what is the project's own lives beside it in `drift-check.local.sh`, which this file
# sources when it exists: the tunables above, `DEVKIT_GATE` (the devkit commit this copy came
# from), a `local_settings` function to extend the patterns, and a `local_checks` function for the
# checks only this project needs. A fix found in a project goes back to devkit's template and
# comes out again through `/harness sync`; edited in place, the copies drift from the template and
# from each other, which is how four projects came to differ by 64 to 299 lines (2026-10-29).

set -uo pipefail

# The gate's own file, as an absolute path taken BEFORE the cd below changes what a relative $0
# points at. Check 6 waives its size cap for this one file.
case "$0" in /*) SELF="$0" ;; *) SELF="$PWD/$0" ;; esac
LOCAL="${SELF%/*}/drift-check.local.sh"
# shellcheck source=/dev/null
[ -f "$LOCAL" ] && . "$LOCAL"

# DRIFT_ROOT=package polices only the package this copy sits in (`<pkg>/scripts/drift-check.sh`
# polices `<pkg>/`), for a monorepo whose packages each carry their own gate; the default is the
# whole repo. Every `git diff` below carries `--relative`, a NO-OP at the git root. In a package it
# is what keeps the gate working: `git ls-files` reports paths relative to the cwd while `git diff`
# reports them from the GIT ROOT, so every check that took a path from a diff and handed it back to
# git matched nothing and printed clean. Found the hard way on 2026-09-04.
if [ "${DRIFT_ROOT:-repo}" = "package" ]; then
  cd "${SELF%/*}/.." || exit 2
else
  cd "$(git rev-parse --show-toplevel)" || exit 2
fi

MAX_NEW_FILE_LINES="${MAX_NEW_FILE_LINES:-400}"
# A test file's length tracks the surface it covers, not muddled responsibilities, so a project may
# give tests a looser cap. Not an exemption: the default is the same cap. Found in the attendance
# tracker, whose convention is one test file per service.
MAX_NEW_TEST_FILE_LINES="${MAX_NEW_TEST_FILE_LINES:-$MAX_NEW_FILE_LINES}"
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

# Every check below reads `git diff` through a pipe, so a range git cannot take (a bad revision, or
# `a...b` with no merge base after a history-replacing push) printed `fatal:` and then "clean". A
# range nothing can be checked against is a failure, not a pass. Found by sitesmith's issue #14.
if ! git diff --relative --name-only "${RANGE[@]}" >/dev/null; then
  echo "drift-check: git cannot diff the range (${RANGE[*]}); nothing was checked." >&2
  exit 2
fi

# Files whose CONTENT this gate does not police (prose, locks, generated, vendored, snapshots).
SKIP_CONTENT='(^|/)(CHANGELOG|README|REVIEW-DEBT|CODING_STANDARDS|GLOSSARY|GLOSSARY-MAP|CONTEXT|CONTEXT-MAP)\.md$|\.(md|txt|snap|svg|png|jpg|lock)$|(^|/)(vendor|node_modules|dist|build|\.venv)/|-lock\.(json|yaml)$|(^|/)(go\.sum|yarn\.lock|bun\.lockb)$|\.min\.|\.gen\.[a-z]+$|(^|/)drizzle/|(^|/)openapi\.json$|(^|/)schema\.d\.ts$'
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

# The project's own extensions to the patterns above (`SKIP_CONTENT="<its fixtures>|$SKIP_CONTENT"`).
declare -F local_settings >/dev/null && local_settings

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
  git diff --relative --unified=0 "${RANGE[@]}" | awk '
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
# Regexes reach awk through ENVIRON, never -v: awk processes backslash escapes in a -v assignment,
# so `\.md$` arrived as `.md$` (any character, then md) and gawk warned on every run. Found at
# prep-planner's bootstrap, 2026-10-20, when check.sh step 3 had been reporting the gate BROKEN.
# The gate's own file is devkit's, byte-identical in every project and policed by devkit's
# check.sh, so a project's GLOSSARY.md must not reach into its prose: a word one project bans is
# plain English in the template, and every sync would trip on it. Found by sitesmith's first sync,
# whose glossary bans `extension`. Matched by inode, as check 6 does, so another file that happens
# to share the name is still policed.
# Every `grep -v 'drift-ok'` here carries -a: GNU grep reads a line that is not valid UTF-8 (a Latin-1
# file) as binary and drops it, so that line escaped every content check. Found at prep-planner's
# sync, 2026-10-29, on its Latin-1 Fineli fixtures.
SELF_PATH=""
while IFS= read -r f; do
  [ "$f" -ef "$SELF" ] && { SELF_PATH="$f"; break; }
done < <(git ls-files --cached --others --exclude-standard -- '*drift-check.sh')
policed_lines() {
  added_lines | SKIP="$SKIP_CONTENT" SELFP="$SELF_PATH" awk -F'\t' '$1 !~ ENVIRON["SKIP"] && $1 != ENVIRON["SELFP"]' | grep -av 'drift-ok'
}
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
# GLOSSARY.md since mattpocock-skills 1.3.1 renamed it; GLOSSARY.md is still read for projects
# bootstrapped before that, so the gate never silently goes blind on an older repo.
done < <(git ls-files | grep -E '(^|/)(GLOSSARY|CONTEXT)\.md$')
terms="$(printf '%s' "$terms" | awk -v m="$MIN_TERM_LEN" 'length($0)>=m' | sort -fu)"

if [ -n "$terms" ] && [ -n "$LINES" ]; then
  # Match whole IDENTIFIER SEGMENTS, not substrings: clientId -> [client, id] flags `client`,
  # while runtime / overrun / lockstep / setWindowFlags do NOT match run / step / flag. Plurals
  # count only for terms of 5+ chars, so `flag` never flags Qt's `Flags` but `purchase` catches
  # `purchases`.
  #
  # A banned word is ITSELF an identifier, so it is split the same way and matched as a run of
  # CONSECUTIVE segments: a two-word term becomes [client, ref] and flags clientRef, client_ref,
  # ClientRefs and clientRefId, while leaving `ref` and `clientName` alone.
  # Storing the term whole instead left every multi-word entry in a glossary permanently inert:
  # segment `client` can never equal key `clientref`, so the check printed clean forever and the
  # words most likely to fork a domain's language — a two-word concept's synonym is naturally
  # itself two words — were exactly the ones that could not fire. Found at tekstiilikierto on
  # 2026-09-24 by probing the gate rather than reading it: 30 of that project's 80 banned words
  # had never been able to match. The longest run wins, so a 3-segment term reports itself
  # rather than the 2-segment term nested inside it.
  #
  hits="$(printf '%s\n' "$LINES" | awk -F'\t' -v terms="$terms" -v SQ="'" -v police="$POLICE_STRINGS" '
  function seglist(id, out,    i,c,prev,nxt,cur,k,isup,prevlow,nxtlow) {
    k=0; cur="";
    for (i=1; i<=length(id); i++) {
      c = substr(id,i,1);
      if (c=="_" || c=="-" || c==" ") { if (cur!="") { out[++k]=tolower(cur); cur="" } ; continue }
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
  function banned(seg, k, start,   L, max, key, j, last, sing) {
    max = k - start + 1; if (max > MAXSEG) max = MAXSEG;
    for (L = max; L >= 1; L--) {
      key = seg[start];
      for (j = start+1; j < start+L; j++) key = key SEP seg[j];
      if (key in BAN) return BANDISP[key];
      last = seg[start+L-1];
      if (length(last) > 1 && substr(last,length(last)) == "s") {
        sing = substr(last,1,length(last)-1);
        key = seg[start];
        for (j = start+1; j < start+L-1; j++) key = key SEP seg[j];
        if (L > 1) key = key SEP sing; else key = sing;
        # The 5-char floor counts LETTERS, not separators, so a one-segment term keeps exactly
        # its old behaviour: `flag` still ignores `Flags`, `purchase` still catches `purchases`.
        if ((key in BAN) && length(key) - (L-1) >= 5) return BANDISP[key];
      }
    }
    return "";
  }
  BEGIN {
    # SEP is a space: seglist emits only [A-Za-z0-9] runs, so it cannot occur inside a segment.
    SEP = " "; MAXSEG = 1;
    n = split(terms, T, "\n");
    for (i=1;i<=n;i++) {
      t=T[i]; sub(/^[ \t]+/,"",t); sub(/[ \t]+$/,"",t);
      if (t=="") continue;
      kb = seglist(t, B);                               # NOT tolower()d first: seglist needs the case
      if (kb == 0) continue;
      key = B[1];
      for (j=2;j<=kb;j++) key = key SEP B[j];
      BAN[key]=1; BANDISP[key]=t;                       # BANDISP reports the GLOSSARY.md spelling
      if (kb > MAXSEG) MAXSEG = kb;
      delete B;
    }
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
        b = banned(S, k, j);
        if (b != "") { if (!(id in SEEN)) { SEEN[id]=1; found = found (found==""?"":" ") id "(" b ")" } break }
      }
      delete S;
    }
    if (found != "") print $1 ":" $2 "  ->  " found;
  }')"
  if [ -n "$hits" ]; then
    count="$(printf '%s\n' "$hits" | wc -l | tr -d ' ')"
    report "vocabulary — a word GLOSSARY.md says to avoid is entering the code ($count)" \
            "two words for one thing: the project's language forks silently" \
            "use the canonical GLOSSARY.md term, or add \`drift-ok\` if this word genuinely means something else here"
    printf '%s\n' "$hits" | head -15 | sed 's/^/     /'
    if [ "$count" -gt 15 ]; then
      say "     … and $((count - 15)) more of the same kind. The cap is display-only — all $count are violations."
      say "     If most look like general programming words, the fix is GLOSSARY.md: a domain glossary's"
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
# The name is cut at the first version operator. The cut class was ["':= ] until 2026-09-04, which
# handles JSON ("pkg": "^1.0") and a pinned pip line (pkg==1.0) and NOTHING else: `pkg>=1.0` cut at
# the `=` left `pkg>` with the operator still attached, and the charset filter below then dropped
# it — so in any project pinning with `>=`, which is most Python projects, this check silently saw
# no dependencies at all. `[` is in the class for the same reason one level up: extras like
# `uvicorn[standard]>=0.24.0` otherwise survive as `uvicorn[standard]` and fail the same filter.
# Verified by instantiating this template in a scratch repo and watching it go from clean to red.
# A pip option line (`-r base.in`, `-c constraints.txt`) names a file, not a package, and mypy's
# `python_version` in pyproject.toml is a setting; both read as dependencies until the attendance
# tracker's sync, 2026-10-29.
dep_names() {                   # dep_names <manifest> <+|->
  git diff --relative --unified=0 "${RANGE[@]}" -- "$1" \
    | grep "^[$2]" | grep -Ev '^[-+]{3}' | grep -av 'drift-ok' \
    | { if printf '%s' "$1" | grep -q 'requirements'; then cat; \
        else grep -E '[0-9]+\.[0-9]+|"\*"|latest|\{'; fi; } \
    | sed 's/^.//; s/^[[:space:]]*//; s/^["'"'"']//' | grep -v '^-' | sed 's/["'"'"':=<>~![ ].*$//' \
    | grep -E '^[A-Za-z0-9@._/-]+$' \
    | grep -Eiv '^(version|name|description|license|author|authors|readme|repository|keywords|main|types|type|private|files|exports|scripts|engines|node|npm|packageManager|requires-python|python|python_version|edition|go|rust-version|module|require|tool|project|package|lib|bin|workspace|features|profile|target|(dev-|build-|optional|peer|dev|Dev|Peer|Optional|Build)?[dD]ependenc(y|ies)|dependency-groups|build-system|plugins|resolutions|overrides)$' \
    | sort -u
}
# Each new name must appear IN BACKTICKS in some file under $ADR_DIR (`postgres` in ADR-0003), so a
# prose mention ("PostgreSQL holds the data") never counts. Until 2026-10-21 this check passed every
# new dependency as long as ANY file was added under $ADR_DIR in the same diff, so one unrelated ADR
# waved through all of them, and an amendment to an existing ADR (a modification) satisfied nothing.
# Found at prep-planner's ticket 1, when `postgres`, already decided in ADR-0003, failed the gate.
# --cached reads the staged ADRs, so an unstaged edit cannot vouch for a staged dependency.
# `@types/<pkg>` is <pkg>'s typings, not a decision of its own, so it counts as named when <pkg> is
# (`@types/scope__name` types `@scope/name`). Found in sitesmith, whose ADR names `react` and every
# new site then failed on `@types/react`.
adr_names() {                   # adr_names <dep>: true when `<dep>` appears in an ADR
  local typed="$1"
  case "$1" in
    @types/*__*) typed="@${1#@types/}"; typed="${typed/__//}" ;;
    @types/*)    typed="${1#@types/}" ;;
  esac
  if [ "${RANGE[0]}" = "--cached" ]; then
    git grep -qF --cached -e "\`$1\`" -e "\`$typed\`" -- "$ADR_DIR"
  else
    grep -rqF -e "\`$1\`" -e "\`$typed\`" "$ADR_DIR" 2>/dev/null
  fi
}
while IFS= read -r m; do
  [ -n "$m" ] || continue
  new="$(comm -23 <(dep_names "$m" '+') <(dep_names "$m" '-'))"
  undocumented="$(while IFS= read -r d; do [ -n "$d" ] && ! adr_names "$d" && printf '%s\n' "$d"; done <<<"$new")"
  if [ -n "$undocumented" ]; then
    report "dependency — $m gained a dependency no ADR names" \
            "rebuilding/absorbing what you already have, undocumented" \
            "name it in backticks in an ADR in $ADR_DIR, saying what it replaces and what you rejected (PRINCIPLES #3, #7)"
    say "     $m  →  $(printf '%s' "$undocumented" | paste -sd' ' -)"
  fi
done < <(changed | grep -E "$MANIFESTS")

# --- 4. a lockfile that moved on its own ------------------------------------
check_lock() {                  # check_lock <lock-regex> <manifest-regex> <manifest-name>
  # Here-strings, not `printf | grep -q`: grep -q exits at its first match, and with pipefail a
  # change list past the pipe buffer then fails the pipe (SIGPIPE), which read as "no lockfile
  # changed" and skipped this check (sitesmith's issue #14).
  grep -qE "$1" <<<"$CHANGED" || return 0
  grep -qE "(^|/)$2$" <<<"$CHANGED" && return 0
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
# The gate's own file is waived. Every project vendors it and it is longer than the cap, so check 6
# flagged it in every project on the commit that added it. Found at sitesmith on 2026-09-28 by
# running the gate over its bootstrap commit. The match is by inode (`-ef` against SELF), so a
# second big file named drift-check.sh is still caught, and so is a vendored copy checked by a
# different copy of the gate. The waiver covers the size cap alone; the content checks still police
# this file.
while IFS=$'\t' read -r add path; do
  [ -n "${path:-}" ] || continue
  printf '%s\n' "$path" | grep -Eq "$SKIP_CONTENT" && continue
  [ "$path" -ef "$SELF" ] && continue
  cap="$MAX_NEW_FILE_LINES"; knob=MAX_NEW_FILE_LINES
  if grep -Eq '(^|/)(tests?|__tests__)/|[._-](test|spec)\.[a-z]+$|(^|/)test_[^/]+\.py$' <<<"$path"; then
    cap="$MAX_NEW_TEST_FILE_LINES"; knob=MAX_NEW_TEST_FILE_LINES
  fi
  if [ "$add" -gt "$cap" ]; then
    report "size — new file is $add lines (cap $cap)" \
            "backend/layer-only progress: a file this big is usually several modules in a trench coat" \
            "split it at a real seam, or raise $knob with a reason in CODING_STANDARDS.md"
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
done < <(added_lines | awk -F'\t' '$1 ~ /(^|\/)INVARIANTS\.md$/ && $3 ~ /^[[:space:]]*\|[[:space:]]*INV-[0-9]/' | grep -av 'drift-ok')

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
done < <(added_lines | awk -F'\t' '$1 ~ /(^|\/)DESIGN\.md$/ && $3 ~ /^[[:space:]]*\|[[:space:]]*A11Y-[0-9]/' | grep -av 'drift-ok')

# --- 9. a block of commented-out code ---------------------------------------
# The cheapest dead code to prevent, and the one an agent produces most: the old version left
# commented out "just in case". Git already holds it, so the block is pure cost — it survives
# greps, confuses the next reader, and nothing ever deletes it. A single commented line is a note;
# a RUN of them that parses as code is a deletion someone did not finish. Doc comments (///, //!,
# /** */, jsdoc continuations, #! and #[...]) are excluded, and the body must look like code, so
# prose in a comment block does not fire. Stylesheets are a special case: `--` opens a custom
# property and `#` an id selector, so in .css/.scss/.sass/.less/.styl only `//` counts as a comment
# token. Without that, three consecutive CSS variables read as an unfinished deletion — which is
# every design-token block and every Tailwind `@theme`. Found at tekstiilikierto's bootstrap,
# 2026-09-23. Exempt a deliberate block by putting drift-ok on any of
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
    } else if (path ~ /\.(css|scss|sass|less|styl)$/ && s !~ /^\/\//) {
      code = 0                                        # stylesheet: -- opens a custom property and # an id selector, neither is a comment
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

# --- 10. a deliberate ceiling with no way out, or no confession -------------
# A simplification that is correct today and has a known limit is a decision worth making
# (PRINCIPLES #3). The marker is what keeps it a decision rather than a surprise: a grep for the
# token is the standing list of corners this repo has knowingly cut. Two ways it decays, so two
# branches. A marker naming no upgrade path is the pseudo-artifact of checks 7 and 8 one altitude
# down — it reads like a bounded choice and states no bound. A marker with no ledger entry is the
# defect check 2 catches: the confession deferred until it is lost. The upgrade line gets 3 lines
# of slack so a wrapped comment block still passes, and the tokens are passed INTO awk rather than
# written inside it, so only the two definition lines below need exempting from the gate this repo
# runs on itself.
ceil_re='CEILING:'                              # drift-ok: this line IS the pattern definition
up_re='Upgrade:'                                # drift-ok: same
if [ -n "$LINES" ]; then
  ceilings="$(printf '%s\n' "$LINES" | grep -F "$ceil_re")"
  if [ -n "$ceilings" ]; then
    if ! grep -qxF "$LEDGER" <<<"$CHANGED"; then
      report "ceiling — a deliberate ceiling landed without a confession" \
              "deferring the confession: a corner cut on purpose is still a corner nobody else knows about" \
              "add the entry to $LEDGER in THIS commit, with its Ceiling line (PRINCIPLES #5)"
      while IFS= read -r h; do say "     $(loc "$h")  →  $(body "$h" | sed 's/^[[:space:]]*//' | cut -c1-100)"; done <<<"$ceilings"
    fi
    while IFS= read -r rec; do
      [ -n "$rec" ] || continue
      report "ceiling — the marker at $(loc "$rec") names no way out" \
              "a standard with no enforcer: a ceiling with no upgrade path is an excuse wearing a convention" \
              "add the upgrade line under it, naming what has to change and when that becomes necessary"
      say "     $(body "$rec" | sed 's/^[[:space:]]*//' | cut -c1-110)"
    done < <(printf '%s\n' "$LINES" | awk -F'\t' -v c="$ceil_re" -v u="$up_re" '
      { if (index($3, u)) up[$1 ":" ($2 + 0)] = 1
        if (index($3, c)) { n++; cp[n] = $1; cl[n] = $2 + 0; ct[n] = $3 } }
      END {
        for (i = 1; i <= n; i++) {
          found = 0
          for (d = 0; d <= 3; d++) if (up[cp[i] ":" (cl[i] + d)]) found = 1
          if (!found) print cp[i] "\t" cl[i] "\t" ct[i]
        }
      }
    ')
  fi
fi

# --- 11. token values living in a markdown file -----------------------------
# DESIGN.md records WHERE the tokens live; the VALUES live in code, because a token table in prose
# beside tokens in code is two implementations of one thing — they drift, and then both are suspect
# (ANTI-PATTERNS: two formats for one artifact).
#
# Two ways that line gets crossed, so two triggers. `ui-ux-pro-max --design-system --persist` writes
# a whole tree of them (design-system/<slug>/MASTER.md plus its page overrides); its own SKILL.md
# says not to persist unverified output, and METHOD.md's reuse table says devkit never does.
# The likelier crossing needs no skill at all: an agent filling DESIGN.md in with a tidy palette
# table, because a table looks like diligence.
#
# Trigger B demands BOTH a custom-property name AND a value literal on the same table row. The name
# alone is ordinary prose — devkit's own reuse table names `--persist` and `--space-*`, and DESIGN.md
# is meant to be able to say the tokens are called `--color-*`. It is the name carrying its VALUE
# that duplicates the code. Three rows, not one, so a token quoted while explaining a decision
# stays legal and a TABLE does not. Value forms come from real `--persist` output: `#1E40AF` in a
# colour row, `4px` / `0.25rem` in a spacing row. Intervals like {3,8} are avoided so this reads the
# same under mawk as under gawk.
PERSISTED_DS='(^|/)design-system/[^/]+/(MASTER\.md|pages/[^/]+\.md)$'
ds_tok='\-\-[a-z][a-z0-9-]*'                                   # drift-ok: this line IS the pattern
ds_val='#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]|[0-9](px|rem|em)'   # drift-ok: same
while IFS= read -r f; do
  [ -n "$f" ] || continue
  report "tokens — $f is a persisted design system" \
          "two formats for one artifact: its token table is a second home for values that live in code" \
          "delete it; take --design-system as a READ and keep the values in the token file (METHOD.md)"
done < <(added_files | grep -E "$PERSISTED_DS")

while IFS= read -r rec; do
  [ -n "$rec" ] || continue
  report "tokens — $(cut -f2 <<<"$rec") carries $(cut -f1 <<<"$rec") token/value rows" \
          "two formats for one artifact: a token table in prose drifts from the tokens in code" \
          "move the values to the token file in code, and cite its PATH here instead"
done < <(added_lines | grep -av 'drift-ok' | DS_TOK="$ds_tok" DS_VAL="$ds_val" awk -F'\t' '
    BEGIN { t = ENVIRON["DS_TOK"]; v = ENVIRON["DS_VAL"] }
    $1 ~ /\.md$/ && $3 ~ /^[[:space:]]*\|/ && $3 ~ t && $3 ~ v { c[$1]++ }
    END { for (f in c) if (c[f] >= 3) print c[f] "\t" f }')

# --- 12. a regenerated ERD left out of the commit ---------------------------
# The ERD is a SNAPSHOT of whatever declares the schema (METHOD.md, Diagrams), so the project's own
# test already fails when the two disagree — but that test reads the WORKING TREE. It passes on a
# regenerated file the commit then leaves behind, and the commit carries a diagram of a schema that
# no longer exists. So this fires on that gap itself, whatever the schema's source: a SQL migration,
# an ORM's schema file, a document store's collection config. A trigger on the source's paths was
# the first version, and fires on every edit to a file that holds more than the schema.
# Only at a commit: a range is committed trees, where the snapshot test reads what the commit
# carries. Inert until the project has an ERD.
ERD_DOC='(^|/)schema\.gen\.md$'
if [ "${RANGE[*]}" = "--cached" ]; then
  while IFS= read -r erd; do
    [ -n "$erd" ] || continue
    report "schema — $erd was regenerated but the change is not staged" \
            "trusting status over code: the snapshot test passed on a file this commit leaves out" \
            "stage it, or run ${ERD_CMD:-the ERD command} first if the schema changed"
  done < <({ git diff --relative --name-only; git ls-files --others --exclude-standard; } | grep -E "$ERD_DOC" | sort -u)
fi

# --- 13. a diagram caption naming code that is not there --------------------
# A diagram earns its place by pointing at the real thing, and the first part to rot is the path:
# a folder is renamed and the picture keeps citing the old one, confidently. Every diagram caption
# carries a `**Code:**` line listing what it describes, in backticks; a listed path that is not in
# the repo fails here. Prose cannot be checked and the drawing cannot be checked, but this can — it
# is the enforceable half of the caption contract (METHOD.md, Diagrams).
# Only tokens that look like paths are tested: a backticked command or identifier is left alone.
# The field must OPEN its line (a blockquote marker is allowed), so prose that mentions the caption
# contract in passing is not a caption. devkit's own METHOD.md tripped the first version this way.
# It reads EVERY caption in the repo on every run, not only the lines a diff adds: a rename touches
# no caption, so a check on added lines never saw the rot it exists for (found in sitesmith). At a
# commit it reads the index, since that is what the commit carries.
CAPTION='^[[:space:]]*(>[[:space:]]*)?\*\*Code:\*\*'
if [ "${RANGE[*]}" = "--cached" ]; then
  captions() { git grep --cached -n -E "$CAPTION" -- '*.md'; }
  in_repo()  { [ -n "$(git ls-files --cached -- "$1")" ]; }
else
  captions() { git grep -n -E "$CAPTION" -- '*.md'; }
  in_repo()  { [ -e "$1" ]; }
fi
while IFS= read -r rec; do
  [ -n "$rec" ] || continue
  where="$(cut -d: -f1-2 <<<"$rec")"
  while IFS= read -r token; do
    [ -n "$token" ] || continue
    case "$token" in
      */*) ;;
      *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs|*.sql|*.sh|*.md|*.json|*.yaml|*.yml|*.css|*.py|*.go|*.rs|*.prisma) ;;
      *) continue ;;
    esac
    in_repo "${token%/}" && continue
    report "caption — $where cites $token, which is not in the repo" \
            "the pseudo-artifact: a diagram whose caption points at code that moved" \
            "fix the path, or redraw the diagram for where the code actually is"
  done < <(cut -d: -f3- <<<"$rec" | grep -oE '`[^`]+`' | tr -d '`')
done < <(captions | grep -av 'drift-ok')

# --- the project's own checks ----------------------------------------------
# `local_checks` in drift-check.local.sh, with `report`, `changed`, `added_lines` and the rest of
# the helpers above in reach. A check that would serve every project belongs in this file instead.
declare -F local_checks >/dev/null && local_checks

# --- verdict ---------------------------------------------------------------
say ""
if [ "$violations" -gt 0 ]; then
  say "drift-check: $violations violation(s). The diff erodes the project's shape — fix, confess, or exempt."
  exit 1
fi
say "drift-check: clean (range: ${RANGE[*]})."
