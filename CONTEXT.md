# Student Attendance Tracker — API

The words this service's code, schema, API and conversation all use for the same things.

> **Crunched with the Owner on 2026-09-01** (`/crunch-domain`). This is no longer a gate seed: the
> terms below were stated or confirmed by the Owner, and the rules they imply live in
> `INVARIANTS.md`, each naming the enforcer that fails when it is broken. What the Owner left open
> is marked `_Unresolved_` with the reason, not filled in with a guess.

Format follows the installed `domain-modeling` skill's `CONTEXT-FORMAT.md`, per METHOD.md's reuse
rule. This repo and `client-app` describe **one** domain; when they disagree about a word, that
disagreement is the bug.

## What this system actually is

Worth stating, because every scope judgement below follows from it: one teacher runs a **weekly
mathematics homework workshop** and records who turned up. One Class, one Teacher, in production
since November 2025. Around 14–15 attendances earns a student one high-school **ECTS credit** — a
figure the teacher applies herself, not a rule the system computes.

The app is a **tally sheet, not an academic record**. The school holds the credit; this app holds
the count that informs it. That is why deleting a Student may destroy their whole history without
protection (`INVARIANTS.md`, *Deliberately not invariants*).

## Language

**Student**:
A person whose attendance is recorded against one Class. Identified by a single normalized `name`
("Title Case"), unique case-insensitively within its Class (`INV-2`).
_Avoid_: pupil, attendee, learner
_Resolved 2026-09-01_: a Student is a **per-Class row**, not a person tracked across Classes. The
same name in two Classes is two Students, deliberately — the Owner's words: "the most simplistic
approach I could think" (`INV-4`). The earlier note claiming the autocomplete endpoint reads as
cross-Class was **wrong**: `student_service.py:422` filters `Student.class_id == class_id`. Every
code path agrees. Consequence accepted: "how many courses has this person taken" is a question the
system cannot answer.

**Class**:
The course a Teacher owns and records attendance against. `active` controls whether **new**
attendance may be recorded (`INV-3`); an inactive Class keeps its history, and that history stays
editable and deletable.
_Unresolved_: the Finnish UI calls this "Kurssi" and the API calls it `Class`. Both are correct in
their own register; the English identifier is `Class`.

**Attendance record**:
One dated occurrence of one Student being present in one Class. The unit that bulk logging creates
1–50 of at a time.
_Avoid_: checkin
_Note_: every record in one bulk call carries the **same** timestamp (`attendance_service.py:226`).
Bulk logging exists to enter a backlog, so its timestamps are approximately-when, not exactly-when.

**Course credit**:
A per-Student boolean (`course_credit_received`) saying the teacher has decided the Student earned
the credit. **Set by hand, never computed** — nothing in the system counts toward it. Distinct from
attendance; `course` is legitimate vocabulary here and is deliberately NOT on any `_Avoid_` list.

**ECTS credit**:
The real-world thing a Course credit records: one high-school credit, awarded by the school, for
roughly 14–15 attendances. The **14–15 figure is the teacher's rule of thumb and is enforced by
nothing** — deliberately (`INVARIANTS.md`, *Deliberately not invariants*). Do not implement a
threshold without asking the Owner first.

**Legacy student**:
A Student whose row is older than five years, excluded by default from attendance listings
(`attendance_service.py:124`). The cutoff reads `Student.created_at`, **not** first attendance, so
for every Student the `01edea317e5e` migration created it measures the migration date.
_Unresolved_: the Owner wants the cutoff kept on by default **plus** a way to show old Students in
order to delete them. That UI does not exist — `legacy` is declared in the frontend's types and set
by no code — so the filter is currently unconditional. Owed as a spec.

**Teacher**:
The authenticated party who records attendance for a Class. Modelled as `User`, and a User is
**only** ever a Teacher — there is no other kind of user.
_Resolved 2026-09-01 — decided, NOT yet implemented_: the Owner has decided to remove the superadmin
role entirely, together with the admin dashboard and the admin HTTP routes. Registration codes will
be issued from a command line with direct database access, so **database access, not a role, is who
may issue a code**. `User` therefore means exactly one thing, and the word collision that was this
project's only `mapped` trigger is gone for good — the dial stays `on` with **one** context.
⚠ The code still carries a role until that slice lands. Until then this entry describes the decision,
not the schema.
_Planned_: the Owner intends **shared Classes** — two Teachers on one Class — alongside individual
ones. `INV-1` is worded "associated with" for that reason.

**Registration code**:
A code the Owner issues from the command line that lets someone create a Teacher account. Optional
email restriction, plus a record of who redeemed it. **There is no creator**: authorization to issue
one is having database access, not holding a role (ADR-0003), so there is no user to record. **Redeemable for 24 hours** from the moment it is issued
(`CODE_LIFETIME`, `registration_code_service.py:18`); after that it is *expired* and no longer
redeemable, though the row stays for the record.
_Resolved 2026-09-01, from code_: single-use (`registration_code_service.py:130`), revocable
(`:133`), expiring (`:136`), and a used code cannot be deleted (`:187`). Revoking a code does **not**
affect an account already created with it, because validation runs only at signup (`INV-6`).
_Note_: **expired** is not **revoked**. Revoked is the Owner's deliberate act on one code; expired
happens to every code on its own. The duplicate guard treats only a *live* code as blocking, so an
address whose code expired can simply be sent another one.

## How this file is enforced

- `_Avoid_:` is **machine-checked** by `scripts/drift-check.sh` on every diff.
- **`_Avoid_` entries must be single words.** The gate splits identifiers into segments
  (`pupil_name` → `pupil` + `name`) and compares each segment, so a multi-word entry such as
  `student_first_name` can *never* match and is silently dead here. Compound bans live in
  `scripts/drift-extra.sh`. This was found by breaking the gate on purpose during install.
- Every `_Avoid_` term was verified to have **zero hits in `app/` and `tests/`** before being added,
  so the list is purely preventive and fires on no current code path.
- `course` / `course_credit_received` is deliberately absent: it names a real, distinct concept, and
  the segment matcher would fire on all its legitimate uses. A banned word whose every hit is
  legitimate is a glossary bug, not a code bug.
- The **rules** these words carry live in `INVARIANTS.md`, one enforcer each. A rule stated here in
  prose and nowhere else is exactly the pseudo-artifact both files exist to refuse.
