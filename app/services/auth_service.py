"""Authentication service - Business logic for user authentication."""

from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AuthenticationError, DuplicateError, NotFoundError
from app.core.security import create_access_token, create_refresh_token, hash_password, verify_password
from app.models.user import User
from app.schemas.auth import Token
from app.schemas.user import UserCreate


async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    """
    Retrieve a user by email address.

    Args:
        db: Database session
        email: User's email address

    Returns:
        User object if found, None otherwise
    """
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def get_user_by_id(db: AsyncSession, user_id: str) -> User | None:
    """
    Retrieve a user by ID.

    Args:
        db: Database session
        user_id: User's UUID

    Returns:
        User object if found, None otherwise
    """
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def authenticate_user(db: AsyncSession, email: str, password: str) -> User:
    """
    Authenticate a user with email and password.

    Args:
        db: Database session
        email: User's email
        password: User's password

    Returns:
        Authenticated user

    Raises:
        AuthenticationError: If credentials are invalid or user is inactive
    """
    user = await get_user_by_email(db, email)
    
    if not user:
        raise AuthenticationError("Invalid email or password")
    
    if not user.active:
        raise AuthenticationError("Account is inactive. Please contact support.")
    
    if not verify_password(password, user.password_hash):
        raise AuthenticationError("Invalid email or password")
    
    return user


async def create_user(db: AsyncSession, user_data: UserCreate) -> User:
    """
    Create a new user account.

    Args:
        db: Database session
        user_data: User creation data

    Returns:
        Created user

    Raises:
        DuplicateError: If email already exists
    """
    # Check if email already exists
    existing_user = await get_user_by_email(db, user_data.email)
    if existing_user:
        raise DuplicateError("Email already registered")
    
    # Hash password
    hashed_password = hash_password(user_data.password)
    
    # Create user
    user = User(
        email=user_data.email,
        password_hash=hashed_password,
        active=True,
    )
    
    db.add(user)
    await db.commit()
    await db.refresh(user)
    
    return user


async def create_tokens_for_user(user: User) -> Token:
    """
    Create access and refresh tokens for a user.

    Args:
        user: User object

    Returns:
        Token response with access and refresh tokens
    """
    from app.schemas.user import UserResponse
    
    access_token = create_access_token(
        data={"sub": user.email, "user_id": str(user.id)}
    )
    refresh_token = create_refresh_token(
        data={"sub": user.email, "user_id": str(user.id)}
    )
    
    return Token(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        user=UserResponse.model_validate(user),
    )


async def update_user_email(
    db: AsyncSession,
    user: User,
    new_email: str,
    current_password: str,
) -> User:
    """
    Update user's email address.

    Args:
        db: Database session
        user: Current user
        new_email: New email address
        current_password: Current password for verification

    Returns:
        Updated user

    Raises:
        AuthenticationError: If password is incorrect
        DuplicateError: If new email is already taken
    """
    # Verify current password
    if not verify_password(current_password, user.password_hash):
        raise AuthenticationError("Invalid password")
    
    # Check if new email is already taken
    if new_email != user.email:
        existing_user = await get_user_by_email(db, new_email)
        if existing_user:
            raise DuplicateError("Email already in use")
    
    # Update email
    user.email = new_email
    user.updated_at = datetime.now(timezone.utc)
    
    await db.commit()
    await db.refresh(user)
    
    return user


async def update_user_password(
    db: AsyncSession,
    user: User,
    current_password: str,
    new_password: str,
) -> User:
    """
    Update user's password.

    Args:
        db: Database session
        user: Current user
        current_password: Current password for verification
        new_password: New password

    Returns:
        Updated user

    Raises:
        AuthenticationError: If current password is incorrect
    """
    # Verify current password
    if not verify_password(current_password, user.password_hash):
        raise AuthenticationError("Invalid current password")
    
    # Hash new password
    user.password_hash = hash_password(new_password)
    user.updated_at = datetime.now(timezone.utc)
    
    await db.commit()
    await db.refresh(user)
    
    return user

