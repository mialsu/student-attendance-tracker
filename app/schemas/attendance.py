"""Attendance Record Pydantic schemas."""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class AttendanceRecordBase(BaseModel):
    """Base attendance record schema."""

    student_first_name: str = Field(..., min_length=1, max_length=100)
    student_last_name: str = Field(..., min_length=1, max_length=100)
    timestamp: datetime


class AttendanceRecordCreate(AttendanceRecordBase):
    """Schema for creating a new attendance record."""

    pass


class AttendanceRecordResponse(AttendanceRecordBase):
    """Schema for attendance record response."""

    id: uuid.UUID
    class_id: uuid.UUID
    created_at: datetime

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
