# 0001 — Registration codes from the command line, and no user roles

**Weight:** Standard (+ one ADR — `docs/adr/0003-no-user-roles.md`)
**Shaped:** 2026-09-01, `/grill-with-docs` with the Owner. Eight decisions, all confirmed.
**Invariants touched:** INV-6 (rewritten), INV-7 (new). INV-1..INV-5 unaffected.
**Repos:** `student-attendance-tracker-api` and `client-app` — one slice, both repos.

> **Not published to an issue tracker.** `to-spec` would normally publish this and apply
> `ready-for-agent`. devkit overrides that for solo work: the spec is a local file, because there is
> no tracker (METHOD.md's reuse table). No triage vocabulary was configured either.

## Problem Statement

Issuing a registration code today means: create a superadmin account with a script, log into a
separate admin area of the web app, fill in a form, copy the code out. That is four steps and a
whole second user interface for something the Owner does rarely and alone.

It also leaves the system carrying weight it does not need. There are two kinds of user when there
is only ever one kind of person using this app: a teacher. The second kind exists solely so that
somebody can hold the permission to press the button on a screen that exists solely to be pressed
by them.

And a code, once issued, is valid forever. A code generated months ago and never used is still
redeemable today, by whoever has it.

## Solution

Issue codes from the command line, and delete everything that existed to support the web form.

The Owner runs one command with an email address and gets a code that stops working after 24 hours.
Authorization for issuing a code becomes *having access to the database*, which the Owner has and
nobody else does — a stronger boundary than a column on a row, and one that cannot be reached over
the internet at all.

Then: no admin screens, no admin HTTP endpoints, and no roles. A signed-in person is a teacher.

## User Stories

1. As the Owner, I want to issue a registration code with a single command, so that I do not have to
   maintain a second user interface for a task I do a few times a year.
2. As the Owner, I want to name the email address the code is for when I issue it, so that a code
   that leaks is useless to anyone but its intended recipient.
3. As the Owner, I want a code to stop working after 24 hours, so that an unused code left in a chat
   history is not a permanent way into the system.
4. As the Owner, I want to see the code and its expiry printed together, so that I can tell the
   recipient how long they have without working it out.
5. As the Owner, I want to revoke a code by the email it was issued for, so that I can undo a typo
   immediately rather than waiting a day for it to expire.
6. As the Owner, I want revoking to tell me clearly when there was nothing to revoke, so that a
   mistyped address does not look like success.
7. As the Owner, I want to issue a fresh code to an address whose previous code expired, so that a
   recipient who missed the window can simply be sent another one.
8. As the Owner, I want to be stopped from issuing a second live code to an address that already has
   one, so that two valid codes for one person cannot exist.
9. As the Owner, I want the command to work on the production server as well as locally, so that I
   can issue a code for the real system.
10. As a new teacher, I want a code that only works with my email address, so that signing up
    confirms the invitation was meant for me.
11. As a new teacher, I want a clear message when my code has expired, so that I know to ask for a
    new one rather than assuming the site is broken.
12. As a new teacher, I want a clear message when my code has already been used, so that I do not
    retry a code that will never work.
13. As a teacher signing in, I want to land on my dashboard, so that the app does not send me
    somewhere that no longer exists.
14. As the Owner, I want the admin screens gone entirely, so that there is no second interface to
    keep working, style, or secure.
15. As the Owner, I want the admin HTTP endpoints gone, so that production exposes no authenticated
    surface that nothing uses.
16. As the Owner, I want roles gone from the data model, so that "user" means exactly one thing in
    this project's language.
17. As the Owner, I want the API to stop telling clients about roles, so that no future screen can
    branch on a concept that no longer exists.
18. As a future session reading this repo, I want to find no role column, no creator column, and a
    recorded reason for both, so that I do not spend an afternoon working out whether they were
    load-bearing.
19. As the Owner, I want every code that exists today to be expired the moment this ships, so that
    the old forever-valid codes do not survive the change that was meant to end them.
20. As the Owner, I want the existing authorization guarantees untouched, so that removing a role
    does not quietly weaken who can read whose attendance.

## Implementation Decisions

**The command line tool follows the convention already in the repo.** There is prior art for "an
operator does a privileged thing from a terminal": a Python script that builds its own async engine
from the app's settings, paired with a thin shell wrapper that activates the virtual environment.
The new tool copies that shape. Standard library only — no new dependency for argument parsing.

**The script holds no logic.** Two new service functions carry all the behaviour: one to issue a
code for an email, one to revoke the outstanding code for an email. The script parses arguments,
calls one of them, and prints. This is what keeps the test seams at two (see Testing Decisions), and
it means the script is too thin to hide a decision.

**Issuing is keyed by email, and so is revoking.** There is no listing command. Because an address
can have at most one live code, an email address is a sufficient handle for revocation, which is why
listing is not needed rather than merely not built.

**A code's lifetime is a named constant in the service** — twenty-four hours, in code, not in
configuration. Deliberately not an environment variable: a security-relevant window that differs
per environment, invisibly, is worse than one that requires a commit to change.

**Expiry is checked where the other refusals already are.** Code validation already refuses a used
code, a revoked code, and a wrong email. Expiry becomes a fourth branch in the same function, so
there is one place that decides whether a code may be redeemed.

**The duplicate guard must exclude expired codes.** The existing guard refuses to issue a code when
an unused, unrevoked one exists for that address. An expired code is still unused and unrevoked, so
without this change a single expired code would permanently block that address — a bug this feature
introduces rather than one it inherits. It gets its own acceptance criterion.

**An email address becomes mandatory on a code**, enforced by a database constraint rather than a
function signature, because a constraint holds when a new code path forgets. This also removes the
current footgun: the creation function defaults the email to nothing, and nothing means *any address
may redeem this code*.

**The creator reference is removed, not made nullable.** With no HTTP endpoint and a database-direct
tool, every code from now on would have no creator, and a column that is empty for every new row is
drift with a delay timer. Removing it also disposes of a cascade rule that would have deleted every
code a removed user had issued, including redeemed ones — so the problem is deleted rather than
fixed. The *redeemer* reference stays: who signed up with which code is real history worth keeping.

**Roles are removed from the model, the response schema, and the client's types.** The permission
that the role existed to express — who may issue a code — is now expressed by database access.

**Deployment ordering.** Both repos deploy automatically on a green push, so the two halves land at
different moments. The client stops reading a role *first*. It is safe in either order (an absent
role reads as not-superadmin, so the redirect falls through to the teacher dashboard rather than
crashing) but taking the client first removes the window entirely, at no cost.

**Schema changes, one migration:**

| Change | Existing rows |
|---|---|
| add code expiry, mandatory | backfilled to *created + 24 hours*, so every existing code lands already expired |
| email address becomes mandatory | rows with no email are **revoked**, not deleted, so redemption history survives |
| creator reference dropped | — |
| user role dropped | — |

## Testing Decisions

**A good test here asserts external behaviour through the highest existing seam, and says nothing
about how the code is arranged.** The suite already demonstrates both seams this slice needs, so no
new one is introduced.

**Seam 1 — the route seam** (`client` fixture, HTTP against the real app). Everything about
*redeeming* a code is tested here, because signup is a route. Prior art:
`TestSignupWithRegistrationCode` already covers refusal for a used code, a revoked code, and a
mismatched email in exactly this style; the expired-code refusal joins them.

**Seam 2 — the service seam** (`db` fixture, calling service functions). Everything about *issuing
and revoking* is tested here, because deleting the admin routes removes the route seam those
operations used to have. Prior art: `TestRegistrationCodeService`, seventeen tests.

**No third seam for the command line.** With all behaviour in the service, the script is argument
parsing and printing. It is proven by a live exercise instead of a test — run it, read the output,
sign up with what it printed. A live recipe is the honest enforcer for a tool whose whole surface is
a terminal.

**Regression matters more than usual in this slice**, because it removes a permission concept. The
seventeen denial tests in the authorization suite must stay green: they are the evidence that
removing a role did not weaken who may read whose attendance. That is an acceptance criterion, not
an assumption.

**Migration behaviour is proven live, not by unit test.** Asserting on a backfill means running
the migration against data, and the data that matters is production's. The recipe is: restore the
pre-deploy backup into a scratch database, migrate it, and check that every pre-existing code came
out expired and that no row was deleted. Cheaper and more honest than simulating it.

## Acceptance Criteria

Each criterion names how it will be proven, before any code is written. Verdicts are filled by
`/verify-live`, and the slice's verdict is the **worst** of them.

**Filled 2026-09-02 at `/ship`, and completed after the deploy. The slice's verdict is `WORKS`** —
every criterion passed, with two recorded as narrower or harder-won than their wording:

- **AC-17 failed on its first real run** and is the reason this slice shipped a follow-up commit.
  `target()` parsed `DATABASE_URL` with `urlparse`; production's password contains a `/`, so the
  tool could not execute on the server at all, and the crash quoted a password fragment into a
  traceback. This is the single strongest argument in this spec for a `live:` criterion existing:
  the suite was green, 296 tests passed, and the feature's headline use case did not work.
- **AC-8** is narrower than its wording — the constraint refuses `NULL`, not `''`.
- **AC-14** failed twice before passing, for two pre-existing client defects that had to be fixed.
- **AC-17's** last step (actual account creation) was deliberately not exercised in production.

| # | Criterion | Proven by | Serves | Verdict |
|---|---|---|---|---|
| AC-1 | A code issued now expires exactly 24 hours later | `test:` service seam | US-3 | **WORKS** `test_create_registration_code_expires_in_24_hours` |
| AC-2 | Signing up with an expired code is refused, with a message naming expiry | `test:` route seam | US-11, INV-6 | **WORKS** `test_signup_with_expired_code` |
| AC-3 | Signing up with an already-used code is still refused | `test:` existing, regression | US-12, INV-6 | **WORKS** `test_signup_with_used_code` |
| AC-4 | Signing up with a revoked code is still refused | `test:` existing, regression | US-5, INV-6 | **WORKS** `test_signup_with_revoked_code` |
| AC-5 | Signing up with an address the code was not issued for is refused | `test:` existing, regression | US-10, INV-7 | **WORKS** `test_signup_with_email_restricted_code_wrong_email` + `test_signup_with_a_code_that_names_no_address`; also live, 400 for the wrong address |
| AC-6 | An **expired** code does not prevent issuing a new code for that address | `test:` service seam | US-7 | **WORKS** `test_expired_code_does_not_block_a_new_one_for_that_email` |
| AC-7 | A live code **does** prevent issuing a second one for that address | `test:` service seam | US-8 | **WORKS** `test_live_code_blocks_a_second_one_for_that_email`; also live, `code-issue` exits 1 |
| AC-8 | A code cannot be stored without an email address | `test:` constraint violation at the service seam | US-2, INV-7 | **WORKS** `test_a_code_cannot_be_stored_without_an_address` (NULL refused by the DB) + `test_issuing_a_code_requires_an_address`. Narrower than the wording: `''` is still storable — confessed |
| AC-9 | Revoking by email revokes that address's outstanding code, and signup with it then fails | `test:` service seam + route seam | US-5 | **WORKS** `test_revoke_code_for_email` + `test_signup_with_a_code_revoked_by_email`; also live, issue → revoke → 400 |
| AC-10 | Revoking an address with no outstanding code fails with a clear error | `test:` service seam | US-6 | **WORKS** `test_revoke_code_for_email_with_nothing_to_revoke`; also live, `code-revoke` exits 1 |
| AC-11 | `GET /api/auth/me` returns no role field | `test:` route seam | US-17 | **WORKS** `test_get_current_user_carries_no_role`; also live, `/api/auth/me` and the signup response carry no `role` |
| AC-12 | The 17 authorization denial tests still pass unchanged | `test:` existing suite | US-20, INV-1 | **WORKS** 24 tests pass and `tests/test_authorization.py` is byte-unchanged across all four slices (`git diff 7b2a246..HEAD` empty on that path) |
| AC-13 | No admin route exists: the three former endpoints return 404 | `test:` route seam | US-15 | **WORKS** `TestAdminSurfaceIsGone` (3 tests); also live, all three return 404 authenticated, and `openapi.json` lists 19 paths with zero admin |
| AC-14 | A signed-in teacher landing on `/` reaches the teacher dashboard | `live:` browser walk | US-13 | **WORKS** live, headless Chrome over CDP. Failed twice first, for two pre-existing client defects — both fixed (`2e7821e`) |
| AC-15 | No admin screen is reachable in the client | `live:` browser walk of the three former paths | US-14 | **WORKS** live, all three former paths render the 404 page, signed out **and** signed in |
| AC-16 | Migrating a restored production backup leaves every pre-existing code expired, and deletes no rows | `live:` scratch-database recipe (Testing Decisions) | US-19 | **WORKS** on production's own rows — its `20260902_055137` backup restored to a scratch DB, 4 migrations up: the one code `expires_at = created_at + 24h`, already expired; counts byte-identical across 6 tables; 4 down and 4 up again lose nothing |
| AC-17 | The tool issues a working code on the production server, end to end | `live:` issue, then sign up with it | US-1, US-9 | **WORKS, after failing first.** Run 1 crashed — `target()` used `urlparse`, production's password contains a `/`, and the tool could not run at all. Fixed (`61270d6`, `make_url` + 17 tests) and re-run on the server: code issued with a 24h expiry and the database named without its password; a **different** address refused 400; the **named** address returned 409 `Email already registered`, which is validation *passing* and creation stopping on the duplicate — so the code is proven redeemable with **no account created** and the row left `used=false`; `revoke` then revoked it, signup with it returned 400 `revoked`, and a second `revoke` exited 1. Caveat kept: the final `create_user` step was deliberately not exercised, to avoid leaving a junk account in production |
| AC-18 | Both repos' gate sets are green on every commit in this slice | `gate:` `just check` and `npm run check` | — | **WORKS** every commit gated; every CI job also re-run locally, including the suite under CI's exact env (299 pass) and real `gitleaks` (no leaks, both repos) |
| AC-19 | `INVARIANTS.md` carries the rewritten INV-6 and the new INV-7, each naming a real enforcer | `gate:` drift-check invariant rule + `review-only` | US-18 | **WORKS** INV-6 rewritten for expiry, INV-7 added naming a `constraint:` plus three tests; drift gate's invariant check passed on the row |

## Tracer Slices

Each cuts data → logic → surface → words and is demoable on its own. Order is deliberate.

**Slice 1 — expiry.** The lifetime constant, the expiry column and its backfill, the fourth refusal
branch, and the duplicate-guard fix. Demoable without any of the rest: issue a code through the
service, make it old, watch signup refuse it. Touches no role and no screen.
*Serves AC-1, AC-2, AC-6, AC-7, AC-16.*

**Slice 2 — the command line tool.** Two service functions and the script pair. Demoable: run
`issue`, sign up with what it printed; run `revoke`, watch signup fail.
*Serves AC-9, AC-10, AC-17.*

**Slice 3 — mandatory email.** The constraint, the revocation of legacy empty-email rows, and the
signature change. Demoable: storing a code without an address is refused by the database.
*Serves AC-8, AC-5.*

**Slice 4 — roles and the admin surface.** The one slice that **must span both repos**, because the
client reads the role in two places; dropping the column while the client still reads it leaves the
client asserting a field that is gone. Client edits land first (see Deployment ordering). Includes
dropping the creator reference. Demoable: sign in, land on the dashboard, find every admin path
gone, and see no role in the profile response.
*Serves AC-11, AC-12, AC-13, AC-14, AC-15.*

## Deletion Inventory

Verified 2026-09-01 by reading the code. **Re-verify before deleting** — this list is evidence with
a date on it, not a standing fact, and `/prune` discipline says proof comes before deletion.

**Client — deleted (8 files, 698 lines).** The admin authentication page, dashboard page and
registration-codes page; the admin layout and navigation components; the admin route guard; the
registration-codes hook; the admin API module. No test in the client references any of them.

**Client — edited (3 files).** The router loses three imports and three routes. The landing page
loses its role branch and always sends a signed-in user to the teacher dashboard. The API types lose
the role field.

**API — deleted.** The admin router module and its registration line; the superadmin dependency and
its type alias; the role enum and column; the role field on the profile response schema; the creator
column and both sides of its relationship; the superadmin creation script and its shell wrapper.

**API — dead after this slice, and therefore `/prune`'s to prove and remove:** the code-listing
service function and the code-deletion service function. Both become reachable only from tests once
the admin router goes. See open question 3.

**Tests.** The nine admin route tests go with the routes — four of them are authorization tests, and
losing those is correct precisely because the surface they guarded no longer exists. One service test
asserts that a code can be created with no email and must change. The fixture that creates a
superadmin becomes unnecessary, and the fixture that creates a valid code must stop setting a
creator.

## Out of Scope

- **The `Dockerfile` copies the whole build context with no ignore file**, so anything present on the
  server when the image is built is baked into it, including an environment file if one is there.
  This is a real finding, it is not this slice's job, and widening the slice to fix it would be scope
  creep. It gets a `REVIEW-DEBT.md` entry and belongs to `/audit`.
- The five-year legacy-student filter and its reveal-and-purge screen — separate spec, already owed.
- Shared classes — separate spec. It will change INV-1's definition of *associated with*.
- Consolidating the seven ownership enforcement sites — already confessed, and better done alongside
  shared classes than before it.
- Any visual redesign of the client.

## Non-Goals

Each carries the trigger that would make it worth revisiting.

| Non-goal | Revisit when |
|---|---|
| A listing command | you need to know what is outstanding and cannot simply issue a fresh code |
| A configurable code lifetime | 24 hours proves wrong in practice — not before |
| A replacement admin interface | a second operator needs to issue codes without database access |
| Codes any address can redeem | you actually want an open invitation, and accept what that means |
| Notifying the recipient automatically | you are issuing codes often enough that copying one is the annoying part |

## Open Questions

Recorded rather than assumed. None of them blocks Slice 1.

1. **How the tool gets run on the production server.** Scripts do reach the image, so executing
   inside the running container works. No deployment document describes that path today. Does this
   want a documented one-liner in the deployment README, or is working it out at the time fine?
2. ~~**What revoking should do when the address has no outstanding code.**~~ **Answered
   2026-09-01: a clear error.** The Owner confirmed AC-10 as written. `revoke` prints
   `No valid registration code for <address>` and exits 1.
3. **Whether `/prune` runs inside this slice** to remove the two newly-dead service functions and
   their tests, or as a named follow-up immediately after.

## Spec Deltas

Diverging from this spec during the build is normal; diverging silently is the defect. Every change
lands here, dated, with what the build taught us.

| Date | What changed | Why |
|---|---|---|
| 2026-09-01 | **Dropping the creator reference moved from Slice 4 into Slice 2.** | The tool has no user, and `created_by_user_id` was `NOT NULL`, so Slice 2 could not insert a row at all until the column went. The alternatives were recording a false creator — which ADR-0003 rejects by name — or building Slices 3 and 4 first. Owner chose the move on 2026-09-01. Slice 4 keeps roles and the admin surface; it no longer touches the creator. |
| 2026-09-01 | **One new service function, not two.** | The spec said "two new service functions: one to issue a code for an email, one to revoke". Once the creator argument was gone, `create_registration_code(db, email_restriction)` *is* the issue function, so a second name for it would be two words for one thing (ANTI-PATTERNS). Only `revoke_code_for_email` is new. |
| 2026-09-01 | **`CodeResponse` gained `expires_at`.** | Slice 1 confessed that the admin surface showed codes with no hint they expire. Slice 2 edits that schema anyway to remove `created_by_user_id`, so the fix cost one line here instead of staying debt until Slice 4. The REVIEW-DEBT entry is closed. |
| 2026-09-01 | **Open question 2 answered: revoking a nothing is an error.** | Owner confirmed AC-10 as written on 2026-09-01. `revoke` exits 1 and names the address when there is no live code. Silence would hide a typo (US-6). |
| 2026-09-01 | **Legacy codes with no address are revoked *and* given `''`.** | The schema table said "rows with no email are **revoked**, not deleted" and stopped there — but revoking does not fill a `NOT NULL` column, so the migration had to write *something*. Owner chose `''` on 2026-09-01 over two alternatives: a `CHECK ... NOT VALID` that would leave production permitting a NULL the model denies, and backfilling the redeemer's address, which asserts a code was issued *for* someone when it was issued for anybody — the false record ADR-0003 refused for the creator. `''` equals no address a signup can present, so the row matches nobody rather than everybody, and it is revoked as well. Cost confessed: the constraint is `NOT NULL`, not "a real address". |
| 2026-09-01 | **The two "create a code" tests became one.** | `test_create_registration_code` asserted `email_restriction is None` and `test_create_registration_code_with_email_restriction` asserted it was set. With no address there is no code (INV-7), so the second asserted a strict subset of the first. Merged rather than left as two names for one behaviour (ANTI-PATTERNS). |
| 2026-09-01 | **Open question 3 answered: `/prune` runs inside Slice 4, and the inventory was short by one.** | Re-verifying the Deletion Inventory found **three** functions with no caller after the admin router goes, not two: `list_registration_codes`, `revoke_code(db, code_id)` — the CLI revokes by email — and `delete_code`, which had **no caller at all, not even a test**, before this slice began. Owner chose removal inside Slice 4 on 2026-09-01, because the proof was already complete and five tests existed only to keep the functions alive. |
| 2026-09-01 | **Open question 1 answered: the production recipe lives in `scripts/README.md`.** | The image copies `scripts/` in, installs dependencies globally and sets `DATABASE_URL`, so `docker compose exec backend python scripts/registration_code.py issue <email>` works — but the shell wrapper demands a `venv/` the image has no reason to have. Owner chose this repo's `scripts/README.md` over the deployment repo (which `/ship` does not push) on 2026-09-01. The wrapper's no-venv error now names the container form instead of telling an operator to build a virtual environment inside a container. |
| 2026-09-01 | **Out of scope, found while answering open question 1: production `/docs` runs on `admin` / `changeme`.** | `app/config.py:26-27` defaults them and the production compose sets no `DOCS_*`, so nothing can override them as deployed; `/docs` returns 401, confirming Basic auth is live on those values. Not fixed here — it is `/audit`'s and needs an Owner decision, because the fix makes production refuse to boot without the variables. Filed in `REVIEW-DEBT.md`. |
| 2026-09-02 | **AC-14 failed live, twice, for two pre-existing client defects — both fixed.** | `AuthContext` started `loading` at `false`, so `ProtectedRoute` redirected on its first render before its own `checkAuth()` could read the refresh cookie; and `Index.tsx` never called `checkAuth()` at all. A cold load of `/` sent a signed-in teacher to the login screen. Neither is caused by this spec, but AC-14 is *this spec's criterion*, and `Index.tsx` is a file this slice edits — so fixing them is in scope rather than adjacent to it. Owner approved on 2026-09-02. Six client tests added; AC-14 and AC-15 then passed live. |
| 2026-09-02 | **The `/docs` credential finding was fixed too, and its cause was not the default.** | The real values were **already set** in the server's `deployment/production/.env`; the `backend` service in `docker-compose.yml` never listed them, so the container received neither and the app fell back to `admin` / `changeme`. Fixed across both repos: the defaults are gone, `Settings` refuses to boot when the docs are protected and a credential is missing, and the compose passes them through. The guard immediately caught a second instance — CI's test job sets `ENVIRONMENT: test` with no `DOCS_*` and would have failed at collection. Owner approved on 2026-09-02. |
| 2026-09-02 | **AC-17 failed on its first real run: the CLI could not execute in production.** | `target()` parsed `DATABASE_URL` with `urllib.parse` and read `.port`. Production's password contains a `/`, which truncates urlparse's netloc, so `.port` raised `ValueError` quoting a password fragment — and `ValueError` was not among the caught exceptions, so the tool died on a traceback. It worked on every machine with a simple password. The spec's Testing Decisions said the script needed no tests because it is "argument parsing and printing"; that was right about the behaviour and wrong about this pure function, whose failure depends on a value that differs per environment. Fixed with `sqlalchemy.engine.make_url` and 17 tests. **This is the clearest possible argument for AC-17 existing.** |
