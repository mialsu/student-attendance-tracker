# ADR-0001 — ruff replaces the flake8/black/mypy recipes that were never installed

The `justfile` declared `lint` (flake8), `fmt` (black) and `typecheck` (mypy), and a `check` recipe
that chained them. None of flake8, black, mypy or ruff was in `requirements.txt` or the venv, so
all four recipes failed with "command not found" — three gates that existed only as prose, plus an
umbrella command that could not pass. `/harness` replaced them with **ruff** (lint + format in one
tool) and **import-linter** (boundary gate), both verified installable and current before being
chosen (ruff 0.16.5, import-linter 2.14).

Two configuration decisions are load-bearing and would look arbitrary later:

- **`B008` is configured away** via `flake8-bugbear.extend-immutable-calls` for the FastAPI
  injection helpers. `db: AsyncSession = Depends(get_db)` *is* a function call in a default
  argument; it fired 31 times and would fire on every new endpoint forever. A gate that fires on
  every correct feature gets tuned to silence, so this one is silenced deliberately and narrowly.
- **`UP017` is ignored** (`timezone.utc` → `UTC`). Valid on 3.11+, but a naming preference rather
  than a defect, and it fired 76 times — enough to bury the 7 `F821` and 3 `DTZ` findings that
  matter. A baseline number nobody reads is a baseline nobody defends.

`F821` is deliberately **not** ignored, though all 7 hits are SQLAlchemy string forward references
(`Mapped[list["Class"]]`) that resolve at runtime. A per-file ignore would also hide a genuine typo
in a model; the honest fix is `if TYPE_CHECKING:` imports, so they stay visible as debt.

## Rejected alternatives
- **flake8 + black + mypy, actually installed** — rejected because it is three tools, three configs
  and three CI steps for what ruff does in one, at a fraction of the runtime. Nothing in the repo
  depended on a flake8 plugin that ruff lacks.
- **mypy as well, for a real type gate** — rejected *for now*, not on merit: this codebase has no
  established annotation discipline, so mypy's opening baseline would be large and unmeasured, and
  the Owner's decision for this session was to gate forward rather than open a new front. The
  consequence is that **the API has no type gate at all**, which is confessed in `REVIEW-DEBT.md`
  rather than papered over. This is the single biggest remaining hole in the API's harness.
- **Gating `ruff format --check`** — rejected because 33 of 51 files would change. Formatting the
  repo is a legitimate commit, but folding a 33-file reformat into the harness install would bury
  every real change in it. `just fmt` exists; nothing gates it.
- **`eslint-plugin-boundaries`-style layering inside the linter** — not available in Python;
  import-linter is the maintained tool for this and expresses layers directly.
