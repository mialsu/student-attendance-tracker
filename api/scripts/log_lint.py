#!/usr/bin/env python3
"""INV-9's diff-time enforcer: what a logger call may carry, and the log's vocabulary.

Called by `scripts/drift-extra.sh` check 5, which owns the messages and the exit code. Split
into its own file because the first version lived in awk over diff text, and that version was
**false-clean on the shape the leak actually takes** -- adding one keyword line to a logger call
that already exists. The opener was not in the diff, so there was nothing to open a paren count
from, and the gate reported clean. Two independent reviews planted exactly that and both got
`clean`. A gate that misses the common case is the pseudo-artifact this project names.

So this reads the FILE, not the diff, and uses Python's own parser rather than regexes:

* `ast` gives every call's exact span, its keyword names and its literal values, so a name three
  lines inside a multi-line `log_event(` is seen the same as a single-line one, and a `(` inside
  a string literal cannot desynchronise anything.
* Keywords are checked against an ALLOWLIST, not against a list of name-ish words. A denylist of
  `name|query|detail` was the second version, and a review defeated it in one line each with
  `search=`, `q=`, `who=student.full_name` and `students=names`. An allowlist cannot be beaten by
  a synonym: a keyword nobody sanctioned fails, whatever it is called.

The diff still decides WHICH calls are judged -- only calls containing an added line -- so this
stays a diff gate and does not fail a commit for code it did not touch.
"""

import ast
import subprocess
import sys
from collections import defaultdict

# What a log line may carry, beside the request context the formatter adds. ADR-0007: ids and
# counts. `attempted_email` is sanctioned there explicitly -- a Teacher's own credential attempt,
# never a Student's name -- and `exception` carries a TYPE's name, never a message.
#
# Widening this is a deliberate edit in the same commit as the call site, exactly like the
# vocabulary below. That is the whole mechanism: a field nobody argued for cannot arrive quietly.
ALLOWED_KEYWORDS = {
    "rule",
    "reason",
    "status",
    "attempted_email",
    "exception",
    "student_id",
    "class_id",
    "target_student_id",
    "duplicate_student_id",
    "records_moved",
    "records_destroyed",
}

KNOWN_EVENTS = {"denial", "error", "merge", "student_delete"}
KNOWN_RULES = {"INV-1", "INV-3", "INV-5", "INV-6", "INV-7"}
KNOWN_REASONS = {
    "unknown_email",
    "wrong_password",
    "inactive_account",
    "code_used",
    "code_revoked",
    "code_expired",
    "code_wrong_email",
    "code_unknown",
    "class_inactive",
    "cross_class_merge",
}

LOGGER_FUNCS = {"log_event"}
LOGGER_METHODS = {"debug", "info", "warning", "error", "critical", "exception", "log"}


def read_source(path: str, rev: str) -> str | None:
    """The file's content at the END of the range being judged.

    Three modes, because the gate runs three ways and reading the wrong one is how a check
    silently judges the wrong bytes: the working tree (`rev` empty), the index (`:`, which is
    what the pre-commit hook judges), or a commit (CI's resolved range end).
    """
    if not rev:
        try:
            with open(path, encoding="utf-8") as handle:
                return handle.read()
        except OSError:
            return None
    spec = f"{path}" if rev == ":" else f"{rev}:{path}"
    spec = f":{path}" if rev == ":" else spec
    result = subprocess.run(
        ["git", "show", spec], capture_output=True, text=True, check=False
    )
    return result.stdout if result.returncode == 0 else None


def _is_logger_call(node: ast.Call) -> bool:
    func = node.func
    if isinstance(func, ast.Name):
        return func.id in LOGGER_FUNCS
    if isinstance(func, ast.Attribute) and func.attr in LOGGER_METHODS:
        # logger.info(...), get_logger().warning(...), self.logger.error(...)
        target = func.value
        if isinstance(target, ast.Name):
            return "logger" in target.id or "log" == target.id
        if isinstance(target, ast.Call) and isinstance(target.func, ast.Name):
            return "logger" in target.func.id
        if isinstance(target, ast.Attribute):
            return "logger" in target.attr
    return False


def findings_for(path: str, source: str, added: set[int]) -> list[tuple[str, int, str]]:
    """Every violation in the calls that the diff's added lines fall inside."""
    out: list[tuple[str, int, str]] = []
    try:
        tree = ast.parse(source, filename=path)
    except SyntaxError as exc:
        # A gate that cannot read the file must NOT report clean -- that is the failure mode
        # this repo has been bitten by twice (a `^` anchor matching nothing, and a baseline
        # guard scoring a crashed tool as zero problems).
        return [("unparsed", exc.lineno or 1, f"could not parse {path}: {exc.msg}")]

    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        span = range(node.lineno, (node.end_lineno or node.lineno) + 1)
        if not added.intersection(span):
            continue

        logger_call = _is_logger_call(node)

        if logger_call:
            for keyword in node.keywords:
                if keyword.arg is None:
                    # `**fields` -- unresolvable textually, and a blind spot this gate owns
                    # rather than hides. See REVIEW-DEBT.md.
                    continue
                if keyword.arg not in ALLOWED_KEYWORDS:
                    out.append(
                        (
                            "keyword",
                            keyword.value.lineno,
                            f"{keyword.arg}= is not a sanctioned log field",
                        )
                    )
            # The event name is log_event's second positional argument.
            if len(node.args) >= 2 and isinstance(node.args[1], ast.Constant):
                value = node.args[1].value
                if isinstance(value, str) and value not in KNOWN_EVENTS:
                    out.append(("vocab", node.args[1].lineno, f'event="{value}"'))

        # rule= / reason= are checked on EVERY call, not just logger calls: they are set at the
        # raise site, which is where the vocabulary actually grows.
        for keyword in node.keywords:
            if keyword.arg in ("rule", "reason") and isinstance(keyword.value, ast.Constant):
                value = keyword.value.value
                if not isinstance(value, str):
                    continue
                known = KNOWN_RULES if keyword.arg == "rule" else KNOWN_REASONS
                if value not in known:
                    out.append(("vocab", keyword.value.lineno, f'{keyword.arg}="{value}"'))
    return out


def main() -> int:
    rev = sys.argv[1] if len(sys.argv) > 1 else ""
    added: dict[str, set[int]] = defaultdict(set)
    for raw in sys.stdin:
        parts = raw.rstrip("\n").split("\t", 2)
        if len(parts) < 2:
            continue
        path, lineno = parts[0], parts[1]
        if not path.endswith(".py"):
            continue
        if not (path.startswith("app/") or "/app/" in path):
            continue
        if lineno.isdigit():
            added[path].add(int(lineno))

    rows: list[tuple[str, str, int, str]] = []
    for path in sorted(added):
        # Paths arrive relative to the GIT ROOT; this script runs from the api/ package.
        local = path.split("/app/", 1)[-1] if "/app/" in path else path
        local = f"app/{local}" if not local.startswith("app/") else local
        source = read_source(local, rev)
        if source is None:
            continue
        for kind, lineno, detail in findings_for(local, source, added[path]):
            rows.append((kind, local, lineno, detail))

    for kind, path, lineno, detail in rows:
        print(f"{kind}\t{path}\t{lineno}\t{detail}")
    return 1 if rows else 0


if __name__ == "__main__":
    sys.exit(main())
