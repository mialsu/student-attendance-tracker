# Spec 0012 — the two critical Dependabot alerts: certifi bumped, python-jose replaced

**Status:** shaped 2026-10-30 from issue #38, one decision taken by the Owner (replace python-jose,
ADR-0012). Two slices, neither started. `ready-for-agent`.
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

## Spec Deltas

*(Dated entries, added as the build teaches us the spec was wrong.)*
