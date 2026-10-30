# ADR-0012 — PyJWT replaces python-jose

**Status:** accepted 2026-10-30 by the Owner; implemented 2026-10-30 by spec 0012 slice 2.

## Context

`python-jose` 3.5.0 makes and verifies every token this API issues (`app/core/security.py`). On
2026-10-30 it carried a critical Dependabot alert, GHSA-3qf3-8w2g-rqmx (the algorithm-confusion
guard is bypassed by a DER-encoded public key), affecting every version up to 3.5.0, with no
patched release. It also pulls in `ecdsa`, whose high alert (Minerva timing attack) has had no fix
since 2026-10-01 and sits open in `api/REVIEW-DEBT.md` with this replacement named as one way out.

Neither alert is reached today, as far as the code shows. The API signs with HS256 and a shared
secret, and `decode_token` pins `algorithms=[settings.algorithm]`, so a token cannot pick an
asymmetric algorithm and no public key is ever loaded. That argument holds only while nobody sets
`ALGORITHM` to an asymmetric value, and nothing refuses one.

## The decision

1. **`PyJWT` replaces `python-jose[cryptography]`** in `requirements.in`, with HS256 and the
   algorithm list pinned exactly as now. `cryptography` stays only if something else still needs
   it; HS256 does not.
2. **Tokens already issued keep working.** HS256 tokens are a standard format, so a refresh token
   minted by python-jose before the deploy must decode under PyJWT after it. Spec 0012 tests this
   with a token minted by python-jose itself, because a teacher logged out by a dependency swap
   would be a regression nobody asked for.
3. **The swap stays inside `app/core/security.py`** and the one test that imports `jose` directly
   (`tests/test_dependencies.py`). No route, schema or claim changes.

## Rejected alternatives

- **Dismiss both alerts as not reached.** Cheapest today, and the reasoning above supports it. It
  leaves an unmaintained library on the login path, and the dismissal holds only as long as the
  `ALGORITHM` setting stays symmetric, with no enforcer behind that.
- **`joserfc` or `authlib`.** Both are maintained and both cover JWE, JWK sets and more. This API
  needs one symmetric algorithm, so the extra surface is cost with no use.
- **Keep python-jose and refuse asymmetric `ALGORITHM` values at startup.** It closes the reachable
  path but not the alerts, and every later python-jose advisory starts the same argument again.

## Consequences

- `ecdsa`, `rsa` and `pyasn1` leave both locks if nothing else requires them, closing Dependabot
  alerts #1, #46, #52 and #54 once the change reaches `main`.
- PyJWT ships its own type hints, so the mypy ratchet (ADR-0004) may report findings
  `ignore_missing_imports` used to hide. They are fixed or confessed, never baselined silently.
