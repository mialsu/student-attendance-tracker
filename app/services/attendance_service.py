"""Attendance service - Business logic for attendance tracking."""

from datetime import datetime
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BadRequestException, ForbiddenException, NotFoundError
from app.models.attendance import AttendanceRecord
from app.models.class_ import Class
from app.models.user import User
from app.schemas.attendance import AttendanceRecordCreate


def normalize_name(name: str) -> str:
    """
    Normalize a name to proper case (Firstname).
    
    Examples:
        "john" -> "John"
        "MARY" -> "Mary"
        "jean-paul" -> "Jean-paul"
        "o'brien" -> "O'brien"
    
    Args:
        name: Name to normalize
    
    Returns:
        Normalized name with first letter capitalized
    """
    return name.strip().capitalize()


async def get_attendance_by_id(
    db: AsyncSession,
    attendance_id: UUID,
) -> AttendanceRecord | None:
    """
    Retrieve an attendance record by ID.

    Args:
        db: Database session
        attendance_id: Attendance record UUID

    Returns:
        AttendanceRecord if found, None otherwise
    """
    result = await db.execute(
        select(AttendanceRecord).where(AttendanceRecord.id == attendance_id)
    )
    return result.scalar_one_or_none()


async def get_class_by_id(
    db: AsyncSession,
    class_id: UUID,
) -> Class | None:
    """
    Retrieve a class by ID.

    Args:
        db: Database session
        class_id: Class UUID

    Returns:
        Class if found, None otherwise
    """
    result = await db.execute(select(Class).where(Class.id == class_id))
    return result.scalar_one_or_none()


async def verify_class_access(
    db: AsyncSession,
    class_id: UUID,
    teacher: User,
) -> Class:
    """
    Verify that a teacher has access to a class.

    Args:
        db: Database session
        class_id: Class UUID
        teacher: Teacher to verify

    Returns:
        Class object

    Raises:
        NotFoundError: If class not found
        ForbiddenException: If user doesn't own the class
    """
    class_obj = await get_class_by_id(db, class_id)
    if not class_obj:
        raise NotFoundError("Class not found")
    
    if class_obj.teacher_id != teacher.id:
        raise ForbiddenException("You don't have permission to access this class")
    
    return class_obj


async def list_attendance_for_class(
    db: AsyncSession,
    class_id: UUID,
    teacher: User,
    skip: int = 0,
    limit: int = 100,
    student_name: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    legacy: bool | None = None,
) -> list[AttendanceRecord]:
    """
    List attendance records for a class with optional filters.

    Args:
        db: Database session
        class_id: Class UUID
        teacher: Teacher requesting the data
        skip: Number of records to skip
        limit: Maximum number of records
        student_name: Filter by student name (case-insensitive, partial match)
        date_from: Filter by start date
        date_to: Filter by end date
        legacy: If None or False, exclude students whose first attendance is > 5 years old

    Returns:
        List of attendance records

    Raises:
        NotFoundError: If class not found
        ForbiddenException: If user doesn't own the class
    """
    from datetime import timedelta, timezone as tz
    
    # Verify access
    await verify_class_access(db, class_id, teacher)
    
    # Handle legacy filter
    students_to_exclude = set()
    if legacy is None or legacy is False:
        # Get all students with their first (oldest) attendance date
        first_attendance_query = select(
            AttendanceRecord.student_first_name,
            AttendanceRecord.student_last_name,
            func.min(AttendanceRecord.timestamp).label('first_attendance')
        ).where(
            AttendanceRecord.class_id == class_id
        ).group_by(
            func.lower(AttendanceRecord.student_first_name),
            func.lower(AttendanceRecord.student_last_name),
            AttendanceRecord.student_first_name,
            AttendanceRecord.student_last_name,
        )
        
        result = await db.execute(first_attendance_query)
        students = result.all()
        
        # Calculate cutoff date (5 years ago)
        five_years_ago = datetime.now(tz.utc) - timedelta(days=5*365)
        
        # Find students whose first attendance is > 5 years old
        for student_first, student_last, first_attendance in students:
            # Handle timezone-naive datetimes (from SQLite in tests)
            if first_attendance.tzinfo is None:
                first_attendance = first_attendance.replace(tzinfo=tz.utc)
            
            if first_attendance < five_years_ago:
                # Use lowercase for comparison (case-insensitive)
                students_to_exclude.add((
                    student_first.lower(),
                    student_last.lower()
                ))
    
    # Build query
    query = select(AttendanceRecord).where(AttendanceRecord.class_id == class_id)
    
    # Exclude legacy students if needed
    if students_to_exclude:
        for first_name_lower, last_name_lower in students_to_exclude:
            query = query.where(
                ~(
                    (func.lower(AttendanceRecord.student_first_name) == first_name_lower) &
                    (func.lower(AttendanceRecord.student_last_name) == last_name_lower)
                )
            )
    
    # Apply other filters
    if student_name:
        search = f"%{student_name.lower()}%"
        query = query.where(
            (func.lower(AttendanceRecord.student_first_name).like(search)) |
            (func.lower(AttendanceRecord.student_last_name).like(search))
        )
    
    if date_from:
        query = query.where(AttendanceRecord.timestamp >= date_from)
    
    if date_to:
        query = query.where(AttendanceRecord.timestamp <= date_to)
    
    # Order by timestamp descending (most recent first)
    query = query.order_by(AttendanceRecord.timestamp.desc())
    
    # Apply pagination
    query = query.offset(skip).limit(limit)
    
    result = await db.execute(query)
    return list(result.scalars().all())


async def create_attendance_record(
    db: AsyncSession,
    class_id: UUID,
    attendance_data: AttendanceRecordCreate,
    teacher: User,
) -> AttendanceRecord:
    """
    Create a new attendance record for a student.

    Args:
        db: Database session
        class_id: Class UUID
        attendance_data: Attendance data (student names, timestamp)
        teacher: Teacher creating the record

    Returns:
        Created attendance record

    Raises:
        NotFoundError: If class not found
        ForbiddenException: If user doesn't own the class
        BadRequestException: If class is not active
    """
    # Verify access
    class_obj = await verify_class_access(db, class_id, teacher)
    
    # Check if class is active
    if not class_obj.active:
        raise BadRequestException(
            "Cannot add attendance to inactive class. "
            "Please activate the class first."
        )
    
    # Normalize student names (capitalize first letter)
    first_name = normalize_name(attendance_data.student_first_name)
    last_name = normalize_name(attendance_data.student_last_name)
    
    # Create attendance record
    attendance = AttendanceRecord(
        class_id=class_id,
        student_first_name=first_name,
        student_last_name=last_name,
        timestamp=attendance_data.timestamp,
    )

    db.add(attendance)
    await db.commit()
    await db.refresh(attendance)

    # Count total attendances for this student (case-insensitive)
    count_query = select(func.count(AttendanceRecord.id)).where(
        AttendanceRecord.class_id == class_id,
        func.lower(AttendanceRecord.student_first_name) == first_name.lower(),
        func.lower(AttendanceRecord.student_last_name) == last_name.lower()
    )
    count_result = await db.execute(count_query)
    total_count = count_result.scalar()

    # Add the total count to the attendance object for response
    # Note: This is not a database field, just for the response
    setattr(attendance, 'total_attendance', total_count)

    return attendance


async def delete_attendance_record(
    db: AsyncSession,
    attendance_id: UUID,
    teacher: User,
) -> None:
    """
    Delete an attendance record.

    Args:
        db: Database session
        attendance_id: Attendance record UUID
        teacher: Teacher deleting the record

    Raises:
        NotFoundError: If attendance record not found
        ForbiddenException: If user doesn't own the class
    """
    # Get attendance record
    attendance = await get_attendance_by_id(db, attendance_id)
    if not attendance:
        raise NotFoundError("Attendance record not found")
    
    # Verify class ownership
    class_obj = await get_class_by_id(db, attendance.class_id)
    if not class_obj:
        raise NotFoundError("Associated class not found")
    
    if class_obj.teacher_id != teacher.id:
        raise ForbiddenException(
            "You don't have permission to delete this attendance record"
        )
    
    # Delete record
    await db.delete(attendance)
    await db.commit()


async def get_attendance_summary(
    db: AsyncSession,
    class_id: UUID,
    teacher: User,
) -> list[dict]:
    """
    Get attendance summary grouped by student.

    Returns a list of students with their total attendance count and all records.

    Args:
        db: Database session
        class_id: Class UUID
        teacher: Teacher requesting the summary

    Returns:
        List of student summaries with attendance counts and records

    Raises:
        NotFoundError: If class not found
        ForbiddenException: If user doesn't own the class
    """
    # Verify access
    await verify_class_access(db, class_id, teacher)
    
    # Get all attendance records for the class
    result = await db.execute(
        select(AttendanceRecord)
        .where(AttendanceRecord.class_id == class_id)
        .order_by(AttendanceRecord.timestamp.desc())
    )
    records = list(result.scalars().all())
    
    # Group by student (case-insensitive)
    students_map: dict[tuple[str, str], list[AttendanceRecord]] = {}
    
    for record in records:
        # Use normalized names as key (lowercase for grouping)
        key = (
            record.student_first_name.lower(),
            record.student_last_name.lower()
        )
        
        if key not in students_map:
            students_map[key] = []
        students_map[key].append(record)
    
    # Build summary list
    summary = []
    for (first_lower, last_lower), student_records in students_map.items():
        # Use the actual capitalized name from the most recent record
        most_recent = student_records[0]
        
        summary.append({
            "student_first_name": most_recent.student_first_name,
            "student_last_name": most_recent.student_last_name,
            "total_attendance": len(student_records),
            "records": [
                {
                    "id": str(record.id),
                    "timestamp": record.timestamp.isoformat(),
                }
                for record in student_records
            ],
        })
    
    # Sort by last name, then first name
    summary.sort(key=lambda x: (x["student_last_name"], x["student_first_name"]))
    
    return summary

