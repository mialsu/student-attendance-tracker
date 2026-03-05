"""Attendance Record Pydantic schemas."""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.student import StudentInAttendance


class AttendanceRecordBase(BaseModel):
    """Base attendance record schema."""

    student_name: str = Field(..., min_length=1, max_length=200)
    timestamp: datetime


class AttendanceRecordCreate(BaseModel):
    """Schema for creating a new attendance record."""

    student_name: str = Field(..., min_length=1, max_length=200)
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    quantity: int = Field(
        default=1,
        ge=1,
        le=50,
        description="Number of attendance records to create (1-50). "
                   "All records share the same student and timestamp."
    )


class AttendanceRecordResponse(BaseModel):
    """Schema for attendance record response."""

    id: uuid.UUID
    class_id: uuid.UUID
    timestamp: datetime
    created_at: datetime

    # NEW: Full student object
    student: StudentInAttendance

    # DEPRECATED: Backward compatibility (computed from student.name)
    student_first_name: str | None = Field(
        None, description="DEPRECATED: Use student.name instead"
    )
    student_last_name: str | None = Field(
        None, description="DEPRECATED: Use student.name instead"
    )
    student_name: str | None = Field(
        None, description="Full student name for backward compatibility"
    )

    total_attendance: int | None = None  # Total attendance count for this student

    # NEW: Bulk creation metadata (None for single record)
    quantity_created: int | None = Field(
        None,
        description="Number of records created in bulk operation. "
                   "None for single record creation."
    )

    model_config = {"from_attributes": True}


class AttendanceRecordInSummary(BaseModel):
    """Minimal attendance record for summary."""

    id: uuid.UUID
    timestamp: datetime

    model_config = {"from_attributes": True}


class AttendanceSummary(BaseModel):
    """Schema for attendance summary by student."""

    student_id: uuid.UUID
    student_name: str
    course_credit_received: bool
    total_attendance: int
    records: list[AttendanceRecordInSummary]


class PaginatedAttendanceResponse(BaseModel):
    """Paginated response for attendance records."""

    items: list[AttendanceRecordResponse]
    total: int = Field(..., description="Total number of items matching the filters")
    skip: int = Field(..., description="Number of items skipped (offset)")
    limit: int = Field(..., description="Maximum number of items per page")


class PaginatedAttendanceSummaryResponse(BaseModel):
    """Paginated response for attendance summary."""

    items: list[AttendanceSummary]
    total: int = Field(..., description="Total number of matching students")
    skip: int = Field(..., description="Number of items skipped (offset)")
    limit: int = Field(..., description="Number of items per page")
