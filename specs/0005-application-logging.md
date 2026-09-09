# 0005 — Application logging: denials, errors, and irreversible acts

> Shaped with the Owner on 2026-09-09 (`/grill-with-docs` → `/to-spec`), eleven decisions, one
> seam. Weight: **Standard**.
>
> **Invariants touched:** `INV-1`, `INV-3`, `INV-6`, `INV-7`, and **`INV-9` is created here**.
>
> **`INV-9`'s row lands with its enforcer, in slice 5 — not now.** `drift-check.sh` check 7 refuses
> an `INV-` row whose fifth field names no enforcer, but it matches *textually*: a row naming a test
> file that does not exist yet would pass the gate while being a claim rather than a fact
> (PRINCIPLES #6). The rule is decided here; the row is written when the test that fails for it does.
>
> Modules and functions are named; **line numbers deliberately are not**. `INVARIANTS.md` records
> why — the row this convention replaced pointed at `attendance_service.py:286`, which had already
> rotted to `:265`.

## Problem Statement

Nothing in `app/` logs. There is no `logging` import and no `getLogger` call anywhere in the
application, so every question about what the running system did has to be answered from the
database, from a Jaeger trace that expires, or not at all.

The premise usually given for this work — "a 500 in production leaves no durable record" — is
**wrong**, and was corrected during shaping by running it: an unhandled exception under default
uvicorn prints a full traceback to stdout, and Docker's `json-file` driver keeps it. There is no
global exception handler in the app to swallow it, and OpenTelemetry's recorder re-raises. So
tracebacks are already durable.

What is actually missing is narrower, and it is the part that matters for the threat model the
Owner set on 2026-09-02 — the asset is real student names and attendance history, and the attacker
is a logged-in teacher probing another teacher's rows:

1. **A refused request leaves nothing.** `INV-1` denials, failed logins, refused registration codes
   and attendance refused on an inactive Class all return cleanly and vanish. This app has **one
   Teacher and one Class** in production since November 2025, so there is no legitimate way to
   produce an `INV-1` denial at all — every one is either a bug or an intrusion, and today neither
   is visible after the fact.
2. **A traceback has no owner.** It names a line, never which Teacher, which Class, or which
   request. Production runs `uvicorn --workers 4`, so four processes interleave their output and
   attributing a traceback to a request is guesswork.
3. **Irreversible acts leave no record that they happened.** Merge and student delete destroy rows
   deliberately — the school holds the credit, this app is a tally sheet — but nothing records that
   the act occurred or how much it moved.
4. **Nothing joins the app to nginx.** The auth path is rate-limited at 5 r/m with burst 10, so a
   brute-force attempt is mostly absorbed by nginx and never reaches the app. The app's handful of
   failures and nginx's hundreds of 429s are two unrelatable records, which is exactly the
   difference between a typo and an attack.

## Solution

One logger, emitting **JSON lines to stdout**, where the sink and its rotation already exist.

- **Denials** are recorded at `WARNING` with who was refused and what refused them.
- **Unhandled errors** get an `ERROR` line carrying request context; uvicorn's traceback is left
  exactly as it is.
- **Irreversible mutations** get an `INFO` line carrying ids and **row counts**.
- **A Student's name never appears in a log line.** Ids only. This becomes `INV-9`, with a runtime
  enforcer and a diff-time gate.
- Every line carries a **request id** — nginx's `$request_id` when present, a generated one
  otherwise — plus `trace_id` when tracing is on, so a line joins to an nginx access line and to a
  Jaeger span.

Nothing new runs on the VM. Loki, Grafana and hosted backends were rejected in ADR-0006 on RAM and
on keeping student-adjacent telemetry off external services; that reasoning is unchanged and
applies harder to logs than to spans.

## User Stories

1. As the Owner operating the app, I want every refused request recorded durably, so that an
   `INV-1` denial — which no legitimate use of a one-Teacher app can produce — is visible after the
   fact instead of vanishing.
2. As the Owner, I want to tell a mistyped password from someone working through addresses, so that
   I can respond proportionately rather than guess.
3. As the Owner, I want a log line joinable to nginx's access line, so that I can see how many
   attempts nginx blocked alongside the few that reached the app.
4. As the Owner, I want a traceback attributable to a request and a Teacher, so that four
   interleaved uvicorn workers stop making attribution guesswork.
5. As the Owner, I want a record that a merge or a delete happened and how many rows it moved, so
   that I can tell the merge I intended from the one I mis-clicked.
6. As a Student whose row was deleted, I want no trace of my name left behind in a log, so that
   deletion means what `CONTEXT.md` says it means.
7. As the Owner, I want the ids-only rule enforced by something that fails when it is broken, so
   that it is not a paragraph a later session reads past.
8. As the Owner, I want a log line joinable to a Jaeger trace, so that one failed request can be
   followed across both records.
9. As the Owner, I want the logger to cost nothing when unconfigured, so that the test suite and a
   bare `just run` behave as they do today.
10. As the Owner, I want an attacker-supplied email to be unable to forge a log line, so that the
    record cannot be poisoned by the very thing it is recording.
11. As a future session, I want the rejected alternatives written down, so that "log the student's
    name, it would make this so much easier to debug" is re-argued rather than quietly re-decided.
12. As the Owner, I want the retention limit stated honestly, so that nobody assumes an "erase
    after N days" policy that this sink cannot express.
13. As the Owner, I want the database container's log bounded like every other service's, so that a
    chatty postgres cannot fill the disk that also holds the database and the backups.
14. As the Owner, I want uvicorn's traceback path untouched, so that the safety net which demonstrably
    works today keeps working.
15. As the Owner, I want to read the log without new tooling, so that `logs.sh` stays the way in.

## Implementation Decisions

### The logger module

A new `logging` module under `app/core`, holding the formatter, the context variables and the
`get_logger` accessor. `app.core` is a **forbidden-source leaf** in the import-linter contracts —
it may not import `app.api`, `app.services`, `app.models` or `app.schemas` — and this module
satisfies that by importing only the standard library and `opentelemetry.trace`. `services → core`
is already an established direction with five existing imports, so no contract changes to allow it.

### Line shape

One JSON object per line, via a `logging.Formatter` subclass calling `json.dumps`. Chosen over
plain text specifically because Decision 3 puts attacker-supplied text (an attempted email) into
log lines: `json.dumps` escapes an embedded newline, so a forged second line is impossible by
construction rather than by remembering to escape at each call site.

Fields: timestamp, level, event name, request id, teacher UUID where a session exists, client IP,
route, and event-specific fields. `trace_id` is present **only** when a valid span context exists —
the field is omitted, not zero-filled.

Docker's `json-file` driver wraps each line in its own envelope, so the file on disk is JSON inside
JSON. `docker compose logs` unwraps the envelope and prints the inner object, so `logs.sh` gains a
`jq` path and the human reader is unaffected.

### Configuration

The level is read from a `LOG_LEVEL` environment variable **with a default**, using `os.environ`
directly rather than a `Settings` field. `app/config.py` is an import-time singleton that every
test and every alembic run constructs, so a new required field breaks `conftest.py` at import.
This is the pattern `telemetry.py` already uses, for the reason ADR-0006 gives.

### Request context

A middleware in `app/middleware` sets context variables for request id, client IP and — once
authentication has resolved — teacher UUID. Context variables are per-process and per-task, which
is correct under `--workers 4`, and they let a service-layer call carry request context without
threading a parameter through every signature.

`app.middleware` is currently named in **no** import-linter contract. It is an empty stub today, so
that is harmless; real code landing there makes it ungoverned, so it gains a contract in this slice.

### Request id

The app honours an incoming `X-Request-ID` and generates a `uuid4` when the header is absent.
`deployment/production/nginx.conf` gains one `proxy_set_header X-Request-ID $request_id` per proxied
location, which is what makes an app line joinable to an nginx access line. The nginx half is
config, so it is provable only by a live exercise.

### Where the calls live

Mostly **one** place: an exception handler for `HTTPException` and its subclasses. Every denial in
this app raises one — the custom exceptions in `app/core/exceptions.py` all subclass it — so a
single handler sees `INV-1` 403s, refused codes and inactive-class refusals, and has the `Request`
in hand for context.

Explicit calls are added only where the handler cannot see the information:

- **`authenticate_user`**, because the three failure branches deliberately return the same message
  for unknown-email and wrong-password. The response must stay uniform; the log is the only place
  that distinction can live.
- **`merge_students`**, which already discards the count that matters: the bulk `update` returns a
  result whose `rowcount` is the number of attendance records moved, and the function already
  computes a total afterwards.
- **student delete**, which needs a count taken before the cascade destroys the rows.

### Personal data

**No Student name in any log line, ever.** This is `INV-9`. The four places a name arrives as free
text are the autocomplete `query` parameter, the `student_name` attendance filter, the
`student_name` bulk-logging body field, and the `name` field on student create and update. None may
reach a log line, and the exception handler must not echo a request's query string.

The rule is scoped to logs rather than to the whole system on purpose. `backup-db.sh` keeps the last
seven `pg_dump`s, each a full dump including names, so a deleted Student's name already survives in
up to seven backups. An invariant worded "leaves no identifier anywhere in the system" would have
been false the day it was written — the pseudo-artifact exactly. What makes logs different from
backups is that logs get pasted into bug reports.

Denial lines carry the Teacher's UUID, the attempted email on a failed login, and the client IP.

### Retention

Unchanged: `max-size: 10m`, `max-file: 3`. Docker's `json-file` driver supports size-based rotation
only — **there is no time-based option at this sink** — so "erase after 90 days" is not expressible
without moving the sink or adding host-side configuration whose proof would live outside the repo.
Given the event set, volume is a handful of lines a week, so these lines effectively never age out.
That is accepted and **confessed**, not designed around.

The `db` service carries no `logging` block while backend, nginx and jaeger all do, so it inherits
the daemon default. It gains the same block in both compose files.

### Dependencies

`opentelemetry-api` is currently a transitive dependency that `telemetry.py` already imports
directly. It gains an explicit pinned line, matching how ADR-0006 pinned the other four.

**No new package.** `opentelemetry-instrumentation-logging` was investigated and rejected as
unnecessary: `trace.get_current_span().get_span_context()` yields the trace id from the already
installed API, and reports `is_valid = False` when tracing is off, which is what lets the formatter
omit the field cleanly.

### uvicorn

Left alone. `uvicorn` and `uvicorn.access` both carry `propagate = False` with their own handlers,
so an app-side root handler does not capture them and the container log carries two shapes by
design. Reformatting them would touch the traceback path that already works, and a multi-line
traceback inside a JSON string field reads far worse at a terminal.

## Testing Decisions

A good test here asserts **what a reader of the log can conclude**, never how the logger is built.
It exercises a real route and inspects the records that came out. No test asserts a formatter method
was called, and no test reaches into the handler's internals.

**One seam:** the existing `client` HTTP fixture, plus a `capture_logs` context manager modelled
directly on `count_statements` in `tests/test_query_budget.py` — attach a handler, exercise the real
route, assert on what was captured, detach. The helper is a test utility in the same sense
`count_statements` is, not a second seam.

Fixtures already exist for everything: `client`, `auth_headers`, `other_teacher_headers`,
`test_user`, `inactive_user`, `inactive_class`, `test_class`, `test_student`, `registration_code_for`.

Prior art:

- **`tests/test_query_budget.py`** — the capture-during-a-real-request shape, and the ratchet
  discipline.
- **`tests/test_authorization.py`** — denial-side testing as a second real Teacher, with positive
  controls. The new denial assertions extend this stance rather than inventing one.
- **`tests/test_telemetry.py`** — the precedent for a test file that enforces an observability
  module's own contract, including its off-by-default behaviour.

Two assertions cannot be made at that seam and are `live:` only: nginx's header propagation, and
`trace_id` being *populated*. OpenTelemetry's tracer provider is set-once per process, which
`test_query_budget.py` already records as its reason for avoiding OTel. The *absence* of the field
when tracing is off is testable and is the more important half, since it proves the formatter omits
rather than zero-fills.

The error-context test uses `monkeypatch` to make a service function raise. No production hook is
added to make a 500 reachable.

## Acceptance Criteria

Verdicts are filled by `/verify-live`, per criterion. A task's verdict is the **worst** of them.

| # | Criterion | Proven by | Serves | Verdict |
|---|---|---|---|---|
| AC-1 | An `INV-1` denial emits exactly one `WARNING` line carrying Teacher UUID, route and request id | `test:` | US-1 | _pending_ |
| AC-2 | The three `authenticate_user` branches are distinguishable in the log while all three HTTP responses stay byte-identical | `test:` | US-2 | _pending_ |
| AC-3 | A registration code refused for being used, revoked, expired or wrong-address emits a line naming which rule refused it | `test:` | US-1 | _pending_ |
| AC-4 | New attendance refused on an inactive Class emits a denial line | `test:` | US-1 | _pending_ |
| AC-5 | **`INV-9`:** no captured record contains a Student's name, across every route that handles one — autocomplete, attendance filter, bulk logging, create, update | `test:` | US-6, US-7 | _pending_ |
| AC-6 | **`INV-9`:** a diff placing a name-bearing expression inside a logger call fails the gate, watched failing on a planted line and reverted | `gate:` drift-extra | US-7 | _pending_ |
| AC-7 | Merge emits the count of attendance records moved; student delete emits the count destroyed; neither names anyone | `test:` | US-5, US-6 | _pending_ |
| AC-8 | An unhandled exception emits an `ERROR` line with Teacher UUID, route and request id, **and** uvicorn's traceback is byte-identical to today's | `test:` | US-4, US-14 | _pending_ |
| AC-9 | With no `X-Request-ID` header a generated id appears in the line; with one supplied it is honoured verbatim | `test:` | US-3 | _pending_ |
| AC-10 | With tracing off the `trace_id` field is **absent**, not zero-filled | `test:` | US-8, US-9 | _pending_ |
| AC-11 | With tracing on the line's `trace_id` matches the trace the same request produced in Jaeger | `live:` | US-8 | _pending_ |
| AC-12 | nginx forwards `$request_id` and a production log line carries the same id as its nginx access line | `live:` | US-3 | _pending_ |
| AC-13 | Every emitted line is one valid JSON object, and a login attempt with an embedded newline in the email cannot produce a second line | `test:` | US-10 | _pending_ |
| AC-14 | `LOG_LEVEL` changes the level and `conftest.py` still imports with it unset | `test:` | US-9 | _pending_ |
| AC-15 | `app.middleware` is covered by an import-linter contract and `app.core` remains a leaf, watched failing on a planted upward import | `gate:` boundaries | — | _pending_ |
| AC-16 | The `db` service's log is bounded in both compose files, confirmed on the VM after deploy | `live:` | US-13 | _pending_ |
| AC-17 | `logs.sh` reads the new lines, with the documented `jq` path | `live:` | US-15 | _pending_ |
| AC-18 | Both gate sets green on every commit: `just check` and `npm run check` | `gate:` | — | _pending_ |
| AC-19 | `REVIEW-DEBT.md` carries the retention confession, naming the absence of time-based erasure at this sink | `review-only` | US-12 | _pending_ |
| AC-20 | ADR-0007 records the decision with its rejected alternatives | `review-only` | US-11 | _pending_ |

## Tracer Slices

Each cuts through to an observable log line and is demoable alone. Blocking order.

1. **The formatter, the context and one denial.** `app/core/logging`, the middleware, request id
   generation, and the exception handler wired to `INV-1` only. Demoable: hit a class route as the
   wrong Teacher, see one JSON line with the ids. Serves AC-1, AC-9, AC-10, AC-13, AC-14, AC-15.
2. **The remaining denials.** Auth branches, registration codes, inactive Class. AC-2, AC-3, AC-4.
3. **Errors with context.** AC-8.
4. **Irreversible acts with counts.** Merge and delete. AC-7.
5. **`INV-9`'s two enforcers.** The runtime assertion across every name-handling route, and the
   drift check, each watched red first. AC-5, AC-6.
6. **Deployment.** nginx `X-Request-ID`, the `db` logging block, the `jq` path in `logs.sh`.
   AC-11, AC-12, AC-16, AC-17.

Slice 6 touches `deployment/`, so its push **deploys** — the Owner's standing choice. It is last on
purpose: everything provable without a deploy is proven first.

## Out of Scope

- **Any new service on the VM.** No Loki, no Promtail, no Grafana, no hosted backend. ADR-0006
  settled this and nothing here reopens it.
- **An audit table in the database.** Considered and rejected during shaping: it breaks for the case
  logs exist for, since a 500 that cannot reach the database records nothing.
- **Time-based erasure.** Not expressible at this sink. Confessed rather than faked.
- **Logging routine successful writes.** Class and student create/update, attendance logged, course
  credit toggled. The Owner chose three event families and this is the fourth, declined.
- **Rebuilding an access log.** nginx already logs every request.
- **Reformatting uvicorn's output**, and touching its access log at all.
- **Alerting.** Nothing watches these lines and nothing notifies anyone. A log is a record, not a
  monitor, and `setup-ssl-monitoring.sh`'s stance on external services still holds.
- **Frontend logging.** The client runs on Vercel; `client-app` has no invariant of its own and gets
  no `INVARIANTS.md` row here.

## Non-Goals

- **Not** a security monitoring system. It records denials; it does not decide what they mean.
- **Not** a recovery mechanism. Ids-only means a merge line proves the act and its scale without
  letting you reverse it. That was chosen knowingly.
- **Not** a coverage or performance instrument. Tracing owns latency; `test_query_budget.py` owns
  statement counts.

## Open Questions

1. **Does the exception handler's context survive an exception raised inside a dependency**, before
   the middleware has resolved the Teacher UUID? The line would carry a request id and no teacher.
   Acceptable, but it should be asserted rather than assumed — resolve in slice 1.
2. **What does a `429` look like from the app's side?** nginx returns it without proxying, so the
   app never sees it and cannot log it. AC-12's join is the only way to see those, and whether that
   is sufficient is a question for `/verify-live` rather than for the build.
3. **Should the two spec directories be merged?** `0001` sits in `api/specs/` and `0002`–`0004` in
   root `specs/`. Filed as debt during this shaping; not this slice's work.

## Spec Deltas

_None yet. Anything the build teaches that contradicts the above is dated and recorded here, per
ANTI-PATTERNS: spec drift, silently._
