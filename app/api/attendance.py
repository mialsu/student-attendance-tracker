"""Attendance API endpoints - Track student attendance."""

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import CurrentUser
from app.schemas.attendance import (
    AttendanceRecordCreate,
    AttendanceRecordResponse,
    AttendanceSummary,
)
from app.services import attendance_service

router = APIRouter()


@router.get("/classes/{class_id}/attendance", response_model=list[AttendanceRecordResponse])
async def list_attendance(
    class_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(100, ge=1, le=500, description="Maximum number of records"),
    student_name: str | None = Query(None, description="Filter by student name (partial match)"),
    date_from: datetime | None = Query(None, description="Filter by start date"),
    date_to: datetime | None = Query(None, description="Filter by end date"),
    legacy: bool | None = Query(None, description="Include legacy students (first attendance > 5 years ago)"),
) -> list[AttendanceRecordResponse]:
    """
    List attendance records for a class.

    Supports filtering by:
    - Student name (case-insensitive, partial match)
    - Date range (date_from and date_to)
    - Legacy (exclude students whose first attendance is > 5 years old)

    Args:
        class_id: Class UUID
        current_user: Current authenticated user
        db: Database session
        skip: Pagination offset
        limit: Maximum records (1-500)
        student_name: Optional name filter
        date_from: Optional start date
        date_to: Optional end date
        legacy: If None or False, excludes legacy students (default: None)

    Returns:
        List of attendance records (excludes legacy students by default)

    Raises:
        404: If class not found
        403: If user doesn't own the class
    """
    records = await attendance_service.list_attendance_for_class(
        db,
        class_id,
        current_user,
        skip=skip,
        limit=limit,
        student_name=student_name,
        date_from=date_from,
        date_to=date_to,
        legacy=legacy,
    )
    
    return [AttendanceRecordResponse.model_validate(record) for record in records]


@router.post(
    "/classes/{class_id}/attendance",
    response_model=AttendanceRecordResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_attendance(
    class_id: UUID,
    attendance_data: AttendanceRecordCreate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> AttendanceRecordResponse:
    """
    Log attendance for a student.

    Student names are automatically normalized:
    - "john" -> "John"
    - "MARY DOE" -> "Mary Doe"
    - Matching is case-insensitive

    Args:
        class_id: Class UUID
        attendance_data: Student name and timestamp
        current_user: Current authenticated user
        db: Database session

    Returns:
        Created attendance record

    Raises:
        400: If class is not active
        404: If class not found
        403: If user doesn't own the class
    """
    record = await attendance_service.create_attendance_record(
        db, class_id, attendance_data, current_user
    )

    # Create response with total_attendance
    response_data = {
        "id": record.id,
        "class_id": record.class_id,
        "student_first_name": record.student_first_name,
        "student_last_name": record.student_last_name,
        "timestamp": record.timestamp,
        "created_at": record.created_at,
        "total_attendance": getattr(record, 'total_attendance', None)
    }

    return AttendanceRecordResponse.model_validate(response_data)


@router.delete("/attendance/{attendance_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_attendance(
    attendance_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> None:
    """
    Delete an attendance record.

    Args:
        attendance_id: Attendance record UUID
        current_user: Current authenticated user
        db: Database session

    Returns:
        None: No content

    Raises:
        404: If attendance record not found
        403: If user doesn't own the class
    """
    await attendance_service.delete_attendance_record(
        db, attendance_id, current_user
    )
    
    return None


@router.get(
    "/classes/{class_id}/attendance/summary",
    response_model=list[AttendanceSummary],
)
async def get_attendance_summary(
    class_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> list[AttendanceSummary]:
    """
    Get attendance summary grouped by student.

    Returns each unique student with:
    - Total attendance count
    - List of all attendance records with timestamps

    Students are grouped case-insensitively:
    - "John Doe" and "john doe" are treated as the same student
    - Display name uses the proper capitalization from most recent record

    Args:
        class_id: Class UUID
        current_user: Current authenticated user
        db: Database session

    Returns:
        List of student summaries sorted by last name

    Raises:
        404: If class not found
        403: If user doesn't own the class
    """
    summary = await attendance_service.get_attendance_summary(
        db, class_id, current_user
    )
    
    return [AttendanceSummary.model_validate(item) for item in summary]

