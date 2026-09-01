# REVIEW-DEBT.md — client-app

The standing ledger of everything the green tests do NOT prove. Written at the moment a corner is
cut (`/confess`), read first by any architecture or review session, dispositioned by the Owner
(fixed / accepted-with-reason / promoted-to-issue).

<!-- Newest first. -->

## 2026-09-01 — devkit's vocabulary check cannot express compound identifiers
- **What:** `scripts/drift-check.sh`'s vocabulary check splits each identifier into segments
  (`pupilName` → `pupil` + `name`) and compares each segment against `CONTEXT.md`'s `_Avoid_` list.
  A camelCase or snake_case **compound** entry therefore never matches: `studentFirstName`
  lowercases to `studentfirstname`, which equals no single segment. The first `_Avoid_` list written
  during this install was exactly that, and the gate reported clean while the banned word sat in the
  diff — a false pass.
- **Where:** `scripts/drift-check.sh` (check 1, the `seglist`/`banned` awk functions);
  worked around by `scripts/vocab-check.sh`
- **What green tests do NOT prove here:** any `_Avoid_` entry of more than one word in any devkit
  project is decoration, and reports clean. This is a defect in the shared template, not just here —
  the template's own guidance ("an `_Avoid_` list should hold domain synonyms") does not say the
  entries must be single words.
- **Disposition:** worked around locally in `scripts/vocab-check.sh`, kept separate so
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
- **Disposition:** open — these may be real product bugs rather than test bugs. Not diagnosed.

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

## 2026-09-01 — CONTEXT.md is a gate seed, not an Owner-authored domain model
- **What:** the drift gate's vocabulary check needs `_Avoid_` lines to enforce, so `/harness`
  seeded `CONTEXT.md` from evidence in the committed code. Exactly one `_Avoid_` list is claimed
  (`studentFirstName` / `studentLastName`), verified to have zero live-code hits before being added.
- **Where:** `CONTEXT.md`
- **What green tests do NOT prove here:** this is **not** a domain model. The Owner has not authored
  or recited it, and three terms carry `_Unresolved_` questions that only the Owner can answer —
  including whether a Student is one person across Classes or a per-Class row, and whether `User`
  means different things to the auth code and the admin screens. Citing this file as a settled model
  would make it the pseudo-artifact `ANTI-PATTERNS.md` warns about (PRINCIPLES #11).
- **Disposition:** open → `/crunch-domain`

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
