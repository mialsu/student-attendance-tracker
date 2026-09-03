"""Authentication Pydantic schemas."""

from pydantic import BaseModel

from app.schemas.user import UserResponse


class Token(BaseModel):
    """Internal token model (used by service layer)."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserResponse


class TokenResponse(BaseModel):
    """Token response for API (refresh token in cookie)."""

    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class TokenRefreshResponse(BaseModel):
    """Token refresh response (only access token)."""

    access_token: str
    token_type: str = "bearer"
