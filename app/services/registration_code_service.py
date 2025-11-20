"""Registration code service for controlled user signup."""

import secrets
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BadRequestException, NotFoundError
from app.models.registration_code import RegistrationCode
from app.models.user import User


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
    email_restriction: str,
) -> RegistrationCode:
    """
    Create a new registration code.

    Args:
        db: Database session
        creator: User creating the code (must be superadmin)
        email_restriction: Email that can use this code (required)

    Returns:
        Created RegistrationCode instance

    Raises:
        BadRequestException: If email already has an unused code
    """
    # Check if email already has an unused code
    result = await db.execute(
        select(RegistrationCode).where(
            RegistrationCode.email_restriction == email_restriction,
            RegistrationCode.used == False,
        )
    )
    existing_code = result.scalar_one_or_none()
    if existing_code:
        raise BadRequestException(
            f"An unused registration code already exists for {email_restriction}"
        )

    code = RegistrationCode(
        code=generate_code(),
        email_restriction=email_restriction,
        created_by_user_id=creator.id,
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
        BadRequestException: If code is invalid, used, revoked, or email doesn't match
    """
    reg_code = await get_registration_code(db, code)

    if not reg_code:
        raise BadRequestException("Invalid registration code")

    if reg_code.used:
        raise BadRequestException("Registration code already used")

    if reg_code.revoked:
        raise BadRequestException("Registration code has been revoked")

    if reg_code.email_restriction != email:
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
