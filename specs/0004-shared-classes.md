# 0004 — Shared classes: a Class has many Teachers

**Weight:** Full — three slices across two deployables, a migration against production data, and a
change to the authorization core. Expect more than one session.
**Shaped:** 2026-09-07 with the Owner, via `/grilling`. Eight decisions, each with a recommendation
and a rejected set. **Verdict: not built.**
**Invariants touched:** **INV-1** (widened — the definition of *associated with* moves; it must not
weaken for a teacher who is associated with nothing). **INV-3** (not changed, but a new party can
reach the `active` flag it guards). **INV-9** (new, proposed here). INV-2, INV-4 … INV-8 unaffected.
**Layers:** `api/` and `client/` both.
**ADR required:** the schema decision (D1) is a one-way door and gets **ADR-0005** with its rejected
alternatives, written when decided rather than reconstructed (PRINCIPLES #7).

> **Not published to an issue tracker.** Same standing override as specs 0001, 0002 and 0003: the
> spec is a local file, because solo work has no tracker (METHOD.md's reuse table).

## Problem Statement

A colleague co-teaches the weekly mathematics homework workshop. She has no way to record
attendance except by using the teacher's login, which means one account, one password, and no way
to tell who did what or to end her access when the co-teaching ends.

The system cannot express her. `CONTEXT.md` describes the world it was built for — "one teacher runs
a weekly mathematics homework workshop… One Class, one Teacher, in production since November 2025" —
and the schema states that as fact: a Class carries a single `teacher_id`, and INV-1 grants no
exceptions to anyone. `ADR-0003` removed the last role from the system, so there is no privileged
account to fall back on either.

Two things already anticipated this change and are worth not re-deriving:

- **INV-1 is worded for it.** It says "a Teacher **associated with** a Class", chosen on 2026-09-01
  so the rule survives shared classes and only the definition of *associated* moves.
- **Spec 0003 paid the cost down.** INV-1 reached seven enforcement sites and was consolidated to
  one check and one filter on 2026-09-04, on the stated reasoning that a permission change is the
  wrong moment to discover you have seven copies of the permission.

Grounding this session against the code found the thing neither of those covered: **an eighth site,
in the client.** `ClassView` compares the class's `teacher_id` against the logged-in user and
redirects to the dashboard when they differ. `drift-extra.sh` check 4 is anchored on `app/`, so it
cannot see it, and 0003's consolidation did not reach it. Under shared classes that line breaks the
feature for precisely the person it is built for: the API returns her shared class, the client
compares two different ids, and she is bounced with no message while every backend test stays green.

The check is also **already redundant.** The API refuses a non-owner with 403, axios rejects on
non-2xx, TanStack Query surfaces it as `error`, and the two lines below it already redirect on
`error`. It has never been the thing protecting anything.

## Solution

A Class has many Teachers. The teacher↔class relationship becomes a row in `class_teachers`,
carrying whether that teacher created the class. `classes.teacher_id` is dropped, so the schema
states the cardinality the domain now has instead of modelling one privileged teacher plus a patch
for everyone else.

*Associated with* — INV-1's word — becomes "a `class_teachers` row exists". One relationship, one
representation, consulted by one check and one filter.

A creator shares her class from the class view by typing a colleague's email address. If that
address has an account, the colleague gains access and the class appears in her own class list,
where she reaches it exactly as she reaches her own. She can do everything the daily job needs:
read, record attendance, delete a record, add, rename, merge and delete students, tick course
credit, rename the class. She cannot destroy the class, and she cannot decide who else gets in.
Those two stay with the creator.

## User Stories

1. As a creator teacher, I want to share my class with a colleague by typing her email address, so that she can record attendance without borrowing my login.
2. As a creator teacher, I want to see who currently has access to my class, so that I know who can read my students' names and history.
3. As a creator teacher, I want to remove a colleague's access, so that access ends when the co-teaching ends.
4. As a creator teacher, I want an explicit message when the address I typed has no account, so that I correct a typo instead of believing I shared.
5. As a creator teacher, I want sharing the same address twice to be harmless, so that clicking twice does not produce a mess.
6. As a creator teacher, I want to be refused when I type my own address, so that I do not appear twice on my own class.
7. As a creator teacher, I want to stay the only person who can delete the class, so that a colleague cannot destroy the course and every attendance record in it.
8. As a creator teacher, I want to stay the only person who can share or unshare, so that who sees student data remains my decision.
9. As a creator teacher, I want to be refused if I try to remove myself, so that the class is never left with nobody responsible for it.
10. As a co-teacher, I want a class shared with me to appear in my own class list, so that I reach it the same way I reach anything else.
11. As a co-teacher, I want to record attendance on a shared class, so that I can do the job I was added for.
12. As a co-teacher, I want to delete an attendance record I entered by mistake, so that I can fix my own error without asking anyone.
13. As a co-teacher, I want to add a student who turns up mid-term, so that I do not have to wait for my colleague to do it.
14. As a co-teacher, I want to rename, merge and delete students, so that I can keep the roster clean.
15. As a co-teacher, I want to tick the course credit box, so that the decision I made is recorded.
16. As a co-teacher, I want to read the attendance summary and the statistics, so that I can see how the group is doing.
17. As a co-teacher, I want to see who else has access to the class, so that I know who my colleagues are on it.
18. As a co-teacher, I want the delete-class control to be absent rather than to fail, so that I am not offered something I cannot do.
19. As a teacher associated with nothing, I want to be refused on every route of a class I have no connection to, so that my own students are protected by the same rule.
20. As a teacher associated with nothing, I want my class list to show only classes I am responsible for, so that the list means something.
21. As the Owner, I want the widened rule proven from the denied side, so that widening *associated* did not quietly open a hole.
22. As the Owner, I want every Class to have exactly one creator, so that responsibility for a class is never ambiguous.
23. As the Owner, I want the schema to say a Class has many Teachers, so that the next change to this rule costs one edit rather than two representations.
24. As the Owner, I want the client to stop deciding authorization, so that the rule lives in one place and the client cannot disagree with the server.
25. As a teacher creating a new class, I want to become its creator without doing anything extra, so that the common case needs no ceremony.
26. As the Owner, I want this change to deploy without locking teachers out of the class view, so that a deploy window is not an outage.
27. As the Owner, I want the words in the code, the invariant and the glossary to be the same word, so that the project does not carry two names for one relationship.

## Implementation Decisions

**D1 — The relationship moves into a join table and `classes.teacher_id` is dropped.**
`class_teachers` holds `(class_id, teacher_id, is_creator, created_at)`, unique on
`(class_id, teacher_id)`. *Associated with* means a row exists. This gets **ADR-0005**, because it is
a one-way door: every authorization query in the app's life reads this shape.

Rejected: **keep `teacher_id` as the creator and add a members-only table.** Purely additive, nothing
breaks, no API change — and rejected anyway, on four grounds. It asserts a cardinality the domain no
longer has, keeping the first teacher special-cased in the schema forever. It makes *associated* a
disjunction (`teacher_id = me OR a row exists`) that must be written at **both** enforcement sites,
because the filter cannot call the check — two branches at two sites, which is the seven-copy
disease in miniature that 0003 just paid to remove. It stores "she created this" on the Class when
it is a fact about the teacher↔class link. And it keeps *ownership*, the word being retired, as the
schema's primary truth.

Migration safety was **not** a reason to prefer the additive shape and was explicitly discarded as
one: production holds one teacher and one class, so the backfill is a single row.

**D2 — The creator is a flag on the association, and a Class has exactly one (INV-9).** `is_creator`
is a boolean on the join row, enforced one-per-class by a partial unique index on `class_id where
is_creator`. No role enum, no policy object. ADR-0003's bar is met by reading rather than by
abstaining: three routes read this flag, so it is not the unread column that ADR deleted.

**D3 — The word is *association*.** `verify_class_ownership` becomes `verify_class_association`;
`CONTEXT.md`'s *Class ownership* entry becomes *Class association*; `ownership` joins `_Avoid_`.
INV-1's text already says "associated with", so choosing *membership* instead would give the project
two words for one relationship — the defect `CONTEXT.md` exists to prevent.

**D4 — The list filter joins; it still cannot call the check.** Same reasoning as 0003's D4: there is
no single class id to check, so the filter enforces the same rule over many rows with a join. It
stays the second of the two sites, and it stays independently proven.

**D5 — Three acts are gated by the creator flag**, and only three: delete the class, share it,
unshare it. Everything else the API exposes is available to any associated teacher.

**D6 — `PUT /classes/{id}` is available to a co-teacher, including the `active` toggle.** Deliberate,
and flagged to the Owner during shaping as the one permission worth a second look, because `active`
is what INV-3 guards: flipping it off blocks new attendance recording. Approved as part of the
capability decision. Not an open question — a decision with a known consequence.

**D7 — Sharing is in-app, by typed email, creator only.** Address has an account → shared. No
account → an explicit refusal that says no account exists for that address. This is a
user-enumeration oracle and is **accepted deliberately**: registration is code-gated and invite-only
with one address per code (INV-7), so everyone who can probe is someone the Owner deliberately
admitted, and the alternative is worse. A generic message cannot distinguish a typo from a
non-user on a feature whose only input is a hand-typed address, which leaves the teacher believing
she shared when nobody has access — a false belief about who can read student data. Recorded in
`INVARIANTS.md` so it is a decision on the record rather than a side effect.

Rejected: **the CLI**, following ADR-0003's precedent of expressing "may issue a code" as "has
database access". It is cheaper and needs no new HTTP surface, and the Owner chose self-service:
the creator should not have to text the Owner to add a colleague.

**D8 — No invitations and no email.** The app sends no email today — no SMTP, no provider, nothing in
`requirements.txt`. An unknown address produces a refusal and nothing else: no pending state, no
delivery, no expiry. The colleague needs an account first, by registration code, exactly as today.

**D9 — Three new routes on the class**: read its teachers, add one by email, remove one. Reading the
list is available to any associated teacher (US-17); the two writes are creator-only.

**D10 — `ClassResponse` drops `teacher_id` and gains `is_creator`**, meaning "the teacher who asked
for this is its creator". Per-request and derived, so the client can hide the delete control and the
share panel without learning anyone's identity. This is a breaking change to the deployed client,
which D12 sequences.

**D11 — `AttendanceRecord` gains nothing. There is no attribution.** No model in the system records
who created a row, and this feature adds none. With two teachers, "who logged this?" becomes a
question the system cannot answer, permanently, because attribution cannot be backfilled. Rejected
after being put to the Owner: adding a nullable `recorded_by` that no screen reads is exactly the
column ADR-0003 deleted the role to avoid, and displaying it is scope creep on a permissions change.
Recorded under *Deliberately not invariants*.

**D12 — Slice 0 ships first, alone, and it is client-only.** The two workflows deploy independently
on separate path filters. If the API loses `teacher_id` before the client stops reading it, the old
client compares `undefined` against the user's id, they differ, and every teacher is redirected off
every class — including her own. Removing the redundant check first, as a `client/**` change that
triggers only the frontend workflow, closes that window before it can open. Expand-and-contract, in
the order that has no gap.

**D13 — One alembic revision**: create the table, backfill from `classes.teacher_id`, drop the
column. One revision rather than three because the intermediate states are not states anyone should
be able to deploy.

**D14 — The client stops deciding authorization.** `ClassView`'s identity comparison is deleted, not
repointed. The server's refusal already produces the same redirect through the error path, so there
is nothing to replace it with.

## Testing Decisions

A good test here asserts what an actor can and cannot do through a route, and says nothing about how
the refusal is reached. The suite has been wrong about this once already and the project paid for
it: on 2026-09-01, deleting the ownership filter left all 262 tests passing with byte-identical
coverage, because nothing tested the rule from the denied side. Coverage is not the safety metric in
this area and is not used as one here.

Four seams, agreed with the Owner. Three exist; the API gains none.

**Seam 1 — `tests/test_authorization.py`, the primary.** It already drives parametrized route tables
(`CLASS_SCOPED_ROUTES`, `STUDENT_SCOPED_ROUTES`, `POSITIVE_CONTROL_ROUTES`), so the new coverage
extends the actors over the existing tables instead of writing new route lists:
- an **unassociated** teacher — every one of the 18 denials must still hold, which is the regression
  proof that widening *associated* did not open the rule;
- a **shared** teacher — every permitted route must succeed and the 3 withheld must refuse.

This file is the enforcer `INVARIANTS.md` names for INV-1, and it becomes the enforcer for INV-9.

**Seam 2 — `tests/test_service_class.py`.** `verify_class_association` and the creator-only rule at
the service seam. Prior art is 0003's `TestGetAttendanceStatisticsOwnership`, which pushed a refusal
into the service rather than trusting a line in a route.

**Seam 3 — a `ClassView` component test.** The one new seam, and it exists only because `ClassView`
has no test today. It renders with a mocked API refusal and asserts the teacher still lands on the
dashboard once the identity comparison is gone. Prior art: `AttendanceTracking.test.tsx`,
`StudentLogs.legacy.test.tsx`.

**Seam 4 — the `src/api` seam.** Share, unshare and read-the-teachers calls, matching how auth,
login, logout, email and password change are already covered.

Two deliberate omissions. The migration gets no test of its own: its proof is the suite running
green against the migrated schema. And nothing here drives a browser — that is `/verify-live`'s job
and it is AC-14.

Every gate change below is installed the way this project installs gates: broken on purpose, watched
red, reverted (PRINCIPLES #2). Check 4's operand-reversed variant is planted specifically, because
that exact hole shipped in `d854eec` and survived a reading of the code — it was found by planting
`if teacher.id != class_obj.teacher_id`, the same defect with the operands swapped.

### Route arithmetic, counted from the code

Stated here because these numbers are cited in three acceptance criteria and this project has twice
corrected a document that carried an unexplained count.

| | Count | Made of |
|---|---|---|
| Gated by the check | **15** | 10 class-scoped, 3 student-scoped, delete-attendance, merge |
| Gated by the filter | **1** | `GET /classes` |
| Class-reaching, total | **16** | the two above |
| Denial tests covering them | **18** | parameter variants counted separately: `summary` plain and `?legacy=true`, and `PUT /students/{id}` once for a name and once for course credit |

Under this spec a shared teacher gets **14 of the 15 checked routes** — only `DELETE /classes/{id}`
is withheld — plus the list, which is how the class reaches her, plus the new read-teachers route.
Withheld comes to three: delete the class, share it, unshare it.

`CLAUDE.md` says "17 class-reaching routes" in its audit section. Counted from
`tests/test_authorization.py`'s tables it is 16, and the extra one is most likely the `?legacy=true`
variant counted as its own route. Worth a `/verify-claim` before either number is quoted again;
this spec uses its own count and shows the working.

## Acceptance Criteria

| # | Criterion | Proven by | Serves | Verdict |
|---|---|---|---|---|
| AC-1 | `ClassView` compares no teacher identity: a class the API returns **successfully** whose `teacher_id` differs from the logged-in user does **not** redirect | `test:` new `ClassView` component test — this case fails today and passes after the deletion | US-24, US-26 | PENDING |
| AC-1b | A class the API **refuses** still lands the teacher on the dashboard, via the error path | `test:` same file, positive control | US-24 | PENDING |
| AC-2 | `classes.teacher_id` does not exist after the migration, and no line in `api/app` or `client/src` reads it | `gate:` grep both trees + both typecheck gates | US-23 | PENDING |
| AC-3 | All 18 denials in `tests/test_authorization.py` hold for a third teacher associated with nothing | `test:` | US-19, US-21 | PENDING |
| AC-4 | A shared teacher succeeds on all 14 permitted checked routes, on the class list, and on the new read-teachers route | `test:` | US-11 … US-17 | PENDING |
| AC-5 | A shared teacher is refused on exactly three routes — delete class, share, unshare — and on no others | `test:` | US-7, US-8 | PENDING |
| AC-6 | A shared class appears in the co-teacher's own list; an unassociated teacher's list leaks nothing, proven independently of the check by dropping the join condition | `test:` + a deliberate break | US-10, US-20 | PENDING |
| AC-7 | A Class has exactly one creator: a second creator row is rejected by the database, not by application code (INV-9) | `constraint:` partial unique index + `test:` | US-22 | PENDING |
| AC-8 | Creating a class creates its creator association in the same transaction | `test:` | US-25 | PENDING |
| AC-9 | Sharing with an address that has no account refuses explicitly, names the address as unknown, and creates no association | `test:` | US-4 | PENDING |
| AC-10 | Sharing twice is idempotent; sharing with your own address is refused; the creator cannot remove herself | `test:` | US-5, US-6, US-9 | PENDING |
| AC-11 | Neutering the single check turns the denial suite red, and dropping the list filter's join turns the leak test red on its own | `test:` + two deliberate breaks | US-21, US-23 | PENDING |
| AC-12 | `drift-extra.sh` check 4 is re-aimed at the association and fails a planted comparison outside `class_service`, including the operand-reversed spelling | `gate:` watched failing on both spellings, then reverted | US-23, US-27 | PENDING |
| AC-13 | `CONTEXT.md` carries a *Class association* entry, `ownership` is on `_Avoid_`, and check 1's ban message names the current function | `review-only` + `gate:` drift | US-27 | PENDING |
| AC-14 | The co-teacher records attendance on a shared class in a browser, sees it in the list, and the delete-class control is absent for her | `live:` | US-11, US-18 | PENDING |
| AC-15 | Both gate sets green on every commit — `just check` and `npm run check` — with no baseline ratcheted upward | `gate:` | — | PENDING |

## Tracer Slices

Three, each demoable alone, risk front-loaded.

**Slice 0 — the client stops deciding authorization.** Delete `ClassView`'s identity comparison; add
the component test that proves the redirect survives. `client/**` only, so it triggers the frontend
workflow and deploys the frontend alone. Behaviour is identical, the eighth INV-1 site is gone, and
D12's deploy window can no longer open. Serves AC-1.

**Slice 1 — the relationship moves.** The migration, the model, `verify_class_association`, the
joined filter, creator-on-create, `ClassResponse`'s two field changes, and the gate re-aiming. No new
capability: one teacher, behaviour unchanged, the whole denial suite still green and still red when
neutered. The dangerous part lands with nothing new stacked on it. Serves AC-2, AC-3, AC-7, AC-8,
AC-11, AC-12, AC-13.

**Slice 2 — sharing.** The three routes, the creator gating, the share panel, and the absent delete
control. Demoable end to end: share with a second account, log in as her, record attendance, fail to
delete the class. Serves AC-4, AC-5, AC-6, AC-9, AC-10, AC-14.

## Out of Scope

- **Ownership transfer.** The creator cannot hand the class to someone else. Refusing self-removal
  (AC-10) is the floor that keeps INV-9 true without it.
- **More than two teachers.** Nothing here caps the count and the schema does not care, but the
  feature is shaped, tested and verified for two.
- **Attribution.** D11. No `recorded_by`, deliberately.
- **Invitations, email, pending states.** D8.
- **The deprecated `student_first_name` / `student_last_name` columns** on the attendance request.
  `BACKLOG.html` item 6, unrelated, and `/prune`'s job.
- **Coverage.** Unmeasured since 2026-09-01 against a suite that has since gone 262 → 346. Real, and
  not this spec's job.

## Non-Goals

- A permission abstraction, a policy object, a decorator or a role enum. One function, one flag,
  called directly — the shape 0003 arrived at and ADR-0003 argued for.
- Making the filter share code with the check. D4 says why it cannot.
- Any change to how a teacher account comes into existence. Registration codes are untouched.
- Protecting attendance history from a co-teacher's delete. The Owner has already ruled that
  destroying a student's history is acceptable — "the school holds the credit; this app is a tally
  sheet" — and this spec does not re-litigate it.

## Open Questions

**OQ-1 — the Finnish UI copy.** `opettaja` appears nowhere in `client/src` today, so the words for
*co-teacher*, *share*, *remove access* and the unknown-address refusal are new vocabulary. The UI is
Finnish-localized and the copy is `frontend-design`'s, per METHOD.md's reuse table. Blocks slice 2's
surface, not its routes.

**OQ-2 — what happens to a Class whose creator's `User` row is deleted?** Today `classes.teacher_id`
cascades, so deleting a user deletes her classes. Under D1 the association cascades instead, which
would leave the class alive with no creator — INV-9 broken and the class reachable by nobody. **No
route reaches this**: there is no account-deletion endpoint or service anywhere in `app/`, and
accounts are deactivated through `active`. So the choice is about a path only direct SQL can take —
orphan and document, refuse the delete, or reassign — and it is the Owner's. ADR-0003 rejected a
creator reference partly over this exact shape, so it should not be decided silently here. Blocks
slice 1's migration.

## Spec Deltas

| Date | What changed | Why |
|---|---|---|
| 2026-09-07 | AC-1 split into AC-1 and AC-1b, and its proof restated | The original wording — "a refused class still lands on the dashboard, watched failing before the deletion" — names a test that **cannot fail before the change**: the old `teacher_id` comparison and the error path both redirect, so it passes either way and proves nothing. The discriminating case is the opposite one, and it is shared classes in miniature: the API returns the class *successfully* with a `teacher_id` that is not the caller's, and the assertion is that no redirect happens. That fails today. The redirect-on-refusal case is still worth having, as a positive control, which is what AC-1b now is. Caught reviewing the spec before any code, not by the build |
