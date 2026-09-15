# Spec 0009 — a day is a Finnish day

**Status:** shaped 2026-09-15, two decisions taken by the Owner — `ready-for-agent`
**Weight:** Standard
**Domain dial:** on (project-wide); touches `INV-1` not at all, and no invariant governs the clock

Modules and functions are named; **line numbers deliberately are not**, per `INVARIANTS.md`.

---

## Problem Statement

*Läsnäolot* and *Tilastot* disagree about which day a record belongs to, and both are showing the
same teacher the same record.

`AttendanceRecord.timestamp` is a `timestamptz` — a correct instant, and nothing is wrong with the
stored data. What differs is who converts it back to a day:

- **The client** renders it with `format(new Date(record.timestamp), 'PPP p', { locale: fi })`
  (`StudentLogs`), which uses the **browser's** zone. A teacher in Finland reads a Finnish day.
- **The server** groups it with `date_trunc('day', timestamp)` under a UTC session, and filters it
  against UTC midnights. That is a **UTC** day.

Demonstrated against PostgreSQL 17 rather than reasoned about:

```
stored instant          teacher saw          grouped today   grouped correctly
2026-03-10 22:00:00+00  2026-03-11 00:00     2026-03-10      2026-03-11
```

**The window is narrow and the failure is silent.** `AttendanceTracking` builds the timestamp as
*the date the teacher picked* stamped with *the current clock time*, so anything logged between
local midnight and 02:00 (winter) or 03:00 (summer) shifts back a day — **including a record she
deliberately dated to another day**. Log a session for 5 March at 01:00 on 11 March and it lands
under 4 March.

This is the same shape spec 0008 fixed one layer up: two figures on one screen describing
different things, where nobody decided the difference and it accumulated. Spec 0008 asked the
question (open question 2) and the Owner first answered "keep UTC" on 2026-09-15, then reversed it
the same day on the ground that two disagreeing screens is not a thing to carry into a public
repository. That reversal is the reason this spec exists, and it is recorded rather than tidied
away.

## Solution

One configured timezone decides what a day is, applied at **both** places that decide one, derived
from a single setting.

- **Filtering stays sargable.** Bounds are computed in Python with
  `zoneinfo.ZoneInfo(settings.app_timezone)` and compared against the raw column, so the index on
  `AttendanceRecord.timestamp` is still used and the offset is resolved per date by the tz
  database rather than by arithmetic.
- **Grouping converts in SQL.** `date_trunc('day', timestamp AT TIME ZONE <zone>)`, a grouping
  expression where the index is irrelevant anyway.

**No migration and no backfill.** Every stored row is already a correct instant; only the
interpretation changes. This is the whole reason this approach was chosen over storing an explicit
date column, which would need exactly this conversion to backfill and a schema change on top.

## Implementation Decisions

**1. One setting, `app_timezone`, defaulting to `Europe/Helsinki`.** In `app/config.py` beside the
rest. Not a per-User or per-Class column: there is one teacher in one country, and a column for a
dimension nobody varies is the *Speculative Generality* `ANTI-PATTERNS.md` names. When a second
school in another country exists, the setting moves onto the Class and this spec's helper is the
only thing that changes.

**2. The zone is resolved once, at import, and an unusable one refuses to start.** `zoneinfo`
falls back to the PyPI `tzdata` package when the OS has no tz database. `python:3.12-slim` does
ship one — verified by running the real base image, which resolved `Europe/Helsinki` to the same
instant PostgreSQL did — but that is Debian's choice, not this project's, so `tzdata` goes into
`requirements.txt` to make the dependency explicit rather than inherited. A misconfigured zone is
a startup failure, never a request that silently returns the wrong day.

**3. One helper, used at every site.** Five places decide a day and a sixth compares one. Applying
the conversion at each of them independently is the *smallest diff in the wrong place*: the
seventh site would be written against the old semantics. The helper lives in `attendance_service`
next to its callers.

**4. The list endpoint's `<=` trap is fixed in the same pass.** `list_attendance_for_class`
compares `timestamp <= date_to` against a `datetime`, so an end date drops that whole day. It is
confessed (`REVIEW-DEBT.md`, 2026-09-15) and out of scope for spec 0008 deliberately. It is *in*
scope here because this spec rewrites the same comparison for the zone, and leaving one of the two
endpoints on a different rule is what created the defect this spec exists to fix. Its parameters
stay typed `datetime` — no surface exposes them and changing the type is a contract change this
spec has no reason to make; only the end-day boundary moves.

**5. Nothing on the client changes.** `AttendanceTracking`'s `setHours(now)` is left alone: once
the read side interprets in the teacher's zone, a record dated 5 March at any hour is a 5 March
record. The `toISOString()` on the write path is correct and stays.

## Testing Decisions

The seam is the API route, as it was for spec 0008 — what a caller observes, never how the
conversion is built. Two things need proving that a single mid-afternoon fixture cannot show:

- **The boundary**, with records placed at local 00:30 and 23:30 either side of a chosen day.
- **DST**, with the same assertion run in January (`+02`) and July (`+03`). A hardcoded offset
  passes one and fails the other, which is the point.

**Plant the failures.** Each is watched red before it is trusted: the grouping against
`date_trunc('day', timestamp)` with no conversion, the range bounds against UTC midnights, and the
list endpoint's end day against its current `<=`.

## Acceptance Criteria

| # | Criterion | Proven by | Serves | Verdict |
|---|---|---|---|---|
| AC-1 | A record at 00:30 local appears under that local day in `daily_stats`, not the previous one — watched failing against unconverted `date_trunc` | `test:` | US-1 | |
| AC-2 | `monthly_stats` use the same zone: a record at 00:30 local on 1 March falls in March, not February | `test:` | US-2 | |
| AC-3 | `date_from`/`date_to` bound at local midnight: a record at 00:30 local on `date_from` is included, one at 23:30 local the day before is not — watched failing against UTC bounds | `test:` | US-3 | |
| AC-4 | `exclude_dates` removes the local day, matching the buckets it filters | `test:` | US-4 | |
| AC-5 | Both totals count the same rows the buckets do, at the boundary | `test:` | US-5 | |
| AC-6 | The same boundary assertions hold in January (`+02`) and July (`+03`) — a hardcoded offset fails one | `test:` | US-6 | |
| AC-7 | `list_attendance_for_class` includes the whole of `date_to`'s local day and excludes the next — watched failing against the current `<=` | `test:` | US-7 | |
| AC-8 | An unresolvable `APP_TIMEZONE` fails at import, not at request time | `test:` | US-8 | |
| AC-9 | The statistics endpoint stays within `BUDGET_STATISTICS` and flat in the row count | `test:` query budget | US-9 | |
| AC-10 | `INV-1` still refuses a second Teacher on both endpoints | `test:` authorization | US-10 | |

## User Stories

1. As a teacher, I want a session logged just after midnight to appear on the day I logged it for, so that the chart matches what I remember.
2. As a teacher, I want the monthly totals to agree with the daily ones about which month a day is in.
3. As a teacher, I want a timeframe of 1.9.–30.9. to hold exactly the days I would call September.
4. As a teacher, I want a hidden day to be the day I hid, not the one before it.
5. As a teacher, I want the summary counts to count the same records the chart draws, at every hour of the day.
6. As a teacher, I want this to be true in winter and in summer, without anyone re-checking in March.
7. As a maintainer, I want both endpoints to read `date_to` the same way, so that learning one does not make me wrong about the other.
8. As a maintainer, I want a misconfigured timezone to stop the app rather than quietly shift every date.
9. As a maintainer, I want the conversion to cost no extra queries.
10. As a maintainer, I want a date parameter to remain no way around `INV-1`.

## Tracer Slices

One slice. It cuts the whole read path and is demoable with `curl` against two records placed
either side of a local midnight; splitting it would leave the two endpoints disagreeing in the
middle, which is the defect itself.

1. **A day is a Finnish day.** The setting, the helper, the five statistics sites, the list
   endpoint's two bounds, the tests at both DST offsets. AC-1 – AC-10.

## Out of Scope

- **Per-User or per-Class timezones.** Decision 1.
- **The client's `setHours(now)`** on the write path, and its `toISOString()`. Both are correct
  once the read side is right (decision 5).
- **Telling the teacher which zone the dates are in.** With the server and the client agreeing,
  there is nothing to disclose; the question spec 0008 left open is answered by fixing it rather
  than labelling it.
- **`Student.created_at` and spec 0002's five-year legacy cutoff.** A five-year window does not
  turn on a midnight, and moving it would re-open a decision the Owner already made.
- **The `attendance/summary` endpoint**, which reports no dates.

## Non-Goals

- Supporting teachers in more than one timezone at once.
- Changing what is stored. No migration, no backfill, no data rewrite.

## Open Questions

None. Both decisions this spec needed — the approach and its position before spec 0008's slices 2
and 3 — were taken by the Owner on 2026-09-15.

## Spec Deltas

*(Dated entries, added as the build teaches us the spec was wrong.)*

None yet.
