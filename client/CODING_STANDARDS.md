# CODING_STANDARDS.md — client-app

How code in this repo is written. **This exact filename matters**: the installed `/code-review`
skill's Standards axis reads `CODING_STANDARDS.md`. Without it that axis runs on its generic smell
baseline alone; with it, the review checks *these* rules.

## How to read this file

Every rule carries its **enforcer**. A rule with no enforcer is a suggestion, and agents follow
harnesses far more reliably than prose.

| Tag | Means | Command here |
|---|---|---|
| `[types]` | the typechecker fails on it | `npm run gate:typecheck` |
| `[lint]` | the linter fails on it | `npm run gate:lint` |
| `[boundary]` | the import graph gate fails on it | `npm run lint:boundaries` |
| `[script]` | a repo script fails the diff on it | `npm run drift` |
| `[test]` | a test asserts it | `npm run gate:tests` |
| `[live]` | a `/verify-live` recipe proves it — human-run, but a real gate | — |
| `[review-only]` | **nothing checks this** — it holds only if a human or `/code-review` catches it | — |

**Never label a rule with an enforcer it doesn't have.** A false `[lint]` buys confidence nothing
paid for; an honest `[review-only]` is worth more. Two rules below were demoted to `[review-only]`
during install for exactly that reason — see *Known gaps*.

## Known gaps — read this before trusting a tag

Three of this repo's gates are **ratchets, not clean gates**, because the tree was red when the
harness was installed (`/harness` retrofit, baseline in `.harness-baseline`):

| Gate | Baseline | Means |
|---|---|---|
| `[types]` | 26 errors | a diff may not ADD a type error. The 26 are debt, not permission. |
| `[lint]` | 19 errors | same, for lint. |
| `[test]` | 25 failing | same, for tests. **65 of 90 tests pass; 25 fail on `main`.** |

A ratchet blocks accumulation, not substitution: fixing one error while adding another nets zero
and passes. Every baseline number has a `REVIEW-DEBT.md` entry. When a number drops the script
lowers the baseline automatically — commit that change, it is ground you cannot give back.

**Type strictness is off.** `tsconfig.app.json` sets `strict: false`, `strictNullChecks: false`,
`noImplicitAny: false`, `noUnusedLocals: false`, `noUnusedParameters: false`, and
`eslint.config.js` sets `@typescript-eslint/no-unused-vars: "off"`. So `[types]` is a much weaker
claim here than it looks: a null-dereference or an unused export will not be caught by anything.

**No accessibility enforcer exists in this repo.** No `eslint-plugin-jsx-a11y`, no `axe`, no
Playwright. Every accessibility rule is therefore `[review-only]`, and the web profile's three
cheap enforcers are all unwired. This is confessed, not accepted.

## Language

- Every domain concept is named with its `CONTEXT.md` term. New concept → add the term first,
  then write the code. `[script]` (`_Avoid_` words), `[review-only]` (missing terms)
- `studentFirstName` / `studentLastName` / `student_first_name` are dead vocabulary — the Student
  entity replaced them with a single normalized `name`. They must not return. `[script]`
  (`npm run drift:extra` — a **separate** enforcer, because `drift-check.sh` matches identifier
  *segments* and structurally cannot ban a camelCase compound. Found by breaking it on purpose.)
- `_Avoid_` entries in `CONTEXT.md` must be **single words**. A compound written there is silently
  dead. `[review-only]`
- `course` / `courseCredit` is legitimate, distinct vocabulary (the per-Student credit flag), not a
  synonym for Class. Deliberately not banned. `[review-only]`
- `CONTEXT.md` is currently a **gate seed, not a domain model** — `/crunch-domain` still owes the
  real glossary. Don't cite it as settled. `[review-only]`

## Shape & boundaries

Enforced by `.dependency-cruiser.cjs`, and each rule below was proven by breaking it on purpose.

- Layers run `pages > components > contexts/hooks > api > lib/types`. A layer may depend on
  anything **below** it, never above. `[boundary]`
- `src/api` is the only place that talks HTTP. It imports axios and its own siblings, nothing else
  in `src`. `[boundary]`
- `src/lib` and `src/types` are pure leaves. `[boundary]`
- No dependency cycles. `[boundary]`
- Production code never imports a test helper, a `__tests__` module, or a `devDependency`.
  `[boundary]`
- No orphan modules — a file nothing imports is dead weight that still gets reviewed. Two
  exemptions exist in the config, both provably dead and both confessed. `[boundary]`
- Imports resolve through both `@/x` and `../x` in this repo (see `src/contexts/AuthContext.tsx:2`).
  Prefer `@/` for cross-directory imports; the boundary gate catches either form, so this one is
  style. `[review-only]`
- A new file over 400 added lines needs a reason. `[script]`

## Tests

- Test external behavior through the module's interface, never implementation detail.
  `[review-only]`
- **A test must not make a real network call.** Mock at the `src/api` seam. Enforced by
  `src/test/setup.ts`, which refuses every `XMLHttpRequest` and `fetch` and re-throws the attempt
  after the test, so swallowing the rejection does not hide it. Proven by probe on 2026-09-03:
  an awaited request, a swallowed one and a `fetch` all go red. `[script]`
- A test is not a reason to keep dead code alive. `src/lib/classes.ts` has zero production
  importers and 26 passing tests; that is 26 tests guarding a module the app does not use.
  `[review-only]`
- No skipped, focused, or silently-deleted test lands without a `REVIEW-DEBT.md` entry. `[script]`
- Green tests gate; they do not prove. The live exercise proves (PRINCIPLES #1). `[review-only]`

## Escape hatches

`TODO`, `FIXME`, `@ts-ignore`, `@ts-expect-error`, `eslint-disable`, `.skip(`, `.only(`: allowed,
but each is a confession — it lands with its `REVIEW-DEBT.md` entry, in the same commit, or the
gate fails. `[script]`

Raising a number in `.harness-baseline` is the same kind of act and gets the same treatment: a
`REVIEW-DEBT.md` entry saying why, in the same commit. `[review-only]`

## Secrets & data exposure

`[review-only]` throughout — `/audit` has not run on this repo, so no scanner is wired. Labelling
these `[script]` before `gitleaks` exists would be the false-enforcer mistake this file forbids.

- No secret in the repo, and none in history. `[review-only]`
- `VITE_`-prefixed values are **public by design** — compiled into the bundle and shipped to every
  visitor, permanently. A real key that reaches one needs rotating, not renaming. `[review-only]`
- Errors reaching the UI carry no stack trace and no internal id. `[review-only]`

## Dependencies & reuse

- Reuse before building (PRINCIPLES #3). `[review-only]`
- A new runtime dependency needs an ADR in `docs/adr/` — what it replaces, what was rejected.
  `[script]`
- Generated, vendored and lockfile content is touched only through its generator. `[script]`
- **This repo commits two lockfiles** (`bun.lockb` and `package-lock.json`). One of them is lying
  about how the app is built. Pick a package manager and delete the other. `[review-only]`

## Accessibility

All `[review-only]` — no enforcer is installed (see *Known gaps*). The cheapest next win is
`eslint-plugin-jsx-a11y`, which the web profile names first; it was deliberately not installed
during this harness run because it would add an unmeasured number of errors to a lint baseline
recorded the same day. That is an Owner call, not an agent's.

## What tooling already enforces (deliberately not restated above)

- Types: `npm run gate:typecheck` (ratchet, baseline 26)
- Lint: `npm run gate:lint` (ratchet, baseline 19)
- Boundaries: `npm run lint:boundaries`
- Tests: `npm run gate:tests` (ratchet, baseline 25)
- Drift: `npm run drift`
- Compound vocabulary + repo-specific checks: `npm run drift:extra`
- Build: `npm run build`
- All of it: `npm run check`
- In CI: `.github/workflows/ci.yml` — the same set with `BASELINE_FROZEN=1`, plus gitleaks and
  `npm audit`. The drift gate runs via `scripts/drift-ci.sh`, which resolves a real diff range;
  a bare `drift-check.sh` on a clean CI checkout compares nothing and falsely reports clean.
