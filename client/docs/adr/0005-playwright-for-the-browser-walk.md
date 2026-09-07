# ADR-0005 — Playwright runs the browser walk, with the API mocked at the browser boundary

Three accessibility rules in `DESIGN.md` §5 name a human as their enforcer, and one names a test
that cannot do the job. A Playwright walk under `e2e/` runs at **two viewports**, mocks `/api/*` at
the browser boundary, and is the last step of `npm run check` and a job of its own in
`frontend.yml`.

Decided by the Owner on **2026-09-07**, through `/grill-me`, one question at a time. The
alternatives below are transcribed from that session rather than reconstructed afterwards, which is
why this ADR is dated here and not at the end of the work.

**Playwright is a dev dependency, and this ADR is written before the install for that reason.**
`scripts/drift-check.sh` check 3 fires on any versioned line added to `package.json`,
devDependencies included, and it is satisfied only by an ADR **added in the same diff** — so this
file and the manifest change land in one commit. `class-booking`'s ADR-0005 records the same
mechanic for the same gate.

## Why now, and why not for the reason that first suggested it

The trigger was a wish for public evidence of test automation. That is not a reason to add a gate,
and on its own it would have produced one shaped to be seen rather than to catch anything. Two
things make the walk worth its weight regardless:

- **`DESIGN.md` §5 has three rows enforced by a person.** `A11Y-1` (keyboard reachable and
  operable), `A11Y-2` (focus visible, order follows reading order) and `A11Y-7` (reflow at 320px)
  are all `live:keyboard-walk`. Real enforcers, and human-run ones, which means they run when
  someone remembers.
- **`A11Y-4` names a test that cannot see what it claims.** Contrast is asserted over the token
  pairs in `src/__tests__/tokens-contrast.test.ts`, which proves the *palette* can clear AA and
  says nothing about a rendered screen. §6 lists that gap by name. axe cannot close it in jsdom:
  `color-contrast` needs a layout engine to know what is painted behind what, and jsdom has neither
  layout nor paint, so it returns the check as *incomplete* — neither a pass nor a failure
  (ADR-0004 has the full argument).

A real browser is the only thing that closes either. `specgate`'s `REVIEW-DEBT.md` is the evidence
that it closes them in practice: its `reflow-320` project caught a real `color-contrast` and a real
`heading-order`, and its own lesson is the one this walk is organised around — *"the enforcer for
this class of defect is a state in the Playwright walk, and adding a state is a manual act nobody is
prompted to perform."*

**Coverage is explicitly not a justification here, and was ruled out during shaping.**
`app/services/student_service.py` sits near 29%, and a browser driving the app registers **nothing**
in that number, because API coverage is measured by pytest. The gap is closed instead by
`api/tests/test_service_student.py` — in-pattern, since `test_service_attendance.py`,
`test_service_auth.py` and `test_service_class.py` already exist and `student` is the missing
fourth. That work is a separate track and not this ADR's subject.

## What it claims, and what it does not

Only what a browser proves. The rows that move:

| Row | Before | After |
|---|---|---|
| `A11Y-1` keyboard reachable and operable | `[live]` | `[test]` — Tab through the core loop, assert focus lands and Enter/Escape act |
| `A11Y-2` focus order follows reading order | `[live]` | `[test]` |
| `A11Y-2` focus is **visible** | `[live]` | **`[review-only]`** — see the rejected alternative below |
| `A11Y-4` contrast | `[test]`, tokens only | `[test]`, tokens **and** axe as rendered |
| `A11Y-7` reflow at 320px | `[live]` | `[test]` — `scrollWidth <= clientWidth` per state |
| `A11Y-6`, `A11Y-8`, `A11Y-9` | `[review-only]` | unchanged. Nothing here touches them |

## Rejected alternatives

- **The full stack inside the CI job** — a `postgres:17-alpine` service container plus `uvicorn`
  plus the built client, which is the shape that proves integration for real. `backend.yml` already
  runs exactly that Postgres service for pytest, so the machinery is proven and this was the
  strongest rejected option. Rejected on coupling and cost: the two workflows are deliberately
  independent on separate path filters, and this would make a frontend-only change need a Python
  toolchain, alembic and a seeded database to go green. Revive it if the walk ever needs to assert
  something only a real API can produce.
- **Pointing the walk at the live deployment.** Cheapest to stand up, and it would be a real
  post-deploy signal. Rejected because it runs after the deploy, so it reports rather than gates —
  and anything past the login screen needs real credentials in CI and writes to a real teacher's
  attendance history. A read-only smoke check against production remains available later; it is a
  different artifact with a different job.
- **An ephemeral preview environment.** Vercel's git integration is deliberately **disconnected**
  (ADR-0003) so CI is the only deploy path, which means there are no automatic previews to point at.
  Creating one per run means standing up a preview API too, so this is the full-stack option with
  more moving parts.
- **`storageState` from a setup project** — the conventional Playwright answer, and close to
  pointless here. The access token is a module-level variable (`src/api/client.ts:16`), so no
  browser state can carry it; the app bootstraps a session by calling `/api/auth/refresh` from the
  httpOnly cookie and then `/me`, and the mock does not inspect the cookie it would carry. It would
  add a generated JSON file that looks like a credential to save a login click costing
  milliseconds. A fixture mocks `/refresh` + `/me` instead, and one spec drives the real login form
  because `/auth` is a surface `DESIGN.md` §1 lists.
- **Wiring it through `scripts/baseline-guard.sh` as `e2e=0`.** It would put five gates in one
  legible place. Rejected because a ratchet at zero is a plain gate wearing extra machinery:
  ADR-0002 installed ratchets because the tree was red on retrofit and calls them *"the road to it,
  not a destination"*. This gate is installed green, so it is pass/fail and says so.
- **Running it in `.githooks/pre-commit`.** Rejected on the same ground ADR-0002 rejected per-file
  lint-staged scoping: a hook that punishes every commit *"trains people to reach for
  `--no-verify`"*. It lands in `npm run check` instead. Note these are two independent lists — the
  hook enumerates gates one by one and does not call `check`, which is how `gate:a11y` reached
  neither when it was added earlier the same day.
- **Blocking the webfont in the walk instead of self-hosting it.** `index.html` loaded Fira Sans
  from `fonts.googleapis.com`, so an otherwise hermetic walk depended on Google being reachable.
  Aborting the request removes the flake and makes the walk lie: `system-ui` has different advance
  widths, so text wraps differently, and `A11Y-7` at 320px is precisely a test about wrapping. The
  font is self-hosted instead, which removes a third-party runtime dependency from production and
  makes the reflow assertion faithful. This is why a font moves in a test commit.
- **`retries: 1` in CI with a trace on first retry** — the conventional setting, and rejected
  because after self-hosting the font there is no DB, no network, no clock and no real API left to
  be nondeterministic. `retries: 0` is therefore a claim rather than a hope, and an intermittent
  pass would hide the race a gate exists to catch. **Policy for the first red run that is not the
  app: revert the assertion and file a `REVIEW-DEBT.md` entry naming the nondeterminism. Never add
  a retry.**
- **Asserting authorization from the denied side.** Tempting, and forbidden here. `INV-1` has had
  exactly one enforcement site since spec 0003, `scripts/drift-extra.sh` check 4 fails any diff
  adding a `teacher_id` comparison in `app/`, and spec 0004's slice 0 exists to delete the eighth,
  client-side site. A walk that re-derived the rule would be a second enforcement site wearing a
  browser, and it would pull against that slice. `api/tests/test_authorization.py` owns this, covering every
  class-reaching route from the denied side. Its test count is deliberately not quoted here: the
  file is parametrised, and the 2026-09-07 handoff records that the denial counts in `CLAUDE.md`
  do not reconcile with the route table. **The walk asserts what a teacher sees, never a rule** —
  `class-booking`'s ADR-0005 states the same constraint for the same reason.
- **A screenshot baseline for focus visibility**, which would make `A11Y-2` fully `[test]`.
  Genuinely stronger, and it buys committed PNGs and their churn in front of every `git status`.
  `class-booking` made evidence opt-in via `EVIDENCE=1` for that reason. `A11Y-2`'s visibility half
  stays `[review-only]` and `DESIGN.md` says why.
- **Vitest browser mode.** One runner instead of two, no second config. Rejected because this walk
  crosses navigations, a login bootstrap and two viewport projects, and browser mode is aimed at
  component tests. `DESIGN.md` and ADR-0004 already name a real browser as the thing that closes
  these rows, which is reuse before building applied to a decision the documents had already made.
- **Cypress.** Its own runner and assertion style, and the two-viewport work is cheaper in
  Playwright's projects than in Cypress config.
- **A third viewport.** Two widths mean something here: **320px** is `A11Y-7`'s WCAG 1.4.10 floor
  and the narrowest width the Owner declared on 2026-09-07, and **1280px** clears the register
  table's `min-w-[34rem]` so it lays out without sideways scroll — the two sides of the one-table
  decision. A third would be a number nobody chose.

## Consequences

- **`npm run check` now starts a server.** `playwright.config.ts` owns a `webServer` block running
  `vite preview` on port **4174**, one off Vite's preview default of 4173, so a preview the Owner
  already has open is neither reused nor killed by a gate run. Preview rather than dev deliberately:
  the walk exercises the built artifact, which is closer to what deploys.
- **CI grows a job.** "Browser walk" in `frontend.yml` with `needs: [gates]`, so a broken typecheck
  still fails in ~43s without paying for a browser, and it joins `deploy`'s `needs` alongside
  `gates` and `security` — which is what makes it a gate rather than a report. The frontend pipeline
  roughly doubles in wall clock, from about two minutes.
- **The walk proves the screen, not the integration.** `/api/*` is answered by fixtures, so nothing
  here exercises the real API, the database, or the two together from a browser. The backend
  suite owns that tier. Confessed in `REVIEW-DEBT.md`.
- **The error state is reachable and has nothing correct to assert.** A mocked 500 is one line, but
  all three read surfaces currently render a *failed* request as the *empty* state, so the sweep
  covers three states per surface rather than four. Asserting the empty copy on an error would lock
  in the defect. Recorded as debt; when that bug is fixed, the fourth state joins the sweep and the
  walk locks the fix in.
- **A third `tsconfig` project.** `tsconfig.e2e.json` puts `e2e/` and `playwright.config.ts` under
  the typecheck gate, so the harness is held to the same rules as the app. Note the app's own
  strictness is off (`strict: false`, `strictNullChecks: false` — `CODING_STANDARDS.md`), so this is
  a weaker guarantee here than the same sentence buys in a strict repo.
- **Fixtures are written to stress the layout, not to flatter it**: a 32-character hyphenated
  Finnish name, a single-name student, counts either side of the teacher's 14–15 rule of thumb, and
  a student with one attendance. `DESIGN.md` §6 lists "whether the design survives real content" as
  uncovered, and this is the cheapest honest move against it.
- **Watched to go red before it was trusted** (PRINCIPLES #2), on the defect class this repo has
  actually produced: an icon-only button with no accessible name. jsx-a11y cannot see one whose
  element is a component, and axe found three in the rendered DOM on 2026-09-07.
- Reversing this means deleting `e2e/`, `playwright.config.ts`, `tsconfig.e2e.json`, one job in
  `frontend.yml`, and one line of `scripts.check`. No application code depends on it — a two-way
  door. The self-hosted font is the exception and should stay regardless.
