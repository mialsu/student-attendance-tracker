# Student Attendance Tracker — API

The words this service's code, schema, API and conversation all use for the same things.

> **This file is a GATE SEED, not the domain model.** `/harness` seeded it from evidence in the
> committed code so `scripts/drift-check.sh`'s vocabulary check has something to enforce. The real
> glossary — every term, agreed and recitable by the Owner with the file closed — is
> `/crunch-domain`'s output and is still owed (see `REVIEW-DEBT.md`). Do not cite this file as
> though the domain has been modelled. (ANTI-PATTERNS: *the pseudo-artifact*.)

Format follows the installed `domain-modeling` skill's `CONTEXT-FORMAT.md`, per METHOD.md's reuse
rule. This repo and `client-app` describe **one** domain; when they disagree about a word, that
disagreement is the bug.

## Language

**Student**:
A person whose attendance is recorded against a Class. Identified by a single normalized `name`
("Title Case"), unique case-insensitively within its Class via the
`(LOWER(name), class_id)` composite index.
_Avoid_: pupil, attendee, learner
_Unresolved_: whether a Student is one person across Classes or a per-Class row that merely shares
a name. The schema says per-Class (`Student.class_id` is required); the autocomplete-ordered-by-
frequency endpoint reads as though it is cross-Class. Owner call.

**Class**:
The course a Teacher owns and records attendance against. `active` controls whether NEW attendance
may be recorded; an inactive Class keeps its history.

**Attendance record**:
One dated occurrence of one Student being present in one Class. The unit that bulk logging creates
1–50 of at a time.
_Avoid_: checkin

**Course credit**:
A per-Student boolean (`course_credit_received`) saying the Student earned the credit. Distinct
from attendance — `course` is legitimate vocabulary here and is deliberately NOT on any `_Avoid_`
list.

**Teacher**:
The authenticated owner of a set of Classes. Modelled as `User` with `UserRole.TEACHER`.
_Unresolved_: `User` carries both `TEACHER` and `SUPERADMIN`, so "user" means one thing to the auth
code and another to the admin endpoints. If that collision is real, it is the trigger — and the
only valid trigger — for the domain dial's `mapped` setting. Not resolved here.

**Registration code**:
A code a superadmin issues that lets someone create a Teacher account. Has an optional email
restriction and a used-by/created-by pair.
_Unresolved_: single-use or reusable, and what happens to accounts created by a code that is later
revoked. Owner call.

## How this file is enforced

- `_Avoid_:` is **machine-checked** by `scripts/drift-check.sh` on every diff.
- **`_Avoid_` entries must be single words.** The gate splits identifiers into segments
  (`pupil_name` → `pupil` + `name`) and compares each segment, so a multi-word entry such as
  `student_first_name` can *never* match and is silently dead here. Compound bans therefore live in
  `scripts/drift-extra.sh`. This was found by breaking the gate on purpose during install.
- Every term above was verified to have **zero hits in `app/` and `tests/`** before being added, so
  the list is purely preventive and fires on no current code path.
- `course` / `course_credit_received` is deliberately absent: it names a real, distinct concept, and
  the segment matcher would fire on all its legitimate uses. A banned word whose every hit is
  legitimate is a glossary bug, not a code bug.
