# ADR-0009 — Every dependency version exact, moved only by a pull request

**Status:** accepted and **implemented**, 2026-09-30, in two pull requests: the Python pins in #18,
then the container image tags and `.github/dependabot.yml`, kept apart for the reason under
*Consequences*.

**Superseded in part by [ADR-0010](0010-compiled-requirements-and-pinned-ci-tools.md),
2026-10-01.** Decisions 1 and 2 below (one flat file taken from `pip freeze`, `tzdata` the one
range) and the rejection of `pip-compile` are replaced: two compiled locks, runtime and dev, from
`requirements.in` and `requirements-dev.in`. **This ADR should have cited
[spec 0007](../../../specs/0007-operational-gaps.md)**, where the Owner had decided `pip-tools` and
that split on 2026-09-11 and rejected `pip freeze` by name. It was written without reading the
spec. Everything else here stands.

On 2026-09-30 a pull request that changed only comments and documentation under `api/` (#17) failed
both backend jobs, and nothing in it was at fault. `requirements.txt` said `sqlalchemy>=2.0.0`, CI
resolved **SQLAlchemy 2.1.1**, and 2.1 no longer installs `greenlet` on its own, so
`tests/conftest.py` could not import. Its types also added a mypy finding in
`app/services/attendance_service.py`, which the ratchet refused. The last green backend run had been
on 2026-09-16. The same file feeds `Dockerfile:22`, so the next image built on the VM would have
lacked `greenlet` too.

The audit recorded the mechanism on 2026-09-02 (`REVIEW-DEBT.md`, *dependencies are unpinned*):
`>=` ranges and no lockfile, so CI, every developer venv and every image resolve PyPI as it stands
that minute. It measured FastAPI 0.141.1 in the image against 0.121.3 under test. The ratchet tools
floated with everything else, so a new ruff or mypy release could fail a commit that changed nothing
they check.

## The decision

1. **`api/requirements.txt` lists every package the API installs at an exact version**, including
   the ones other packages pull in, as `pip freeze` reported them from a fresh venv on 2026-09-30.
   A second fresh venv built from the pinned file froze byte-identical, `pip check` found nothing
   broken, and the full suite passed on it. CI and the Dockerfile keep their
   `pip install -r requirements.txt`, so neither changes.
2. **`tzdata` is the one range.** ADR-0008 chose a package that updates on rebuild over a frozen tz
   database, which goes wrong without saying so. It is data with no dependencies, so it cannot move
   anything else.
3. **SQLAlchemy is held on 2.0.** `opentelemetry-instrumentation-sqlalchemy` declares
   `sqlalchemy < 2.1.0` up to its newest release, 0.66b0. Measured on 2.1.1: the suite passed except
   `tests/test_telemetry.py`, where `instrument()` logged a `DependencyConflict` and returned without
   instrumenting. In production that drops every SQL span from Jaeger. `[asyncio]` is declared so
   `greenlet` is explicit when 2.1 does arrive, and `attendance_service.py` reads the dialect
   through `get_bind()`, which 2.1's types accept.
4. **Versions move by scheduled pull request.** `.github/dependabot.yml` covers pip, npm,
   docker-compose and github-actions: monthly, one grouped pull request per ecosystem, major
   versions never proposed, SQLAlchemy 2.1 ignored until the instrumentation accepts it. Two
   dependencies are kept out of their groups so that each arrives alone: `postgres`, whose tag
   change restarts the database, and `appleboy/ssh-action`, which runs the production deploy and so
   is first exercised by one. CI runs on each pull request, and nothing moves until one is merged.
5. **The compose images have exact tags**: `postgres:17.11-alpine` in both compose files and
   `nginx:1.31.6-alpine` in production; Jaeger was already exact. The Gates job's `nginx.conf`
   check reads its image from the production compose file, so it always runs the nginx production
   runs, and an nginx bump is validated against the new binary before it deploys.

## Rejected alternatives

- **Cap SQLAlchemy below 2.1 and leave the rest as ranges.** It fixes this break and keeps the
  mechanism that caused it: every other range can fail the next unrelated change the same way.
- **Upgrade to SQLAlchemy 2.1 now.** Measured above, and tracing is the price. Forcing the
  instrumentation with `skip_dep_check=True` overrides its maintainers' declared range, with only an
  in-process test to say the spans still come out right.
- **`pip-compile` with a hand-edited `requirements.in`**, the audit's suggestion. It regenerates a
  consistent lock with one command, but it adds a tool and a second file, and it would pin `tzdata`
  as well. Deferred, with a named trigger: if Dependabot's grouped updates of the flat file prove
  inconsistent in its first runs, the file moves to `pip-compile` then.
- **Pin only the direct dependencies.** `greenlet`, the package that went missing, is a transitive
  one.
- **Pin everything and update by hand, with no bot.** Nothing moves and nothing prompts a move
  either, so security fixes wait for someone to remember and every update is a bigger jump.

## Consequences

- A version changes only in a diff. The price is that nothing updates on its own: fixes arrive
  through the scheduled pull requests, or by hand.
- Adding a package means adding its line and the new transitive lines a fresh `pip freeze` shows.
  The header of `requirements.txt` says so.
- **A postgres tag change restarts the production database.** The deploy's migration step, `$COMPOSE
  run --rm backend alembic upgrade head` in `.github/workflows/backend.yml`, passes no `--no-deps`,
  and `backend` depends on `db`. `docker compose run` recreates a dependency whose definition
  changed: verified locally with Compose v5.5.1, where the dependency's container id and image both
  changed. Observed on the VM too, on 2026-10-01: #19's deploy log shows `attendance-db-prod`
  *Recreate* in its migration step, after the backup, and healthy again before the backend was
  swapped. That is why the image tags land in a pull request of their own: its merge is a scheduled
  database restart, after the deploy's backup, and so is every later postgres bump. A minor version
  within 17 keeps the storage format, so no data migration is involved.
- `python:3.12-slim` still floats within 3.12, deliberately: its patch releases carry security fixes
  and the OS tz database `zoneinfo` reads first, which a digest pin would freeze (ADR-0008).
- The CI test service stays `postgres:17-alpine`, also deliberately: it tries each new 17.x before
  production's tag moves to it.
- The SQLAlchemy hold is a ceiling with a named way out: it comes off when
  `opentelemetry-instrumentation-sqlalchemy` declares 2.1 support. The five OpenTelemetry pins then
  move together, and a trace is checked in Jaeger after that deploy (ADR-0006).
