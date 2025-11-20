"""Authentication API endpoints."""

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AuthenticationError
from app.core.security import decode_token
from app.database import get_db
from app.dependencies import CurrentUser
from app.schemas.auth import Token, TokenRefresh
from app.schemas.user import EmailUpdate, PasswordUpdate, UserCreate, UserLogin, UserResponse
from app.services import auth_service, registration_code_service

router = APIRouter()


@router.post("/signup", response_model=Token, status_code=status.HTTP_201_CREATED)
async def signup(
    user_data: UserCreate,
    db: AsyncSession = Depends(get_db),
) -> Token:
    """
    Create a new user account.

    Args:
        user_data: User registration data (email, password, registration_code)
        db: Database session

    Returns:
        Token: Access and refresh tokens with user data

    Raises:
        400: If registration code is invalid, used, or revoked
        409: If email already exists
        422: If validation fails
    """
    # Validate registration code
    reg_code = await registration_code_service.validate_registration_code(
        db, user_data.registration_code, user_data.email
    )

    # Create user
    user = await auth_service.create_user(db, user_data)

    # Mark registration code as used
    await registration_code_service.mark_code_as_used(db, reg_code, user)

    # Generate tokens
    tokens = await auth_service.create_tokens_for_user(user)

    return tokens


@router.post("/login", response_model=Token)
async def login(
    credentials: UserLogin,
    db: AsyncSession = Depends(get_db),
) -> Token:
    """
    Login with email and password.

    Args:
        credentials: Login credentials (email, password)
        db: Database session

    Returns:
        Token: Access and refresh tokens with user data

    Raises:
        401: If credentials are invalid or account is inactive
    """
    # Authenticate user
    user = await auth_service.authenticate_user(
        db, credentials.email, credentials.password
    )
    
    # Generate tokens
    tokens = await auth_service.create_tokens_for_user(user)
    
    return tokens


@router.post("/refresh", response_model=Token)
async def refresh_token(
    token_data: TokenRefresh,
    db: AsyncSession = Depends(get_db),
) -> Token:
    """
    Refresh access token using refresh token.

    Args:
        token_data: Refresh token
        db: Database session

    Returns:
        Token: New access and refresh tokens

    Raises:
        401: If refresh token is invalid or expired
    """
    # Decode refresh token
    payload = decode_token(token_data.refresh_token)
    if not payload:
        raise AuthenticationError("Invalid or expired refresh token")
    
    # Verify token type
    if payload.get("type") != "refresh":
        raise AuthenticationError("Invalid token type")
    
    # Get user email
    email: str | None = payload.get("sub")
    if not email:
        raise AuthenticationError("Token missing user information")
    
    # Get user from database
    user = await auth_service.get_user_by_email(db, email)
    if not user:
        raise AuthenticationError("User not found")
    
    if not user.active:
        raise AuthenticationError("Account is inactive")
    
    # Generate new tokens
    tokens = await auth_service.create_tokens_for_user(user)
    
    return tokens


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    current_user: CurrentUser,
) -> None:
    """
    Logout current user.

    Note: With JWT tokens, logout is handled client-side by removing tokens.
    This endpoint exists for consistency and future token blacklisting.

    Args:
        current_user: Current authenticated user

    Returns:
        None: No content
    """
    # In a stateless JWT implementation, logout is handled client-side
    # by removing tokens from storage.
    # 
    # For added security, you could:
    # 1. Implement token blacklisting with Redis
    # 2. Track active sessions in database
    # 3. Add token revocation list
    #
    # For now, this is a placeholder that validates the token is valid.
    return None


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: CurrentUser,
) -> UserResponse:
    """
    Get current authenticated user information.

    Args:
        current_user: Current authenticated user

    Returns:
        UserResponse: Current user data

    Raises:
        401: If token is invalid or missing
    """
    return UserResponse.model_validate(current_user)


@router.put("/email", response_model=UserResponse)
async def update_email(
    email_data: EmailUpdate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    """
    Update user's email address.

    Args:
        email_data: New email and current password
        current_user: Current authenticated user
        db: Database session

    Returns:
        UserResponse: Updated user data

    Raises:
        401: If current password is incorrect
        409: If new email is already taken
    """
    user = await auth_service.update_user_email(
        db,
        current_user,
        email_data.new_email,
        email_data.current_password,
    )
    
    return UserResponse.model_validate(user)


@router.put("/password", status_code=status.HTTP_204_NO_CONTENT)
async def update_password(
    password_data: PasswordUpdate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> None:
    """
    Update user's password.

    Args:
        password_data: Current and new password
        current_user: Current authenticated user
        db: Database session

    Returns:
        None: No content

    Raises:
        401: If current password is incorrect
        422: If new password doesn't meet requirements
    """
    await auth_service.update_user_password(
        db,
        current_user,
        password_data.current_password,
        password_data.new_password,
    )
    
    return None

