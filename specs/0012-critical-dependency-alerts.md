# Spec 0012 — the two critical Dependabot alerts: certifi bumped, python-jose replaced

**Status:** shaped 2026-10-30 from issue #38, one decision taken by the Owner (replace python-jose,
ADR-0012). **Closed 2026-10-30:** both slices shipped as one PR, #42 (`c0e4858`), and deployed the
same day; AC-1 – AC-10 all MET.
**Weight:** Standard
**Domain dial:** on (project-wide); moves no invariant. Slice 2 changes the code that authenticates
every request, so `INV-1` is re-run, not re-specified (AC-7)
**Tracker:** issue #38 stays open after this spec closes: it covers 57 alerts and this spec covers
the two critical ones. Reference it as `Refs #38`, never `Closes #38`.

Modules and functions are named; **line numbers deliberately are not**, per `INVARIANTS.md`.

---

## Problem Statement

Dependabot reports two critical alerts against `api/`, each counted once per lock (`requirements.txt`
and `requirements-dev.txt`), as of 2026-10-30:

| Alerts | Package | Pinned | Advisory | Patched |
|---|---|---|---|---|
| #73, #71 | `certifi` | 2026.7.22 | GHSA-6q48-6c7w-9gw2, bundles emSign roots whose intermediate keys are compromised | 2026.10.18 |
| #54, #52 | `python-jose` | 3.5.0 | GHSA-3qf3-8w2g-rqmx, algorithm-confusion guard bypassed by a DER-encoded public key | none |

`python-jose` also brings `ecdsa` (high alerts #1 and #46, no fix), open in `api/REVIEW-DEBT.md`
since 2026-10-01.

## Solution

Bump `certifi` through the lock (slice 1). Replace `python-jose` with `PyJWT` in
`app/core/security.py` (slice 2, ADR-0012), which removes `ecdsa` with it.

## Implementation Decisions

1. **Two slices, two PRs.** Slice 1 is a lock bump with nothing to decide and can merge on its own,
   so it does not wait for slice 2's auth change.
2. **Slice 1 moves `certifi` alone:** `just lock --upgrade-package certifi` (`scripts/lock.sh`
   passes the flag to `pip-compile`). Never a hand edit of a `.txt` file; drift check 7 and the
   reformatting rule both refuse one.
3. **PyJWT, HS256, the algorithm list pinned** (ADR-0012). `create_access_token`,
   `create_refresh_token` and `decode_token` keep their signatures and their claims (`sub`,
   `user_id`, `type`, `exp`, `jti`). `decode_token` still returns `None` for any token it refuses;
   callers do not change.
4. **Tokens issued before the deploy keep working.** Refresh tokens live 30 days, so every teacher
   holds one minted by python-jose. Slice 2 proves they decode under PyJWT with a token minted by
   python-jose 3.5.0 and committed as a fixture string, since after the swap python-jose is no
   longer installed to mint one.
5. **`requirements.in` names PyJWT with a reason**, as every line there does. The drift gate's
   dependency check requires ADR-0012 to name it, and it does.

## Testing Decisions

- Against the disposable database only: `eval "$(just test-db-up)"`, port 5439. **Never 5433**:
  the fixtures call `drop_all`. Never two pytest sessions at once.
- Red first where a test can be red: AC-5's refusal cases are written against the current code
  first. They should pass there too, since python-jose refuses them today; a refusal test that
  passes before and after is the point, because it pins behaviour across the swap. Record that.
- AC-4's fixture token is minted **before** python-jose is removed, in the same slice, with the
  test `SECRET_KEY`. Its `exp` is far enough ahead that the test does not expire; if PyJWT rejects
  that, decode it with expiry checking off and assert the claims, and say so in the test.
- AC-7 runs `tests/test_authorization.py` unchanged. It needs no new rows: the auth swap changes
  who is authenticated, never what an authenticated teacher may reach.

## Acceptance Criteria

| # | Criterion | Proven by | Serves | Verdict |
|---|---|---|---|---|
| AC-1 | Both locks pin `certifi` ≥ 2026.10.18, and the diff of the two `.txt` files changes no other package | `gate:` drift check 7 + `review-only` (the diff) | US-1 | |
| AC-2 | `just check` green on slice 1, no baseline moved | `gate:` | US-1 | |
| AC-3 | `python-jose` and `ecdsa` appear in neither lock; `rsa` and `pyasn1` are gone too unless the lock's `# via` names another package needing them; `PyJWT` is in both, exact | `review-only` (grep the locks) + `gate:` drift check 7 | US-2 | |
| AC-4 | An access and a refresh token minted by python-jose 3.5.0 with the current claims decode under the new `decode_token` to the same payload | `test:` | US-3 | |
| AC-5 | `decode_token` returns `None` for: `alg: none`; HS512 signed with the right key; HS256 signed with the wrong key; a tampered payload; an expired token | `test:` | US-4 | |
| AC-6 | A token from the new `create_access_token` and `create_refresh_token` round-trips through `decode_token` with `sub`, `user_id`, `type`, `exp` (and `jti` on refresh) intact | `test:` | US-3 | |
| AC-7 | `just check` green on slice 2, `tests/test_authorization.py` and `tests/test_auth.py` included; any mypy finding PyJWT's type hints expose is fixed or confessed, never added to the baseline in silence | `gate:` | US-5 | |
| AC-8 | Live, against `uvicorn` and a throwaway database: signup, login, `/me`, refresh, password change, logout. A refresh cookie issued by the **old** build refreshes on the **new** build | `live:` | US-3 | |
| AC-9 | The record matches the code: ADR-0012's status says implemented; `api/REVIEW-DEBT.md`'s 2026-10-01 `ecdsa` entry closed with the date and this spec; `api/README.md`'s auth line and the `pyproject.toml` mypy comment no longer name jose; spec 0011's stale `Status:` line ("not yet merged") corrected, since it merged as #40 | `review-only` | US-6 | |
| AC-10 | After each PR merges, its alerts read *fixed* on GitHub (slice 1: #71, #73; slice 2: #1, #46, #52, #54), and #38 gets a comment listing what remains | `live:` after merge | US-1, US-2 | |

## User Stories

1. As the Owner, I want the image to trust no root CA with a compromised key.
2. As the Owner, I want no unpatchable critical advisory on the code that issues tokens.
3. As a teacher, I want to stay logged in across the deploy that swaps the library.
4. As the Owner, I want a forged, downgraded or expired token refused after the swap exactly as before.
5. As the Owner, I want the swap to leave `INV-1` and the type gate where they were.
6. As a reader of the docs, I want no file to still name the library this removed.

## Tracer Slices

1. **certifi** — `just lock --upgrade-package certifi`, gates, PR. AC-1, AC-2, and AC-10's first
   half. Built on `fix/0012-critical-dependency-alerts`, which already carries this spec and
   ADR-0012, so they land with it.
2. **PyJWT** — fixture token first (AC-4), then `requirements.in`, `just lock`, `security.py`,
   `tests/test_dependencies.py`, the AC-5/AC-6 tests, the AC-9 documents. AC-3 – AC-9 and AC-10's
   second half. Branch `fix/0012-pyjwt`, cut from slice 1's branch and rebased onto `main` once
   slice 1 merges; both slices write the two locks, so the rebase re-runs `just lock` rather than
   resolving the conflict by hand.

## Out of Scope

- The other 53 alerts in #38, the API's high `dnspython` and moderate `opentelemetry-api` among
  them. They need their own pass.
- Making `pip-audit` or `npm audit` gate CI. #38 leaves that decision open, and this spec does not
  take it.
- Rotating `SECRET_KEY` or revoking tokens. The swap keeps both; AC-4 and AC-8 exist to prove it.
- The client. It never decodes a token.

## Non-Goals

- A wrapper over PyJWT. Three functions in `security.py` already are the wrapper.

## Open Questions

1. **PyJWT and short HMAC keys.** CI's `SECRET_KEY` is `test-secret-key-for-ci`, 22 bytes. If the
   installed PyJWT warns about or refuses an HMAC key under 32 bytes, the builder reports which
   it does before changing anything. A refusal in CI means a longer CI key; in production it would
   mean the key there is short, which only the Owner can check on the server. Answer before slice
   2 merges.

## Verification status

*(Filled by `/verify-live`.)*

**Slice 1 (certifi), verified 2026-10-30 by dev-qa at `220e6af`. Slice verdict: MET** (AC-1, AC-2).

| # | Verdict | Evidence |
|---|---|---|
| AC-1 | MET | `git diff 745dee0 220e6af --stat` touches only `api/requirements.txt` and `api/requirements-dev.txt`, one line each: `certifi==2026.7.22` → `certifi==2026.10.23`. `api/venv` has certifi 2026.10.23 installed. The advisory (GHSA-6q48-6c7w-9gw2, read with `gh api /advisories/...`) names one root, `emSign ECC Root CA - G3`. The 2026.7.22 bundle (from `pip download`) holds 121 certs and 4 emSign roots: G1, ECC G3, C1, ECC C3. The 2026.10.23 bundle holds 118 certs and 1 emSign root, `emSign Root CA - G1`, which the advisory does not name. G3 is gone. C1 and ECC C3 are gone too, although the advisory does not name them either: of the four emSign roots in 2026.7.22, only G1 remains in 2026.10.23. The API makes no outbound TLS call that would need them. Drift check 7: `./scripts/drift-check.sh 745dee0..220e6af` → clean, exit 0 |
| AC-2 | MET | dev-qa reran it rather than relying on the builder's run: `just check` on the 5439 test database, `api/venv/bin` first on PATH → exit 0, `581 passed, 26 warnings in 514.11s`, `✓ all gates green`. `api/.harness-baseline` is byte-identical before and after the run, and `git diff 745dee0 HEAD -- api/.harness-baseline` is empty |
| AC-10 | NOT CHECKED | post-merge; not slice 1's to verify yet |

**Slice 2 (PyJWT), verified 2026-10-30 by dev-qa at `e60e326`. Slice verdict: MET** (AC-3 – AC-9).

| # | Verdict | Evidence |
|---|---|---|
| AC-3 | MET | Neither lock has a line for `python-jose`, `ecdsa`, `rsa`, `pyasn1`, `cryptography`, `cffi`, `pycparser` or `six`, and no `# via` names any of them. `pyjwt==2.15.1` is in both, at `requirements.txt:118` and `requirements-dev.txt:225`. `git diff d0cf57d e60e326` of the two locks removes those eight and adds `pyjwt`, nothing else. `git grep` finds no import of any of the eight in `api/`. Drift check 7: `./scripts/drift-check.sh d0cf57d..e60e326` → clean, exit 0 |
| AC-4 | MET | `TestTokensMintedByPythonJose` (2 tests) passes in `just check`. The fixtures are python-jose's own output: re-minting both with the same claims and key under python-jose 3.5.0 (a venv built from `d0cf57d`'s lock) reproduces the committed strings exactly. They decode to the same payload in a clean venv built from `requirements.txt` alone, which has no `cryptography`. `git log` puts the test commit `4fb43df` before the swap `6621e06`, and `test_security.py` is unchanged between them |
| AC-5 | MET | `TestRefusedTokens`: the five refusals plus a positive control for the forger all pass. Mutation in a scratch copy of `decode_token`: adding HS512 to the algorithm list turns `hs512…refused` red; `verify_signature: False` turns all five red; `verify_exp: False` turns `expired…refused` red |
| AC-6 | MET | `TestRoundTrip` (access, refresh, two refresh tokens differ) passes |
| AC-7 | MET | dev-qa reran it rather than relying on the builder's run: `just check` → exit 0, `592 passed, 37 warnings in 445.73s`, `✓ all gates green`. `test_authorization.py` passes 31 of 31 and `test_auth.py` 30 of 30; neither file changed. mypy: `14 problem(s), at baseline (14)`. `.harness-baseline` unchanged by the run and across `d0cf57d..e60e326` |
| AC-8 | MET | Live: uvicorn for the new build (`e60e326`, port 8701) and for the old build (`d0cf57d` worktree, python-jose 3.5.0, port 8702), one throwaway database `qa_ac8` on the 5439 server, one `SECRET_KEY`. New build: signup 201, login 200, `/me` 200, refresh 200 with a rotated cookie, `/me` with the refreshed token 200, rotated-out cookie 401, password change 204, pre-change cookie 401, old password 401, new password 200, logout 204, refresh after logout 401. Cross-build: a refresh cookie from the old build's login refreshes on the new build (200), and the new access token works on `/me` (200). The old build's access token also works on the new `/me`. Rollback direction: a cookie from the new build refreshes on the old build (200). Both server logs show only passlib's trapped bcrypt-version traceback, which both builds print, and the expected denials. The orphan `cryptography`/`cffi`/`pycparser`/`six` in `api/venv` played no part: the clean-venv check under AC-4 has none of them |
| AC-9 | MET | ADR-0012 `Status:` "implemented 2026-10-30 by spec 0012 slice 2". `api/REVIEW-DEBT.md`'s 2026-10-01 `ecdsa` entry: "closed 2026-10-30 by spec 0012 slice 2". `api/README.md:12` "JWT (PyJWT)". The `pyproject.toml` mypy comment no longer names jose. Spec 0011's `Status:` says merged as #40 (`b8655ad`). Remaining `git grep -i jose` hits are history or this change's own record (ADR-0012, REVIEW-DEBT, `requirements.in`'s reason, this spec, `test_security.py`) plus two outside AC-9's list: `api/docs/adr/0004-mypy-type-gate.md:25`, a dated decision left as written, and `BACKLOG.html:613`, an open "your call" row for a decision ADR-0012 has taken, filed to the builder |
| AC-10 | NOT CHECKED | post-merge |

**AC-10, checked 2026-10-30 after #42 merged as `c0e4858`. Spec verdict: MET** (AC-1 – AC-10).

| # | Verdict | Evidence |
|---|---|---|
| AC-10 | MET | The backend workflow on `c0e4858` passed gates, tests, security and the Hetzner deploy; `/health` returned `healthy`. `gh api …/dependabot/alerts` reads all six as `fixed`: #71, #73 (`certifi`), #52, #54 (`python-jose`), #1, #46 (`ecdsa`). #38 got the comment listing what remains: 56 open alerts, 26 high. Production also refused a token with a bad signature and one with `alg: none` on `/api/auth/me` (401 both), and the Owner logged in with their own account after the deploy |

## Spec Deltas

*(Dated entries, added as the build teaches us the spec was wrong.)*

**2026-10-30 — open question 1 answered: PyJWT warns about a short key and accepts it.** PyJWT
2.15.1, the version both locks pin, raises `InsecureKeyLengthWarning` on encode and on decode for an
HMAC key under 32 bytes and does not refuse it (`enforce_minimum_key_length` defaults to off). CI's
22-byte `SECRET_KEY` therefore stays green with the warning. The Owner decided CI's key stays as it
is. Production's key length is unchecked and only the Owner can check it on the server; that is
open in `api/REVIEW-DEBT.md`, 2026-10-30, *PyJWT warns about a short HMAC key and accepts it*.

**2026-10-30 — one PR, not two (Implementation Decision 1).** The Owner merged the two slices into
one pull request from `fix/0012-pyjwt`. Both slices were verified and reviewed together, and slice
2's branch was cut from slice 1's, so it already contained every slice 1 commit. A separate slice 1
PR would only have been merged and then rebased away. `fix/0012-critical-dependency-alerts` gets
no PR. AC-10 is checked once, after this one PR merges, for all six alerts.
