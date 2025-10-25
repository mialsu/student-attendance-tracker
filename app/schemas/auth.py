"""Authentication Pydantic schemas."""

from pydantic import BaseModel

from app.schemas.user import UserResponse


class Token(BaseModel):
    """Schema for token response."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserResponse


class TokenRefresh(BaseModel):
    """Schema for token refresh request."""

    refresh_token: str
