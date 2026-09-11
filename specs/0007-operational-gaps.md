# Spec 0007 — the gaps between what the repo proves and what production does

**Status:** shaped 2026-09-11, not started
**Weight:** Standard
**Domain dial:** on (project-wide); this spec touches no `INV-n` directly — see *Invariants touched*

---

## Problem Statement

Four findings, all surfaced on 2026-09-11 while deploying spec 0005, and all the same defect: the
gates are green, the deploy is green, and **none of it is evidence about the thing serving the
teacher.**

1. **Nothing schedules a backup.** `deployment/README.md:246` records it, verified on the server
   2026-08-16: no cron entry, no systemd timer, one backup on disk. The only regular backup is the
   pre-deploy one the CI deploy job takes, so the real cadence is *whenever you deploy* — three
   times on 2026-09-11, and before that 2026-09-09.

   This matters because of what the app can destroy. Deleting a Student cascades and takes their
   whole attendance history, and spec 0005 records **only the count** destroyed, never the
   content — chosen knowingly (0005's *Non-Goals*: "Not a recovery mechanism"). So the audit trail
   can tell you precisely how much history vanished and cannot help you get it back. The restore
   path is a backup that may be weeks old.

2. **The production image is not what the gates tested.** `api/requirements.txt` is one file
   holding runtime and development dependencies, and `api/Dockerfile:22` installs all of it. The
   2026-09-11 deploy log shows the image installing `pytest`, `pytest-asyncio`, `pytest-cov`,
   `faker`, `ruff`, `mypy`, `import-linter` and `coverage` into the container that serves real
   student data. Separately, almost every line is a `>=` range with no lockfile, so the image
   resolved `fastapi 0.141.1`, `starlette 1.6.0`, `pydantic 2.13.5` and `mypy 2.3.1` at build
   time — whatever was newest at that moment, and not what CI ran the suite against. Both halves
   are already confessed in `api/REVIEW-DEBT.md`; this spec is where they get fixed.

3. **`logs.sh --json` cannot do a one-shot read.** It hardcodes `-f`, so it never exits. Every
   `live:` verification on 2026-09-11 had to bypass it and call `docker compose logs` directly —
   a tool that cannot perform the check its own acceptance criterion describes.

4. **A deploy comment asserts something false.** `.github/workflows/backend.yml` step 6 says *"The
   database is never taken down"*. Step 5 runs `compose run --rm backend alembic upgrade head`
   with no `--no-deps`, so compose brings dependencies to spec first; on 2026-09-11 that recreated
   PostgreSQL for about six seconds. True of step 6, false of the deploy.

## Solution

Three slices of work and one comment fix. No new service on the VM, no external account, no
outbound mail — `setup-ssl-monitoring.sh`'s standing rule is respected throughout, and the Owner
reaffirmed it on 2026-09-11.

- **Backups become scheduled and verified.** A systemd timer copying the shape
  `ssl-cert-check.timer` already proves on this VM, calling the existing `backup-db.sh`. The
  script gains `set -o pipefail` and an artifact check, because scheduling it unchanged would
  accumulate silently-truncated archives rather than one.
- **Dependencies are split and pinned.** Runtime and development requirements become separate
  files; the image installs only runtime. Versions become exact, so `just check` and the deployed
  artifact agree.
- **`logs.sh` can answer a question and exit.**
- **Step 6's comment says what the deploy actually does.**

## User Stories

1. As the Owner, I want a backup taken **without me doing anything**, so that the gap between
   "the teacher deleted a Student" and "the last time I happened to deploy" stops being the
   window I can lose.

2. As the Owner, I want a **failed** backup to be as visible as a successful one, so that a
   scheduled job silently producing nothing for a month is not how I find out.

3. As the Owner, I want the number of backups on disk bounded and known, so that neither the
   CX21's disk nor the number of copies of real student names on it grows without a decision.

4. As the Owner, I want the image that serves production to contain **only what it needs to
   serve**, so that test and lint tooling is not attack surface next to student data.

5. As the Owner, I want `just check` and the deployed image to install the **same versions**, so
   that a green gate is evidence about the artifact rather than about a resolution that happened
   once on a runner.

6. As the Owner verifying a `live:` criterion, I want `logs.sh` to read the log and **exit**, so
   the documented tool is the one I actually use.

7. As a future session reading the deploy, I want its comments to describe the deploy, so I do not
   reason from a claim the pipeline contradicts.

## Implementation Decisions

### The backup timer

`systemd`, not cron, and the reason is precedent rather than taste: `ssl-cert-check.timer`,
`ssl-cert-check.service` and `certbot-failure-notify.service` already live in
`deployment/production/monitoring/` and are installed by `setup-ssl-monitoring.sh`. A second timer
alongside them reuses a pattern that has run on this VM for weeks. Cron would be a second
scheduling mechanism for one job.

**Failure is surfaced the way SSL failure already is:** `logger -t` into the journal at
`daemon.err`, plus a cached status file the MOTD banner reads. `certbot-failure-notify.service` is
the exact shape, including the `OnFailure=` wiring that makes a *failed run* loud rather than
silent. Nothing leaves the machine.

### `backup-db.sh` gains a pipefail guard

It currently runs `docker exec … pg_dump … | gzip > file` with no `set -o pipefail`, so a failed
dump writes a truncated archive and the script exits 0. The CI deploy job already worked around
this — it verifies the artifact with `gzip -t` and a 2 KB floor rather than trusting the exit code.
That workaround moves into the script, where both callers get it.

### Retention, and why the number is a privacy decision

The script keeps the 7 most recent (`ls -t backup_*.sql.gz | tail -n +8 | xargs -r rm`). Under a
nightly timer that becomes *seven days* of history rather than seven deploys.

A `pg_dump` of this database contains **every Student's name** — unlike a log line, which `INV-9`
keeps name-free. So the retention count sets how many complete copies of real student data sit on
the VM, and raising it for recovery comfort raises that too. `ADR-0007` already argues the existing
seven; any change to the number belongs in that argument, not in a script edit.

**Recommendation, for the Owner to confirm:** nightly at 03:15 Europe/Helsinki, keep 14. Two weeks
covers "she mentioned it a while ago", 14 gzipped dumps of this dataset are megabytes, and it
doubles the on-disk copies from 7 to 14 — which is the part worth saying out loud.

### The requirements split

Two files: `requirements.txt` (runtime, what the image installs) and `requirements-dev.txt`
(the suite, the gates, and `-r requirements.txt`). `api/Dockerfile` keeps installing
`requirements.txt` only, so the split alone removes the test and lint packages from the image with
no Dockerfile change.

`aiosqlite` goes to the **dev** file, not away: `tests/test_telemetry.py:28` builds a
`sqlite+aiosqlite:///:memory:` engine, so it is a live test dependency despite this project running
PostgreSQL everywhere else.

### Pinning

**Recommendation: `pip-tools`.** `requirements.in` and `requirements-dev.in` hold the intent
(`fastapi>=0.104`), `pip-compile` produces `requirements.txt` / `requirements-dev.txt` with exact
versions, and the compiled files stay the thing the image and CI install — so the Dockerfile does
not change and the artifact becomes reproducible.

Rejected, and why:

| Alternative | Rejected because |
|---|---|
| `pip freeze > requirements.txt` | flattens intent and the file becomes unreadable; nothing records that `fastapi>=0.104` was the requirement |
| `uv` | faster and genuinely better, but it is a new toolchain on the VM, in CI and in every developer's shell for a problem `pip-compile` solves |
| Leave ranges, pin only in the image | two sources of truth for one dependency set; the *Two formats for one artifact* anti-pattern |

`--generate-hashes` is deliberately **not** proposed in this slice. It is the stronger guarantee
and it makes every install slower and every add noisier; the gap being closed here is
"CI and the image disagree", not "a package was tampered with in transit".

### `logs.sh --once`

Drop `-f` when stdout is not a terminal (`[ -t 1 ]`), and accept an explicit `--once` for the
piped case where the caller wants to be sure. A terminal invocation keeps following, which is what
`logs.sh production backend` is for.

## Testing Decisions

The backup timer and the MOTD path are **VM-only**: no test in this repo can observe a systemd
timer firing. They are `live:` criteria and the Owner exercises them, the same standing the deploy
job has.

What *is* gateable and will be gated:

- The pipefail fix, by planting a failing `pg_dump` and watching the script exit non-zero. A shell
  test, run locally against a throwaway container — never the production database.
- The requirements split, by a check that the runtime file names no test or lint package. A grep in
  `scripts/drift-extra.sh`, so a dev dependency drifting back into the runtime file fails the diff
  rather than being noticed at the next deploy.
- Pinning, by a check that every line in the compiled files is `==`.
- `logs.sh --once`, by a shell test asserting it terminates.

**Every gate added here is watched failing on purpose first**, and the negative control matters as
much: a gate nobody has watched stay green gets disabled the first time it cries wolf.

## Acceptance Criteria

Verdicts are filled by `/verify-live`, per criterion. A task's verdict is the **worst** of them.

| # | Criterion | Proven by | Serves | Verdict |
|---|---|---|---|---|
| AC-1 | A backup exists on the VM that no deploy and no human command produced, newer than the most recent deploy | `live:` | US-1 | |
| AC-2 | A failed backup is visible without going looking for it: the journal carries it at `daemon.err` and the MOTD status reflects it, watched by making a run fail on purpose | `live:` | US-2 | |
| AC-3 | `backup-db.sh` exits **non-zero** when `pg_dump` fails, and writes no archive that passes `gzip -t`, watched failing on a planted failure | `test:` | US-2 | |
| AC-4 | Never more than the agreed count of archives on disk, and the oldest is that many days old | `live:` | US-3 | |
| AC-5 | The agreed count of archives, measured, leaves the CX21 disk with headroom — a number, taken on the VM | `live:` | US-3 | |
| AC-6 | The production image installs **no** test or lint package: `pytest`, `pytest-asyncio`, `pytest-cov`, `faker`, `aiosqlite`, `ruff`, `mypy`, `import-linter`, `coverage` all absent from `pip list` in the built image | `live:` | US-4 | |
| AC-7 | A dev dependency added to the runtime requirements file fails the diff, watched failing on a planted line | `gate:` drift-extra | US-4 | |
| AC-8 | Every line in both compiled requirements files pins with `==`, watched failing on a planted range | `gate:` drift-extra | US-5 | |
| AC-9 | The versions `just check` installs and the versions in the built image are **identical**, compared field by field | `live:` | US-5 | |
| AC-10 | The full suite passes against the split and pinned set, with the ratchets unchanged | `test:` | US-4, US-5 | |
| AC-11 | `logs.sh production backend --json` **terminates** when stdout is not a terminal, and still follows when it is | `test:` | US-6 | |
| AC-12 | Step 6's comment in `backend.yml` describes what the deploy does to the database, and names step 5 as the reason | `review-only` | US-7 | |

**Invariants touched:** none directly. `INV-9` is adjacent and unchanged — it scopes to *lines this
application emits*, and a `pg_dump` is not one. AC-4's count nonetheless decides how many complete
copies of Student names sit on the VM, which is `ADR-0007`'s argument rather than this spec's.

## Tracer Slices

Each cuts to something observable and is demoable alone. Blocking order.

1. **The backup script tells the truth.** `set -o pipefail`, the artifact check moved in from the
   deploy job, and the shell test that plants a failing dump. Demoable: break `pg_dump` on purpose,
   watch the script fail instead of writing a truncated archive. AC-3.
2. **The timer.** The unit, the timer, the `OnFailure=` notifier and the MOTD status file, installed
   the way `setup-ssl-monitoring.sh` installs its siblings. Demoable: a backup appears overnight
   that nobody asked for. AC-1, AC-2, AC-4, AC-5.
3. **The requirements split.** Two files, the image shedding its test tooling, the drift check that
   keeps them apart. Demoable: `pip list` in the built image, with no `pytest`. AC-6, AC-7, AC-10.
4. **Pinning.** `.in` files, `pip-compile`, the `==` gate, and the CI-versus-image comparison.
   Demoable: the two version lists, identical. AC-8, AC-9, AC-10.
5. **The two small ones.** `logs.sh --once`, and step 6's comment. AC-11, AC-12.

Slice 2 puts a file in `deployment/production/monitoring/`, so its push **deploys** — and slices 3
and 4 change `api/requirements.txt`, which the image installs, so their push rebuilds the image
that serves production. Both want the Owner's explicit go, and slice 4 in particular is the first
deploy where the image's dependency set changes deliberately.

## Out of Scope

- **Any new service on the VM.** No Loki, no Promtail, no Grafana, no agent. `ADR-0006` and
  `ADR-0007` settled this and nothing here reopens it.
- **`--generate-hashes`.** Argued above; the gap is disagreement, not tampering.
- **Touching the existing seven-backup retention argument in `ADR-0007`** beyond the number the
  Owner confirms here.
- **Rewriting `backup-db.sh`'s restore counterpart.** `restore-db.sh` is deliberate and manual
  because it discards writes; nothing here makes it automatic.
- **The four stale topic branches** from 2026-09-07 and the two merged ones. Repository hygiene,
  not a spec.

## Non-Goals

- **Not** an alerting system. **The Owner decided on 2026-09-11 that an `ERROR` line should not
  reach them at this stage**, and `setup-ssl-monitoring.sh`'s rule — no external services, no
  accounts, no outbound mail — stays whole. The backup timer's failure path uses the journal and
  the MOTD banner because that is where the SSL check already puts its own, not as a step toward
  notification.
- **Not** off-site backup. Deferred by the Owner, with the research kept: **Hetzner Storage Box
  BX11, €3.20/month for 1 TB, selectable Helsinki datacenter**, reachable by `restic` over its
  native SFTP backend, with up to 100 directory-scoped sub-accounts and 10 scheduled server-side
  snapshots. The three things that make it the candidate when this is picked up: it is the same
  provider and invoice, the data stays in Finland, and `restic` encrypts **client-side** — which
  matters because a dump carries every Student's name where a log line carries none. Server-side
  snapshots are the answer to a compromised VM deleting its own backups. Price to be confirmed
  against the Hetzner console rather than a reseller listing before anyone commits.
  → Slice 1 must therefore leave the archives somewhere `restic` can later pick up, and must not
  become a format only this script understands.
- **Not** a recovery mechanism for a deleted Student's history beyond restoring a whole database.
  Spec 0005 declined the content-level record knowingly; this spec does not revisit it.

## Open Questions

1. **Does a backup failure deserve the MOTD banner, or nothing at all?** The Owner said an `ERROR`
   *log line* should not reach them at this stage. A failed **backup** is a different event — the
   thing that silently produces nothing for a month is the classic scheduled-job failure — and the
   MOTD path reaches nobody until the next SSH login, so it arguably breaks no rule. AC-2 assumes
   the banner. **If the answer is "nothing", AC-2 is struck and the timer is fire-and-forget**,
   which is a materially weaker slice 2 and should be a deliberate choice rather than a default.
2. **Retention: nightly, keep 14?** Recommended above, with the privacy consequence stated. The
   Owner sets the number because it is a decision about copies of student data, not disk.
3. **`pip-tools`, or `uv`?** Recommended `pip-tools` with the alternatives above. If `uv` is
   wanted anywhere on this machine eventually, doing it here rather than twice is the argument
   against the recommendation — worth an ADR if the answer is `uv`.

## Spec Deltas

_None yet._
