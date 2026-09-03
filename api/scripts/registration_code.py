"""
Issue and revoke registration codes from the command line.

Authorization here is having access to the database, not holding a role (ADR-0003). There is no
HTTP endpoint for this and no user account behind it: whoever can reach the database can issue a
code, and nobody else can, which is a boundary the internet cannot reach at all.

Usage:
    python scripts/registration_code.py issue  teacher@example.com
    python scripts/registration_code.py revoke teacher@example.com

This script holds no logic. Both commands are one call into
app.services.registration_code_service, which is where the behaviour lives and where the tests
point. Exits non-zero on any refusal, so a mistyped address never looks like success.

Run with: ./scripts/registration-code.sh issue teacher@example.com
"""

import argparse
import asyncio
import sys
from pathlib import Path

# Add parent directory to path to import app modules
sys.path.insert(0, str(Path(__file__).parent.parent))

from asyncpg.exceptions import PostgresError
from sqlalchemy.engine import make_url
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.config import settings
from app.core.exceptions import BadRequestException, NotFoundError
from app.services import registration_code_service


def target() -> str:
    """Name the database this run will write to, without its password.

    Printed on every run and in every failure. This machine has run several PostgreSQL
    containers at once and this repo has already been bitten twice by a command aimed at the
    wrong one (REVIEW-DEBT.md). A tool that writes to whatever DATABASE_URL happens to say
    should say what that is.

    Parsed by SQLAlchemy, which owns this URL format, and NOT by `urllib.parse`. A generated
    password routinely contains `/`; `urlparse` truncates the netloc there and then
    `.port` raises `ValueError` while quoting a fragment of the password into the message. That
    took the tool from working locally to unusable in production, and printed part of the
    production password into a traceback — see REVIEW-DEBT.md, 2026-09-02.

    Total by construction: this function is called from the failure path, so it must never be
    the thing that fails, and it must never widen a failure into a disclosure.
    """
    try:
        url = make_url(settings.database_url)
        return f"{url.username}@{url.host}:{url.port}{'/' + url.database if url.database else ''}"
    except Exception:
        # Deliberately says nothing about the value it could not parse.
        return "<unparseable DATABASE_URL>"


async def issue(session: AsyncSession, email: str) -> None:
    """Issue a code for one address and print it with its expiry."""
    code = await registration_code_service.create_registration_code(
        session, email_restriction=email
    )
    print()
    print(f"  Code:    {code.code}")
    print(f"  For:     {code.email_restriction}")
    print(f"  Expires: {code.expires_at:%Y-%m-%d %H:%M} UTC")
    print()
    print("  Only this address can redeem it, and only before it expires.")
    print()


async def revoke(session: AsyncSession, email: str) -> None:
    """Revoke the outstanding code for one address."""
    code = await registration_code_service.revoke_code_for_email(session, email)
    print()
    print(f"  Revoked: {code.code}")
    print(f"  For:     {code.email_restriction}")
    print()
    print("  An account already created with it is unaffected.")
    print()


async def run(command: str, email: str) -> None:
    """Open a session against the configured database and run one command."""
    # stderr: this is context, not output. It keeps stdout to the code itself, and keeps this
    # line ahead of any error rather than behind it in a buffer.
    print(f"Database: {target()}", file=sys.stderr)
    engine = create_async_engine(settings.database_url, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    try:
        async with async_session() as session:
            if command == "issue":
                await issue(session, email)
            else:
                await revoke(session, email)
    finally:
        await engine.dispose()


def main() -> None:
    """Parse arguments and run. Standard library only — no dependency for this."""
    parser = argparse.ArgumentParser(
        prog="registration_code.py",
        description="Issue and revoke registration codes. Requires database access.",
    )
    subcommands = parser.add_subparsers(dest="command", required=True)

    issue_parser = subcommands.add_parser("issue", help="issue a code for an email address")
    issue_parser.add_argument("email", help="the address that may redeem the code")

    revoke_parser = subcommands.add_parser(
        "revoke", help="revoke the outstanding code for an email address"
    )
    revoke_parser.add_argument("email", help="the address whose code should be revoked")

    args = parser.parse_args()
    email = args.email.strip()
    if not email:
        print("Error: email cannot be empty", file=sys.stderr)
        sys.exit(1)

    try:
        asyncio.run(run(args.command, email))
    except (BadRequestException, NotFoundError) as e:
        # A refusal, not a crash: an address that already has a live code, or has none to revoke.
        print(f"Error: {e.detail}", file=sys.stderr)
        sys.exit(1)
    except (OSError, PostgresError, SQLAlchemyError) as e:
        # Unreachable, wrong credentials, or a schema that has not been migrated. An operator
        # reading a traceback learns nothing a one-line message cannot tell them better.
        print(f"Error: cannot use the database at {target()}", file=sys.stderr)
        # First line only: SQLAlchemy appends the full statement, which is noise to an operator.
        detail = str(e).split("\n")[0]
        print(f"       {type(e).__name__}: {detail}", file=sys.stderr)
        print(file=sys.stderr)
        print("       Check DATABASE_URL in .env, and that the database is running and", file=sys.stderr)
        print("       migrated (just migrate).", file=sys.stderr)
        sys.exit(1)
    except KeyboardInterrupt:
        sys.exit(1)


if __name__ == "__main__":
    main()
