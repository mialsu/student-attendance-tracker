"""Attendance Record Pydantic schemas."""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.student import StudentInAttendance

# The attendance summary's four orders (spec 0010 decision 13), declared once, in the leaf both
# the route and the service import. The route refuses any other value with 422. Until spec 0010
# the parameter was a plain `str` and the service read every value it did not know as name_asc,
# so a typo answered 200 in an order nobody chose.
SummarySortKey = Literal["attendance_desc", "attendance_asc", "name_asc", "name_desc"]


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
    legacy_hidden: int = Field(
        0,
        description=(
            "Legacy students hidden by the five-year cutoff under the current filters. "
            "0 when legacy=true, or when nothing is old enough to hide."
        ),
    )


class DailyStatistic(BaseModel):
    """Daily attendance statistic."""

    date: str = Field(..., description="Date in ISO format (YYYY-MM-DD)")
    count: int = Field(..., description="Total attendance count for this day")


class MonthlyStatistic(BaseModel):
    """Monthly attendance statistic."""

    year_month: str = Field(..., description="Year and month in format YYYY-MM")
    count: int = Field(..., description="Total attendance count for this month")


class AttendanceStatistics(BaseModel):
    """Attendance statistics aggregated by date and month."""

    total_records: int = Field(..., description="Total number of attendance records")
    total_students: int = Field(..., description="Total number of unique students")
    first_date: str | None = Field(None, description="First attendance date (ISO format)")
    last_date: str | None = Field(None, description="Last attendance date (ISO format)")
    daily_stats: list[DailyStatistic] = Field(..., description="Attendance grouped by day")
    monthly_stats: list[MonthlyStatistic] = Field(..., description="Attendance grouped by month")
