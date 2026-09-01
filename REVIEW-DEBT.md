# REVIEW-DEBT.md — student-attendance-tracker-api

The standing ledger of everything the green tests do NOT prove. Written at the moment a corner is
cut (`/confess`), read first by any architecture or review session, dispositioned by the Owner
(fixed / accepted-with-reason / promoted-to-issue).

<!-- Newest first. -->

## 2026-09-01 — the deploy job was unverified; it has now run successfully (VERIFIED)
- **What:** every gate in this repo was proven by breaking it and watching it go red. The `deploy`
  job in `.github/workflows/deploy.yml` was **not**, because the only way to exercise it is to deploy
  to production. What *was* verified: the YAML parses, all embedded shell blocks pass `bash -n`, the
  `gates`/`test`/`security` job commands were run locally with tools on PATH, and the gitleaks block
  was executed verbatim in a clean clone — which found a real bug (see below).
- **Where:** `.github/workflows/deploy.yml`, the `deploy` job
- **What green tests do NOT prove here:** that the backup step, the explicit migration step, the
  `up -d --no-deps backend nginx` swap, the health-check retry loop, or the automatic code rollback
  behave as written on the real VM. Specific untested assumptions: that `docker compose run --rm
  backend alembic upgrade head` overrides the container's start command as intended; that
  `$COMPOSE images -q backend` returns an image id on this docker version; that
  `deployment/scripts/backup-db.sh production` finds `deployment/production/.env` when invoked from
  `$PROJECT_PATH`; and that `restart: always` does not race the explicit migration step.
- **Disposition:** VERIFIED 2026-09-01. The workflow ran on push to `main` and production came
  back healthy (`/health` → 200). Caveat kept deliberately: this first run carried **no application
  code change** (harness scripts, workflow, docs, `tests/conftest.py`), so it exercised the deploy
  *mechanism* — backup, migrations, swap, health check — but not a real code transition, and the
  **rollback branch has still never executed**. A 200 from `/health` cannot distinguish "deployed"
  from "rolled back", so the Actions log is the only record of which path ran. Re-open this if the
  rollback ever fires.

## 2026-09-01 — a real bug in the CI security step, found only by running it
- **What:** the gitleaks step originally piped `curl` straight into `grep -m1` to resolve the latest
  release tag. `grep -m1` closes the pipe on its first match, `curl` then fails with
  CURLE_WRITE_ERROR (23), and `set -o pipefail` fails the whole step. It would have broken on the
  very first CI run. Fixed by capturing the response into a variable before parsing.
- **Where:** `.github/workflows/deploy.yml` and `client-app/.github/workflows/ci.yml`, gitleaks step
- **What green tests do NOT prove here:** nothing — this one is fixed and re-verified verbatim in a
  clean clone. It is recorded because it is the argument for executing CI shell locally rather than
  only linting it: `bash -n` passed on the broken version.
- **Disposition:** fixed

## 2026-09-01 — gitleaks: 108 findings in history, all documentation placeholders, allowlisted by value
- **What:** before wiring gitleaks as a gate, the full history of all four repos was scanned. This
  repo had 108 findings; `client-app`, `deployment` and `knowledge-base` had none. All 108 are
  placeholders in `API_REFERENCE.md` (58), `docs/API_REFERENCE.md` (48) and `scripts/README.md` (2):
  `Bearer YOUR_ACCESS_TOKEN`, example bodies like `"password": "password123"`, prose about a password
  prompt, and a truncated JWT that is the public HS256 header plus a literal `...`.
  **No real credential was found in any repo.**
- **Where:** `.gitleaks.toml`
- **What green tests do NOT prove here:** the allowlist matches placeholder **values**, not paths, and
  that was verified by planting both a random high-entropy secret and a complete 3-segment JWT into
  the allowlisted `API_REFERENCE.md` — both still failed the scan, so the docs are not a blind spot.
  Not covered: gitleaks' default ruleset is not exhaustive, and a secret in a shape it does not
  recognise still passes. Separately, the local `.env` does hold a real `SECRET_KEY`; it is correctly
  gitignored and never committed, which is why CI uses `gitleaks git` (history) and not `dir`.
- **Disposition:** accepted with reason. If a new doc adds a placeholder shape the allowlist misses,
  the fix is another value regex — never a path exclusion.

## 2026-09-01 — 262 green tests do not prove authorization: ownership can be removed undetected
- **What:** during `/harness` install the teacher-ownership filter was deleted from
  `get_classes_by_teacher` — `.where(Class.teacher_id == teacher_id)` replaced with an always-true
  predicate, so **every teacher would see every teacher's classes**. The full suite was then run.
  **All 262 tests passed.** Coverage was byte-identical (77%, 272 lines missed) because the line
  still executes, just with a broken comparison. The change was reverted; `git diff` is clean.
- **Where:** `app/services/class_service.py:54` (the probe site);
  `tests/test_classes.py` (26 tests, none of which catch it)
- **What green tests do NOT prove here:** that a teacher cannot read another teacher's data. There
  is no test that authenticates as a *second, non-owning* teacher and asserts denial. Every
  ownership test in the suite checks the owner's happy path, so the suite is blind to exactly the
  bug class a solo web app actually ships (`/audit`: "broken object-level authorization"). Coverage
  is affirmatively misleading here — 77% is unchanged by removing an authorization check.
- **Disposition:** open — **highest priority in this ledger.** Needs (a) a denied-side test per
  teacher-scoped endpoint, and (b) `INVARIANTS.md` with `INV-n` rows naming those tests as
  enforcers. `/audit` should start here, and `/crunch-domain` should precede it.

## 2026-09-01 — no type gate exists in this repo
- **What:** the `justfile` declared `typecheck: mypy app`, `lint: flake8 app tests` and
  `fmt: black app tests`, and a `check` recipe chaining them. **None of flake8, black or mypy was
  installed** — not in `requirements.txt`, not in the venv. All four recipes failed with "command
  not found". `/harness` replaced lint and format with ruff and removed the false typecheck recipe.
- **Where:** `justfile` (before this commit); `requirements.txt`
- **What green tests do NOT prove here:** nothing checks types in this codebase. mypy was
  deliberately not added (ADR-0001): no annotation discipline exists yet, so the opening baseline
  would be large and unmeasured, and the Owner's decision this session was to gate forward rather
  than open a new front.
- **Disposition:** open — mypy in `--ignore-missing-imports` mode over `app/services` first is the
  cheapest useful slice.

## 2026-09-01 — ruff baseline is 95 findings, gated as a ratchet
- **What:** `just lint` fails when the ruff count grows past 95, not when it exceeds zero.
- **Where:** `.harness-baseline` (`ruff=95`), `scripts/baseline-guard.sh`
- **What green tests do NOT prove here:** the 95 stand. Notably **7 × F821** (undefined name) in
  `app/models/`, all SQLAlchemy string forward references (`Mapped[list["Class"]]`) that resolve at
  runtime; the honest fix is `if TYPE_CHECKING:` imports rather than an ignore that would also hide
  a real typo. Also **3 × DTZ** (timezone-naive datetimes) — in an attendance app a naive timestamp
  is a wrong answer, not a style nit — plus 29 × I001 import ordering and 8 × F401 unused imports,
  56 of the 95 auto-fixable with `ruff check --fix`.
- **Disposition:** open — `ruff check --fix` is a safe first pass, but run it as its own commit with
  the suite green, not folded into a feature.

## 2026-09-01 — tests/conftest.py defaulted a schema-dropping fixture at another project's database
- **What:** `TEST_DATABASE_URL` defaulted to
  `postgresql+asyncpg://attendance_user:test_password_123@localhost:5433/attendance_tracker_test`,
  and the `db_engine` fixture calls `Base.metadata.create_all` then `Base.metadata.drop_all`. On
  this machine port 5433 is currently `platform-postgres`, a **different project's** container. The
  `attendance_user` role does not exist there, so it failed to authenticate rather than dropping
  anything — but "the wrong database refused us" is not a safety mechanism, and `.env.test.example`
  actively instructs using 5433, so the two projects are contending for that port.
- **Where:** `tests/conftest.py:26-28` (fixed in this commit), `.env.test.example`
- **What green tests do NOT prove here:** the fix makes the variable mandatory and pytest now
  refuses to collect without it (verified: exit 4). It does **not** resolve the underlying port
  collision between this project's intended test DB and `platform-postgres`.
- **Disposition:** partially fixed — the dangerous default is gone. Pick a port for this project's
  test DB that no other project claims, and update `.env.test.example`.

## 2026-09-01 — CLAUDE.md's test and coverage figures do not match the code
- **What:** `CLAUDE.md` states "241 tests, 82% coverage" for this repo. Measured on an isolated
  postgres 17: **262 passed, 77% coverage**.
- **Where:** `CLAUDE.md` "Backend (✅ Complete with 82% Test Coverage)", "Testing Guidelines"
  (which separately claims "63 tests passing" and "69% code coverage" — a third figure)
- **What green tests do NOT prove here:** the document carries three different test counts and two
  coverage numbers, none current. Per-module coverage is the part that matters and is not mentioned:
  `student_service.py` **29%**, `refresh_token_service.py` 61%, `attendance_service.py` 74%.
  `student_service.py` is a core service that is effectively untested.
- **Disposition:** open — `/verify-claim` per assertion, then correct `CLAUDE.md`.

## 2026-09-01 — CONTEXT.md is a gate seed, not an Owner-authored domain model
- **What:** seeded by `/harness` from evidence in the code so the drift gate's vocabulary check has
  something to enforce. Every `_Avoid_` term was verified to have zero hits before being added.
- **Where:** `CONTEXT.md`
- **What green tests do NOT prove here:** the Owner has not authored or recited it. Three terms
  carry `_Unresolved_` questions only the Owner can answer — whether a Student is one person across
  Classes, whether `User` means different things to the auth code and the admin endpoints (the only
  valid trigger for the domain dial's `mapped` setting), and the lifecycle of a registration code.
  `INVARIANTS.md` does not exist, so drift-check's invariant check is inert.
- **Disposition:** open → `/crunch-domain`, before `/audit`

## 2026-09-01 — the root .github/ workflow can never run
- **What:** `../.github/workflows/backend-tests.yml` sits at the project root, which is **not a git
  repository** (the four subdirectories each are). It has never run and never will.
- **Where:** `../.github/workflows/backend-tests.yml`; this repo's own working CI is
  `.github/workflows/deploy.yml`
- **What green tests do NOT prove here:** anyone reading the root workflow would believe backend
  tests run on push to `develop` with codecov reporting. They do not. The real pipeline is this
  repo's `deploy.yml`, which runs tests then deploys to production on push to `main`.
- **Disposition:** open — delete the root workflow, or make the root a repository.

## 2026-09-01 — formatting is not gated
- **What:** `ruff format --check` would reformat **33 of 51** files. Not wired into any gate.
- **Where:** `justfile` (`just fmt`)
- **What green tests do NOT prove here:** nothing enforces a consistent format, so diffs will keep
  carrying incidental style churn.
- **Disposition:** open — run `just fmt` as its own commit with the suite green, then gate
  `ruff format --check`.
