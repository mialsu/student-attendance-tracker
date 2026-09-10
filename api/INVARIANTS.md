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
| INV-1 | Only a Teacher associated with a Class may read or change that Class, its Students, or its Attendance records | a second authenticated Teacher reads or changes a Class they do not own — including merely seeing it in their own class list | `test:tests/test_authorization.py` (18 denial tests + 8 positive controls) and `gate:scripts/drift-extra.sh` check 4, plus `test:tests/test_service_student.py` — seven `test_another_teacher_is_refused` cases, one per student-service function, which reach the same single check site from below the routes rather than through them | **One check site and one filter site.** `class_service.verify_class_ownership` decides it for a single Class and is the only thing in `app/` that compares a `teacher_id`; `class_service.get_classes_for_teacher`'s `WHERE` clause enforces the same rule over many rows and cannot call it, there being no single class to check. Consolidated 2026-09-04 from the seven sites confessed on 2026-09-01 (spec 0003), which were two duplicate helpers — one under the second name `verify_class_access` — three inline comparisons, and the filter. Named by **function rather than file:line on purpose**: the row this replaces pointed at `attendance_service.py:286`, which had already rotted to :265 |
| INV-2 | A Student's name is unique, case-insensitively, within its Class | two Students in one Class named `matti virtanen` and `Matti Virtanen` both exist | `constraint:ix_students_name_class_unique` **and** `test:tests/test_service_student.py` — `test_refuses_a_duplicate_in_any_casing` (create), `test_renaming_to_a_name_already_in_the_class_is_refused` (update), `test_creates_no_second_row_for_a_known_name` (attendance logging) | `app/models/student.py:61`, created in `alembic/versions/01edea317e5e:48`. The index is the backstop; the service refuses first, and until 2026-09-07 nothing proved that it did — a service that stopped checking would have turned a clean 400 into an IntegrityError |
| INV-3 | A new Attendance record may only be created against an **active** Class | `POST /api/classes/{id}/attendance` succeeds against a Class with `active = false` | `test:test_create_attendance_inactive_class`, `test:test_bulk_attendance_inactive_class_fails`, `test:test_create_attendance_for_inactive_class` | **`attendance_service.create_attendance_record`** — the one site that reads `Class.active` before creating a record. Named by function rather than file:line for INV-1's reason, and for the same evidence: this cell said `attendance_service.py:213` until 2026-09-10 and the check had moved to `:153`. Since spec 0005 slice 2 the refusal also labels itself `rule="INV-3"`, so a denial reaches the log with the rule named |
| INV-4 | Every Student belongs to exactly one Class; the same name in two Classes is two Students | a Student row exists with no Class, or code treats two same-named Students in different Classes as one person | `constraint:students.class_id NOT NULL` + FK to `classes.id`, **and** `test:tests/test_service_student.py` — `test_the_same_name_in_another_class_is_another_student`, `test_the_same_name_in_another_class_is_allowed`, `test_never_suggests_another_class_s_students` | `app/models/student.py:30-34`. The constraint only enforces the first half of this row. The violation it names — *code treats two same-named Students in different Classes as one person* — is a behaviour no constraint can see, and it had no enforcer at all until 2026-09-07 |
| INV-5 | A merge may only combine two Students of the same Class | merging a Student of Class A into a Student of Class B succeeds, moving attendance across a Class boundary | `test:test_merge_different_classes_error`, and at the service layer `test:tests/test_service_student.py::TestMergeStudents::test_merging_across_classes_is_refused` plus `test_a_refused_cross_class_merge_moves_nothing`, which asserts both histories are still intact after the refusal | `app/services/student_service.py:515` |
| INV-6 | A Registration code may be used at most once, and a revoked or **expired** code can never be used | two accounts exist created by the same code, or signup succeeds with a revoked or expired code | `test:test_signup_with_used_code`, `test:test_signup_with_revoked_code`, `test:test_signup_with_expired_code`, `test:test_validate_registration_code_already_used` | `app/services/registration_code_service.py:130-137` — the one place that decides redeemability. The lifetime is `CODE_LIFETIME`, 24 hours, at `:18` |
| INV-7 | A Registration code names exactly one email address, and only that address may redeem it | a code is stored with no address, or an address other than the one named redeems a code | `constraint:registration_codes.email_restriction NOT NULL` + `test:test_a_code_cannot_be_stored_without_an_address`, `test:test_signup_with_email_restricted_code_wrong_email`, `test:test_signup_with_a_code_that_names_no_address` | `app/models/registration_code.py:28` (the constraint) and `app/services/registration_code_service.py:142` (the comparison). Codes issued before 2026-09-01 carry `''`, which matches no address a signup can present; the mandatory-email migration revoked them as well |
| INV-8 | A password change ends every session that predates it | a refresh token issued before a password change still buys an access token afterwards | `test:test_update_password_revokes_every_existing_session` | `app/services/auth_service.py:213` — `update_user_password` revokes in the same transaction as the new hash. Added 2026-09-02 after `/audit` demonstrated the opposite: the old password went dead, and a pre-change refresh token still returned 200 and read the account |

Referenced from three places, which is what makes these load-bearing rather than decorative:
- **the spec** — `Invariants touched: INV-n`, so a slice declares what it can break;
- **the code** — a comment naming `INV-n` at its owner;
- **`/verify-live`** — which *attacks* every invariant a slice touches.

The drift gate fails any new `INV-` row whose `Enforced by` cell is empty.

**This file assigns the numbers. A spec proposes an invariant; it does not reserve an id.** Take
the next free number when you write the row, not when you write the spec — and read the table
above rather than the last spec you happened to open.

The rule exists because the alternative was tried and failed twice. `specs/0004-shared-classes.md`
(not built) and `specs/0005-application-logging.md` both claimed `INV-9`, for unrelated rules, and
the collision went unnoticed through both specs' reviews because neither number existed here yet.
The Owner settled it on 2026-09-10 — spec 0005 takes `INV-9`, since a number belongs to the rule
that will have an enforcer — and spec 0004's is now deliberately unnumbered until it is built. The
same shape had already cost the project once: ADR-0005 took the number spec 0004 had reserved for
the `class_teachers` decision, which the root `CLAUDE.md` records.

## Deliberately not invariants

Recorded so a later session does not re-litigate them or promote them by accident. Each was put to
the Owner and declined, with the reason.

| Candidate | Verdict | Why |
|---|---|---|
| "A Student who reaches 14–15 Attendance records has earned the course credit" | **not a rule** | The teacher decides and ticks the box. 14–15 is her rule of thumb, not the system's. Nothing counts attendances, and `course_credit_received` is set only by `PUT /api/students/{id}`. Recorded in `CONTEXT.md` as vocabulary |
| "Deleting a Student must not destroy the record of a granted credit" | **not a rule** | The school holds the credit; this app is a tally sheet. The cascade at `app/models/student.py:55` is correct as built |
| "Attendance on an inactive Class becomes read-only" | **not a rule** | Offered and not taken. Closing a Class blocks new records only; existing ones stay editable and deletable |
| "A superadmin may read any Teacher's data" | **not a rule — the role no longer exists** | Resolved 2026-09-01 (ADR-0003): the Owner removed the superadmin role rather than decide what it may see. A signed-in person is a Teacher, INV-1 grants no exception to anyone, and there is nothing left to grant one to |

## Known future change

The Owner intends **shared Classes** — two Teachers on one Class — alongside individual ones. INV-1
is deliberately worded "a Teacher **associated with** a Class" rather than "the Teacher who owns it",
so the rule survives that change and only the definition of *associated* moves.

**That change now costs two edits** — `verify_class_ownership` and the list filter — where it used
to cost seven. Paying that down was the whole of spec 0003, done on 2026-09-04 *before* shared
classes were designed, on the reasoning that a permission change is the wrong moment to discover
you have seven copies of the permission. The word *ownership* in the function name is the current
shape of *associated with*, not a synonym for it; when shared classes land, the name is what
changes, not the number of places.

## Retired invariants

An invariant that stopped being true is a **domain change**, not a deletion. Strike the id
(`~~INV-3~~`) so it can never be reused.

| # | Was | Retired | Replaced by |
|---|---|---|---|
| — | — | — | — |
