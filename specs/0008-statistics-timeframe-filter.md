# Spec 0008 — a timeframe filter on *Tilastot*

**Status:** shaped 2026-09-14 (`/grill-with-docs` → `/to-spec`), eleven decisions, four seams — `ready-for-agent`
**Weight:** Standard
**Domain dial:** on (project-wide); this spec touches `INV-1` without moving it — see *Invariants touched*

Modules and functions are named; **line numbers deliberately are not**, per `INVARIANTS.md` — the
row that convention replaced pointed at `attendance_service.py:286`, which had already rotted.

---

## Problem Statement

A teacher reading *Tilastot* sees one thing: every attendance record the Kurssi has ever held. She
cannot ask the only question she actually has — *how did September go?* A course that has run for
two years answers "how many came" with a number spanning both, and the per-day table below it is a
scroll through every day since the beginning.

The request came from the teacher who uses this app daily: a date from/to filter, so she can pick a
timeframe.

Three things already on the surface make this more than adding two parameters.

**The four summary cards disagree with each other today.** `total_records` and `total_students` are
computed over all data, with a comment in `attendance_service` saying so. `first_date` and
`last_date` are derived from the already-filtered `daily_stats`. So the existing `exclude_dates`
filter moves the bottom two cards and leaves the top two alone. Nobody decided that; it accumulated.

**The page hides a day by constant.** `ClassStatistics` carries `excludeDates = ['2026-02-27']`
under a `TODO`, hiding a bulk log from the charts. The totals ignore it, the charts honour it.

**The empty state is one wrong branch away from lying again.** The branch reads
`!stats || total_records === 0`. Spec 0006 fixed this exact shape once already, when a failed
request rendered "Ei läsnäoloja näytettäväksi" to a teacher holding hundreds of records —
`DESIGN.md` §3 calls it "an empty state lying about an error". Filter the totals and an empty
September tells the same teacher to go and log some attendance.

## Solution

Two date pickers above the statistics, `Alkaen` and `Päättyen`, each the same control the teacher
already uses to log attendance. Empty by default, so the page opens exactly as it does today.

Pick either end, or both, and the whole surface follows: the four cards, the per-day table, and the
chart all describe the timeframe and agree with each other. Clear the range and the whole course
comes back.

A timeframe holding no attendance gets its own answer that names the dates she chose and offers the
way out, rather than the advice meant for a teacher who has never logged anything.

## User Stories

1. As a teacher, I want to set a start date on the statistics, so that I can leave out a period I am not reviewing.
2. As a teacher, I want to set an end date, so that the figures stop at the end of a term.
3. As a teacher, I want to set both ends at once, so that I can look at a single month in isolation.
4. As a teacher, I want *Tilastot* to open showing everything, so that I see the whole Kurssi without configuring anything first.
5. As a teacher, I want to clear the timeframe in one action, so that getting back to the whole picture is not a second date-picking exercise.
6. As a teacher, I want the four summary figures to describe the timeframe I chose, so that the number I read and the chart beside it cannot disagree.
7. As a teacher, I want "Yhteensä läsnäoloja" to count the timeframe only, so that I can report a term's attendance without doing arithmetic against the chart.
8. As a teacher, I want "Opiskelijoita" to count the students who attended in the timeframe, so that I can see who was active that term rather than ever.
9. As a teacher, I want the first and last attendance dates to fall inside the timeframe, so that they describe what I am looking at.
10. As a teacher, I want the per-day table to list only days in the timeframe, so that I can read a month without scrolling past two years.
11. As a teacher, I want the chart to draw only the timeframe, so that a short period is legible instead of compressed against a long history.
12. As a teacher, I want the *Päivät* / *Kuukaudet* toggle to keep working inside the timeframe, so that I can zoom out across a long range.
13. As a teacher, I want my chosen dates to survive flipping that toggle, so that changing granularity does not cost me the filter.
14. As a teacher, I want the end date to include the whole of that day, so that attendance logged on that morning is counted.
15. As a teacher, I want to be told plainly when a timeframe holds no attendance, so that I do not conclude the app is broken.
16. As a teacher, I want that message to name the dates I picked, so that I can see my own mistake in it.
17. As a teacher, I want a way out of an empty timeframe on the screen itself, so that I am not left on a dead end.
18. As a teacher, I want a class with no attendance at all to keep telling me to log some, so that the advice still fits when it is the right advice.
19. As a teacher, I want to be unable to pick an end before the start, so that I cannot build a timeframe that means nothing.
20. As a teacher, I want future dates unavailable, so that I do not pick a range that could not contain attendance.
21. As a teacher, I want the dates displayed the Finnish way, so that they read as I write them.
22. As a teacher, I want the whole filter operable from the keyboard, so that I can use it without a mouse.
23. As a teacher on a phone, I want the filter to fit a 320px screen, so that I can check figures away from my desk.
24. As a teacher, I want the filter to look like the rest of the app, so that nothing reads as bolted on afterwards.
25. As a teacher, I want the date picker to behave like the one I use for logging attendance, so that I learn one control rather than two.
26. As a teacher, I want a failed load to say it failed even with a timeframe set, so that an error is never dressed as an empty range.
27. As a maintainer, I want the statistics endpoint under the query-budget ratchet, so that an N+1 loop on it cannot land unnoticed the way one already did.
28. As a maintainer, I want the client's date serialization pinned by a test, so that a timezone off-by-one cannot come back silently.
29. As a maintainer, I want omitted range parameters to mean unfiltered, so that every existing caller keeps working untouched.
30. As a maintainer, I want ownership checked before any filtering, so that a date parameter can never become a way around `INV-1`.

## Implementation Decisions

**1. Scope is *Tilastot* alone.** *Läsnäolot* and the attendance summary keep today's behaviour.
The list endpoint already accepts `date_from`/`date_to` and no surface exposes them; that stays
true.

**2. The parameter names are settled by precedent.** `date_from` and `date_to`, the names
`list_attendance_for_class` already uses. A third vocabulary for one concept is the defect the
drift gate exists to catch.

**3. They are typed `date`, not `datetime`.** The statistics endpoint is day-grained throughout —
it groups by day and by month, and its existing `exclude_dates` are `YYYY-MM-DD` strings compared
against `func.date(timestamp)`. A `datetime` here would inherit the list endpoint's trap, where
`date_to` parses to midnight and drops that whole day's records.

**4. The comparison is half-open internally.** `timestamp >= date_from` and
`timestamp < date_to + 1 day`. Inclusive of the end day as a teacher reads it, and sargable, so
the index on `AttendanceRecord.timestamp` is still used. A `func.date(timestamp)` comparison on
both sides would read more directly and give up that index.

**5. Both counts move inside the `WHERE` clause.** `get_attendance_statistics` currently computes
`total_records` and `total_students` over all data. They join the same conditions the aggregations
use, so all four cards describe one thing.

**6. A consequence of 5, accepted by the Owner.** The counts now honour `exclude_dates` as well as
the range. With the hardcoded `2026-02-27` exclusion still in place, "Yhteensä läsnäoloja" drops
once on deploy, to the figure the charts have been drawing all along. The Owner will warn the
teacher before it ships. This is recorded again under *Out of Scope*.

**7. Omitted parameters mean unfiltered.** No default range. The response shape does not change,
so `AttendanceStatistics` needs no new field and every existing caller is unaffected.

**8. An inverted range is refused with 422**, as a backstop. The UI makes it unrepresentable, and
the contract should not depend on the UI being the only client.

**9. The control is two single date pickers**, each copying the `Popover` + `Calendar mode="single"
locale={fi}` pattern `AttendanceTracking` already ships, including its future-date disabling. The
two cross-disable: `Alkaen` offers no day after a chosen `Päättyen`, and the reverse. One shared
idiom rather than a second one to learn.

**10. Dates serialize with date-fns `format(d, 'yyyy-MM-dd')`, never `toISOString`.** A date picked
as 1.9.2026 is local midnight; in UTC+3 `toISOString().slice(0, 10)` yields `2026-08-31`. Both ends
of every range would shift by a day for half the year, silently. AC-9 pins this.

**11. Range state lives in the component and resets on reload.** It joins the `queryKey`, so
TanStack Query caches per range. The tab the surface sits in is not persisted either, so
persisting the range alone would be incoherent. No URL parameters — the client has no
`useSearchParams` anywhere today, and adding routing state for a filter widens this into a routing
change.

**12. The empty timeframe gets its own branch, checked before the all-time empty one.** It names
the dates and carries a clear action. Its copy asserts nothing about data outside the range,
because the client cannot know: with the totals filtered, "no records here" and "no records at
all" are indistinguishable without a second count, and a second count is a query and a schema
field to buy a warmer sentence. `DESIGN.md` §3's *Tilastot* row gains this state.

**13. The daily table's subtitle changes.** It reads "Kaikki päivät, joilta läsnäoloja on
kirjattu", which a timeframe makes false.

**14. The statistics endpoint joins the query-budget ratchet**, with a `BUDGET_STATISTICS` constant
and one `parametrize` row. It issues four statements and stays flat in the row count. This closes
the open confession at `api/REVIEW-DEBT.md` (2026-09-11), where the budget's enumerated list left
a fourth endpoint unwatched.

## Testing Decisions

A good test here asserts what a caller or a reader observes — the JSON a request returns, the text
on the screen, the parameters that leave the client. None of them reach into how the filtering is
built. The existing files establish every pattern needed, so this spec adds one file and rows to
four others.

**Four seams, all of them already in use.**

| Seam | What it proves | Prior art |
|---|---|---|
| **API route** — `tests/test_attendance.py`, through the existing `client` and `auth_headers` fixtures | Filtering, end-day inclusivity, the totals following the range, 422 on an inverted range | the statistics tests already in that file |
| **Query budget** — `tests/test_query_budget.py` | The statement ceiling, as a ratchet | the four endpoints already parameterized there |
| **Client `src/api`** — a new `src/api/__tests__/attendance.test.ts` | `getStatistics` turns picked dates into `date_from=2026-09-01` and omits them when unset | `src/api/__tests__/client.test.ts` |
| **Client hook** — `vi.mock('@/hooks/useAttendance')` in `ClassStatistics.test.tsx` | The pickers, the fifth state, the clear action, cross-disabling, and the error state under a range | the same file, and `error-states.test.tsx`, which established the pattern |
| **Browser walk** — one swept state in `e2e/states.spec.ts` | 320px reflow and axe, including the open calendar popover | the `STATES[]` array, which already sweeps both statistics granularities |

**Why the `src/api` seam is worth a new file.** The hook seam is mocked above `getStatistics`, so
nothing there can see a wrong query string. The timezone shift in decision 10 produces correct-
looking dates that are off by one, which is the failure most likely to reach production unnoticed
and the one hardest to spot by reading the screen.

**Why jsdom is not enough.** Recharts measures 0×0 in jsdom, as `ClassStatistics.test.tsx`
documents, and a popover's geometry at 320px is not measurable there either. The browser walk owns
both.

**Plant the failures.** Each new gate-like assertion is watched red before it is trusted: the
inclusivity test against a `<=` comparison, the serialization test against `toISOString`, and the
budget row against a deliberately added query. A gate nobody has watched fail is not a gate.

## Acceptance Criteria

Verdicts are filled by `/verify-live`, per criterion. A task's verdict is the **worst** of them.

| # | Criterion | Proven by | Serves | Verdict |
|---|---|---|---|---|
| AC-1 | With neither parameter, the response is unchanged from today's for the same data, counts included | `test:` | US-4, US-29 | |
| AC-2 | `date_from` alone, `date_to` alone, and both together each restrict `daily_stats` and `monthly_stats` to the timeframe | `test:` | US-1, US-2, US-3, US-10, US-11 | |
| AC-3 | `total_records` and `total_students` count only records inside the timeframe | `test:` | US-6, US-7, US-8 | |
| AC-4 | `first_date` and `last_date` fall inside the timeframe whenever one is set | `test:` | US-9 | |
| AC-5 | A record at 23:59 on `date_to` is counted; one at 00:00 the next day is not — watched failing against a `<=` comparison | `test:` | US-14 | |
| AC-6 | A request with `date_from` after `date_to` returns 422 | `test:` | US-19 | |
| AC-7 | The endpoint stays within `BUDGET_STATISTICS`, and the count is flat in the number of rows — watched failing on a planted query | `test:` query budget | US-27 | |
| AC-8 | `INV-1` still refuses a second Teacher on this route, with and without range parameters | `test:` authorization | US-30 | |
| AC-9 | `getStatistics` sends `date_from=2026-09-01` for a date picked as 1.9.2026 under a UTC+3 clock, and sends neither parameter when the range is unset — watched failing against `toISOString` | `test:` src/api | US-21, US-28 | WORKS (gates) |
| AC-10 | Picking either end re-queries and the surface renders the filtered figures in all four cards, the table and the chart | `test:` hook seam | US-1, US-6 | WORKS (gates) |
| AC-11 | A timeframe holding no attendance renders the new state naming both dates, with a working clear action; a Kurssi with no attendance at all still renders the original empty state | `test:` hook seam | US-15, US-16, US-17, US-18 | WORKS (gates) |
| AC-12 | `Alkaen` offers no day after a chosen `Päättyen` and the reverse; neither offers a future day | `test:` hook seam | US-19, US-20 | WORKS (gates) |
| AC-13 | A failed load renders the error state, not the empty-range state, with a timeframe set | `test:` hook seam | US-26 | WORKS (gates) |
| AC-14 | Changing the *Päivät* / *Kuukaudet* toggle leaves the chosen dates in place | `test:` hook seam | US-12, US-13 | WORKS (gates) |
| AC-15 | The filter and the empty-range state hold at 320px with no horizontal scroll and axe clean, with the calendar popover both closed and open | `live:` e2e | US-23, US-24 | WORKS (gates) — and it caught a real contrast defect |
| AC-16 | Every control in the filter is reachable by keyboard with a visible focus ring, and the calendar is operable without a mouse | `live:` | US-22, US-25 | WORKS (gates) |

**Invariants touched:** `INV-1`, which does not move. `verify_class_ownership` already runs as
`get_attendance_statistics`'s first act, before any filtering, so a range parameter cannot reach
another Teacher's rows; `tests/test_authorization.py` already covers this route from the denied
side and from the permitted one. AC-8 asserts that the new parameters change nothing there. No new
comparison of a `teacher_id` is added, so `drift-extra.sh` check 4 stays satisfied.

`INV-9` is adjacent and holds. The new parameters are dates, so neither a log line nor an
OpenTelemetry span's `http.url` gains anything identifying a Student — unlike the autocomplete
query string, which ADR-0006 records as carrying partial names.

## Tracer Slices

Each cuts to something observable and is demoable alone. Blocking order.

1. **The endpoint answers a timeframe.** The two parameters, the half-open comparison, both counts
   moved inside the `WHERE` clause, the 422, the route tests and the budget row. Demoable with
   `curl`: the same class, two ranges, numbers that follow. No deploy, no client change.
   AC-1 – AC-8.
2. **The teacher can pick one.** `getStatistics`, the hook signature and `queryKey`, the two
   pickers with their cross-disabling, and the table subtitle. Demoable in the browser: pick
   September, watch all four cards and the chart follow. AC-9, AC-10, AC-12, AC-14.
3. **The empty timeframe, and the walk.** The fifth state with its clear action, the `DESIGN.md`
   §3 row, the swept state, and the keyboard pass. AC-11, AC-13, AC-15, AC-16.

Slice 1 is the only one that changes a production figure, and it does so the moment it deploys
(decision 6). Slices 2 and 3 touch the client only.

## Out of Scope

- **The list endpoint's `date_to` trap.** `list_attendance_for_class` compares `timestamp <= date_to`
  against a `datetime`, so an end date silently drops that day's records. Found while shaping this
  spec, deliberately not fixed here, and it leaves the two endpoints reading the same parameter
  names differently. It goes to `REVIEW-DEBT.md` as a confession, with the note that no surface
  exposes it today.
- **The hardcoded `excludeDates = ['2026-02-27']`** and its `TODO`. Untouched. Its interaction with
  decision 5 — the one-time drop in "Yhteensä läsnäoloja" — is the accepted cost, and both the
  constant and the drop go to `REVIEW-DEBT.md`.
- **Timeframe presets** ("tämä kuukausi", "viime kuukausi", a term selector). Two pickers first;
  presets are worth revisiting once the Owner has watched which ranges actually get picked.
- **Persisting the range** in the URL or in `localStorage`.
- **Deriving the granularity from the range length.** *Päivät* stays the default at every range.
- **The attendance summary and course credit.** Spec 0002's five-year legacy cutoff is a separate
  date concept on a separate endpoint, and putting a second one beside it needs its own decision.

## Non-Goals

- A reporting or export feature. This filters a screen; it produces no file.
- Comparing two timeframes side by side.
- Any change to how attendance is recorded, or to what a Student or a Kurssi means.

## Open Questions

2. **Which clock is a "day"? — SUPERSEDED by spec 0009, same day.** First answered "keep UTC",
   then reversed within the hour once the Owner named a reason the technical framing had missed:
   this repository is going public, and two screens disagreeing about one record is not a thing
   to carry into a portfolio. `specs/0009-local-day-boundaries.md` is the answer — a day is a
   Finnish day, decided by the `app_timezone` setting. The original resolution is kept below
   because the reversal is the record, and because the rejected reasoning is still the right
   reasoning for a project that is *not* going public.

   ~~RESOLVED 2026-09-15 by the Owner: it stays UTC.~~ No code change;
   the endpoint keeps the behaviour it has always had, and slice 1's range keeps agreeing with the
   buckets exactly. The rejected alternative was aggregating `AT TIME ZONE 'Europe/Helsinki'` and
   moving the range bounds with it, which would have changed every figure the endpoint has ever
   returned for the sake of records logged between local midnight and 02:00 or 03:00 — a window a
   teacher's register rarely lands in. What the decision does **not** settle is whether a screen
   should say so; that is a client question and belongs to slice 2 or 3 if it is worth doing at
   all. The original statement of the problem follows, because the reasoning is the record.

   The server
   buckets attendance by **UTC** day (`date_trunc('day', timestamp)` under a UTC session) and
   slice 1's range follows it, so the two agree with each other. They do not necessarily agree
   with the teacher: a Kurssi logged at 01:00 Helsinki time on 11 March is 22:00 UTC on the 10th,
   and lands in the previous day — in the daily table, in the chart, and now in the timeframe.
   **This is pre-existing**, not something slice 1 introduced; the aggregation has always been
   UTC-day-grained and no screen has ever said so. The spec never decided the clock, and the
   Owner's teacher works in Finnish local time. Deciding it means choosing between
   `AT TIME ZONE 'Europe/Helsinki'` on the aggregation (and the range with it) or leaving UTC and
   saying so on the screen. Not slice 1's to settle, and it touches every figure the endpoint has
   ever returned. Confessed in `api/REVIEW-DEBT.md`.

1. **The Finnish copy — RESOLVED 2026-09-16 by the Owner: ship the drafts as written.**
   `Aikaväli`, `Alkaen`, `Päättyen`, `Tyhjennä aikaväli` and the empty-range sentence
   "Aikavälillä 1.9.2026 – 30.9.2026 ei ole kirjattuja läsnäoloja." are ratified unchanged, as is
   the table subtitle "Päivät valitulla aikavälillä" (decision 13). Asked before slice 2 was
   written rather than after, because the strings thread through the component, the tests and the
   swept states, and re-ratifying copy after three files quote it is the expensive order.

   ~~drafts by the agent. Copy voice has no skill owner in this project — METHOD's reuse table
   assigns it to the Owner with `/code-review` as the backstop. Sign off or rewrite before slice 2
   lands.~~ One gap the sign-off did not cover, extended by the agent and recorded as a delta
   below: the sentence for a range with only ONE end set.

## Verification status

**Slices 2 and 3 built and verified 2026-09-16.** AC-9 – AC-16 all hold; every one was watched
fail first.

Client gates, all at their `.harness-baseline` figures with nothing new added: `typecheck` 4,
`eslint` 16, a11y config 0, `dependency-cruiser` clean (110 modules), the full vitest suite
(18 files), both drift gates, and `npm run build`.

**`cd client && npm run check` passes end to end, the browser walk included** — 78/78 at both
viewports, and stable over nine full runs.

It was briefly blocked: Playwright's Chromium would not start for want of `libasound.so.2`, and
installing that needs root. It was first verified by satisfying the library without root
(`apt-get download libasound2t64`, `dpkg-deb -x`, `LD_LIBRARY_PATH`), and the **Owner then
installed the package properly the same day**. Re-verified with the variable explicitly unset, so
the pass does not depend on the workaround. A fresh clone needs
`sudo apt-get install -y libasound2t64` and `npx playwright install chromium`; both are setup notes
in `CLAUDE.md` now.

**The walk earned its keep on the way in, which is the part worth recording.** The three new swept
states are `Tilastot — the timeframe, calendar open`, `— the timeframe set, with figures` and
`— an empty timeframe`; `e2e/timeframe.spec.ts` holds four keyboard tests. Between them they found
**two real defects that every other gate passed**, both written up as deltas below: a WCAG 1.4.3
contrast failure in the shared `calendar.tsx` primitive, and three races in the new tests
themselves. Neither would have been visible without a state that opens a calendar — which is
exactly `states.spec.ts`'s own argument for being a table of states rather than a set of journeys.

AC-1 – AC-8 are slice 1's and were **not** re-verified here: they need `TEST_DATABASE_URL` and the
API suite, a different scope from the one this session was asked for. Their rows are left empty
rather than filled from slice 1's commit message, because a verdict copied from a commit message is
not a verdict.

## Spec Deltas

*(Dated entries, added as the build teaches us the spec was wrong. Diverging is normal; diverging
unrecorded is the defect.)*

**2026-09-15 — the route seam is `tests/test_statistics.py`, not `tests/test_attendance.py`.**
*Testing Decisions* named `test_attendance.py` and cited "the statistics tests already in that
file". There are none there: the endpoint has had a dedicated `tests/test_statistics.py` since it
was written, with seven tests. Slice 1's route tests went into that file. The shaping session read
the endpoint's code but not its test file, which is the same class of mistake the spec's own
`Invariants touched` note warns about with line numbers.

**2026-09-15 — the endpoint issues five statements, not four.** Decision 14 predicted four and
`BUDGET_STATISTICS` opened at **5**, measured. Two reasons, and neither is a regression: the count
is taken at the route, so it includes the authenticating user lookup and the ownership check that
every other row in `test_query_budget.py` also pays for, and the spec's four counted only the
service's own queries. Measured as written, it would have been six; folding `total_records` and
`total_students` into a single `SELECT count(...), count(distinct ...)` over the shared `WHERE`
clause took it to five, since a second round trip over identical conditions bought nothing.
Flatness is proven separately by `test_statistics_stays_flat_in_the_number_of_records`, which
holds at 5 while the row count grows by 100.

**2026-09-15 — AC-1 is narrower than it reads, for the one caller that exists.** AC-1 says the
response is "unchanged from today's for the same data, counts included" when neither parameter is
sent, and US-29 promises "every existing caller keeps working untouched". Both hold only when
`exclude_dates` is *also* absent. `ClassStatistics` sends `excludeDates=['2026-02-27']` on every
request, and for that caller `total_records` and `total_students` both drop — which is decisions 5
and 6 working as intended, and the one-time fall in "Yhteensä läsnäoloja" the Owner undertook to
warn the teacher about. The two criteria were written as though the range were the only new
filter. `tests/test_statistics.py` pins the real behaviour in
`test_no_parameters_returns_everything` (no exclusions, unchanged) and in the two exclusion tests
that were flipped to match.

**2026-09-15 — decision 14 overclaims, and the ledger is right rather than the spec.** It says
adding the budget row "closes the open confession at `api/REVIEW-DEBT.md` (2026-09-11)". It does
not. That entry's point is that `test_query_budget.py` guards a **hand-written** list, so an
endpoint nobody thought to add is not watched at all; taking one name off that list leaves
`/api/auth/*` unwatched and still nothing noticing a new route arriving without a budget. The
ledger entry was narrowed rather than closed, and says why.

**2026-09-16 — the one-ended empty-timeframe sentence is the agent's, not the Owner's.** Open
question 1 ratified "Aikavälillä 1.9.2026 – 30.9.2026 ei ole kirjattuja läsnäoloja." — the
BOTH-ends form. A range with only one end set is reachable from the UI (decision 9 offers two
independent pickers, and AC-2 requires each end to work alone), and no sentence was written for it.
The agent extended the ratified one by the obvious Finnish construction — "Aikavälillä 1.9.2026
**alkaen** ei ole kirjattuja läsnäoloja." and "Aikavälillä 30.9.2026 **asti** ei ole kirjattuja
läsnäoloja." — and `emptyRangeMessage` in `ClassStatistics.tsx` says in its docstring that these two
are unratified. Recorded here rather than quietly shipped, because the sign-off was asked for
precisely so the agent would not be writing the teacher's Finnish.

**2026-09-16 — the error state shows no filter, which AC-13 does not say either way.** Decision 12
gives the empty timeframe a clear action; nothing decided whether the ERROR state keeps the filter
on screen. It does not: the error branch owns the whole surface, as `DESIGN.md` §3 has it, and the
retry is the action there. The reasoning is in a comment at the branch — offering a date picker for
a request that never arrived invites the teacher to debug her own range. Worth knowing because it
has a consequence: a teacher whose request fails *while a range is set* cannot clear that range
without a retry succeeding first. Judged acceptable rather than overlooked; reopen it if the Owner
disagrees.

**2026-09-16 — the all-time empty state shows no filter either, and that is what makes AC-11
testable.** A Kurssi with no attendance at all has nothing to filter, so that branch renders no
pickers. The consequence is a structural one worth naming: it is impossible to *reach* the
empty-timeframe state from the all-time empty state, because there is no control there to pick a
date with. `ClassStatistics.test.tsx` therefore mocks the hook as a *function of the range* —
figures with no range, nothing with one — which is also the only honest model of the case the state
exists for: a Kurssi that has attendance, filtered to a month that does not. A fixed mock return
value cannot express it.

**2026-09-16 — `getStatistics`' signature changed shape, which decision 7 implied but did not
say.** It was `getStatistics(classId, excludeDates?: string[])` and is now
`getStatistics(classId, params?: GetStatisticsParams)`. Decision 7 promised the *response* shape
was unchanged and that omitted parameters mean unfiltered; both hold. The *client function's*
parameter list is a different thing and it did move, so the one caller (`useAttendanceStatistics`)
moved with it. Three ends in a positional list would have been the alternative, and a third
positional `Date | undefined` is the kind of signature a later caller gets wrong silently.

**2026-09-16 — the queryKey carries serialized days, not `Date` objects.** Decision 11 says the
range "joins the `queryKey`" and stops there. Putting the `Date`s in directly would key the cache
on `Date.toJSON`, which is UTC — so a range picked as 1.9.2026 under UTC+3 would cache under
`2026-08-31` while asking the server for `2026-09-01`. The key now carries `toApiDate`'s output, so
the cache and the request agree about which day a `Date` is. Same bug as decision 10, one layer
over.

**2026-09-16 — the walk found a WCAG contrast failure in `calendar.tsx`, and spec 0008 is only the
messenger.** `day_outside` was `text-muted-foreground opacity-50`, which renders muted foreground
at half opacity over white: **2.25:1**, against a 4.5:1 requirement. An outside day is an *enabled*
button — a past day belonging to the previous month is clickable — so the inactive-control
exemption does not cover it. The `opacity-50` is gone; `text-muted-foreground` alone is a gated
pair (`tokens-contrast.test.ts` pins it on both `background` and `card`), so the distinction stays
and is now under a gate.

**This is pre-existing and not the filter's fault.** `AttendanceTracking` has shipped the same
calendar since before this spec; the popover had simply never been *open* in a swept state, so no
gate had ever looked at it. The fix went into the shared primitive rather than onto this surface,
for the reason `REVIEW-DEBT.md`'s heading-order entry gives about `card.tsx` — and because decision
9 wants both pickers to be one control, so `showOutsideDays={false}` on only the new one would have
made them two. `day_disabled` keeps its `opacity-50` deliberately: a disabled control is exempt
from 1.4.3, which is why axe reported only the outside day.

**2026-09-16 — three races in the new keyboard tests, and two wrong fixes before the right one.**
The walk is configured `retries: 0`, so a flake is a defect rather than something to re-run. All
three were mine, in the test code, not in the app:

1. **No wait for the surface to render.** `page.goto` resolves on the navigation, not on React
   having rendered, so `tabTo` pressed Tab thirty times at an empty page. This was the root cause
   and the last one found.
2. **`evaluateAll` does not auto-wait.** Unlike a locator assertion it returns `[]` for a selector
   matching nothing *yet* — silently. The diagnostic said `saw: ` with an empty list, which is what
   finally pointed at (1).
3. **A focus loop racing a React state update.** `while not focused: press ArrowRight`, re-reading
   `document.activeElement` immediately, reads the *previous* tab, presses again and overshoots —
   and a Radix tab list **wraps**, so overshooting the last tab returns to the first. Now it steps
   with an awaited focus assertion per press.

Worth recording as a method note: the first two attempts chased symptoms (the popover animation,
then the focus loop) because the failure only ever appeared under a full run's load. Reading the
actual assertion message instead of re-theorising is what found it. Stability is now six
consecutive 78/78 full runs, and removing the one wait line reproduces 2–3 failures per run on
demand.

**2026-09-16 — Radix Tabs is a roving tabstop, which AC-16 was written as though it were not.**
The first version of the keyboard helper tabbed *toward* the *Tilastot* tab and failed on all eight
tests with "not reachable by keyboard within 30 Tab presses". That was the test being wrong, not
the app: only the selected tab is in the tab order, per the ARIA authoring practices, so one Tab
reaches the strip and arrows move within it. A test demanding otherwise would have demanded three
tab stops for three tabs, which would itself be the accessibility defect.
