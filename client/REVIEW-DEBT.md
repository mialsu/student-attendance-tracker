# REVIEW-DEBT.md — client-app

The standing ledger of everything the green tests do NOT prove. Written at the moment a corner is
cut (`/confess`), read first by any architecture or review session, dispositioned by the Owner
(fixed / accepted-with-reason / promoted-to-issue).

<!-- Newest first. -->

## 2026-09-07 — the browser walk proves the screen, not the integration
- **What:** `e2e/` mocks `/api/*` at the browser boundary, so nothing in the walk exercises the real
  API, the database, or the two together from a browser. Forty green tests say the screens behave
  correctly *given the responses the fixtures invent*.
- **Where:** `client/e2e/fixtures.ts`, and ADR-0005's *Consequences*, which names this and points
  here.
- **What green tests do NOT prove here:** that the API answers the shapes the fixtures claim. The
  fixtures are typed against `src/api/types.ts`, so a **client-side** contract change turns
  `typecheck:e2e` red — but `src/api/types.ts` is hand-written and can itself be wrong about the
  server, which the entry above about `AttendanceRecord` demonstrates. The backend's own 346 tests
  own that tier; nothing joins the two.
- **Disposition:** accepted, with the revival condition stated in ADR-0005: the full stack in the
  CI job — a `postgres:17-alpine` service plus uvicorn plus the built client, which `backend.yml`
  already runs for pytest — was the strongest rejected alternative, and it comes back the day the
  walk needs to assert something only a real API can produce. It was rejected on coupling: the two
  workflows are deliberately independent on separate path filters, and this would make a
  frontend-only change need a Python toolchain, alembic and a seeded database to go green.

## 2026-09-07 — the sweep covers three states per surface, because the fourth would lock in a bug
- **What:** `DESIGN.md` §3 lists four states — empty, loading, refused, success. The walk sweeps
  **three**. The error state is one mocked 500 away and is deliberately absent.
- **Where:** `client/e2e/states.spec.ts`, and the hole itself at `StudentLogs.tsx:120`,
  `TeacherDashboard.tsx:19`, `ClassStatistics.tsx:27` — all three destructure `data` and
  `isLoading` and never consult `error`.
- **What green tests do NOT prove here:** anything about what a teacher sees when a request fails.
  All three read surfaces render a **failed** request as the **empty** state: the dashboard tells a
  teacher who owns a Kurssi that she has none and invites her to create one; *Läsnäolot* says "no
  Students yet" about a register that has thirty; *Tilastot* tells someone with two hundred records
  to go and record some attendance. Each sentence is false and actionable in the wrong direction,
  which is worse than an error message.
- **Disposition:** open, and this entry is the *reason* the state is missing rather than an excuse
  for it. Asserting the empty copy on an error would make the walk defend the defect. Fixing the
  three components turns three states per surface into four, the sweep gains a row per read
  surface, and the walk then holds the fix. `DESIGN.md` §3 has called it "one bug in three places"
  since it was written.

## 2026-09-07 — the e2e typecheck is stricter than the app it tests, which buys less than it looks
- **What:** `tsconfig.e2e.json` runs `strict` and `noUncheckedIndexedAccess` over `e2e/` and
  `playwright.config.ts`. The app's own project runs `strict: false` and `strictNullChecks: false`.
- **Where:** `client/tsconfig.e2e.json` vs `client/tsconfig.app.json`, and ADR-0005's
  *Consequences*, which records the same caveat.
- **What green tests do NOT prove here:** that the walk's calls into app types are sound in the way
  the same file would be in a strict repo. The strictness applies to the walk's own code, and it
  earns its keep there — it caught `MonthlyStatistic.year_month` being written as `month`, and an
  unguarded `split('?')[0]` in `src/api/client.ts`. But the types it checks against were declared
  under `strict: false`, so a nullable field the app models as non-nullable is invisible to it.
- **Disposition:** accepted. The app's four typecheck findings are ratcheted at baseline 4 and
  raising its strictness is a separate piece of work with its own baseline; the e2e project is held
  to the rules the app cannot meet yet rather than lowered to match it.

## 2026-09-07 — AttendanceRecord requires two fields the server no longer sends
- **What:** `src/api/types.ts` declares `student_first_name: string` and `student_last_name: string`
  as **required** on `AttendanceRecord`, marked `DEPRECATED: Keep for backward compatibility during
  migration`. The migration is done — the API sends a `student` object and a `student_name` — so
  any code reading either field gets `undefined` while TypeScript promises a `string`.
- **Where:** `src/api/types.ts`. Found while typing the browser walk's fixtures against the app's
  own interfaces: a truthful mock cannot supply them, and `scripts/drift-extra.sh` bans the
  identifiers outright, so `e2e/fixtures.ts` types its response as a `Pick` of the fields the
  server actually sends.
- **What green tests do NOT prove here:** nothing reads those fields today — `grep` finds them only
  in the type declaration and in `BACKLOG.html`, which is exempt from the drift gate precisely
  because its job is to name them. So this is a latent type lie, not a live break. It becomes one
  the moment someone trusts the type.
- **Disposition:** open. The fix is to delete both fields, which the drift gate will then keep
  deleted. Not done here because it is a contract change in a shared type and this session's
  subject was the walk.

## 2026-09-07 — the browser walk's CI job has never run
- **What:** `frontend.yml` gained a `Browser walk` job that `deploy` needs. The YAML parses, the
  job graph resolves to gates → walk → deploy, and `npm run e2e` is exactly the command the job
  runs and passes locally 40/40 — but the job itself has never executed on a runner.
- **Where:** `.github/workflows/frontend.yml`
- **What green tests do NOT prove here:** that Chromium installs on the runner, that
  `--with-deps` has the packages it needs on `ubuntu-latest`, that a 320px viewport renders the
  same there as here, or that the artifact upload paths exist when a walk fails. This is the same
  class of unproven as the deploy jobs, which `CLAUDE.md` already flags: exercising it means
  running it.
- **Disposition:** open until the next push to `main` under `client/**`, or a deliberate
  `workflow_dispatch`. Watch the first run.

## 2026-09-07 — two rendered contrast failures the browser walk found, and the token test cannot see
- **What:** the Playwright sweep runs axe with `color-contrast` **enabled** over real screens, and
  two failures stand after the plumbing ones were fixed:
  1. **The register's badge.** `Badge variant="default"` is `bg-primary/10 text-primary`, which
     paints `#0d968b` on `#e7f5f3` = **3.25:1** where WCAG 1.4.3 wants 4.5:1. It appears at both
     viewports, on the register — the surface the teacher reads most.
  2. **The 404.** `text-blue-500` on `bg-gray-100` = **3.34:1**, at both viewports.
- **Where:** `src/components/ui/badge.tsx` (the `default` and `destructive` variants),
  `src/pages/NotFound.tsx`. Listed in `e2e/states.spec.ts`'s `KNOWN_VIOLATIONS`, which is
  shrink-only in both directions: fixing either one turns the sweep red and names the row to delete.
- **What green tests do NOT prove here:** `src/__tests__/tokens-contrast.test.ts` is green and
  always was. Its `PAIRS` asserts `primary-foreground` on `primary` — white on solid teal, the
  Button — and it has **no way to express a 10%-alpha composite over a Card**, because its maths
  takes two solid HSL tokens. So the badge variant this app paints on every register row was never
  covered, and `destructive` has the identical shape and will surface the day a destructive badge
  renders in a swept state. The token test proves the palette; only a browser can prove the screen,
  which is ADR-0005's whole argument, now with numbers.
- **And a third row, which is two of this repo's gates disagreeing.** axe's
  `scrollable-region-focusable` fires on the register's scroll container in the **empty** state at
  **320px only** — the one state where the table still spans `min-w-[34rem]` and holds nothing
  focusable, so a keyboard user has no way to scroll it. `tabIndex={0}` on
  `src/components/ui/table.tsx` fixes it and immediately trips
  `jsx-a11y/no-noninteractive-tabindex`, breaking the lint ratchet at 17 against a baseline of 16.
  It was applied, watched break the other gate, and reverted. Satisfying both honestly means
  giving `ui/table.tsx` and `ui/data-table.tsx` an `aria-label` API and adding `region` to that
  lint rule's `roles` option — a design decision about two shared primitives, for a defect whose
  only victim is a keyboard user sideways-scrolling an *empty* table. Listed in
  `KNOWN_VIOLATIONS` under the `reflow-320` key alone, because at 1280px there is nothing to
  scroll and therefore nothing to report.
- **Disposition:** open, and deliberately **not** fixed here. Both are decisions the Owner owns:
  the badge is a palette change (`DESIGN.md` delegates the look to `frontend-design`, and the
  token values live in `src/index.css`), and the 404 needs tokenizing *and* translating — it is
  the only untokenized, English surface in the app, which `DESIGN.md` §1 already records. The
  three defects that were pure plumbing — two missing accessible names and one keyboard-unreachable
  scroll region — were fixed in the same commit instead of listed.

## 2026-09-07 — the sweep measured contrast mid-animation before it was told not to
- **What:** the first run of the state sweep reported `color-contrast` on `/settings`'s inactive
  tab trigger at **4.43:1** against a 4.5:1 requirement — at 320px and not at 1280px. A
  width-dependent contrast ratio is impossible, which is what gave it away: axe composites what is
  actually painted, `animate-fade-in` runs for 0.3s, and `#637081` is `--muted-foreground`
  (`#48566a`) at **0.83 alpha** over `#e9f2f4` — the same alpha on all three channels. The pair
  itself is asserted by `tokens-contrast.test.ts` and passes.
- **Where:** fixed in `e2e/fixtures.ts` — `settleAnimations()` awaits every **finite** animation
  before axe or the reflow measurement runs. Infinite ones are excluded on purpose: the loading
  states hold `animate-spin`, and awaiting it would hang the walk.
- **What green tests do NOT prove here:** that no other timing-dependent measurement remains. The
  walk waits for `document.fonts.ready` and for finite animations, and nothing else — a CSS
  transition started by a hover or focus the walk performs would be settled, but one started by an
  effect after the assertion would not. `retries: 0` means such a thing shows up as a real red
  rather than an intermittent pass, which is the point of forbidding retries.
- **Disposition:** fixed. Recorded because it is the exact shape of a false positive a generated
  test suite hides — a plausible-looking violation with a real number attached, in a gate nobody
  would think to doubt. `A11Y-6` (`prefers-reduced-motion`) still has no enforcer, and this is a
  second reason it should: an app that honoured it would have had no animation to wait for.

## 2026-09-07 — variant A landed without anyone looking at the result
- **What:** the fold-in of variant A is a visible change to the surface the Owner uses weekly —
  new palette (education teal replacing the cyan), new typeface (Fira Sans replacing Inter), 36px
  rows at 13px text, and the mobile accordion deleted in favour of one sideways-scrolling table.
  Every gate is green and 105 tests pass. **Nobody has seen it rendered.**
- **Where:** `src/index.css`, `tailwind.config.ts`, `index.html`, `src/components/ui/data-table.tsx`,
  `src/components/StudentLogs.tsx`
- **What green tests do NOT prove here:** that the teal reads well on a real screen, that Fira Sans
  is an improvement over Inter, that 36px rows are comfortable rather than cramped, and above all
  **that the sideways-scrolling table is usable on a phone**. `A11Y-7` is `[live]` precisely
  because nothing here can distinguish a usable reflow from a compliant one, and DESIGN.md §6 now
  leads with this.
- **Disposition:** open, and **shipped to production on 2026-09-07 without being closed**, which is
  the point of writing it down. `e9dfcf9` deployed from CI; the released artifact was verified as
  far as it can be without eyes — `app-attendance.kotoio.fi` returns 200, the served HTML asks for
  Fira Sans, the served CSS carries `--primary: 175 84% 32%` and the old cyan `195 100% 45%` has
  **zero** occurrences in it, and the deployed CSS hash `index-D_w52UqT.css` matches the local
  build byte for byte. None of that is a person looking at the register. The teacher may well be
  the first to see it.
  What remains for the Owner: read the register on a real phone, which is the sideways-scrolling
  decision and the one thing `A11Y-7` being `[live]` explicitly does not cover. The variants are
  on `proto/lasnaolot-variants` if the decision wants revisiting.
  (Note the deployed JS hash differs from the local one, `index-C8t_J5CC.js` vs `index-DuZqgb9a.js`,
  while the CSS matches — the same split already confessed under the stale-`node_modules` entry.)

## 2026-09-07 — the drift gate read every CSS custom property as commented-out code
- **What:** check 9 (a block of commented-out code) treated `--` as a comment token, which is right
  for SQL and Lua and wrong for CSS: `--foreground: 176 61% 19%;` parses as a comment whose body
  ends in `;`, so four consecutive custom properties read as an unfinished deletion. Rewriting
  `index.css` for variant A produced seven false violations and blocked a clean run.
- **Where:** fixed in `scripts/drift-check.sh` — `--` now counts as a comment only when followed by
  whitespace. Proven both ways: the false positives went away, and probe files with `// const x =`
  and `-- DROP TABLE students;` runs still fire.
- **What green tests do NOT prove here:** **the same bug is still in `api/scripts/drift-check.sh`
  and in devkit's own template**, and neither was touched from here. It will not fire in the API
  repo until someone adds a run of four `--`-prefixed lines to a non-`.md` file there, which is
  unlikely in Python but certain in any `.sql` or `.css` file that arrives. devkit's copy will hand
  the bug to the next project bootstrapped from it.
- **Disposition:** open for those two copies — fix in devkit first, then re-sync the API's.

## 2026-09-07 — `api/scripts/seed_data.py` is broken against its own schema
- **What:** the documented way to seed test data fails. It inserts `student_first_name` /
  `student_last_name` into `attendance_records` and leaves `student_id` NULL — the dead vocabulary
  the Student-entity migration replaced with a single `name`, and the exact words
  `drift-extra.sh` bans in `app/`. It creates the users and classes, then dies with a
  `NotNullViolationError` on the attendance insert.
- **Where:** `api/scripts/seed_data.py`; `CLAUDE.md` still lists `./scripts/seed-db.sh` as the way
  to populate a database for manual testing
- **What green tests do NOT prove here:** the 346-test suite builds its own fixtures in
  `conftest.py` and never runs the seed script, so the whole suite passes with this broken. Anyone
  following `CLAUDE.md` to set up a local environment hits it immediately.
- **Disposition:** open. Found while standing up a local database to view the UI prototype; worked
  around by inserting rows with SQL, which is not a fix. Belongs to the API repo's ledger too.

## 2026-09-07 — three surfaces render a failed request as an empty state
- **What:** none of the read surfaces consults its query's `error`. A failed fetch falls through to
  the empty branch, so the screen states something false and actionable in the wrong direction: the
  dashboard invites a teacher who owns a Kurssi to create her first one, *Läsnäolot* says "Ei
  opiskelijoita vielä" about a register that has thirty, and *Tilastot* tells someone with two
  hundred records to go and record some attendance.
- **Where:** `src/components/StudentLogs.tsx:120`, `src/pages/TeacherDashboard.tsx:19`,
  `src/pages/ClassStatistics.tsx:27` — each destructures `data` and `isLoading` and stops
- **What green tests do NOT prove here:** all 105 tests pass with this in place, because every one
  of them supplies data. The mutation paths *do* surface errors as toasts; only the read paths are
  blind, and a mocked read never fails.
- **Disposition:** open, and it is the first item of the re-skin rather than a later polish —
  an error state is one of the four states in `DESIGN.md` §3 and this one does not exist. Found by
  `/design-brief`, which is what §3 is for.

## 2026-09-07 — the mobile per-Student menu is unreachable by assistive technology
- **What:** the menu button is a `<button>` nested inside Radix's `AccordionTrigger` `<button>`.
  Invalid HTML, `nested-interactive` under axe, and on a phone that menu is the **only** route to
  rename a Student, tick a credit or delete anything — so for a keyboard or screen-reader user the
  narrow surface has no actions at all.
- **Where:** `src/components/StudentLogs.tsx:703-788`, inside `<AccordionTrigger>`
- **What green tests do NOT prove here:** it is *gated* rather than fixed —
  `src/components/__tests__/surfaces.a11y.test.tsx` carries it as a shrink-only `KNOWN_VIOLATIONS`
  row, so a new violation fails and fixing this one also fails, telling you to delete the row. The
  gate proves the defect has not spread; it does not make the menu reachable.
- **Disposition:** **CLOSED 2026-09-07, by deletion rather than repair.** Variant A won the
  `/prototype` run and `StudentLogs` now renders one table at every width, so the accordion — and
  with it the trigger there was no way to legally nest a button inside — is gone. The
  `KNOWN_VIOLATIONS` row was removed because the test demanded it: a listed violation that stops
  appearing fails the assertion and names the row. Worth noting what this means for the fix I
  *did* apply on 2026-09-07: the English `aria-label="Student actions"` I corrected to
  "Opiskelijan toiminnot" was on that same menu button, so that correction is now moot code.

## 2026-09-07 — seven colour-token pairs fail WCAG AA, one of them on every button
- **What:** measured, not intended. `primary-foreground` on `primary` is **2.61:1** in light mode —
  white on the cyan accent, below even the 3:1 large-text floor — and `button.tsx:12`'s default
  variant is `bg-primary text-primary-foreground`, so this is every primary button in production,
  "Kirjaa läsnäolo" included. `ring` on `background` shares the same cyan at 2.61:1, under WCAG
  1.4.11's 3:1, across 23 components. `input` on `background` is 1.25:1 light and 1.42:1 dark, so a
  form field has no perceivable boundary. Plus `destructive-foreground`/`destructive` at 3.78:1,
  `muted-foreground`/`muted` at 4.36:1, and the dark-mode primary at 2.12:1.
- **Where:** `src/index.css` (`:root` and `.dark`); the full table is `DESIGN.md` §5
- **What green tests do NOT prove here:** the gate is a ratchet, not a fix —
  `src/__tests__/tokens-contrast.test.ts` holds each as a shrink-only `KNOWN_FAILING` row. It also
  proves only that the *palette* can clear AA, never that a rendered screen does: nothing there
  covers a disabled control at 50% opacity or text over the primary-tinted count pill.
- **Disposition:** **CLOSED 2026-09-07.** Variant A's education-teal palette landed in
  `src/index.css` and all seven pairs clear — `primary-foreground`/`primary` went 2.61:1 → 5.18:1,
  the focus ring 2.61:1 → 3.51:1, `input` 1.25:1 → 3.66:1. `KNOWN_FAILING` in the contrast test is
  now empty, and the test is what forced the rows out: a listed pair that starts passing fails the
  assertion and names the row to delete. The palette came from `ui-ux-pro-max`'s corpus, whose own
  border value failed the 3:1 control-boundary check, so `--input` was darkened away from
  `--border` deliberately. A dark set was written to match and is asserted by the same test,
  though nothing can select it yet (see the dark-mode entry in DESIGN.md §6).

## 2026-09-07 — one a11y suppression, and three rules scoped off for the shadcn primitives
- **What:** `jsx-a11y/no-autofocus` is disabled at one site, the inline name editor, where the user
  has just clicked "edit" and focus is the affordance — the rule targets focus stolen on page load.
  Separately, `heading-has-content` and `anchor-has-content` are off for `src/components/ui/**`,
  because those primitives forward children through `{...props}` and the rules fire on
  `<h3 {...props} />` without seeing what the caller passes.
- **Where:** `src/components/StudentLogs.tsx` (the disable, with its reasoning inline),
  `eslint.a11y.config.js` (the scoped block)
- **What green tests do NOT prove here:** the scoping was proven correct — a contentless `<h1>` in
  `src/pages` still fails — but nothing checks that a *caller* passes real content to a
  `CardTitle`. And the suppressed autofocus is covered only by the keyboard walk, which is
  human-run.
- **Disposition:** accepted with reason, recorded per PRINCIPLES #5. Revisit the autofocus if the
  inline editor is ever replaced by a dialog, where Radix would handle focus itself.

## 2026-09-07 — A11Y-1, A11Y-2 and A11Y-7 have no automated enforcer, and three rows have none at all
- **What:** no Playwright, so keyboard operability, focus order and reflow at 320px are `[live]` —
  real enforcers, but human-run. `A11Y-6` (`prefers-reduced-motion`), `A11Y-8` (200% zoom) and
  `A11Y-9` (a control announcing itself in the wrong language) are `[review-only]` with nothing
  behind them. `animate-fade-in`, `transition-smooth` and `active:scale-[0.98]` all ignore
  reduced-motion today.
- **Where:** `DESIGN.md` §5; ADR-0004 records why Playwright was rejected for now
- **What green tests do NOT prove here:** seven `sr-only` strings in `src/components/ui/**`
  announce in English ("Close", "More pages") in an otherwise Finnish app, two of them on
  components in daily use, and app code has no `sr-only` text at all. axe reads a name's presence,
  never its language, so `A11Y-9` is the row that names this and it has no gate.
- **Disposition:** open — Playwright is the single change that would convert three rows from
  `[live]`/`[review-only]` to `[test]`. Revisit when a second surface or a second user arrives.

## 2026-09-07 — DESIGN.md's loading thresholds are decided but not implemented
- **What:** §3 decides that nothing shows a spinner before 300ms, that a Card's frame never waits
  for its body, and that a mutation disables its control instead of blanking a region. The code
  does none of the first two: every read surface spins immediately, and `/class/:id` blanks the
  whole surface including its tabs behind one spinner.
- **Where:** `DESIGN.md` §3; `src/pages/ClassView.tsx`, `src/components/ProtectedRoute.tsx`
- **What green tests do NOT prove here:** nothing tests a delay threshold, and jsdom cannot show a
  flicker. This is a decision waiting for the re-skin slice, recorded so the gap between the
  contract and the code is visible rather than discovered later.
- **Disposition:** open → the re-skin.

## 2026-09-04 — today's server changes were verified over HTTP, not through the screen
- **What:** the attendance summary stopped issuing one query per student, and INV-1's seven
  enforcement sites became one. Both are server-side, and the client change was a deletion of
  three exports no screen referenced — so the live exercise was run against the real API over
  HTTP with two authenticated teachers, and **the Läsnäolot screen itself was never opened.**
- **What was proven live:** the summary returns each student's records newest-first (two students,
  interleaved timestamps, seeded in an order neither sorted nor grouped); the statistics endpoint
  refuses a second teacher with 403 now that its check sits in the service rather than its route;
  all four refusal phrases are distinct and correct; a missing class 404s before ownership is
  considered; and the owning teacher still gets 200 on class, students and summary.
- **What that does NOT prove:** that `StudentLogs.tsx` renders the reordered records the way a
  teacher reads them. The endpoint's contract is unchanged and 78 client tests pass, so the risk is
  low — but "the API returns them newest-first" and "the teacher sees them newest-first" are two
  claims and only the first was exercised.
- **Disposition:** open, and it is the Owner's five minutes: open Läsnäolot on a class with a
  student who has several records and confirm the newest is on top. Recorded rather than claimed,
  because this project's own history is that a green suite and a rendered screen are different
  things.
- **Shipped 2026-09-07 without closing this**, which is the point of writing it down. Production
  serves the new artifact — `attendance-api.kotoio.fi/health` 200, `/docs` still 401,
  `app-attendance.kotoio.fi` 200 on a **new** bundle (`index-CWseqqTz.js`, where the previous
  deploy served `index-CFvpiltm.js`; the CSS hash is unchanged, which matches a TypeScript-only
  change). That proves the *artifact* deployed. It does not exercise the two changed code paths:
  the summary's ordering and the statistics endpoint's ownership check both need a signed-in
  teacher, and auth runs before everything, so an unauthenticated probe returns 401 whatever the
  code behind it does. Both were verified locally over HTTP with two real sessions; on production
  they are deployed and unexercised.

## 2026-09-04 — deleting the dead hook left attendanceApi.list with no callers at all
- **What:** `useAttendance` was deleted because nothing called it (spec 0002). That leaves
  `attendanceApi.list` and `ListAttendanceParams` with **zero** callers of their own — the client
  now has no path whatsoever to `GET /api/classes/{id}/attendance`. They were kept deliberately:
  the route still exists and this module mirrors the API, and proving an export dead is `/prune`'s
  job, not a feature slice's.
- **Where:** `src/api/attendance.ts` — `ListAttendanceParams` and `attendanceApi.list`.
- **What green tests do NOT prove here:** nothing exercises that method, and the orphan gate cannot
  see it — `attendance.ts` has other live exports, so the module is not an orphan and an unused
  member inside it is invisible. This is the same blind spot recorded on 2026-09-01 for
  `src/lib/classes.ts`, one level down.
- **Disposition:** **FIXED 2026-09-04**, the Owner's call, taken out of backlog item 6's territory
  early because it was one deletion rather than a sweep. Both are gone, and following the chain
  took a third with them: `PaginatedAttendanceResponse` in `src/api/types.ts` existed only as
  `list`'s return type, so deleting `list` orphaned it. Left behind, it would have been a fresh
  orphan *created* by the commit that closed this entry, which is how a sweep never finishes.
- **Proof before deletion**, in `/prune`'s sense: `grep` found `ListAttendanceParams` referenced
  only by its own definition and by `list`; the only `.list(` calls in `src/` are `studentsApi.list`;
  `PaginatedAttendanceResponse` had one reference, its own declaration. Then `tsc` passed with the
  three removed, which is the compiler agreeing nothing resolved to them. Typecheck stayed at
  baseline 4 and lint at 16 — dead code carries no findings, so a drop would have meant the code
  was live.
- **Not touched, and still item 6's:** `CreateAttendanceRequest` still carries
  `student_first_name` / `student_last_name` marked DEPRECATED, three lines below the deletion.
  Both match a pattern the client's own `drift-extra.sh` check 1 bans, and they pass only because
  the gate judges diffs and these lines predate it. That is a real find, and expanding a
  one-deletion job into it is how scope creeps.

## 2026-09-04 — the revealed state is forgotten the moment you navigate away
- **What:** `showLegacy` is component state. Reveal the old students, open a student's records,
  come back — they are hidden again, and the page count resets. Deliberate (spec 0002, decision 6):
  a control that first appears in 2030 to delete a handful of rows did not seem worth a URL
  parameter, and the alternative is reversible.
- **Where:** `src/components/StudentLogs.tsx` — `const [showLegacy, setShowLegacy] = useState(false)`.
- **Criterion:** none. `AC-6` asks only that the banner reveals and a revealed student can be
  deleted, which it does. This is below the spec, recorded because a user can feel it.
- **What green tests do NOT prove here:** the tests mount the component once. No test navigates
  away and back, so nothing would notice if this became annoying in practice.
- **Disposition:** accepted-with-reason, and listed as open question 2 in the spec. One `useState`
  becomes one search param if deleting a batch of old students ever feels tedious.

## 2026-09-03 — a failed logout leaves the teacher looking signed in
- **What:** `logout()` awaits `authApi.logout()` and only then clears state
  (`src/contexts/AuthContext.tsx:62-64`). `authApi.logout` clears the in-memory access token in a
  `finally` but re-throws (`src/api/auth.ts:17-23`), so when the request fails the `setUser(null)`
  never runs. The screen still shows a signed-in teacher whose access token is already gone — and
  the refresh cookie is still valid, so the very next 401 silently refreshes them back in
  (`src/api/client.ts:47-60`). Server-side, the refresh token was never revoked.
- **Where:** `src/contexts/AuthContext.tsx:61-65`, `src/api/auth.ts:17-23`
- **What green tests do NOT prove here:** the suite now pins this behaviour rather than fixing it —
  `AuthContext.test.tsx`, "surfaces a failed logout instead of swallowing it". That test asserts
  what the code does today, so it will turn red when the behaviour is corrected, which is the point.
- **Disposition:** open — found while rewriting the suite, not while fixing behaviour, so it was
  recorded rather than quietly changed. The Owner decides whether logout should clear local state
  regardless of the request's fate. It is genuinely a judgement call: clearing on failure hides
  from the teacher that the server still holds a live session.

## 2026-09-03 — validateEmail's inline message is unreachable for a malformed address
- **What:** the email field is `type="email"` and `required` (`src/pages/Auth.tsx:112-118`), so the
  browser's own constraint validation refuses the submit and `handleSubmit` never runs. The inline
  message set at `src/pages/Auth.tsx:30` therefore cannot appear for an address like
  `invalid-email`. It is reachable only in the gap between native validation and the stricter regex
  at `:27` — `a@b` passes the browser and fails the regex.
- **Where:** `src/pages/Auth.tsx:26-34`, `:112-121`
- **What green tests do NOT prove here:** two tests used to assert that message appeared and had
  been failing since the field became `type="email"`. The rewritten test asserts the guarantee that
  actually holds — a malformed address never becomes a request — so the unreachable branch is now
  documented instead of falsely covered.
- **Disposition:** open, low. Either drop the regex and let the browser own the rule, or drop
  `type="email"` and let the regex own it. Two validators for one rule is the defect; which one
  survives is the Owner's call.

## 2026-09-02 — reloading any protected page logs you out, though the session is valid
- **What:** `AuthContext` starts `loading` at `false` (`src/contexts/AuthContext.tsx:20`).
  `ProtectedRoute` renders **before** its own `useEffect` runs, so its first render sees
  `loading === false` and `user === null` and returns `<Navigate to="/auth" replace />`
  (`src/components/ProtectedRoute.tsx:32-34`). `checkAuth()` then fires and *succeeds* — but the
  redirect has already happened, and `/auth` never re-checks. The user sees the login screen with
  a perfectly good session.
- **Where:** `src/contexts/AuthContext.tsx:20`, `src/components/ProtectedRoute.tsx:14-34`
- **Evidence (live, 2026-09-02):** headless Chrome over CDP against the dev server on
  `localhost:5173` and the API on `localhost:8001`. Logged in through the real form → landed on
  `/dashboard`. Cold-loaded `/dashboard` → sat on `/auth` for **12 seconds**, polled once a
  second, never recovering. The API log for that same load shows
  `POST /api/auth/refresh 200` followed by `GET /api/auth/me 200`: the server restored the
  session while the client was already on the login page.
- **What green tests do NOT prove here:** nothing exercises a page reload with a live refresh
  cookie. This is inside the "auth/login/logout effectively untested" hole the root `CLAUDE.md`
  already names, and it is the concrete bug hiding in it.
- **Not caused by the role removal.** `git diff cff0ddb..HEAD` touches neither file, and the
  `useState(false)` line dates to `d9f4086` (2025-11-03), when the client was first wired to the
  API. It has been live for ~10 months.
- **Why it surfaced now:** it is what `AC-14` of the API repo's
  `specs/0001-registration-code-cli-and-role-removal.md` walks into. That criterion's *intent* —
  signing in lands you on the teacher dashboard, not on a removed admin screen — **is** met and
  was proven live. Its literal wording, "a signed-in teacher landing on `/`", fails for this
  unrelated reason.
- **A SECOND defect, same shape, found while fixing this one:** `Index.tsx` — the `/` landing
  route — never called `checkAuth()` at all, and read `user` from an empty context on its first
  render. So even with `ProtectedRoute` fixed, a cold load of `/` still sent a signed-in teacher
  to the login screen. That is `AC-14` of the API repo's
  `specs/0001-registration-code-cli-and-role-removal.md`, and it is why that criterion failed
  live twice before passing.
- **Disposition:** **fixed 2026-09-02**, Owner's call. Two changes: `loading` starts `true`
  (`AuthContext.tsx:20`), so `ProtectedRoute` shows its existing spinner instead of redirecting;
  and `Index.tsx` now calls `checkAuth()` and waits for `loading` before choosing a destination.
  Six tests added across `src/components/__tests__/ProtectedRoute.test.tsx` and
  `src/pages/__tests__/Index.test.tsx`, covering the cold-load-with-a-session case that nothing
  covered. Re-proven live over CDP: reloading `/dashboard` stays on `/dashboard`, and a cold load
  of `/` reaches the teacher dashboard. Failing test count unchanged at 25.

## 2026-09-01 — this repo has no INVARIANTS.md by design, so drift-check's invariant gate is inert here
- **What:** `/crunch-domain` produced six invariants and put them in
  `../student-attendance-tracker-api/INVARIANTS.md`, because **every enforcer is server-side** — a
  DB constraint, a route test, an ownership check. None lives in this repo. Writing a second
  `INVARIANTS.md` here would be two files for one artifact (ANTI-PATTERNS: *two formats for one
  artifact*), so this repo has none.
- **Where:** `scripts/drift-check.sh` check 7, which matches `INVARIANTS.md` rows and therefore never
  fires in this repo; `CONTEXT.md`'s pointer block
- **What green tests do NOT prove here:** that the UI respects any invariant. It does not enforce
  them and is not trusted to — the API refuses regardless of what a screen shows. A future session
  must not read "no INVARIANTS.md" as "no rules".
- **Disposition:** accepted-with-reason. Revisit only if a rule appears whose enforcer is genuinely
  client-side; then this repo gets its own file and the gate becomes live.

## 2026-09-01 — the legacy-student filter cannot be turned off from the UI
- **What:** `legacy` is declared in this repo's API types (`src/api/attendance.ts:20`, commented
  "Include students with first attendance > 5 years ago") and **no component ever sets it**. The
  backend therefore always applies its default, which is filter-on. Two further problems: the
  backend measures `Student.created_at`, not first attendance, so the comment here is wrong; and the
  filter has never fired, since the app launched in November 2025.
- **Where:** `src/api/attendance.ts:20`; backend at
  `../student-attendance-tracker-api/app/services/attendance_service.py:124-128`
- **What green tests do NOT prove here:** no frontend test touches `legacy`, and none could — the
  parameter reaches no component.
- **Disposition:** **RESOLVED 2026-09-04** by spec 0002. The cutoff now measures first attendance,
  lives on the summary endpoint that `StudentLogs` actually calls, and is revealed by a banner that
  names how many Students are hidden. `/design-brief` was not run: the surface turned out to be one
  banner on an existing list rather than a screen, and it is covered by five tests in
  `src/components/__tests__/StudentLogs.legacy.test.tsx`, each watched failing against a mutated
  component. What green tests still do not prove: nothing is old enough to hide until roughly
  November 2030, so every test and the live run use backdated data.


## 2026-09-01 — the Vercel deploy gate is not real until auto-deploy is switched off
- **What:** `.github/workflows/ci.yml` now gates the frontend deploy behind the harness gates and
  runs `vercel deploy --prebuilt --prod` itself (ADR-0003). Vercel's git integration deploys on push
  independently, and it is **still enabled**.
- **Where:** `.github/workflows/ci.yml` (`deploy` job); Vercel Project → Settings → Git
- **What green tests do NOT prove here:** until git auto-deploy is disabled in the Vercel dashboard,
  **both paths deploy on every push to main and they race** — whichever finishes last wins, and a red
  CI still ships. This is a manual step outside the repo that no gate can enforce. Three secrets are
  also required and cannot be set from here: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`
  (the latter two live in the gitignored `.vercel/project.json`).
- **Verified 2026-09-01, because both points were initially misread:**
  (a) auto-deploy is **on** — it comes from *Connected Git Repository*, not from *Deploy Hooks*, and
  an empty Deploy Hooks list is not evidence of anything;
  (b) the Vercel connection names `mialsu/student-attendance-tracker-client-app` while the remote is
  `student-attendance-tracker/client-app` — these are the **same repo** (identical ref lists over
  SSH, GitHub post-rename redirect), so the connection really does watch the branch we push.
- **Disposition:** the Owner disconnected Vercel's git integration on 2026-09-01 and chose to have
  every green push deploy, with no opt-in switch. The race is therefore resolved by the disconnect
  rather than by a gate. **If the git integration is ever reconnected, the race returns** and CI's
  gate silently becomes advisory again — that is the thing to remember, because nothing in the repo
  can detect it.

## 2026-09-01 — the frontend deploy job was unverified; it has now run successfully (VERIFIED)
- **What:** the `gates` and `security` job commands were all run locally; the `deploy` job was not,
  because it needs the Vercel token and deploys to production. YAML parses and every embedded shell
  block passes `bash -n`.
- **Where:** `.github/workflows/ci.yml`, the `deploy` job
- **What green tests do NOT prove here:** the post-deploy check against
  `https://app-attendance.kotoio.fi` asserts a 200, which does not prove the *new* bundle is being
  served rather than a cached edge response. It is a liveness check, not a version check.
- **Verified 2026-09-01:** `vercel pull` → `build` → `deploy --prebuilt --prod` succeeded and the
  site returns 200. Getting there required adding a preflight step, because `vercel pull` reports
  the same opaque "Could not retrieve Project Settings" for a missing secret, a rejected token, and
  an out-of-scope project alike — the real cause was `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` not yet
  being set.
- **Disposition:** verified. Remaining gap: no version assertion. Emitting the commit SHA into the
  build and checking for it would turn the liveness check into a real one.

## 2026-09-01 — the test ratchet may be flaky in CI
- **What:** `npm run gate:tests` absorbs 25 failing tests as its baseline, and one of them makes a
  real HTTP request to `http://localhost:8000`.
- **Where:** `src/contexts/__tests__/AuthContext.test.tsx`; surfaces via `src/api/auth.ts:19`
- **What green tests do NOT prove here:** the failure **count** may differ on a runner where nothing
  listens on port 8000 — connection-refused can yield a different number of failures than a local
  timeout. If the count moves, the ratchet fails for a reason unrelated to the diff. The fix is to
  mock at the `src/api` seam, or quarantine the file with a confession — **not** to raise the baseline.
- **Measured 2026-09-02, before the first real push:** the count is **25 in both conditions**.
  Run once with `VITE_API_URL` pointed at a dead port (nothing listening, which is CI) and once
  as normal (where this machine has another project's `platform-api` answering 404 on :8000):
  `Tests 25 failed | 71 passed (96)` both times. So connection-refused and an answered-404
  produce the same count, and the ratchet is not at risk for this diff.
- **Disposition:** open, but de-risked for this push. The count being stable across those two
  conditions is not proof it is stable across all of them — a slow DNS path or a different
  timeout could still move it. The fix remains mocking at the `src/api` seam, not raising the
  baseline.

## 2026-09-01 — devkit's vocabulary check cannot express compound identifiers
- **What:** `scripts/drift-check.sh`'s vocabulary check splits each identifier into segments
  (`pupilName` → `pupil` + `name`) and compares each segment against `CONTEXT.md`'s `_Avoid_` list.
  A camelCase or snake_case **compound** entry therefore never matches: `studentFirstName`
  lowercases to `studentfirstname`, which equals no single segment. The first `_Avoid_` list written
  during this install was exactly that, and the gate reported clean while the banned word sat in the
  diff — a false pass.
- **Where:** `scripts/drift-check.sh` (check 1, the `seglist`/`banned` awk functions);
  worked around by `scripts/drift-extra.sh`
- **What green tests do NOT prove here:** any `_Avoid_` entry of more than one word in any devkit
  project is decoration, and reports clean. This is a defect in the shared template, not just here —
  the template's own guidance ("an `_Avoid_` list should hold domain synonyms") does not say the
  entries must be single words.
- **Disposition:** worked around locally in `scripts/drift-extra.sh`, kept separate so
  `drift-check.sh` stays byte-identical to devkit's template. Worth fixing upstream in devkit.

## 2026-09-01 — harness installed on a red tree: three gates are ratchets, not clean gates
- **What:** `/harness` was installed with the Owner's explicit "gate forward, confess the baseline"
  decision. Typecheck, lint and tests were all failing on a clean `main`, so each was wired as a
  ratchet against a recorded count (`.harness-baseline`) rather than a clean pass/fail gate.
- **Where:** `.harness-baseline` (`typecheck=4`, `lint=16`, `tests=0`),
  `scripts/baseline-guard.sh`
- **What green tests do NOT prove here:** nothing about the 4 remaining type errors or the 16 lint
  errors is fixed. A ratchet blocks *accumulation*, not *substitution* — fixing one error while
  introducing another nets zero and passes. The gate is real (proven by breaking it), but it
  guards a floor that is below correct.
- **Disposition:** open for typecheck and lint, both moved on 2026-09-03. **`tests` reached 0**
  and is no longer a ratchet in practice: any new failure now breaks the gate outright.
  **`typecheck` fell 26 → 4.** Worth recording precisely, because the obvious explanation is the
  wrong one: the 22 that went were **not** in the deleted dead-code files — restoring those files
  left the count at 4. They were in the three rewritten test suites, which type-checked against
  an auth context that no longer matched them. The 4 that remain are
  `src/components/ui/data-table.tsx:368` and three `action`-shape errors in
  `src/hooks/__tests__/use-toast.test.ts`. This entry also recorded `lint=19`, already stale when
  written — the ratchet had taken it to 16 on its own.

## 2026-09-01 — 25 of 90 frontend tests fail on main, and one makes a real network call
- **What:** `npx vitest run` → 25 failed / 65 passed. `AuthContext.test.tsx` is 19/22 failing;
  `auth-flow.test.tsx` 4/8; `AttendanceTracking.test.tsx` 2/8. At least one test performs a live
  HTTP request to `http://localhost:8000` and fails `ERR_NETWORK`, so it depends on a dev server
  being up rather than on a mock at the `src/api` seam.
- **Where:** `src/contexts/__tests__/AuthContext.test.tsx`,
  `src/__tests__/integration/auth-flow.test.tsx`,
  `src/components/__tests__/AttendanceTracking.test.tsx`; the network call surfaces via
  `src/api/auth.ts:19` (`logout`) reached from `src/contexts/AuthContext.tsx:58`
- **What green tests do NOT prove here:** auth, login, logout, email change and password change are
  effectively **untested** despite appearing in the suite. `CLAUDE.md` claims "94.14% coverage" for
  this repo; that figure does not describe this tree.
- **Disposition:** **RESOLVED 2026-09-03.** Diagnosed, and none of the 25 was a product bug.
  Three causes: `AuthContext.test.tsx` (19) and `auth-flow.test.tsx` (4) asserted a localStorage
  auth context that no longer exists — `signup()` returning a boolean, `isTeacher`, the `users`
  and `currentUser` keys — and `AttendanceTracking.test.tsx` (2) held a strict-equality payload
  that omitted the `timestamp` the component correctly sends. All three files were rewritten
  against the real seam (`vi.mock('@/api/auth')`, the pattern `Index.test.tsx` and
  `ProtectedRoute.test.tsx` already used), each proven by mutating the production file and
  watching the new tests go red. The network call is gone and can no longer come back — see the
  enforcer in `src/test/setup.ts`, proven by probe.

## 2026-09-01 — CLAUDE.md's test and coverage claims do not match the code
- **What:** `CLAUDE.md` states the frontend has 94.14% coverage and the backend "241 tests, 82%
  coverage", and marks the project "Production Ready — All Features Deployed". Measured: the
  frontend suite has 90 tests with 25 failing. The backend suite was not run (see the conftest
  entry below).
- **Where:** `CLAUDE.md` "Current Status", "Testing Guidelines"
- **What green tests do NOT prove here:** the status document is a claim, not evidence
  (PRINCIPLES #6). Any session trusting it starts from a false picture.
- **Disposition:** open — needs `/verify-claim` per assertion, then a corrected `CLAUDE.md`.

## 2026-09-01 — two provably-dead modules exempted from the orphan gate instead of deleted
- **What:** `no-orphans` fired on two files on its first run. Both are exempted in the config with
  a comment, not deleted, because deletion is `/prune`'s job and carries its own proof discipline.
- **Where:** `.dependency-cruiser.cjs` (BASELINE DEBT block) — `src/lib/attendance.ts`,
  `src/components/ui/aspect-ratio.tsx`
- **What green tests do NOT prove here:** both files are still built, reviewed and maintained while
  serving no user. `src/lib/attendance.ts` still models `studentFirstName` / `studentLastName`, the
  duplicate-student vocabulary the Student entity migration was meant to remove.
- **Disposition:** **partly resolved 2026-09-03.** `src/lib/attendance.ts` is deleted and its
  exemption is out of `.dependency-cruiser.cjs`; the gate is green with one less carve-out.
  `src/components/ui/aspect-ratio.tsx` is still exempted — open → `/prune`.

## 2026-09-01 — src/lib/classes.ts is dead code kept alive by its own tests
- **What:** `src/lib/classes.ts` and `src/lib/attendance.ts` are localStorage-era modules with
  **zero production importers**. `classes.ts` escapes the orphan gate only because
  `src/lib/__tests__/classes.test.ts` imports it.
- **Where:** `src/lib/classes.ts`, `src/lib/attendance.ts`,
  `src/lib/__tests__/classes.test.ts`
- **What green tests do NOT prove here:** 26 of the 65 currently-passing tests exercise a module
  the application never calls. They inflate both the pass count and the coverage figure while
  guarding nothing a user can reach.
- **Disposition:** **RESOLVED 2026-09-03**, the Owner's call, ahead of `/prune`. Both modules and
  `src/lib/__tests__/classes.test.ts` are deleted. Proof before deletion: the only reference to
  either file anywhere in the repo was that test's own `import ... from '../classes'`, and
  `attendance.ts` had no reference at all. Deleting them also let `src/test/setup.ts` drop its
  localStorage mock — nothing in `src/` touches localStorage now, by design (the access token is
  in memory, the refresh token in an HttpOnly cookie). The blind spot itself is now written into
  `CODING_STANDARDS.md` rather than left as a one-off observation, because the orphan gate still
  cannot see the next module that hides behind a test.

## 2026-09-01 — one upward boundary violation exempted: hooks reaches into components
- **What:** the layering rule `hooks/contexts must not import pages/components` has one carve-out.
- **Where:** `src/hooks/use-toast.ts:3` imports `ToastActionElement`, `ToastProps` from
  `@/components/ui/toast`; exemption in `.dependency-cruiser.cjs` rule
  `layer-hooks-and-contexts-below-ui`
- **What green tests do NOT prove here:** it is a type-only import so there is no runtime cycle,
  but the type direction is still upward — the hook cannot be understood without the component.
  The fix is to move the toast types down to `src/types`.
- **Disposition:** open

## 2026-09-01 — CONTEXT.md was a gate seed; the Owner has now crunched it (RESOLVED)
- **What:** the drift gate's vocabulary check needs `_Avoid_` lines to enforce, so `/harness`
  seeded `CONTEXT.md` from evidence in the committed code. Exactly one `_Avoid_` list is claimed
  (`studentFirstName` / `studentLastName`), verified to have zero live-code hits before being added.
- **Where:** `CONTEXT.md`
- **What green tests do NOT prove here:** this is **not** a domain model. The Owner has not authored
  or recited it, and three terms carry `_Unresolved_` questions that only the Owner can answer —
  including whether a Student is one person across Classes or a per-Class row, and whether `User`
  means different things to the auth code and the admin screens. Citing this file as a settled model
  would make it the pseudo-artifact `ANTI-PATTERNS.md` warns about (PRINCIPLES #11).
- **Disposition:** **RESOLVED 2026-09-01** by `/crunch-domain`. The Owner answered five questions and
  `CONTEXT.md` now records their decisions, including the one this entry called out: a Student is a
  **per-Class row**, deliberately. The `User`-means-two-things question stays open because the Owner
  is reconsidering whether the superadmin role should exist at all. The rules themselves live in
  `../student-attendance-tracker-api/INVARIANTS.md` — see the entry above for why not here.

## 2026-09-01 — no accessibility enforcer exists, so every A11Y rule is review-only
- **What:** the web profile names three cheap a11y enforcers (`eslint-plugin-jsx-a11y`, `axe` in a
  Playwright walk, the keyboard walk). None is installed. `DESIGN.md` does not exist.
- **Where:** `eslint.config.js` (no jsx-a11y plugin), no Playwright in `package.json`
- **What green tests do NOT prove here:** nothing about keyboard operability, focus order, contrast,
  reflow at 320px, or accessible names. `jsx-a11y` was deliberately not installed during this
  harness run because it would add an unmeasured error count to a lint baseline recorded the same
  day — an Owner call, not an agent's.
- **Disposition:** **largely closed 2026-09-07** by `/design-brief` and ADR-0004. `DESIGN.md` now
  exists, `eslint-plugin-jsx-a11y` runs as its own ratchet at baseline 0, and `axe-core` covers six
  rendered states — the opening measurement was 7 lint findings (4 fixed, 3 scoped) and axe found 2
  defects the linter structurally could not see. What remains open is narrower and has its own
  entries above: no Playwright, so A11Y-1/2/7 stay `[live]`; and A11Y-6/8/9 have no enforcer.

## 2026-09-01 — type strictness is off, so the [types] tag is a weak claim
- **What:** `tsconfig.app.json` sets `strict: false`, `strictNullChecks: false`,
  `noImplicitAny: false`, `noUnusedLocals: false`, `noUnusedParameters: false`.
  `eslint.config.js` sets `@typescript-eslint/no-unused-vars: "off"`.
- **Where:** `tsconfig.json`, `tsconfig.app.json`, `eslint.config.js`
- **What green tests do NOT prove here:** null and undefined dereferences, implicit `any` and unused
  code are all invisible to the typecheck gate. The profile's dead-code lint layer
  (`no-unused-vars` + `noUnusedLocals`) is switched off, so `/prune`'s cheap altitude does not run
  at all here.
- **Disposition:** open — turning `strictNullChecks` on will raise the typecheck baseline sharply;
  sequence it deliberately.

## 2026-09-01 — two committed lockfiles
- **What:** both `bun.lockb` and `package-lock.json` are committed.
- **Where:** repo root
- **What green tests do NOT prove here:** one of them does not describe how the app is actually
  built, and the drift gate's lockfile check cannot tell which. CI and local installs may resolve
  different trees.
- **Disposition:** open — pick a package manager, delete the other lockfile.
