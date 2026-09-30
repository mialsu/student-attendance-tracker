# Spec 0010 — numbers on the *Tilastot* bars, the chart above the table, and sortable tables

**Status:** shaped 2026-09-30 (`/grilling` → `/to-prd`), eighteen decisions, seven seams.
`ready-for-agent` once the search-fix branch has merged to `main` (decision 17); each open question
is answered before the slice that needs it.
**Weight:** Standard
**Domain dial:** on (project-wide). This spec moves no invariant; `INV-1`, `INV-2` and `INV-9` are
adjacent, see *Invariants touched*.

Modules and functions are named; **line numbers deliberately are not**, per `INVARIANTS.md`.

---

## Problem Statement

The teacher who uses this app daily sent three reports through the Owner on 2026-09-30. The first,
a name search that misses Students as the query grows, was traced the same day to two client
defects and is being fixed on its own branch. The other two are about *Tilastot*, and the Owner
added a third request while they were being shaped.

**She could not find the timeframe filter.** She asked where it was that morning. It was where spec
0008 put it, at the top of the surface; the trouble is what sits between it and the chart it
changes. `ClassStatistics` renders the *Aikaväli* filter, the four totals, the per-day table and
then the chart, so the chart is the last thing on the page. Above it is a table with one row per
day of attendance since November 2025, at about 53 px a row (`ui/table.tsx` pads every cell with
`p-4`). A teacher looking at the chart is a whole table's length below the control that narrows it.

**A screenshot of the chart carries no numbers.** A bar shows its count only in the tooltip, on
hover (`ChartTooltip`). She wants to take a screenshot from which someone else can read how many
attended each day, and today the image holds bars and a Y axis, with no count on any bar.

**Neither table can be re-ordered, and the two are built differently.** The per-day table lists days
oldest first, the order the statistics endpoint returns `daily_stats` in, so the most recent
sessions are at its far end. *Läsnäolot* always lists Students most attendances first, because
`StudentLogs` hardcodes `sort_by: 'attendance_desc'`. The Owner asked for both columns of the
per-day table to sort in both directions, for *Läsnäolot* to sort as well, and for both surfaces to
use one table component. Today *Läsnäolot* uses `DataTable` and *Tilastot* assembles its table from
the raw `Table` primitives.

**The summary endpoint's `sort_by` accepts anything.** It is typed `str`, and
`get_attendance_summary` treats every value other than `attendance_desc` as `name_asc`, so
`sort_by=nmae_desc` answers 200 with an order nobody asked for. Once a teacher chooses the order
from a column header, that fallback becomes a way to show her the wrong order without a word.

## Solution

The chart moves up. *Tilastot* reads filter, four totals, chart, per-day table, so the chart sits
directly under the totals and the filter above it is a short scroll away. The filter keeps its
place above everything it changes.

Every bar carries its count and its date whenever all of them fit. When they do not, the chart
draws as it does today and one line under it says how to get the numbers: "Rajaa lyhyempi
aikaväli nähdäksesi luvut pylväissä."

The per-day table becomes a `DataTable`, newest first, 20 days a page, and either column sorts in
both directions. The browser does that sorting, from the day list the chart has already loaded.
*Läsnäolot* gains the same sortable headers for *Opiskelijan nimi* and *Läsnäolot*, sorted by the
API, and the API refuses a sort key it does not know.

## User Stories

1. As a teacher, I want the chart directly under the four totals, so that the filter and the chart it narrows sit close together.
2. As a teacher, I want the filter to stay above everything it changes, so that I find it where spec 0008 put it.
3. As a teacher, I want every bar to show its count, so that a screenshot of the chart can be read without me there to explain it.
4. As a teacher, I want every bar to show its date, so that a screenshot says which day each count belongs to.
5. As a teacher, I want the month view to carry its counts the same way, so that a screenshot of a term reads per month.
6. As a teacher, I want no numbers at all rather than numbers on some bars, so that I never read an unnumbered bar as missing data.
7. As a teacher, I want to be told how to get the numbers when a range is too long for them, so that a bare chart does not look broken.
8. As a teacher on a phone, I want the same rule on a narrow screen, so that what I screenshot there is either complete or plainly unnumbered.
9. As a teacher, I want the hover tooltip to keep working, so that I can still read a single bar on a chart too long to number.
10. As a teacher, I want the per-day table to open newest first, so that the sessions I check most are at the top.
11. As a teacher, I want to sort the per-day table by date in either direction, so that I can read a term forwards or backwards.
12. As a teacher, I want to sort the per-day table by count in either direction, so that I can find the busiest and the quietest sessions.
13. As a teacher, I want the per-day table paged, so that the page stays short however long the Kurssi runs.
14. As a teacher, I want a new sort or a new timeframe to take me back to the first page, so that I never land on a page that no longer holds what I expect.
15. As a teacher, I want the table and the chart to agree about every day, so that two figures on one screen can never contradict each other.
16. As a teacher, I want both tables to look and behave alike, so that I learn one table rather than two.
17. As a teacher, I want to sort *Läsnäolot* by name in either direction, so that I can find a Student alphabetically.
18. As a teacher, I want to sort *Läsnäolot* by attendance count in either direction, so that I can see who has come least as well as who has come most.
19. As a teacher, I want *Läsnäolot* to open as it does today, most attendances first, so that nothing I rely on moves.
20. As a teacher, I want a search and a sort to combine, so that I can order the Students a search found.
21. As a teacher, I want the sorted column to show its direction, so that I can tell at a glance which way the list runs.
22. As a teacher, I want the sort controls operable from the keyboard, so that I can use them without a mouse.
23. As a teacher using a screen reader, I want the sorted column announced with its direction, so that I know the order without seeing the arrow.
24. As a teacher on a phone, I want the two-column per-day table to fit a 320px screen without scrolling sideways, so that I can read it in one glance.
25. As a teacher, I want the figures to stay on screen while a new timeframe loads, so that the page does not blank and jump each time I pick a date.
26. As a teacher, I want the calendar to close when I pick a day, so that I see the result without dismissing anything first.
27. As a teacher, I want a failed load to say it failed even when figures were already on screen, so that old numbers are never passed off as the new timeframe's.
28. As a maintainer, I want an unknown sort key refused with 422, so that a typo in a client cannot return an order nobody chose.
29. As a maintainer, I want every sort under the query-budget ratchet, so that a sort path that grows a query is caught.
30. As a maintainer, I want the rule for whether counts fit to be one pure function with its own tests, so that it is proven without a browser.
31. As a maintainer, I want the per-day sort and page to be one pure function with its own tests, so that ties and page boundaries are pinned.
32. As a maintainer, I want the API reference to describe the summary endpoint as it is, so that the document the Owner approves API changes against is true.
33. As a maintainer, I want a sort parameter never to reach another Teacher's Students, so that `INV-1` holds on the one route this spec changes.

## Implementation Decisions

The Owner ratified the direction of each decision on 2026-09-30, in the shaping conversation:
numbers on every bar or none, with the hint's copy; the new order; both per-day columns sortable
both ways, newest first; sorting that table in the browser; one shared table component; and
*Läsnäolot* sorted by the API through a closed `sort_by`. The mechanics under each (how the width
is measured, the header's markup, the tie-breaks, where the set is declared, the API reference
rewrite) are the agent's, and the defaults collected under open question 2 are the Owner's to veto
on review.

**1. Scope.** *Tilastot*: the order of the surface, numbered bars, and the per-day table.
*Läsnäolot*: two sortable columns. *Kirjaa läsnäolo* is untouched (open question 4 asks about its
date picker). The name-search defects belong to the fix branch.

**2. The order is filter, four totals, chart, per-day table.** The chart card moves as one unit,
its *Kaavion jakso* toggle with it. The filter keeps spec 0008's place above everything it
changes. The Owner chose this over three alternatives, each rejected for a reason: paging the
table while leaving the chart below it (one page of 20 of today's rows is still about 1,100 px, so
the chart stays a screen below the filter); a sticky filter (about 120 px of permanent screen on a
desktop, more on a phone where the two pickers stack); and the filter inside the chart card (it
also changes the totals and the table, and inside the chart card it reads as a chart-only
control).

**3. Every bar is numbered, or none is.** When the counts fit, `Bar` carries a `LabelList` of
`count` above each bar and the `XAxis` shows every tick (`interval={0}`), so every bar has its count
and its date. When they do not fit, neither is forced: the chart draws as today, Recharts thins the
ticks as it does now, and the hint line renders under the chart. *Päivät* and *Kuukaudet* follow
the same rule. A partial set is refused because a screenshot with every third bar numbered cannot be
read per day either, and an unnumbered bar beside numbered ones reads as missing data. Also
rejected: numbering always and accepting the overlap, and widening the chart past its card so every
bar always has room, which a screenshot would capture only in part.

**4. "Fits" is one pure function of bar count and plot width**, in `src/lib`, which
`.dependency-cruiser.cjs` holds to a pure leaf. The threshold is about 20 px per bar: a two-digit
count in the chart's 12 px text, with a date slanted at -45° under it, needs roughly that before
neighbours collide. It is a default, tuned from element screenshots at 320, 390 and 1280 px (open
question 2). By the layout's arithmetic the plot is about 840 px wide in a 1280 px window (the
16rem sidebar, the main region's padding, the card's padding and Recharts' default 60 px Y axis
subtracted) and about 240 px on a 390 px phone: roughly 40 numbered bars on a desktop and 12 on a
phone. The Kurssi is a weekly workshop (`client/CONTEXT.md`), about one bar a week since November
2025, so the whole course by day should fit a desktop chart today and outgrow it within months; on
a phone it does not fit today.

**5. The width comes from the chart's own container, and nothing renders until it is known.**
Recharts 2.15.4's `ResponsiveContainer` reports its size through `onResize(width, height)`. One
detail to settle in slice 1: `ChartContainer` already wraps its child in a `ResponsiveContainer`,
and `ClassStatistics` nests a second one inside it, so two elements measure the same box today. The
fit rule needs one source of width. **Until a width is measured, neither numbers nor hint render**,
so the first frame does not flash the hint, and jsdom, which measures 0×0, cannot pass for the rule.

**6. The bars do not animate** (`isAnimationActive={false}` on `Bar`), the Owner's decision on
2026-09-30. `Bar` draws its `LabelList` only when its animation is off or finished
(`recharts/lib/cartesian/Bar.js`), and the animation reruns, over 400 ms, on every new dataset and
every new chart size: on load, on a range change, on the *Kaavion jakso* toggle and on a resize.
Left on, every rerun takes the numbers off the chart for 400 ms. It also ignores
`prefers-reduced-motion`: Recharts animates in JavaScript, out of reach of `index.css`'s `reduce`
block, which leaves a gap in `A11Y-6` (client `REVIEW-DEBT.md`, 2026-09-30). Turning it off costs
the bars' grow-in and nothing else. Rejected: keeping the animation and accepting the wait, which
this decision said until 2026-09-30; and animating unless the reader asks for reduced motion,
which closes the `A11Y-6` gap and still takes everyone else's numbers away at every rerun. The
empty full-page capture (client `REVIEW-DEBT.md`, 2026-09-11) came from the animation restarting on
the resize, so a full-page capture should now draw the bars; slice 1 checks that once rather than
assuming it.

**7. The numbers paint in a token pair already gated on `card`**, `foreground` or
`muted-foreground`, and sit above the bar rather than inside it. `tokens-contrast.test.ts` then
covers their contrast whether or not axe evaluates SVG text.

**8. The hint is plain muted text under the chart, inside the chart card.** It is not a live region:
one would announce itself on every range change. The copy is ratified: "Rajaa lyhyempi aikaväli
nähdäksesi luvut pylväissä." It follows the shape of the existing "Kirjaa opiskelijoiden
läsnäoloja nähdäksesi tilastot."

**9. The per-day table is a `DataTable`.** Two columns, *Päivämäärä* and *Läsnäolot*, both
sortable, newest first by default. Defaults for veto: 20 days a page, as on *Läsnäolot*; count ties
break newest first; a new sort or a new range returns to page 1. The table keeps its card, its
title and spec 0008's subtitles ("Kaikki päivät, joilta läsnäoloja on kirjattu" / "Päivät
valitulla aikavälillä"), and takes the register's density (36 px rows, 13 px text). It drops the
register's `min-w-[34rem]`, which exists for the register's five columns; two short ones fit at
320px. `cn` merges through `tailwind-merge`, so a later `min-w-0` overrides the minimum without a
new prop. Newest first reverses the table's order, which today follows the API's oldest-first
`daily_stats`. The chart keeps drawing left to right in date order.

**10. The browser sorts and pages the per-day table, from `daily_stats`.** The chart needs every day
in the range, so the full list is already on the client, and it is small: one row per session. One
pure function in `src/lib` takes the days, the sort and the page, and returns that page and the
total. Rejected: a `GET /api/classes/{id}/attendance/daily` endpoint taking `sort_by`, `skip` and
`limit`. It would add a second request on load and on every range change, compute the same per-day
counts twice, and leave two caches to refresh together after every logged attendance, while saving
no payload, because the chart downloads every day anyway. It becomes the right design if the table
ever shows data the chart does not load (per-day rows that open to list the Students, say), if the
day list outgrows loading whole, or if another client needs sorted pages from the API.

**11. `DataTable` gains sortable headers and never learns where sorting happens.** A column opts
in. The table takes a controlled sort (a column and a direction) and reports a header press through
a callback: *Läsnäolot* hands that press to the API, *Tilastot* to the pure function. Pressing the
sorted column reverses it; pressing another sorts that one in its first direction (a default for
veto: dates newest first, counts largest first, names A to Ö). The header is a `<button>` inside
the `<th>`, named by the header's own visible text. The sorted column's `<th>` carries `aria-sort`
(`ascending` or `descending`), following the ARIA authoring practices' sortable table, and the
direction shows as an arrow icon marked `aria-hidden`, so `A11Y-5` holds without relying on colour.
**`DataTable` writes its header row three times**, once each in its loading, empty and data
branches. The sortable header goes into one renderer the three share, or it would vanish from two
of the states.

**12. *Läsnäolot* sorts by *Opiskelijan nimi* and *Läsnäolot*, on the server.** `StudentLogs` owns
the sort and passes it as `sort_by` to `useAttendanceSummary`. The default stays `attendance_desc`,
so the page opens as it does today. A new sort returns to page 1 and keeps the search. *Suoritus*
stays unsortable: she ticks that column rather than scans it. The sort lives in the component and
resets on reload, as spec 0008's range does (its decision 11). The list stays paged on the server
because each row carries every attendance record its Student has.

**13. `sort_by` becomes a closed set of four:** `attendance_desc` (the default, unchanged),
`attendance_asc`, `name_asc` and `name_desc`. Anything else is a 422, where today it silently
becomes `name_asc`. The set is declared once in `app/schemas`, which import-linter keeps a leaf that
both the route and the service may import. Attendance sorts break ties by name ascending, as
`attendance_desc` already does. Name sorts have no ties to break, because `INV-2` makes a name
unique, case-insensitively, within its Class. Pagination still applies after the sort. The client's
`GetSummaryParams.sort_by` widens to the same four values.

**14. Name order is whatever the database collation says, and nothing configures one.** Production
and the disposable test database both run `postgres:17-alpine`, and no compose file, script or
migration sets a locale or a `COLLATE`. Open question 3.

**15. A range change on *Tilastot* keeps the figures on screen**, following the rule the Owner
chose for *Läsnäolot*'s search (keep the old rows). The details are defaults for veto.
`useAttendanceStatistics` keeps the previous range's figures while the next range loads; past
300 ms they fade (`DESIGN.md` §3: nothing shows a spinner before 300 ms); the filter stays
mounted. Today a range the cache has not seen puts the surface into its loading branch, which
renders no filter at all. That unmount is also the only reason the calendar closes after a pick,
so today it closes on a range the cache has not seen and stays open on one it has. **Each end's
calendar now closes on pick, explicitly.** A failed request still renders the error state, which
is checked first as spec 0008's AC-13 requires; the previous range's figures are never left on
screen as though they answered the new one.

**16. The chart and the per-day table read the same `daily_stats`,** so they cannot disagree about
a day, even in the moment after an attendance is logged.

**17. This spec builds on the search-fix branch.** That branch puts the keep-old-rows behaviour
into `DataTable`: the previous rows stay until the next ones arrive, and fade past 300 ms. If it
lands anywhere else, slice 3 moves it into `DataTable` first. Decisions 12 and 15 reuse it for
sorting and for range changes. Implementation starts once that branch has merged to `main`.

**18. `api/docs/API_REFERENCE.md`'s summary section is rewritten**, which follows from decision 13
rather than being a separate request. The section documents a response that no longer exists
(`student_first_name` and `student_last_name`, an unpaginated list, "sorted by last name, then
first name") and none of `search`, `skip`, `limit`, `sort_by` or `legacy`. `CLAUDE.md` names that
file as the API structure the Owner approves changes against, so the new 422 lands in it.

## Testing Decisions

A good test here asserts what a caller or a reader observes: the order a request returns, the
status of a refused one, the rows on screen, the `aria-sort` a screen reader reads, the query
string that leaves the client, the labels a browser draws. None of them reach into how a sort is
built.

**Seven seams, six of them already in use.**

| Seam | What it proves | Prior art |
|---|---|---|
| **API route**, `tests/test_attendance.py` | each `sort_by` value orders as named, ties included; 422 for any other value; the default unchanged; sort before page; search and sort together | `test_summary_sorted_by_attendance`, `test_summary_sorted_by_name` |
| **Query budget**, `tests/test_query_budget.py` | the summary stays within `BUDGET_SUMMARY` under all four sorts | the `summary` row already in its parametrize list |
| **Client `src/api`**, `src/api/__tests__/attendance.test.ts` | `getSummary` sends each sort key as `sort_by` | the `getStatistics` tests spec 0008 put in that file |
| **Pure functions**, tests beside the two new `src/lib` modules | the fit rule's boundary, and that an unmeasured width means no; the per-day sort in all four directions, the tie-break, page boundaries and the last partial page | `src/hooks/__tests__/useDebounce.test.ts`, a small unit under vitest |
| **Component**, a new test for `DataTable` | the header contract: button, name, `aria-sort`, reversal, first direction, one header in all three branches | none: `surfaces.a11y.test.tsx` reaches `DataTable` only through `StudentLogs` |
| **Client hook**, `ClassStatistics.test.tsx` and the `StudentLogs.*.test.tsx` files | the section order; the per-day table's paging, sorting and page reset; `sort_by` reaching `useAttendanceSummary`; figures kept across a range change; the error state after a failed one | the same files; `ClassStatistics.test.tsx` already mocks the hook as a function of the range |
| **Browser walk**, `e2e/states.spec.ts`, `e2e/timeframe.spec.ts` and `e2e/motion.spec.ts` | numbered bars drawn, by day and by month; none plus the hint on a long range; bars drawn with their numbers in the same frame, not animated; the sorted tables through axe and 320px reflow; the calendar closing on pick | the `STATES[]` table, which already sweeps both granularities; `motion.spec.ts`'s `reduce` / `no-preference` pair |

**Why a pure function for "fits".** Recharts measures 0×0 in jsdom, as `ClassStatistics.test.tsx`
documents, so no hook-seam test can reach the rule. The function carries the arithmetic; the walk
proves the page calls it with a real width.

**The walk needs a long fixture.** `STATISTICS` in `e2e/rows.ts` holds four days and one month,
which fit at both viewports, so the two existing *Tilastot* states become the numbered states and
assert that the label count equals the bar count, and the tick count equals it too. A new fixture
of about ninety days drives the hint state and the per-day table's pager.

**One `KNOWN_VIOLATIONS` row is expected to go.** The walk's only exemption is
`'reflow-320 · Läsnäolot — empty, no Students yet': ['scrollable-region-focusable']`: at 320px the
empty register scrolls inside `min-w-[34rem]` and holds nothing focusable. Sort buttons in its
header give that scroll container focusable content, so the rule should stop firing. The ratchet
is shrink-only in both directions and will fail with "Saw: nothing" until the row is deleted,
which is the gate doing its job; the row's entry in `client/REVIEW-DEBT.md` closes with it.
Slice 3's walk run is what confirms it; until then it is a prediction.

**Screenshots are element screenshots.** `/verify-live` judges legibility and tunes the threshold
from element screenshots of `.recharts-surface`, which frame the chart alone. A full-page capture
used to resize the viewport, restart the grow animation and show an empty plot (client
`REVIEW-DEBT.md`, 2026-09-11); with decision 6 it should not, and slice 1's verification takes one
to find out.

**Plant the failures.** Each new assertion is watched red before it is trusted: the 422 test
against today's silent fallback, each sort test against a swapped direction, the budget rows
against a planted query, the label-count assertion against a partial set, the no-animation check
against the animation turned back on, and the page-reset test against a table that keeps its page.

## Acceptance Criteria

Verdicts are filled by `/verify-live`, per criterion. A task's verdict is the **worst** of them.

| # | Criterion | Proven by | Serves | Verdict |
|---|---|---|---|---|
| AC-1 | In every state that renders figures, *Tilastot* reads filter, four totals, chart, per-day table, in that DOM order | `test:` hook seam | US-1, US-2 | pending |
| AC-2 | The fit function answers yes exactly when every bar gets the threshold width, and no for an unmeasured width of 0; watched failing against an off-by-one at the boundary | `test:` unit | US-6, US-30 | pending |
| AC-3 | When the counts fit, the walk finds as many count labels and as many date ticks as bars, by day and by month, at both viewports | `test:` e2e | US-3, US-4, US-5, US-8 | pending |
| AC-4 | On the long fixture, the walk finds no count labels and the hint line under the chart, at both viewports | `test:` e2e | US-6, US-7, US-8 | pending |
| AC-5 | Before the chart has a measured width, neither the numbers nor the hint render | `test:` hook seam | US-6 | pending |
| AC-6 | Element screenshots at 320, 390 and 1280 px show every number legible and the tallest bar's number unclipped; the threshold is set from them; the tooltip still answers on hover | `live:` | US-3, US-8, US-9 | pending |
| AC-7 | The numbers paint in a `card` pair `tokens-contrast.test.ts` already asserts | `test:` token pairs + review | US-3 | pending |
| AC-8 | Each of the four `sort_by` values orders the summary as named, attendance ties broken by name ascending, with `skip` and `limit` applied after the sort and a search applied before it | `test:` route | US-17, US-18, US-20 | pending |
| AC-9 | Any other `sort_by` returns 422; watched failing against today's fallback to `name_asc` | `test:` route | US-28 | pending |
| AC-10 | The summary stays within `BUDGET_SUMMARY` under all four sort values | `test:` query budget | US-29 | pending |
| AC-11 | `tests/test_authorization.py` stays green and untouched: no route is added, and `verify_class_ownership` stays `get_attendance_summary`'s first act | `test:` authorization | US-33 | pending |
| AC-12 | A sortable header is a button inside its `th`, named by the visible header text; only the sorted column's `th` carries `aria-sort`, and its direction also shows as an icon | `test:` component + axe in the walk | US-21, US-23 | pending |
| AC-13 | The header renders the same in `DataTable`'s loading, empty and data branches | `test:` component | US-16 | pending |
| AC-14 | Tab reaches every sort button, and Enter or Space presses it, on both tables | `test:` component (keyboard) | US-22 | pending |
| AC-15 | Pressing *Opiskelijan nimi* requests `name_asc`, pressing it again `name_desc`; pressing *Läsnäolot* then requests `attendance_desc` and again `attendance_asc` | `test:` hook seam + src/api | US-17, US-18 | pending |
| AC-16 | A new sort on *Läsnäolot* returns to page 1 and keeps the search term | `test:` hook seam | US-14, US-20 | pending |
| AC-17 | *Läsnäolot* opens requesting `attendance_desc`, with the *Läsnäolot* header marked descending | `test:` hook seam | US-19 | pending |
| AC-18 | The `reflow-320 · Läsnäolot — empty` row is gone from `KNOWN_VIOLATIONS` and the walk passes without it | `test:` e2e | US-22 | pending |
| AC-19 | The per-day table is a `DataTable`, opens newest first, shows 20 days a page and offers the pager past 20 | `test:` hook seam | US-10, US-13, US-16 | pending |
| AC-20 | Either per-day column sorts both ways, count ties break newest first, and a new sort or a new range returns to page 1 | `test:` unit + hook seam | US-11, US-12, US-14, US-31 | pending |
| AC-21 | At 320px the per-day table's own box does not scroll sideways, and neither does the page | `test:` e2e | US-24 | pending |
| AC-22 | For a given range, the per-day table and the chart list the same days with the same counts | `test:` hook seam | US-15 | pending |
| AC-23 | A range change leaves the previous figures and the filter on screen until the new figures arrive; past 300 ms they fade | `test:` hook seam + `live:` for the timing | US-25 | pending |
| AC-24 | Picking a day closes that end's calendar, for a range the cache has seen and for one it has not | `test:` e2e | US-26 | pending |
| AC-25 | A failed range change renders the error state, and none of the previous range's figures | `test:` hook seam | US-27 | pending |
| AC-26 | `API_REFERENCE.md`'s summary section documents the route as built: its parameters, the four sort values, the 422 and the paginated response | review, at `/code-review` | US-32 | pending |
| AC-27 | The bars do not animate: the first frame that holds the bars holds every count label, under `no-preference` as well as `reduce`; watched failing with the animation turned back on | `test:` e2e, in `e2e/motion.spec.ts` | US-3, US-6 | pending |

**Invariants touched:** `INV-1`, which does not move. No route is added, and
`verify_class_ownership` stays `get_attendance_summary`'s first act, so a sort key cannot reach
another Teacher's Students. A malformed `sort_by` is refused with 422 before ownership is checked,
which reveals nothing: the answer depends on the query string alone, the same for every class id
that exists or does not, as an out-of-range `limit` already is today. No `teacher_id` comparison
is added, so `drift-extra.sh` check 4 stays satisfied. The per-day table's sorting needs no route
at all.

`INV-2` does work here: it is why a name sort has no ties to break. `INV-9` is adjacent and holds.
The four sort keys are fixed strings, and the request context every log line carries holds the
path without its query string (`app/api/handlers.py` names the rule, ADR-0007 the reason), so a
refused `sort_by` adds nothing that could carry a Student's name to a log line.

## Tracer Slices

Each cuts to something observable and is demoable alone. Blocking order.

1. **The chart moves up and numbers its bars.** Decisions 2–8. The reorder, the fit function and
   its tests, the `LabelList` and the ticks, the hint, one source of width, the bars' animation
   off; the two existing *Tilastot* walk states assert numbered bars and a long-fixture state
   sweeps the hint; `DESIGN.md` §1's and §3's *Tilastot* rows, and §5's `A11Y-6` row without its
   chart clause. Client only. Demoable: one month by day on a desktop, then the whole Kurssi on a
   phone. AC-1 – AC-7 and AC-27.
2. **The API sorts four ways and refuses a fifth.** Decisions 13, 14 and 18. The closed set, the
   `ORDER BY` for each, the route tests, the budget rows, the collation measurement for open
   question 3, and the API reference. Demoable with `curl`. The deployed client keeps sending
   `attendance_desc`, which stays valid, so this slice deploys alone. AC-8 – AC-11, AC-26.
3. **`DataTable` sorts, and *Läsnäolot* uses it.** Decisions 11 and 12. The header contract and
   its single renderer, `StudentLogs`' sort, the widened `sort_by` type, a sorted-register walk
   state, the `KNOWN_VIOLATIONS` row, and `DESIGN.md` §3's *Läsnäolot* row and §4's `DataTable`
   entry (used by *Läsnäolot* and *Tilastot*, sortable headers). Needs slice 2 deployed and open
   question 1 answered. AC-12 – AC-18.
4. **The per-day table joins `DataTable`, and a range change keeps its figures.** Decisions 9, 10,
   15 and 16. The sort-and-page function and its tests, the table swap, the range-change rule, the
   calendar closing on pick, and a walk state holding a sorted per-day table on its second page.
   Needs slice 3. AC-19 – AC-25.

Slice 2 is the only one that changes the API, and the only change a current client can observe is
the 422 for a value no client sends. Slices 1, 3 and 4 touch the client only.

## Out of Scope

- **The two name-search defects**: the autocomplete answering from a stale cache, and
  *Läsnäolot*'s search box losing focus on every search. The fix branch owns both.
- **Sorting by *Suoritus*.**
- **A timeframe on *Läsnäolot*.**
- **The `/daily` endpoint.** Decision 10 names the conditions under which it becomes right.
- **Persisting a sort**, in the URL or in `localStorage`, for spec 0008 decision 11's reasons.
- **Naming the timeframe or the Kurssi in the chart card for screenshots.** Nobody asked for it,
  and with the chart moved up, the filter directly above it carries the dates.
- **`client/index.html`'s `<html lang="en">`.** Found while shaping: an all-Finnish UI declares
  English, so a screen reader pronounces every Finnish string by English rules. A whole-app
  `A11Y-9` defect, recorded nowhere yet; it goes to `client/REVIEW-DEBT.md` when slice 3 lands.
  **Fixed in #16, before this spec's build** — see *Spec Deltas*.
- **The hardcoded `excludeDates = ['2026-02-27']`**, untouched here as in spec 0008.

## Non-Goals

- An export or a report. The screenshot is the teacher's own tool; this spec makes the screen
  worth screenshotting and produces no file.
- Sorting *Läsnäolot* in the browser. Its rows carry every attendance record a Student has, which
  is why that list pages on the server.
- Any change to what is counted or to which day a record belongs to. Spec 0009 owns the day.

## Open Questions

1. **The sort headers' Finnish accessible text.** Drafts by the agent, for the Owner to ratify or
   rewrite before slice 3 lands.
   - Each sort button is named by its column's visible text, unchanged: *Päivämäärä*,
     *Läsnäolot*, *Opiskelijan nimi*. No `aria-label`, so the spoken name is exactly the printed
     one (WCAG 2.5.3).
   - The sorted column's state is carried by `aria-sort`, which a screen reader voices in its own
     language.
   - Each sortable table gains a visually hidden caption, after the ARIA authoring practices'
     sortable-table example: "Läsnäolot päivittäin. Järjestystä voi vaihtaa sarakkeiden
     otsikoista." and "Opiskelijoiden läsnäolot. Järjestystä voi vaihtaa sarakkeiden otsikoista."
     These would be the first `sr-only` strings in app code; `DESIGN.md` §6 counts none today.
     **Wrong when written: app code has carried one since #12, *Avaa valikko* in
     `TeacherLayout.tsx`.**
   - `client/index.html` declares `lang="en"`, so a screen reader reads these strings, like every
     Finnish string in the app, by English rules. See *Out of Scope*. **No longer true: #16
     declares `lang="fi"`.**

2. **The defaults, for the Owner to veto on review.** None of these was put to the Owner as a
   question; each is the agent's reading of a decision that was.
   - 20 days a page on the per-day table, as `StudentLogs`' `ITEMS_PER_PAGE`.
   - Count ties on the per-day table break newest first.
   - A new sort or a new range returns to page 1, on both tables.
   - The first press on an unsorted column: dates newest first, counts largest first, names A to Ö.
   - A range change keeps the previous figures, fades them past 300 ms, keeps the filter mounted
     and closes the calendar on pick (decision 15).
   - About 20 px per bar as the fit threshold, tuned from element screenshots at 320, 390 and
     1280 px. **Confirmed 2026-09-30:** 20 px to start; slice 1's screenshots may move it, and its
     verification records the move.
   - The module sketch (two pure functions in `src/lib`, the sortable header inside `DataTable`)
     and the test plan above. The skill that wrote this spec asks for both to be confirmed rather
     than assumed. **Slice 1's half confirmed 2026-09-30:** the fit rule as one pure function in
     `src/lib`, and slice 1's test plan, AC-1 – AC-7 and AC-27. The sort-and-page function, the
     sortable header and the other slices' tests stay open.

3. **Which alphabet does a name sort follow?** Nothing in the repo sets a collation, and both
   databases run `postgres:17-alpine`. If its musl libc compares strings byte by byte, names
   starting Å, Ä or Ö land after Z as the Finnish alphabet has them, but in the order Ä, Å, Ö
   where Finnish reads Å, Ä, Ö. Slice 2 measures it on the test database (`datcollate` in
   `pg_database`, and an ordered probe of such names) before anyone claims either answer. The
   Owner then chooses between the measured order and pinning a Finnish collation on the name sort,
   which depends on the image carrying ICU.

4. **Should *Kirjaa läsnäolo*'s date picker close on pick too?** Spec 0008 decision 9 made the two
   pickers one idiom. Decision 15 makes the *Tilastot* ends close on pick, while
   `AttendanceTracking`'s picker stays open after a pick today, because nothing unmounts it.
   Leaving it splits the idiom; changing it touches a surface this spec otherwise leaves alone.
   Recommendation: both close on pick.

5. **Should slice 3 make the pager keyboard-operable?** `DataTable` renders every page control as
   `PaginationLink`, an `<a>` with an `onClick` and no `href`, so Tab never reaches it and a
   keyboard user cannot leave page 1 (`A11Y-1`). Found by #16 and recorded in its
   `client/REVIEW-DEBT.md` entry. Slice 3 rebuilds `DataTable`'s controls and slice 4 puts the same
   pager under the per-day table. Recommendation: yes, as buttons, with a keyboard walk over both
   tables' pagers.

## Verification status

Nothing built yet.

## Spec Deltas

*(Dated entries, added as the build teaches us the spec was wrong. Diverging is normal; diverging
unrecorded is the defect.)*

**2026-09-30 — `lang="en"` was fixed in #16, before this spec's build.** #16 declares
`lang="fi"` and translated `src/components/ui/**`, the pager's visible "Previous" / "Next"
included, with `src/__tests__/document-language.test.tsx` as `A11Y-9`'s enforcer. The *Out of
Scope* bullet and open question 1's last bullet are marked rather than deleted. #16 also found the
pager mouse-only, which this spec's slices 3 and 4 would otherwise build on: open question 5.

**2026-09-30 — two claims about `DESIGN.md` were wrong when written, found on resuming.** Slice 1
named §2's *Tilastot* row, and §2 holds the flows, none of them on *Tilastot*. The row that lists
the surface's order is §1's inventory row, so slice 1 changes §1's and §3's rows; corrected in
place. Open question 1 called its two captions the first `sr-only` strings in app code, after §6's
"App code contains **no** `sr-only` text at all", and app code has carried one since #12: *Avaa
valikko* in `TeacherLayout.tsx`. That bullet is marked, and §6 is corrected.

**2026-09-30 — decision 6 reversed: the bars no longer animate.** It had accepted the numbers
appearing only after Recharts' grow animation. Traced on resuming, the animation reruns on every
range change, *Kaavion jakso* toggle and resize, taking the numbers off each time, and it ignores
`prefers-reduced-motion`, a gap in `A11Y-6`. The Owner chose `isAnimationActive={false}` over
keeping it and over animating only without reduced motion. AC-27 is new and joins slice 1, and the
two *Testing Decisions* paragraphs that leaned on the animation are updated.
