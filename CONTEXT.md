# Student Attendance Tracker — client-app

The words this app's code, UI and conversation all use for the same things.

> **Crunched with the Owner on 2026-09-01** (`/crunch-domain`). No longer a gate seed: the terms
> below were stated or confirmed by the Owner. What the Owner left open is marked `_Unresolved_`
> with the reason rather than filled in with a guess.

Format follows the installed `domain-modeling` skill's `CONTEXT-FORMAT.md`, per METHOD.md's reuse
rule. This repo and `student-attendance-tracker-api` describe **one** domain; when they disagree
about a word, that disagreement is the bug.

> **The rules live in `../student-attendance-tracker-api/INVARIANTS.md`**, because every enforcer is
> server-side. This repo deliberately has **no `INVARIANTS.md`** — inventing one here would be two
> files for one artifact, and the drift gate's invariant check stays inert in this repo as a result
> (confessed in `REVIEW-DEBT.md`). A rule the UI appears to enforce is a convenience, never the
> guarantee: `INV-1` is proven by `tests/test_authorization.py` in the API, not by any screen.

## What this system actually is

One teacher runs a **weekly mathematics homework workshop** and records who turned up. One Class,
one Teacher, in production since November 2025. Around 14–15 attendances earns a student one
high-school **ECTS credit**, a figure the teacher applies herself.

The app is a **tally sheet, not an academic record**. Design accordingly: no screen should imply the
app is the authority on a credit.

## Language

**Student**:
A person whose attendance is recorded against one Class. Identified by a single normalized `name`
("Title Case"), unique case-insensitively within its Class.
_Avoid_: pupil, attendee, learner
_Resolved 2026-09-01_: a Student is a **per-Class row**, not a person tracked across Classes — the
Owner's deliberate choice of the simplest model. The same name in two Classes is two Students. The
earlier note claiming autocomplete reads as cross-Class was **wrong**; it filters by class.

**Class**:
The course a Teacher owns and records attendance against. Carries an `active` flag controlling
whether **new** attendance may be recorded; an inactive Class keeps its history, and that history
stays editable.
_Unresolved_: the Finnish UI calls this "Kurssi" and the API calls it `Class`. Both are correct in
their own register; the English identifier is `Class`.

**Attendance record**:
One dated occurrence of one Student being present in one Class. The unit that bulk logging creates
1–50 of at a time — all sharing one timestamp, because bulk entry exists for catching up on a
backlog from paper.
_Avoid_: checkin

**Course credit**:
A per-Student boolean on a Class saying the teacher has decided the Student earned the credit.
**Ticked by hand, never computed.** A distinct concept from attendance — `course` is legitimate
vocabulary here (`courseCredit`, `course_credit_received`) and is deliberately NOT on any `_Avoid_`
list.

**ECTS credit**:
The real-world thing a Course credit records. The 14–15 attendance figure is the teacher's rule of
thumb and **nothing enforces it**. Do not add a progress bar, a badge, or a "credit earned" hint
implying the app decides — ask the Owner first.

**Legacy student**:
A Student whose row is older than five years, hidden by default from attendance listings.
_Unresolved_: `legacy` exists in this repo's types (`src/api/attendance.ts:20`) and **no component
ever sets it**, so the cutoff cannot be turned off from the UI. The Owner wants the default kept and
a way to reveal old Students in order to delete them. Owed as a spec — this is frontend work.

**Teacher**:
The authenticated party who records attendance for a Class. Modelled as `User` in the API, with a
role.
_Unresolved_: the Owner is revisiting whether the `SUPERADMIN` role is needed at all, so the
`User`-means-two-things collision stays open.
_Planned_: **shared Classes** — two Teachers on one Class — alongside individual ones.

## How this file is enforced

- `_Avoid_:` is **machine-checked** by `scripts/drift-check.sh` on every diff.
- **`_Avoid_` entries must be single words.** The gate splits each identifier into segments
  (`pupilName` → `pupil` + `name`) and compares each segment against the list, so a camelCase
  compound like `studentFirstName` can *never* match and is silently dead if you write it here.
  This was found by breaking the gate on purpose during install. Verified working entries fire like
  `src/api/students.ts:57 -> pupilName(pupil)`.
- Every `_Avoid_` term was verified to have **zero hits in `src/`** before being added, so the list
  is purely preventive and fires on no current code path.
- **Compound identifiers are enforced separately** by `scripts/drift-extra.sh`, because the segment
  matcher structurally cannot express them. That is where `studentFirstName` / `studentLastName`
  live — the vocabulary the Student-entity migration replaced with a single `name`.
- `course` / `courseCredit` is deliberately absent: it names a real, distinct concept, and the
  segment matcher would fire on all 27 of its legitimate uses. A banned word whose every hit is
  legitimate is a glossary bug, not a code bug.
- A word that turns out to name a genuinely different concept gets promoted to a term of its own,
  not exempted.
