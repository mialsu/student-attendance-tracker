"""What must never reach the container image.

`Dockerfile:25` is `COPY . .`, so `.dockerignore` is the only thing between the build context
and the image layer. /audit demonstrated on 2026-09-02, by building from the real context, that
without it `/app/.env` lands in the image at 688 bytes with SECRET_KEY inside, next to `.git`
and the host's `venv/`.

This is deliberately a WEAK gate and worth knowing why: it reads the ignore file, it does not
build the image. It catches the file being deleted or gutted -- the realistic regression -- and
it does not catch a pattern that fails to match for some subtler reason. Proving the image
itself means a docker build, which does not belong in a test suite that runs on every commit.
The real proof was run by hand and is recorded in the commit that added `.dockerignore`.
"""

from pathlib import Path

import pytest

DOCKERIGNORE = Path(__file__).resolve().parent.parent / ".dockerignore"

# Each of these was observed in the image before .dockerignore existed.
MUST_BE_EXCLUDED = [".env", ".git", "venv", "htmlcov", ".coverage"]

# The container cannot start without these, so an over-broad ignore file is its own outage:
# the CMD runs `alembic upgrade head`, and registration codes are issued with
# `docker compose exec backend python scripts/registration_code.py`.
MUST_NOT_BE_EXCLUDED = ["app", "alembic", "alembic.ini", "requirements.txt", "scripts"]


def _patterns() -> list[str]:
    text = DOCKERIGNORE.read_text(encoding="utf-8")
    return [
        line.strip()
        for line in text.splitlines()
        if line.strip() and not line.strip().startswith("#")
    ]


def test_dockerignore_exists():
    assert DOCKERIGNORE.is_file(), (
        "no .dockerignore: Dockerfile:25 is `COPY . .`, so every file in the build context "
        "-- including .env -- goes into the image"
    )


@pytest.mark.parametrize("name", MUST_BE_EXCLUDED)
def test_secret_and_clutter_paths_are_excluded(name: str):
    assert name in _patterns(), f"{name!r} is not excluded by .dockerignore and will be baked in"


@pytest.mark.parametrize("name", MUST_NOT_BE_EXCLUDED)
def test_runtime_paths_are_not_excluded(name: str):
    assert name not in _patterns(), (
        f"{name!r} is excluded by .dockerignore, but the container needs it at runtime"
    )
