"""Attendance Record Pydantic schemas."""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class AttendanceRecordBase(BaseModel):
    """Base attendance record schema."""

    student_first_name: str = Field(..., min_length=1, max_length=100)
    student_last_name: str = Field(..., min_length=1, max_length=100)
    timestamp: datetime


class AttendanceRecordCreate(BaseModel):
    """Schema for creating a new attendance record."""

    student_first_name: str = Field(..., min_length=1, max_length=100)
    student_last_name: str = Field(..., min_length=1, max_length=100)
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class AttendanceRecordResponse(AttendanceRecordBase):
    """Schema for attendance record response."""

    id: uuid.UUID
    class_id: uuid.UUID
    created_at: datetime
    total_attendance: int | None = None  # Total attendance count for this student

    model_config = {"from_attributes": True}


class AttendanceRecordInSummary(BaseModel):
    """Minimal attendance record for summary."""

    id: uuid.UUID
    timestamp: datetime

    model_config = {"from_attributes": True}


class AttendanceSummary(BaseModel):
    """Schema for attendance summary by student."""

    student_first_name: str
    student_last_name: str
    total_attendance: int
    records: list[AttendanceRecordInSummary]


class PaginatedAttendanceResponse(BaseModel):
    """Paginated response for attendance records."""

    items: list[AttendanceRecordResponse]
    total: int = Field(..., description="Total number of items matching the filters")
    skip: int = Field(..., description="Number of items skipped (offset)")
    limit: int = Field(..., description="Maximum number of items per page")
