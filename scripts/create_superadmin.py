"""
Create a superadmin user via CLI.

This script creates a superadmin user with the specified email and password.
If the user already exists, it updates their role to superadmin.

Usage:
    python scripts/create_superadmin.py

The script will prompt for:
- Email address
- Password (hidden input)
- Password confirmation

Run with: python scripts/create_superadmin.py
"""

import asyncio
import getpass
import sys
from pathlib import Path

# Add parent directory to path to import app modules
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.config import settings
from app.core.security import hash_password
from app.database import Base
from app.models.user import User, UserRole


async def create_superadmin():
    """Create a superadmin user interactively."""
    print("=" * 60)
    print("Create Superadmin User")
    print("=" * 60)
    print()

    # Get email
    email = input("Enter email address: ").strip()
    if not email:
        print("❌ Error: Email cannot be empty")
        sys.exit(1)

    # Basic email validation
    if "@" not in email or "." not in email.split("@")[1]:
        print("❌ Error: Invalid email format")
        sys.exit(1)

    # Get password (hidden input)
    password = getpass.getpass("Enter password (min 8 characters): ")
    if len(password) < 8:
        print("❌ Error: Password must be at least 8 characters")
        sys.exit(1)

    # Confirm password
    password_confirm = getpass.getpass("Confirm password: ")
    if password != password_confirm:
        print("❌ Error: Passwords do not match")
        sys.exit(1)

    print()
    print(f"Creating superadmin user: {email}")

    # Create database connection
    engine = create_async_engine(settings.database_url, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        # Check if user already exists
        result = await session.execute(select(User).where(User.email == email))
        existing_user = result.scalar_one_or_none()

        if existing_user:
            # Update existing user to superadmin
            print(f"⚠️  User {email} already exists")
            print(f"   Current role: {existing_user.role}")

            if existing_user.role == UserRole.SUPERADMIN.value:
                print(f"✓ User is already a superadmin")
                # Update password anyway
                existing_user.password_hash = hash_password(password)
                await session.commit()
                print(f"✓ Password updated successfully")
            else:
                # Upgrade to superadmin
                existing_user.role = UserRole.SUPERADMIN.value
                existing_user.password_hash = hash_password(password)
                existing_user.active = True
                await session.commit()
                print(f"✓ User upgraded to superadmin")
                print(f"✓ Password updated")
                print(f"✓ Account activated")
        else:
            # Create new superadmin user
            new_user = User(
                email=email,
                password_hash=hash_password(password),
                role=UserRole.SUPERADMIN.value,
                active=True,
            )
            session.add(new_user)
            await session.commit()
            await session.refresh(new_user)
            print(f"✓ Superadmin user created successfully")
            print(f"   User ID: {new_user.id}")

    await engine.dispose()

    print()
    print("=" * 60)
    print("Superadmin user is ready!")
    print("=" * 60)
    print()
    print("You can now:")
    print(f"  1. Login at /api/auth/login with:")
    print(f"     Email: {email}")
    print(f"     Password: [your password]")
    print()
    print(f"  2. Create registration codes at /api/admin/codes")
    print()
    print(f"  3. Access API documentation at /docs")
    print(f"     (Use DOCS_USERNAME and DOCS_PASSWORD in production)")
    print()


def main():
    """Main entry point."""
    try:
        asyncio.run(create_superadmin())
    except KeyboardInterrupt:
        print()
        print("❌ Cancelled by user")
        sys.exit(1)
    except Exception as e:
        print()
        print(f"❌ Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
