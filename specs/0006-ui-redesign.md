# 0006 — UI redesign ("Läsnä")

Status: ready-for-agent — all four opened questions resolved 2026-09-10; one new question (5) open
Created: 2026-09-10
Branch: `feature/0006-ui-redesign`
Prototype: `prototype/` (branch `prototype/new-ui`) — `index.html` + `DESIGN_SYSTEM.md` are the visual source of truth.

## Problem Statement

The app works, but its interface is the default teal/amber scaffold it shipped with. For the
teacher who uses it (and any colleague she shares it with), the primary loop — open a class,
type a name, log attendance — is functional but visually undifferentiated and slightly dated,
and the login screen reads like a product being sold rather than a private classroom utility.
The teacher wants the tool to feel calm, fast, and legible during and
right after a lesson, and to look like it was designed for her, not for a sales page.

## Solution

Reskin the existing React app with a new, self-consistent design system ("Läsnä"): one confident
indigo accent on quiet neutrals, flat surfaces, generous whitespace, tabular numerals for all
counts, and a persistent sidebar shell. Every screen — auth, the course
dashboard, the class view (attendance logging, student logs, statistics), and settings — adopts
the same tokens and components. The login panel drops the marketing copy for a plain description
of what the app does. Finnish localisation is preserved throughout.

This is a **presentation change, not a rebuild**: component logic, hooks, the `src/api` layer,
routing, and all behaviour stay as they are. What changes is the token layer, the layout shell,
and the styling of the components on top of shadcn/ui + Tailwind.

## User Stories

1. As a teacher, I want the whole app to share one coherent visual style, so that it feels like a finished product rather than a template.
2. As a teacher, I want the login screen to plainly describe what the app does, so that it feels like a personal utility and not a sales pitch.
3. ~~A dark mode I can toggle.~~ **Dropped 2026-09-10** — Owner: no dark mode. See Open Questions 2.
4. ~~The app remembers my light/dark choice.~~ **Dropped 2026-09-10**, with US-3.
5. ~~The app respects my OS light/dark preference on first load.~~ **Dropped 2026-09-10**, with US-3.
6. As a teacher, I want a persistent sidebar listing my courses, so that I can jump between classes without going back to the dashboard.
7. As a teacher, I want my current location highlighted in the navigation, so that I always know which class and tab I'm in.
8. As a teacher, I want the course dashboard to show each class as a clear card with student and attendance counts, so that I can pick the right class at a glance.
9. As a teacher, I want a plain empty state when I have no courses yet, so that I know how to create my first one.
10. As a teacher, I want to create a course from a simple dialog, so that I can start tracking a new group quickly.
11. As a teacher, I want the attendance-logging form to stay the fast path — pick a date, type a name, set a quantity, submit — so that I can log during a lesson without friction.
12. As a teacher, I want name suggestions as I type, showing each student's attendance count, so that I pick the right existing student instead of creating a duplicate.
13. As a teacher, I want to drive the name suggestions from the keyboard (arrow keys, Enter, Escape), so that I never have to reach for the mouse mid-flow.
14. As a teacher, I want a clear signal when my typed name matches no one, so that I understand a new student will be created.
15. As a teacher, I want the student-logs table to show each student's attendance with a visual bar and an exact number, so that I can compare participation at a glance.
16. As a teacher, I want course-credit status shown as a labelled, coloured badge with an icon, so that I can tell credited from uncredited students without relying on colour alone.
17. As a teacher, I want to mark a course credit directly from the table, so that I don't need a separate screen.
18. As a teacher, I want to edit or delete a student from the table with clearly separated actions, so that I don't delete someone by accident.
19. As a teacher, I want a confirmation before a destructive delete that names the student and warns that their attendance history goes with them, so that I delete deliberately.
20. As a teacher, I want to search and page through students, so that a large class stays manageable.
21. As a teacher, I want to reveal or hide legacy students (first attendance over five years old) with a toggle, so that old names don't clutter the list by default.
22. As a teacher, I want the statistics tab to show totals and a day/month bar chart, so that I can see participation trends over time.
23. As a teacher, I want a plain "no data yet" state on statistics before any attendance exists, so that I'm not shown an empty chart frame.
24. As a teacher, I want to change my email and password from a clean settings screen, so that I can keep my account current.
25. As a teacher on a phone, I want the layout to collapse to one column with an off-canvas menu, so that the app is usable on a small screen.
26. As a teacher on a phone, I want no horizontal page scrolling and comfortable tap targets, so that the app doesn't feel cramped or mis-tap.
27. As a teacher using the keyboard, I want a visible focus ring on every control, so that I always know where I am.
28. As a teacher who prefers reduced motion, I want animations to respect that setting, so that the interface doesn't distract or disorient me.
29. As a teacher using a screen reader, I want status, tabs, dialogs, and navigation to announce their state correctly, so that I can operate the app non-visually.
30. As a teacher, I want error and success feedback as unobtrusive toasts that don't steal focus, so that I stay in my flow.
31. As a teacher, I want the not-found and loading states styled like the rest of the app, so that nothing looks broken or half-finished.
32. As the maintainer, I want the new colour pairs proven to meet contrast at build time, so that a future token edit can't silently ship an unreadable combination.
33. As the maintainer, I want the redesign to leave existing behaviour tests passing unchanged, so that I know the reskin didn't break functionality.
34. As a teacher, I want a failed load to tell me the request failed, so that I am never told my courses, students or attendance do not exist when the server merely could not be reached. **Added 2026-09-10** — see Open Questions 5 and `DESIGN.md:118`.

## Implementation Decisions

- **Reskin, not rebuild.** Keep the component logic, the query hooks (`useClasses`,
  `useStudents`, `useAttendance`, `useAuth`), the `src/api` layer, React Router structure, and
  every existing interaction. Only presentation — the theme token layer, the layout shell, and
  component styling — changes.
- **Token layer is the seam of the change.** Re-map the theme's shadcn/ui CSS custom properties
  (the `--background` / `--card` / `--primary` / `--secondary` / `--muted` / `--border` /
  `--input` / `--ring` / `--destructive` family, all HSL) from the current teal/amber values to
  the new indigo system, defined once for light and again for dark. Every component inherits the
  change; almost no component markup needs per-element colour edits. Keep the existing split
  between a divider border and a stronger control-boundary colour (`--input`) so control outlines
  clear WCAG 1.4.11's 3:1 — the current theme already does this deliberately.
- **New palette (from the prototype `DESIGN_SYSTEM.md`; the decision, not decoration).** Primary
  indigo `#5A4FF3` (light) / `#8B83FF` (dark); semantic success/warning/danger/info each with a
  low-saturation "soft" background; neutral surface + ink ramps; the control-boundary token kept
  distinct from the divider. The prototype file carries the full table and both themes; treat it
  as the reference when writing the token values.
- **No dark mode** (Owner, 2026-09-10). No toggle, no persistence, no `prefers-color-scheme`
  read, and nothing sets the `dark` class — `tailwind.config.ts:5` stays `darkMode: ["class"]`
  with no setter, exactly as today. The spec's original premise was wrong: the dark palette is
  **already there and already gated**. `src/index.css:153` holds a complete, independently-defined
  `.dark` block and `tokens-contrast.test.ts` already asserts all ten pairs against both `:root`
  and `.dark`, so dark mode never was a doubling of the token or contrast surface.
  **Therefore `.dark` is re-mapped to the new indigo values alongside `:root`, and stays
  unreachable.** Leaving it teal would point the contrast gate at a palette nobody chose, and
  deleting it breaks that test outright (it throws `no .dark block in index.css`). This is the
  discipline `index.css:150` already commits to in writing: kept in step "so the day a theme
  toggle appears the palette is already honest rather than three years stale".
- **Typography: Fira Sans stays** (Owner, 2026-09-10). No font change, no new woff2 subsetting.
  It is already self-hosted as eight subsets with `unicode-range` and `font-display`
  (`src/index.css:16-95`, `public/fonts/`), and `A11Y-7`'s reflow measurement takes every width
  after `document.fonts.ready` *specifically* so the numbers are Fira's and not `system-ui`'s
  (`DESIGN.md:177`). Swapping the family re-opens all fourteen of those 320px measurements for a
  look, which is the wrong trade here. This spec takes the colour and the layout only.
  Tabular numerals for all counts, table figures and stat values still apply — that is a
  `font-variant-numeric` decision and independent of the family.
- **Layout shell.** Introduce a persistent left sidebar (brand, course list with counts,
  settings, user chip) that collapses to an off-canvas drawer below ~940px, replacing the current
  header-only `TeacherLayout`. Keep breadcrumbs. Current location is marked in the nav.
- **Components restyled to the token set:** buttons (one primary CTA per view), inputs with a
  3px focus ring, cards, segmented tabs, the student table (inline attendance bar + tabular
  count + icon row-actions + pagination), status badges (colour **plus** icon/label), stat cards,
  the autocomplete menu (min 2 chars, keyboard nav, attendance count, explicit "new student"
  empty state), the legacy toggle switch, the create-class and delete-confirm dialogs, toasts
  (non-focus-stealing), course cards with a dashed "new course" affordance and empty state, and
  the auth split-screen.
- **Charts stay on Recharts.** The prototype's pure-CSS bar chart exists only to stay
  dependency-free; the shipped statistics keep the existing Recharts `BarChart`, restyled to the
  new tokens (subtle gridlines, accessible bar colour, tooltip). Day/month toggle preserved.
- **Copy.** The auth aside drops the "in seconds / at a glance / fast" selling for a plain
  description of the app's three functions. All Finnish strings preserved; no English leaks in.
- **Icons stay Lucide**, one consistent stroke weight; no emoji as structural icons.
- **Screens in scope:** Auth, Dashboard, ClassView (attendance / logs / statistics tabs),
  Settings, the 404 and loading states, and the shared shell.

## Testing Decisions

- **What a good test is here.** A reskin must be verified through behaviour and semantics, not
  appearance. Tests assert roles, labels, ARIA state, keyboard operation, and the two things that
  are genuinely visual-but-checkable (contrast pairs and theme state) — never class names, hex
  values, or pixel snapshots, which are brittle and would break on every polish pass.
- **The seam is the existing one:** the `src/api/*` module boundary. Render the page/component
  with the shared `test-utils` providers (QueryClient + Router + AuthProvider) and mock
  `@/api/*`, `useNavigate`, `useToast`, and the query hooks. No test may reach the network —
  `src/test/setup.ts` refuses XHR/fetch and re-throws after the test. This is the highest seam and
  the only one; no new seam is introduced.
- **Prior art to copy:**
  - `src/__tests__/integration/auth-flow.test.tsx` — renders a page, mocks the api seam +
    navigate + toast, drives it with `userEvent`. The pattern for any behaviour test.
  - `src/components/__tests__/surfaces.a11y.test.tsx` — accessibility assertions across surfaces
    with hooks mocked. Extend it to cover the new shell and restyled components.
  - `src/__tests__/tokens-contrast.test.ts` — pins each foreground/background pair to its
    required ratio. **Update it to the new pairs for both `:root` and `.dark`, and keep it a
    gate.** `.dark` stays unreachable but stays asserted; see the no-dark-mode decision above.
- **The browser walk is the other half, and the original spec omitted it.** `e2e/` under
  Playwright (ADR-0005) is the named enforcer for `A11Y-1`, `A11Y-2a`, `A11Y-3` and `A11Y-7`
  (`DESIGN.md:170-177`) and it runs inside `npm run check`, so no slice is green without it. Three
  things follow for this feature:
  - `e2e/states.spec.ts` sweeps fourteen states through axe **with `color-contrast` enabled** at
    320px and 1280px, then measures `documentElement.scrollWidth`. It is the only enforcer that
    can see a composite pair like `bg-primary/10 text-primary`, which the token test's maths
    cannot express. A new palette is proven here or not at all.
  - Its `KNOWN_VIOLATIONS` map is a **shrink-only ratchet** holding the register badge at 3.25:1
    and the 404's link at 3.34:1. Both are closed by this spec (see the palette and 404 items),
    so both rows get deleted. A pair that starts passing while still listed fails the run.
  - The sweep's state list is `DESIGN.md` §3's table. Adding the shell and the error state means
    adding states here — `states.spec.ts:12` warns that "adding a state is a manual act nobody is
    prompted to perform", which is exactly how a state gets designed and never checked.
- **What this feature adds to the suite:**
  - The contrast test re-pinned to the new `:root` **and** `.dark` pairs (AA: 4.5:1 text, 3:1 UI
    boundaries), and both `KNOWN_VIOLATIONS` rows struck from the walk.
  - An error state per read surface, asserted at the `src/api` seam by rejecting the query, and
    added to the walk's swept states as `DESIGN.md` §3's fourth column.
  - The off-canvas nav opens and closes at small width (`useMediaQuery` mocked, as in the a11y
    suite), plus the shell's own swept states in the walk.
  - Existing behaviour tests continue to pass **unchanged** — the proof the reskin didn't alter
    function. Autocomplete keyboard nav, credit toggle, delete confirmation, search/pagination,
    and legacy toggle are behaviour and stay covered.

## Out of Scope

- Any backend, API, schema, or endpoint change. This is frontend presentation only.
- New features or flows: no new statistics, no bulk student edit, no UI for the statistics
  `exclude_dates` (still hard-coded as today), no new settings beyond email/password.
- Changing auth strategy, routing structure, the data model, or the domain rules (INV-1 etc.).
- Swapping the component library — stay on shadcn/ui + Tailwind.
- Shipping anything from the prototype directly: its mock data and CSS bar chart are throwaway.
  The prototype is a reference, not a source to copy files from.
- **Archiving, and `Class.active` generally** — resolved out 2026-09-10 (Open Questions 4).
  Verified rather than assumed: the field reaches the client only as a type (`api/types.ts:15`,
  and `active?: boolean` in `api/classes.ts:12`), no component reads or sets it, and
  `useUpdateClass` / `useDeleteClass` (`hooks/useClasses.ts:31,44`) have no callers anywhere — so
  there is no way to archive, rename or delete a course from the UI at all. The prototype's
  "Arkistoitu" badge is `prototype/index.html:602` over mock data, a state this app has never
  surfaced; **do not copy it.** `DESIGN.md:63` carries the live failure mode (flip `active` in the
  database and logging starts failing with no screen explaining why). Its own spec.
- **`DESIGN.md` §3's three loading decisions** — nothing shows a spinner before 300ms, the frame
  never waits for its data (`/class/:id` still blanks the tabs behind one spinner), and a mutation
  never blanks. Deferred 2026-09-10: the Owner took the error state without them. Deferred, not
  dropped — it owes a `REVIEW-DEBT.md` entry.

## Acceptance Criteria

*(devkit addition — each criterion is falsifiable and names how it's proven. `/verify-live` fills
verdicts.)*

| # | Criterion | Proven by | Serves |
|---|---|---|---|
| AC1 | Every documented foreground/background pair meets AA in **both** `:root` and the unreachable `.dark` | `tokens-contrast.test.ts` (re-pinned) **and** `e2e/states.spec.ts` — axe with `color-contrast` over every swept state, the only enforcer that sees composites like `bg-primary/10` | 16, 32 |
| ~~AC2~~ | ~~Theme toggle flips, persists, honours `prefers-color-scheme`~~ | — | **dropped 2026-09-10** with US-3–5 |
| AC3 | All existing client behaviour tests pass unchanged after the reskin | full `npm run test:run` | 33 |
| AC4 | Autocomplete is fully keyboard-operable and signals "no match → new student" | behaviour test (extends auth-flow pattern) | 12, 13, 14 |
| AC5 | Deleting a student requires a confirmation naming the student and its history loss | behaviour test | 18, 19 |
| AC6 | At **320px** — the Owner's declared floor and WCAG 1.4.10's reflow width, not the spec's original "≤400px": one column, off-canvas nav opens/closes, `documentElement.scrollWidth <= clientWidth` in every swept state | `e2e/states.spec.ts` (`expectNoHorizontalScroll`, already the `A11Y-7` enforcer) + `/verify-live` | 25, 26 |
| AC7 | Every interactive control has a visible focus ring; status uses colour **and** icon/label; reduced-motion respected | `surfaces.a11y.test.tsx` (extended) + `/verify-live` | 16, 27, 28, 29 |
| AC8 | The auth aside contains no sales copy; all UI strings remain Finnish | `/verify-live` (visual read) | 2 |
| AC9 | Statistics render via Recharts with a day/month toggle and a "no data" state | behaviour test + `/verify-live` | 22, 23 |
| AC10 | A failed load on `/dashboard`, *Läsnäolot* and *Tilastot* renders an **error** state and never the empty state | behaviour test per surface (reject the query at the `src/api` seam) + `e2e/states.spec.ts` gains §3's fourth state | 34 |

## Tracer Slices

Thin vertical slices, each shippable and gate-green, blockers first:

1. **The error state, before any restyling** (Owner, 2026-09-10). Give `TeacherDashboard`,
   `StudentLogs` and `ClassStatistics` a real error branch — read `error` from the query, stop
   falling through into empty — and add §3's fourth state to `DESIGN.md`'s table and to the
   walk's sweep. First because a reskin cannot restyle a state that does not exist
   (`DESIGN.md:118`), and because the empty state currently lies about a failure. Behaviour, not
   presentation, so it lands before the palette moves and can be verified against the old look.
2. **Token layer + contrast gate.** Re-map `:root` and `.dark` to indigo, re-pin
   `tokens-contrast.test.ts`, strike both `KNOWN_VIOLATIONS` rows. No toggle. Thinnest
   presentation change: every screen inherits the new look at once. (Blocks 3–7.)
3. **App shell.** Sidebar + course nav + off-canvas drawer + breadcrumbs + active state. Watch
   `expectNoHorizontalScroll` at 1280px — `playwright.config.ts` chose that width because it
   clears the register's `min-w-[34rem]`, and a persistent sidebar eats into the margin.
4. **Auth split-screen** with the de-selled copy — one full screen, top to bottom.
5. **Dashboard** — course cards, counts, empty state, create-class dialog.
6. **ClassView tabs** — attendance form + autocomplete; logs table + badges/actions/pagination/
   legacy toggle; statistics restyled on Recharts.
7. **Settings** — email + password.
8. **Polish + a11y sweep** — Fira Sans confirmed staying (no font work), the 404 translated into
   Finnish and moved onto tokens, extend `surfaces.a11y.test.tsx`, run `/verify-live` across
   AC6–AC10.

## Open Questions

*(Ambiguity is recorded here, not assumed away.)*

All four opened with the spec are **resolved by the Owner, 2026-09-10**. One is newly opened and
blocks the end of slice 1.

1. **Font — RESOLVED: keep Fira Sans.** No font change, no woff2 work; colour and layout only.
   The deciding fact was not cost but `A11Y-7`: all fourteen 320px reflow measurements are taken
   after `document.fonts.ready` so the widths are Fira's, and a family swap re-opens every one of
   them. Plus Jakarta Sans is not rejected on merit — it is deferred, and it is cheap to revisit
   once the layout has settled.
2. **Dark mode — RESOLVED: no.** No toggle, no persistence, no `prefers-color-scheme`. US-3, US-4,
   US-5 and AC2 are struck. The `.dark` block is re-mapped to indigo in step with `:root` and left
   unreachable, because the contrast gate requires it and would otherwise assert a palette nobody
   chose. Full reasoning under *Implementation Decisions*.
3. **Sidebar shell — RESOLVED: adopt the persistent course-list sidebar.** US-6 and US-7 are in.
   Known cost, accepted: it rewrites `DESIGN.md` §1, §2 and §4, adds off-canvas states to the
   walk at both viewports, and narrows the desktop margin the register table relies on (slice 3).
4. **Archived courses — RESOLVED: out.** See *Out of Scope*. There is no archive, rename or delete
   affordance in the UI today, so the prototype's badge would be the first screen for a state
   nothing can set. Its own spec.

5. **Error-state copy — RESOLVED 2026-09-10, approved by the Owner as proposed.** Each surface
   names its own noun, following the twelve `… epäonnistui` strings the app already had:

   | Surface | Message |
   |---|---|
   | `/dashboard` | Kurssien lataaminen epäonnistui |
   | *Läsnäolot* | Opiskelijoiden lataaminen epäonnistui |
   | *Tilastot* | Tilastojen lataaminen epäonnistui |

   Second line on each: **Tarkista verkkoyhteys ja yritä uudelleen.** — following the `Tarkista …`
   habit already in the settings errors. **Retry: yes**, a `Yritä uudelleen` button wired to the
   query's own `refetch`; every hook here returns the raw `useQuery` result, so nothing had to
   change to expose it. `Yritä uudelleen` is a new string — nothing in the app said it before.

   The API's `detail` is deliberately **not** shown: these three fail on transport far more than on
   logic, where the underlying message is empty or English, and AC8 keeps every string Finnish.

## Spec deltas

*(Dated record of where this spec moved after it was written. Diverging is normal; diverging
unrecorded is the defect.)*

- **2026-09-10 — the four open questions answered by the Owner**, in a session that grounded each
  one against the committed code first. Net scope change: US-3, US-4, US-5 and AC2 struck (no dark
  mode); US-34 and AC10 added (the error state); archiving and the three loading decisions pushed
  out of scope; slices renumbered from seven to eight with the error state first.
- **2026-09-10 — the spec's dark-mode premise was wrong and is corrected.** It treated dark mode as
  new work that "roughly doubles the token and testing surface". `src/index.css:153` has held a
  complete `.dark` palette all along and `tokens-contrast.test.ts` has been asserting it in both
  themes; only the toggle was ever missing. The correction is recorded rather than quietly edited
  because it inverts the cost the question was weighed on.
- **2026-09-10 — the spec's Testing Decisions omitted Playwright entirely.** The browser walk
  (ADR-0005) is the enforcer for four of `DESIGN.md`'s nine accessibility rows and runs inside
  `npm run check`; a spec that did not mention it would have had its slices called green by a gate
  set it never named. Added, along with the two `KNOWN_VIOLATIONS` rows this spec closes.
- **2026-09-10 — AC6's width corrected from "≤400px" to 320px.** 400 was in no artifact: 320 is the
  Owner's declared floor, WCAG 1.4.10's reflow width, and the number `A11Y-7` already measures.
- **2026-09-10 — the problem statement's framing is left standing but is not quite right.** It
  calls the current look "the default teal/amber scaffold it shipped with". The teal is
  deliberate: "Variant A, Tilikirja", chosen 2026-09-07 after a `/prototype` run on the real route
  (`src/index.css:96-104`), and it closed seven contrast failures including white-on-cyan at
  2.61:1 on every button in production. Replacing it is the Owner's call; the record should not
  imply nobody picked it.

- **2026-09-11 — slice 3 crosses into the backend, which *Out of Scope* forbade.** The Owner asked
  for the sidebar's course count to be a **Student** count and for it to ride the class request
  rather than a second one, which "Any backend, API, schema, or endpoint change. This is frontend
  presentation only." rules out. Decided by the Owner against that line, so the line is wrong now
  rather than the code: `ClassResponse` gains an optional `student_count`, additive beside
  `attendance_count`. What the change actually cost is smaller than a new endpoint and *negative*
  in query count — `GET /api/classes` was an unmeasured N+1 (one `COUNT` per class in a Python
  loop, 7 statements for 5 classes), so folding both counts into the class query took it to 2,
  flat at 1, 5 and 20 classes. `tests/test_query_budget.py` now holds that ceiling; it was the
  only list endpoint the ratchet never watched.
- **2026-09-11 — `surfaces.a11y.test.tsx` is NOT extended to the shell, against *What this feature
  adds to the suite*.** The browser walk axes the shell in every signed-in state at both
  viewports, with `color-contrast` on, in a real browser; a jsdom pass over the same markup would
  be a strictly weaker second implementation of one check, which is the anti-pattern this project
  spends a section on. What jsdom *can* uniquely prove went into `AppShell.test.tsx` instead —
  open/close, the drawer's accessible name, `aria-current` on the right item, and the failed
  course list not claiming "no courses". Each was watched failing before it was trusted.
- **2026-09-11 — the sweep gained a state whose desktop form is the same state.** *Valikko — the
  navigation, however the width serves it* opens the drawer below 940px and finds the sidebar
  already there above it. The first draft declared it 320-only and skipped it at 1280, which the
  drift gate correctly rejected: a skipped test and a silenced one are indistinguishable to it.
  Sweeping both is also simply stronger.
- **2026-09-11 — slice 4 keeps the aside's lede below 940px, where the prototype hides the aside
  outright.** Decided by the Owner against `prototype/index.html:457`. The prototype's media query
  takes the whole panel away at narrow widths, which leaves a phone with nothing on screen saying
  what the app is — so **US-2 and AC8 would have been desktop-only criteria** without anyone
  writing that down. The compromise costs three lines: the lede survives as muted text above the
  form, the display line and the three function rows do not. `e2e/auth.spec.ts` asserts both
  shapes, one viewport each, because jsdom applies no media query.
- **2026-09-11 — slice 4 is the FOURTH measured departure from the prototype's palette, and the
  first one no gate could have caught.** The aside's gradient runs to `#b06cf0`, where white text
  measures **3.28:1**; the prototype also thins its small print to opacity .85, which took the
  13px feature sub-labels to **2.86:1**. Three of the aside's four text sizes were below AA. The
  third stop is deleted, the opacity is gone, and the surviving endpoint is the prototype's own
  55% stop at 4.92:1. The reason this is a spec delta rather than a bug fix: nothing in the repo
  was capable of noticing. `tokens-contrast.test.ts` needs two solid colours, axe reports contrast
  over a gradient as *incomplete*, and `e2e/assertions.ts:111` keeps only `violations`. The fix is
  therefore structural — the stop is a **token** (`--auth-aside-to`) and the pair is asserted in
  both themes, watched red at 3.28:1 first.
- **2026-09-11 — slice 4 rewrote a prototype string that described a role this app deleted.** The
  registration-code hint read *"Saat koodin koulusi pääkäyttäjältä."* ADR-0003 removed the
  superadmin role; codes are issued from the command line by whoever has database access, so there
  is no pääkäyttäjä to ask. Replaced with the three facts the code actually carries — single-use
  and 24 hours (INV-6, `registration_code_service.py:18`), one email address (INV-7, `:142`) —
  wired to the field with `aria-describedby`. The prototype's `XXXX-XXXX-XXXX` placeholder was
  **not** adopted either: the code is 16 URL-safe characters with no dashes (`:30`). The aside's
  own copy carried a smaller version of the same defect, *"oppilaskohtaisesti"*, against a
  glossary whose word is **opiskelija** (`client/CONTEXT.md:30`).
- **2026-09-11 — the auth aside carries no brand, where the prototype gives it one.** The
  prototype's auth screen has no top bar, so its aside has to introduce the app. The real screen
  keeps `PublicNav`, which already shows the wordmark — a second one on the same page is the "two
  words for one thing" the drift gate exists to catch. The aside opens on its display line instead.
- **2026-09-11 — slice 5 found the dashboard's course cards were not keyboard-reachable at all,
  and that is a fix, not a reskin.** Each card was a `<Card onClick>`, which renders a `div`: no
  role, no tab stop, nothing announced. The one surface whose entire job is choosing a Kurssi was
  mouse-only. `DESIGN.md` §3 had described this state as "the Kurssi list, each card a link" since
  the inventory was written, so the contract was already right and only the markup disagreed — the
  prototype is no help and errs the other way (`index.html:583` is a `<button>` that navigates).
  Now a `Link`, with an explicit `aria-label` for the same name-concatenation defect
  `AppShell.test.tsx` caught in the sidebar. Under *Out of Scope*'s "presentation only" this is a
  **behaviour** change, taken deliberately: shipping a reskin over an unreachable control would
  have restyled a defect.
- **2026-09-11 — the root breadcrumb read "Dashboard", in English, on every signed-in surface.**
  `DESIGN.md` §1 claimed the 404 was the only English in the app; the crumb had been contradicting
  it from `TeacherDashboard.tsx`, `Settings.tsx` and `ClassView.tsx`, all passing the same literal.
  Fixed at all three rather than only the one slice 5 owns — one wrong word shared by three callers
  is one fault, and leaving two of them would have shipped "Kurssit" on the dashboard and
  "Dashboard →" on the two surfaces that link back to it. AC8 covers it.
- **2026-09-11 — slice 5 drops the prototype's dashboard sub-line, badge and per-course icons.**
  The sub-line ("Kolme aktiivista kurssia · 63 oppilasta yhteensä") serves no user story, repeats
  what the cards already say, and is wrong twice — `active`, which *Out of Scope* forbids, and
  *oppilas* where the glossary says **opiskelija** (`opiskelij*` appears 35 times in `src/`,
  `oppila*` zero). The "Aktiivinen"/"Arkistoitu" badge is the `Class.active` surface *Out of Scope*
  already refused. The three per-course icons are mock data dressed as a schema field; one
  `BookOpen`, as the sidebar already uses for the same rows. Recorded so no later slice reads the
  prototype and re-adds them.
- **2026-09-11 — slice 5 found `A11Y-7`'s enforcer blind to every overlay, and closed it.** Not a
  spec change but a gate one, and it belongs here because the criterion it serves is AC6. A
  `min-w-[34rem]` put on `DialogContent` on purpose rendered the create-course dialog **520px wide
  from x=-100 to x=420** at a 320px viewport while `documentElement.scrollWidth` stayed exactly
  **320** — `position: fixed` is out of flow and adds nothing to document overflow, so the state
  swept clean with a third of the dialog unreachable. `expectOverlayWithinViewport` measures the
  box of any open `[role="dialog"]` and runs on every swept state; watched red on that break,
  green on revert. The drawer — the shell's whole navigation below 940px — was never covered
  either, and now is.
- **2026-09-11 — AC4 was not met, and the cause was structural.** US-13 asks for the suggestions to
  be driven with arrow keys, Enter and Escape; only Escape worked. Measured in the browser before
  any change: two ArrowDown presses left the active option at index 0, focus never left the input,
  Enter left the field holding what had been typed, and the input carried no combobox semantics —
  `role`, `aria-expanded`, `aria-controls` and `aria-activedescendant` each null. The list rendered
  as a **sibling** of the input, so the `cmdk` `Command` around it never had focus and never saw a
  key; the branch commented "let dropdown handle arrow navigation" handed off to nothing. cmdk's
  value is client-side filtering and owning its own input, and this field does neither — it filters
  server-side through a 300ms debounce and must submit a form — so cmdk leaves this surface for a
  plain `role="listbox"` the field controls by `aria-activedescendant`. Like slice 5's cards, this
  is a **behaviour** change under *Out of Scope*'s "presentation only", taken for the same reason.
- **2026-09-11 — AC9's "day/month toggle" was decided by the Owner, because no artifact settled
  it.** AC9 named a toggle, `DESIGN.md` §3 said only "daily and monthly aggregates" and was silent
  on the form, and the shipped surface answered US-22's "day/month bar chart" by rendering **both**
  granularities at once: a per-day table, a daily chart card, and a near-identical monthly chart
  card. The Owner's call: **one chart with the toggle, and the per-day table stays** — a chart
  cannot be read to the day, and she reads it to the day. So the second chart is what the toggle
  replaces, not the table. `DESIGN.md` §1 and §3 now carry the toggle and its `Päivät` default, and
  the month view is its own swept state because it draws a different dataset.
- **2026-09-11 — AC5 was built and unenforced, which is not the same as met.** The delete
  confirmation has named the student, counted the records and said it cannot be undone for as long
  as the delete action has existed, but no test opened it. AC5 names "behaviour test" as its
  enforcer and there was none, so nothing held the criterion shut. Five tests now do, watched red
  the only way an already-passing criterion can be: by wiring the row action straight to
  `deleteStudentMutation` and seeing all five fail.
- **2026-09-11 — the tab row overflowed its own pills at 320px, and `A11Y-7` could not see it.**
  `TabsList`'s `grid-cols-3 max-w-3xl` gave each label a ~97px column while "Läsnäolon kirjaus"
  needs ~115px, so the text ran outside its pill and touched the viewport edge. The document never
  scrolled, so the reflow check swept it clean — the same shape as slice 5's overlay finding, one
  layer up: a gate that measures document overflow cannot see content overflowing a box inside it.
  Found by screenshot, which is the only thing that did look. Two columns at 320px (145px per
  label, third pill wrapping) and the prototype's pill row from `sm` up.
- **2026-09-11 — a claim written into a comment, then disproved, recorded so it is not
  re-inherited.** The chart toggle's root carries `role="radiogroup"` over Radix's default `group`,
  and the first version of that comment asserted axe's `aria-required-parent` required it. Deleting
  the line left the whole walk green: axe-core does not treat `radiogroup` as a required context for
  `radio`. The role stays on judgement — a screen reader announcing "1 of 2" rather than two loose
  radios — and the comment, the test and `REVIEW-DEBT.md` all now say that nothing gates it.

## Further Notes

- `prototype/index.html` and `prototype/DESIGN_SYSTEM.md` are the visual reference; §8 of the
  design system doc already sketches the token-mapping migration.
- Build order is the tracer slices above: **the error state first** (a state that does not exist
  cannot be restyled, `DESIGN.md:118`), then the token layer (so the contrast gate is green before
  anything else moves), then the shell, then screen by screen.
- `DESIGN.md` is a deliverable of this spec, not a reference for it. The sidebar rewrites §1, §2
  and §4; the error state fills the "see the hole below" cells in §3's table and retires that
  passage. A reskin that leaves the design contract describing the old shell has produced the
  pseudo-artifact `ANTI-PATTERNS` warns about.
- Respect the existing deliberate token decision: `--input` is intentionally darker than `--border`
  for the 3:1 control-boundary rule. Carry that split into the new palette.
