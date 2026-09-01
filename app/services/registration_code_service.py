"""Registration code service for controlled user signup."""

import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BadRequestException, NotFoundError
from app.models.registration_code import RegistrationCode
from app.models.user import User

# How long a registration code stays redeemable, from the moment it is issued.
#
# Deliberately a constant and not configuration: a security-relevant window that differs per
# environment, invisibly, is worse than one that takes a commit to change (ADR-0003's spec,
# `specs/0001-registration-code-cli-and-role-removal.md`).
CODE_LIFETIME = timedelta(hours=24)


def generate_code() -> str:
    """
    Generate a secure random 16-character registration code.

    Returns:
        A 16-character URL-safe string
    """
    # token_urlsafe(12) generates ~16 chars (12 bytes * 4/3 for base64)
    # We take exactly 16 chars to ensure consistent length
    return secrets.token_urlsafe(12)[:16]


async def create_registration_code(
    db: AsyncSession,
    creator: User,
    email_restriction: str | None = None,
) -> RegistrationCode:
    """
    Create a new registration code.

    Args:
        db: Database session
        creator: User creating the code (must be superadmin)
        email_restriction: Email that can use this code (None = universal code)

    Returns:
        Created RegistrationCode instance

    Raises:
        BadRequestException: If email already has a code that is still redeemable
    """
    now = datetime.now(timezone.utc)

    # Refuse a second live code for one address (only for email-restricted codes). An EXPIRED
    # code is still unused and unrevoked, so it must be excluded here or one expired code would
    # block that address forever.
    if email_restriction is not None:
        result = await db.execute(
            select(RegistrationCode).where(
                RegistrationCode.email_restriction == email_restriction,
                RegistrationCode.used == False,
                RegistrationCode.revoked == False,
                RegistrationCode.expires_at > now,
            )
        )
        existing_code = result.scalar_one_or_none()
        if existing_code:
            raise BadRequestException(
                f"A valid registration code already exists for {email_restriction}"
            )

    code = RegistrationCode(
        code=generate_code(),
        email_restriction=email_restriction,
        created_by_user_id=creator.id,
        expires_at=now + CODE_LIFETIME,
    )
    db.add(code)
    await db.commit()
    await db.refresh(code)
    return code


async def get_registration_code(
    db: AsyncSession,
    code: str,
) -> RegistrationCode | None:
    """
    Get registration code by code string.

    Args:
        db: Database session
        code: The registration code string

    Returns:
        RegistrationCode if found, None otherwise
    """
    result = await db.execute(
        select(RegistrationCode).where(RegistrationCode.code == code)
    )
    return result.scalar_one_or_none()


async def validate_registration_code(
    db: AsyncSession,
    code: str,
    email: str,
) -> RegistrationCode:
    """
    Validate a registration code for use.

    Args:
        db: Database session
        code: The registration code string
        email: Email attempting to use the code

    Returns:
        Valid RegistrationCode instance

    Raises:
        BadRequestException: If code is invalid, used, revoked, expired, or email doesn't match
    """
    reg_code = await get_registration_code(db, code)

    if not reg_code:
        raise BadRequestException("Invalid registration code")

    # INV-6: used, revoked and expired are the three states a code never comes back from. This
    # is the one place that decides whether a code may be redeemed.
    if reg_code.used:
        raise BadRequestException("Registration code already used")

    if reg_code.revoked:
        raise BadRequestException("Registration code has been revoked")

    if reg_code.expires_at <= datetime.now(timezone.utc):
        raise BadRequestException("Registration code has expired")

    # Check email restriction (None = universal code)
    if reg_code.email_restriction is not None and reg_code.email_restriction != email:
        raise BadRequestException("This registration code is not valid for your email")

    return reg_code


async def mark_code_as_used(
    db: AsyncSession,
    code: RegistrationCode,
    user: User,
) -> None:
    """
    Mark a registration code as used.

    Args:
        db: Database session
        code: The registration code to mark as used
        user: User who used the code
    """
    code.used = True
    code.used_by_user_id = user.id
    code.used_at = datetime.now(timezone.utc)
    await db.commit()


async def delete_code(
    db: AsyncSession,
    code_id: str,
) -> None:
    """
    Delete a registration code.

    Args:
        db: Database session
        code_id: ID of the code to delete

    Raises:
        NotFoundError: If code not found
        BadRequestException: If code has already been used
    """
    result = await db.execute(
        select(RegistrationCode).where(RegistrationCode.id == code_id)
    )
    code = result.scalar_one_or_none()
    if not code:
        raise NotFoundError("Registration code not found")

    if code.used:
        raise BadRequestException("Cannot delete a code that has already been used")

    await db.delete(code)
    await db.commit()


async def revoke_code(
    db: AsyncSession,
    code_id: str,
) -> RegistrationCode:
    """
    Revoke a registration code (soft delete).

    Args:
        db: Database session
        code_id: ID of the code to revoke

    Returns:
        The revoked registration code

    Raises:
        NotFoundError: If code not found
    """
    result = await db.execute(
        select(RegistrationCode).where(RegistrationCode.id == code_id)
    )
    code = result.scalar_one_or_none()
    if not code:
        raise NotFoundError("Registration code not found")

    code.revoked = True
    await db.commit()
    await db.refresh(code)
    return code


async def list_registration_codes(
    db: AsyncSession,
    skip: int = 0,
    limit: int = 100,
) -> list[RegistrationCode]:
    """
    List all registration codes.

    Args:
        db: Database session
        skip: Number of records to skip (for pagination)
        limit: Maximum number of records to return

    Returns:
        List of RegistrationCode instances
    """
    result = await db.execute(
        select(RegistrationCode)
        .offset(skip)
        .limit(limit)
        .order_by(RegistrationCode.created_at.desc())
    )
    return list(result.scalars().all())
