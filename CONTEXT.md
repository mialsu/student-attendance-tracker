# Student Attendance Tracker — client-app

The words this app's code, UI and conversation all use for the same things.

> **This file is a GATE SEED, not the domain model.** It was seeded by `/harness` from evidence in
> the committed code so that `scripts/drift-check.sh`'s vocabulary check has something to enforce.
> It is deliberately small: only terms whose `_Avoid_` list could be *proven* against the code are
> listed with one. The real glossary — every term, agreed and recitable by the Owner with the file
> closed — is `/crunch-domain`'s output and is still owed (see `REVIEW-DEBT.md`). Do not cite this
> file as though the domain has been modelled. (ANTI-PATTERNS: *the pseudo-artifact*.)

Format follows the installed `domain-modeling` skill's `CONTEXT-FORMAT.md`, per METHOD.md's
reuse rule.

## Language

**Student**:
A person whose attendance is recorded against a Class. Identified by a single normalized
`name` ("Title Case"), unique case-insensitively within its Class.
_Avoid_: pupil, attendee, learner
_Unresolved_: whether a Student is the same person across two Classes, or a per-Class row that
merely shares a name. The schema says per-Class; the autocomplete-by-frequency feature reads as
though it is cross-Class. Owner call — this decides whether merging Students is ever meaningful.

**Class**:
The course a Teacher owns and records attendance against. Carries an `active` flag that controls
whether NEW attendance may be recorded; an inactive Class keeps its history.
_Unresolved_: the Finnish UI calls this "Kurssi" and the API calls it `Class`. Both are correct in
their own register, so no `_Avoid_` is claimed here — but the English identifier is `Class`.

**Attendance record**:
One dated occurrence of one Student being present in one Class. The unit that bulk logging
creates 1–50 of at a time.
_Avoid_: checkin

**Course credit**:
A per-Student boolean on a Class saying the Student has earned the credit. A distinct concept from
attendance — `course` is legitimate vocabulary here (`courseCredit`, `course_credit_received`) and
is deliberately NOT on any `_Avoid_` list.

**Teacher**:
The authenticated owner of a set of Classes. Modelled as `User` in the API, with a role.
_Unresolved_: `User` vs `Teacher` vs the admin role. If `User` means one thing to the auth code and
another to the admin screens, that is the word collision that would justify the domain dial's
`mapped` setting. Not resolved here.

## How this file is enforced

- `_Avoid_:` is **machine-checked** by `scripts/drift-check.sh` on every diff.
- **`_Avoid_` entries must be single words.** The gate splits each identifier into segments
  (`pupilName` → `pupil` + `name`) and compares each segment against the list, so a camelCase
  compound like `studentFirstName` can *never* match and is silently dead if you write it here.
  This was found by breaking the gate on purpose during install: the compound entry did not fire.
  Verified working entries fire like `src/api/students.ts:57 -> pupilName(pupil)`.
- Every term above was verified to have **zero hits in `src/`** before being added, so the list is
  purely preventive and fires on no current code path.
- **Compound identifiers are enforced separately** by `scripts/vocab-check.sh`, because the segment
  matcher structurally cannot express them. That is where `studentFirstName` / `studentLastName`
  live — the vocabulary the Student-entity migration replaced with a single `name`.
- `course` / `courseCredit` is deliberately absent: it names a real, distinct concept (the
  per-Student credit flag), and the segment matcher would fire on all 27 of its legitimate uses.
  A banned word whose every hit is legitimate is a glossary bug, not a code bug.
- A word that turns out to name a genuinely different concept gets promoted to a term of its own,
  not exempted.
