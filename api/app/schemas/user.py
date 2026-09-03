"""User (Teacher) Pydantic schemas."""

import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class UserBase(BaseModel):
    """Base user schema."""

    email: EmailStr


class UserCreate(UserBase):
    """Schema for creating a new user (signup)."""

    password: str = Field(..., min_length=8, description="Password (minimum 8 characters)")
    registration_code: str = Field(..., min_length=1, description="Registration code")


class UserLogin(UserBase):
    """Schema for user login."""

    password: str


class UserResponse(UserBase):
    """Schema for user response."""

    id: uuid.UUID
    active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class EmailUpdate(BaseModel):
    """Schema for updating email."""

    new_email: EmailStr
    current_password: str


class PasswordUpdate(BaseModel):
    """Schema for updating password."""

    current_password: str
    new_password: str = Field(..., min_length=8, description="New password (minimum 8 characters)")
