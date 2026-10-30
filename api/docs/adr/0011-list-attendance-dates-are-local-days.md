# ADR-0011 — The attendance list's `date_from` and `date_to` are local days, typed `date`

**Status:** accepted and **implemented**, 2026-10-30, with
[spec 0011](../../../specs/0011-list-attendance-local-days.md), closing issue #39. It reverses
[spec 0009](../../../specs/0009-local-day-boundaries.md) decision 4, which kept these two
parameters typed `datetime`; that spec's *Spec Deltas* carries the dated line.

`GET /api/classes/{id}/attendance` took `date_from` and `date_to` as `datetime`, and
`list_attendance_for_class` read them as two different kinds of thing:

- **`date_from` was an instant**, compared raw. A bare `2026-04-10` parses to a *naive* midnight,
  and asyncpg encodes a naive value with `astimezone(utc)`, which reads it in the **process's**
  zone. CI and the production container set no `TZ`, so there it is UTC midnight: 02:00 or 03:00
  local, and the first hours of the named day were dropped. On a developer machine set to
  Helsinki the same request happened to be right, which is why nobody saw it.
- **`date_to` was a day name**: `date_to.date()` took the calendar day in whatever offset the
  caller wrote, and `_local_midnight` then re-read it as a Helsinki day. With `Z` and a time after
  21:00 or 22:00 the two disagree, and `date_to` excluded its own instant. That is the CI failure
  on `main` at 21:13Z on 2026-10-29.

`/statistics` already took both as `date` and bounded them half-open through `_local_midnight`.

## The decision

Both parameters are `date | None`, at the route and in `list_attendance_for_class`, and both bounds
go through `_local_midnight`, the rule `get_attendance_statistics` uses:

```
timestamp >= _local_midnight(date_from)
timestamp <  _local_midnight(date_to + 1 day)
```

The two endpoints now share one rule rather than each describing one. The ambiguity lived in the
type: a `datetime` named `date_to` invites both readings, which is how this defect landed twice.

**The cost is a wire contract change, accepted by the Owner in #39.** A nonzero time such as
`2026-04-10T23:59:59Z` is now a 422 (`date_from_datetime_inexact`); midnight in any offset still
parses to the day it names. Nothing calls this endpoint with dates: the client sends dates only to
`/statistics`, which already took `date`. A loud 422 is better than silently losing two hours.

## Rejected alternatives

- **Both ends instants (`>= date_from`, `<= date_to`).** Re-opens the 2026-09-15 confession in
  `REVIEW-DEBT.md`: a caller sends a day, gets midnight, and loses the day. The type keeps
  inviting it.
- **Keep `datetime`, convert both ends through the zone.** Passes the test, but the signature then
  lies: it accepts a time of day and discards it, and naive input still leans on the container's
  `TZ`.
- **Fix the test only.** `test_filter_by_both_dates` was the visible symptom, and pinning its dates
  alone leaves `date_from` broken and the documented curl in `API_REFERENCE.md` wrong at both
  ends.

## Consequences

- **Enforcers:** `tests/test_attendance.py::TestListReadsLocalDays` covers the start of the day,
  the end of the day in four spellings, the 422 and agreement with `/statistics`, each at +02 and
  +03. `test_filter_by_both_dates` is built from pinned dates, so its verdict no longer depends on
  the hour the suite starts. `tests/test_authorization.py` and `tests/test_query_budget.py` each
  carry a ranged row for the list endpoint.
- **What the red run taught:** a test of naive-datetime handling is only as good as the zone it
  runs in. AC-1 was green against the old code on a Helsinki machine and red under `TZ=UTC`. After
  this change no naive `datetime` reaches the query, so the suite passes under either zone.
- Shared "local-day range" types across the two endpoints were left out deliberately (spec 0011,
  *Non-Goals*). Two call sites reading one helper is the reuse.
