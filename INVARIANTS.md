# Invariants — Student Attendance Tracker

The rules this domain is not allowed to break, in the words of `CONTEXT.md`. Each names the
**enforcer that fails the moment it is violated**. An invariant naming no enforcer is prose
pretending to be a guarantee (ANTI-PATTERNS: *the pseudo-artifact*).

Written from the `/crunch-domain` interview on 2026-09-01. **The Owner supplied every rule below**;
where the Owner declined to make something a rule, that is recorded under *Deliberately not
invariants* rather than quietly promoted.

This file lives in the API repo because **every enforcer below is server-side**. `client-app` has
no invariant of its own, so it deliberately has no `INVARIANTS.md` — see its `REVIEW-DEBT.md`.

Domain dial: **on**, 4 of 4 triggers (METHOD.md). Contexts: **one**.

## Invariants are not acceptance criteria

| | Acceptance criterion (`AC-n`, in the spec) | Invariant (`INV-n`, here) |
|---|---|---|
| Scope | one slice | the whole domain, every release |
| Lifetime | until `/verify-live` fills its verdict | until the domain itself changes |
| Violated means | the slice isn't done | there is a bug, whatever shipped it |

## Invariants

| # | Must always be true | Violated when | Enforced by | Owner in code |
|---|---|---|---|---|
| INV-1 | Only a Teacher associated with a Class may read or change that Class, its Students, or its Attendance records | a second authenticated Teacher reads or changes a Class they do not own — including merely seeing it in their own class list | `test:tests/test_authorization.py` (17 denial tests + 7 positive controls) | ⚠ **7 sites, not 1** — `class_service.py:54,151,194,226`, `student_service.py:579`, `attendance_service.py:80,286`. Intended single owner: `class_service.verify_class_ownership`. Confessed 2026-09-01 |
| INV-2 | A Student's name is unique, case-insensitively, within its Class | two Students in one Class named `matti virtanen` and `Matti Virtanen` both exist | `constraint:ix_students_name_class_unique` | `app/models/student.py:61`, created in `alembic/versions/01edea317e5e:48` |
| INV-3 | A new Attendance record may only be created against an **active** Class | `POST /api/classes/{id}/attendance` succeeds against a Class with `active = false` | `test:test_create_attendance_inactive_class`, `test:test_bulk_attendance_inactive_class_fails`, `test:test_create_attendance_for_inactive_class` | `app/services/attendance_service.py:213` |
| INV-4 | Every Student belongs to exactly one Class; the same name in two Classes is two Students | a Student row exists with no Class, or code treats two same-named Students in different Classes as one person | `constraint:students.class_id NOT NULL` + FK to `classes.id` | `app/models/student.py:30-34` |
| INV-5 | A merge may only combine two Students of the same Class | merging a Student of Class A into a Student of Class B succeeds, moving attendance across a Class boundary | `test:test_merge_different_classes_error` | `app/services/student_service.py:515` |
| INV-6 | A Registration code may be used at most once, and a revoked code can never be used | two accounts exist created by the same code, or signup succeeds with a revoked code | `test:test_signup_with_used_code`, `test:test_validate_registration_code_already_used` | `app/services/registration_code_service.py:115-119` |

Referenced from three places, which is what makes these load-bearing rather than decorative:
- **the spec** — `Invariants touched: INV-n`, so a slice declares what it can break;
- **the code** — a comment naming `INV-n` at its owner;
- **`/verify-live`** — which *attacks* every invariant a slice touches.

The drift gate fails any new `INV-` row whose `Enforced by` cell is empty.

## Deliberately not invariants

Recorded so a later session does not re-litigate them or promote them by accident. Each was put to
the Owner and declined, with the reason.

| Candidate | Verdict | Why |
|---|---|---|
| "A Student who reaches 14–15 Attendance records has earned the course credit" | **not a rule** | The teacher decides and ticks the box. 14–15 is her rule of thumb, not the system's. Nothing counts attendances, and `course_credit_received` is set only by `PUT /api/students/{id}`. Recorded in `CONTEXT.md` as vocabulary |
| "Deleting a Student must not destroy the record of a granted credit" | **not a rule** | The school holds the credit; this app is a tally sheet. The cascade at `app/models/student.py:55` is correct as built |
| "Attendance on an inactive Class becomes read-only" | **not a rule** | Offered and not taken. Closing a Class blocks new records only; existing ones stay editable and deletable |
| "A superadmin may read any Teacher's data" | **open question** | The Owner is revisiting whether the superadmin role is needed at all. Until then INV-1 grants no role exception, which is also what the code does |

## Known future change

The Owner intends **shared Classes** — two Teachers on one Class — alongside individual ones. INV-1
is deliberately worded "a Teacher **associated with** a Class" rather than "the Teacher who owns it",
so the rule survives that change and only the definition of *associated* moves. That change is
cheap at one enforcement site and expensive at seven, which is the concrete cost of INV-1's
confessed duplication.

## Retired invariants

An invariant that stopped being true is a **domain change**, not a deletion. Strike the id
(`~~INV-3~~`) so it can never be reused.

| # | Was | Retired | Replaced by |
|---|---|---|---|
| — | — | — | — |
