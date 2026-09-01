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

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.config import settings
from app.core.exceptions import BadRequestException, NotFoundError
from app.services import registration_code_service


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
    except KeyboardInterrupt:
        sys.exit(1)


if __name__ == "__main__":
    main()
