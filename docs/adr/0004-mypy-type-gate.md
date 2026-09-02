# ADR-0004 — mypy as a ratcheted type gate over `app/`

**Status:** accepted and **implemented**, 2026-09-02. Supersedes the "mypy as well, for a real type
gate" rejection in [ADR-0001](0001-ruff-and-import-linter.md), which is otherwise unchanged.

ADR-0001 rejected mypy *for now, not on merit*: "this codebase has no established annotation
discipline, so mypy's opening baseline would be large and unmeasured." That reasoning was sound
and it was never tested, which is the part worth noticing — the deferral rested on a prediction
about a number nobody had produced. `CODING_STANDARDS.md` recorded the consequence honestly:
"`[types]` appears nowhere in this file because nothing earns it. This is the biggest remaining
hole in this repo's harness."

Measured on 2026-09-02, the opening baseline is **16 errors across 9 files, out of 35 checked**.
Not large. The prediction was wrong, so the deferral expired.

## The decision

**mypy 2.3.1**, configured in `pyproject.toml`'s `[tool.mypy]`, run by `just typecheck` through
`scripts/baseline-guard.sh` — the same ratchet that guards ruff. It fails when the count **grows**,
not when it is above zero, and it lowers the baseline whenever the count drops. It is in
`just check-fast`, so it runs on every commit via the pre-commit hook, and in CI's `gates` job.

Two configuration decisions are load-bearing:

- **`ignore_missing_imports = true`.** passlib, jose and several others ship no stubs. Without this
  the output is a wall of `import-untyped` noise with the 16 real findings buried in it, and a
  baseline number nobody reads is a baseline nobody defends — the same argument ADR-0001 made for
  ignoring `UP017`.
- **Nothing stricter is enabled.** `disallow_untyped_defs` alone would take the baseline from 16
  into the hundreds and make it meaningless, which is precisely the trap ADR-0001 was right to
  avoid. Those flags are the ratchet's future, one at a time, each with its own measured baseline.

`tests/` and `alembic/versions/` are excluded — the latter because it is generated, and
ANTI-PATTERNS forbids touching generated files.

## What the 16 are

None is a live defect; all are recorded in `REVIEW-DEBT.md`. Grouped by cause, because the grouping
is the useful part:

| Count | Where | Cause |
|---|---|---|
| 5 | `app/models/*` | SQLAlchemy string forward references (`Mapped[list["Class"]]`). The **same debt** ADR-0001 left visible as 7 `F821` hits, seen by a second tool. One fix (`if TYPE_CHECKING:` imports) closes both. |
| 4 | `app/api/auth.py` | `samesite` is typed `str`, Starlette wants `Literal['lax','strict','none']`. Worth its own line: `COOKIE_SAMESITE=laxx` would be accepted silently today. |
| 3 | `app/services/*` | One reused variable narrowing a return type, one `Result.rowcount`, one unary `-` on `object`. |
| 2 | `app/config.py` | `Settings()` called with no arguments. pydantic-settings reads the environment; mypy cannot see that without pydantic's plugin. |
| 2 | `app/main.py` | `docs_username` is `str | None` and `.encode()` is called on it. The guarantee that it is set lives in a validator, not in the type. |

The `app/api/auth.py` cluster is the argument for gating the whole of `app/` rather than
`app/services` alone: it lands on the cookie-hardening code changed the same day, and a
services-only gate would not have seen it.

## Rejected alternatives

- **Keep deferring.** Rejected: the stated reason was a measurement, and the measurement came back
  small. Continuing to defer would have meant defending a prediction against its own result.
- **`app/services` only, baseline 3** — the "cheapest useful slice" named in `BACKLOG.html`.
  Rejected on the evidence: at whole-app scope the total is 16, which is still trivially small,
  and the services-only scope leaves `app/api`, `app/models` and `app/main.py` free to rot. It
  would have missed all four `samesite` findings and both `main.py` ones.
- **Gate at zero by fixing all 16 first.** Rejected for this session: three of the five clusters
  want real edits to authentication code that had just been changed by `/audit`, and folding a
  type-driven refactor into that is how a security fix acquires unrelated risk. The ratchet blocks
  accumulation today and the 16 stay visible as debt.
- **pyright / pyre instead.** Rejected: mypy is the reference implementation, is what
  `requirements.txt`'s ecosystem expects, and was already the tool the deleted `justfile` recipe
  named — so choosing it costs nothing in vocabulary. pyright would also add a Node dependency to a
  Python repo.
- **Enabling pydantic's mypy plugin** to clear the two `app/config.py` errors. Not rejected,
  deferred: it is a real improvement and it changes how every model in the repo is type-checked at
  once, which deserves its own measured baseline rather than riding along with the install.
