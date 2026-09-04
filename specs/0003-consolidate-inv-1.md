# 0003 — INV-1 gets one enforcement site

**Weight:** Standard
**Shaped:** 2026-09-04 with the Owner. **Verdict: WORKS** on all nine criteria. Shared classes deferred explicitly; no `/grilling` round,
because deferring them removes the only product question and leaves a refactor.
**Invariants touched:** INV-1 (consolidated, must not weaken). INV-2 … INV-8 unaffected.
**Layers:** `api/` only — no route signature, status code or response body changes, so `client/`
has nothing to slice.

> **Not published to an issue tracker.** Same standing override as specs 0001 and 0002: the spec is
> a local file, because solo work has no tracker (METHOD.md's reuse table).

## Problem Statement

`INVARIANTS.md` records INV-1 as enforced at "7 sites, not 1" and names them by file:line. Grounding
this session against the code found the count is right and the description is not. What is actually
there:

| Site | Enclosing function | What it is |
|---|---|---|
| `class_service.py:226` | `verify_class_ownership` | the intended single owner |
| `student_service.py:579` | `verify_class_ownership` | a **second helper of the same name**, 8 callers |
| `attendance_service.py:80` | `verify_class_access` | a **third helper under a second name**, 4 callers |
| `class_service.py:151` | `update_class` | an inline check |
| `class_service.py:194` | `delete_class` | an inline check |
| `attendance_service.py:265` | `delete_attendance_record` | an inline check |
| `class_service.py:54` | `get_classes_for_teacher` | a `WHERE` clause over many rows |

Three faults follow from that table, and only the first is the one the ledger confessed.

1. **The rule has three implementations, not one.** Two are byte-similar; `student_service`'s runs
   its own `select(Class)` where the other two call `get_class_by_id`. Three copies of one
   authorization rule is the divergence ANTI-PATTERNS calls "rebuilding what you already have",
   pointed at the one behaviour where a divergence is a data leak.

2. **One of them is a vocabulary fork.** `verify_class_access` and `verify_class_ownership` name the
   same rule, so the project's language already carries two words for one thing. Neither
   `CONTEXT.md` mentions either name, so the drift gate has never had anything to check.

3. **`get_attendance_statistics` is guarded only by its route.** The service function
   (`attendance_service.py:431`) takes `(db, class_id, exclude_dates)` and no teacher at all; the
   check lives in `app/api/attendance.py:59`, one line above the call. Every other read of a class's
   data is refused inside the service. This one is refused inside the transport layer, so a second
   caller of the service function would be unguarded and nothing would fail.

The `WHERE` clause is not a fault. It is a different enforcement shape — a filter over many rows
rather than a check on one — and it cannot call a helper that takes a single `class_id`. Counting it
among the seven made the confession read as "seven copies of one check", which overstates the
duplication and understates the vocabulary fork.

**Why now:** the Owner intends shared classes later. INV-1 is already worded "a Teacher
**associated with** a Class" so the rule survives that change, and the whole cost of the change is
the number of places that have to learn the new definition of *associated*. That is the reason this
slice exists and the reason it stops before implementing them.

## Solution

One function decides whether a teacher may touch a class: `class_service.verify_class_ownership`.
The other two helpers are deleted and their callers repointed. The three inline checks call it. The
statistics service takes a teacher and checks like every other service function does. The list
filter stays where it is and `INVARIANTS.md` stops calling it a check.

Then the gate: a raw `teacher_id` comparison anywhere in `app/` outside `class_service.py` fails
the drift gate, so a fourth copy cannot appear the way the third did.

No route changes. A denied teacher gets the same 403 and the same message as today, and a missing
class still 404s before authorization is considered.

## User Stories

1. As the Owner, I want one place that decides who may touch a class, so shared classes are a
   one-site change rather than a seven-site change.
2. As the Owner, I want the rule to have one name, so a session reading `verify_class_access`
   cannot conclude there are two different rules.
3. As the Owner, I want a gate that fails when a fourth copy appears, because three copies grew
   under a green suite and prose did not stop them.
4. As the Owner, I want the statistics endpoint refused inside the service, so its safety does not
   depend on a line in a route handler.
5. As a teacher, I want nothing about the app's behaviour to change, because this is a refactor and
   a refactor that changes behaviour is a bug.

## Implementation Decisions

Seven decisions. D1–D4 follow `INVARIANTS.md`'s own stated intent; D5–D7 are this session's.

1. **The single owner is `class_service.verify_class_ownership`.** `INVARIANTS.md` already names it
   as the intended one, and it is the copy that delegates to `get_class_by_id` rather than repeating
   the query. It gains one parameter — `action: str = "access this class"`, the phrase after
   "You don't have permission to" — because the three inline checks raise three different messages
   ("update this class", "delete this class", "delete this attendance record") and folding them
   into a single fixed message would change three routes' response bodies. No test asserts those
   strings and the client never reads them, so this parameter buys diagnostics rather than
   compatibility: "permission to delete this class" tells a human what was refused.
   *Rejected:* a new `app/services/authorization.py`. The boundary gate permits it — `pyproject.toml`
   constrains `app.api > app.services > app.models` as packages, siblings inside `app.services` are
   unconstrained, and `attendance_service.py:15` already imports `student_service` — but a new module
   for one function is a layer nobody asked for, and INV-1's row would have to be rewritten twice.

2. **The two duplicates are deleted, not aliased.** `student_service.verify_class_ownership` and
   `attendance_service.verify_class_access` go; their callers import `class_service`.
   *Rejected:* keeping `verify_class_access = verify_class_ownership` as a re-export. It keeps the
   second name alive, which is the thing D3 gates against, and leaves the file:line count unchanged.

3. **`verify_class_access` is banned by name and by shape.** The name goes under `_Avoid_` in
   `api/CONTEXT.md` so the existing vocabulary check catches it, and a new `drift-extra.sh` check 4
   fails any added line in `app/` outside `class_service.py` that compares `teacher_id` with `!=` or
   `==`. Both are needed: the name check catches a renamed copy, the shape check catches an inline
   one.
   *Rejected:* leaving this review-only. Half of spec 0002's AC-8 was review-only and that is
   precisely the half this project wrote check 3 to close.

4. **The list filter stays and is reclassified.** `get_classes_for_teacher`'s `WHERE` clause is the
   enforcement for "a teacher does not see another teacher's class in their own list" and there is
   no single class to hand a helper. INV-1's row will read **one check site, one filter site**.
   *Rejected:* routing the list through the helper per row. It would turn one query into N+1 to
   enforce something the query already enforces.

5. **`get_attendance_statistics` gains `teacher: User` and calls the helper; the route's own call
   goes.** It has exactly one caller (`app/api/attendance.py:67`), so this is safe and leaves one
   site rather than two.
   *Rejected:* checking in both places. Two sites is what this spec is removing.

6. **Order of failure is preserved and written down: `NotFoundError` before `ForbiddenException`.**
   All three current copies already do this, so nothing changes — but it is load-bearing rather than
   incidental. Checking ownership first would turn a 404 into a 403 and confirm that a class id
   exists to someone with no right to know.

7. **Shared classes are not implemented.** The Owner deferred them in this session. INV-1's wording
   already anticipates them; this slice only makes the later change cheap.

## Testing Decisions

- **The net already exists.** `tests/test_authorization.py` is 26 tests — 18 denials as a second
  authenticated teacher and 8 positive controls — and it covers every route that reaches all three
  helpers and all three inline checks. This refactor is safe to attempt because that suite was
  written first, on 2026-09-01, for exactly this reason.
- **Every fold is proven by breaking it.** After consolidating, the `raise ForbiddenException` in
  the single helper is removed once and the suite watched go red, then restored. The list filter is
  proven separately by dropping its `WHERE` and watching the leak test fail, because the helper's
  failure cannot cover it.
- **The tests that name a deleted function are checked against existing coverage before being
  repointed.** `test_service_attendance.py` tested `verify_class_access` and the local
  `get_class_by_id` directly — but `test_service_class.py` already has `TestVerifyClassOwnership`
  and `TestGetClassById` against the surviving functions, so repointing would have put five
  duplicate tests in a second file. Deleted instead. See Spec Deltas.
- **The new drift check is proven by breaking it**, like the other three: add a
  `teacher_id != teacher.id` line in `app/services/student_service.py`, watch check 4 fail, revert.
- **A service-seam test for statistics**, not just the route's denial: `get_attendance_statistics`
  called directly with a non-owning teacher must raise. The route test cannot prove the service is
  safe to call.

## Acceptance Criteria

| # | Criterion | Proven by | Serves | Verdict |
|---|---|---|---|---|
| AC-1 | Exactly one function in `app/` decides single-class ownership; no other line in `app/` compares `teacher_id` outside `class_service.py` | `gate:` new `drift-extra.sh` check 4, watched failing on a planted line | US-1, US-3 | **WORKS** `drift-extra.sh` check 4, proven three ways: a planted fourth copy in `student_service.py` failed the gate naming `api/app/services/student_service.py:20`; `drift-ok` on that line suppressed it; the same line inside `class_service.py` did not fire, so the exemption is real and not an accident of the path regex |
| AC-2 | All 26 tests in `tests/test_authorization.py` pass, and removing the `raise` in the single helper turns the 18 denials red | `test:` + a deliberate break | US-1, US-5 | **WORKS** 26 pass. Replacing the single `raise` with `if False` turns **17 of the 18 denials red** — the 18th is the list filter's and belongs to AC-6 — and 24 red across all three service test files. The 9 that stay green are the 8 positive controls plus that leak test |
| AC-3 | `student_service.verify_class_ownership` and `attendance_service.verify_class_access` no longer exist, and no caller references either | `test:` full suite green + `grep` | US-2 | **WORKS** `grep` returns neither name in `app/`; `student_service`'s 8 callers and `attendance_service`'s 4 now reach `class_service.verify_class_ownership`, and 345 tests pass |
| AC-4 | `verify_class_access` cannot come back: the compound is banned in `drift-extra.sh`'s check 1 and `api/CONTEXT.md` carries a *Class ownership* entry naming the one function | `gate:` drift, watched failing | US-2, US-3 | **WORKS** reintroducing `async def verify_class_access` failed check 1 naming `api/app/services/attendance_service.py:37`, then reverted. `CONTEXT.md` carries the *Class ownership* entry. The ban is in `drift-extra.sh` rather than `_Avoid_` for the reason in Spec Deltas |
| AC-5 | `get_attendance_statistics` raises for a non-owning teacher **when called directly**, and its route still returns 403 | `test:` service seam + `tests/test_authorization.py` | US-4 | **WORKS** `TestGetAttendanceStatisticsOwnership` — owner reads, `other_teacher` refused, missing class 404s — and the route stays in the parametrized denial suite. The service refused nothing on its own before this |
| AC-6 | A teacher still cannot see another teacher's class in their own list; proven independently of the helper | `test:` + dropping the `WHERE` clause | US-1 | **WORKS** dropping `.where(Class.teacher_id == teacher_id)` failed `test_class_list_does_not_leak_another_teachers_class` **alone**, 1 of 26, which is what proves the filter is enforced independently of the check |
| AC-7 | No route's status code, message or response body changes — except the one unreachable 404 named in Spec Deltas — and the full suite passes; the only test edits are five duplicates deleted, three assertions strengthened and six added | `test:` | US-5 | **WORKS** 345 passed (344 − 5 duplicates + 6 new). Test edits: 5 deleted, 3 assertions strengthened, 6 added. One response body changed — the unreachable 404 in Spec Deltas |
| AC-8 | Both gate sets green on the commit: `just check` and `npm run check` | `gate:` | — | **WORKS** api: boundaries 4 kept 0 broken, drift and drift-extra clean, ruff 91 and mypy 15 both **at** baseline, 345 tests. client: typecheck 4, lint 16, tests 0, drift clean, build green — untouched by this commit, run to make the claim true rather than assumed |
| AC-9 | `INVARIANTS.md`'s INV-1 row names one check site and one filter site, carries the true test count, and has no stale line numbers | `review-only` | US-1, US-2 | **WORKS** the row now reads *one check site and one filter site* and names **functions, not lines**, because the row it replaces pointed at `attendance_service.py:286` which had already rotted to :265 |

## Live verification, 2026-09-04

Run against the real app over HTTP — uvicorn on 127.0.0.1:8010 against a disposable PostgreSQL on
port 5439, seeded with two real teachers, two classes and five interleaved attendance records. Not
port 8000, which another project holds, and not 5433, which is another project's database.

| What | Result |
|---|---|
| statistics as the owner | **200**, `total_records: 5` |
| statistics as a second teacher | **403** `You don't have permission to access this class` — the check that moved out of the route |
| `GET` another teacher's class | **403** `...to access this class` |
| `PUT` another teacher's class | **403** `...to update this class` |
| `DELETE` another teacher's class | **403** `...to delete this class` |
| `DELETE` another teacher's attendance record | **403** `...to delete this attendance record` |
| `GET` a class id that does not exist | **404** `Class not found`, before ownership is considered |
| owner on class / students / summary | **200, 200, 200** — positive controls |

The four distinct 403 phrases are the `action` parameter's whole justification, and this is where
it is proven: a single fixed message would have made all four read "access this class", which no
test asserted before today and no gate would have caught.

**What this did not exercise:** the browser. The Läsnäolot screen was never opened, so "the API
returns records newest-first" is proven and "the teacher sees them newest-first" is not. Confessed
in `client/REVIEW-DEBT.md`.

## Tracer Slices

One slice. The refactor has no demoable halves — a consolidation that lands in two commits leaves
the codebase with four copies in between, which is worse than three.

## Out of Scope

- **Shared classes** (D7). The Owner deferred them; INV-1's wording already survives them.
- **The attendance summary's N+1.** Fixed in this session as its own commit, deliberately not folded
  into a permission change.
- **`client/`.** No API surface changes, so there is nothing to change.
- **The other six invariants.** INV-2 … INV-8 have their own enforcers and are untouched.

## Non-Goals

- Making the list filter share code with the check. D4 says why it cannot.
- Adding a permission abstraction, a policy object or a decorator. One function, called directly.
- Improving `student_service.py`'s 29% coverage. Real, and not this slice's job.

## Open Questions

None. The one product question — shared classes — was answered by deferring it.

## Spec Deltas

| Date | What changed | Why |
|---|---|---|
| 2026-09-04 | The single helper takes an `action` phrase; D1's "signature unchanged" was wrong | Found reading the code before writing any: the three inline checks raise three *different* 403 messages. A fixed message would have changed three response bodies to satisfy a refactor, so the phrase moved to the call site |
| 2026-09-04 | A **fourth** duplicate was found and deleted: `attendance_service.get_class_by_id`, byte-identical to `class_service.get_class_by_id` apart from one docstring word | Not in the spec's table because the spec counted permission checks and this is a plain read. Both its callers were the two functions this slice deleted, so it became dead the moment they went. Leaving a zero-caller duplicate behind would have needed a confession to explain why the slice stopped one function short. Scope added deliberately, not silently |
| 2026-09-04 | Five tests deleted rather than repointed, and the Testing Decision corrected | `test_service_class.py` already covers both surviving functions. Repointing would have created five duplicate tests in a second file — the same defect as the code duplication this slice removes |
| 2026-09-04 | The banned name lives in `drift-extra.sh`, not `CONTEXT.md`'s `_Avoid_`; AC-4 rewritten | `CONTEXT.md:105`: `_Avoid_` entries **must be single words**, because the vocabulary gate matches identifier *segments* — a compound there is silently dead, which is the exact defect that produced `drift-extra.sh`'s check 1. `CONTEXT.md` gained a *Class ownership* entry instead, and it points at the gate that can express the ban |
| 2026-09-04 | `delete_attendance_record`'s 404 changes from "Associated class not found" to "Class not found" | Folding its check into the helper means the helper's own 404 message. The branch is unreachable — `AttendanceRecord.class_id` is a foreign key with cascade delete, so a record cannot outlive its class — and no test asserts the string. Accepted rather than carried as a second message parameter |
