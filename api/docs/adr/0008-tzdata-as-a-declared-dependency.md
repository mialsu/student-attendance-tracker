# ADR-0008 — `tzdata` as a declared dependency, not an inherited one

**Status:** accepted and **implemented**, 2026-09-15, with [spec 0009](../../../specs/0009-local-day-boundaries.md).

Spec 0009 made every date this API reports depend on `zoneinfo.ZoneInfo(settings.app_timezone)`.
`zoneinfo` reads the operating system's tz database and falls back to the PyPI `tzdata` package
when there is none. So the correctness of every date on the teacher's screen now rests on a file
tree nobody in this repository put there.

**It works today, and that was checked rather than assumed.** Running the real base image:

```
$ docker run --rm python:3.12-slim python -c "..."
RESOLVED: Europe/Helsinki
Jan midnight -> 2026-01-14T22:00:00+00:00
```

which is the same instant PostgreSQL 17 computes for the same local midnight. Debian ships tzdata,
so `python:3.12-slim` carries it.

## The decision

Add `tzdata>=2024.1` to `requirements.txt`.

Not because it is missing — because *this project has not said it needs it*. The dependency is
real either way; declaring it is the difference between a requirement and a coincidence. The same
`requirements.txt` already carries the project's confessed weakness: almost every line is a `>=`
range with no lockfile, so what installs is whatever was newest at build time. A base image
changing its package set is exactly the kind of silent move that file cannot currently notice.

What the declaration buys, concretely: if the image ever stops shipping a tz database,
`app/config.py`'s `_timezone_must_resolve` validator raises at import and the container refuses to
start, loudly, instead of the alternative — and the alternative is the reason this is an ADR
rather than a line in a commit. `zoneinfo` does not fail soft in a useful way here; a missing zone
raises, but a *stale* one silently returns the wrong offset after a DST rule change, and every
date in *Tilastot* moves by an hour's worth of midnight without a single test going red.

## Rejected alternatives

- **Rely on the base image, add nothing.** It is true today and provable, which is the trap: it is
  provable *of the image that happens to be current*. `python:3.12-slim` is not pinned by digest
  anywhere in this repository, so "verified" has a shelf life measured in whenever the tag moves.
  Rejected on the same reasoning ADR-0004 used against a deferral resting on an unmeasured
  prediction — except here the measurement is right and it is the *durability* that is assumed.
- **`apt-get install tzdata` in the Dockerfile.** Fixes the image and not the tests, the local
  `venv`, or CI — four places that resolve timezones, one of which would be covered. It also puts
  a Python-level dependency in a system-level file, where `pip-audit` and the dependency review
  cannot see it.
- **Pin the base image by digest instead.** Worth doing, and it solves a different problem. It
  would freeze the tz database along with everything else, including its DST rules, which for this
  dependency is a downgrade: tz rules change by legislation several times a year and a frozen
  database is wrong *quietly*. Declaring the package lets it update on rebuild.
- **Drop `zoneinfo` and hardcode +02/+03.** Rejected in spec 0009 itself. Finland's rules are not
  the agent's to predict, the EU has repeatedly discussed abolishing the switch, and the tests run
  at both offsets precisely so that a hardcoded number fails one of them.
- **Do the conversion only in PostgreSQL, which has its own tz database.** Tempting, since the
  grouping already does exactly that with `AT TIME ZONE`. But the range bounds are computed in
  Python on purpose, so the comparison stays sargable and the index on `AttendanceRecord.timestamp`
  is still used (spec 0009). Moving them into SQL to avoid one dependency would trade an index for
  a package, and the two tz databases would then need to agree anyway.

## Consequences

- One more line in a `requirements.txt` that is already unpinned. This ADR does not fix that; the
  confession about unpinned dependencies stands in `REVIEW-DEBT.md` and is untouched here.
- `tzdata` is a data package with no code and no transitive dependencies, so the CVE surface it
  adds is nil and the audit noise is nil.
- The image grows by roughly 1 MB, against a container that already carries `gcc` and
  `postgresql-client`.
