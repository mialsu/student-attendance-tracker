# Spec 0011 — the attendance list reads both of its dates as local days

**Status:** shaped 2026-10-30 from issue #39, which the Owner wrote and which carries the
analysis, the criteria and the rejected alternatives. One slice, **built and verified 2026-10-30**
(all nine criteria MET); in review as a PR, not yet merged.
**Weight:** Standard
**Domain dial:** on (project-wide); moves no invariant. `INV-1` is re-asserted on the endpoint
whose parameters change (AC-7)
**Tracker:** issue #39, the one exception the Owner asked for to local specs being the tracker.
`Closes #39`.

Modules and functions are named; **line numbers deliberately are not**, per `INVARIANTS.md`.

---

## Problem Statement

`GET /api/classes/{id}/attendance` takes `date_from` and `date_to`, typed `datetime`, and
`list_attendance_for_class` reads them as two different kinds of thing:

- `date_from` is an **instant**, compared raw (`timestamp >= date_from`). A bare `2026-04-10`
  parses to a *naive* midnight; asyncpg reads naive as UTC against a `timestamptz`, so the bound
  is 03:00 local and the first three local hours of the named day are dropped. This is the mirror
  of the `<=` trap confessed on 2026-09-15, still live on the other end. Traced through the types
  in #39; **not yet demonstrated against the database** — AC-1's red run is that demonstration.
- `date_to` is a **day name**: `date_to.date()` reads its wall-clock fields in whatever offset the
  caller wrote, and `_local_midnight` then re-reads that as a Helsinki day. With `+03:00` the two
  agree; with `Z` they disagree by the offset and `date_to` excludes its own instant.

Spec 0009 decision 4 moved only the end bound and kept the type, so its US-7 ("both endpoints read
`date_to` the same way") is not met. The visible symptom is
`tests/test_attendance.py::TestDateFiltering::test_filter_by_both_dates`, which builds its range
from `datetime.now()` and fails only when the suite starts in the last two or three hours of the
UTC day. It failed CI on `main` at 21:13Z on 2026-10-29, so `2c74df2` (#37) never deployed.

## Solution

Both parameters become `date`, and both bounds go through `_local_midnight` — the half-open rule
`get_attendance_statistics` already applies:

```
timestamp >= _local_midnight(date_from)
timestamp <  _local_midnight(date_to + 1 day)
```

The two endpoints then share one rule rather than each describe one. The ambiguity lived in the
type: a `datetime` named `date_to` invites both readings, which is how this landed twice.

## Implementation Decisions

1. **The type changes, at the route and the service.** `date_from: date | None`,
   `date_to: date | None` in `app/api/attendance.py::list_attendance` and in
   `list_attendance_for_class`. Patching `date_to` again is the smallest diff in the wrong place:
   the `date_from` mirror would outlive it.
2. **A wire contract change, accepted.** A nonzero time such as `...T23:59:59Z` becomes a 422
   (`date_from_datetime_inexact` in the installed pydantic); midnight-with-offset still parses.
   Nothing calls this endpoint with dates — only `getStatistics` sends dates, to `/statistics`,
   which already takes `date`. A loud 422 beats silently losing two hours.
3. **The test stays and stops reading the clock.** `test_filter_by_both_dates` keeps its
   six-of-fifteen contract and builds it from pinned dates, so its verdict no longer depends on the
   hour the suite runs.
4. **The decision is written down where it was taken the other way.** A dated line in spec 0009's
   *Spec Deltas* (this reverses its decision 4, never a silent edit of it), and an ADR under
   `api/docs/adr/` (ADR-0011) carrying the three rejected alternatives below.

### Rejected alternatives (for ADR-0011)

| Alternative | Why not |
|---|---|
| Both ends instants (`>= date_from`, `<= date_to`) | Re-opens the 2026-09-15 confession: a caller sends a day, gets midnight, loses the day. The type keeps inviting it. |
| Keep `datetime`, convert both ends through the zone | Passes the test, but the signature then lies — it accepts a time of day and discards it, and naive input leans on the container's `TZ`. |
| Fix the test only | Leaves `date_from` broken and the documented curl wrong. |

## Testing Decisions

- **Red first on AC-1 and AC-2**, each watched failing against the current code before the fix,
  with the failing output kept for the handoff (PRINCIPLES #2).
- Against the disposable database only: `eval "$(just test-db-up)"`, port 5439. **Never 5433** —
  the fixtures call `drop_all`. Never two pytest sessions at once.
- AC-3 runs AC-1 and AC-2's assertions in January (`+02`) and July (`+03`), as spec 0009 AC-6 did.
- AC-7 and AC-8 extend the existing enforcers (`tests/test_authorization.py`,
  `tests/test_query_budget.py`) rather than add new files. The list endpoint is already in the
  budget's parametrize list as `attendance_list`; AC-8 adds a ranged URL beside it.

## Acceptance Criteria

| # | Criterion | Proven by | Serves | Verdict |
|---|---|---|---|---|
| AC-1 | A record at 00:30 local on `date_from` is included; one at 23:30 local the day before is not — the assertion the list endpoint never got. Watched failing against the current raw `>= date_from` | `test:` | US-1 | |
| AC-2 | `date_to` includes the whole of its local day whatever offset the caller writes it in, `Z` included. Watched failing against the current `.date()` | `test:` | US-2 | |
| AC-3 | AC-1 and AC-2 hold at `+02` and `+03` — a hardcoded offset fails one | `test:` | US-3 | |
| AC-4 | `test_filter_by_both_dates` asserts six days from pinned dates, and its verdict does not depend on the hour the suite runs | `test:` | US-4 | |
| AC-5 | A nonzero-time `date_to` is refused with 422 rather than silently truncated | `test:` | US-5 | |
| AC-6 | `/statistics` and the list endpoint return the same boundary rows for the same named range | `test:` | US-6 | |
| AC-7 | `INV-1` still refuses a second teacher on the list endpoint with and without range parameters | `test:` authorization | US-7 | |
| AC-8 | The list endpoint stays within its query budget with range parameters | `test:` query budget | US-8 | |
| AC-9 | The written record matches the code: spec 0009 *Spec Deltas* line, ADR-0011 with the three rejected alternatives, `api/docs/API_REFERENCE.md`'s list-endpoint parameters and its date-range curl rewritten to day names, and a dated line on the 2026-09-15 `api/REVIEW-DEBT.md` entry saying its CLOSED disposition was partial | `review-only` | US-9 | |

## User Stories

1. As a maintainer, I want a range starting on a day to include that day's first hours, so that `date_from` means the day it names.
2. As a maintainer, I want `date_to` to mean the same local day whatever offset I write it in.
3. As a maintainer, I want this true in winter and summer without re-checking in March.
4. As a maintainer, I want the suite's verdict not to depend on the hour it runs, so that a red CI on `main` means a defect.
5. As an API caller, I want a time of day I cannot use to be refused rather than silently dropped.
6. As a maintainer, I want both endpoints that take `date_from`/`date_to` to read them by one rule.
7. As a maintainer, I want a date parameter to remain no way around `INV-1`.
8. As a maintainer, I want the change to cost no extra queries.
9. As a reader of the docs, I want the documented example to return what it says.

## Tracer Slices

1. **The whole change** — route and service types, both bounds through `_local_midnight`, the
   tests AC-1 – AC-8, and the AC-9 documents. One commit or a few on
   `fix/list-attendance-local-days`; squash-merged as one. AC-1 – AC-8 by `just check`; AC-9 by
   review.

## Out of Scope

- The client. It sends no dates to this endpoint (`client/src/api/attendance.ts`), so no surface
  changes and there is nothing to walk in a browser.
- `get_attendance_statistics`. Its rule is the one being adopted; it does not move.
- Deploying. Landing this on `main` unblocks #37's deploy; the merge is the Owner's keystroke.

## Non-Goals

- A shared parameter type or dependency for "a local-day range" across the two endpoints. Two call
  sites reading one helper (`_local_midnight`) is the reuse; a wrapper over it is a knob nobody
  asked for.

## Open Questions

None. #39 settled the shape, and the Owner accepted the 422 contract change in it.

## Verification status

**2026-10-30 — slice 1 verified, all nine criteria MET.** AC-1 – AC-8 on `0d8e621`; AC-9 on
`eb4348c`, which changed only docs and `REVIEW-DEBT.md` (`git diff 0d8e621 eb4348c -- api/app
api/tests` is empty). Everything ran under `TZ=UTC`, the zone CI and production run. The live runs
used `uvicorn` against a throwaway database, with two Teachers signed up through the API, and OLD
(the app code from `118a0d6`) side by side with NEW.

| AC | Verdict | Evidence |
|---|---|---|
| AC-1 | MET | live `date_from=2026-01-15`: NEW keeps 00:30 local, OLD drops it. Tests red 2/2 on the old app code under `TZ=UTC` (`assert [] == ['First Hour']`), and green on it under Helsinki, as the first delta says |
| AC-2 | MET | live: `D`, `DT00:00:00Z`, `+02:00`, `+03:00` all give the whole local day in both seasons. The CI case `…T21:13:51Z` is now 422; on the old code it dropped its own record (`assert 5 == 6`, builder's pinned replay) |
| AC-3 | MET | mutation: a fixed `+02` fails exactly the 6 summer cases, and a fixed `+03` exactly the 6 winter cases |
| AC-4 | MET | pinned to 2026-03-20T12:00Z, 6 of 15. No clock read in the test or the function. Not run at a pinned 21:13Z wall clock (no faketime installed) |
| AC-5 | MET | live: a time of day on either end gives 422 `date_from_datetime_inexact`; OLD gave 200 and truncated. Red 2/2 on the old code |
| AC-6 | MET | live D..D: the list gives [First, Last], and `/statistics` gives `total_records=2`. On OLD they disagreed |
| AC-7 | MET | live: a second Teacher gets 403 with and without a range, and the owner's ranged control returns all rows. New ranged rows in `test_authorization.py` pass |
| AC-8 | MET | `attendance_list_ranged` passes under `BUDGET_ATTENDANCE_LIST` |
| AC-9 | MET | both reference copies' curl, run live, returns October with both edge half-hours across the DST change; the old instant form gives 422. The response example's keys equal a live response's. Every documented 422 case returns 422. The debt entries match `git log` and the `justfile` |

`just check` under `TZ=UTC` on `0d8e621`: 580 passed, all gates green. Review: one blocking finding
(the stale `api/API_REFERENCE.md` still carried the old curl), fixed in `eb4348c`; the re-review
passed with no findings.

## Spec Deltas

*(Dated entries, added as the build teaches us the spec was wrong.)*

**2026-10-30 — the `date_from` mechanism was misstated; the defect stands where it matters.** The
Problem Statement says asyncpg reads a naive `datetime` as UTC. It reads it as the **process's**
local time: the encoder calls `obj.astimezone(utc)` (`asyncpg/pgproto/codecs/datetime.pyx`), and a
naive `astimezone` assumes the system zone. On a developer machine set to `Europe/Helsinki` a bare
`date_from` therefore lands on local midnight by accident, and AC-1 is green against the old code.
Under `TZ=UTC` — what CI and the production container run, since no `TZ` is set in the
`Dockerfile`, either compose file or `backend.yml` — AC-1 is red 2/2. AC-1's "watched failing" is
recorded as a `TZ=UTC pytest …` run. After the fix no naive `datetime` reaches the query, so the
test passes under any zone. Found by the builder's red run.

**2026-10-30 — AC-2's "watched failing" is shown through a nonzero time, because no midnight
spelling separates old from new.** Every input that stays valid after the fix (`D`, `DT00:00:00Z`,
`+02:00`, `+03:00`) already gives the named day through `.date()`, so AC-2 is green against the old
code 8/8 under both zones. The `.date()` defect needs a nonzero time (CI's `21:13:51Z`), which the
fix refuses with 422. AC-2's test stays as the post-fix contract; its red evidence is AC-5 red
against the old code plus a pinned repro of the CI case (a `Z` instant at 21:13 dropping the record
at that instant), both recorded in the build handoff. Found by the builder's red run.
