# ADR-0006 — OpenTelemetry traces into a self-hosted Jaeger

**Status:** accepted and **implemented**, 2026-09-08.

Numbered 0006, not 0005: `specs/0004-shared-classes.md` reserves **ADR-0005** for the
`class_teachers` schema decision, and an `0005-modular-monolith.md` was already created and
deleted once (2026-09-07) for recording a decision nobody had made.

## Why now

The API had no observability of any kind. `grep -rn "getLogger\|logger" app/` returned nothing —
not one log line in the service layer — and no metrics, tracing or error-reporting dependency
existed. An unhandled 500 produced a bare traceback on uvicorn's stdout with no route, no user
and no request context.

The concrete argument is already written in this repo, in `app/services/attendance_service.py`.
An N+1 loop lived in `get_attendance_summary` until 2026-09-04 and its fix comment says:

> Every test in the suite runs against classes of a handful of students, where an N+1 is
> invisible; nothing failed as the loop grew, which is why this was found **by measuring rather
> than by a gate**.

Three loops of the same shape were still live when this ADR was written. Measured on a 25-student
class with 50 attendance records:

| Endpoint | SQL statements | Site |
|---|---|---|
| `GET /classes/{id}/students?limit=100` | **29** | `student_service.py:197` — one `COUNT` per student |
| `GET /classes/{id}/students/autocomplete` | **28** | `student_service.py:430` — one `COUNT` per match, and the `SELECT` above it has no `LIMIT` |
| `GET /classes/{id}/attendance?limit=100` | **79** | `attendance_service.py:106` — one refresh per record |
| `GET /classes/{id}/attendance/summary` | **6** | the loop that was already fixed — the control |

Six statements for the same 25 students, against 29 for the students list. 437 tests, the boundary
gate, the mypy ratchet and the drift gate all pass over every one of these.

## The decision

**OpenTelemetry traces only, exported over OTLP/HTTP to a Jaeger v2 container on the same VM,
with the UI bound to the loopback interface and reached over an SSH tunnel.**

- `app/core/telemetry.py` wires `FastAPIInstrumentor` and `SQLAlchemyInstrumentor`. It is a no-op
  returning `False` unless `OTEL_EXPORTER_OTLP_ENDPOINT` is set, which is what keeps the test suite
  and a bare `just run` untouched — `tests/conftest.py` imports `app.main`, so it executes at
  test-collection time in every session. `tests/test_telemetry.py` is the enforcer.
- **`engine.sync_engine`, not the `AsyncEngine`.** SQLAlchemy's instrumentation registers core
  event listeners, which the async wrapper does not carry; passing the async object produces no
  SQL spans and no error.
- **HTTP, not gRPC.** No `grpcio` binary wheel, and no gRPC-plus-fork interaction with
  `uvicorn --workers 4`.
- **`BatchSpanProcessor`.** Export runs on a background thread; the exporter retries with backoff
  inside a 10s timeout, then logs and drops, and never raises. A Jaeger that is down costs log
  noise, not request latency or availability.
- **Four dependencies, pinned exactly.** The instrumentation packages are pre-1.0 (`0.65b0`) where
  a minor bump may change span shape.
- **`deployment/jaeger.yaml`, one file shared by local and production**, so the two cannot drift.
  It is a reduced version of Jaeger's built-in config: the stock one starts eight listeners (OTLP
  gRPC, Jaeger Thrift over UDP/HTTP/gRPC, Zipkin, remote sampling, pprof, a Prometheus endpoint),
  and this app speaks exactly one protocol. Verified: only 4318 and the query UI listen.
- **`max_traces: 20000` plus `mem_limit: 512m`.** Idle usage measured at 12 MiB; the caps exist so
  an unbounded in-memory store cannot OOM PostgreSQL on a 4 GB CX21.

Sampling is left at the SDK default (`parentbased_always_on`, i.e. everything). At one teacher's
traffic there is nothing to sample away.

## What lands in a span, checked rather than assumed

Read out of the installed packages, and confirmed against a real trace:

- **Bound parameters are never recorded.** SQLAlchemy's instrumentation has no parameter attribute
  at all, and `db.statement` carries the parameterised text (`... WHERE student_id = $1::UUID`).
  Student names do not reach a span through SQL. `opentelemetry-instrumentation-asyncpg` does have
  `capture_parameters`, defaulting to `False` — it is not installed, see below.
- **`http.url` carries the full, unredacted query string.** The SDK's `redact_url` strips only
  credentials and a fixed list of signature parameters. A real trace recorded
  `.../students/autocomplete?query=in` — on the deployed app that is a partial student name.
- `http.route` is the templated path; request and response headers are not captured by default.

That second point is the whole reason the UI is loopback-only. Docker publishes ports by writing
its own iptables rules and **bypasses UFW**, so `"16686:16686"` would put an unauthenticated trace
UI holding student data on the public internet with the firewall still looking correct.

## What this does not do

Metrics and logs: Jaeger stores neither, and the service layer still has no logger — that gap is
recorded in `REVIEW-DEBT.md` rather than quietly closed. Uptime: a trace store on the monitored
box cannot report that the box is down. Browser tracing: the client runs on Vercel.

## Rejected alternatives

| Rejected | Why |
|---|---|
| **Prometheus + Grafana** | Answers "how many and how fast", never "why was *this* request slow". The question this repo actually had was a per-request query count, which is a trace. Also ~0.5 GB of extra services against Jaeger's measured 12 MiB idle. |
| **A hosted backend** (Grafana Cloud, Honeycomb) | Zero RAM on the VM and a better UI, but `http.url` carries typed student names, so it would ship student-adjacent telemetry off the machine continuously. Rejected on the same grounds `setup-ssl-monitoring.sh` gives: no external services, no accounts, no outbound mail. |
| **Jaeger v1 `all-in-one`** | Simpler (three env vars, no config file) but the v1 line is winding down, and this project is expected to outlive a month. v2 needed a config file; that file is 60 lines and is now explicit and reviewable, which is the better trade. |
| **`--set=...max_traces=N` instead of a config file** | Would have avoided the YAML, but `--set` silently accepted a deliberately bogus storage path in testing, so "it started cleanly" proved nothing about whether the cap applied. A setting that cannot be verified is not a setting. |
| **Also installing `opentelemetry-instrumentation-asyncpg`** | SQLAlchemy's instrumentation hooks `before_cursor_execute`; asyncpg's patches `Connection.execute`. Under SQLAlchemy-async-over-asyncpg both fire for one statement, giving two nested spans per query and doubling the volume for no added information. |
| **Exposing the UI through nginx behind Basic auth** (as `/docs` is) | Convenient, but it puts a UI with no authentication of its own on the public hostname behind one shared password, holding the exact data the 2026-09-02 threat model is about. An SSH tunnel costs one flag. |
| **Building the N+1 gate on OpenTelemetry spans** | `tests/test_query_budget.py` counts SQLAlchemy's own `before_cursor_execute` events instead. It needs nothing installed, avoids OTel's set-once global tracer provider in a single-process pytest session, and keeps working whatever happens to the tracing stack. |
