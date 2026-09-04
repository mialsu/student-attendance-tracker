# 0002 — The five-year cutoff moves to the list the teacher reads

**Weight:** Standard
**Shaped:** 2026-09-04, `/grilling` with the Owner. Six decisions, all confirmed.
**Invariants touched:** INV-1 (guarded, must not weaken). INV-2 … INV-8 unaffected.
**Layers:** `api/` and `client/` — **one** slice, because this project has one bounded context
(`CLAUDE.md`, *Domain model*: "Contexts: one"). PRINCIPLES #4 splits slices at contexts, not repos.

> **Not published to an issue tracker.** Same standing override as spec 0001: the spec is a local
> file, because solo work has no tracker (METHOD.md's reuse table).

## Problem Statement

Backlog item 3 carried three faults. Grounding the shaping session on 2026-09-04 found a fourth
that changes the shape of the fix.

1. **It measures the wrong date.** The cutoff reads `Student.created_at`
   (`app/services/attendance_service.py:121-134`) while the root `CLAUDE.md`, both `CONTEXT.md`
   files and `client/src/api/attendance.ts:20` all say *first attendance*. For every Student the
   `01edea317e5e` migration created, `created_at` is the migration date rather than any date that
   student was ever in a room.
2. **It cannot be switched off.** `legacy` defaults to `None` (`app/api/attendance.py:84`) and the
   service treats `None` and `False` alike, so the cutoff is unconditional. No component sets the
   parameter.
3. **It has never fired.** The app launched November 2025 against a five-year cutoff, so the first
   silent disappearance is due around November 2030.
4. **It governs a surface nobody uses.** The filter lives only on `GET /api/classes/{id}/attendance`.
   Its client hook `useAttendance` (`client/src/hooks/useAttendance.ts:5`) is exported and has zero
   callers — a grep across `client/src` returns the definition and nothing else. The list a teacher
   actually reads is the **Läsnäolot** tab, `StudentLogs.tsx`, built on `…/attendance/summary`, and
   that endpoint has no cutoff at all.

Fault 4 is the one that matters for scope. The cutoff hides nothing from anyone today, so "keep it
on by default" describes a behaviour that does not exist: this slice **introduces** hiding on a
screen where those students are currently visible.

## Solution

Move the rule to the list the teacher reads, fix the date it measures, and give the hiding a voice.

A Student is *legacy* when their first attendance is more than five years old. Legacy students are
absent from the Läsnäolot list by default, in every state including an active search. When any are
hidden, a banner above the list says how many and offers to show them, so nothing ever disappears
without the screen saying so. Revealed students can be renamed, merged and deleted exactly as they
can today.

The old copy of the rule is deleted rather than kept in parallel. One rule, one enforcement site.

## User Stories

1. As the teacher, I want students who stopped attending years ago kept out of my class list, so the
   list shows the people I currently teach.
2. As the teacher, I want to be told when students are hidden and how many, so a short list is never
   a mystery I have to investigate.
3. As the teacher, I want to reveal the hidden students in one click, so I can delete the ones I no
   longer want to carry.
4. As the teacher, I want a name search to obey the same rule as the list, so I never have to work
   out whether search and the list disagree.
5. As the teacher, I want nothing to vanish the day this ships, so a change I did not ask for does
   not rearrange a list I rely on.
6. As the Owner, I want the cutoff to measure first attendance rather than the age of a database
   row, so the students the migration created are judged by when they were actually in class.
7. As the Owner, I want exactly one place in the code that decides who is legacy, so the rule cannot
   drift between two endpoints the way INV-1 drifted across seven sites.
8. As a future session, I want the `_Unresolved_` marker on *Legacy student* resolved in both
   `CONTEXT.md` files, so the word means one thing and the glossary is not owed a decision.

## Implementation Decisions

Six decisions, each put to the Owner on 2026-09-04 and confirmed.

**1 — The rule's home is the summary.** `get_attendance_summary`
(`app/services/attendance_service.py:296`) gains `legacy: bool | None` and applies the cutoff. It
already calls `verify_class_access` as its first statement (`:327`); every query this slice adds
sits after that call, so INV-1 keeps its guard.

*Rejected:* keeping the records endpoint's copy as well. Two sites enforcing one rule is the exact
shape INV-1 is confessed for, and the second site would stay unreachable from the app.

**2 — The date is first attendance, with a fallback.**

```
COALESCE(MIN(AttendanceRecord.timestamp), Student.created_at) < now(utc) - timedelta(days=5 * 365)
```

`Student.created_at` (`app/models/student.py:39`) and `AttendanceRecord.timestamp`
(`app/models/attendance.py:42`) are both `DateTime(timezone=True)`, so the `COALESCE` is
type-compatible and the comparison stays timezone-aware. The `5 * 365` convention is carried over
from the code being deleted rather than replaced with `relativedelta`, which would add a dependency
to change the answer by a day and a half.

The fallback covers the Student created through `POST /classes/{class_id}/students`
(`app/api/students.py:80`) who has no attendance records at all, where `MIN` over zero rows is NULL
and an untouched comparison would answer "not legacy" by accident. It does not reintroduce fault 1:
every migrated Student has attendance records, so `MIN` wins for all of them and the fallback fires
only for a genuinely record-less row.

**3 — Query shape.** A grouped subquery over `Student` outer-joined to `AttendanceRecord`, keyed by
`Student.class_id`, yields one `first_seen` per student; the legacy ids come from filtering it, and
the main query excludes them with `Student.id.not_in(...)`. This mirrors the `students_to_exclude`
pattern that already exists in the code being deleted, so the sorting branch at `:343-353`
(`outerjoin` + `group_by` for `attendance_desc`) keeps working unchanged.

**4 — `legacy_hidden` counts under the active search.** `PaginatedAttendanceSummaryResponse`
(`app/schemas/attendance.py:94`) gains `legacy_hidden: int`, counted after the search filter and
before pagination. `total` keeps its current meaning: students visible under the current filters.
So searching "Matti" when Matti is legacy returns an empty page with `legacy_hidden: 1`, and the
banner explains the emptiness.

**5 — The old copy is deleted.** `legacy` goes from `app/api/attendance.py:84` and from
`get_attendance_records`, taking the `created_at` block at `attendance_service.py:121-134` with it —
all three original faults live in that block, so none of it survives. On the client,
`ListAttendanceParams.legacy` and the dead `useAttendance` hook go.

`attendanceApi.list` **stays**: the records route still exists and the API client mirrors the API.
Removing it is `/prune`'s job (backlog item 6), which requires proof before deletion.

**6 — The banner.** Rendered above the search row in `StudentLogs.tsx`, only when
`legacy_hidden > 0`. Finnish copy, matching the app's existing voice:

```
N vanhaa opiskelijaa piilotettu   [ Näytä ]
Vanhat opiskelijat näkyvissä      [ Piilota ]
```

Revealing resets to page 1, the way changing the search already does (`StudentLogs.tsx:110-113`).
The revealed/hidden state is component state: not a URL parameter, not `localStorage`. A control
that first appears in 2030 and is used to delete a handful of rows does not need to survive
navigation. Reversible if that turns out to be wrong.

An always-visible checkbox was rejected for the reason that decides most of this spec: until roughly
November 2030 nothing is hidden, so a permanent control would sit inert for four years and tell a
teacher who ticked it that the app is broken.

## Testing Decisions

**Backdated rows, not a configurable cutoff.** The feature is a no-op against real data until 2030,
so the tests write old `timestamp` and `created_at` values directly into the disposable test
database. Adding a settings knob to make testing easier would be speculative generality for a value
with one correct number, and would ship a way to change the rule in production by accident.

**Where each layer is tested.** API behaviour at the service and route seams, against real
PostgreSQL 17 as the rest of the suite does (`TEST_DATABASE_URL`, port 5439 via `just test-db-up`,
never 5433). Client behaviour at the `src/api` seam by mocking `@/api/attendance`, the pattern the
rewritten suites established on 2026-09-03; `src/test/setup.ts` fails any test that reaches the
network, and that stands.

**INV-1 from the denied side.** A second teacher calling the summary with `legacy=true` gets the
same refusal as without it. The test joins the existing 17 denial tests in
`tests/test_authorization.py` rather than starting a second file.

**Live.** The recipe from the 2026-09-04 handoff: disposable postgres on **5440**, `alembic upgrade
head`, API on **8099** with `CORS_ORIGINS` naming the page origin, client built with
`npx vite build --mode development` and `VITE_API_URL` in the environment, page served from the same
host as the API, Chrome driven over CDP. Seed one backdated student so the banner has something to
report.

## Acceptance Criteria

Each names how it will be proven, before any code is written. Verdicts are filled by `/verify-live`,
and the slice's verdict is the **worst** of them.

**Filled 2026-09-04. The slice's verdict is `WORKS`** — every criterion passed, six of them twice
(once at a seam, once in a browser). The live run used a disposable stack: PostgreSQL 17 on port
5440, `alembic upgrade head`, the API on 8099, the client built with
`VITE_API_URL=http://127.0.0.1:8099 npx vite build --mode development` and served from 127.0.0.1:8098
so the `SameSite=lax` refresh cookie survives, and headless Chrome driven over CDP. Everything was
destroyed afterwards.

| # | Criterion | Proven by | Serves | Verdict |
|---|---|---|---|---|
| AC-1 | A student whose first attendance is more than five years old is absent from the default summary | `test:` service seam, backdated row | US-1, US-6 | **WORKS** `test_first_attendance_over_five_years_ago_is_hidden`, plus `test_recent_first_attendance_is_kept_however_old_the_row_is` for the date field itself; live, two seeded students vanished from Läsnäolot |
| AC-2 | A student who first attended six years ago **and attended yesterday is still hidden** | `test:` service seam | US-6 | **WORKS** `test_first_attendance_decides_even_when_still_attending`; live, "Ikivanha Korhonen" attended yesterday and stayed hidden |
| AC-3 | A record-less student created more than five years ago is hidden; one created yesterday is not | `test:` service seam | US-1 | **WORKS** `test_student_without_attendance_falls_back_to_created_at` |
| AC-4 | `legacy=true` returns every student, and `legacy_hidden` matches the count under the active search | `test:` route seam, with and without `search` | US-3, US-4 | **WORKS** `test_hidden_count_follows_the_active_search` + three siblings; live, searching "korhonen" returned *Ei hakutuloksia* above a banner reading "1 vanha opiskelija piilotettu", and revealing found him |
| AC-5 | `legacy_hidden` is 0 and no student is hidden for data no older than the app itself | `test:` route seam, unmodified fixtures | US-5 | **WORKS** `test_ordinary_data_hides_nobody`, `test_a_class_with_no_students_reports_nothing_hidden`; the other 328 backend tests are the wider control — none changed behaviour |
| AC-6 | The banner renders only when `legacy_hidden > 0`, reveals on click, and a revealed student can be deleted | `live:` seeded backdated database | US-2, US-3 | **WORKS** live end to end: "2 vanhaa opiskelijaa piilotettu" → *Näytä* → both appear → deleted "Vanha Virtanen" through the confirmation naming its 2 records → *Piilota* → "1 vanha opiskelija piilotettu", the singular branch. Five component tests cover the same states, each watched failing against a mutated threshold |
| AC-7 | A second teacher is refused the summary with `legacy=true`, exactly as without it | `test:tests/test_authorization.py` | US-7, INV-1 | **WORKS** the route joins the parametrized denial suite (19 denials + 8 positive controls). Proven by neutering `verify_class_access` inside `get_attendance_summary` and watching both summary denials go red, then restoring it |
| AC-8 | `GET /api/classes/{id}/attendance` no longer accepts `legacy`, and nothing in `app/` reads `Student.created_at` for a cutoff | `test:` route seam + `grep` in review | US-7 | **WORKS** `test_records_endpoint_declares_no_legacy_parameter` and its positive twin read the app's own OpenAPI document; `grep -rn "created_at" app/services` leaves no cutoff. Two obsolete tests deleted with the code they covered |
| AC-9 | Both gate sets are green on the commit: `just check` and `npm run check` | `gate:` | — | **WORKS** backend 341 passed; ruff ratcheted 93 → 91 and mypy 16 → 15 on their own. Client 78 passed, typecheck 4 and lint 16 at baseline, boundaries and drift clean, build green |
| AC-10 | Both `CONTEXT.md` *Legacy student* entries carry no `_Unresolved_` marker, and no doc still says the cutoff reads a creation date | `gate:` drift + `review-only` | US-8 | **WORKS** both entries resolved, `client/REVIEW-DEBT.md`'s 2026-09-01 entry closed, root `CLAUDE.md`'s feature list and endpoint table corrected |

AC-2 states the consequence of choosing first attendance rather than last: a long-running student is
hidden while still attending. The Owner chose it knowingly on 2026-09-04. It is asserted as a test
so the behaviour can never arrive as a surprise, and so reversing it later is a one-line change with
a failing test to point at.

## Tracer Slices

**One slice.** It cuts data (the date expression) → logic (the summary service) → surface (the
banner) → words (the Finnish copy and both glossaries), and it is demoable alone: seed a backdated
student, open Läsnäolot, see the banner, click through, delete them.

The 2026-09-04 handoff suggested two slices with a seam between `api/` and `client/`. That reading is
declined here: those are two layers of one context, and the domain crunch settled that this project
has one (`CLAUDE.md`, *Domain model*). Landing the API half alone would bank a change no teacher can
exercise, which is the backend-only-progress anti-pattern.

Order of work inside the slice, each step gated:

1. The date expression and the summary's `legacy` parameter, with AC-1, AC-2, AC-3.
2. `legacy_hidden` on the response, with AC-4, AC-5.
3. Deletion of the records endpoint's copy and the dead client hook, with AC-8.
4. The banner and its client tests, with AC-6.
5. The authorization denial test, AC-7.
6. The docs, AC-10.

## Out of Scope

- The statistics tab and `get_attendance_statistics`. It has no cutoff and gains none here.
- `list_students_for_class` (`app/services/student_service.py:140`). Same.
- INV-1's consolidation into `verify_class_ownership` across seven sites — backlog item 4, and
  deliberately not started inside a slice that touches one of those sites.
- `/prune`'s sweep of `attendanceApi.list` and the other dead exports — backlog item 6.

## Non-Goals

- **A configurable cutoff.** Five years is one number and it is not a setting.
- **An attendance-records screen.** The records endpoint stays unused by the client; building the
  screen it was written for is a separate product decision nobody has asked for.
- **Any change to what deletion does.** Deleting a Student still destroys their attendance history,
  which `INVARIANTS.md` records as deliberately not an invariant.
- **Retrofitting the cutoff onto old data.** Nothing is backfilled, migrated, or recomputed; the
  rule is evaluated per request.

## Open Questions

Recorded rather than assumed. None blocks the build.

1. **Does a class ever run long enough for AC-2 to bite?** First-attendance semantics hide a student
   who started six years ago and still attends. Raised during shaping; the Owner chose first
   attendance. Worth revisiting only if a real class runs past five years with the same people.
2. **Should the revealed state survive navigation?** Decided as component state (decision 6).
   Cheap to change to a URL parameter if the delete workflow turns out to need it.
3. **Does `attendanceApi.list` go with the hook?** Kept here, flagged for `/prune`.

## Spec Deltas

Diverging from this spec during the build is normal; diverging silently is the defect. Every change
lands here, dated, with what the build taught us.

| Date | What changed | Why |
|---|---|---|
| 2026-09-04 | `find_legacy_student_ids` is a module-level function, not a private helper inside `get_attendance_summary` | The tests needed it addressable, and the summary reads better with the query shape named. Decision 3's shape is unchanged |
| 2026-09-04 | The banner also renders while legacy students are revealed, saying *Vanhat opiskelijat näkyvissä* | Decision 6 said "only when `legacy_hidden > 0`", which would have removed the control the moment it worked: revealing sets the count to 0, so there would be no way back. Caught writing the fifth component test |
| 2026-09-04 | AC-8 is proven against `app.openapi()` rather than `GET /openapi.json` | The docs sit behind HTTP Basic whenever `ENVIRONMENT` is not `development`, so the HTTP route tested the protection instead of the contract |
