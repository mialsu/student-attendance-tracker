# REVIEW-DEBT.md — client-app

The standing ledger of everything the green tests do NOT prove. Written at the moment a corner is
cut (`/confess`), read first by any architecture or review session, dispositioned by the Owner
(fixed / accepted-with-reason / promoted-to-issue).

<!-- Newest first. -->

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
- **Disposition:** open → spec owed, and the **frontend half is this repo's**. The Owner's decision
  (2026-09-01): keep the cutoff on by default and add a way to reveal old Students so they can be
  deleted. That is a real screen, so it wants `/design-brief` before `/implement`.


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
- **Where:** `.harness-baseline` (`typecheck=26`, `lint=19`, `tests=25`),
  `scripts/baseline-guard.sh`
- **What green tests do NOT prove here:** nothing about the 26 type errors, 19 lint errors or 25
  failing tests is fixed. A ratchet blocks *accumulation*, not *substitution* — fixing one error
  while introducing another nets zero and passes. The gate is real (proven by breaking it), but it
  guards a floor that is well below correct.
- **Disposition:** open

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
- **Disposition:** open → `/prune`

## 2026-09-01 — src/lib/classes.ts is dead code kept alive by its own tests
- **What:** `src/lib/classes.ts` and `src/lib/attendance.ts` are localStorage-era modules with
  **zero production importers**. `classes.ts` escapes the orphan gate only because
  `src/lib/__tests__/classes.test.ts` imports it.
- **Where:** `src/lib/classes.ts`, `src/lib/attendance.ts`,
  `src/lib/__tests__/classes.test.ts`
- **What green tests do NOT prove here:** 26 of the 65 currently-passing tests exercise a module
  the application never calls. They inflate both the pass count and the coverage figure while
  guarding nothing a user can reach.
- **Disposition:** open → `/prune` (this is the profile's "exports used only by tests" blind spot)

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
- **Disposition:** open → `/design-brief`, then wire jsx-a11y first

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
