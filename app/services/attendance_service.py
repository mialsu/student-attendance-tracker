"""Attendance service - Business logic for attendance tracking."""

from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BadRequestException, ForbiddenException, NotFoundError
from app.models.attendance import AttendanceRecord
from app.models.class_ import Class
from app.models.student import Student
from app.models.user import User
from app.schemas.attendance import AttendanceRecordCreate
from app.services import student_service


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
) -> tuple[list[AttendanceRecord], int]:
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
        legacy: If None or False, exclude students created > 5 years ago

    Returns:
        Tuple of (list of attendance records, total count)

    Raises:
        NotFoundError: If class not found
        ForbiddenException: If user doesn't own the class
    """
    # Verify access
    await verify_class_access(db, class_id, teacher)

    # Handle legacy filter: exclude students created > 5 years ago
    students_to_exclude = set()
    if legacy is None or legacy is False:
        five_years_ago = datetime.now(timezone.utc) - timedelta(days=5 * 365)

        # Use Student.created_at instead of grouping by names
        result = await db.execute(
            select(Student.id).where(
                and_(
                    Student.class_id == class_id, Student.created_at < five_years_ago
                )
            )
        )
        students_to_exclude = {row[0] for row in result.all()}

    # Build query joining Student table
    base_query = (
        select(AttendanceRecord)
        .join(Student, Student.id == AttendanceRecord.student_id)
        .where(AttendanceRecord.class_id == class_id)
    )

    # Exclude legacy students
    if students_to_exclude:
        base_query = base_query.where(
            AttendanceRecord.student_id.not_in(students_to_exclude)
        )

    # Filter by student name (now using Student.name)
    if student_name:
        search = f"%{student_name.lower()}%"
        base_query = base_query.where(func.lower(Student.name).like(search))

    # Apply date filters
    if date_from:
        base_query = base_query.where(AttendanceRecord.timestamp >= date_from)
    if date_to:
        base_query = base_query.where(AttendanceRecord.timestamp <= date_to)

    # Get total count
    count_query = select(func.count()).select_from(base_query.subquery())
    count_result = await db.execute(count_query)
    total = count_result.scalar() or 0

    # Apply pagination
    paginated_query = (
        base_query.order_by(AttendanceRecord.timestamp.desc())
        .offset(skip)
        .limit(limit)
    )

    result = await db.execute(paginated_query)
    records = list(result.scalars().all())

    # Eager load students
    for record in records:
        await db.refresh(record, ["student"])

    return records, total


async def create_attendance_record(
    db: AsyncSession,
    class_id: UUID,
    attendance_data: AttendanceRecordCreate,
    teacher: User,
) -> tuple[AttendanceRecord, int]:
    """
    Create one or more attendance records for a student (bulk support).

    When quantity > 1, all records share:
    - Same student_id
    - Same timestamp
    - Same class_id

    Args:
        db: Database session
        class_id: Class UUID
        attendance_data: Attendance data (student name, timestamp, quantity)
        teacher: Teacher creating the record

    Returns:
        Tuple of (first created record, total quantity created)

    Raises:
        NotFoundError: If class not found
        ForbiddenException: If user doesn't own the class
        BadRequestException: If class is not active or student name is invalid
    """
    # Verify access and active status
    class_obj = await verify_class_access(db, class_id, teacher)

    if not class_obj.active:
        raise BadRequestException(
            "Cannot add attendance to inactive class. "
            "Please activate the class first."
        )

    # Get or create student ONCE (before bulk loop)
    student = await student_service.get_or_create_student(
        db, name=attendance_data.student_name, class_id=class_id
    )

    # Extract quantity (default: 1)
    quantity = attendance_data.quantity
    base_timestamp = attendance_data.timestamp

    # Create attendance records (bulk insert pattern)
    created_records = []
    for i in range(quantity):
        attendance = AttendanceRecord(
            class_id=class_id,
            student_id=student.id,
            timestamp=base_timestamp,
        )
        db.add(attendance)
        created_records.append(attendance)

    # Single commit for entire bulk operation (atomic transaction)
    await db.commit()

    # Refresh first record to return to client
    first_record = created_records[0]
    await db.refresh(first_record)
    await db.refresh(first_record, ["student"])  # Load relationship

    # Count total attendances for this student (after bulk insert)
    count_result = await db.execute(
        select(func.count(AttendanceRecord.id)).where(
            AttendanceRecord.student_id == student.id
        )
    )
    total_count = count_result.scalar()
    setattr(first_record, "total_attendance", total_count)

    return first_record, quantity


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
    search: str | None = None,
    skip: int = 0,
    limit: int = 20,
    sort_by: str = "attendance_desc",
) -> tuple[list[dict], int]:
    """
    Get attendance summary grouped by student with pagination and filtering.

    Returns a list of students with their total attendance count and all records.

    Args:
        db: Database session
        class_id: Class UUID
        teacher: Teacher requesting the summary
        search: Optional search term to filter students by name
        skip: Number of records to skip (pagination offset)
        limit: Maximum number of records to return (page size)
        sort_by: Sort field - 'attendance_desc' or 'name_asc'

    Returns:
        Tuple of (list of student summaries, total count of matching students)

    Raises:
        NotFoundError: If class not found
        ForbiddenException: If user doesn't own the class
    """
    # Verify access
    await verify_class_access(db, class_id, teacher)

    # Build base query for students
    query = select(Student).where(Student.class_id == class_id)

    # Add search filter if provided
    if search:
        search_pattern = f"%{search.lower()}%"
        query = query.where(func.lower(Student.name).like(search_pattern))

    # Count total matching students (before pagination)
    count_query = select(func.count()).select_from(query.subquery())
    count_result = await db.execute(count_query)
    total = count_result.scalar_one()

    # Apply sorting
    if sort_by == "attendance_desc":
        # Sort by attendance count descending, then by name ascending
        # We need to join with attendance_records and count them
        query = (
            query
            .outerjoin(AttendanceRecord, Student.id == AttendanceRecord.student_id)
            .group_by(Student.id)
            .order_by(func.count(AttendanceRecord.id).desc(), Student.name.asc())
        )
    else:  # name_asc (default)
        query = query.order_by(Student.name.asc())

    # Apply pagination
    query = query.offset(skip).limit(limit)

    # Execute query
    students_result = await db.execute(query)
    students = list(students_result.scalars().all())

    # Build summary
    summary = []
    for student in students:
        # Get all attendance records for this student
        records_result = await db.execute(
            select(AttendanceRecord)
            .where(AttendanceRecord.student_id == student.id)
            .order_by(AttendanceRecord.timestamp.desc())
        )
        records = list(records_result.scalars().all())

        summary.append(
            {
                "student_id": student.id,
                "student_name": student.name,
                "course_credit_received": student.course_credit_received,
                "total_attendance": len(records),
                "records": [
                    {"id": str(r.id), "timestamp": r.timestamp.isoformat()}
                    for r in records
                ],
            }
        )

    return summary, total

