"""Registration code Pydantic schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr


class CreateCodeRequest(BaseModel):
    """Schema for creating a registration code."""

    # Required — INV-7. There is no universal code, so there is no default to fall back to.
    email_restriction: EmailStr


class CodeResponse(BaseModel):
    """Schema for registration code response."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    code: str
    email_restriction: str
    used: bool
    revoked: bool
    used_by_user_id: UUID | None
    used_at: datetime | None
    created_at: datetime
    expires_at: datetime
