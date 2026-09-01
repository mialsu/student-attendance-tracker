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
_Avoid_: studentFirstName, studentLastName
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

- `_Avoid_:` is **machine-checked** by `scripts/drift-check.sh` on every diff. It matches whole
  identifier segments, so `studentFirstName` fires and `courseCredit` does not.
- Verified at seed time: `studentFirstName` / `studentLastName` / `firstName` / `lastName` occur in
  `src/lib/attendance.ts`, `src/lib/classes.ts` and `src/lib/__tests__/classes.test.ts` and
  **nowhere in live code** — they are the vocabulary the Student-entity migration replaced. Banning
  them stops the dead words returning; it fires on no current code path.
- A word that turns out to name a genuinely different concept gets promoted to a term of its own,
  not exempted.
