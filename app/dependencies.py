"""FastAPI dependency injection functions."""

from typing import Annotated

from fastapi import Depends, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ForbiddenException, UnauthorizedException
from app.core.security import decode_token
from app.database import get_db
from app.models.user import User, UserRole


async def get_current_user(
    authorization: Annotated[str | None, Header()] = None,
    db: AsyncSession = Depends(get_db),
) -> User:
    """
    Get the current authenticated user from JWT token.

    Args:
        authorization: Authorization header with Bearer token
        db: Database session

    Returns:
        User: Current authenticated user

    Raises:
        UnauthorizedException: If token is invalid or user not found
    """
    if not authorization:
        raise UnauthorizedException(detail="Authorization header missing")

    # Extract token from "Bearer <token>"
    try:
        scheme, token = authorization.split()
        if scheme.lower() != "bearer":
            raise UnauthorizedException(detail="Invalid authentication scheme")
    except ValueError:
        raise UnauthorizedException(detail="Invalid authorization header format")

    # Decode token
    payload = decode_token(token)
    if not payload:
        raise UnauthorizedException(detail="Invalid or expired token")

    # Verify token type
    if payload.get("type") != "access":
        raise UnauthorizedException(detail="Invalid token type")

    # Get user email from token
    email: str | None = payload.get("sub")
    if not email:
        raise UnauthorizedException(detail="Token missing user information")

    # Fetch user from database
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if not user:
        raise UnauthorizedException(detail="User not found")
    
    # Check if user is active
    if not user.active:
        raise UnauthorizedException(detail="Account is inactive")

    return user


async def require_superadmin(
    current_user: User = Depends(get_current_user),
) -> User:
    """
    Require current user to be a superadmin.

    Args:
        current_user: Current authenticated user

    Returns:
        User: Current user (if superadmin)

    Raises:
        ForbiddenException: If user is not a superadmin
    """
    if current_user.role != UserRole.SUPERADMIN.value:
        raise ForbiddenException(detail="Superadmin access required")
    return current_user


# Type alias for dependency injection
CurrentUser = Annotated[User, Depends(get_current_user)]
SuperadminUser = Annotated[User, Depends(require_superadmin)]
