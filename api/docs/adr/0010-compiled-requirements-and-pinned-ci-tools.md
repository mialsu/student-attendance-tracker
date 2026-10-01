# ADR-0010 — Requirements compiled by pip-tools and split from the dev set, and CI's tools pinned

**Status:** accepted and implemented, 2026-10-01, as spec 0007's slices 3 and 4. **Supersedes
ADR-0009's decisions 1 and 2** (one flat file from `pip freeze`, `tzdata` the one range) and its
rejection of `pip-compile`. Its other decisions stand: every version exact, moved by Dependabot's
monthly pull requests, SQLAlchemy held on 2.0, image tags exact. **Amends ADR-0008:** `tzdata` is
now pinned like everything else.

## Context

The Owner had already decided this, on 2026-09-11, in `specs/0007-operational-gaps.md`:
`requirements.in` and `requirements-dev.in` compiled by `pip-tools`, with the image installing the
runtime half only. Spec 0007 rejected `pip freeze` by name. ADR-0009 pinned the flat file with
`pip freeze` on 2026-09-30 and listed `pip-compile` as a rejected alternative without citing the
spec at all. Nobody re-read the spec before writing it (`REVIEW-DEBT.md`, 2026-10-01).

ADR-0009 deferred `pip-compile` with a trigger: Dependabot's grouped updates of the flat file
proving inconsistent in its first runs. The first run fired it the same morning. #23 moved
`pydantic_core` to 2.49.0 on its own line while `pydantic` 2.13.5, the newest stable release, pins
`pydantic-core==2.46.5`; 2.49.0 exists for the 2.14 pre-releases. A flat file has no resolver
behind it, so the bot weighs each line alone and would have proposed that line every month until
pydantic 2.14 shipped. pip could not install the result.

The same day showed the pins stopping at the edge of the application. CI downloaded four tools at
whatever was newest: gitleaks through an unauthenticated GitHub API call that returned 403 and
failed #21's secret scan, `vercel@latest` inside the production deploy job, `pip-audit`, and pip
itself.

## The decision

1. **Two intents, two locks.** `requirements.in` says what the API needs to run and why each
   constraint exists; `requirements-dev.in` adds the suite and the gates on top of it, with
   `-c requirements.txt` so every runtime package is held to the version the image runs.
   `scripts/lock.sh` (`just lock`) compiles both with `pip-compile --strip-extras` from a throwaway
   venv; the `.txt` files are its output and are never edited by hand. `--strip-extras` is what
   lets `-c requirements.txt` work at all, since pip refuses a constraint that carries an extra.
2. **The image installs `requirements.txt` alone.** `api/Dockerfile` did not change; the file it
   reads lost the 22 packages only the suite and the gates use. CI, `just install` and
   `scripts/bootstrap.sh` install `requirements-dev.txt`.
3. **The conversion moved no version.** The two locks hold the same 82 packages at the versions the
   flat file pinned, checked name by name, with one exception: `tzdata`, a range until now, is
   pinned at 2026.4, the newest release. The suite passed on a venv built from the dev lock.
4. **`tzdata` is pinned.** `pip-compile` pins every package it writes. Keeping one range would need a
   second install step in the Dockerfile, in CI and in `bootstrap.sh`. ADR-0008's worry was a frozen
   tz database that goes wrong without saying so; the monthly pull request moves it, so the copy
   is at most a month behind.
5. **Two gates, both watched failing.** `scripts/drift-extra.sh` check 6 fails a test or lint
   package in the runtime file (spec 0007, AC-7). Check 7 fails a compiled line that is not
   `==`, and a runtime package that the two locks pin differently or that is missing from the dev
   lock (AC-8, and the static half of AC-9).
6. **CI's own tools are exact**: gitleaks 8.30.1 from its release URL with the tarball's sha256
   checked, and no API call; Vercel CLI 62.1.0; pip-audit 2.10.1; pip 26.2.1. Each is the version CI
   ran on 2026-10-01, so pinning changed nothing that ran. Dependabot reads none of these lines,
   so they move by hand, and the comment beside each says how.

## Rejected alternatives

- **Hold `pydantic_core` by hand.** It unblocks #23 today, and the same edit recurs every month until
  pydantic 2.14. The OpenTelemetry packages require each other at exact versions too, so the
  next mismatch was already queued behind this one.
- **A Dependabot `ignore` for `pydantic-core`.** It moves the failure to the next pydantic release,
  which would then arrive without the core it needs.
- **`uv`** (spec 0007's own argument): a better tool, and a new toolchain on the VM, in CI and in
  every developer's shell for a problem `pip-compile` solves.
- **Leave the ranges and pin only the image** (spec 0007): two sources of truth for one dependency
  set.
- **`--generate-hashes`** (spec 0007, out of scope): the stronger guarantee against a tampered
  download. The gap closed here is that the image and the suite disagreed, which hashes do not
  touch, and they make every install slower and every added package noisier.
- **`tzdata` outside the lock**, installed by a separate `pip install --upgrade tzdata`. Three
  places would have to remember the second step, and the image would again install something no
  lock records.
- **Homes Dependabot can read for the CI tools**: the Vercel CLI as a client devDependency, the
  gitleaks GitHub Action, a pip-audit action. The first adds 285 packages to every `npm ci`; the
  others replace a few lines of shell with a third-party action holding a token. Four versions moved by
  hand is the smaller cost.

## Consequences

- Adding a package: a line in the right `.in` file with its reason, then `just lock`. The `.txt`
  diff shows what it brought with it, and drift-check's check 3 still asks for an ADR when a new
  name appears.
- Dependabot recompiles both locks from the command in their headers. Whether it handles the
  `-c requirements.txt` layering cleanly is unobserved until its first run after this lands;
  check 7 fails the pull request if it does not.
- The local backend container (`deployment/local`) builds from the same Dockerfile, so it has no
  pytest any more. The suite runs from `api/venv`, as CI's does.
- The image keeps the pip of `python:3.12-slim` (25.0.1 on 2026-10-01) to install its lock. It
  floats with the base image, which ADR-0009 leaves floating on purpose.
- `scripts/lock.sh` holds pip-tools 7.6.1, pip 26.2.1 and click 8.2.1. Under click 8.5.0, pip-tools
  7.6.1 writes a spurious `--no-index` into the header, and the header is the command Dependabot
  replays.
- The four CI tool versions go stale unless someone moves them; nothing proposes a change.
