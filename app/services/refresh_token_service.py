"""Refresh token service for token rotation security."""

import hashlib
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.refresh_token import RefreshToken


def hash_token(token: str) -> str:
    """Hash a token using SHA-256 for secure storage."""
    return hashlib.sha256(token.encode()).hexdigest()


async def store_refresh_token(
    db: AsyncSession,
    user_id: uuid.UUID,
    token: str,
) -> RefreshToken:
    """Store a refresh token in the database."""
    token_hash = hash_token(token)
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)

    refresh_token = RefreshToken(
        user_id=user_id,
        token_hash=token_hash,
        expires_at=expires_at,
        revoked=False,
    )
    db.add(refresh_token)
    await db.commit()
    await db.refresh(refresh_token)
    return refresh_token


async def validate_refresh_token(db: AsyncSession, token: str) -> RefreshToken | None:
    """
    Validate a refresh token.

    Returns token if valid (not revoked, not expired), None otherwise.
    """
    token_hash = hash_token(token)
    result = await db.execute(
        select(RefreshToken).where(
            RefreshToken.token_hash == token_hash,
            RefreshToken.revoked == False,  # noqa: E712
            RefreshToken.expires_at > datetime.now(timezone.utc),
        )
    )
    return result.scalar_one_or_none()


async def revoke_token(db: AsyncSession, token: str) -> None:
    """Revoke a refresh token (for logout and token rotation)."""
    token_hash = hash_token(token)
    result = await db.execute(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
    refresh_token = result.scalar_one_or_none()

    if refresh_token:
        refresh_token.revoked = True
        refresh_token.revoked_at = datetime.now(timezone.utc)
        await db.commit()


async def revoke_all_user_tokens(db: AsyncSession, user_id: uuid.UUID) -> None:
    """Revoke all refresh tokens for a user (logout from all devices)."""
    result = await db.execute(
        select(RefreshToken).where(
            RefreshToken.user_id == user_id, RefreshToken.revoked == False  # noqa: E712
        )
    )
    tokens = result.scalars().all()

    now = datetime.now(timezone.utc)
    for token in tokens:
        token.revoked = True
        token.revoked_at = now

    await db.commit()


async def cleanup_expired_tokens(db: AsyncSession) -> int:
    """Delete expired tokens from database (cleanup job)."""
    result = await db.execute(
        delete(RefreshToken).where(RefreshToken.expires_at < datetime.now(timezone.utc))
    )
    await db.commit()
    return result.rowcount
