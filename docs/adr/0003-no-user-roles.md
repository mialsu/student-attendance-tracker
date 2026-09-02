# ADR-0003 — No user roles: database access is who may issue a registration code

**Status:** accepted and **implemented**, 2026-09-01, by `specs/0001-registration-code-cli-and-role-removal.md` (Slice 4). The column is dropped by `alembic/versions/48f396b77446_drop_user_role.py`.

This project had two kinds of user — `TEACHER` and `SUPERADMIN` — and the superadmin's entire power
was three HTTP endpoints for issuing, listing and revoking registration codes, plus a web interface
in front of them. Nothing else in the system ever consulted a role: no ownership check made a role
exception, and the role was not even carried in the access token.

We deleted the role. Registration codes are now issued by a command-line tool with direct database
access, so **the permission "may issue a registration code" is expressed as "has access to the
database"** rather than as a column on a row. A signed-in person is a teacher, and `User` means
exactly one thing.

Two reasons this is better rather than merely smaller:

1. **The boundary is stronger.** A role is checked by application code reachable over the internet.
   Database access is not reachable over the internet at all — the database listens on localhost on
   the server and nothing else. Removing the endpoints removes the only remote path to issuing a
   code.
2. **It closes a real vocabulary collision.** "User" meant one thing to the authentication code and
   another to the admin endpoints. That collision was this project's only trigger for splitting into
   multiple bounded contexts, which would have cost a boundary and bought nothing. With the role gone
   the project stays honestly at one context.

## Considered options

**Keep the role, unused.** No migration, smallest diff. Rejected: a column no code reads is drift
with a delay timer. The next session has to establish from scratch whether it is load-bearing, and
the script that sets it would remain the only way to write a value nothing ever checks.

**Keep the creator reference, pointing at a real teacher.** This would have preserved provenance —
who issued each code — without a role. Rejected because the tool's operator is not a user: whichever
teacher got recorded would not have issued the code. A false record is worse than an absent one, and
it would have made the invariant about codes assert something untrue.

**Put the command-line tool over HTTP instead of the database.** The tool would log in and call the
existing endpoints, so one code path issues codes whether or not a user interface ever returns.
Rejected: it requires the role to survive in order to hold a token, keeps an authenticated admin
surface live in production with nothing in front of it, and adds credential handling to a tool whose
whole advantage is having none.

## Consequences

The creator reference on a registration code is **dropped, not nulled**. Every code from now on has
no creator, and a column empty for every new row is the drift this decision exists to avoid.
Dropping it also disposes of an `ON DELETE CASCADE` that would have deleted every code a removed user
had issued, including redeemed ones — the audit-trail problem is deleted rather than fixed. The
*redeemer* reference stays: who signed up with which code is real history.

Existing rows lose the record of who created them. With one operator and a handful of codes, that
record read "the Owner, via the dashboard" in every case.

## What this ADR does not decide

It does not say roles will never return. If a second operator ever needs to issue codes without
database access, that is a new decision with a new trade-off, and it supersedes this one rather than
contradicting it — the revisit trigger is written into the spec's non-goals.

It also does not weaken authorization. Teachers were never separated from each other by a role; they
are separated by `INV-1`, enforced independently and proven from the denied side by
`tests/test_authorization.py`. That suite passing unchanged is an acceptance criterion of the slice
that removes the role, precisely so this claim is checked rather than asserted.
