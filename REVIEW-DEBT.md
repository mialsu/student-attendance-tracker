# REVIEW-DEBT.md — student-attendance-tracker-api

The standing ledger of everything the green tests do NOT prove. Written at the moment a corner is
cut (`/confess`), read first by any architecture or review session, dispositioned by the Owner
(fixed / accepted-with-reason / promoted-to-issue).

<!-- Newest first. -->

## 2026-09-01 — the documented way to get a test database pointed at another project's container
- **What:** `CLAUDE.md` and the `justfile`'s `test` recipe both told you to
  `export TEST_DATABASE_URL=...@localhost:5433/attendance_tracker_test`. On this machine port 5433 is
  `platform-postgres`, a **different project's** PostGIS container. The fixtures call
  `Base.metadata.drop_all`. So the documented instruction aimed a schema-dropping test suite at
  someone else's database — the same hazard the removed `conftest.py` default created, surviving in
  the docs after the code was fixed.
- **Where:** root `CLAUDE.md` (corrected), `justfile`'s `test` recipe (corrected),
  `deployment/local/docker-compose.yml`'s `db-test` service (**not** corrected — see below)
- **What green tests do NOT prove here:** nothing catches a wrong `TEST_DATABASE_URL`. The guard in
  `conftest.py` only refuses an *unset* variable; a set-but-wrong one is obeyed.
- **Disposition:** **fixed 2026-09-01** for this repo. `scripts/test-db.sh` now starts a disposable
  database on port 5439 and prints the export line, wired as `just test-db-up` / `just test-db-down`.
  Its port-in-use guard was proven by pointing a copy at 5433 and watching it refuse before touching
  docker. **Still open:** `deployment/local/docker-compose.yml`'s `db-test` is configured for host
  port 5433 and therefore cannot start on this machine. That file is in the `deployment` repo, which
  the Owner scoped out of the harness work, so it is reported rather than changed — the one-line fix
  is a different port.


## 2026-09-01 — INV-1 has seven enforcement sites, not one
- **What:** "only a teacher associated with a Class may read or change it" is implemented seven
  times: `verify_class_ownership` in `class_service.py:202`, a near-identical **second copy** in
  `student_service.py:553`, a **third under a different name** (`verify_class_access`) in
  `attendance_service.py:56`, and four inline `teacher_id != teacher.id` comparisons at
  `class_service.py:151`, `:194`, `attendance_service.py:286`, plus the list filter at
  `class_service.py:54`. `INVARIANTS.md` rule 4 and `CODING_STANDARDS.md` both require one owner.
- **Where:** the seven sites above; `INVARIANTS.md` INV-1's *Owner in code* cell, which says so
- **What green tests do NOT prove here:** the new denial suite proves each site currently works. It
  does **not** prevent the eighth site being added without a check, and it cannot make the seven
  agree — three of them raise `ForbiddenException` with three different messages.
- **Named cost:** the Owner intends **shared Classes** (two teachers on one Class). That is one edit
  at one site and seven edits at seven, with the eighth easy to miss. The tests would catch a miss,
  which is why this is debt and not a defect.
- **Disposition:** open, deferred by the Owner on 2026-09-01 — they chose the tests today and left
  consolidation for later. Do it when shared Classes are specced, not before; the seam is
  `verify_class_ownership(db, class_id, teacher)`, already the right shape.

## 2026-09-01 — whether the superadmin role should exist at all is an open product question
- **What:** `UserRole` carries `TEACHER` and `SUPERADMIN` (`app/models/user.py:17-18`), and
  `require_superadmin` (`app/dependencies.py:71`) guards three `/api/admin/codes` routes. Superadmin
  has **no** reach into teacher data — no ownership check makes a role exception, so a superadmin
  sees only their own classes. Asked whether that is the intended rule, the Owner said they need to
  revisit whether the role is needed at all.
- **Where:** `app/models/user.py:17-18`, `app/dependencies.py:71-93`, `app/api/admin.py`
- **What green tests do NOT prove here:** nothing about intent. The tests prove the current
  behaviour; they cannot say whether a support view is wanted, or whether the role should be deleted
  and registration codes issued another way.
- **Disposition:** open — Owner question, recorded as `_Unresolved_` on the **Teacher** term in
  `CONTEXT.md`. Until it is answered the domain dial stays at `on` with **one** context; the
  `User`-means-two-things collision is the only `mapped` trigger either repo ever claimed, and
  splitting for a word that may be about to disappear would buy a boundary and no benefit.

## 2026-09-01 — the five-year legacy filter measures the wrong date and cannot be turned off
- **What:** attendance listings exclude Students whose row is older than five years. Three problems.
  (1) It filters `Student.created_at` (`app/services/attendance_service.py:124-128`) while this
  repo's own docs, `CLAUDE.md`, and the frontend's type comment all say *first attendance* — and for
  every Student the `01edea317e5e` migration created, `created_at` is the **migration date**.
  (2) The `legacy` query parameter defaults to `None` = filter on (`app/api/attendance.py:84`), and
  **no frontend code ever sets it**, so it cannot be disabled from the app. (3) It has never fired:
  the app launched in November 2025, so the first silent disappearance is due around November 2030.
- **Where:** `app/services/attendance_service.py:124-128`, `app/api/attendance.py:84`,
  `client-app/src/api/attendance.ts:20`
- **What green tests do NOT prove here:** no test advances the clock five years, so no test
  exercises the filter firing at all.
- **Disposition:** open → spec owed. The Owner's decision (2026-09-01): **keep the cutoff on by
  default, and add a way to reveal old Students so they can be deleted.** So this becomes a small
  feature, not a removal. Fix the date field in the same slice.

## 2026-09-01 — get_attendance_statistics takes no teacher, so its only check is in the route
- **What:** every other read in the service layer takes a `teacher: User` and verifies ownership
  itself. `get_attendance_statistics` (`app/services/attendance_service.py:389`) takes only
  `db, class_id, exclude_dates`; the ownership check for that endpoint lives in the route
  (`app/api/attendance.py:59`). Any future caller reaching the service directly — a second route, a
  script, a background job — gets no check and no error.
- **Where:** `app/services/attendance_service.py:389`, `app/api/attendance.py:59`
- **What green tests do NOT prove here:** `test_authorization.py` exercises the **route**, so it
  passes. Nothing tests the service function's own contract, and nothing prevents a second caller.
- **Disposition:** open — fold into the INV-1 consolidation above; the fix is to take `teacher` and
  call the one owner, matching every sibling function.

## 2026-09-01 — CLAUDE.md's Data Model and endpoint lists are stale
- **What:** the root `CLAUDE.md` documents four entities. The code has **seven**: it omits
  `UserRole` (TEACHER/SUPERADMIN), `RegistrationCode`, and `RefreshToken` entirely, along with the
  `merge_students` operation and the attendance `statistics` endpoint. It also advertises
  `GET /classes/{id}/students/summary`, which **does not exist** — the route list is Students 7 (not
  6) and Attendance 5 (not 4), enumerated from `app.routes` directly.
- **Where:** root `CLAUDE.md`, "Data Model" and "Endpoints Summary"; verified against
  `app/main.py:127-131` and the live route table
- **What green tests do NOT prove here:** documentation. This is the same "trusting status over
  code" defect the 2026-09-01 measured-status table was written to correct, one section lower down.
- **Disposition:** fixed in the same commit — the Data Model, endpoint counts and the phantom
  `summary` route corrected, with a pointer to `INVARIANTS.md`.


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

## 2026-09-01 — 262 green tests did not prove authorization; a denied-side suite now does (PARTIAL)
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
- **Disposition:** **PARTIAL, 2026-09-01** (`/crunch-domain`). Item (a) done: `tests/test_authorization.py`
  adds 17 denial tests plus 7 positive controls, all authenticating as a second real teacher
  (`other_teacher`) through the login route. Item (b) done: `INVARIANTS.md` exists and `INV-1` names
  that file as its enforcer. Each of the **seven** ownership sites was neutered individually and the
  suite watched go red — `class_service.py:54`→1 failure, `:151`→1, `:194`→1, `:226`→1,
  `student_service.py:579`→8, `attendance_service.py:80`→4, `attendance_service.py:286`→1. Every
  denial test maps to exactly one site and every site is covered, so the probe that started this
  entry now fails loudly. **Still open:** the seven sites themselves — see the entry above.

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

## 2026-09-01 — CONTEXT.md was a gate seed; the Owner has now crunched it (RESOLVED)
- **What:** seeded by `/harness` from evidence in the code so the drift gate's vocabulary check has
  something to enforce. Every `_Avoid_` term was verified to have zero hits before being added.
- **Where:** `CONTEXT.md`
- **What green tests do NOT prove here:** the Owner has not authored or recited it. Three terms
  carry `_Unresolved_` questions only the Owner can answer — whether a Student is one person across
  Classes, whether `User` means different things to the auth code and the admin endpoints (the only
  valid trigger for the domain dial's `mapped` setting), and the lifecycle of a registration code.
  `INVARIANTS.md` does not exist, so drift-check's invariant check is inert.
- **Disposition:** **RESOLVED 2026-09-01** by `/crunch-domain`. The Owner answered five questions;
  `CONTEXT.md` now records what they decided and `INVARIANTS.md` carries six `INV-n` rows, each
  naming a real enforcer. Two of the three `_Unresolved_` questions are closed: a Student is a
  per-Class row (Owner's call), and the registration-code lifecycle was answered from the code. The
  third — whether `User` means two things — stays open **because the Owner is reconsidering whether
  the superadmin role should exist at all**; see the dedicated entry above. The invariant check in
  drift-check is now live in this repo.

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
