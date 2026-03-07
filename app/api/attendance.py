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
    AttendanceStatistics,
    AttendanceSummary,
    PaginatedAttendanceResponse,
    PaginatedAttendanceSummaryResponse,
)
from app.services import attendance_service

router = APIRouter()


@router.get(
    "/classes/{class_id}/attendance/statistics",
    response_model=AttendanceStatistics,
)
async def get_attendance_statistics(
    class_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    exclude_dates: str | None = Query(None, description="Comma-separated dates to exclude (YYYY-MM-DD)"),
) -> AttendanceStatistics:
    """
    Get attendance statistics grouped by date and month.

    Returns aggregated statistics including:
    - Total attendance records and unique students
    - First and last attendance dates
    - Daily attendance counts
    - Monthly attendance counts

    Uses database aggregation for efficient queries.

    Args:
        class_id: Class UUID
        current_user: Current authenticated user
        db: Database session
        exclude_dates: Optional comma-separated dates to exclude (e.g., "2026-02-27,2026-03-01")

    Returns:
        Attendance statistics with daily and monthly aggregations

    Raises:
        404: If class not found
        403: If user doesn't own the class
    """
    # Verify class access
    await attendance_service.verify_class_access(db, class_id, current_user)

    # Parse exclude_dates
    excluded_dates_list = []
    if exclude_dates:
        excluded_dates_list = [d.strip() for d in exclude_dates.split(",") if d.strip()]

    # Get statistics
    stats = await attendance_service.get_attendance_statistics(
        db, class_id, exclude_dates=excluded_dates_list
    )

    return AttendanceStatistics(**stats)


@router.get("/classes/{class_id}/attendance", response_model=PaginatedAttendanceResponse)
async def list_attendance(
    class_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(100, ge=1, le=500, description="Maximum number of records"),
    student_name: str | None = Query(None, description="Filter by student name (partial match)"),
    date_from: datetime | None = Query(None, description="Filter by start date"),
    date_to: datetime | None = Query(None, description="Filter by end date"),
    legacy: bool | None = Query(None, description="Include legacy students (created > 5 years ago)"),
) -> PaginatedAttendanceResponse:
    """
    List attendance records for a class with pagination.

    Supports filtering by:
    - Student name (case-insensitive, partial match)
    - Date range (date_from and date_to)
    - Legacy (exclude students created > 5 years ago)

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
        Paginated response with items, total count, skip, and limit

    Raises:
        404: If class not found
        403: If user doesn't own the class
    """
    records, total = await attendance_service.list_attendance_for_class(
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

    # Build response items with backward compatibility
    items = []
    for record in records:
        # Split name for backward compatibility
        name_parts = record.student.name.split(" ", 1)
        first_name = name_parts[0]
        last_name = name_parts[1] if len(name_parts) > 1 else ""

        response_data = {
            "id": record.id,
            "class_id": record.class_id,
            "timestamp": record.timestamp,
            "created_at": record.created_at,
            "student": record.student,  # NEW
            "student_first_name": first_name,  # DEPRECATED
            "student_last_name": last_name,  # DEPRECATED
            "student_name": record.student.name,  # Full name
            "total_attendance": getattr(record, "total_attendance", None),
        }

        items.append(AttendanceRecordResponse.model_validate(response_data))

    return PaginatedAttendanceResponse(
        items=items,
        total=total,
        skip=skip,
        limit=limit,
    )


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
    Log attendance for a student (supports bulk logging).

    Student names are automatically normalized:
    - "john doe" -> "John Doe"
    - "MARY JANE" -> "Mary Jane"
    - Matching is case-insensitive

    Bulk Logging (NEW):
    - Set `quantity` field (1-50) to create multiple records at once
    - All records share the same student and timestamp
    - Useful for logging past attendance or corrections
    - Returns first created record with `quantity_created` metadata

    If a student with the same name (case-insensitive) already exists in the class,
    the existing student is used. Otherwise, a new student is created.

    Args:
        class_id: Class UUID
        attendance_data: Student name, timestamp, and quantity (default: 1)
        current_user: Current authenticated user
        db: Database session

    Returns:
        Created attendance record with student information and quantity metadata

    Raises:
        400: If class is not active, student name is invalid, or quantity out of range
        404: If class not found
        403: If user doesn't own the class
    """
    # Service now returns tuple (record, quantity_created)
    record, quantity_created = await attendance_service.create_attendance_record(
        db, class_id, attendance_data, current_user
    )

    # Split name for backward compatibility
    name_parts = record.student.name.split(" ", 1)
    first_name = name_parts[0]
    last_name = name_parts[1] if len(name_parts) > 1 else ""

    response_data = {
        "id": record.id,
        "class_id": record.class_id,
        "timestamp": record.timestamp,
        "created_at": record.created_at,
        "student": record.student,  # NEW
        "student_first_name": first_name,  # DEPRECATED
        "student_last_name": last_name,  # DEPRECATED
        "student_name": record.student.name,  # Full name
        "total_attendance": getattr(record, "total_attendance", None),
        "quantity_created": quantity_created if quantity_created > 1 else None,  # NEW
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
    response_model=PaginatedAttendanceSummaryResponse,
)
async def get_attendance_summary(
    class_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    search: str | None = Query(None, description="Filter by student name (case-insensitive partial match)"),
    skip: int = Query(0, ge=0, description="Pagination offset (number of items to skip)"),
    limit: int = Query(20, ge=1, le=100, description="Items per page (max 100)"),
    sort_by: str = Query(
        "attendance_desc",
        description="Sort field: 'attendance_desc' (most attendances first) or 'name_asc' (alphabetical)"
    ),
) -> PaginatedAttendanceSummaryResponse:
    """
    Get attendance summary grouped by student with search, pagination, and sorting.

    Returns each student with:
    - Student ID and name
    - Course credit status
    - Total attendance count
    - List of all attendance records with timestamps

    Query Parameters:
    - search: Filter students by name (case-insensitive, partial match)
    - skip: Number of students to skip (for pagination)
    - limit: Maximum number of students to return (default 20, max 100)
    - sort_by: Sort order - 'attendance_desc' (default) or 'name_asc'

    Args:
        class_id: Class UUID
        current_user: Current authenticated user
        db: Database session

    Returns:
        Paginated list of student summaries with total count

    Raises:
        404: If class not found
        403: If user doesn't own the class
    """
    summary, total = await attendance_service.get_attendance_summary(
        db=db,
        class_id=class_id,
        teacher=current_user,
        search=search,
        skip=skip,
        limit=limit,
        sort_by=sort_by,
    )

    return PaginatedAttendanceSummaryResponse(
        items=[AttendanceSummary.model_validate(item) for item in summary],
        total=total,
        skip=skip,
        limit=limit,
    )

