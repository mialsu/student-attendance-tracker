"""Pydantic schemas for request/response validation."""

from app.schemas.attendance import (
    AttendanceRecordCreate,
    AttendanceRecordResponse,
    AttendanceSummary,
)
from app.schemas.auth import Token, TokenRefreshResponse, TokenResponse
from app.schemas.class_ import ClassCreate, ClassResponse, ClassUpdate
from app.schemas.registration_code import CodeResponse, CreateCodeRequest
from app.schemas.user import (
    EmailUpdate,
    PasswordUpdate,
    UserCreate,
    UserLogin,
    UserResponse,
)

__all__ = [
    "UserCreate",
    "UserLogin",
    "UserResponse",
    "EmailUpdate",
    "PasswordUpdate",
    "Token",
    "TokenResponse",
    "TokenRefreshResponse",
    "ClassCreate",
    "ClassUpdate",
    "ClassResponse",
    "AttendanceRecordCreate",
    "AttendanceRecordResponse",
    "AttendanceSummary",
    "CreateCodeRequest",
    "CodeResponse",
]
