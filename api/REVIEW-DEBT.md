# REVIEW-DEBT.md — student-attendance-tracker-api

The standing ledger of everything the green tests do NOT prove. Written at the moment a corner is
cut (`/confess`), read first by any architecture or review session, dispositioned by the Owner
(fixed / accepted-with-reason / promoted-to-issue).

<!-- Newest first. -->

## 2026-09-11 — the query budget guards an enumerated list, so a fourth N+1 sat unwatched
- **What:** `GET /api/classes` ran one `COUNT` per class in a Python loop — **7 statements for 5
  classes** — and had done so since the endpoint was written. The entry below is headed "three
  N+1 loops" and dispositioned **closed**; it was closed for the three it names, and that is a
  narrower claim than it reads as. This fourth one was found only because spec 0006's sidebar
  needed a second count on the same endpoint, which is luck, not a gate.
- **Where:** fixed at `app/services/class_service.py` — both counts now ride the class query as
  correlated subqueries, **2 statements**, measured unchanged at 1, 5 and 20 classes. The same
  `COUNT` had also been inlined separately in `list_classes`, `get_class` and `update_class`, with
  a service helper (`get_class_with_attendance_count`) that had no production caller at all —
  four implementations of one query. There is one now (`count_class_rows`).
- **What green tests/gates did NOT prove here:** `tests/test_query_budget.py` is a ratchet over a
  **hand-written parametrize list**. An endpoint nobody added to that list is not slow-tested at
  all, and nothing fails when a new endpoint is added without a budget. The four routes it holds
  are the four someone thought of in September; `/api/classes`, `/api/auth/*` and the statistics
  route were never on it. Coverage does not help — these lines were all covered.
- **Disposition:** partly closed. `/api/classes` now has a ceiling and was watched failing at 7
  against 3 before the fix. **Open:** the remaining unbudgeted endpoints, and the absence of
  anything that notices a new route arriving without a budget. A cheap version is a test that
  walks the OpenAPI paths and fails on any list route missing from the parametrize list.

## 2026-09-11 — every nginx.conf change since the bind mount existed may never have taken effect
- **What:** `deployment/production/docker-compose.yml` mounts `./nginx.conf:/etc/nginx/nginx.conf:ro`
  — a **single-file** bind mount, which Docker binds by **inode**. The deploy's step 3 runs
  `git reset --hard`, which replaces the file rather than editing it in place, so the running
  container's mount keeps pointing at the old, now-unlinked inode and nginx keeps reading the
  previous bytes. `nginx -t` then validates the stale config and `nginx -s reload` reloads it,
  both succeeding honestly.
- **Found in production, 2026-09-11, deploying `d25ec29`** (spec 0005 slice 6). The deploy printed
  `nginx reloaded against the current nginx.conf` and went green. Neither the six
  `proxy_set_header X-Request-ID` lines nor the `request_id=` `log_format` was in effect: the
  access line carried no id, and the app's `request_id` was a dashed `uuid4` — what the middleware
  generates when no header arrives — where a forwarded `$request_id` is 32 hex characters.
  `docker compose exec nginx grep -c request_id /etc/nginx/nginx.conf` returned **0** against the
  file's **9**.
- **Reproduced locally rather than left as a theory:** a two-line compose project with a
  single-file mount. Replace the file the way `git checkout` does and the container keeps the old
  sha256; `up -d` reports `Running` and changes nothing; `up -d --force-recreate` re-binds and the
  checksums match. Docker's behaviour, not nginx's.
- **The blast radius is every earlier nginx.conf change.** A reload could never have picked one up.
  Any that did take effect did so because something recreated the container for another reason —
  a host reboot, a compose spec change, a manual `down`/`up`. The SSL work is the one to re-check
  if anything there ever looked mysteriously inert.
- **Fixed in the pipeline the same day:** step 7b of `.github/workflows/backend.yml` no longer
  reloads. It compares the file's sha256 against what the container actually reads, and on a
  difference validates the new file in a throwaway `nginx:alpine` on `attendance-prod-network`,
  recreates the container, re-checks the checksum, and health-checks the public endpoint through
  the new proxy. An unchanged file does nothing, so the common deploy keeps its current behaviour.
- **Half proven on the VM, 2026-09-11.** The `61feba3` deploy ran the new step and reported
  `nginx.conf unchanged (sha256 227d07c7...) - nothing to do`. That proves the detector reads a
  checksum from both sides, that host and container now agree, and that an unchanged file costs no
  restart.
- **The other half is still unproven, and it is the half with the moving parts:** the `else`
  branch — validating in a throwaway `nginx:alpine` on the hardcoded `attendance-prod-network`,
  `--force-recreate`, the post-recreate checksum re-check, and the second health check through the
  new proxy. None of it has executed, because a deploy only reaches it when `nginx.conf` changes.
  This commit changes `nginx.conf` (a comment) for exactly that reason, so the deploy carrying
  this entry is the path's first exercise. If that deploy's `nginx config` group does not print
  `✔ nginx recreated and reading <sha>` followed by `✔ healthy through the new proxy`, this entry
  is what to read first.
- **Disposition:** the mechanism is fixed and confessed. Open only on "the next deploy is its own
  proof", and on the question of whether any past nginx change was silently lost.


## 2026-09-11 — the migration step recreates the database, and the deploy's own comment denies it
- **What:** step 6 of `.github/workflows/backend.yml` says *"The database is never taken down: the
  old `compose down` stopped postgres too, which turned every deploy into a database outage for no
  reason"*, and recreates only `backend nginx jaeger`. That is true of step 6 and **false of the
  deploy**. Step 5 runs `$COMPOSE run --rm backend alembic upgrade head` with **no `--no-deps`**,
  so compose brings dependencies up to spec first — and when the `db` service's spec has changed,
  that means recreating PostgreSQL.
- **Observed in the 2026-09-11 deploy of `d25ec29`**, which is the first deploy to change the `db`
  service (slice 6 added its `logging` block). The log, in order: `attendance-db-prod Recreate` →
  `Recreated` → `Started` → `Waiting` → `Healthy` at 09:31:20–09:31:26, immediately before
  `production-backend-run-38a8b0e01438 Creating`. **Roughly six seconds of database downtime**,
  inside a deploy whose design says there is none.
- **It only bites when the `db` service's spec changes**, which is rare — an unchanged spec means
  `compose run` starts the dependency without recreating it. So most deploys really do leave
  postgres alone, and the comment reads true for years at a time before it is wrong once.
- **The upside, and it was an accident:** this is what satisfied **AC-16** on the VM. The bound
  reached the running container through the migration step, not through step 6. Confirmed by the
  Owner after the deploy — `up -d --no-deps db` reported `Running` rather than `Recreated`, and
  `docker inspect` returned `map[max-file:3 max-size:10m]`.
- **What this entry replaces.** It was first written as "the deploy does not apply the `db` log
  bound, so AC-16 needs one manual command", reasoned from step 6's service list and a local
  proof that log options need container recreation. Both halves of that were right and the
  conclusion was wrong, because step 5 was never read. The local proof measured Docker's
  behaviour and not this pipeline's.
- **Disposition:** open, and the fix is the comment rather than the code. Step 6's claim should say
  that step 5 brings dependencies to spec, so a `db` spec change costs a short restart. Changing
  the code instead — adding `--no-deps` to step 5 — would stop the migration from being able to
  reach a database that is not already up, which is worse.

## 2026-09-11 — slice 6's four criteria are proven as mechanisms locally, not yet on the VM
- **What:** slice 6 is built (nginx forwards `X-Request-ID` from six proxied locations and logs
  `request_id=` on its access line; `db` has a `logging` block in both compose files; `logs.sh`
  has a `--json` path). Each mechanism was exercised locally with real components:
  - **AC-12** — real nginx with the production config and a stub upstream. Three probes; the id
    the upstream received matched the id on nginx's access line every time. A client-supplied
    `X-Request-ID` was replaced by nginx's own (spec delta 20).
  - **AC-16** — `docker compose config` on both files resolves `db` to
    `json-file / max-size 10m / max-file 3`.
  - **AC-17** — the real `logs.sh`, run against a real `docker compose` project emitting three
    lines from the app's own `JsonLineFormatter` mixed with seven non-JSON lines (postgres,
    a real captured nginx access line, a uvicorn access line, a four-line traceback). All three
    app lines came through, all seven noise lines were skipped, and each documented filter
    returned the expected count.
- **What the four criteria ask for and this does not cover:** none of it ran on the VM, against
  the real backend, the real nginx or the real database. AC-16's wording is explicit ("confirmed
  on the VM after deploy"). AC-11 needs `OTEL_EXPORTER_OTLP_ENDPOINT` set and a trace in Jaeger,
  which no local exercise touched, so **AC-11 remains entirely unexercised** — a stub upstream
  emits no spans.
- **Consequence:** the verdicts stay **BLOCKED** until `/verify-live` runs after a deploy. A local
  mechanism proof shows the config parses and behaves; production is a separate claim.
- **Disposition: closed, 2026-09-11.** `d25ec29` deployed and the Owner exercised all four on the
  VM. All read WORKS, with the evidence in the spec's footnotes 3–5.
- **And the gap between the two was real, which is the point of this entry.** AC-12 came back
  **BROKEN** on the first check despite a green deploy — the local mechanism proof was sound and
  production still served a stale nginx config, because the bind mount was never re-bound. Had the
  verdicts been filled from the local evidence plus a successful deploy, AC-12 would read WORKS and
  be false. The separate entry above carries the mechanism.

## 2026-09-11 — only `db` gained a log bound; local's other services are still unbounded
- **What:** AC-16 names the `db` service, so that is what slice 6 bounded in both compose files.
  In `deployment/local/docker-compose.yml` the `backend` and `jaeger` services, and the
  profile-gated `db-test`, still have **no** `logging` block, so their container logs grow without
  limit on a developer machine. Production has all four bounded.
- **Why not fixed here:** staying inside the slice's stated scope. The stakes differ by an order
  of magnitude — a developer disk versus the CX21 that also holds the database.
- **Disposition:** open, low priority. Three `logging` blocks copied from `db`, whenever someone
  is in that file anyway.

## 2026-09-11 — the `--json` jq guard was exercised through its body, with the condition swapped
- **What:** `logs.sh --json` refuses with a clear message when `jq` is missing. `jq` is installed
  on this machine and `docker` shares `/usr/bin` with it, so a `PATH` that hides one hides the
  other. The branch was exercised by running a copy whose condition was changed to a command that
  cannot exist — which proves the message and the `exit 1`, **not** that `command -v jq` is the
  right test.
- **Disposition:** accepted. The condition is a one-line idiom; the cost of a rig that removes
  only `jq` exceeds what it would prove.

## 2026-09-11 — `/api/` forwards `Connection: upgrade` with an empty `Upgrade` header
- **What:** noticed while exercising AC-12, and **pre-existing** — not introduced by slice 6.
  `deployment/production/nginx.conf`'s `/api/` location sets `proxy_set_header Connection
  "upgrade"` unconditionally alongside `Upgrade $http_upgrade`. On an ordinary request
  `$http_upgrade` is empty, so the upstream is told `Connection: upgrade` with nothing to upgrade
  to. The stub upstream used for the probe hung on it until its keepalive timed out; FastAPI
  behind uvicorn has served production this way for months without trouble, so the practical
  impact looks nil.
- **Why not fixed here:** out of slice 6's scope, and the safe form (an `http`-level `map` of
  `$http_upgrade` to `$connection_upgrade`) changes a directive on the path every request takes.
  That earns its own commit and its own live exercise.
- **Disposition:** open, for the Owner. The `/api/auth/` location does **not** set these two
  headers, so the two proxy paths already differ.


## 2026-09-10 — `LOG_LEVEL=WARNING` silently switches off the irreversible-act record
- **What:** found by `/verify-live`, not by a test. The merge and student-delete lines are `INFO`;
  every denial and every error is `WARNING` or above. So setting `LOG_LEVEL=WARNING` keeps the
  refusal record flowing while **the audit trail for destructive acts disappears**, and nothing
  says so. Measured: at `WARNING` a delete returned 204 with no line at all, while a login denial
  in the same run logged normally.
- **Where:** `app/core/logging.py` — `resolve_level()` reads `LOG_LEVEL` from the environment with
  `DEFAULT_LEVEL = logging.INFO`; the act lines are emitted at `logging.INFO` from
  `student_service.merge_students` and `delete_student`.
- **What green tests/gates did NOT prove:** `tests/test_logging.py` asserts `LOG_LEVEL` changes the
  level, which is AC-14 and is correct. No test asks what is *lost* at each level, because the
  criterion was written about the mechanism rather than about the consequence.
- **Why this is not a bug today:** production sets no `LOG_LEVEL` — not in `deployment/production/`
  and not in either compose file — so the default `INFO` applies and both act lines are recorded.
  The hazard is that turning the log down is an obvious, innocuous-looking thing to do to a chatty
  service, and it costs exactly the record US-5 asked for.
- **Disposition:** **closed, 2026-09-11 (slice 6), documented rather than changed in code.** The
  Owner chose documentation. Emitting the acts at `WARNING` was the alternative and is worse,
  since it files a successful intended operation at the level a refusal uses.
- **Where the note landed, and the first attempt got this wrong.** It went into `api/.env.example`
  and `deployment/README.md` first, which is what this entry asked for — but neither is read on
  the VM. `/code-review`'s spec axis caught it: an operator raising the level edits
  `deployment/production/.env.example` or the `backend.environment` block in
  `deployment/production/docker-compose.yml`, and both now carry the warning too. The compose
  block also records why `LOG_LEVEL` is not passed through at all.

## 2026-09-10 — the inactive-account login message tells a stranger the address is registered
- **What:** found by `/verify-live` while measuring AC-2. `authenticate_user` returns three
  messages for three branches, and the third is distinguishable from outside:
  - unknown email -> `{"detail":"Invalid email or password"}`
  - wrong password -> `{"detail":"Invalid email or password"}`  (byte-identical, by design)
  - **inactive account** -> `{"detail":"Account is inactive. Please contact support."}`

  The inactive check runs **before** `verify_password`, so an unauthenticated caller learns that an
  address exists and is deactivated **without presenting a credential**. That is user enumeration,
  and it contradicts spec 0005's own stated rationale for the other two being identical: "telling a
  stranger whether an address is registered is the enumeration this app declines to answer".
- **Where:** `app/services/auth_service.py` — `authenticate_user`, the `if not user.active` branch
  above the password check.
- **What green tests/gates did NOT prove:** `tests/test_logging_events.py::test_an_inactive_account_is_the_third_distinguishable_branch`
  asserts this exact message, so the suite *locks the leak in*. It was written to prove the branch
  is distinguishable in the log, and the response assertion came along with it.
- **Scale, honestly:** this app has **one** production teacher and signup requires a
  single-use, 24-hour, email-restricted registration code (INV-6, INV-7), so there is no
  self-service population to enumerate. nginx rate-limits the auth path at 5 r/m. The finding is
  real and its exploitability here is close to nil — which is why it is a ledger entry rather than
  a fix jammed into a logging slice.
- **Why it was not fixed here:** returning `Invalid email or password` for an inactive account
  removes the leak and also removes the only hint a real deactivated teacher gets about why she
  cannot log in. That is a product trade — the Owner decides, and `/audit`'s 2026-09-02 threat
  model (the attacker is a logged-in teacher probing other teachers' rows) did not rank
  unauthenticated enumeration.
- **Disposition:** **closed, 2026-09-11 — the Owner chose to unify the message.** The inactive
  branch now raises `Invalid email or password`, byte-identical to the other two, and the branch
  is proven by the log's `reason=inactive_account` rather than by its response text. A
  deactivated teacher loses her only hint and has to contact the school, which is what the old
  message told her to do anyway.
- **Four sites moved. The estimate was wrong twice, both times from a truncated `grep`** — first
  at two, then at three. One code site: `app/services/auth_service.py`, the message plus the
  comment above it, which claimed two of three branches shared a response. **Three** tests were
  locking the old message in, and only the first was known when the work started:
  - `tests/test_logging_events.py` — asserted the body verbatim; now asserts that the inactive
    and unknown-email responses are byte-identical to each other
  - `tests/test_service_auth.py::test_authenticate_inactive_user` — `"inactive" in
    str(exc.value)`, at the service level; now reads the log line
  - `tests/test_auth.py::TestLogin::test_login_inactive_user` — `"inactive" in detail`, at the
    route level; now asserts the unified body. **This one was found by the full suite, not by
    reading**, which is the argument for running it rather than the changed files.
- **Deliberately unchanged:** `app/dependencies.py:67` still answers `Account is inactive` and
  `tests/test_dependencies.py:125` still asserts it. That path requires a **valid token**, so it
  tells a stranger nothing and the message stays useful to the teacher holding the session.
- **Watched fail both ways:** both tests went red on the change before they were rewritten, and
  red again on a re-plant of the old message afterwards, restored in a `finally`. Spec 0005
  delta 18 carries the same closure from the criterion's side; **AC-2's wording is now true as
  written**.


## 2026-09-10 — INV-9's gate cannot see through a `**kwargs` expansion, and its allowlist must be widened by hand
- **What:** `scripts/log_lint.py` checks logger-call keywords against `ALLOWED_KEYWORDS` and
  literal `event`/`rule`/`reason` values against three known sets. Two things it cannot do:
  - **`**fields` is invisible.** `app/api/handlers.py` builds a `fields` dict and expands it into
    `log_event(logging.WARNING, "denial", **fields)`. The keywords are not in the call's syntax,
    so `ast` cannot name them and the gate skips the expansion entirely. Today that dict is built
    three lines above from `reason`, `rule` and `status` — so it is safe by inspection, not by
    gate. The same blind spot covers `rule=INV_1`, a module constant rather than a literal.
  - **A widening is indistinguishable from a leak.** Adding a legitimate new field means editing
    the allowlist, and nothing checks that the editor argued for it. The gate converts a silent
    leak into a deliberate one, which is the whole gain, but it is not proof.
- **What green tests/gates did NOT prove:** the runtime sweep in `tests/test_logging_inv9.py`
  catches a name that actually reaches a line on one of the seven routes it drives, including
  through `**fields`. So the two enforcers overlap rather than nest: the gate sees syntax the
  test cannot reach, the test sees values the gate cannot resolve. Neither alone is INV-9.
- **Why it was not fixed here:** resolving `**fields` means following a local dict through the
  function, which is a small dataflow analysis. Spec 0005 delta 11 already argues the cheaper
  direction — call sites should pass literals, so the gate can read them — and `handlers.py` is
  the one site that does not.
- **Disposition:** **open, low priority.** The honest fix is to make `handlers.py` pass its
  fields explicitly rather than to teach the gate dataflow. Worth doing the next time that
  handler is touched for another reason.


## 2026-09-10 — a cross-teacher merge was refused as INV-5 when the violation was INV-1's (FIXED same day)
- **What:** spec 0005 slice 4 labelled `merge_students`' same-Class refusal `rule="INV-5"` so it
  reaches the log (AC-21). That comparison runs **before**
  `class_service.verify_class_ownership` is called on the *duplicate's* Class, so a teacher
  reaching for **another teacher's** Student as the merge source is refused by the Class
  comparison and logged as an `INV-5` violation. No `INV-1` line is written for it at all.
- **Where:** `app/services/student_service.py` — `merge_students`, the same-Class comparison and
  the `verify_class_ownership` call five lines below it.
- **The enforcement is intact; the record is wrong.** Measured rather than reasoned about: the
  request returns **400**, the merge does not happen, nothing moves, and exactly one line comes
  out carrying `rule=INV-5`, `reason=cross_class_merge`. INV-1 still refuses the same request
  through the *target's* ownership check whenever the target is another teacher's
  (`tests/test_authorization.py::test_other_teacher_cannot_merge_another_teachers_students`
  covers that side). What is broken is which rule the log names for the duplicate side.
- **What green tests/gates did NOT prove:** nothing covered the duplicate-side denial before
  this slice — the refusal was silent, so there was no attribution to get wrong.
  `tests/test_logging_events.py::test_another_teachers_student_as_the_duplicate_is_logged_as_inv_5_not_inv_1`
  now pins the current behaviour, so a reorder fails it deliberately rather than silently
  changing what the log says.
- **Why it was not fixed in the slice-4 commit (`28a0373`):** the fix moves
  `verify_class_ownership` above the Class comparison, which turns that 400 into a 403 — an
  observable response change on the authorization path spec 0003 consolidated, and no
  acceptance criterion in spec 0005 asks for it. AC-21 asks only that a cross-Class refusal be
  logged. A logging slice changing an authorization response code is the Owner's call, not a
  build decision taken in passing (PRINCIPLES #8), so it shipped confessed and pinned.
- **Fixed 2026-09-10, on the Owner's decision, immediately after that commit.** The ownership
  check now runs first, so this request answers **403** and the line names `INV-1`. Watched
  failing first, both halves at 400: the response side in
  `tests/test_authorization.py::test_other_teacher_cannot_supply_her_own_student_as_a_merge_duplicate`
  (the merge's second surface — the duplicate arrives in the BODY, where the existing denial
  test only covered the target in the path), and the log side in
  `tests/test_logging_events.py::test_another_teachers_student_as_the_duplicate_is_refused_as_inv_1`.
  The three same-teacher cross-Class tests were unaffected, which is what confirms INV-5 still
  refuses what it is for. INV-1's denial-test count in `INVARIANTS.md` went 18 -> 19.
- **Disposition:** **closed, 2026-09-10** — reordered, not accepted. Kept in the ledger rather
  than deleted because the finding is the useful part: the log line is what made a two-week-old
  mislabel visible, which is the argument for spec 0005 that no acceptance criterion states.
  Recorded in spec 0005's delta 13 and in `INVARIANTS.md`'s INV-5 and INV-1 rows.

## 2026-09-10 — the two irreversible-act statements sit on a write path no ratchet watches
- **What:** slice 4 added one `SELECT count(*)` to the student-delete path
  (`count_attendance_for_student`, called before `db.delete` because the cascade destroys the
  rows the count needs). The merge path added none — the bulk `UPDATE`'s `rowcount` was already
  there and was being discarded.
- **Where:** `app/services/student_service.py` — `delete_student`.
- **What green tests/gates did NOT prove:** `tests/test_query_budget.py` holds statement
  ceilings for **four read endpoints** — students list, autocomplete, attendance list,
  attendance summary — and **none for any write path**. So this +1 is unmeasured by any gate,
  and so is the next one somebody adds to a mutation. The N+1 loops that file was built for were
  all on read paths, which is why the gap was never noticed.
- **Why it was not fixed here:** a write-path budget needs a fixture shape the file does not
  have — a mutation is not idempotent, so the count has to be taken against freshly built rows
  per parametrisation rather than against the shared `populated_class`. That is its own change
  and it would arrive untested by anything but itself.
- **Disposition:** **open**, unpinned to a slice. Small and worth doing before the next feature
  touches a mutation; it is not spec 0005's work.


## 2026-09-10 — a Student's name can still reach the container log, by traceback
- **What:** found by slice 3's live exercise against real uvicorn, not by a test. ADR-0007's rule
  is scoped to **log lines**, and slice 3 honours it — the `ERROR` line carries
  `exception=type(exc).__name__` and never `str(exc)`. But the traceback printed beside it is
  SQLAlchemy's, and SQLAlchemy renders **bound parameters** into the exception it raises:

  ```
  sqlalchemy.exc.ProgrammingError: ... relation "attendance_records" does not exist
  [SQL: SELECT ... WHERE students.class_id = $1::UUID ...]
  [parameters: (UUID('68eb565b-...'), datetime.datetime(2021, 9, 11, ...))]
  ```

  That run bound no name. Five query sites do: `attendance_service.py:85`, `:278`, `:329` and
  `student_service.py:176`, `:439` all bind a `LOWER(name) LIKE` pattern built from a
  caller-supplied search term. A failing query at any of them prints a partial Student name to
  stdout, in the same stream and the same rotation as the JSON lines.
- **Where:** `app/database.py` constructs the engine without `hide_parameters`, which defaults to
  `False`. **This one is not development-only** — that is the difference from the `echo` entry
  below, and it was checked rather than assumed: `echo` is off in production because
  `DEBUG: "false"`, but `hide_parameters` is unset everywhere, so exception rendering behaves the
  same on the VM as locally.
- **What green tests/gates did NOT prove:** nothing touches this. Spec 0005 lists "Reformatting
  uvicorn's output" as out of scope and leaves the traceback path deliberately alone (US-14), so
  no AC covers it and none should. The gap is not a violation of ADR-0007 — it is the distance
  between what that ADR says (log **lines** carry ids) and what a reader will assume from it
  (names never reach the log).
- **Why it was not fixed here:** `hide_parameters=True` is a one-line change to the engine, and it
  is not slice 3's to make. It trades away the bound values in every diagnostic traceback the app
  will ever print — the thing that makes a production 500 debuggable — against a leak that needs a
  failing query on one of five paths. That is a real trade with a real cost on both sides, so it
  is the Owner's call, not a build decision taken in passing.
- **The wording question this entry raised is DECIDED, 2026-09-10 (slice 5), by the Owner:**
  `INV-9` is scoped to **lines this application emits**, matching ADR-0007's own scoping and how
  that ADR already handles the seven `pg_dump` backups. `hide_parameters` stays `False`, so a
  diagnostic traceback keeps its bound values and this gap stays real. The row was written that
  way and names this entry.
- **Disposition:** **open — the gap, not the question.** The invariant no longer overclaims, and
  nothing else changed: a failing query on one of those five sites still prints a partial name to
  stdout. Revisit if a name ever turns up in a pasted traceback, or if the diagnostic value of
  bound parameters stops being worth it. Turning `hide_parameters` on is a one-line change to
  `app/database.py` and would need its own test watched red.

## 2026-09-10 — "every refused request" is 10 of 46 refusal sites, and one of the silent ones is an invariant
- **What:** spec 0005's **US-1** asks for "every refused request recorded durably". The AC table
  delivers four families — `INV-1` (AC-1), the three login branches (AC-2), registration codes
  (AC-3) and an inactive Class (AC-4) — and slices 3 and 4 add errors and irreversible acts. The
  difference between those and *every* refusal is **not declared** in the spec's *Out of Scope* or
  *Non-Goals*, so a reader of US-1 will over-read what got built.
- **Measured 2026-09-10**, by walking the AST of `app/` for `raise` of any refusal type: **46
  refusal raise sites, 10 of which now produce a log line** — 6 labelled (`rule`/`reason`), 1 by
  type (`class_service.py:237`, INV-1), and 3 by the explicit calls in `authenticate_user`.
  **36 are silent.** Re-measure rather than trusting the figure — it was true at slice 2. The
  method: parse each file under `app/` with `ast`, walk for `ast.Raise` whose `exc` is a call to
  one of the eight refusal types in `app/core/exceptions.py`, and count how many carry a `reason`
  keyword. Grep cannot do it: a multi-line labelled raise puts `rule=`/`reason=` on a different
  line from `raise`, which scored five labelled sites as silent on the first attempt.
- **The one that matters most:** `app/services/student_service.py:518` — a merge refused for
  crossing a Class boundary. That is **INV-5's enforcement site**, so an invariant refusal goes
  unrecorded while three login typos are recorded. Slice 4 logs a merge that *succeeds* (AC-7); it
  does not log the merge that was refused.
- **Also silent, and the group most likely to be wanted:** the 14 token-path refusals in
  `app/dependencies.py` (8) and `app/api/auth.py`'s refresh handler (6). A caller presenting a
  revoked, expired or forged token leaves no line at all — which is the shape of the thing US-1
  says it wants visible after the fact. The remaining 12 `NotFoundError`s are the group least
  likely to be worth a line.
- **What green tests/gates did NOT prove:** nothing here is a broken test. Every AC slice 2 owns
  passes. This is scope: the spec promised broadly in a user story and delivered narrowly in the
  criteria, and only the criteria got built.
- **Why it was not fixed here:** it is outside slice 2's ACs, and widening a slice to match a user
  story nobody re-scoped is *silent scope-filling*. The Owner decides whether this becomes a
  seventh slice, a narrowed US-1, or an explicit non-goal.
- **Disposition:** **decided by the Owner, 2026-09-10 — and the decision is a line, not a list.**
  *The app logs what nginx cannot interpret.* nginx records that someone was refused, from where,
  and how often; only the app knows which rule refused an authenticated Teacher. So:
  **`INV-5`'s cross-class merge refusal moves into slice 4** as spec 0005's new **AC-21** (it was
  the one silent site on the wrong side of that line); the **14 token-path refusals** and the
  **12 `NotFoundError`s** become explicit non-goals in the spec, with their reasons; and **US-1 is
  reworded** from "every refused request" to every refusal the application itself decided.
  This entry stays in the ledger as the measurement that forced the narrowing.

  One thing checked while writing it up, because the first draft got it backwards: declaring the
  `NotFoundError`s out of scope costs **no** `INV-1` signal. `verify_class_ownership` raises both,
  but it reports a Class's absence *before* its ownership — deliberately, so a 404 never becomes a
  403 — so every INV-1 refusal is the `ForbiddenException` branch that AC-1 already logs.

## 2026-09-10 — the `reason` vocabulary on a denial line has no enforcer (CLOSED, slice 5)
- **What:** spec 0005 slice 2 gives every denial line a `reason` — `unknown_email`,
  `wrong_password`, `inactive_account`, `code_used`, `code_revoked`, `code_expired`,
  `code_wrong_email`, `code_unknown`, `class_inactive` — and the `rule` beside it. Both are plain
  strings passed at the raise site. **Nothing checks the vocabulary.**

  **Updated 2026-09-10, slice 4:** the gap now covers a third field and two more values.
  `reason="cross_class_merge"` and `rule="INV-5"` joined the list, and the `event` name itself
  became a vocabulary rather than a constant — `denial`, `error`, and slice 4's two act tokens
  `merge` and `student_delete` (spec 0005 delta 11). Whatever slice 5 builds must close over
  `event` as well as `reason` and `rule`, or this entry outlives it and should say so. A later denial written as
  `reason="inactive-class"` or `rule="INV3"` would log happily, and the grep a reader relies on
  (`rule=INV-6` to count real INV-6 refusals) would quietly miss it.
- **Where:** `app/core/exceptions.py` (`BadRequestException.rule` / `.reason`),
  `app/services/registration_code_service.py`, `app/services/attendance_service.py:153`,
  `app/services/auth_service.py` — the three login branches.
- **What green tests/gates did NOT prove:** the tests assert the exact strings the code emits
  today, so they lock in the *current* nine and notice nothing about a tenth. This is *a standard
  with no enforcer* (ANTI-PATTERNS), arriving as a string literal rather than as prose.
- **Why it was not fixed here:** the fix worth having is a closed vocabulary — an enum, or a
  drift-extra check that fails a `reason=` literal outside a known list — and slice 5 already
  installs a drift check over logger call sites for `INV-9`. Two checks over the same lines,
  written a week apart, is the seam to build once rather than twice.
- **Disposition:** **closed, 2026-09-10 (slice 5)** — and it closed the way this entry asked
  for, as one check rather than two. `scripts/log_lint.py` holds `KNOWN_EVENTS`,
  `KNOWN_RULES` and `KNOWN_REASONS` beside INV-9's keyword allowlist: same call sites, same
  pass, one place to widen. (It landed in `drift-extra.sh` itself and moved when review found
  the shell version false-clean — spec 0005 delta 15.) Watched failing on three planted values — an unknown `reason`, `rule="INV3"`,
  and an unknown `event` token — plus a negative control re-adding known values, which stayed
  clean. The Owner added **AC-22** to spec 0005 for it, so the work is accounted for in the AC
  table rather than smuggled in beside AC-6.
- **What it still does not prove, and this is the successor gap:** the check resolves **string
  literals only**. `rule=INV_1` in `app/api/handlers.py` and `**fields` are skipped, because a
  value reached through a name cannot be resolved textually — the same reason spec 0005 delta 11
  gives for writing `event` inline at the call site. Every *raise* site passes literals today, so
  the vocabulary cannot grow unnoticed; a future call site passing a constant would slip past.
  Widening the vocabulary is meant to be a deliberate edit to this script in the same commit.

## 2026-09-09 — the log sink has no time-based erasure, and now there is something in it
- **What:** spec 0005 slice 1 landed the first logger in `app/`, so denial lines now exist. Their
  sink is Docker's `json-file` driver at `max-size: 10m`, `max-file: 3`, which rotates by **size
  only** — the driver has no time-based option. "Erase after 90 days" is therefore not expressible
  here at all, and at this app's volume (a handful of lines a week) a line written today
  effectively never ages out. ADR-0007 accepted this rather than faking it; this entry is the
  other half of that acceptance.
- **Where:** `deployment/local/docker-compose.yml` and `deployment/production/docker-compose.yml`
  carry the `logging` blocks; `app/core/logging.py` writes to stdout and owns nothing about
  retention. The two ways out both cost more than they are worth today: move the sink (Loki, a
  hosted backend — rejected in ADR-0006 on RAM and on keeping student-adjacent telemetry off
  external services) or add host-side `logrotate`, whose configuration would live outside the
  repo where no gate could prove it was in place.
- **What green tests/gates did NOT prove:** nothing asserts a retention policy, because there is
  no policy to assert. What *is* enforced is the thing that makes the absence tolerable — lines
  carry ids, never Student names (ADR-0007). That rule becomes `INV-9` with two enforcers in
  slice 5, and until then it holds by review only: the one call site slice 1 wired logs a rule id
  and a status, and `route` comes from the context variable holding `scope["path"]`, which cannot
  contain a query string. **The slice-5 enforcers are what turn this from a promise into a gate.**
- **Disposition:** **accepted, with the mitigation named.** Revisit only if the event set grows
  past denials, errors and irreversible acts — the fourth family (routine successful writes) was
  declined during shaping precisely because volume is what would make size-based rotation start
  discarding evidence.

## 2026-09-09 — in development, SQLAlchemy's echo puts bound parameters on the same stdout
- **What:** found by slice 1's live exercise, not by a test. `app/database.py` passes
  `echo=settings.debug`, and `debug` defaults to **True**, so a locally-run API prints every
  statement *and its bound parameters* to stdout — the same stream the new JSON lines go to. Those
  parameters include Student names on the autocomplete, create and update paths.
- **Where:** `app/database.py:14`. **Production is not affected and this was checked, not
  assumed:** `deployment/production/docker-compose.yml:63` sets `DEBUG: "false"`, so `echo` is off
  on the VM. `deployment/local/docker-compose.yml:69` sets `DEBUG: "true"`, deliberately.
- **What green tests/gates did NOT prove:** anything about this. It is a different logger
  (`sqlalchemy.engine.Engine`) from the one ADR-0007 governs, so INV-9's runtime enforcer in
  slice 5 will capture the `app` logger and will not see it — correctly, but the reason needs to
  be written down where slice 5 will look, or the enforcer reads as weaker than it is.
- **Disposition:** **accepted for development, no action.** A developer running the API already
  has the database. Named because "no Student name reaches stdout" is true of the app's own logger
  and **not** of a dev process as a whole, and that distinction is exactly the kind a later
  session would state too broadly.

## 2026-09-09 — AC-13's forged-line half is proven at the formatter, not yet at a route
- **What:** spec 0005's AC-13 reads: "a login attempt with an embedded newline in the email cannot
  produce a second line". Slice 1 proves the mechanism (`json.dumps` escapes the newline, so one
  record is one line) but asserts it on a `LogRecord` built in the test rather than on a real
  login, because **slice 1 logs no attacker-supplied free text**: the only wired call site is the
  `INV-1` handler, whose fields are a rule id and a status. An HTTP header cannot transport a raw
  newline, so `X-Request-ID` — the one client-supplied value slice 1 does log — is not a route to
  it either.
- **Where:** `tests/test_logging.py::test_a_newline_in_a_logged_value_cannot_forge_a_second_line`.
  The real-route half arrives in **slice 2**, when `authenticate_user` gains its call and the
  attempted email reaches a line.
- **What green tests/gates did NOT prove:** that the *production path* from a hostile email to a
  log line is safe. The formatter is the only thing between them and it is proven; the path is not
  yet built.
- **Disposition:** **closed, 2026-09-10 (slice 2)** — and the mechanism is not the one this entry
  predicted, which is worth more than the closure. The real-route assertion is
  `test_a_newline_in_a_login_email_produces_no_second_line`, and it passes because
  `UserLogin.email` is an `EmailStr`: `email-validator` refuses a newline, a quote, a brace and
  even an RFC-legal quoted local part **before** `authenticate_user` runs, so the request is
  answered 422 and emits nothing at all. Every adversarial address probed against the installed
  validator was rejected.
  So the attempted email that does reach a line cannot carry a JSON metacharacter, and the
  premise this entry and spec 0005's *Line shape* both argued from — that a denial line carries
  attacker-supplied free text — is weaker than stated. **AC-13 is met by two independent
  mechanisms**, and the formatter-level assertion remains the load-bearing one, because it is the
  half that survives someone relaxing the schema. Spec deltas 5 records this.

## 2026-09-09 — the teacher-id context reset has no enforcer until slice 2
- **What:** `RequestContextMiddleware` deliberately claims and resets `teacher_id_var` even though
  `get_current_user` is what fills it. Without that reset, a teacher id set during one request
  would still be set during the next request that never authenticated, and an anonymous denial
  line would name whoever was refused before it. The reset is correct and was written on purpose.
- **Where:** `app/middleware/context.py`, the `tokens` tuple and its `finally`.
- **What green tests/gates did NOT prove:** **this one.** No test in slice 1 can observe the leak,
  because the only event slice 1 logs is an `INV-1` denial, which by construction always has an
  authenticated teacher. Removing the reset leaves all 454 tests green. The detector arrives in
  slice 2 with the first logged denial that has **no** session (an auth branch): that line must
  carry no `teacher_id`, and it would carry a stale one.
- **Disposition:** **closed, 2026-09-10 (slice 2).** The detector is
  `tests/test_logging.py::test_an_unauthenticated_denial_carries_no_teacher_id_from_an_earlier_request`
  — an authenticated request, then a failed login, asserting the second line carries no
  `teacher_id` and not the first teacher's id anywhere. Watched failing on the plant this entry
  describes: `teacher_id_var` dropped from the middleware's claim-and-reset entirely.

## 2026-09-09 — the no-numbers rule was breached by the commit that installed it
- **What:** `4f742e9` deleted every count, percentage and baseline from the root `CLAUDE.md` and
  wrote the rule into the file: *name the command or the file that answers the question, never the
  answer.* One figure survived the sweep — "441 backend tests passing (2026-09-09), 78 frontend
  (2026-09-04)" under *Current Task Context* — and it was already wrong when it survived. The
  frontend suite runs **115** tests, measured 2026-09-09; the 78 was five days old. The same
  commit also broke a cross-reference to the *Measured status* section it had just deleted, and
  miscounted its own evidence three ways in the paragraph that states the rule.
- **Where:** all three fixed in `2445122`. The surviving count is now a pointer to the file's own
  command table; the dangling reference keeps only the half that resolves (`REVIEW-DEBT.md`); the
  census is replaced by the shape plus `4f742e9` as the record of the exact set.
- **What green tests/gates did NOT prove:** nothing in either repo looks at prose. The root
  pre-commit dispatcher runs no gates at all for a change under neither `api/`, `deployment/` nor
  `client/`, by design — so a root-`CLAUDE.md`-only commit is unverified by construction, and the
  secret scan is the only thing CI fires on it. All three defects were found by reading the file
  during `/resume`, four hours after the commit landed, which is exactly the by-hand waste the
  rule was written to end.
- **Disposition:** **open, and deliberately so.** Deleting the numbers removed most of the
  surface; it did not add an enforcer, and this entry is the evidence of what that costs — the
  rule was violated within the same commit and nothing caught it. The gate argued against on
  2026-09-09 (a five-minute suite before every commit to keep a markdown number accurate) is
  still not worth it, but the cheaper half now has a case: a grep-shaped check for a bare count,
  percentage or baseline in root `CLAUDE.md` needs no database and no suite. Not built, not
  proposed to the Owner as a slice, and named here so the next session inherits the argument
  rather than the surprise.

## 2026-09-08 — three N+1 loops, measured and ratcheted; all three fixed 2026-09-09
- **What:** tracing was added to find these, and it did. On a 25-student class with 50 attendance
  records, as measured 2026-09-08: `GET /classes/{id}/students?limit=100` issued **29**
  statements, the autocomplete route **28**, `GET /classes/{id}/attendance?limit=100` **79**,
  against **6** for the `attendance/summary` loop already fixed on 2026-09-04. The Owner's
  decision that round was to measure, gate and confess rather than fix; the fixes landed the
  following day as three commits.
- **Where:** all three are fixed as of 2026-09-09, each in its own commit, each with its ceiling
  watched failing before the fix went in. `app/services/attendance_service.py:106` called
  `db.refresh(record, ["student"])` per record and now reads the student off the `INNER JOIN` the
  query was already paying for (`contains_eager`) — **79 statements → 4**. The students-list loop
  at `app/services/student_service.py:197` — one `COUNT` per student in the page — has the count
  folded into the paginated query, **29 → 4**, flat in the page size. The
  autocomplete loop at `app/services/student_service.py:430` — one `COUNT` per match, above a
  `SELECT` with no `LIMIT`, on the route that fires on every debounced keystroke from
  `client/src/components/AttendanceTracking.tsx` — **is fixed as of 2026-09-09**: one grouped
  query, **28 statements → 3**, and flat in the match count rather than scaling with it. The
  `LIMIT` could only move into the database once the count was part of the same query, because
  the ordering depends on it.
- **What green tests/gates did NOT prove, and this is the lesson worth keeping:** none of them
  proved anything about efficiency. All 441 tests, the boundary gate, the mypy ratchet and the
  drift gate passed over all three loops, every day they existed, because every fixture in the
  suite uses a handful of students — the size at which an N+1 is invisible. Only a measurement
  found them. `tests/test_query_budget.py` is now the standing enforcer, and it was proven by
  reintroducing the loop fixed on 2026-09-04 and watching summary go from 6 to 31.
- **Disposition:** **closed**, 2026-09-09. Ceilings now 4 / 3 / 4 against the 29 / 28 / 79 they
  were opened at, and every list endpoint in the API is flat in the row count — proved at 12 and
  100 students, counted both by SQLAlchemy's `before_cursor_execute` and independently from the
  PostgreSQL statement log, which agreed exactly. Deployed in `a4c5acf` (PR #6) and **the Owner
  confirmed the reduced span fan in production Jaeger**, which is what closes the loop the
  measurement opened (ADR-0006). Coverage was not re-measured, and no production *timing* was
  taken — the claim is statement count, not latency.

## 2026-09-08 — a span's `http.url` carries the student name a teacher typed
- **What:** the ASGI instrumentation records the full, unredacted query string on every server
  span. The SDK's `redact_url` strips only credentials and a fixed list of signature parameters,
  so `?query=` and `?search=` values are stored verbatim. A real trace taken during verification
  reads `.../students/autocomplete?query=in`; on the deployed app that is a partial student name.
  Bound SQL parameters are NOT captured — `db.statement` holds `... WHERE student_id = $1::UUID` —
  so this is the only path by which student data reaches a span.
- **Where:** `app/core/telemetry.py`, and the Jaeger service in both compose files.
- **What green tests/gates do NOT prove here:** nothing checks what a span attribute contains. The
  containment is entirely the deployment shape: the trace store is published on `127.0.0.1` and
  reached over an SSH tunnel, so the data stays on the box that already holds the real database.
  Note that Docker writes its own iptables rules and a published port **bypasses UFW** — changing
  that binding to `"16686:16686"` would expose an unauthenticated trace UI holding student names
  while the firewall still looked correct.
- **Disposition:** **accepted with reason**, 2026-09-08. If the UI is ever exposed beyond the
  tunnel, the mitigation is a `server_request_hook` that overwrites `http.url` before the span is
  recorded. ADR-0006 carries the reasoning.

## 2026-09-08 — traces are ephemeral, and there is still no logger
- **What:** two gaps left deliberately open. (1) Jaeger stores traces in memory, capped at 20000,
  so a restart or a deploy loses all of them — fine for "why is this slow right now", useless for
  "what happened last Tuesday". (2) The service layer still has **no logging at all**;
  `grep -rn "getLogger\|logger" app/` returns nothing. Tracing does not close that: an unhandled
  500 still produces a bare traceback on stdout, and only a sampled span records the route.
- **Where:** `deployment/jaeger.yaml`; the absence is across all of `app/`.
- **What green tests/gates do NOT prove here:** no gate looks for a logger, and none can tell that
  history is being discarded on restart.
- **Disposition:** **open.** Structured logging is the obvious next slice and was scoped out of
  the tracing work on purpose.

## 2026-09-08 — `scripts/seed_data.py` has been dead since the Student-entity migration
- **What:** running it fails with `NotNullViolationError: null value in column "student_id"`. It
  builds `AttendanceRecord` rows with `student_first_name` / `student_last_name` and never sets
  `student_id` — the exact shape the Student entity replaced, and the exact identifiers
  `scripts/drift-extra.sh` check 1 now bans. Separately, `just seed` runs
  `python scripts/seed_db.py`, and that file does not exist; the real one is `scripts/seed_data.py`.
  Found while seeding a database for the tracing verification; a throwaway script was used instead.
- **Where:** `scripts/seed_data.py`, and the `seed` recipe in `justfile`.
- **What green tests/gates do NOT prove here:** nothing runs the seed script. `drift-extra.sh`
  check 1 only inspects **added** lines, so banned vocabulary already sitting in the file is
  invisible to it, and a justfile recipe pointing at a missing filename is checked by nothing.
- **Disposition:** **open.** Two small fixes, neither urgent, both cheap.

## 2026-09-08 — `AttendanceRecord` still carries the deprecated name columns, and an index on them
- **What:** `student_first_name` and `student_last_name` are still mapped on the model and still
  present on the table, behind the comment "DEPRECATED: Keep for backward compatibility (nullable,
  will be dropped in Phase 5)". Phase 5 never happened. There is also a live index over them,
  `ix_attendance_student_name`, being maintained on every insert for columns nothing reads.
- **Where:** `app/models/attendance.py`, and `__table_args__` in the same file.
- **What green tests/gates do NOT prove here:** the columns are nullable and unread, so every test
  passes with them present. The banned-identifier gate cannot see them for the reason above: they
  are existing lines, not added ones.
- **Disposition:** **open.** Dropping them is a migration plus a model edit; the index is the part
  that costs something today.

## 2026-09-08 — the documented test count was out of date, twice (closed 2026-09-09)
- **What:** root `CLAUDE.md` and this repo's docs said **346 tests** (measured 2026-09-04) while
  the suite ran more. The correction filed here on 2026-09-08 said **437**, and that was wrong too:
  it counted the 4 telemetry tests tracing added and missed the 4 query-budget tests from the same
  commit. The measured figure is **441** — a local full run in 225s, a CI run in 296s, and
  collection, all agreeing, on 2026-09-09. The same document already warned its coverage percentage
  was stale; the count had drifted the same way, and then its own correction drifted.
- **Where:** root `CLAUDE.md` — the corrections table plus five body figures, all now carrying
  441 and a 2026-09-09 date. The same sweep found two stale gate baselines in that file (ruff
  stated 93, actually 91; mypy stated 16, actually 14) and one paragraph that this session's own
  commits had made false, still describing the three N+1 loops as unfixed.
- **What green tests/gates do NOT prove here, and it is the reason this recurred:** nothing
  counts the tests and compares the number to the docs, so every figure in that file is a manual
  transcription with no enforcer behind it. Five have now been found stale, including one written
  as a correction to the previous stale one. Any number quoted there is a claim (PRINCIPLES #6);
  re-measure before acting on it.
- **Disposition:** **closed**, 2026-09-09 — the sweep ran and every figure named above is
  corrected in place. What is **not** fixed is the underlying cause: there is still no gate that
  compares a documented count to a measured one, so this will drift again the next time the suite
  grows. `api/README.md` was checked and quotes no test count.

## 2026-09-07 — the drift gate's size check now differs from devkit's template, in a third way
- **What:** `scripts/drift-check.sh` here grew a second cap, `MAX_NEW_TEST_FILE_LINES` at 1000, for
  paths under `tests/`. The 400 cap is unchanged everywhere else and both were watched fire (1100
  lines under `tests/`, 500 under `app/`). The reasoning is in `CODING_STANDARDS.md`.
- **Where:** `api/scripts/drift-check.sh:46`. **Not** in `client/scripts/drift-check.sh`, and
  **not** in devkit's template.
- **What green tests do NOT prove here:** that the three copies of this script agree about
  anything. They now differ in at least two known ways — this cap, and the `--`-as-comment fix
  that landed in the client's copy on 2026-09-07 and in neither of the others. A gate whose copies
  disagree gives a different verdict per package, which is how `client/e2e/fixtures.ts` passed
  every local hook and failed the same check in CI.
- **Disposition:** open, and the fix is not "copy this cap around". The three copies should come
  from one source, which is devkit's job (`/harness`); until then each divergence is a decision
  somebody has to rediscover. Whether the test cap belongs in the template at all is the Owner's
  call — a TypeScript project's test files are usually smaller, and the client's own e2e toolkit
  was **split** rather than exempted on the same day, which is the opposite judgement for a
  defensible reason.

## 2026-09-07 — normalize_name lowercases the second half of a hyphenated name
- **What:** `student_service.normalize_name` is `" ".join(word.capitalize() for word in ...)`, and
  `str.capitalize()` uppercases the first character and lowercases **the rest** — so it treats a
  hyphenated name as one word. `"aino-kaarina mäkeläinen-virtanen"` is stored as
  `"Aino-kaarina Mäkeläinen-virtanen"`. Apostrophes go the same way: `"o'brien"` → `"O'brien"`.
- **Where:** `app/services/student_service.py:36`. Documented, not asserted-as-correct, by
  `tests/test_service_student.py::TestNormalizeName::test_a_hyphenated_name_keeps_its_second_half_lowercase`
  — the test states the behaviour and points here.
- **What green tests do NOT prove here:** that names render the way a Finnish teacher wrote them.
  Double-barrelled first names and surnames are ordinary in Finnish and this register is Finnish;
  the browser walk's own stress fixture is "Aino-Kaarina Mäkeläinen-Virtanen", which this function
  would store mangled. **It is cosmetic, not a duplicate-Student risk:** INV-2's uniqueness index is
  on `LOWER(name)`, so matching is unaffected and no second row can appear. The damage is on the
  teacher's screen.
- **Disposition:** open, and deliberately not fixed with the tests. A fix changes how names are
  *stored* from that moment on and leaves every existing row in the old shape, so it wants a
  decision about a backfill — and the naive fix (splitting on `-` and `'` too) is wrong for names
  where the second part is genuinely lowercase. That is the Owner's call about their own domain
  (PRINCIPLES #11), not a test's.

## 2026-09-07 — I promoted a generated planning dump to an ADR, and the ADR directory is the worst place for one
- **What:** deleting the root `docs/` directory, I judged `ARCHITECTURE.md`'s *Monolith vs
  Microservices* section the one part worth keeping and wrote it up as
  `api/docs/adr/0005-modular-monolith.md`. The Owner asked what it was, which is the question that
  should have been asked before the file existed.
- **Where:** deleted in this commit; written in `c7af928`. The source text is in `a638ab6`
  ("Initial knowledge base commit", 2025-10-26) and reached the repository root via `9697e8f`.
- **Two independent defects, either one fatal:**
  1. **Provenance.** The six reasons were boilerplate in a document generated before any code
     existed. No decision was ever deliberated, so the ADR asserted one had been — the
     pseudo-artifact `ANTI-PATTERNS.md` describes, placed in the directory `README.md` sends
     readers to for "decisions with their rejected alternatives", which is the most authoritative
     spot in the repository.
  2. **The number was taken.** `specs/0004-shared-classes.md:11` had already reserved **ADR-0005**
     for the `class_teachers` schema decision, which is a one-way door and is being implemented
     now. Two documents would have claimed one id.
- **What the gates did NOT catch, and could not:** all of it. The fast gates and CI passed on
  `c7af928`, and the file was pushed and deployed. No gate reads an ADR's provenance, and the
  drift gate's ADR check only asks whether an ADR *exists* for a new dependency — never whether
  the one that exists records anything real.
- **The lesson, stated so it survives this session:** hedging inside a document does not fix its
  provenance. The ADR said in as many words that it was retroactive and that only one alternative
  had been recorded, and it was still wrong to exist. **Trace where a harvested claim came from
  before promoting it, not after.** The monolith itself is real and enforced; it is description,
  and it lives in `CLAUDE.md` where description belongs.
- **Disposition:** **FIXED 2026-09-07** by deletion, on the Owner's instruction, in this commit.
  The class of defect is open: nothing prevents the next cleanup from harvesting the same text out
  of git history, which is why this entry names the source commit.

## 2026-09-04 — drift-extra check 4 is textual, and its first version had a hole I put there
- **What:** check 4 enforces INV-1's single site by failing any diff that adds a teacher-id
  comparison in `app/` outside `class_service.py` (spec 0003). **The version I first wrote matched
  only `teacher_id` followed by an operator, so a reversed comparison —
  `if teacher.id != class_obj.teacher_id` — planted in `student_service.py` produced
  `drift-extra: clean`.** Found by planting it, not by reading it. The check now requires a
  teacher id *and* a comparison anywhere on the line, and all four spellings were caught:
  `class_obj.teacher_id != teacher.id`, the reversed form, `current_user.id != class_obj.teacher_id`,
  and the `==` variant.
- **Where:** `scripts/drift-extra.sh` — check 4.
- **What green gates do NOT prove here**, and these are the limits that remain:
  - It reads **added lines in a diff**, so it prevents a fourth copy rather than detecting an
    existing one. That is sound only because `app/` was verified to contain **zero** such lines
    outside `class_service.py` at the moment the check landed. If that ever stops being true, the
    check will happily keep passing over it.
  - It is **textual**. A copy that compares ids it obtained under other names, or one that
    reimplements the decision without comparing anything (a join, a subquery, a cached flag),
    passes. The invariant's real proof stays `tests/test_authorization.py`.
  - It is **deliberately broad**, so a legitimate new `WHERE Class.teacher_id == ...` filter
    elsewhere in `app/` will fire and need `drift-ok`. That is the intended trade: the false
    positive is visible and one comment long, the false negative is a data leak.
  - **A root-only commit skips both gate sets entirely** (the hook says so out loud), so the check
    protects `app/` only on commits that touch `app/`. CI re-runs it over the pushed range.
- **Disposition:** **the hole is FIXED 2026-09-04** and re-proven four ways. The four limits above
  are accepted-with-reason: each is a property of being a diff gate over text, and the alternative
  — parsing `app/` into an AST and reasoning about authorization — is a static analyser, not a
  30-line shell check.

## 2026-09-04 — coverage has not been measured since 2026-09-01, and the count has moved four times
- **What:** the suite went 262 → 330 → 344 → 345 → **346** while `77%` has been repeated
  throughout. Today's two commits added 7 tests and deleted 5; no coverage run was taken, so the
  percentage in root `CLAUDE.md` and in this repo's docs is a 2026-09-01 figure being quoted about
  2026-09-04 code.
- **Where:** root `CLAUDE.md` (now labelled as not re-measured), this ledger, `student_service.py`
  at 29% as of the last real measurement.
- **What green tests do NOT prove here:** nothing new — that is the point. Coverage was never the
  safety metric in this repo, and the project already proved why: the 24 authorization tests added
  on 2026-09-01 moved coverage **not at all** while closing a real leak.
- **Disposition:** **CLOSED 2026-09-07 — measured, because a README going public was about to
  quote it.** 346 passed, **80%** total: 1150 statements, 231 missed, a 3m25s run against the
  throwaway database on 5439. The repeated 77% was three points *low*, so the stale figure
  understated the code rather than flattering it — which is the harmless direction, and still a
  reason to stop quoting it. `student_service.py` is unchanged at **29%** and is the
  least-covered file in the backend; `app/api/classes.py` (53%), `app/database.py` (56%) and
  `app/api/auth.py` (56%) come next. Nothing about the safety argument above changes: coverage
  still is not the metric that caught the ownership leak.

## 2026-09-04 — the action bump cannot be proven locally; its first CI run is its proof
- **What:** `checkout` v4→v7, `setup-python` v5→v7, `setup-node` v4→v7, `upload-artifact` v4→v7,
  to clear the Node 20 deprecation warning. Every intervening major was read (Node 24 runtime and
  the runner floor, `checkout@v6`'s separate credential file, `checkout@v7`'s fork-PR block,
  `setup-python@v7` dropping `pip-install`) and none touches an input or trigger this repo uses.
- **Where:** `.github/workflows/backend.yml`, `frontend.yml`, `security.yml`.
- **What green gates do NOT prove here:** that the workflows still run. The YAML parses and no
  removed input is passed, which is the whole of the local evidence. **Every green push to `main`
  deploys both halves**, so the same push that proves the bump also ships whatever it is carrying.
- **Disposition:** **CLOSED 2026-09-07.** Shipped on `7a813e6` and all four actions ran green,
  named individually in the step logs rather than inferred from a green run:

  | Action | Where it ran |
  |---|---|
  | `checkout@v7` | all seven jobs across the three workflows |
  | `setup-python@v7` | backend Gates, Tests, Deploy |
  | `setup-node@v7` | frontend Gates, Security, Deploy |
  | `upload-artifact@v7` | backend Tests, the *Upload coverage* step |

  Runs 34090876510 (Security), 34090876521 (Backend), 34090876583 (Frontend) — all success,
  including both deploy jobs. The Node 20 deprecation warning is gone. The Owner chose to push
  straight to `main` rather than prove it on a PR first, having been offered both: the risk was a
  red `main` and a wasted run, not a bad deploy, because every deploy job sits behind its gates.

## 2026-09-04 — drift-check's "new dependency with no ADR" check is dead here too, and it is NOT mine to fix
- **What:** `scripts/drift-check.sh` check 3 refuses a dependency added without an ADR. It never
  fires in this repo. Adding `httpx-sse>=0.4.0` to `requirements.txt` reported
  `drift-check: clean` **with and without** an ADR present — a silent pass, not a false alarm.
- **Where:** `scripts/drift-check.sh:220` (`dep_names`) and `:230` (`adr_added`).
- **The mechanism**, confirmed by hand rather than guessed:
  `changed()` returns git-root-relative paths (`api/requirements.txt`), while the script's cwd is
  the **package** (`api/`) because of the `cd` added on 2026-09-03 for the monorepo. So
  `git diff -- api/requirements.txt` run from inside `api/` matches no pathspec and returns nothing;
  `new` is empty and the check reports nothing. `adr_added`'s `^$ADR_DIR/` anchor is wrong for the
  same reason, and would misfire if the first bug were fixed alone.
- **PATH HALF FIXED 2026-09-04, on the Owner's instruction.** All five `git diff` calls in both
  copies of `drift-check.sh` now carry `--relative`, which makes them agree with `git ls-files` and
  is a **no-op when the cwd is the git root** — so the file stays compatible with devkit's template
  instead of forking its behaviour, and it belongs upstream as-is. Proven in the client: adding
  `nanoid` to `package.json` went red naming the package, and adding an ADR made it clean again.
  **The same fix belongs in devkit's `templates/scripts/drift-check.sh`, which still has the bug**
  — every project bootstrapped from it inherits a dead check the moment it stops being a lone repo.

## 2026-09-04 — and the dependency check is STILL blind to every dependency this repo actually adds
- **What:** with the path bug fixed, `drift-check.sh` check 3 fires for `httpx-sse==0.4.0` and stays
  silent for `httpx-sse>=0.4.0`. **This repo pins almost nothing** — 23 of 26 requirement lines use
  `>=`, and the 4 exact pins are all OpenTelemetry (2026-09-09 measurement) — so the
  revived check still catches none of them. Found immediately after fixing the paths, by probing
  with the repo's own dependency style rather than a textbook one.
- **Where:** `scripts/drift-check.sh:225-227`, the `dep_names` parser.
- **The mechanism:** the name is extracted by cutting at the first character of `["':= ]`. For
  `httpx-sse>=0.4.0` that cuts at the `=` and leaves `httpx-sse>` — with the `>` still attached.
  The next filter, `grep -E '^[A-Za-z0-9@._/-]+$'`, rejects it, and the dependency vanishes. Verified
  by running the pipeline by hand and by probing both forms against the real gate.
- **What green tests do NOT prove here:** any of it. A gate has no tests; `drift-check: clean` is
  what a working check and a blind one both print.
- **The fix is two characters** — add `<` and `>` to the cut class, so it becomes `["':=<>~ ]` and
  the name is cut at the first version operator whichever one is used. That changes the template's
  *parsing*, not just a path, so unlike `--relative` it is not self-evidently a no-op elsewhere and
  wants the Owner's word.
- **Disposition:** **FIXED 2026-09-04** on the Owner's word, in `cfc7bee`. The two-character
  estimate above was wrong, and the commit message says so: it took five. `["':= ]` became
  `["':=<>~![ ]` at `scripts/drift-check.sh:242` — `<>~!` for the operators, and `[` for extras,
  since `uvicorn[standard]>=0.24.0` survives the operator fix as `uvicorn[standard]` and then fails
  the charset filter anyway. Verified against all 22 requirement lines here plus JSON, scoped-JSON
  and pyproject shapes. **devkit's `templates/scripts/drift-check.sh` carries the same fix**, so a
  project bootstrapped from it no longer inherits the dead check.
  *(This disposition sat at "open, awaiting that decision" for three days after the fix landed. The
  ledger over-reported its own debt, which is the same defect as under-reporting it.)*
- **What green tests do NOT prove here:** how many of drift-check's other checks take a path from
  `changed()` / `added_files()` and hand it back to git or the filesystem. Checks 3 and 4 (lockfiles)
  are the obvious candidates; nobody has audited the rest. Every one of them prints the same
  `drift-check: clean` whether it ran or never matched a path.
- **Disposition:** open, and **the highest-value item in this ledger** — a gate that cannot fail is
  worse than no gate, because the commit message says it passed. The two sibling checks in
  `drift-extra.sh` were fixed on 2026-09-04 and proven by breaking them; this one is the same defect
  in a file this repo does not own.

## 2026-09-04 — the drift gate's migration check had been dead since the monorepo merge
- **What:** `drift-extra.sh` check 2 refuses an edit to an already-applied alembic migration. Its
  anchor was `^alembic/versions/`, and `git diff --name-only` reports paths from the **git root** —
  which since the 2026-09-03 merge means `api/alembic/versions/…`. The anchor matched nothing, so
  the check reported clean while doing nothing, for a day. Found while proving a *new* check in the
  same file, whose `^app/` anchor failed for exactly the same reason.
- **Where:** `scripts/drift-extra.sh` — `MIGRATIONS`, now `(^|/)alembic/versions/.*\.py$`.
- **What green tests did NOT prove here:** the gate's own output. `drift-extra: clean` is printed
  identically whether the check ran and found nothing or never matched a path. This is the third
  time this project has hit the same shape — the baseline guard scoring a crashed tool as 0
  problems (`ab55f49`), and the repo-deletion check whose `ls-remote` failed into `2>/dev/null`.
- **Disposition:** **FIXED 2026-09-04**, and proven by appending a line to
  `01edea317e5e_add_student_model.py` and watching the gate fail, then restoring it. The top-of-file
  comment now records why the anchor is written `(^|/)`.
- **Still owed:** nobody has audited the *other* repo-relative paths in this repo's scripts against
  the monorepo layout. `drift-check.sh` is devkit's template and is deliberately byte-identical, so
  it is the first place to look.

## 2026-09-04 — the attendance summary issues one query per student on every page
- **What:** `get_attendance_summary` pages students, then loops over them and runs a separate
  `SELECT` for each student's attendance records. At the default `limit=20` that is 20 round-trips
  per request, and it is what the measurement below attributes ~59 ms of a 65 ms request to.
- **Where:** `app/services/attendance_service.py` — the `for student in students:` loop that builds
  `summary`.
- **What green tests do NOT prove here:** the shape. Every test in the suite runs against classes of
  a handful of students, where an N+1 is invisible. Nothing fails as the loop grows.
- **Measured 2026-09-04:** 200 students, 5,000 records, `limit=20` → 65.1 ms median. It is not
  slow *yet*, and this teacher's classes are far smaller.
- **Disposition:** **FIXED 2026-09-04**, the Owner's call, in its own commit rather than folded
  into the INV-1 consolidation that shipped the same day. One `SELECT ... WHERE student_id IN
  (:page)` replaces the loop; the single `ORDER BY timestamp DESC` is what keeps each student's
  records newest-first, because rows arrive in that order globally and are appended per student.
  Not `selectinload` as this entry originally proposed: `Student.attendance_records` carries no
  `order_by`, so the relationship would have loaded them unordered and needed a sort in Python,
  which hides the ordering guarantee the response depends on.
- **The ordering was untested before this fix depended on it.** Nothing asserted that a student's
  `records` come back newest-first — `test_service_attendance.py:477` asserts it for
  `list_attendance_for_class`, not for the summary — so the response's advertised order was free
  to break in silence. `test_each_students_records_are_newest_first` now covers it with two
  students and interleaved timestamps, added in an order that is neither sorted nor grouped, so a
  bucket preserving insertion order fails it. Proven by flipping the `ORDER BY` to `asc()` and
  watching it go red.
- **Measured before and after**, same shape as above (200 students, 5,000 records), by a
  disposable script that counted queries with a SQLAlchemy `before_cursor_execute` listener:

  | Page size | Queries before | Queries after | Median before | Median after |
  |---|---|---|---|---|
  | `limit=20` (the default) | 24 | **5** | 19.2 ms | 17.7 ms |
  | `limit=200` (whole class) | 204 | **5** | 125.9 ms | 88.6 ms |

  Both page sizes returned byte-identical contents before and after — 20 and 200 students,
  500 and 5,000 records, `total=200`, `legacy_hidden=0` — which is the behaviour-unchanged
  evidence. The query count is now **flat in page size**; it was `limit + 4`.
- **This entry's own arithmetic was wrong, and the correction matters more than the fix.** The
  measurement below attributed "the other 59 ms" of a 65.1 ms request to this N+1 by subtracting
  the hidden count from the total. At `limit=20` the N+1 is worth **1.5 ms of 19.2 ms** on this
  machine, and the 65.1 ms baseline does not reproduce at all. Subtracting one measured component
  from a total and labelling the remainder is not a measurement of the remainder — the 59 ms was
  never attributed to anything, it was what was left over. The real defect was the growth rate,
  which needed no timing to see: a `SELECT` inside a `for` loop over a paged list.

## 2026-09-04 — the five-year boundary itself is not tested; only points far from it are
- **What:** `LEGACY_WINDOW = timedelta(days=5 * 365)` is the whole rule, and no test pins it. The
  suite hides students at 6, 7 and 8 years and keeps them at 0.1, 0.25 and 0.5 years, so **the
  constant could be changed to anything between roughly 4 months and 6 years and all 341 tests
  would still pass.** Nothing exercises just-inside and just-outside the boundary.
- **Where:** `app/services/attendance_service.py` — `LEGACY_WINDOW` and `find_legacy_student_ids`;
  `tests/test_legacy_students.py` — `years_ago()` is only ever called far from the cutoff.
- **Criterion:** `AC-1`, "A student whose first attendance is more than five years old is absent
  from the default summary". Proven for *more than five years*; the word **five** is not proven.
- **What green tests do NOT prove here:** that the window is five years. A typo in the constant, or
  a later "let's make it three", passes the suite in silence.
- **Disposition:** **FIXED 2026-09-04.** `test_the_window_is_five_years` asserts the literal
  `timedelta(days=5 * 365)` (deriving the expectation from the constant would move with it and
  prove nothing), and `TestTheWindowIsFiveYears` adds a case a day either side of the line. Proven
  by mutating the constant both ways: at 3 years the literal and the *inside-the-line* case go red,
  at 7 years the literal and the *past-the-line* case do. Before this, neither mutation failed
  anything.

## 2026-09-04 — every proof of the legacy cutoff runs on manufactured dates
- **What:** the app launched in November 2025, so no real row is old enough to hide until around
  November 2030. All 13 tests and the whole live run backdate `AttendanceRecord.timestamp` (and, for
  the record-less case, `Student.created_at`) by hand. Against production data the feature is inert.
- **Where:** `tests/test_legacy_students.py` `years_ago()`; the live run's seed script, which was
  disposable and is not in the repo.
- **Criterion:** `AC-6`, proven live only against a seeded database.
- **What green tests do NOT prove here:** that the first real firing, four years from now, behaves
  as the tests say. Nobody will observe this feature working on real data before then, and by then
  the data will have shapes nobody has anticipated — students merged, renamed, or carried across
  courses. A migration or a merge that rewrites `timestamp` would move the cutoff under it.
- **Disposition:** open, and arguably unfixable — recorded so that a 2030 session reading a green
  suite knows the suite has never seen the real case.

## 2026-09-04 — the summary pays for a hidden count that will be 0 for four years
- **What:** every default summary request now runs a second query — a grouped outer join of the
  class's Students against their AttendanceRecords — purely to compute `legacy_hidden`, which is 0
  for every class in production and will stay 0 until roughly November 2030.
- **Where:** `app/services/attendance_service.py` — `find_legacy_student_ids`, called from
  `get_attendance_summary` whenever `legacy` is not true.
- **What green tests do NOT prove here:** the cost. No timing was taken by the slice that added it.
- **Measured 2026-09-04**, PostgreSQL 17, one class of **200 students and 5,000 attendance
  records** — roughly ten times a real class, with `limit=20`:

  | Variant | Median | Min | Max |
  |---|---|---|---|
  | hiding (runs the count) | 65.1 ms | 62.0 | 74.6 |
  | revealed (skips the count) | 58.9 ms | 54.1 | 69.7 |
  | hiding, with a search | 63.3 ms | 57.2 | 68.5 |
  | `find_legacy_student_ids` alone | **6.6 ms** | — | — |

  So the hidden count costs about **6 ms, near 10% of the request**, at ten times the size that
  matters, and it needs no index. ~~The other 59 ms is the summary's own N+1 — see the entry
  below.~~ **Struck 2026-09-04:** that sentence attributed a leftover to a cause. Re-measured
  directly, the N+1 was 1.5 ms of a 19.2 ms request at this page size, and the 65.1 ms figure
  above does not reproduce. See the N+1 entry for what was actually measured.
- **Disposition:** **accepted-with-reason 2026-09-04.** Measured, cheap, and left alone. The
  measuring script was disposable and is not in the repo; the numbers above are the record.

## 2026-09-04 — "no other cutoff reads created_at" is review-only
- **What:** half of AC-8 is enforced (`test_records_endpoint_declares_no_legacy_parameter` reads the
  app's own OpenAPI document). The other half — that nothing in `app/` reintroduces an age cutoff on
  `Student.created_at` — was checked by grep during review and has no enforcer.
- **Where:** `app/services/` generally; the deleted block was `attendance_service.py:121-134`.
- **Criterion:** `AC-8`, "…and nothing in `app/` reads `Student.created_at` for a cutoff".
- **What green tests do NOT prove here:** a second, differently-worded cutoff added later anywhere
  in the service layer. The suite would stay green and the vocabulary would fork again — which is
  precisely how this feature came to have two dates in the first place.
- **Disposition:** **FIXED 2026-09-04.** `scripts/drift-extra.sh` check 3 fails any added line under
  `app/` matching `created_at\s*[<>]`, with `drift-ok` as the escape hatch for a legitimate date
  filter. Proven by planting `select(Student.id).where(Student.created_at < cutoff)` in
  `attendance_service.py` and watching the gate go red, then removing it.

## 2026-09-03 — a verification that cannot tell "found nothing" from "did not run"
- **What:** before irreversibly deleting four GitHub repositories, a loop checked that every commit
  on each remote existed in the monorepo. It reported `refs=0  missing=0  ✔ safe to delete` and was
  **completely vacuous**: the URLs used plain `github.com` where this machine reaches GitHub through
  a `github.com-personal` SSH alias, so `git ls-remote` failed on all four — and `2>/dev/null`
  swallowed the error. Zero refs checked presented as zero refs missing.
- **Where:** an ad-hoc shell loop, not committed anywhere. That is part of the point.
- **Why it is worth a ledger entry anyway:** this is the *same defect* as `ab55f49`, fixed in
  `scripts/baseline-guard.sh` earlier the same day, where a tool that failed to execute counted as
  0 problems, beat a baseline of 93 and reported `improved — 0 (was 93). Baseline RATCHETED down`.
  The lesson was written into the harness and then reintroduced hours later in a throwaway loop —
  in the one place where the consequence was irreversible.
- **The rule, generalised:** a check must be able to distinguish *"ran and found nothing"* from
  *"did not run"*, and must fail loudly on the second. In practice: never `2>/dev/null` the command
  whose success you are inferring; assert a **positive** count before concluding a negative one
  (`total > 0 && missing == 0`, never `missing == 0` alone); and treat an empty result from a
  network call as suspect by default.
- **Disposition:** the rerun with the correct alias found 4 real refs, all present in the monorepo,
  which is what actually justified the deletion. Nothing was lost. Recorded because the pattern
  recurs and the harness can only enforce it where a script exists — this one had none.


## 2026-09-03 — two pre-commit hook systems, one repository, and git allows one hooksPath
- **What:** the monorepo inherited two independent local-hook setups. `api/` uses `.githooks` wired
  by `git config core.hooksPath .githooks` (`just install-hooks`); `client/` uses **husky**, which
  wires `core.hooksPath` to its own directory. `core.hooksPath` is a single repository-wide
  setting, so **only one of them can be active** — whichever was configured last silently wins and
  the other package commits with no gates at all.
- **Where:** `api/.githooks/pre-commit`, `client/.husky/pre-commit`, `api/justfile` (`install-hooks`)
- **What green CI does NOT prove here:** nothing. CI is unaffected and remains the real enforcer —
  this is purely the local fast feedback loop. The risk is a false sense of protection: you commit,
  see no complaint, and assume the gates ran.
- **Disposition:** **fixed 2026-09-03** by `.githooks/pre-commit` at the repository root, proven
  on all three dispatch paths (docs-only runs nothing, api/ runs its gates, client/ runs its own).
  husky is removed. The original plan, kept for the record: one root hook that inspects staged paths and
  dispatches — `api/**` runs the API's fast set, `client/**` runs the client's, a commit touching
  both runs both. Deliberately not done during the migration: it wants its own change, and it must
  be proven by breaking it in each package separately, which is exactly the ceremony that does not
  belong in the middle of moving four repositories.
- Found by reading `client/.husky/pre-commit` while fixing the same package-root anchoring bug the
  API scripts had.


## 2026-09-03 — the deployment repo could not be deployed on its own, and nginx.conf changes were inert
- **What:** the `deployment` repo has **no workflow of its own**. It reaches the VM only through the
  API's deploy job (`deploy.yml:257-258`, `git -C deployment reset --hard origin/master`), so a
  compose or nginx change sat on `origin/master` doing nothing until an unrelated backend push
  happened to run. Two things made that worse:
  1. **The documented manual trigger did not work.** The job's comment said "can also be triggered
     manually via workflow_dispatch" while its guard read
     `if: github.event_name == 'push' && ...`, which excludes that event. A manual run went green
     having silently skipped the deploy job. So there was *no* way to ship a deployment-only change
     except an unrelated push.
  2. **`nginx.conf` changes were inert.** It is a bind mount, and `up -d` does not restart a
     container whose spec is unchanged. nginx kept serving the config it loaded at boot, so editing
     it and deploying looked successful and changed nothing.
- **Where:** `.github/workflows/deploy.yml` — the `deploy` job guard, and the recreate step
- **Disposition:** **fixed 2026-09-03.** The guard now accepts `workflow_dispatch`, and a validate
  + reload step runs after the health check.
- **What is NOT proven, and it is the interesting part:** the reload step has **never executed on
  the VM**. It cannot be exercised without deploying. What *was* proven locally is the branch logic
  — `nginx -t` exits 0 on a valid config and 1 on a broken one, so `if ! nginx -t` discriminates.
  The production `nginx.conf` itself cannot be validated off the VM: it needs the Let's Encrypt
  certificates and a resolvable `backend` upstream, and fails locally on both.
- **A bug caught in review, recorded because the shape recurs:** the reload was first placed
  immediately after `up -d`, before the health check. `nginx -t` **resolves upstream hostnames**, so
  it would have failed with `host not found in upstream "backend"` whenever the backend had not
  finished starting — turning a good config into a failed deploy. It now runs after the health
  check, where the upstream is known to resolve. Found by running `nginx -t` against the real file
  in a container, which is the only reason it did not ship.


## 2026-09-02 — the API now has a type gate, and 16 findings are baselined rather than fixed
- **What:** `just typecheck` runs mypy 2.3.1 over `app/` as a ratchet (ADR-0004), closing what
  `CODING_STANDARDS.md` called "the biggest remaining hole in this repo's harness". The gate starts
  at a baseline of **16**, so those 16 are blocked from growing and are **not fixed**.
- **Where:** `.harness-baseline` (`mypy=16`), `pyproject.toml` `[tool.mypy]`, `justfile` `typecheck`
- **The 16, grouped — none is a live defect:**
  - **5 × `app/models/*` `name-defined`** — SQLAlchemy string forward refs. The same debt ADR-0001
    already left visible as 7 `F821` hits; `if TYPE_CHECKING:` imports close both at once.
  - **4 × `app/api/auth.py` `arg-type`** — `cookie_samesite` is typed `str` where Starlette wants
    `Literal['lax','strict','none']`. **Worth doing:** `COOKIE_SAMESITE=laxx` is accepted silently
    today, and a wrong SameSite value is a real weakening of the cookie hardening done the same day.
  - **3 × `app/services/*`** — `attendance_service.py:179` reuses the name `result` for two
    different query shapes, which narrows the inferred return type to `list[UUID]`. Not a runtime
    bug (the tests pass and `db.refresh` would fail loudly), but the fix is a rename.
  - **2 × `app/config.py` `call-arg`** — `Settings()` with no arguments. pydantic's mypy plugin
    would clear these; deferred in ADR-0004 because it re-types every model at once.
  - **2 × `app/main.py` `union-attr`** — `docs_username` is `str | None` and `.encode()` is called
    on it. The guarantee lives in `_docs_credentials_are_set`, a validator mypy cannot see.
- **What green tests do NOT prove here:** the ratchet counts violations, it does not know which.
  Fixing one and adding another nets zero and passes — it stops accumulation, not substitution.
  Nothing stricter than `ignore_missing_imports` is on, so an entirely unannotated new function is
  still legal.
- **Disposition:** open, deliberately. The `app/api/auth.py` cluster is the one with a real
  behavioural argument behind it and is the obvious next slice.

## 2026-09-02 — the repo told you to point a schema-dropping fixture at another project's database
- **What:** `conftest.py` removed the **default** `TEST_DATABASE_URL` on 2026-09-01 because it
  pointed `drop_all` at port 5433 — `platform-postgres`, a different project's container on this
  machine. The default went; the **instructions did not**. Until 2026-09-02 the comment at
  `conftest.py:33`, the `RuntimeError` a developer actually sees at `conftest.py:44`, and
  `.env.test.example:6` all still named port 5433 as the value to export. The paragraph directly
  above the error message explained why that port is dangerous.
- **Where:** `tests/conftest.py:33` and `:44`, `.env.test.example:6` (all three fixed);
  `deployment/local/docker-compose.yml:35` still publishes the `db-test` service on `5433:5432`
- **What green tests do NOT prove here:** nothing reads its own error messages. The suite passes
  identically whether the guidance is safe or catastrophic, because the guidance is only ever
  executed by a human.
- **Impact if followed:** `Base.metadata.drop_all` against whatever answers on 5433. It failed on
  mismatched credentials rather than doing damage, which is luck, not a safety mechanism — the
  same sentence `conftest.py` already used about the default it removed.
- **Disposition:** **fixed 2026-09-02** in this repo. All three now point at `just test-db-up`
  (port 5439, disposable) and say explicitly not to use 5433. **Still open:**
  `deployment/local/docker-compose.yml:35` binds `db-test` to 5433, so that service cannot start
  while `platform-postgres` holds the port — already noted in the root `CLAUDE.md`, not changed
  here because it is a different repository and a port choice the Owner may want to make
  deliberately. Found by `/audit`, which hit the error message by running a test with no database.

## 2026-09-02 — dependencies are unpinned, so the tested code and the shipped code differ
- **What:** `requirements.txt` has **23 `>=` ranges** (one of them bounded, `bcrypt>=4.0.0,<5.0.0`)
  and **4 exact pins**, and there is no lockfile. Re-measured 2026-09-09: this entry said "21 `>=`
  ranges and zero exact pins", and both halves had moved — the four pins are the OpenTelemetry
  packages, pinned when tracing landed (ADR-0006), so this repo's first exact pins arrived after
  this entry was written.
  Every `docker compose build backend` re-resolves the whole graph against PyPI as it stands that
  minute. Measured on 2026-09-02: the image built from this repo installed **FastAPI 0.141.1**
  while the venv the 317 tests run against has **0.121.3** — twenty minor versions apart, from one
  unchanged `requirements.txt`. The gap is visible in behaviour, not just in a version string:
  under 0.141.1 `app.routes` holds `_IncludedRouter` wrappers where 0.121.3 holds flat `APIRoute`s.
- **Where:** `requirements.txt` (all 21 lines); `Dockerfile:22`
- **What green tests do NOT prove here:** the suite exercises the *local venv's* resolution. It
  says nothing about the artifact that gets deployed, because that artifact's dependency set is
  chosen at build time on the server and has never been the one under test. A gate on one and a
  deploy of the other is the same defect as a standard with no enforcer, one layer down.
- **Not a live break, and that is luck rather than design:** both versions were run against a real
  PostgreSQL and both served correctly — `/health` 200, `POST /api/auth/login` 401, `GET
  /api/classes` 401, `GET /api/nonexistent` 404. The next resolution is a coin toss nobody watches.
- **Disposition:** open. The cheap fix is `pip-compile` (or `uv pip compile`) producing a pinned
  `requirements.lock` that the Dockerfile installs, with `requirements.txt` kept as the input.
  Deliberately NOT done inside the audit: it changes every dependency version at once, which is
  the opposite of one-finding-per-commit, and it wants its own gate run. Found by `/audit`.

## 2026-09-02 — what the security audit did not look at, and what stayed unproven

> **Update 2026-09-03:** lead 1 is closed — the production image never contained a `.env`. Three
> remain. See the strikethrough below rather than a deletion, so the check is not re-run from scratch.
- **What:** `/audit` ran on 2026-09-02 against the four repositories **as committed**. It was
  static plus local execution only. Four leads could not be run down, and none of them can be
  settled from inside a repository:
  1. ~~**Whether the running production image contains a `.env`.**~~ **CLOSED 2026-09-03: it does
     not, and it never did.** All eight backend images on the VM were checked for `/app/.env` --
     the live one and seven older ones going back two weeks, i.e. well before `.dockerignore`
     existed. Every one clean. The reason is structural rather than lucky: the server's build
     context is a **git clone**, `.env` is in `.gitignore:138` and was never committed, so it was
     never in the context. A `find` over the VM turns up exactly one `.env`, in
     `deployment/production/`, which is not the build context. **`SECRET_KEY` was never disclosed
     and no rotation was needed.** The finding was real as a *mechanism* -- demonstrated by
     building from a developer working tree, where a `.env` does exist -- and the leap from that to
     "production may be affected" was mine and was never evidenced. `.dockerignore` and
     `tests/test_packaging.py` stay: they are preventive now, and they still keep 3.2 MB of `.git`
     and the host `venv/` out of the image.
  2. **The real production `CORS_ORIGINS`.** It lives in the server's `deployment/production/.env`.
     No wildcard is prescribed anywhere in the repos, and `allow_credentials=True` at
     `app/main.py:69` makes a wildcard there genuinely dangerous rather than merely untidy.
  3. **Whether Vercel git auto-deploy is still disconnected.** Already tracked in
     `client-app/REVIEW-DEBT.md`; nothing in any repo can detect a reconnect.
  4. **`gitleaks` was not re-run.** It is not installed on this machine. History was checked
     independently at file level instead — no `.env`, `.pem`, `.key`, `.p12` or ssh key was ever
     committed in any of the four repositories — which corroborates the 2026-09-02 CI result
     without reproducing it.
- **Also deliberately out of scope:** the Hetzner VM and its filesystem, the Vercel account, DNS,
  GitHub Actions secrets, and anything requiring traffic to the deployed app.
- **What green tests do NOT prove here:** an audit never proves absence. This one had a scope and
  a threat model — the asset is real student names and attendance history, the attacker is a
  logged-in teacher probing other teachers' rows, and the worst outcome is student data reaching a
  teacher with no right to it. Findings were ranked against *that*, not against a generic severity
  table, and a different threat model would rank them differently.
- **Disposition:** open, and it is the Owner's to close — each of the four needs a look at a
  console, not at a file.

## 2026-09-02 — `API_REFERENCE.md` exists twice, and both copies were wrong the same way
- **What:** the file is duplicated at `API_REFERENCE.md` and `docs/API_REFERENCE.md`. Both claimed
  refresh tokens last 7 days while the code and every runtime config say 30, and both had to be
  edited to fix one fact. Two copies of one document is the documentation form of two
  implementations of one behaviour: they drift, and then every session has to guess which is
  canonical (ANTI-PATTERNS: *two formats for one artifact*).
- **Where:** `API_REFERENCE.md`, `docs/API_REFERENCE.md`
- **Disposition:** open. Noticed while fixing the 7-vs-30 drift; deleting one and leaving a pointer
  is a two-minute job that was left alone because it is not this audit's subject.

## 2026-09-02 — the Dockerfile copies the whole build context, and this entry was itself owed
- **What:** `Dockerfile:25` is `COPY . .` and there is **no `.dockerignore`**. Whatever sits in the
  build context when the image is built is baked into the image — including `.env` if one is
  present, the `venv/`, `htmlcov/`, and the git history. On the server the context is
  `student-attendance-tracker-api/`, which is a git checkout, so at minimum `.git` goes in.
- **Where:** `student-attendance-tracker-api/Dockerfile:25`; no `.dockerignore` in the repo
- **What green tests do NOT prove here:** nothing inspects the image. `gitleaks` scans the repo's
  history, not what got layered into a container.
- **How this was found, which is the part worth reading:** `specs/0001-...md`'s *Out of Scope*
  section says this finding "gets a `REVIEW-DEBT.md` entry and belongs to `/audit`". It never got
  one — `grep -c Dockerfile REVIEW-DEBT.md` returned **0** on 2026-09-02, five commits after the
  spec said otherwise. A spec asserting a confession that does not exist is the same defect as a
  standard with no enforcer, one document up. Found by sweeping for backlog items rather than by
  any gate.
- **Disposition:** open → `/audit`. The fix is a `.dockerignore` (`.git`, `.env*`, `venv/`,
  `htmlcov/`, `__pycache__/`, `tests/`), which also shrinks the image. Worth confirming what the
  current production image actually contains before assuming, since the answer decides whether
  this is hygiene or a live credential exposure.

## 2026-09-02 — the CLI was unusable in production, and leaked part of the DB password saying so
- **What:** `scripts/registration_code.py`'s `target()` helper parsed `DATABASE_URL` with
  `urllib.parse.urlparse(...)` and read `.port`. A generated password routinely contains `/`;
  `urlparse` truncates the netloc at it, so `.port` then tries to cast a fragment of the
  **password** to an integer and raises `ValueError`. Production's password contains a `/`.
  `main()` catches `BadRequestException`, `NotFoundError`, `OSError`, `PostgresError` and
  `SQLAlchemyError` — not `ValueError` — so the tool died on a raw traceback whose exception
  message quoted a leading fragment of the production database password. `target()` exists
  precisely to name the database *without* its password.
- **Where:** `scripts/registration_code.py:47` (before this fix), introduced by `1da33bf` (Slice 2)
- **Impact:** `just code-issue` worked on every machine with a simple password and **could not run
  at all in production** — the headline use case of the whole feature (US-1, US-9). Nothing was
  written to the database; it failed before opening a connection.
- **What green tests did NOT prove here:** the spec chose deliberately not to test the script —
  "with all behaviour in the service, the script is argument parsing and printing… proven by a
  live exercise instead of a test." That reasoning was right about the behaviour and wrong about
  this one function, which is a pure function of a string whose failure mode depends entirely on
  a value that differs between environments. **AC-17 is what found it**, on the first run against
  the server, which is the argument for that criterion existing.
- **Disposition:** **fixed 2026-09-02.** `target()` now uses `sqlalchemy.engine.make_url` — the
  parser that owns this URL format and is already a dependency — and is total: it catches
  everything and returns `<unparseable DATABASE_URL>`, because it is called from the failure path
  and must never widen a failure into a disclosure. `tests/test_cli_target.py` adds 17 tests over
  URL shapes, including the exact production shape and an assertion that no password fragment
  reaches the output. A raw `@` in a password stays ambiguous by the URL format's own rule and is
  documented rather than "fixed".
- **Rotation: not needed. Owner's decision, 2026-09-02.** The fragment appeared in a root SSH
  session on the Owner's own VM, and **the Owner is the only operator there is** — so the
  disclosure was of their own credential, to themselves. Nothing reached a CI log, an aggregator,
  the repo, or another person. The database also listens on `127.0.0.1` only, so the credential
  is not the security boundary; server access is (ADR-0003). `POSTGRES_PASSWORD` is unchanged by
  choice, not by omission. Revisit if a second operator ever exists.

## 2026-09-02 — tests read the developer's own environment, so local green is not CI green
- **What:** `app/config.py` builds a module-level `settings = Settings()` at import, and
  pydantic-settings reads the real process environment. So what the suite sees depends on
  whoever is running it. Demonstrated the hard way in this session: `tests/test_config.py`
  passed locally and **failed 4 of 12 in CI's environment**, because CI's test job sets
  `DOCS_USERNAME` / `DOCS_PASSWORD` for real and the tests that assert a credential is *absent*
  silently inherited them. `_env_file=None` was not enough — that skips the file, not the
  environment.
- **Where:** `app/config.py:76`; `tests/test_config.py` (now carries an autouse
  `isolate_settings_environment` fixture that deletes the keys it is about to assert on)
- **What green tests do NOT prove here:** that they will be green anywhere else. Nothing forces
  a test to declare which settings it depends on, and no gate runs the suite under CI's
  environment — this was caught by reproducing that environment by hand before pushing, not by
  anything automatic.
- **Not currently divergent beyond the fixed case:** the other 295 tests pass identically under
  a bare local environment and under CI's full variable set. Both were run.
- **Disposition:** open, narrow. The one broken test file is fixed. The general fix is either a
  session-scoped fixture that pins the whole settings environment for the suite, or an injected
  `Settings` instead of an import-time singleton — the second is the real answer and is a
  refactor, not a patch. Cheapest guard meanwhile: run the suite once under CI's variables
  before a push, which is what found this.

## 2026-09-01 — production /docs is behind the built-in default credentials
- **What:** `app/config.py:26-27` defaults `docs_username = "admin"` and
  `docs_password = "changeme"`. `deployment/production/docker-compose.yml`'s `backend` service
  lists its environment explicitly, sets no `DOCS_*`, and uses no `env_file`, and
  `grep -rn "DOCS_USERNAME\|DOCS_PASSWORD" deployment/` finds nothing — so no configuration path
  can override them as deployed. `curl https://attendance-api.kotoio.fi/docs` returns **401**,
  confirming Basic auth is live and therefore falling back to those two values. The credentials
  were not tried against production; the code path does not need testing to be read.
- **Where:** `app/config.py:26-27`; `deployment/production/docker-compose.yml`, `backend.environment`
- **What green tests do NOT prove here:** nothing asserts anything about the docs credentials, in
  either repo. `secret_key` and `database_url` correctly have **no** defaults, so the application
  refuses to start without them — this is the only secret-shaped setting with a fallback.
- **Why it surfaced now:** the Owner intends to publish this repo as a reference project. That does
  not create the weakness, but it removes the last thing standing in front of it.
- **The actual cause, found on the server 2026-09-02:** the values were **already set correctly**
  in `deployment/production/.env` — a real 13-character password, not `changeme`. But the
  `backend` service in `docker-compose.yml` never listed them, so
  `docker exec attendance-backend-prod printenv DOCS_USERNAME` returned nothing and the app fell
  back to its own default. The credential was never wrong; it simply never reached the process.
  A default is what made that invisible for months.
- **Disposition:** **fixed 2026-09-02**, Owner's call, across two repos plus CI:
  `app/config.py` drops both defaults (`str | None = None`) and gains
  `docs_auth_required` — the single owner of "are the docs protected?", which `app/main.py` now
  asks instead of re-deciding — plus a `model_validator` that refuses to construct `Settings`
  when the docs are protected and either credential is missing. `docker-compose.yml` passes both
  through. Proven by watching it fail: `ENVIRONMENT=production DEBUG=false` with no `DOCS_*`
  raises at import; with them it boots; local development still boots with neither.
  `tests/test_config.py` adds 12 tests. **Caught before the push:** CI's test job sets
  `ENVIRONMENT: test` with no `DOCS_*`, so the new guard would have failed the whole job at
  collection — the workflow now names a value, as production does.

## 2026-09-01 — three dead service functions removed with proof, one of them dead before this slice
- **What:** Slice 4 deleted `list_registration_codes`, `revoke_code(db, code_id)` and `delete_code`
  from `registration_code_service.py`. The spec's Deletion Inventory named two of them; the
  re-verification it demands found a third and a surprise: **`delete_code` had no caller at all**,
  not even a test, before this slice started.
- **Where:** `app/services/registration_code_service.py` (was `:167`, `:196`, `:265`)
- **What green tests do NOT prove here:** the proof is a call trace, not a test — `grep` over
  `app/`, `scripts/` and `tests/` for each name, with the admin router already deleted. Five tests
  went with them, which is correct (a function whose only importer is its own test is dead code
  wearing a seatbelt) but does mean nothing would now catch it if one were reintroduced unused.
  The `no-orphans` half of the boundary gate works at file level, not function level.
- **Disposition:** done, 2026-09-01. Owner chose removal inside Slice 4 over a `/prune` follow-up.

## 2026-09-01 — a mandatory email is NOT NULL, which is not the same as "a real address"
- **What:** INV-7 / AC-8. The constraint Slice 3 lands is `NOT NULL`, so `email_restriction = ''`
  is still storable. The migration itself writes `''` into every legacy row that named no address,
  which is exactly why a stricter `CHECK (email_restriction <> '')` cannot be added on top: it
  would fail on the rows the Owner chose to keep rather than delete. Every path that exists today
  refuses a blank — `create_registration_code` requires the argument, `CreateCodeRequest` types it
  `EmailStr`, the CLI exits 1 on an empty string — but those are three service-layer checks, and
  `CODING_STANDARDS.md` prefers a constraint precisely because it holds for the path that forgets.
- **Where:** `app/models/registration_code.py:28`,
  `alembic/versions/7c081032bae3_make_registration_code_email_mandatory.py`
- **What green tests do NOT prove here:** `test_a_code_cannot_be_stored_without_an_address` proves
  the database refuses NULL. Nothing refuses `''` at the database.
  `test_signup_with_a_code_that_names_no_address` proves such a row cannot be redeemed — which is
  the harm — but the row can still be written.
- **Disposition:** accepted with reason, 2026-09-01. An empty address is inert: it equals no
  address a signup can present, and the legacy rows carrying it are revoked as well. Revisit when
  the legacy rows are purged — with them gone, `CHECK (email_restriction <> '')` costs one line.

## 2026-09-01 — a code's expiry exists in the data and appears on no surface
- **What:** Slice 1 of `specs/0001-registration-code-cli-and-role-removal.md` added
  `registration_codes.expires_at` and the refusal that reads it, but `CodeResponse`
  (`app/schemas/registration_code.py:16`) does not carry the field. So the only place a code is
  visible today — `GET /api/admin/codes` and the admin screen over it — shows a code with no hint
  that it dies in 24 hours. Anyone reading that surface would reasonably assume codes are still
  valid forever.
- **Where:** `app/schemas/registration_code.py:16-29`
- **What green tests do NOT prove here:** nothing asserts what the admin response contains. The new
  tests cover the service and the signup route; the admin surface is untouched by them.
- **Deliberate, with a date on it:** Slice 2 prints code and expiry together from the command line
  (US-4), and Slice 4 deletes the admin routes and screens entirely. Adding the field to a schema
  that is being deleted three slices later is work with a known expiry of its own. If Slice 4 is
  ever dropped or deferred, this becomes a real defect and the one-line fix is to add
  `expires_at: datetime` to `CodeResponse`.
- **Disposition:** **fixed 2026-09-01**, in Slice 2. That slice edits `CodeResponse` anyway to drop
  `created_by_user_id`, so adding `expires_at: datetime` alongside cost one line rather than the
  three slices of waiting this entry assumed. Recorded as a spec delta.

## 2026-09-01 — AC-16 is proven on seeded rows, not on production's
- **What:** the spec proves the expiry backfill by restoring the pre-deploy production backup into a
  scratch database and migrating that. What was actually run is the same recipe against a scratch
  database seeded by hand with two 200-day-old codes (one unused, one redeemed): both came out
  expired, both survived, `NOT NULL` landed, and `downgrade` put the table back with no row lost.
- **Also, Slice 3:** `7c081032bae3` (mandatory email) was exercised the same way — a scratch
  database seeded with three rows: an unused code naming no address, a redeemed code naming no
  address, and a live code naming one. Upgrade left all three present, revoked both nameless ones
  with `email_restriction = ''`, kept the redeemer reference, landed `NOT NULL`, and refused a NULL
  insert; downgrade and re-upgrade both preserved all three rows. Again: seeded rows, not
  production's.
- **Where:** `alembic/versions/d9a611615af9_add_registration_code_expiry.py`,
  `alembic/versions/7c081032bae3_make_registration_code_email_mandatory.py`
- **What green tests do NOT prove here:** the suite never runs migrations at all — `conftest.py`
  builds the schema with `Base.metadata.create_all`. No test would notice if this migration were
  deleted.
- **Disposition:** open until `/verify-live` runs AC-16 against the real backup. The seeded run
  raises confidence in the SQL; it says nothing about production's actual rows, which is exactly the
  distinction AC-16 was written to insist on.

## 2026-09-01 — the documented way to get a test database pointed at another project's container
- **What:** `CLAUDE.md` and the `justfile`'s `test` recipe both told you to
  `export TEST_DATABASE_URL=...@localhost:5433/attendance_tracker_test`. On this machine port 5433 is
  `platform-postgres`, a **different project's** PostGIS container. The fixtures call
  `Base.metadata.drop_all`. So the documented instruction aimed a schema-dropping test suite at
  someone else's database — the same hazard the removed `conftest.py` default created, surviving in
  the docs after the code was fixed.
- **Where:** root `CLAUDE.md` (corrected), `justfile`'s `test` recipe (corrected),
  `deployment/local/docker-compose.yml`'s `db-test` service (**not** corrected — see below)
- **What green tests do NOT prove here:** nothing catches a wrong `TEST_DATABASE_URL`. The guard in
  `conftest.py` only refuses an *unset* variable; a set-but-wrong one is obeyed.
- **Disposition:** **fixed 2026-09-01** for this repo. `scripts/test-db.sh` now starts a disposable
  database on port 5439 and prints the export line, wired as `just test-db-up` / `just test-db-down`.
  Its port-in-use guard was proven by pointing a copy at 5433 and watching it refuse before touching
  docker. **Still open:** `deployment/local/docker-compose.yml`'s `db-test` is configured for host
  port 5433 and therefore cannot start on this machine. That file is in the `deployment` repo, which
  the Owner scoped out of the harness work, so it is reported rather than changed — the one-line fix
  is a different port.


## 2026-09-01 — INV-1 has seven enforcement sites, not one
- **What:** "only a teacher associated with a Class may read or change it" is implemented seven
  times: `verify_class_ownership` in `class_service.py:202`, a near-identical **second copy** in
  `student_service.py:553`, a **third under a different name** (`verify_class_access`) in
  `attendance_service.py:56`, and four inline `teacher_id != teacher.id` comparisons at
  `class_service.py:151`, `:194`, `attendance_service.py:286`, plus the list filter at
  `class_service.py:54`. `INVARIANTS.md` rule 4 and `CODING_STANDARDS.md` both require one owner.
- **Where:** the seven sites above; `INVARIANTS.md` INV-1's *Owner in code* cell, which says so
- **What green tests do NOT prove here:** the new denial suite proves each site currently works. It
  does **not** prevent the eighth site being added without a check, and it cannot make the seven
  agree — three of them raise `ForbiddenException` with three different messages.
- **Named cost:** the Owner intends **shared Classes** (two teachers on one Class). That is one edit
  at one site and seven edits at seven, with the eighth easy to miss. The tests would catch a miss,
  which is why this is debt and not a defect.
- **Disposition:** open, deferred by the Owner on 2026-09-01 — they chose the tests today and left
  consolidation for later. Do it when shared Classes are specced, not before; the seam is
  `verify_class_ownership(db, class_id, teacher)`, already the right shape.

## 2026-09-01 — whether the superadmin role should exist at all is an open product question
- **What:** `UserRole` carries `TEACHER` and `SUPERADMIN` (`app/models/user.py:17-18`), and
  `require_superadmin` (`app/dependencies.py:71`) guards three `/api/admin/codes` routes. Superadmin
  has **no** reach into teacher data — no ownership check makes a role exception, so a superadmin
  sees only their own classes. Asked whether that is the intended rule, the Owner said they need to
  revisit whether the role is needed at all.
- **Where:** `app/models/user.py:17-18`, `app/dependencies.py:71-93`, `app/api/admin.py`
- **What green tests do NOT prove here:** nothing about intent. The tests prove the current
  behaviour; they cannot say whether a support view is wanted, or whether the role should be deleted
  and registration codes issued another way.
- **Disposition:** **RESOLVED 2026-09-01** (ADR-0003, Slice 4). The Owner did not decide what a
  superadmin may see — they removed the role. `UserRole`, the `role` column, `require_superadmin`,
  the three `/api/admin/codes` routes and the superadmin creation script are all gone; codes are
  issued from the command line, authorized by database access. `User` now means exactly one thing,
  so the dial stays at `on` with **one** context for a settled reason rather than a pending one.

## 2026-09-01 — the five-year legacy filter measures the wrong date and cannot be turned off
- **What:** attendance listings exclude Students whose row is older than five years. Three problems.
  (1) It filters `Student.created_at` (`app/services/attendance_service.py:124-128`) while this
  repo's own docs, `CLAUDE.md`, and the frontend's type comment all say *first attendance* — and for
  every Student the `01edea317e5e` migration created, `created_at` is the **migration date**.
  (2) The `legacy` query parameter defaults to `None` = filter on (`app/api/attendance.py:84`), and
  **no frontend code ever sets it**, so it cannot be disabled from the app. (3) It has never fired:
  the app launched in November 2025, so the first silent disappearance is due around November 2030.
- **Where:** `app/services/attendance_service.py:124-128`, `app/api/attendance.py:84`,
  `client-app/src/api/attendance.ts:20`
- **What green tests do NOT prove here:** no test advances the clock five years, so no test
  exercises the filter firing at all.
- **Disposition:** open → spec owed. The Owner's decision (2026-09-01): **keep the cutoff on by
  default, and add a way to reveal old Students so they can be deleted.** So this becomes a small
  feature, not a removal. Fix the date field in the same slice.

## 2026-09-01 — get_attendance_statistics takes no teacher, so its only check is in the route
- **What:** every other read in the service layer takes a `teacher: User` and verifies ownership
  itself. `get_attendance_statistics` (`app/services/attendance_service.py:389`) takes only
  `db, class_id, exclude_dates`; the ownership check for that endpoint lives in the route
  (`app/api/attendance.py:59`). Any future caller reaching the service directly — a second route, a
  script, a background job — gets no check and no error.
- **Where:** `app/services/attendance_service.py:389`, `app/api/attendance.py:59`
- **What green tests do NOT prove here:** `test_authorization.py` exercises the **route**, so it
  passes. Nothing tests the service function's own contract, and nothing prevents a second caller.
- **Disposition:** open — fold into the INV-1 consolidation above; the fix is to take `teacher` and
  call the one owner, matching every sibling function.

## 2026-09-01 — CLAUDE.md's Data Model and endpoint lists are stale
- **What:** the root `CLAUDE.md` documents four entities. The code has **seven**: it omits
  `UserRole` (TEACHER/SUPERADMIN), `RegistrationCode`, and `RefreshToken` entirely, along with the
  `merge_students` operation and the attendance `statistics` endpoint. It also advertises
  `GET /classes/{id}/students/summary`, which **does not exist** — the route list is Students 7 (not
  6) and Attendance 5 (not 4), enumerated from `app.routes` directly.
- **Where:** root `CLAUDE.md`, "Data Model" and "Endpoints Summary"; verified against
  `app/main.py:127-131` and the live route table
- **What green tests do NOT prove here:** documentation. This is the same "trusting status over
  code" defect the 2026-09-01 measured-status table was written to correct, one section lower down.
- **Disposition:** fixed in the same commit — the Data Model, endpoint counts and the phantom
  `summary` route corrected, with a pointer to `INVARIANTS.md`.


## 2026-09-01 — the deploy job was unverified; it has now run successfully (VERIFIED)
- **What:** every gate in this repo was proven by breaking it and watching it go red. The `deploy`
  job in `.github/workflows/deploy.yml` was **not**, because the only way to exercise it is to deploy
  to production. What *was* verified: the YAML parses, all embedded shell blocks pass `bash -n`, the
  `gates`/`test`/`security` job commands were run locally with tools on PATH, and the gitleaks block
  was executed verbatim in a clean clone — which found a real bug (see below).
- **Where:** `.github/workflows/deploy.yml`, the `deploy` job
- **What green tests do NOT prove here:** that the backup step, the explicit migration step, the
  `up -d --no-deps backend nginx` swap, the health-check retry loop, or the automatic code rollback
  behave as written on the real VM. Specific untested assumptions: that `docker compose run --rm
  backend alembic upgrade head` overrides the container's start command as intended; that
  `$COMPOSE images -q backend` returns an image id on this docker version; that
  `deployment/scripts/backup-db.sh production` finds `deployment/production/.env` when invoked from
  `$PROJECT_PATH`; and that `restart: always` does not race the explicit migration step.
- **Disposition:** VERIFIED 2026-09-01. The workflow ran on push to `main` and production came
  back healthy (`/health` → 200). Caveat kept deliberately: this first run carried **no application
  code change** (harness scripts, workflow, docs, `tests/conftest.py`), so it exercised the deploy
  *mechanism* — backup, migrations, swap, health check — but not a real code transition, and the
  **rollback branch has still never executed**. A 200 from `/health` cannot distinguish "deployed"
  from "rolled back", so the Actions log is the only record of which path ran. Re-open this if the
  rollback ever fires.

## 2026-09-01 — a real bug in the CI security step, found only by running it
- **What:** the gitleaks step originally piped `curl` straight into `grep -m1` to resolve the latest
  release tag. `grep -m1` closes the pipe on its first match, `curl` then fails with
  CURLE_WRITE_ERROR (23), and `set -o pipefail` fails the whole step. It would have broken on the
  very first CI run. Fixed by capturing the response into a variable before parsing.
- **Where:** `.github/workflows/deploy.yml` and `client-app/.github/workflows/ci.yml`, gitleaks step
- **What green tests do NOT prove here:** nothing — this one is fixed and re-verified verbatim in a
  clean clone. It is recorded because it is the argument for executing CI shell locally rather than
  only linting it: `bash -n` passed on the broken version.
- **Disposition:** fixed

## 2026-09-01 — gitleaks: 108 findings in history, all documentation placeholders, allowlisted by value
- **What:** before wiring gitleaks as a gate, the full history of all four repos was scanned. This
  repo had 108 findings; `client-app`, `deployment` and `knowledge-base` had none. All 108 are
  placeholders in `API_REFERENCE.md` (58), `docs/API_REFERENCE.md` (48) and `scripts/README.md` (2):
  `Bearer YOUR_ACCESS_TOKEN`, example bodies like `"password": "password123"`, prose about a password
  prompt, and a truncated JWT that is the public HS256 header plus a literal `...`.
  **No real credential was found in any repo.**
- **Where:** `.gitleaks.toml`
- **What green tests do NOT prove here:** the allowlist matches placeholder **values**, not paths, and
  that was verified by planting both a random high-entropy secret and a complete 3-segment JWT into
  the allowlisted `API_REFERENCE.md` — both still failed the scan, so the docs are not a blind spot.
  Not covered: gitleaks' default ruleset is not exhaustive, and a secret in a shape it does not
  recognise still passes. Separately, the local `.env` does hold a real `SECRET_KEY`; it is correctly
  gitignored and never committed, which is why CI uses `gitleaks git` (history) and not `dir`.
- **Disposition:** accepted with reason. If a new doc adds a placeholder shape the allowlist misses,
  the fix is another value regex — never a path exclusion.

## 2026-09-01 — 262 green tests did not prove authorization; a denied-side suite now does (PARTIAL)
- **What:** during `/harness` install the teacher-ownership filter was deleted from
  `get_classes_by_teacher` — `.where(Class.teacher_id == teacher_id)` replaced with an always-true
  predicate, so **every teacher would see every teacher's classes**. The full suite was then run.
  **All 262 tests passed.** Coverage was byte-identical (77%, 272 lines missed) because the line
  still executes, just with a broken comparison. The change was reverted; `git diff` is clean.
- **Where:** `app/services/class_service.py:54` (the probe site);
  `tests/test_classes.py` (26 tests, none of which catch it)
- **What green tests do NOT prove here:** that a teacher cannot read another teacher's data. There
  is no test that authenticates as a *second, non-owning* teacher and asserts denial. Every
  ownership test in the suite checks the owner's happy path, so the suite is blind to exactly the
  bug class a solo web app actually ships (`/audit`: "broken object-level authorization"). Coverage
  is affirmatively misleading here — 77% is unchanged by removing an authorization check.
- **Disposition:** **PARTIAL, 2026-09-01** (`/crunch-domain`). Item (a) done: `tests/test_authorization.py`
  adds 17 denial tests plus 7 positive controls, all authenticating as a second real teacher
  (`other_teacher`) through the login route. Item (b) done: `INVARIANTS.md` exists and `INV-1` names
  that file as its enforcer. Each of the **seven** ownership sites was neutered individually and the
  suite watched go red — `class_service.py:54`→1 failure, `:151`→1, `:194`→1, `:226`→1,
  `student_service.py:579`→8, `attendance_service.py:80`→4, `attendance_service.py:286`→1. Every
  denial test maps to exactly one site and every site is covered, so the probe that started this
  entry now fails loudly. **Still open:** the seven sites themselves — see the entry above.

## 2026-09-01 — no type gate exists in this repo
- **What:** the `justfile` declared `typecheck: mypy app`, `lint: flake8 app tests` and
  `fmt: black app tests`, and a `check` recipe chaining them. **None of flake8, black or mypy was
  installed** — not in `requirements.txt`, not in the venv. All four recipes failed with "command
  not found". `/harness` replaced lint and format with ruff and removed the false typecheck recipe.
- **Where:** `justfile` (before this commit); `requirements.txt`
- **What green tests do NOT prove here:** nothing checks types in this codebase. mypy was
  deliberately not added (ADR-0001): no annotation discipline exists yet, so the opening baseline
  would be large and unmeasured, and the Owner's decision this session was to gate forward rather
  than open a new front.
- **Disposition:** open — mypy in `--ignore-missing-imports` mode over `app/services` first is the
  cheapest useful slice.

## 2026-09-01 — ruff baseline is 95 findings, gated as a ratchet
- **What:** `just lint` fails when the ruff count grows past 95, not when it exceeds zero.
- **Where:** `.harness-baseline` (`ruff=95`), `scripts/baseline-guard.sh`
- **What green tests do NOT prove here:** the 95 stand. Notably **7 × F821** (undefined name) in
  `app/models/`, all SQLAlchemy string forward references (`Mapped[list["Class"]]`) that resolve at
  runtime; the honest fix is `if TYPE_CHECKING:` imports rather than an ignore that would also hide
  a real typo. Also **3 × DTZ** (timezone-naive datetimes) — in an attendance app a naive timestamp
  is a wrong answer, not a style nit — plus 29 × I001 import ordering and 8 × F401 unused imports,
  56 of the 95 auto-fixable with `ruff check --fix`.
- **Disposition:** open — `ruff check --fix` is a safe first pass, but run it as its own commit with
  the suite green, not folded into a feature.

## 2026-09-01 — tests/conftest.py defaulted a schema-dropping fixture at another project's database
- **What:** `TEST_DATABASE_URL` defaulted to
  `postgresql+asyncpg://attendance_user:test_password_123@localhost:5433/attendance_tracker_test`,
  and the `db_engine` fixture calls `Base.metadata.create_all` then `Base.metadata.drop_all`. On
  this machine port 5433 is currently `platform-postgres`, a **different project's** container. The
  `attendance_user` role does not exist there, so it failed to authenticate rather than dropping
  anything — but "the wrong database refused us" is not a safety mechanism, and `.env.test.example`
  actively instructs using 5433, so the two projects are contending for that port.
- **Where:** `tests/conftest.py:26-28` (fixed in this commit), `.env.test.example`
- **What green tests do NOT prove here:** the fix makes the variable mandatory and pytest now
  refuses to collect without it (verified: exit 4). It does **not** resolve the underlying port
  collision between this project's intended test DB and `platform-postgres`.
- **Disposition:** partially fixed — the dangerous default is gone. Pick a port for this project's
  test DB that no other project claims, and update `.env.test.example`.

## 2026-09-01 — CLAUDE.md's test and coverage figures do not match the code
- **What:** `CLAUDE.md` states "241 tests, 82% coverage" for this repo. Measured on an isolated
  postgres 17: **262 passed, 77% coverage**.
- **Where:** `CLAUDE.md` "Backend (✅ Complete with 82% Test Coverage)", "Testing Guidelines"
  (which separately claims "63 tests passing" and "69% code coverage" — a third figure)
- **What green tests do NOT prove here:** the document carries three different test counts and two
  coverage numbers, none current. Per-module coverage is the part that matters and is not mentioned:
  `student_service.py` **29%**, `refresh_token_service.py` 61%, `attendance_service.py` 74%.
  `student_service.py` is a core service that is effectively untested.
- **Disposition:** open — `/verify-claim` per assertion, then correct `CLAUDE.md`.

## 2026-09-01 — CONTEXT.md was a gate seed; the Owner has now crunched it (RESOLVED)
- **What:** seeded by `/harness` from evidence in the code so the drift gate's vocabulary check has
  something to enforce. Every `_Avoid_` term was verified to have zero hits before being added.
- **Where:** `CONTEXT.md`
- **What green tests do NOT prove here:** the Owner has not authored or recited it. Three terms
  carry `_Unresolved_` questions only the Owner can answer — whether a Student is one person across
  Classes, whether `User` means different things to the auth code and the admin endpoints (the only
  valid trigger for the domain dial's `mapped` setting), and the lifecycle of a registration code.
  `INVARIANTS.md` does not exist, so drift-check's invariant check is inert.
- **Disposition:** **RESOLVED 2026-09-01** by `/crunch-domain`. The Owner answered five questions;
  `CONTEXT.md` now records what they decided and `INVARIANTS.md` carries six `INV-n` rows, each
  naming a real enforcer. Two of the three `_Unresolved_` questions are closed: a Student is a
  per-Class row (Owner's call), and the registration-code lifecycle was answered from the code. The
  third — whether `User` means two things — stays open **because the Owner is reconsidering whether
  the superadmin role should exist at all**; see the dedicated entry above. The invariant check in
  drift-check is now live in this repo.

## 2026-09-01 — the root .github/ workflow can never run
- **What:** `../.github/workflows/backend-tests.yml` sits at the project root, which is **not a git
  repository** (the four subdirectories each are). It has never run and never will.
- **Where:** `../.github/workflows/backend-tests.yml`; this repo's own working CI is
  `.github/workflows/deploy.yml`
- **What green tests do NOT prove here:** anyone reading the root workflow would believe backend
  tests run on push to `develop` with codecov reporting. They do not. The real pipeline is this
  repo's `deploy.yml`, which runs tests then deploys to production on push to `main`.
- **Disposition:** **CLOSED 2026-09-07 — both halves, in that order.** The 3 September merge made
  the root a repository, and the workflow this entry describes (`backend-tests.yml`, pushing to
  `develop` with codecov) no longer exists: the live CI is `backend.yml`, `frontend.yml` and
  `security.yml`, all three green on `7a813e6`, the last push before this one. The final trace of
  the old layout went today — `api/.github/CICD_SETUP.md`, 250 lines documenting a `deploy.yml`
  that no longer exists, referenced by no file in the repository, and naming the production host in
  four `ssh root@` lines. It was deleted rather than scrubbed because a scrubbed copy would still
  describe a pipeline that does not run, which is what this entry was about.

## 2026-09-01 — formatting is not gated
- **What:** `ruff format --check` would reformat **33 of 51** files. Not wired into any gate.
- **Where:** `justfile` (`just fmt`)
- **What green tests do NOT prove here:** nothing enforces a consistent format, so diffs will keep
  carrying incidental style churn.
- **Disposition:** open — run `just fmt` as its own commit with the suite green, then gate
  `ruff format --check`.
