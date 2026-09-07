# Claude's Project Guide - Student Attendance Tracker

## Project Overview

This is a full-stack Student Attendance Tracker application for teachers to manage classes and track student attendance. The system uses a modern tech stack with React frontend and Python FastAPI backend.

## Build gates (installed and proven by `/harness`, 2026-09-01)

Every gate below was proven by breaking it on purpose and watching it go red — a gate nobody has
watched fail is not a gate (PRINCIPLES #2). Rules live in each repo's `CODING_STANDARDS.md`;
everything the gates do **not** prove lives in each repo's `REVIEW-DEBT.md`. Read those two files
before trusting anything in this one.

**client** (`cd client`)
```bash
npm run check              # everything, in order
npm run gate:typecheck     # tsc ratchet   — baseline 4 errors   (.harness-baseline)
npm run gate:lint          # eslint ratchet — baseline 16 errors
npm run gate:tests         # vitest ratchet — baseline 0; any failure breaks it
npm run lint:boundaries    # dependency-cruiser: layering, cycles, orphans, test-in-prod
npm run drift              # devkit drift gate
npm run drift:extra        # compound-vocabulary bans the segment matcher cannot express
```
Pre-commit hook: `.husky/pre-commit` (runs the same set, drift staged-only).

**api** (`cd api`)
```bash
just check-fast            # boundaries + drift + lint + typecheck (~10s, no db) — what the hook runs
just check                 # fast set + the 330-test suite (~7 min, needs TEST_DATABASE_URL)
just boundaries            # import-linter: app.api > app.services > app.models + leaf contracts
just lint                  # ruff ratchet — baseline 93 findings
just lint-verbose          # ruff, showing every finding
just typecheck             # mypy ratchet — baseline 16 findings (ADR-0004)
just typecheck-verbose     # mypy, showing every finding
just drift                 # devkit drift gate + drift-extra.sh (vocabulary, alembic edits)
just install-hooks         # one-off per clone: core.hooksPath -> .githooks
```
The API **has a type gate** since 2026-09-02: `just typecheck` runs mypy over `app/` as a ratchet
at baseline 16 (ADR-0004). It is in `check-fast`, so the pre-commit hook and CI both run it. This
line previously said there was no type gate, which was true — mypy was never installed despite the
old justfile claiming it, and ADR-0001 deferred it on the grounds that the opening baseline "would
be large and unmeasured". Measured, it was 16 across 9 files. The 16 are confessed, not fixed.

Tests DROP tables, so `TEST_DATABASE_URL` is mandatory with no default. **Use the helper** — it
starts a disposable database on port 5439 and prints the export line:
```bash
cd api
eval "$(just test-db-up)"     # or: eval "$(./scripts/test-db.sh up)"
just check                     # 286 tests, ~3.5 min
just test-db-down              # destroys it; there is nothing worth keeping
```

⚠ **Do not point `TEST_DATABASE_URL` at port 5433.** An earlier version of this file told you to,
and it is wrong: on this machine 5433 is `platform-postgres`, a **different project's** container,
and the fixtures call `drop_all`. `deployment/local/docker-compose.yml`'s `db-test` service is also
configured for 5433, so it cannot start either — see the API repo's `REVIEW-DEBT.md`.

### CI/CD

Both repos gate in CI, and both deploy from CI. Same gates as the pre-commit hooks, plus security.

| | frontend (`client/`) | backend (`api/` + `deployment/`) |
|---|---|---|
| Workflow | `.github/workflows/frontend.yml` | `.github/workflows/backend.yml` |
| Fires on | changes under `client/**` | changes under `api/**` or `deployment/**` |
| Jobs | `gates`, `security`, `deploy` | `gates`, `test`, `security`, `deploy` |
| Deploys to | Vercel, via `vercel deploy --prebuilt --prod` | Hetzner, via SSH |
| Gated on | gates + security green, push to `main`, and `vars.DEPLOY_ENABLED` | gates + tests + security green, push to `main` |

Both set `BASELINE_FROZEN=1` so CI never rewrites `.harness-baseline`, and both check out with
`fetch-depth: 0` because the drift gate is a *diff* gate — a shallow clone makes it compare nothing
and report clean, which is a false pass. `scripts/drift-ci.sh` resolves the real range from the
GitHub event.

**Every push to `main` that passes its gates deploys.** No opt-in switch — that is the Owner's
explicit choice. Consequence worth knowing: the backend `deploy` job is a rewrite whose first
execution *is* its verification, so watch the first run. Both workflows also accept
`workflow_dispatch` if you want to trigger one deliberately.

**Manual steps this cannot do for you** (both in `client/REVIEW-DEBT.md`):

1. ~~**Disable Vercel git auto-deploy**~~ — **DONE.** The Owner disconnected the git integration on
   2026-09-01 and confirmed it again on 2026-09-04, which settles a contradiction that stood in
   this file for three days: `client/REVIEW-DEBT.md` recorded the disconnect while this section
   kept listing it as outstanding. **The CI deploy gate is real, not advisory.** Kept here rather
   than deleted because the trap is worth carrying: an empty **Deploy Hooks** list does *not* mean
   auto-deploy is off — the **Connected Git Repository** is what deploys on push, so that is the
   setting to check if a deploy ever races again.
2. **Set the secrets.** Frontend: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` (the last two
   are in the gitignored `.vercel/project.json`). Backend already has `SERVER_HOST`, `SERVER_USER`,
   `SSH_PRIVATE_KEY`, `PROJECT_PATH`.

The **deploy jobs are the one part not proven by breaking them** — exercising them means deploying to
production. Everything else was. Prefer a `workflow_dispatch` run at a quiet moment for the first one.

**Action versions, bumped 2026-09-04:** `checkout` v4→v7, `setup-python` v5→v7, `setup-node` v4→v7,
`upload-artifact` v4→v7. This clears the Node 20 deprecation warning every run printed. Checked
against the release notes rather than assumed safe, because a bad bump here breaks the path that
deploys: the majors in between move the runtime to Node 24 (needs runner ≥2.327.1, and
GitHub-hosted `ubuntu-latest` is well past it), `checkout@v6` persists credentials to a separate
file (no job here pushes or reuses the git credential — the drift gate only reads), `checkout@v7`
blocks fork-PR checkout for `pull_request_target` and `workflow_run` (these workflows trigger on
`push`, `pull_request` and `workflow_dispatch`, none of which is affected), and `setup-python@v7`
removed the `pip-install` input (never passed here — the inputs used are `fetch-depth`,
`python-version`, `node-version`, `cache` and `cache-dependency-path`, all of which survive).
**Like the deploy jobs, this bump cannot be proven locally** — the YAML parses and nothing here
uses a removed input, but its real proof is the next CI run.

Backend deploy rolls back **code** automatically if the health check fails. It does **not** roll back
a migration — alembic has already run by then. The pre-deploy backup is the schema rollback path and
restoring it is deliberate and manual, because it discards writes.

Secret scanning: `gitleaks` over full history, gated. Baseline was 108 findings in the API repo, all
documentation placeholders, allowlisted **by value** in `.gitleaks.toml` so a real token in the same
file still fails. No real credential was found in any of the four repos. Dependency CVE audits
(`pip-audit`, `npm audit`) are report-only in the job summary by choice.

### Measured status, 2026-09-01 — supersedes the claims below

The figures further down this document were not accurate when measured. Corrections:

| Claim in this file | Measured |
|---|---|
| frontend "94.14% coverage" | was **25 of 96 FAILING** with one real network call; **fixed 2026-09-03** — 73 pass, 0 fail. **78 pass as of 2026-09-04** |
| backend "241 tests, 82% coverage" | was **262 pass, 77% coverage** (`student_service.py` at **29%**); **346 pass as of 2026-09-04**, coverage not re-measured |
| backend "63 tests passing, 69% coverage" | a third, also-stale figure in the same document |

And the finding that mattered most, on 2026-09-01: removing the teacher-ownership filter from
`app/services/class_service.py:54` left **all 262 backend tests passing with byte-identical
coverage**. The suite did not test authorization from the denied side.

**That is fixed and stays fixed.** `tests/test_authorization.py` covers all 18 class-reaching
denials plus 8 positive controls, and since spec 0003 (2026-09-04) INV-1 has **one** enforcement
site: neutering it turns 17 of the 18 denials red, and dropping the list filter's `WHERE` turns
the 18th red on its own. `scripts/drift-extra.sh` check 4 now fails any diff that adds a
`teacher_id` comparison in `app/` outside `class_service.py`.

### Domain model, crunched 2026-09-01

`/crunch-domain` ran with the Owner. Both `CONTEXT.md` files are no longer gate seeds, and
**`api/INVARIANTS.md` now exists** with eight `INV-n` rows (INV-8 added 2026-09-02), each naming a
real enforcer. Read it before changing anything in the service layer.

- **Domain dial: on**, 4 of 4 triggers. **Contexts: one** — the only `mapped` trigger either repo
  claimed was `User` meaning teacher-vs-superadmin, and that collision is **gone**: ADR-0003
  removed the superadmin role rather than decide what it may see. `User` means exactly one thing.
- `client-app` deliberately has **no `INVARIANTS.md`**: every enforcer is server-side, so a second
  file would be two formats for one artifact. The drift gate's invariant check is therefore inert in
  that repo *by design* — "no INVARIANTS.md" does not mean "no rules".
- **INV-1** (only a teacher associated with a Class may read or change it) is now enforced by
  `tests/test_authorization.py` — 17 denial tests as a second real teacher, plus 7 positive
  controls. Each of the **seven** ownership sites was neutered individually and the suite watched go
  red. The probe that used to pass silently now fails loudly.
- Worth knowing: those 24 tests moved coverage **not at all** — still 77%, still exactly 272 lines
  missed. They exercise already-covered lines from the denied side, which is precisely why coverage
  was never the safety metric here.
- Two rules the Owner **declined** to create are recorded in `INVARIANTS.md` under *Deliberately not
  invariants*, so no later session re-invents them: there is no attendance threshold for course
  credit (the teacher decides; 14–15 is her rule of thumb), and deleting a Student may destroy their
  whole history (the school holds the credit, this app is a tally sheet).

`DESIGN.md` still does not exist in either repo, so the drift gate's accessibility check remains
inert.

### Security audit, 2026-09-02

`/audit` ran against all four repositories as committed. Threat model the Owner set: the asset is
**real student names and attendance history**; the attacker is **a logged-in teacher probing other
teachers' rows**; the worst outcome is **student data reaching a teacher with no right to it**.
Findings were ranked against that, so a different threat model would rank them differently.

Fixed, each with a regression test watched red first, on branch `fix/audit-2026-09-02`:

| # | Finding | Verdict when found |
|---|---|---|
| 1 | Changing a password revoked **nothing**. A refresh token stolen beforehand kept minting access tokens for 30 days. `revoke_all_user_tokens` existed and had zero callers | **exploited** — demonstrated end to end |
| 2 | `Dockerfile:25` `COPY . .` with no `.dockerignore` baked `.env` (SECRET_KEY inside), `.git` and `venv/` into the image | **exploited** on a developer machine; **production checked 2026-09-03 and was never affected** |
| 3 | The 30-day refresh cookie was scoped `Domain=.kotoio.fi`, so every host under that domain got it — including `app-attendance.kotoio.fi` on Vercel | **reachable** |
| 4 | Docs said refresh tokens last 7 days; code and every runtime config say 30 | doc drift |
| 6 | `conftest.py`'s error message and `.env.test.example` both told developers to point a `drop_all` fixture at **port 5433** — `platform-postgres`, another project's database | destructive footgun |

**What held up, and it is the part the threat model cares about:** all **17 class-reaching routes**
are covered from the denied side by `tests/test_authorization.py`. No raw SQL, no shell-out, no
`eval`, no outbound fetch anywhere in `app/`. Registration codes are 96 bits from `secrets`.
Refresh tokens are hashed at rest. The access token lives only in memory (`client.ts:16`). No
`.env`, key or certificate was ever committed in any of the four repositories.

**Not fixed, and recorded in the API repo's `REVIEW-DEBT.md`:**
- **Dependencies are unpinned** — 21 `>=` ranges, no lockfile. The image installs FastAPI
  **0.141.1** while the tests run against **0.121.3**. Both serve correctly, so this is not a live
  break; it means the gates prove nothing about the artifact that deploys.
- **Two leads nothing in a repo can settle:** the real production `CORS_ORIGINS`; and `gitleaks`,
  which is not installed locally — history was checked independently at file level instead.
  (The third, **whether Vercel git auto-deploy is still disconnected, is CLOSED** — the Owner
  confirmed it on 2026-09-04. It was never a repo question, which is why it sat open for three
  days: the answer lives in a dashboard, so asking the Owner was the only way to get it.)

**The `.env`-in-the-image lead is CLOSED (2026-09-03): the production image never had one.** All
eight backend images on the VM were checked, including seven predating `.dockerignore` and going
back two weeks. All clean, and structurally so — the server's build context is a git clone, `.env`
is gitignored and was never committed, and the VM's only `.env` sits in `deployment/production/`,
which is not the build context. `SECRET_KEY` was never disclosed; no rotation was needed. The
finding was real as a *mechanism* (a developer working tree does have a `.env`, and building from
one bakes it in) and the step from there to "production may be affected" was never evidenced.
`.dockerignore` stays as prevention.

**Finding #3's follow-up is DONE (2026-09-07): `refresh_tokens` was revoked in production.** Every
token issued before that moment is dead, so a refresh token copied before the cookie fix cannot
mint an access token again. Teachers got one failed refresh and a login screen, as expected.

**What revoking does not do, and the earlier wording here got this wrong.** It said revoking
"retires the stale cookies". It kills the *token*, not the *cookie*. The old `.kotoio.fi` cookie
stays in each browser until it expires — up to 30 days from issue, so early October — because
`app/api/auth.py:221` calls `delete_cookie(domain=settings.cookie_domain)` and `cookie_domain` is
empty in production now. The app speaks only for the host-only cookie and has no standing to clear
the domain one. Nothing in the repo can clear it either; the certain cure for one browser is
clearing site data for `kotoio.fi`.

That lingering cookie is harmless, and this was checked rather than reasoned about: browsers send
the older cookie first (RFC 6265 §5.4 sorts by path length, then oldest first) and Starlette's
parser keeps the **last** occurrence, so after a re-login the server reads the new host-only
cookie. Both orderings were run against the installed starlette. If a duplicate-name cookie ever
does cause a refresh loop, that parser precedence is the thing to re-check first.

Out of scope throughout: the Hetzner VM, the Vercel account, DNS, GitHub Actions secrets, and any
traffic to the deployed app. Static and local only; nothing left this machine.

## Quick Reference

### Project Structure
```
student-attendance-tracker/          ONE repository, github.com/mialsu (since 2026-09-03)
├── api/                             FastAPI backend — gates, invariants, ADRs, review debt
├── client/                          React 18 + TypeScript frontend
├── deployment/                      compose, nginx, SSL and backup scripts
│   ├── local/  production/  scripts/
├── docs/                            architecture + the SSL / firewall / backend setup guides
├── .github/workflows/               backend.yml · frontend.yml · security.yml
├── CLAUDE.md  BACKLOG.html  README.md
```

It was four separate repositories in a GitHub organisation until 2026-09-03. They were merged
with `git subtree` rather than a history rewrite, deliberately: `REVIEW-DEBT.md`, `ADR-0004`,
this file and `BACKLOG.html` all cite commit SHAs, and a rewrite would have invalidated every
one. `knowledge-base` is gone as a name; its four files are `docs/`.

**Why one repository:** `deployment/` had no independent lifecycle — it could not deploy itself,
and a compose change only reached the VM when an unrelated backend push happened to run. One
logical change (the 2026-09-02 cookie fix) took three repos, three merges and an ordering rule
that existed only in the deploy script. Now `deployment/**` triggers the backend workflow and one
commit ships the whole deployable unit.

### Tech Stack

**Frontend (✅ Complete - Vercel Deployment):**
- React 18 + TypeScript + Vite
- shadcn/ui + Tailwind CSS
- TanStack Query (React Query)
- React Router v6
- Vitest + React Testing Library — **73 tests, all passing** since 2026-09-03; a test that reaches
  the network now fails by construction (`src/test/setup.ts`). See `client/REVIEW-DEBT.md`
- API integration complete with JWT authentication
- Deployed to Vercel (free tier)

**Backend (346 tests passing, measured 2026-09-04 — type gate: mypy ratchet at 15, ADR-0004):**
- Python 3.12
- FastAPI 0.104+
- SQLAlchemy 2.0 (async)
- Alembic (migrations)
- PostgreSQL 17 (dev + test databases)
- pytest + httpx — **346 tests** (measured 2026-09-04). Coverage was 77% on 2026-09-01 and has
  not been re-measured since; the count has, three times, so trust the count and not the percentage
- Paginated API responses with total counts
- Server-side filtering and search
- Student entity with course credit tracking
- Bulk attendance logging (1-50 records)

**Infrastructure:**
- **Frontend**: Vercel (free tier, global CDN)
- **Backend + Database**: Hetzner Cloud VM (€3.49/month)
  - Docker + Docker Compose
  - Nginx (API gateway with rate limiting)
  - PostgreSQL 17 in Docker
  - Let's Encrypt (SSL)
  - UFW Firewall configured
  - Multi-backend capable (can host multiple hobby projects on same VM)

## Current Status

### ✅ Completed
1. **Frontend (✅ Production Ready - Vercel)**
   - Application fully functional with API integration
   - Auth, login, logout, email and password change are covered at the `src/api` seam (2026-09-03)
   - UI/UX finalized with Finnish localization
   - JWT authentication integrated
   - Server-side pagination with search/filters
   - Debounced search inputs (500ms)
   - Vercel deployment configuration (vercel.json, SPA routing)
   - Environment variables configured for production API URL

2. **Backend API (✅ Production Ready)**
   - FastAPI project structure complete
   - SQLAlchemy models with active status fields (User, Class, Student, AttendanceRecord)
   - Student entity with single name field (eliminates duplicate bug)
   - Course credit tracking per student
   - Pydantic schemas for all entities
   - Service layer with business logic implemented
   - All CRUD API endpoints: Auth (7), Classes (5), Students (7), Attendance (5)
     — counted from `app.routes`, not from memory
   - 346 tests passing (2026-09-04). Authorization **is** now tested from the denied side —
     18 denial tests, and INV-1 has one enforcement site since spec 0003
   - Name normalization with case-insensitive uniqueness
   - Bulk attendance logging (1-50 records at once)
   - Student name autocomplete (ordered by frequency)
   - Legacy student filter on the attendance summary: hides Students whose **first
     attendance** is over five years old, `legacy=true` reveals them, and `legacy_hidden`
     reports how many are held back (spec 0002, 2026-09-04). It read `Student.created_at`
     on an endpoint no screen called until then.
   - JWT authentication with access & refresh tokens
   - Alembic migrations ready
   - **Paginated responses** with total counts for accurate pagination
   - PostgreSQL 17 (development + test databases)
   - Seed data script for manual testing

3. **Deployment Configuration (✅ Production Ready)**
   - **Frontend**: Vercel deployment (automated from Git)
   - **Backend**: Hetzner VM with Docker Compose
     - Local development Docker Compose setup
     - Production Docker Compose with backend, database, nginx (API gateway)
     - Backend containerized with FastAPI
     - Helper scripts for deployment operations
     - SSL setup scripts for Let's Encrypt + Certbot
     - Database backup/restore scripts
     - Nginx configured as API-only reverse proxy
   - CORS configured for Vercel domain
   - Multi-backend setup documentation (host multiple projects on same VM)

4. **Documentation (✅ Comprehensive)**
   - Architecture documentation (ARCHITECTURE.md)
   - API reference with examples (API_REFERENCE.md)
   - Testing guides (TESTING_GUIDE.md, TEST_QUICK_START.md)
   - Deployment README with instructions
   - **Vercel Deployment Guide** (VERCEL_DEPLOYMENT.md) - Frontend deployment
   - **SSL Setup Guide** (SSL_SETUP.md) - Let's Encrypt + Hetzner VM
   - **Firewall Configuration Guide** (FIREWALL_SETUP.md) - UFW + Hetzner Cloud
   - Backend Setup Guide (BACKEND_SETUP.md)
   - Multi-backend hosting documentation

### ✅ Deployed to Production
1. **Frontend**: Deployed to Vercel at `https://app-attendance.kotoio.fi`
   - Automatic CI/CD from Git
   - Environment variable `VITE_API_URL` configured
   - Custom domain configured with CNAME record
2. **Backend**: Deployed to Hetzner Cloud VM at `https://attendance-api.kotoio.fi`
   - Hetzner CX21 VM (2 vCPU, 4 GB RAM, €3.49/month)
   - Docker Compose with PostgreSQL 17, FastAPI, Nginx
   - Let's Encrypt SSL certificate configured
   - CORS configured for Vercel domain
3. **Domain**: kotoio.fi with DNS configured at hostingpalvelu.fi
4. **Status**: Fully operational and accessible

## Data Model

### Entities
```
User (Teacher)
├── id: UUID (PK)
├── email: String (unique, indexed)
├── password_hash: String
├── active: Boolean (default: true)
├── created_at: DateTime
└── updated_at: DateTime

Class (Course/Kurssi)
├── id: UUID (PK)
├── name: String
├── description: Text (optional)
├── teacher_id: UUID (FK → User.id, indexed)
├── active: Boolean (default: true, controls new attendance recording)
├── created_at: DateTime
└── updated_at: DateTime

Student
├── id: UUID (PK)
├── name: String (normalized: "Title Case", e.g. "John Doe")
├── class_id: UUID (FK → Class.id, indexed)
├── course_credit_received: Boolean (default: false)
├── created_at: DateTime
└── updated_at: DateTime

AttendanceRecord
├── id: UUID (PK)
├── class_id: UUID (FK → Class.id, indexed)
├── student_id: UUID (FK → Student.id, indexed)
├── timestamp: DateTime (indexed)
└── created_at: DateTime

RegistrationCode (app/models/registration_code.py)
├── id: UUID (PK)
├── code: String (unique)
├── email_restriction: String (NOT NULL — INV-7, one address per code; legacy rows carry '')
├── used: Boolean (default: false)      — single-use, INV-6
├── revoked: Boolean (default: false)   — revoking does NOT disable an account already created
├── used_by_user_id: UUID | None (FK → User.id)
├── used_at: DateTime | None
├── created_at: DateTime
└── expires_at: DateTime                — created + 24h (CODE_LIFETIME), INV-6

  No creator column: codes are issued from the CLI by whoever has database
  access, so there is no user to record (ADR-0003, dropped in 485b80d1c7a0).

RefreshToken (app/models/refresh_token.py)
├── id: UUID (PK)
├── user_id: UUID (FK → User.id)
├── token_hash: String
├── expires_at: DateTime
├── revoked: Boolean (default: false)
├── revoked_at: DateTime | None
└── created_at: DateTime

Indexes:
- User.email (unique)
- Class.teacher_id
- Student.class_id
- Student (LOWER(name), class_id) composite unique (case-insensitive uniqueness per class)
- AttendanceRecord.class_id
- AttendanceRecord.student_id
- AttendanceRecord.timestamp
```

### Relationships
- User (1) → Classes (N)
- Class (1) → Students (N)
- Class (1) → AttendanceRecords (N)
- Student (1) → AttendanceRecords (N)
- Cascade delete enabled on all foreign keys

## API Design

### Base URL
- Development: `http://localhost:8000`
- Production: `https://attendance-api.kotoio.fi`

### Authentication
- JWT-based with access tokens (15 min) and refresh tokens (**30 days** — the code, both
  compose files and `.env.example` all say 30; the docs said 7 until `/audit` reconciled them
  on 2026-09-02). Changing a password revokes every one of that user's refresh tokens.
- Access token in Authorization header: `Bearer <token>`
- Refresh token in HTTP-only cookie

### Endpoints Summary

**Auth (`/api/auth`):**
```
POST   /signup          - Create teacher account
POST   /login           - Login and get tokens
POST   /refresh         - Refresh access token
POST   /logout          - Logout
GET    /me              - Get current user
PUT    /email           - Update email
PUT    /password        - Update password
```

**Classes (`/api/classes`):**
```
GET    /                - List teacher's classes
POST   /                - Create new class
GET    /{id}            - Get class details
PUT    /{id}            - Update class
DELETE /{id}            - Delete class
```

**Students (`/api/classes/{id}/students`, `/api/students`):**
```
GET    /classes/{id}/students            - List students (paginated, with filters)
POST   /classes/{id}/students            - Create a student in the class
GET    /classes/{id}/students/autocomplete - Autocomplete student names (min 2 chars)
GET    /students/{id}                    - Get student details
PUT    /students/{id}                    - Update student (name, course credit)
DELETE /students/{id}                    - Delete student (CASCADE: destroys all attendance)
POST   /students/{id}/merge              - Merge a duplicate into this student (irreversible)
```

**Attendance:**
```
GET    /classes/{id}/attendance         - List attendance records (with student_name)
POST   /classes/{id}/attendance         - Log attendance (student_name, quantity 1-50)
DELETE /attendance/{id}                 - Delete attendance record
GET    /classes/{id}/attendance/summary - Get summary by student (course credit; legacy= reveals
                                          students whose first attendance is over 5 years old)
GET    /classes/{id}/attendance/statistics - Daily/monthly aggregates (exclude_dates optional)
```

**Admin — there is none.** The three `/api/admin/codes` endpoints and the superadmin role that
guarded them were removed (ADR-0003). Registration codes are issued from the command line, so the
permission "may issue a code" is *having access to the database* rather than a column on a row:

```bash
just code-issue  teacher@school.com      # locally, against DATABASE_URL
just code-revoke teacher@school.com
```
On the server, `docker compose … exec backend python scripts/registration_code.py issue <email>`
— the image has no venv, so the shell wrapper does not apply. See the API repo's
`scripts/README.md`.

## Backend Project Structure

```
student-attendance-tracker-api/
├── app/
│   ├── main.py                    # FastAPI app entry ✅
│   ├── config.py                  # Settings (Pydantic BaseSettings) ✅
│   ├── database.py                # Async database session ✅
│   ├── dependencies.py            # DI (get_db, get_current_user) ✅
│   │
│   ├── models/                    # SQLAlchemy ORM models ✅
│   │   ├── __init__.py
│   │   ├── user.py                # User model (with active field) ✅
│   │   ├── class_.py              # Class model (with active field) ✅
│   │   ├── student.py             # Student model (single name, course credit) ✅
│   │   └── attendance.py          # AttendanceRecord model ✅
│   │
│   ├── schemas/                   # Pydantic schemas ✅
│   │   ├── __init__.py
│   │   ├── user.py                # User schemas ✅
│   │   ├── class_.py              # Class schemas ✅
│   │   ├── student.py             # Student schemas ✅
│   │   ├── attendance.py          # Attendance schemas (with quantity) ✅
│   │   └── auth.py                # Auth schemas ✅
│   │
│   ├── api/                       # Route handlers ✅
│   │   ├── __init__.py
│   │   ├── auth.py                # Auth routes (7 endpoints) ✅
│   │   ├── classes.py             # Classes routes (5 endpoints) ✅
│   │   ├── students.py            # Students routes (6 endpoints) ✅
│   │   └── attendance.py          # Attendance routes (4 endpoints) ✅
│   │
│   ├── services/                  # Business logic ✅
│   │   ├── __init__.py
│   │   ├── auth_service.py        # Auth & user management ✅
│   │   ├── class_service.py       # Class CRUD & ownership ✅
│   │   ├── student_service.py     # Student CRUD & autocomplete ✅
│   │   └── attendance_service.py  # Attendance tracking & bulk logging ✅
│   │
│   ├── core/                      # Core utilities ✅
│   │   ├── __init__.py
│   │   ├── security.py            # JWT, password hashing ✅
│   │   └── exceptions.py          # Custom exceptions ✅
│   │
│   └── middleware/
│       └── __init__.py
│
├── alembic/                       # Migrations ✅
│   ├── versions/
│   │   ├── 47a39df5f687_initial_migration.py  # Initial schema ✅
│   │   └── 01edea317e5e_add_student_model.py  # Student entity migration ✅
│   ├── env.py                     # Alembic env config ✅
│   └── script.py.mako             # Migration template ✅
│
├── tests/                         # Test suite (241 passing) ✅
│   ├── __init__.py
│   ├── conftest.py                # Pytest fixtures (DB, auth, test data) ✅
│   ├── test_main.py               # Basic endpoint tests ✅
│   ├── test_auth.py               # Auth API tests (21 tests) ✅
│   ├── test_classes.py            # Classes API tests (16 tests) ✅
│   ├── test_students.py           # Students API tests (26 tests) ✅
│   ├── test_attendance.py         # Attendance API tests (21 tests) ✅
│   └── test_bulk_attendance.py    # Bulk logging tests (8 tests) ✅
│
├── docs/                          # Documentation ✅
│   ├── TESTING_GUIDE.md           # Comprehensive test guide ✅
│   └── TEST_QUICK_START.md        # Quick test reference ✅
│
├── scripts/                       # Helper scripts ✅
│   ├── generate-migration.sh      # Create migrations ✅
│   ├── apply-migrations.sh        # Apply migrations ✅
│   └── run-tests.sh               # Test runner ✅
│
├── alembic.ini                    # Alembic config ✅
├── requirements.txt               # Dependencies ✅
├── Dockerfile                     # Docker image ✅
├── pytest.ini                     # Pytest config ✅
├── .env.example                   # Env template ✅
├── API_REFERENCE.md               # API documentation ✅
└── README.md                      # Project documentation ✅
```

## Key Dependencies (Backend)

```txt
# Core
fastapi>=0.104.0
uvicorn[standard]>=0.24.0
pydantic>=2.0.0
pydantic-settings>=2.0.0
email-validator>=2.0.0    # For EmailStr validation

# Database
sqlalchemy>=2.0.0
asyncpg>=0.29.0           # PostgreSQL async driver
alembic>=1.12.0

# Auth & Security
python-jose[cryptography]>=3.3.0
passlib[bcrypt]>=1.7.4
bcrypt>=4.0.0,<5.0.0      # Pin to 4.x for passlib compatibility
python-multipart>=0.0.6   # For form data

# Testing
pytest>=7.4.0
pytest-asyncio>=0.21.0
pytest-cov>=4.1.0         # Coverage reporting
httpx>=0.25.0             # Async HTTP client for tests
faker>=20.0.0             # Fake data generation
aiosqlite>=0.19.0         # For in-memory test database

# Development
python-dotenv>=1.0.0
```

## Environment Variables

```bash
# Database
DATABASE_URL=postgresql+asyncpg://attendance_user:password@db:5432/attendance_tracker

# Security
SECRET_KEY=your-secret-key-here-generate-with-openssl
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=30

# CORS
CORS_ORIGINS=http://localhost:5173,https://app-attendance.kotoio.fi

# Environment
ENVIRONMENT=development
```

## Development Workflow

### Backend Development
```bash
# Create virtual environment
cd api
python3.12 -m venv venv
source venv/bin/activate  # Linux/Mac
# or
venv\Scripts\activate     # Windows

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your settings

# Run database (Docker)
docker run -d \
  --name attendance-postgres \
  -e POSTGRES_USER=attendance_user \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=attendance_tracker \
  -p 5432:5432 \
  postgres:17-alpine

# Create first migration
alembic revision --autogenerate -m "Initial migration"
alembic upgrade head

# Run tests
pytest

# Run development server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend Development
```bash
cd client
npm install
npm run dev     # http://localhost:5173
npm run test    # Run Vitest tests
```

### Full Stack (Docker Compose)
```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f backend

# Stop services
docker-compose down
```

## Testing Guidelines

### Backend Testing (✅ Complete)
- **346 tests passing** covering all API endpoints (measured 2026-09-04)
- **77% code coverage** — but `student_service.py` is at 29%, and removing an ownership
  check leaves every test green. Coverage is not a safety metric here.
- **Integration Tests**: All API endpoints tested against a real PostgreSQL 17 database
  (`TEST_DATABASE_URL`, mandatory — the fixtures DROP tables)
- **Test-Driven Development**: Tests written alongside implementation

### Test Suite Breakdown
- **Auth API**: 21 tests (signup, login, token refresh, user management)
- **Classes API**: 26 tests (CRUD operations), and still **not** where ownership is proven —
  `class_service.py:54` is the list filter, and dropping it leaves all 26 green. What catches it is
  `tests/test_authorization.py::test_class_list_does_not_leak_another_teachers_class`, alone.
- **Authorization**: 26 tests — 18 denials as a second real teacher, 8 positive controls. This is
  the file that proves INV-1, and the only one that does.
- **Attendance API**: 21 tests (tracking, filtering, summaries) + 13 for the legacy cutoff
- **Core API**: 5 tests (health check, root endpoint)

### Test Database
- **PostgreSQL 17, never SQLite.** This section claimed "SQLite in-memory" until 2026-09-04 while
  the same document's *Backend Testing* section three headings up said PostgreSQL. `conftest.py`
  requires `TEST_DATABASE_URL` with no default and the fixtures call `drop_all`, so there is
  nothing in-memory about it and nothing to guess about the target.
- `eval "$(just test-db-up)"` starts a disposable database on **port 5439** and prints the export
  line. Not 5433 — that is another project's container, and the fixtures drop tables.
- `TEST_DATABASE_URL` alone is not enough: `app/config.py` is an import-time singleton, so
  `conftest.py` fails at import without `DATABASE_URL`, `SECRET_KEY`, `DOCS_USERNAME` and
  `DOCS_PASSWORD` too. The `env:` block of the `pytest` step in `.github/workflows/backend.yml`
  is the only complete written record of the set — mirror it, any throwaway values will do.
- **Never run two pytest sessions against it at once.** `drop_all` means two runs corrupt each
  other and neither result means anything. `pgrep -af "[p]ytest"` before starting one.
- Fresh schema per test function, async sessions, fixtures for users, classes and attendance.

### Running Tests
```bash
# Run all tests
pytest -v

# Run with coverage
pytest --cov=app --cov-report=html

# Run specific test file
pytest tests/test_auth.py -v

# Run fast (skip slow tests)
./scripts/run-tests.sh fast
```

## Security Checklist

### Backend Security
- [x] Passwords hashed with bcrypt (never store plain text)
- [x] JWT secret key is strong and from environment variable
- [x] CORS configured for frontend domain
- [x] SQL injection prevented by SQLAlchemy ORM
- [x] Input validation with Pydantic
- [x] User active status checked on authentication
- [x] Rate limiting configured in nginx (10 req/s API, 5 req/m auth)
- [x] HTTPS ready with Let's Encrypt setup script
- [x] Database credentials in environment variables
- [x] `/docs`, `/redoc` and `/openapi.json` behind HTTP Basic auth in production, with **no
      default credentials** — `app/config.py` refuses to start when `DOCS_USERNAME` /
      `DOCS_PASSWORD` are missing and the docs are protected. They defaulted to `admin` /
      `changeme` until 2026-09-02 and production ran on that pair, because the compose file never
      passed the real values through. See the API repo's `REVIEW-DEBT.md`
- [x] Database not exposed to internet (localhost only)
- [x] Firewall configured (UFW + optional Hetzner Cloud Firewall)

### Frontend Security
- [x] JWT tokens from backend API
- [x] Access tokens stored in memory (not localStorage)
- [x] Refresh tokens in HTTP-only cookies
- [x] API calls over HTTPS in production
- [x] Security headers configured in nginx

## Common Commands

```bash
# Backend
cd api
pytest -v                                      # Run all tests
pytest --cov=app --cov-report=html             # Run with coverage report
./scripts/run-tests.sh                         # Run tests (via helper script)
./scripts/generate-migration.sh "message"      # Create migration
./scripts/apply-migrations.sh                  # Apply migrations
alembic current                                # Check current migration
uvicorn app.main:app --reload                  # Dev server (port 8000)

# Frontend
cd client
npm run dev                                    # Dev server (port 5173)
npm run test                                   # Run tests
npm run test:coverage                          # Coverage report
npm run build                                  # Production build
npm run lint                                   # Lint check

# Deployment (from project root)
./deployment/scripts/start-local.sh            # Start local environment
./deployment/scripts/stop-local.sh             # Stop local environment
./deployment/scripts/logs.sh local backend     # View backend logs
./deployment/scripts/deploy-prod.sh            # Deploy to production
./deployment/scripts/setup-ssl.sh              # Setup SSL certificates
./deployment/scripts/backup-db.sh production   # Backup database
./deployment/scripts/restore-db.sh production backup.sql  # Restore database

# Seed test data (backend)
cd api
./scripts/seed-db.sh                           # Populate DB with test data

# Docker (manual)
docker-compose -f deployment/local/docker-compose.yml up -d
docker-compose -f deployment/local/docker-compose.yml down
docker-compose -f deployment/local/docker-compose.yml logs -f backend
```

## Troubleshooting

### Database Connection Issues
```bash
# Check if PostgreSQL is running
docker-compose ps db

# Test connection
docker-compose exec db psql -U attendance_user -d attendance_tracker

# Reset database (DANGER: deletes all data)
docker-compose down -v
docker-compose up -d db
alembic upgrade head
```

### Migration Issues
```bash
# Check migration status
alembic current

# View migration history
alembic history

# Reset to specific revision
alembic downgrade <revision_id>
```

### Frontend API Connection
```bash
# Check VITE_API_URL in client-app/.env
echo $VITE_API_URL

# Test backend health
curl http://localhost:8000/health
```

## Code Style Guidelines

### Python (Backend)
- Follow PEP 8
- Use type hints everywhere
- Async/await for all I/O operations
- Docstrings for public functions
- Max line length: 100 characters

```python
# Good
async def get_user_by_email(
    email: str,
    db: AsyncSession
) -> User | None:
    """
    Retrieve a user by email address.

    Args:
        email: User's email address
        db: Database session

    Returns:
        User object if found, None otherwise
    """
    result = await db.execute(
        select(User).where(User.email == email)
    )
    return result.scalar_one_or_none()
```

### TypeScript (Frontend)
- Already established (ESLint configured)
- Use explicit types
- Prefer interfaces for objects
- Use React hooks properly

## Git Workflow

### Branch Strategy
- `main` - Production-ready code
- `develop` - Integration branch
- `feature/*` - New features
- `fix/*` - Bug fixes

### Commit Message Format
```
<type>(<scope>): <subject>

<body>

<footer>
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

Example:
```
feat(auth): implement JWT authentication

- Add JWT token generation and validation
- Implement refresh token mechanism
- Add password hashing with bcrypt

Closes #123
```

## Useful Links

### Documentation
- FastAPI: https://fastapi.tiangolo.com/
- SQLAlchemy 2.0: https://docs.sqlalchemy.org/en/20/
- Alembic: https://alembic.sqlalchemy.org/
- Pydantic: https://docs.pydantic.dev/
- PostgreSQL 17: https://www.postgresql.org/docs/17/

### Frontend (Already Set Up)
- React: https://react.dev/
- TanStack Query: https://tanstack.com/query/latest
- shadcn/ui: https://ui.shadcn.com/

### Tools
- Docker: https://docs.docker.com/
- Hetzner Cloud: https://docs.hetzner.com/cloud/

## Notes for Claude

### When Working on Backend:
1. Always use async/await for database operations
2. Use dependency injection for `get_db()` and `get_current_user()`
3. Validate input with Pydantic schemas
4. Handle errors with proper HTTP status codes
5. Write tests alongside implementation (TDD)
6. Run `alembic revision --autogenerate` after model changes
7. Keep services thin (business logic in services, not routes)

### When Working on Frontend Integration:
1. Use TanStack Query for all API calls
2. Handle loading and error states
3. Update existing localStorage code gradually
4. Test with real API before removing localStorage
5. Update tests to mock API calls

### Architecture Decisions Already Made:
- ✅ Modular Monolith (not microservices)
- ✅ PostgreSQL 17 (not MongoDB)
- ✅ JWT Authentication (not sessions)
- ✅ UUID primary keys (not auto-increment)
- ✅ Async SQLAlchemy (not sync)
- ✅ **Split Deployment**: Vercel (frontend) + Hetzner VM (backend + DB)
- ✅ Multi-backend capable Hetzner server (host multiple hobby projects)

### Don't Change Without User Approval:
- Database choice (PostgreSQL 17)
- Authentication strategy (JWT)
- Deployment architecture (Vercel frontend + Hetzner backend)
- Frontend tech stack (React + TypeScript)
- API structure (already documented in ARCHITECTURE.md)

## Current Task Context

**Last Completed:**
- ✅ Backend API fully implemented with all CRUD endpoints
- 346 backend tests passing, 78 frontend (both measured 2026-09-04)
- ✅ Frontend API integration complete
- ✅ Database migrations ready
- ✅ API documentation complete
- ✅ **Deployment architecture migrated to Vercel + Hetzner split deployment**
- ✅ **Frontend deployed to Vercel at app-attendance.kotoio.fi**
- ✅ **Backend deployed to Hetzner at attendance-api.kotoio.fi**
- ✅ **SSL certificates configured with Let's Encrypt**
- ✅ **Custom domain kotoio.fi configured**
- ✅ **CORS configured for production**
- ✅ **Student Entity Normalization Sprint Complete (deployed to production)**
  - ✅ Student entity eliminates duplicate bug in StudentLogs
  - ✅ Single `name` field replaces first/last names
  - ✅ Course credit tracking per student
  - ✅ Bulk attendance logging (1-50 records)
  - ✅ Student name autocomplete with frequency ordering

**Current Status:** Deployed and operational. **Not** "all green": see the Measured status
table above and each repo's `REVIEW-DEBT.md` for what the gates do not prove.

**Production URLs:**
- Frontend: https://app-attendance.kotoio.fi
- Backend API: https://attendance-api.kotoio.fi
- API Docs: https://attendance-api.kotoio.fi/docs

**Current Features:**
1. ✅ **Student Management**: CRUD operations with case-insensitive uniqueness
2. ✅ **Course Credit Tracking**: Toggle course credit status for students
3. ✅ **Bulk Logging**: Create 1-50 attendance records in one API call
4. ✅ **Autocomplete**: Fast student name suggestions ordered by frequency
5. ✅ **No Duplicate Students**: Fixed StudentLogs bug completely

**Next Development:** Ready for new feature requests or enhancements

**Deployment Cost Breakdown:**
- **Frontend**: Free (Vercel Hobby tier, non-commercial)
- **Backend + DB**: €3.49/month (Hetzner CX21 with €20 signup credit)
- **Total First 5 Months**: Free (using Hetzner credit)
- **Ongoing**: €3.49/month (~$3.80 USD)
- **Multi-Backend**: Can host multiple hobby backends on same VM for cost efficiency

---

**Document Version:** 3.3
**Last Updated:** 2026-09-01
**Maintained by:** Claude (AI Assistant)
**Production Status:** ✅ Deployed and Operational (Student Entity v2.0)
