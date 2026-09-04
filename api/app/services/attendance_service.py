"""Attendance service - Business logic for attendance tracking."""

from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BadRequestException, NotFoundError
from app.models.attendance import AttendanceRecord
from app.models.student import Student
from app.models.user import User
from app.schemas.attendance import AttendanceRecordCreate
from app.services import class_service, student_service


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


async def list_attendance_for_class(
    db: AsyncSession,
    class_id: UUID,
    teacher: User,
    skip: int = 0,
    limit: int = 100,
    student_name: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
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

    Returns:
        Tuple of (list of attendance records, total count)

    Raises:
        NotFoundError: If class not found
        ForbiddenException: If user doesn't own the class
    """
    # Verify access
    await class_service.verify_class_ownership(db, class_id, teacher)

    # This endpoint lists records and applies no age cutoff. The five-year rule lives in
    # get_attendance_summary, which backs the only student list the app renders
    # (specs/0002-legacy-student-cutoff.md).
    base_query = (
        select(AttendanceRecord)
        .join(Student, Student.id == AttendanceRecord.student_id)
        .where(AttendanceRecord.class_id == class_id)
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
    class_obj = await class_service.verify_class_ownership(db, class_id, teacher)

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
    
    # Verify class ownership -- INV-1's single site (specs/0003-consolidate-inv-1.md)
    await class_service.verify_class_ownership(
        db, attendance.class_id, teacher, action="delete this attendance record"
    )
    
    # Delete record
    await db.delete(attendance)
    await db.commit()


# A Student is legacy when their first attendance is older than this. The window is a plain
# 365-day year, carried over from the cutoff this replaced (specs/0002-legacy-student-cutoff.md).
LEGACY_WINDOW = timedelta(days=5 * 365)


async def find_legacy_student_ids(
    db: AsyncSession,
    class_id: UUID,
    search: str | None = None,
) -> set[UUID]:
    """
    Return the ids of the Class's legacy Students, optionally under a name search.

    Legacy means first attendance older than LEGACY_WINDOW, where first attendance is
    MIN(AttendanceRecord.timestamp) and falls back to Student.created_at for a Student
    with no records at all — otherwise MIN over zero rows is NULL and the comparison
    would answer "not legacy" by accident.

    Args:
        db: Database session
        class_id: Class UUID
        search: Optional name filter, applied so the count matches what the caller lists

    Returns:
        Set of Student UUIDs that the cutoff hides
    """
    cutoff = datetime.now(timezone.utc) - LEGACY_WINDOW

    first_attendance = (
        select(
            Student.id.label("student_id"),
            func.coalesce(
                func.min(AttendanceRecord.timestamp), Student.created_at
            ).label("first_seen"),
        )
        .outerjoin(AttendanceRecord, AttendanceRecord.student_id == Student.id)
        .where(Student.class_id == class_id)
        .group_by(Student.id, Student.created_at)
    )

    if search:
        first_attendance = first_attendance.where(
            func.lower(Student.name).like(f"%{search.lower()}%")
        )

    subquery = first_attendance.subquery()
    result = await db.execute(
        select(subquery.c.student_id).where(subquery.c.first_seen < cutoff)
    )
    return {row[0] for row in result.all()}


async def get_attendance_summary(
    db: AsyncSession,
    class_id: UUID,
    teacher: User,
    search: str | None = None,
    skip: int = 0,
    limit: int = 20,
    sort_by: str = "attendance_desc",
    legacy: bool | None = None,
) -> tuple[list[dict], int, int]:
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
        legacy: True reveals legacy Students; None or False hides them

    Returns:
        Tuple of (student summaries, total matching students, legacy students hidden)

    Raises:
        NotFoundError: If class not found
        ForbiddenException: If user doesn't own the class
    """
    # Verify access
    await class_service.verify_class_ownership(db, class_id, teacher)

    # Build base query for students
    query = select(Student).where(Student.class_id == class_id)

    # Add search filter if provided
    if search:
        search_pattern = f"%{search.lower()}%"
        query = query.where(func.lower(Student.name).like(search_pattern))

    # Hide legacy Students unless the caller asked for them. The count is reported so the
    # client can say how many are hidden rather than leaving a list silently short.
    legacy_hidden = 0
    if not legacy:
        legacy_ids = await find_legacy_student_ids(db, class_id, search)
        legacy_hidden = len(legacy_ids)
        if legacy_ids:
            query = query.where(Student.id.not_in(legacy_ids))

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

    return summary, total, legacy_hidden


async def get_attendance_statistics(
    db: AsyncSession,
    class_id: UUID,
    teacher: User,
    exclude_dates: list[str] | None = None,
) -> dict:
    """
    Get daily and monthly attendance statistics for a class.

    Uses database aggregation for efficient queries.
    Compatible with both PostgreSQL (date_trunc) and SQLite (date).

    Refuses a teacher who does not own the class, like every other read in this module. It took
    no teacher until 2026-09-04 and was guarded only by its route, one line above the call, which
    made the function unsafe to call from anywhere else (specs/0003-consolidate-inv-1.md).

    Args:
        db: Database session
        class_id: Class UUID
        teacher: Teacher reading the statistics
        exclude_dates: Optional list of dates to exclude (format: "YYYY-MM-DD")

    Returns:
        Dictionary with statistics including daily and monthly aggregations

    Raises:
        NotFoundError: If class not found
        ForbiddenException: If user doesn't own the class
    """
    await class_service.verify_class_ownership(db, class_id, teacher)

    # Total records count (ALL data, not filtered)
    total_result = await db.execute(
        select(func.count(AttendanceRecord.id))
        .where(AttendanceRecord.class_id == class_id)
    )
    total_records = total_result.scalar() or 0

    # Total unique students count (ALL data, not filtered)
    students_result = await db.execute(
        select(func.count(func.distinct(AttendanceRecord.student_id)))
        .where(AttendanceRecord.class_id == class_id)
    )
    total_students = students_result.scalar() or 0

    # Build WHERE clause for statistics (with exclusions)
    where_conditions = [AttendanceRecord.class_id == class_id]

    # Add date exclusions if provided (only affects charts/tables)
    if exclude_dates:
        # Convert string dates to date objects for comparison
        from datetime import datetime
        exclude_date_objs = []
        for date_str in exclude_dates:
            try:
                date_obj = datetime.strptime(date_str, "%Y-%m-%d").date()
                exclude_date_objs.append(date_obj)
            except ValueError:
                continue  # Skip invalid dates

        if exclude_date_objs:
            # Exclude records where DATE(timestamp) matches any excluded date
            for excluded_date in exclude_date_objs:
                where_conditions.append(
                    func.date(AttendanceRecord.timestamp) != excluded_date
                )

    # Check database dialect
    dialect = db.bind.dialect.name

    if dialect == 'postgresql':
        # PostgreSQL: use date_trunc for efficient aggregation
        # Daily aggregation
        date_col = func.date_trunc('day', AttendanceRecord.timestamp)
        daily_result = await db.execute(
            select(
                date_col.label('date'),
                func.count(AttendanceRecord.id).label('count')
            ).where(
                and_(*where_conditions)
            ).group_by(
                date_col
            ).order_by(
                date_col
            )
        )
        daily_stats = [
            {"date": row.date.date().isoformat(), "count": row.count}
            for row in daily_result.all()
        ]

        # Monthly aggregation
        month_col = func.date_trunc('month', AttendanceRecord.timestamp)
        monthly_result = await db.execute(
            select(
                month_col.label('month'),
                func.count(AttendanceRecord.id).label('count')
            ).where(
                and_(*where_conditions)
            ).group_by(
                month_col
            ).order_by(
                month_col
            )
        )
        monthly_stats = [
            {"year_month": row.month.strftime('%Y-%m'), "count": row.count}
            for row in monthly_result.all()
        ]
    else:
        # SQLite: use date() and strftime() functions
        # Daily aggregation
        date_col = func.date(AttendanceRecord.timestamp)
        daily_result = await db.execute(
            select(
                date_col.label('date'),
                func.count(AttendanceRecord.id).label('count')
            ).where(
                and_(*where_conditions)
            ).group_by(
                date_col
            ).order_by(
                date_col
            )
        )
        daily_stats = [
            {"date": row.date, "count": row.count}
            for row in daily_result.all()
        ]

        # Monthly aggregation
        month_col = func.strftime('%Y-%m', AttendanceRecord.timestamp)
        monthly_result = await db.execute(
            select(
                month_col.label('month'),
                func.count(AttendanceRecord.id).label('count')
            ).where(
                and_(*where_conditions)
            ).group_by(
                month_col
            ).order_by(
                month_col
            )
        )
        monthly_stats = [
            {"year_month": row.month, "count": row.count}
            for row in monthly_result.all()
        ]

    # Date range
    first_date = daily_stats[0]["date"] if daily_stats else None
    last_date = daily_stats[-1]["date"] if daily_stats else None

    return {
        "total_records": total_records,
        "total_students": total_students,
        "first_date": first_date,
        "last_date": last_date,
        "daily_stats": daily_stats,
        "monthly_stats": monthly_stats,
    }

