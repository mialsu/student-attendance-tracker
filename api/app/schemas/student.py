"""Student Pydantic schemas."""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class StudentBase(BaseModel):
    """Base student schema."""

    name: str = Field(
        ...,
        min_length=1,
        max_length=200,
        description="Student full name (e.g., 'John Doe')",
    )
    course_credit_received: bool = Field(
        default=False, description="Whether the student received course credit"
    )


class StudentCreate(StudentBase):
    """Schema for creating a new student."""

    pass


class StudentUpdate(BaseModel):
    """Schema for updating a student."""

    name: str | None = Field(None, min_length=1, max_length=200)
    course_credit_received: bool | None = None


class StudentInAttendance(BaseModel):
    """Minimal student info for attendance records."""

    id: uuid.UUID
    name: str
    course_credit_received: bool

    model_config = {"from_attributes": True}


class StudentResponse(StudentBase):
    """Schema for student response."""

    id: uuid.UUID
    class_id: uuid.UUID
    created_at: datetime
    updated_at: datetime | None
    total_attendance: int | None = Field(None, description="Total attendance count")

    model_config = {"from_attributes": True}


class PaginatedStudentResponse(BaseModel):
    """Paginated response for students."""

    items: list[StudentResponse]
    total: int = Field(..., description="Total number of items")
    skip: int
    limit: int


class StudentAutocomplete(BaseModel):
    """Autocomplete suggestion with attendance count."""

    id: uuid.UUID
    name: str
    total_attendance: int

    model_config = {"from_attributes": True}


class StudentMergeRequest(BaseModel):
    """Request to merge duplicate student into current student."""

    duplicate_student_id: uuid.UUID = Field(
        ..., description="ID of duplicate student to merge from (will be deleted)"
    )
