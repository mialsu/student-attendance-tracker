"""Class (Course) Pydantic schemas."""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class ClassBase(BaseModel):
    """Base class schema."""

    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None


class ClassCreate(ClassBase):
    """Schema for creating a new class."""

    pass


class ClassUpdate(BaseModel):
    """Schema for updating a class."""

    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    active: bool | None = None


class ClassResponse(ClassBase):
    """Schema for class response."""

    id: uuid.UUID
    teacher_id: uuid.UUID
    active: bool
    created_at: datetime
    updated_at: datetime | None
    attendance_count: int | None = None

    model_config = {"from_attributes": True}
