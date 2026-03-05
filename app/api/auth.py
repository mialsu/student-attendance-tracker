"""Authentication API endpoints."""

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.exceptions import AuthenticationError
from app.core.security import decode_token
from app.database import get_db
from app.dependencies import CurrentUser
from app.schemas.auth import TokenRefreshResponse, TokenResponse
from app.schemas.user import EmailUpdate, PasswordUpdate, UserCreate, UserLogin, UserResponse
from app.services import auth_service, refresh_token_service, registration_code_service

router = APIRouter()


@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def signup(
    response: Response,
    user_data: UserCreate,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """
    Create a new user account.

    Args:
        response: FastAPI response object
        user_data: User registration data (email, password, registration_code)
        db: Database session

    Returns:
        TokenResponse: Access token and user data (refresh token in cookie)

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
    tokens = await auth_service.create_tokens_for_user(user, db)

    # Set refresh token as HTTP-only cookie
    response.set_cookie(
        key="refresh_token",
        value=tokens.refresh_token,
        max_age=settings.refresh_token_expire_days * 24 * 60 * 60,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        domain=settings.cookie_domain,
    )

    # Return only access token in JSON
    return TokenResponse(
        access_token=tokens.access_token,
        token_type=tokens.token_type,
        user=tokens.user,
    )


@router.post("/login", response_model=TokenResponse)
async def login(
    response: Response,
    credentials: UserLogin,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """
    Login with email and password.

    Args:
        response: FastAPI response object
        credentials: Login credentials (email, password)
        db: Database session

    Returns:
        TokenResponse: Access token and user data (refresh token in cookie)

    Raises:
        401: If credentials are invalid or account is inactive
    """
    # Authenticate user
    user = await auth_service.authenticate_user(db, credentials.email, credentials.password)

    # Generate tokens
    tokens = await auth_service.create_tokens_for_user(user, db)

    # Set refresh token as HTTP-only cookie
    response.set_cookie(
        key="refresh_token",
        value=tokens.refresh_token,
        max_age=settings.refresh_token_expire_days * 24 * 60 * 60,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        domain=settings.cookie_domain,
    )

    # Return only access token in JSON
    return TokenResponse(
        access_token=tokens.access_token,
        token_type=tokens.token_type,
        user=tokens.user,
    )


@router.post("/refresh", response_model=TokenRefreshResponse)
async def refresh_token(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> TokenRefreshResponse:
    """
    Refresh access token using refresh token from cookie.

    Args:
        request: FastAPI request object (to read cookies)
        response: FastAPI response object (to set new cookie)
        db: Database session

    Returns:
        TokenRefreshResponse: New access token (refresh token in cookie)

    Raises:
        401: If refresh token is invalid, expired, or revoked
    """
    # Read refresh token from cookie (NOT body)
    refresh_token = request.cookies.get("refresh_token")
    if not refresh_token:
        raise AuthenticationError("Refresh token not found")

    # Validate refresh token exists in database (not revoked)
    stored_token = await refresh_token_service.validate_refresh_token(db, refresh_token)
    if not stored_token:
        raise AuthenticationError("Invalid or revoked refresh token")

    # Decode and validate JWT token
    payload = decode_token(refresh_token)
    if not payload:
        raise AuthenticationError("Invalid or expired refresh token")

    if payload.get("type") != "refresh":
        raise AuthenticationError("Invalid token type")

    # Get user
    email: str | None = payload.get("sub")
    if not email:
        raise AuthenticationError("Token missing user information")

    user = await auth_service.get_user_by_email(db, email)
    if not user or not user.active:
        raise AuthenticationError("User not found or inactive")

    # Revoke old refresh token (TOKEN ROTATION)
    await refresh_token_service.revoke_token(db, refresh_token)

    # Generate new tokens (this will store new refresh token)
    tokens = await auth_service.create_tokens_for_user(user, db)

    # Set new refresh token cookie (TOKEN ROTATION)
    response.set_cookie(
        key="refresh_token",
        value=tokens.refresh_token,
        max_age=settings.refresh_token_expire_days * 24 * 60 * 60,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        domain=settings.cookie_domain,
    )

    # Return only access token
    return TokenRefreshResponse(
        access_token=tokens.access_token,
        token_type=tokens.token_type,
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    request: Request,
    response: Response,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> None:
    """
    Logout current user and revoke refresh token.

    Args:
        request: FastAPI request object (to read cookies)
        response: FastAPI response object (to clear cookie)
        current_user: Current authenticated user
        db: Database session

    Returns:
        None: No content
    """
    # Get refresh token from cookie
    refresh_token = request.cookies.get("refresh_token")

    # Revoke the refresh token if present
    if refresh_token:
        await refresh_token_service.revoke_token(db, refresh_token)

    # Clear refresh token cookie
    response.delete_cookie(
        key="refresh_token",
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        domain=settings.cookie_domain,
    )

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

