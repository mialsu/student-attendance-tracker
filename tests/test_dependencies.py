"""Tests for FastAPI dependency functions."""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user
from app.core.exceptions import UnauthorizedException
from app.core.security import create_access_token, create_refresh_token
from app.models.user import User


@pytest.mark.asyncio
class TestGetCurrentUser:
    """Tests for get_current_user dependency."""

    async def test_get_current_user_success(
        self, db: AsyncSession, test_user: User
    ):
        """Test successful user retrieval from token."""
        # Create access token
        token = create_access_token(
            data={"sub": test_user.email, "user_id": str(test_user.id)}
        )
        authorization = f"Bearer {token}"

        # Get current user
        user = await get_current_user(authorization=authorization, db=db)

        assert user.id == test_user.id
        assert user.email == test_user.email

    async def test_get_current_user_no_header(self, db: AsyncSession):
        """Test with missing authorization header."""
        with pytest.raises(UnauthorizedException) as exc:
            await get_current_user(authorization=None, db=db)

        assert "missing" in str(exc.value.detail).lower()

    async def test_get_current_user_invalid_scheme(self, db: AsyncSession):
        """Test with invalid authentication scheme (not Bearer)."""
        with pytest.raises(UnauthorizedException) as exc:
            await get_current_user(authorization="Basic token123", db=db)

        assert "scheme" in str(exc.value.detail).lower()

    async def test_get_current_user_invalid_format(self, db: AsyncSession):
        """Test with invalid authorization header format."""
        with pytest.raises(UnauthorizedException) as exc:
            await get_current_user(authorization="InvalidFormatNoSpace", db=db)

        assert "format" in str(exc.value.detail).lower()

    async def test_get_current_user_invalid_token(self, db: AsyncSession):
        """Test with invalid token."""
        with pytest.raises(UnauthorizedException) as exc:
            await get_current_user(authorization="Bearer invalid.token.here", db=db)

        assert "invalid" in str(exc.value.detail).lower() or "expired" in str(
            exc.value.detail
        ).lower()

    async def test_get_current_user_refresh_token(
        self, db: AsyncSession, test_user: User
    ):
        """Test with refresh token instead of access token."""
        # Create refresh token (wrong type)
        token = create_refresh_token(
            data={"sub": test_user.email, "user_id": str(test_user.id)}
        )
        authorization = f"Bearer {token}"

        with pytest.raises(UnauthorizedException) as exc:
            await get_current_user(authorization=authorization, db=db)

        assert "token type" in str(exc.value.detail).lower()

    async def test_get_current_user_token_missing_email(self, db: AsyncSession):
        """Test with token missing email (sub claim)."""
        from app.core.security import create_access_token as _create_token
        from jose import jwt
        from datetime import datetime, timedelta, timezone
        from app.config import settings

        # Create token without sub claim
        payload = {
            "type": "access",
            "exp": datetime.now(timezone.utc) + timedelta(minutes=15),
        }
        token = jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)
        authorization = f"Bearer {token}"

        with pytest.raises(UnauthorizedException) as exc:
            await get_current_user(authorization=authorization, db=db)

        assert "missing" in str(exc.value.detail).lower() or "information" in str(
            exc.value.detail
        ).lower()

    async def test_get_current_user_not_found(self, db: AsyncSession):
        """Test with valid token but user doesn't exist in database."""
        # Create token for non-existent user
        token = create_access_token(
            data={"sub": "nonexistent@example.com", "user_id": "00000000-0000-0000-0000-000000000000"}
        )
        authorization = f"Bearer {token}"

        with pytest.raises(UnauthorizedException) as exc:
            await get_current_user(authorization=authorization, db=db)

        assert "not found" in str(exc.value.detail).lower()

    async def test_get_current_user_inactive(
        self, db: AsyncSession, inactive_user: User
    ):
        """Test with inactive user."""
        # Create token for inactive user
        token = create_access_token(
            data={"sub": inactive_user.email, "user_id": str(inactive_user.id)}
        )
        authorization = f"Bearer {token}"

        with pytest.raises(UnauthorizedException) as exc:
            await get_current_user(authorization=authorization, db=db)

        assert "inactive" in str(exc.value.detail).lower()

    async def test_get_current_user_bearer_case_insensitive(
        self, db: AsyncSession, test_user: User
    ):
        """Test that Bearer scheme is case-insensitive."""
        token = create_access_token(
            data={"sub": test_user.email, "user_id": str(test_user.id)}
        )
        # Use lowercase "bearer"
        authorization = f"bearer {token}"

        user = await get_current_user(authorization=authorization, db=db)

        assert user.id == test_user.id
