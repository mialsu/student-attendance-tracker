# CODING_STANDARDS.md — student-attendance-tracker-api

How code in this repo is written. **This exact filename matters**: the installed `/code-review`
skill's Standards axis reads `CODING_STANDARDS.md`.

## How to read this file

Every rule carries its **enforcer**.

| Tag | Means | Command here |
|---|---|---|
| `[lint]` | ruff fails on it | `just lint` |
| `[boundary]` | import-linter fails on it | `just boundaries` |
| `[script]` | a repo script fails the diff on it | `just drift` |
| `[test]` | a test asserts it | `just test` |
| `[constraint]` | the **database** rejects it — the strongest enforcer available here | — |
| `[review-only]` | **nothing checks this** | — |

**Never label a rule with an enforcer it doesn't have.** A false `[lint]` buys confidence nothing
paid for.

## Known gaps — read this before trusting a tag

**There IS a type gate, since 2026-09-02.** `just typecheck` runs mypy over `app/` as a ratchet
against `.harness-baseline` (ADR-0004). It is in `just check-fast`, so the pre-commit hook runs it.

This paragraph used to say the opposite, and the history matters: the `justfile` declared
`typecheck: mypy app` while mypy was not installed, so the gate existed only as prose; `/harness`
removed the false recipe; ADR-0001 then deferred mypy because "the opening baseline would be large
and unmeasured". Measured, it is **16 errors across 9 files**, so the deferral expired.

`[types]` rules below are `[gate]` where mypy enforces them and `[review-only]` where it does not
yet — nothing stricter than `ignore_missing_imports` is enabled, so an unannotated function is
still legal here.

**`just lint` and `just typecheck` are ratchets, not clean gates.** ruff reports 93 findings and
mypy 16 on a clean tree (`.harness-baseline`); each gate fails when its count **grows**. It blocks accumulation, not
substitution. `just lint-verbose` shows the findings.

**Formatting is not gated.** 33 of 51 files would change under `ruff format`. `just fmt` exists and
is a deliberate commit of its own.

**The test suite is green — and it does not prove authorization.** 262 tests pass, 77% coverage.
During install, the teacher-ownership filter was removed from `get_classes_by_teacher`
(`app/services/class_service.py:54`) and **all 262 tests still passed, with byte-identical
coverage**. Read that as the standing warning it is: green here does not mean a teacher cannot see
another teacher's data. See `REVIEW-DEBT.md`.

## Shape & boundaries

Enforced by `[tool.importlinter]` in `pyproject.toml`; each contract was proven by breaking it.

- Layers run `app.api > app.services > app.models`. A layer may depend on anything **below** it,
  never above. `[boundary]`
- `app.schemas` is a leaf: Pydantic contracts import no application logic. `[boundary]`
- `app.core` is a leaf: security and exceptions depend on nothing above `app.config`. `[boundary]`
- `app.models` never reaches into transport or business logic. `[boundary]`
- Keep services thin at the route layer: business logic lives in `app/services`, not in
  `app/api`. `[review-only]`
- A new file over 400 added lines needs a reason. Under `tests/` the cap is **1000**. `[script]`
  The looser cap is a category judgement, not a concession: the 400 rule's anti-pattern is
  "several modules in a trench coat", which describes a production module with muddled
  responsibilities. A test file's length tracks the surface it covers, this repo's convention is
  one test file per service, and `tests/test_service_attendance.py` was already 637 lines before
  the gate existed. `tests/test_service_student.py` covers a 549-line service with nine functions
  in 979 lines; splitting it to satisfy a byte count would have forked the convention at seams
  chosen by arithmetic. The cap is raised rather than removed, because a 3000-line test file
  really would be several files. Contrast `client/e2e/fixtures.ts` on the same day, which hit the
  same check and was **split** — data, mocks, assertions and harness were genuinely four things.

## Authorization — the rules this repo most needs and least enforces

- **Every endpoint that reads or writes a row scoped to a teacher must filter by the authenticated
  teacher, and a test must prove a *different* teacher is denied.** `tests/test_authorization.py`
  does this for every class-reaching route, and since spec 0003 INV-1 has one enforcement site, so
  neutering it turns 17 of the 18 denials red. This line said "today no such test exists for the
  class list" until 2026-09-07, which stopped being true on 2026-09-01. `[test]`
- **Prefer a database constraint to a service-layer check.** A constraint holds when a new code path
  forgets; a service check holds only for the paths that remember. The
  `(LOWER(name), class_id)` unique index is the model to follow. `[constraint]`
- Enumerate **handlers, not screens**. The classic hole in an agent-built app is a guarded page in
  front of an unguarded route. `[review-only]`
- A handler returns the fields the caller is entitled to, never the whole row. `[review-only]`

## Data & migrations

- An **applied** alembic migration is history. Never edit one in place; write a new one.
  `[script]` (`scripts/drift-extra.sh`)
- Model change → `just migrate-create "message"`, then read the generated migration before
  applying it. Autogenerate misses table renames and constraint changes. `[review-only]`
- `datetime` values are timezone-aware. Naive `datetime.now()` / `strptime` without `%z` is a
  finding (`DTZ`), and in an attendance app a naive timestamp is a wrong answer, not a style
  nit. `[lint]`

## Language

- Every domain concept is named with its `CONTEXT.md` term. `[script]` (`_Avoid_` words)
- `student_first_name` / `studentFirstName` are dead vocabulary — the Student entity replaced them
  with a single normalized `name`. `[script]` (`scripts/drift-extra.sh`, a **separate** enforcer
  because `drift-check.sh` matches identifier *segments* and cannot ban a compound)
- `_Avoid_` entries in `CONTEXT.md` must be **single words**, or they are silently dead.
  `[review-only]`
- This repo and `client-app` describe one domain. A word that disagrees between them is a bug.
  `[review-only]`

## Tests

- Tests create and **DROP** tables. `TEST_DATABASE_URL` must be set explicitly; there is
  deliberately no default (`tests/conftest.py`). `[test]`
- Test external behavior through the endpoint or the service interface. `[review-only]`
- A permission rule is tested from the **denied** side, with a second, non-owning user.
  `[review-only]`
- No skipped test lands without a `REVIEW-DEBT.md` entry. `[script]`
- Green tests gate; they do not prove (PRINCIPLES #1). The ownership probe above is the proof of
  that claim in this repo. `[review-only]`

## Escape hatches

`TODO`, `FIXME`, `# noqa`, `# type: ignore`, `pytest.mark.skip`: allowed, but each is a confession —
it lands with its `REVIEW-DEBT.md` entry in the same commit, or the gate fails. `[script]`

Raising a number in `.harness-baseline` gets the same treatment. `[review-only]`

## Secrets & data exposure

`[review-only]` throughout — `/audit` has not run, so no scanner is wired. Labelling these
`[script]` before `gitleaks` exists would be the false-enforcer mistake.

- No secret in the repo, and none in history. `.env` is gitignored; `.env.example` carries no real
  values. `[review-only]`
- **A credential setting has no default.** `Settings` must refuse to start rather than fall back to
  one. `docs_username` / `docs_password` defaulted to `admin` / `changeme`, and production ran on
  that pair for months because the compose file never passed the real values through — a default is
  what turned a config mistake into a silent one. `[test]` (`tests/test_config.py`)
- Errors reaching a client carry no stack trace, no query and no internal id. `[review-only]`

## Dependencies & reuse

- A new dependency needs an ADR in `docs/adr/`. `[script]`
- `requirements.txt` is the **only** dependency manifest. `pyproject.toml` holds tool config and
  deliberately declares no `[project]` table. `[review-only]`

## What tooling already enforces (deliberately not restated above)

- Lint: `just lint` (ratchet, baseline 95) / `just lint-verbose`
- Boundaries: `just boundaries`
- Drift: `just drift` (devkit's `drift-check.sh` + this repo's `drift-extra.sh`)
- Tests: `just test` (needs `TEST_DATABASE_URL`)
- Fast set (pre-commit): `just check-fast`
- Everything: `just check`
- In CI: `.github/workflows/deploy.yml` — the same set with `BASELINE_FROZEN=1`, plus gitleaks
  (`.gitleaks.toml`) and `pip-audit`. The drift gate runs via `scripts/drift-ci.sh`.
