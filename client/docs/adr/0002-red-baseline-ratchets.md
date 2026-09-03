# ADR-0002 — gates wired as baseline ratchets, because the tree was red

`/harness` requires a gate to pass on a clean tree before it can be proven to bite. On this repo's
clean `main`, three of the profile's gates were failing: `tsc --noEmit` (26 errors), `eslint .`
(19 errors) and `vitest run` (25 of 90 tests). So each was wired through
`scripts/baseline-guard.sh`, which records today's count in `.harness-baseline` and fails when the
count **grows**. Every baseline number has a `REVIEW-DEBT.md` entry. The Owner chose this
explicitly over fixing the baseline first.

A ratchet is a real gate — each was proven by adding a violation and watching it go red — but it is
weaker than a clean gate in one specific way, stated here so nobody mistakes it: it blocks
*accumulation*, not *substitution*. Fixing one error while adding another nets zero and passes.
When a count drops the script rewrites the baseline downward, so ground gained cannot be given back.

## Rejected alternatives
- **Fix the baseline to green first, then install clean gates** — the strongest end state, and
  rejected only on sequencing: it is a substantial build session before any gate exists at all, and
  the 25 test failures are not yet diagnosed as test bugs versus product bugs (auth, login, logout
  and password change are all implicated). The repo would have stayed ungated throughout. This
  remains the target; the ratchet is the road to it, not a destination.
- **Relax the rules until the tree is green** — turn off `no-explicit-any`, delete or `.skip` the
  failing tests. Rejected outright: "a gate tuned until it's silent is the same as no gate"
  (`/harness`, retrofitting). It would also have hidden the auth test failures, which are the most
  valuable thing this install found.
- **Per-file scoping via lint-staged instead of a repo-wide count** — rejected because it blocks a
  commit for pre-existing errors in any file you happen to touch, which trains people to reach for
  `--no-verify`. `lint-staged` was installed during this session and then removed for this reason.
- **No gate on the red checks; boundary and drift only** — rejected because typecheck, lint and
  tests are where new breakage actually arrives; leaving them ungated would gate only shape and
  ignore breakage.

## Consequences
`.harness-baseline` is committed and load-bearing. A diff that raises a number in it is a
confession and needs a `REVIEW-DEBT.md` entry in the same commit. A diff that lowers one is the
script ratcheting automatically — commit that change.
