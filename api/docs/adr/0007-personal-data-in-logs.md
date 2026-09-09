# ADR-0007 — Structured logs carry ids, never Student names

**Status:** accepted, 2026-09-09. **Not yet implemented** — `specs/0005-application-logging.md`
holds the acceptance criteria, and this file will not claim otherwise until they carry verdicts.

Numbered 0007: **ADR-0005** stays reserved by `specs/0004-shared-classes.md` for the
`class_teachers` schema decision, and 0006 is tracing.

## Why now

The API is getting its first logger (spec 0005). The decision worth recording is not *that* it logs
— that needs no ADR — but **what a log line is allowed to contain**, because a future session will
propose logging a Student's name for debuggability and the alternatives need to be findable rather
than re-argued from scratch.

Reversibility is the argument itself, and it runs the opposite way to the usual one. Adding names to
log lines later is trivial. Removing them is not: the sink rotates by size only, so at this app's
volume a name written today sits in the rotation effectively forever, and the habit spreads to every
new call site. **The restrictive choice is the reversible one.** That inversion is exactly what a
reader six months from now will not reconstruct.

## The decision

**A log line identifies people by opaque id. A Student's name never appears in one.**

- Teacher identity is a `User` UUID. A failed login additionally records the **attempted email**,
  because the response deliberately cannot distinguish unknown-email from wrong-password and the log
  is the only place that distinction can live.
- Irreversible acts — merge, student delete — record ids and **row counts**. A merge line says how
  many attendance records moved, which is what answers "was that the pair I meant" without naming
  anyone.
- Lines are **JSON**, one object per line, chosen because the attempted email puts
  attacker-supplied text into the record: `json.dumps` escapes an embedded newline, so a forged line
  is impossible by construction rather than by remembering to escape at each call site.
- Retention is **size-based only** — `max-size: 10m`, `max-file: 3`. Docker's `json-file` driver has
  no time-based option, so "erase after 90 days" is not expressible at this sink. Accepted and
  confessed rather than faked.
- The rule becomes **`INV-9`** with two enforcers: a runtime assertion over captured log output, and
  a diff-time gate.

## The scope of the rule, checked rather than assumed

The rule is scoped to **logs**, not to the system. A broader wording was drafted and abandoned:

> ~~"A deleted Student leaves no personal identifier anywhere in the system."~~

`deployment/scripts/backup-db.sh` keeps the last **seven** `pg_dump`s, each a full dump including
Student names. That invariant would have been false the day it was written, which is the
pseudo-artifact this project's anti-pattern list names directly. What makes a log different from a
backup is not durability — it is that logs get pasted into bug reports, issues and chat, and backups
do not.

Four other facts behind this decision were established by running them, not recalled:

- **Unhandled 500s already leave full tracebacks.** A raising route under default uvicorn prints one
  to stdout; there is no global `Exception` handler to swallow it and OpenTelemetry's recorder
  re-raises. The premise "a 500 leaves no durable record" was wrong, and the logger's purpose was
  narrowed accordingly.
- **`trace_id` needs no new dependency.** `trace.get_current_span().get_span_context()` yields it
  from the already-installed `opentelemetry-api` and reports `is_valid = False` when tracing is off,
  which is what lets the formatter omit the field instead of zero-filling it.
  `opentelemetry-instrumentation-logging` was investigated and is not needed.
- **uvicorn's loggers will not be captured by accident.** `uvicorn` and `uvicorn.access` both carry
  `propagate = False` with their own handlers, so the container log carries two shapes by design.
- **The invariant gate is textual.** `drift-check.sh` check 7 refuses an `INV-` row naming no
  enforcer, but matches on the text, so a row citing a test file that does not exist yet would pass.
  `INV-9`'s row therefore lands with its enforcer, not before it.

## What this does not do

- It does not stop a Student's name reaching a **span**. `http.url` still carries the autocomplete
  query string, which ADR-0006 accepted and mitigated by binding Jaeger to localhost behind an SSH
  tunnel. The two decisions differ on purpose: a span is read through a tunnel, a log line is read
  by `docker compose logs` and pasted onward.
- It does not make deletion complete. Seven backups still hold the name.
- It does not give the log lines time-based erasure, and nothing here pretends it does.
- It does not make the log a recovery mechanism. Ids-only means a merge line proves the act and its
  scale and cannot reverse it. That was chosen knowingly.

## Rejected alternatives

| Rejected | Why |
|---|---|
| **Student names in log lines** | Creates a copy that outlives the deletion `CONTEXT.md` treats as complete, in a sink whose only retention is size-based — at one Teacher and weekly use, a name could sit there for years. |
| **Names on error lines only** | Two rules to hold in one head, and error lines are precisely the ones pasted into a bug report. |
| **Match the Jaeger precedent** — accept partial names as `http.url` already does | Consistent, and less to enforce. Rejected because the mitigation does not transfer: a span is behind an SSH tunnel, a log line travels wherever `docker compose logs` output goes. |
| **Log the name hashed** | Reversible by dictionary attack against a name space of a few dozen students in one class. It reads like a mitigation without being one. |
| **Plain text with per-call-site escaping** | Readable directly in `logs.sh`, and one line shorter. Rejected because injection safety would depend on remembering to escape at every site — a rule with no enforcer, which this repo files under *a standard with no enforcer*. |
| **JSON in production, plain text locally** | The format you debug against would not be the format production emits, and the injection path would exist only in the branch nobody reads. |
| **An audit table in the database** | Retention becomes SQL and a delete is a delete, which is a real gain. Rejected because it fails for the case logs exist for: a 500 that cannot reach the database records nothing. |
| **Host-side `logrotate` with a time cap** | Achieves genuine time-based erasure. Rejected because the configuration would live outside the repo — no gate could prove it was in place, and a later session could not verify it from the code. Same class of problem `/prune` describes for env vars. |
| **Loki + Promtail + Grafana** | ADR-0006's arithmetic is unchanged: ~0.5 GB of services against Jaeger's measured 12 MiB idle, on a 4 GB CX21 also running PostgreSQL. |
| **A hosted log backend** | Zero RAM and a better UI, and it would ship student-adjacent records off the machine continuously. Same grounds ADR-0006 rejected Grafana Cloud and Honeycomb on. |
| **`trace_id` as the only correlation id** | No id locally, none in tests, none on the excluded routes, and removing `OTEL_EXPORTER_OTLP_ENDPOINT` — the documented off switch — would silently strip correlation from every line. |
| **No correlation id at all** | Shortest diff, and defensible at this traffic. Rejected because four uvicorn workers interleave their output, and nginx's 429s could never be joined to the app's failures. |
| **Converting uvicorn's loggers to JSON** | One uniform stream. Rejected because it touches the traceback path that demonstrably works today, and a multi-line traceback inside a JSON string field reads far worse at a terminal. |
| **Logging every successful mutation** | A full write audit trail. Highest volume, the most routine exposure of Student ids, and most of it is recoverable by reading the database. |
