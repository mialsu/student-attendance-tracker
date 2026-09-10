# 0005 — Application logging: denials, errors, and irreversible acts

> Shaped with the Owner on 2026-09-09 (`/grill-with-docs` → `/to-spec`), eleven decisions, one
> seam. Weight: **Standard**.
>
> **Invariants touched:** `INV-1`, `INV-3`, `INV-5`, `INV-6`, `INV-7`, and **`INV-9` is created here**.
>
> ~~**`INV-9`'s row lands with its enforcer, in slice 5 — not now.**~~ **It landed, in slice 5.**
> `drift-check.sh` check 7 refuses an `INV-` row whose fifth field names no enforcer, but it matches
> *textually*: a row naming a test file that did not exist yet would have passed the gate while being
> a claim rather than a fact (PRINCIPLES #6). So the rule was decided here and the row was written
> when the tests and the gate existed — `api/INVARIANTS.md`, INV-9, naming both.
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

1. As the Owner operating the app, I want every refusal **my application decided** recorded
   durably — a rule refusing a request, not a caller turned away at the door — so that an `INV-1`
   denial, which no legitimate use of a one-Teacher app can produce, is visible after the fact
   instead of vanishing.

   *Narrowed 2026-09-10 by the Owner, from "every refused request".* The line is **what nginx
   cannot interpret**: `deployment/production/nginx.conf:14-18` already logs every request's IP,
   method, path, status and time, so "someone was refused" is recorded whatever this app does.
   What nginx cannot say is *which rule* refused an authenticated Teacher — and that is the whole
   of what these lines add. The measurement that forced the narrowing is in `api/REVIEW-DEBT.md`,
   2026-09-10.
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

**No Student name in any log line, ever.** This is `INV-9`. ~~The four places~~ **The six places**
a name arrives as free text are the autocomplete `query` parameter, the `student_name` attendance
filter, the `student_name` bulk-logging body field, the `name` field on student create and update,
and — **found by slice 5's review, not by this section** — the `search=` filter on the students
list (`app/api/students.py`) and on the attendance summary (`app/api/attendance.py`), both
documented "Filter by student name". None may reach a log line, and the exception handler must not
echo a request's query string.

Corrected 2026-09-10 rather than left standing: this list is what AC-5's sweep is written from, so
an incomplete list here produced an incomplete enforcer. See delta 16.

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
| AC-1 | An `INV-1` denial emits exactly one `WARNING` line carrying Teacher UUID, route and request id | `test:` | US-1 | **WORKS** |
| AC-2 | The three `authenticate_user` branches are distinguishable in the log while all three HTTP responses stay byte-identical | `test:` | US-2 | **WORKS** ¹ |
| AC-3 | A registration code refused for being used, revoked, expired or wrong-address emits a line naming which rule refused it | `test:` | US-1 | **WORKS** |
| AC-4 | New attendance refused on an inactive Class emits a denial line | `test:` | US-1 | **WORKS** |
| AC-5 | **`INV-9`:** no captured record contains a Student's name, across every route that handles one — autocomplete, attendance filter, bulk logging, create, update, **and the two `search=` filters** (students list, attendance summary), each on both the refused and the permitted path | `test:` | US-6, US-7 | **WORKS** |
| AC-6 | **`INV-9`:** a diff placing a name-bearing expression inside a logger call fails the gate, watched failing on a planted line and reverted | `gate:` drift-extra | US-7 | **WORKS** |
| AC-7 | Merge emits the count of attendance records moved; student delete emits the count destroyed; neither names anyone | `test:` | US-5, US-6 | **WORKS** |
| AC-8 | An unhandled exception emits an `ERROR` line with Teacher UUID, route and request id, **and** uvicorn's traceback is byte-identical to today's | `test:` | US-4, US-14 | **WORKS** |
| AC-9 | With no `X-Request-ID` header a generated id appears in the line; with one supplied it is honoured verbatim | `test:` | US-3 | **WORKS** |
| AC-10 | With tracing off the `trace_id` field is **absent**, not zero-filled | `test:` | US-8, US-9 | **WORKS** |
| AC-11 | With tracing on the line's `trace_id` matches the trace the same request produced in Jaeger | `live:` | US-8 | **BLOCKED** — slice 6 |
| AC-12 | nginx forwards `$request_id` and a production log line carries the same id as its nginx access line | `live:` | US-3 | **BLOCKED** — slice 6 |
| AC-13 | Every emitted line is one valid JSON object, and a login attempt with an embedded newline in the email cannot produce a second line | `test:` | US-10 | **WORKS** |
| AC-14 | `LOG_LEVEL` changes the level and `conftest.py` still imports with it unset | `test:` | US-9 | **WORKS** ² |
| AC-15 | `app.middleware` is covered by an import-linter contract and `app.core` remains a leaf, watched failing on a planted upward import | `gate:` boundaries | — | **WORKS** |
| AC-16 | The `db` service's log is bounded in both compose files, confirmed on the VM after deploy | `live:` | US-13 | **BLOCKED** — slice 6 |
| AC-17 | `logs.sh` reads the new lines, with the documented `jq` path | `live:` | US-15 | **BLOCKED** — slice 6 |
| AC-18 | Both gate sets green on every commit: `just check` and `npm run check` | `gate:` | — | **WORKS** |
| AC-19 | `REVIEW-DEBT.md` carries the retention confession, naming the absence of time-based erasure at this sink | `review-only` | US-12 | **WORKS** |
| AC-20 | ADR-0007 records the decision with its rejected alternatives | `review-only` | US-11 | **WORKS** |
| AC-21 | **`INV-5`:** a merge refused for crossing a Class boundary emits a denial line naming the rule, and names neither Student | `test:` | US-1, US-6 | **WORKS** |
| AC-22 | The log's vocabulary is closed: an `event`, `rule` or `reason` literal outside the known list fails the gate, watched failing on a planted value and reverted | `gate:` drift-extra | US-7 | **WORKS** |

## Verification — 2026-09-10, `/verify-live`

Exercised against **real uvicorn** on a throwaway PostgreSQL (`live-verify-db`, port 5440,
destroyed after — not the suite's 5439, so neither could drop the other's rows). Two teachers
created through **signup with real registration codes**, then driven over HTTP with `httpx`;
every request carried an `X-Request-ID` naming its step, so each captured line is attributable to
the request that caused it. **24 JSON lines** came out of 49 steps. `LOG_LEVEL` and the boundary
gate got their own runs.

| # | What was exercised, and what came out |
|---|---|
| AC-1 | Teacher B read Teacher A's class → 403 and exactly one `WARNING` line: `rule=INV-1`, `status=403`, `teacher_id` = **B's** id (the refused teacher, not the owner), `route`, `request_id`. A's own read of the same class produced **no line**. |
| AC-2 | All three branches live, three distinct reasons: `unknown_email`, `wrong_password`, `inactive_account`. Unknown-email and wrong-password bodies are **byte-identical** to each other. See note ¹ — the third is not, deliberately, and the criterion's wording overstates this. |
| AC-3 | Four refusals, four labels: used / revoked / expired all `rule=INV-6`; wrong address `rule=INV-7`; an unknown code logs `reason=code_unknown` with **no `rule`**, which is right — a mistyped code breaks no invariant. |
| AC-4 | The teacher closed her own class through `PUT /api/classes/{id}` (`active: false`), then logged attendance → 400, `rule=INV-3`, `reason=class_inactive`. |
| AC-5 | `Kaarina Ylitalo` sent down **all seven** name-bearing routes, refused and permitted. Seven `INV-1` lines from the refused pass, **zero** lines from the permitted pass. Across all 24 captured lines, **none of the ten name fragments used anywhere in the exercise appears** — `Kaarina`, `Ylitalo`, `Liisa`, `Korhonen`, `Eino`, `Nieminen`, `Onni`, `Karjalainen`, `Helena`, `Salo`. Two duplicate-name refusals (400, with the name in `detail`) emitted nothing at all, which is the opt-in label doing its job. |
| AC-6 | Twelve planted diffs against `scripts/log_lint.py`: eight leak shapes fail, four sanctioned shapes stay clean (including `Student(name=...)`, which is all over `app/`). A file that cannot be parsed is reported as a violation rather than skipped. |
| AC-7 | `records_moved=4` — exactly the duplicate's four, not the target's new total of seven. `records_destroyed=7` — the three it owned plus the four just merged in, which is only knowable **before** the cascade, so the count demonstrably precedes the delete. Neither line names anyone. |
| AC-8 | A real 500 landing after authentication *and* authorization (the table the route needs was renamed, so `users` and `classes` stayed intact). One `ERROR` line: `exception=ProgrammingError` — the **type**, never the message — plus teacher, route, request id. uvicorn's traceback followed, **60 frames**, chained and intact. Order confirmed live: JSON line, then uvicorn's access line, then the traceback — so the join is `request_id`, not proximity (delta 10). |
| AC-9 | 23 of 24 lines carried the id supplied in the header, **verbatim**. The one request sent without the header produced a generated, uuid4-shaped id. |
| AC-10 | With `OTEL_EXPORTER_OTLP_ENDPOINT` unset, **0 of 24** lines carry `trace_id`. Absent, not zero-filled. |
| AC-13 | All 24 lines parse as exactly one JSON object each, and none contains an embedded newline. The forged-line attempt (`x@y.test\n{"event":"forged"}` as the email) was refused **422 by validation** — no line at all, and no `forged` event anywhere. Both mechanisms hold, as delta 5 records. |
| AC-14 | A second run at `LOG_LEVEL=WARNING`: the `student_delete` **INFO act line vanished while the delete still returned 204**, and a login denial still appeared. Exactly one line captured. The suite runs with `LOG_LEVEL` unset (502 tests), which is the other half. See note ². |
| AC-15 | `from app.api import handlers` planted in `app/core/logging.py` → three contracts BROKEN. `from app.api import auth` planted in `app/middleware/context.py` → `Middleware is transport plumbing` BROKEN, 4 kept 1 broken. Clean at 5/5 after restore. |
| AC-18 | `just check-fast` green and the full suite **502 passed**; `npm run check` green in `client/` (40 e2e, including its own no-mouse walk). |
| AC-19 | `api/REVIEW-DEBT.md`, 2026-09-09 — the sink rotates by size only and "erase after 90 days" is not expressible at it. |
| AC-20 | `api/docs/adr/0007-personal-data-in-logs.md`, with **14** rejected alternatives, including the one this slice's gate exists to re-refuse. |
| AC-21 | Same-teacher cross-Class merge → 400, `rule=INV-5`, `reason=cross_class_merge`. Cross-**teacher** duplicate → 403, `rule=INV-1`. Today's reorder, confirmed live rather than only in tests. |
| AC-22 | An unknown `reason`, `rule="INV3"`, and a renamed `event` literal inside a multi-line call each fail the gate; known values re-added stay clean. |

**Invariants attacked, not just exercised.** `INV-1` as a second real teacher on eight routes (all
refused, by `verify_class_ownership`, and every refusal recorded); `INV-3` by logging attendance to
a closed class; `INV-5` both ways; `INV-6` by replaying a used code, a revoked one and an expired
one; `INV-7` by presenting one teacher's code from another's address; `INV-9` by pushing a name
down every route that accepts one. **None went through.**

**No surface, so no keyboard walk.** Slices 1–5 are backend-only and `DESIGN.md` does not exist in
either repo, so there are no `A11Y-n` rows to prove and the drift gate's accessibility check stays
inert by design. Stated rather than skipped silently. The client's own no-mouse e2e walk runs in
`npm run check` and passed, but it proves `client/`, not this spec.

**The four `live:` criteria are BLOCKED, not failing.** AC-11, AC-12, AC-16 and AC-17 need nginx
config, a `db` logging block and `logs.sh` — none of which exists yet, because that is **slice 6**.
They are not "unverified work"; they are unbuilt work, and calling them anything else would be the
overclaim PRINCIPLES #10 exists to stop.

**Task verdict: PARTIAL** — the worst criterion's verdict, and the worst is BLOCKED. **Slices 1–5
are done: every criterion they own reads WORKS with evidence above.** Spec 0005 is not done until
slice 6 lands and those four are exercised on the VM.

¹ **AC-2's wording is wrong, and it always was** — recorded as delta 17 rather than dressed up as a
pass. "All three HTTP responses stay byte-identical" is false: the inactive-account branch returns
`Account is inactive. Please contact support.` where the other two return
`Invalid email or password`. Two of three are byte-identical; the third differs **by design**, and
the tests have encoded that difference since slice 2. What the criterion means, and what was
proven, is that no branch's response was *changed* by the logging work. The different message is
also a user-enumeration leak, which is a finding of its own — `api/REVIEW-DEBT.md`, 2026-09-10.

² **AC-14 passes and the pass has a sharp edge**: `LOG_LEVEL=WARNING` silently switches off the
irreversible-act record while leaving denials on, so US-5's "a record that a merge or a delete
happened" is defeated by one environment variable. Production does not set `LOG_LEVEL`, so the
default `INFO` applies today. Confessed — `api/REVIEW-DEBT.md`, 2026-09-10.

## Tracer Slices

Each cuts through to an observable log line and is demoable alone. Blocking order.

1. **The formatter, the context and one denial.** `app/core/logging`, the middleware, request id
   generation, and the exception handler wired to `INV-1` only. Demoable: hit a class route as the
   wrong Teacher, see one JSON line with the ids. Serves AC-1, AC-9, AC-10, AC-13, AC-14, AC-15.
2. **The remaining denials.** Auth branches, registration codes, inactive Class. AC-2, AC-3, AC-4.
3. **Errors with context.** AC-8.
4. **Irreversible acts with counts, and the merge that was refused.** Merge and delete, plus
   `INV-5`'s cross-class refusal. AC-7, AC-21.
5. **`INV-9`'s two enforcers, and the vocabulary.** The runtime assertion across every
   name-handling route, and the drift check, each watched red first. AC-5, AC-6, and **AC-22**
   — added 2026-09-10 by the Owner's decision, because `REVIEW-DEBT.md` had already argued that
   two checks over the same call sites, written a week apart, is the seam to build once.
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
- **The token-path refusals** — the eight in `app/dependencies.py` and the six in `app/api/auth.py`'s
  refresh handler. A caller presenting a missing, malformed, expired, revoked or wrong-type token
  is turned away at the door, and nginx's access log already records the attempt with its IP,
  path, status and time. What an app line would add is *which* of the checks refused, which on a
  one-Teacher app is detail behind a fact nginx already gives you. Declared out of scope
  2026-09-10 rather than left as an undeclared gap; a 401 storm is visible in nginx today.
- **The `NotFoundError` refusals.** A missing row is not a rule refusing anything, and this
  costs no `INV-1` signal — which is worth stating, because `class_service.verify_class_ownership`
  raises both. It reports a Class's **absence before its ownership**, deliberately, so that a 404
  never becomes a 403 and no Teacher learns a class id exists. The consequence for logging is
  clean: every INV-1 refusal is the `ForbiddenException` branch and is logged by AC-1, while the
  `NotFoundError` branch means the row genuinely is not there.
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

1. ~~**Does the exception handler's context survive an exception raised inside a dependency**,
   before the middleware has resolved the Teacher UUID?~~ **RESOLVED in slice 1, 2026-09-09, and
   the premise was slightly wrong.**

   Two answers, both measured rather than reasoned about:

   - **The context survives, and the direction that was doubted is the one that is proven.**
     `teacher_id` is set inside `get_current_user` — a **dependency** — and read by the exception
     handler after the service layer raised. `test_inv1_denial_emits_one_warning_with_teacher_...`
     asserts it, and deleting the `teacher_id_var.set` call turns that test red with
     `KeyError: 'teacher_id'` and nothing else. This is also why the middleware is **pure ASGI**
     rather than `BaseHTTPMiddleware`: the latter runs dispatch and the wrapped app in different
     anyio tasks, so a value set downstream would not cross back.
   - **The "request id and no teacher" line cannot occur for any denial this spec logs.** Every
     logged denial is raised in the **service layer**, after authentication: `INV-1` from
     `verify_class_ownership`, the inactive-Class refusal, the registration-code rules, and
     `authenticate_user`'s branches. Ownership is never wired as a FastAPI dependency anywhere in
     `app/api/` — checked, not assumed. The only exception a dependency raises is the 401 from
     `get_current_user`, and that is not in this spec's event set at all.

   The `KeyError` is itself the second half of the answer: an unset context variable is **omitted**
   from the line, not rendered as an empty string, so the shape the question worried about is
   well-defined if it ever does arise.
2. **What does a `429` look like from the app's side?** nginx returns it without proxying, so the
   app never sees it and cannot log it. AC-12's join is the only way to see those, and whether that
   is sufficient is a question for `/verify-live` rather than for the build.
3. **Should the two spec directories be merged?** `0001` sits in `api/specs/` and `0002`–`0004` in
   root `specs/`. Filed as debt during this shaping; not this slice's work.

## Spec Deltas

**2026-09-09, slice 1.** Four things the build settled differently or more precisely than the text
above. None reverses a decision; each is here because a reader would otherwise look for the code in
the wrong place.

1. **The Teacher UUID is set by the dependency, not by the middleware.** *Request context* above
   says the middleware sets it "once authentication has resolved", which reads as though the
   middleware does it. It cannot: the middleware runs before any token is decoded.
   `get_current_user` sets it, and the middleware **claims and resets** it along with the other
   three so that one place owns the reset of every variable. Without that reset a teacher id would
   survive into the next request that never authenticated — confessed in `REVIEW-DEBT.md`, since
   no slice-1 test can observe it.
2. **The middleware is pure ASGI, not `BaseHTTPMiddleware`.** Not specified above; it is forced by
   point 1 and by open question 1's answer.
3. **The client IP comes from `X-Real-IP`, never `X-Forwarded-For`.** Production nginx *sets*
   `X-Real-IP` from `$remote_addr` but builds `X-Forwarded-For` with
   `$proxy_add_x_forwarded_for`, which **appends to whatever the client sent** — so its left-hand
   entries are chosen by the party being recorded. A forgeable IP on a denial line defeats the
   record's purpose. Falls back to the ASGI `client` when the header is absent.
4. **An incoming `X-Request-ID` is honoured verbatim but length-bounded** at 200 characters. AC-9's
   "verbatim" holds for any real id; the bound exists because the header is client-supplied and
   nothing else stops an 8 KB header becoming an 8 KB log line on every request.

**AC-13 is PARTIAL after slice 1**, not met: its forged-line half is asserted at the formatter
because slice 1 logs no attacker-supplied free text. It becomes a real-route assertion in slice 2.
See `api/REVIEW-DEBT.md`, 2026-09-09.

**2026-09-10, slice 2.** Three more, and the first one corrects a premise this spec argued from.

5. **The "attacker-supplied text" a denial line carries is far more constrained than *Line shape*
   assumed.** That section justifies JSON by saying Decision 3 "puts attacker-supplied text (an
   attempted email) into log lines". It does not, or not in the dangerous sense: `UserLogin.email`
   is an `EmailStr`, and `email-validator` refuses a newline, a quote, a brace and even an
   RFC-legal quoted local part **before** `authenticate_user` runs. Every adversarial address
   probed against the installed validator was rejected, so the value that reaches the line cannot
   carry a JSON metacharacter at all.

   AC-13's literal criterion — a login attempt with an embedded newline in the email — therefore
   holds at the real route, but by *validation* (422, and no line at all) rather than by
   serialization. Both are now asserted. **The choice of JSON is unchanged and the formatter-level
   assertion stays the load-bearing one**, because it is the half that survives someone relaxing
   the schema; the route-level one depends on a decision another file could reverse. What changes
   is the reasoning, so a later session does not go looking for free text on a line and conclude
   the escaping is untested.

   **AC-13 is met after slice 2**, by two independent mechanisms.

6. **A refusal labels itself; the handler does not infer.** *Where the calls live* says explicit
   calls go only where the handler cannot see the information, and names three sites — which left
   the registration-code and inactive-Class denials to the handler without saying how it would
   know *which rule* refused. It cannot: both raise `BadRequestException`, which is raised at
   fourteen sites in `app/`. So the exception gained keyword-only `rule` and `reason`, set at the
   raise site, and the handler logs only a refusal that carries them.

   The opt-in half is the point rather than a convenience. Two of those fourteen sites interpolate
   a **Student's name** into the message, so a handler that logged every `BadRequestException` —
   or that logged `detail` — would break ADR-0007 with every other test still green. Asserted:
   `test_a_refusal_whose_message_contains_a_student_name_emits_nothing`.

**2026-09-10, slice 3.** Three, and the first is a placement *Where the calls live* does not
predict.

8. **The error line is emitted from the middleware, which is a fourth place.** *Where the calls
   live* says "Mostly **one** place: an exception handler for `HTTPException`" plus three explicit
   sites where the handler cannot see the information. The `ERROR` line is none of those: it comes
   from `RequestContextMiddleware.__call__`'s `except` clause.

   It has to. An app-level `Exception` handler — where a reader looks first, and the obvious
   reading of that section — runs inside `ServerErrorMiddleware`, which Starlette builds
   **outside** every user middleware, so it is reached only after the context middleware's
   `finally` has reset all four variables. Measured both ways rather than argued: planted as an
   app-level handler, the line still appears and carries `event`, `level` and `exception` and
   **nothing else** — no request id, no teacher, no route. An error line with no owner is the
   thing Problem Statement 2 exists to fix, so
   `test_an_unhandled_exception_emits_one_error_line_with_teacher_route_and_request_id` fails on
   that arrangement.

   The consequence for a reader hunting every source of a line: `app/api/handlers.py`,
   `auth_service.authenticate_user`, and now `app/middleware/context.py`.

9. **A second test seam, declared rather than smuggled.** *Testing Decisions* says "**One seam:**
   the existing `client` HTTP fixture". AC-8 has two halves that one seam cannot show, because
   they are opposite settings of the same flag: httpx's `raise_app_exceptions=True` (the `client`
   fixture's default) surfaces the exception uvicorn would receive, which is what makes the
   traceback assertion possible and is exactly what hides the response. `non_reraising_client`
   in `tests/test_logging.py` is the other setting, and it depends on `client` rather than
   replacing it so the `get_db` override stays owned by one fixture.

10. **AC-8's "byte-identical" needed a definition, and now has a measurement.** Taken literally it
    is unachievable by any edit to `context.py`, since adding a comment moves every line number
    below it. Exercised against **real uvicorn** — authenticate, rename the table the route needs,
    hit it, capture stdout, and diff against the same run with slice 3 reverted — the two
    tracebacks are **165 lines each and differ on exactly one**: `context.py`'s frame moved from
    line 82 to 102, because this slice's docstring and comments sit above it. Same frame, same
    function, same source line (`await self.app(scope, receive, send)`), same order, same count.

    So the criterion means **no frame added, removed, or re-attributed**, and that holds exactly.
    A bare `raise` is what buys it: `raise exc` appends a *second* frame for the same function,
    which `test_the_exception_reaches_the_server_with_its_traceback_unchanged` asserts against.

    The same run corrected a claim this slice nearly shipped as a comment: the JSON line does
    **not** land immediately before the traceback. uvicorn's access line for the request sits
    between them, so the join is `request_id`, not proximity.

**Scope decision, 2026-09-10, by the Owner.** US-1 said "every refused request recorded
durably". With slice 2 landed that was **10 of 46** refusal raise sites in `app/`, and the
difference was declared nowhere — so US-1 has been narrowed rather than left to be over-read, and
the line is drawn where it can be defended: **the app logs what nginx cannot interpret.** nginx
records that someone was refused, from where, and how often; only the app knows which *rule*
refused an authenticated Teacher.

Three consequences, all now in the text above: US-1 is reworded; the 14 token-path refusals and
the 12 `NotFoundError`s are explicit non-goals with their reasons; and **`INV-5`'s cross-class
merge refusal moves into slice 4 as AC-21** — it was the one silent site on the wrong side of the
line, an invariant refusal going unrecorded while a login typo was recorded. The measurement and
its method are in `api/REVIEW-DEBT.md`, 2026-09-10.

7. **`authenticate_user`'s lines carry no `status`.** Slice 1's handler-emitted lines do, because
   a handler legitimately knows the response. A service asserting what its refusal will become
   over HTTP is the coupling the handler exists to avoid, so the three login lines carry
   `event`, `reason`, `attempted_email` and the request context, and nothing about the response.

   Also worth stating, since AC-2's wording invites the other reading: **"all three HTTP responses
   stay byte-identical" means none of the three moved**, not that all three are the same. Two of
   them *are* mutually byte-identical — unknown-email and wrong-password, which is the enumeration
   defence and the reason the log is the only place the distinction can live. The inactive-account
   branch keeps its own distinct message, as it did before this slice. Both facts are asserted.

**2026-09-10, slice 4.** Two, and the first is a naming decision no earlier slice had to make.

11. **The third event family has two `event` tokens, not one.** Slice 1 chose `denial` and slice 3
    chose `error`, each one token for one family, and neither needed recording because neither had
    a choice to make. The irreversible acts do: they are one family in prose and two acts in fact,
    so the lines read `"event": "merge"` and `"event": "student_delete"` rather than a single
    `irreversible` token with the act in a field.

    The alternative mirrors the denial shape more closely — `denial` + `reason=unknown_email` is
    exactly family + branch — and it was rejected for two reasons. `reason` exists on a denial
    because the *response* is deliberately uniform and the log is the only place the distinction
    can live; nothing hides the difference between a merge and a delete, which are different
    routes with different fields. And a second closed vocabulary is already owed: `api/REVIEW-DEBT.md`
    (2026-09-10) records that `reason` and `rule` have no enforcer and pins the fix to slice 5, so
    adding an `act` vocabulary now would be a third string nothing checks. **Slice 5's check should
    cover `event` as well as `reason` and `rule`** — the two act tokens are part of what it closes
    over.

12. **The merge count came from `rowcount` as predicted, and that is now measured rather than
    assumed.** *Where the calls live* says the bulk `update`'s result carries the number of
    attendance records moved. It does, through SQLAlchemy's asyncpg dialect:
    `test_a_merge_records_the_number_of_attendance_records_it_moved` moves 4 of the 7 records
    across the two Students, so a line reporting the target's new total (7) rather than the
    number that moved (4) fails it. (This paragraph first said "4 of 6" and named 6 as the
    table's total; 3 + 4 is 7, and the review caught it. The assertion always discriminated;
    the arithmetic beside it did not.)

    The delete count cannot come from anywhere so cheap — it is one added `SELECT count(*)`, taken
    before `db.delete`, because after the commit the cascade has destroyed the rows it would count.
    `class_id` is captured on the same line for a related reason: the ORM object is expired by the
    delete, so reading `student.class_id` after the commit would refresh a row that no longer
    exists. Neither cost is covered by a ratchet — `tests/test_query_budget.py` holds ceilings for
    four **read** endpoints and none for a write path — which is confessed rather than left to be
    discovered.

13. **AC-21's label reaches one shape the criterion does not describe, and it is the wrong rule
    for that shape.** AC-21 reads "a merge refused for **crossing a Class boundary**". The
    label sits on the raise site of `merge_students`' same-Class comparison, and that
    comparison runs **before** `verify_class_ownership` on the duplicate's Class — so a merge
    reaching for **another teacher's** Student is refused there too, and logged as `rule=INV-5`
    with no `INV-1` line written at all.

    The refusal is intact; the attribution is not, which works directly against US-1's "only
    the app knows which *rule* refused an authenticated Teacher". Established by running it,
    not by reading the order: status 400, one line, `rule=INV-5`, `reason=cross_class_merge`.

    **Shipped confessed in `28a0373`, then FIXED the same day on the Owner's decision.** The
    fix is to check the duplicate's ownership before comparing Classes, which turns that 400
    into a 403 — an observable response change no acceptance criterion asks for, on the
    authorization path spec 0003 consolidated, so the build did not take it unilaterally
    (PRINCIPLES #8). Asked and answered: reorder. `verify_class_ownership` now runs first,
    both new tests were watched failing at 400, and the three same-teacher cross-Class tests
    never moved — which is what shows INV-5 still refuses exactly what it is for.

    **AC-21 is unchanged in wording and narrower in fact:** "a merge refused for crossing a
    Class boundary" now describes only merges within one Teacher's own Classes, because the
    other shape is refused earlier by `INV-1`. It also strengthens a claim this spec makes in
    *Out of Scope* — "every INV-1 refusal is the `ForbiddenException` branch and is logged by
    AC-1" — by one site that previously escaped it. Details in `api/REVIEW-DEBT.md`,
    2026-09-10.

**2026-09-10, slice 5.** Two, and the first is a hole the obvious version of AC-5 has.

14. **AC-5 needs the PERMITTED path, not just the refused one — and the refused one alone would
    have proved almost nothing.** The natural way to write "no line carries a Student's name" is
    to drive each name-bearing route and inspect the output. Driven as the *owning* teacher, four
    of the five routes emit **no line at all** (logging routine successful writes is this spec's
    declined fourth family), so the assertion passes vacuously. Driven as a *refused* teacher, a
    line appears — but `verify_class_ownership` raises **before** any code that handles the name
    runs, so a service function logging `student_data.name` would never execute on that path.

    Measured, not reasoned: a plant adding `log_event(logging.INFO, "student_create",
    name=student.name)` to `create_student` leaves every denied-path assertion green. So AC-5 is
    two sweeps over one route table — refused (a line exists; assert the name is not in it) and
    permitted (the name-handling code runs; assert nothing captured carries it). The permitted
    sweep asserts "no captured line carries the name" rather than "nothing was captured", which
    is AC-5's own wording and which keeps it meaningful if a later slice decides one of those
    routes should log something.

    Six leaks were planted, one per route plus the `ERROR` line, each watched reddening exactly
    the case that covers it — and note *which* case: the four service-level leaks redden the
    **permitted** sweep, because that is the only direction that executes them. The refused
    sweep's value is different and narrower: it is where a line exists at all, so it is what
    fails if the handler starts echoing a query string. **AC-5's tests were green the moment they
    were written** — slices 1-4 already comply — so the plants are the whole of their proof, and
    that is stated in the test file rather than left for a reader to notice.

    The route table reached **seven** entries, not five; delta 16 has why.

15. **AC-6's gate took three designs, and the two that failed are the useful part of this
    entry.** Each was defeated by review, by planting the leak rather than reading the code —
    which is the only way any of this was found.

    - **v1, awk over the diff's added lines.** Tracked paren depth from a logger call to catch a
      name three lines below the opener. It worked when the whole call was new, and went
      **clean** on the shape a real leak takes: one keyword line added to a call that already
      exists, whose opening line is therefore not in the diff. Two independent reviews planted
      exactly that and both got `clean`. Same defect as the `^` anchor that made an earlier
      check match nothing, and as the baseline guard that scored a crashed tool as zero
      problems — a gate reporting clean while doing nothing.
    - **v2, a denylist of name-ish words** (`name|student_name|normalized_name|query|detail`).
      Defeated in one line each by `search=`, `q=`, `who=student.full_name` and
      `students=names`. A denylist of words cannot hold a rule about meaning.
    - **v3, `scripts/log_lint.py`: `ast` over the FILE, and an allowlist of keywords.** Python's
      parser gives every call's exact span, keyword names and literal values, so a multi-line
      call is seen whole whether or not its opener was touched, and a `(` inside a string cannot
      desynchronise anything. Keywords are checked against `ALLOWED_KEYWORDS`, so a keyword
      nobody sanctioned fails **whatever it is called** — and `Student(name=...)`, which appears
      throughout `app/`, is untouched because it is not a logger call. Twelve planted diffs:
      eight that must fail, four negative controls that must stay clean. A file that cannot be
      parsed is reported as a violation rather than skipped, because a gate that cannot read
      must not answer "clean".

    The diff still decides which calls are judged, so this stays a diff gate. What it reads to
    judge them is the file at the **end of the range** — the index under `--cached`, which is
    what the pre-commit hook judges, a commit under CI's resolved range, the working tree
    otherwise.

    **AC-6's wording — "a name-bearing expression inside a logger call" — is unchanged and is now
    enforced more broadly than it says:** any unsanctioned keyword fails, not only one that looks
    like a name. That is deliberate. The criterion describes the leak; the allowlist is the only
    shape that cannot be renamed around.

16. **The spec's own *Personal data* list was short by two routes, and AC-5 inherited the gap.**
    That section said "the four places a name arrives as free text" and AC-5's sweep was written
    from it. Slice 5's review found `search=` on the students list and on the attendance summary,
    both `Query(None, description="Filter by student name ...")` — so a name arrives there exactly
    as it does on the autocomplete query, and neither was being asserted. Both are in the route
    table now, seven in total, and the section above is corrected in place with the count struck
    through rather than quietly rewritten.

    Worth stating plainly, because it is the argument for keeping the route table as **data** in
    the test file rather than as five separate test functions: the gap was a missing row, and
    closing it was one line per route.

**2026-09-10, `/verify-live`.** One, and it corrects this document rather than the code.

17. **AC-2's "all three HTTP responses stay byte-identical" is false, and was false when it was
    written.** The live pass measured it: unknown-email and wrong-password return
    `{"detail":"Invalid email or password"}` and are byte-identical to each other, but the
    inactive-account branch returns `{"detail":"Account is inactive. Please contact support."}`.
    Two of three, not three.

    The difference is **deliberate and predates this spec** — `authenticate_user` has always had
    three messages, and `tests/test_logging_events.py` has asserted the inactive one since slice
    2. So the criterion was never falsifiable as written, and reading it literally would have
    made a two-line message change look like a spec violation.

    **What AC-2 means, and what is proven:** the three branches are distinguishable in the log
    while **no branch's response was changed by the logging work**. That is the property the
    spec's reasoning actually needs — "the distinction has to live in the log because it exists
    nowhere else" — and it holds for the two branches that share a response.

    **The third message is a user-enumeration leak, and that is a separate finding.** `Account is
    inactive` tells an unauthenticated caller that the address is registered, and it is returned
    **before** the password is verified, so no credential is needed to learn it. That contradicts
    this spec's own stated rationale ("telling a stranger whether an address is registered is the
    enumeration this app declines to answer"). Not spec 0005's to fix — it is an auth-path
    decision with a usability side — so it is confessed in `api/REVIEW-DEBT.md` (2026-09-10) and
    raised to the Owner.
