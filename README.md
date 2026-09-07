# Student Attendance Tracker

A teacher records who turned up. That is the whole product, and the interesting part
is everything around it: a live deployment, a domain model with enforced invariants,
a security audit with demonstrated findings, and gates that were each proven by being
broken on purpose.

Built solo, in the open, as a reference for how a small application can be held to a
standard usually reserved for larger teams.

| | |
|---|---|
| **Frontend** | React 18 · TypeScript · Vite · shadcn/ui · TanStack Query → Vercel |
| **Backend** | Python 3.12 · FastAPI · SQLAlchemy 2.0 async · Alembic · PostgreSQL 17 → Hetzner |
| **Live** | `app-attendance.kotoio.fi` · `attendance-api.kotoio.fi` |

## Layout

```
api/          FastAPI backend. Gates, tests, invariants, ADRs, review debt.
client/       React frontend.
deployment/   Docker Compose, nginx, SSL and backup scripts for the Hetzner VM.
docs/         Architecture, and the SSL / firewall / backend setup guides.
CLAUDE.md     How the whole thing is built, and what the gates do and do not prove.
BACKLOG.html  What is owed, ranked, with the evidence for each item.
```

## What is worth reading if you are here to learn something

- **`api/INVARIANTS.md`** — the rules the domain may not break, each naming the test or
  constraint that fails when it is violated. An invariant with no enforcer is prose.
- **`api/REVIEW-DEBT.md`** — everything the green tests do *not* prove, written at the
  moment the corner was cut rather than reconstructed later.
- **`api/docs/adr/`** — decisions with their rejected alternatives, including one that
  reverses an earlier ADR because its stated reason did not survive measurement.
- **`api/tests/test_authorization.py`** — authorization tested from the *denied* side.
  It exists because deleting an ownership filter once left the entire suite green.

## Honesty

This repository tries not to overclaim. Test counts and coverage figures in the docs
are measured, not remembered, and where a claim turned out to be stale the correction
is recorded next to it rather than quietly edited. `BACKLOG.html` lists what is broken
and what is merely owed. Nothing is failing right now: measured on 7 September, 346
backend tests pass at 80% coverage, the frontend suite was fixed on 3 September, and all
three CI workflows were green on the last push. The number worth distrusting sits inside
that 80% — `app/services/student_service.py` is covered at 29%, the least-exercised file
in the backend.
