"""Student service - Business logic for student management."""

import logging
from typing import Any, cast
from uuid import UUID

from sqlalchemy import CursorResult, and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import (
    BadRequestException,
    NotFoundError,
)
from app.core.logging import log_event
from app.models.attendance import AttendanceRecord
from app.models.student import Student
from app.models.user import User
from app.schemas.student import StudentCreate, StudentUpdate
from app.services import class_service


def normalize_name(name: str) -> str:
    """
    Normalize name to proper case: "john doe" -> "John Doe"

    Handles multiple spaces, leading/trailing whitespace.

    Args:
        name: Name to normalize

    Returns:
        Normalized name with proper capitalization

    Examples:
        "john doe" -> "John Doe"
        "MARY JANE" -> "Mary Jane"
        "  alice  cooper  " -> "Alice Cooper"
    """
    return " ".join(word.capitalize() for word in name.strip().split())


async def count_attendance_for_student(db: AsyncSession, student_id: UUID) -> int:
    """
    Count the attendance records belonging to one student.

    Four call sites needed this identical query -- three to fill `total_attendance` on a
    response, and one (`delete_student`) to record how many records a cascade is about to
    destroy. A fourth copy is a divergence waiting for a bug, so it lives here once.

    Args:
        db: Database session
        student_id: Student UUID

    Returns:
        The number of attendance records, 0 when the student has none.
    """
    result = await db.execute(
        select(func.count(AttendanceRecord.id)).where(
            AttendanceRecord.student_id == student_id
        )
    )
    return result.scalar() or 0


async def get_or_create_student(
    db: AsyncSession,
    name: str,
    class_id: UUID,
) -> Student:
    """
    Get existing student by name or create new one (case-insensitive).

    Critical for attendance logging:
    - Ensures student uniqueness within a class
    - Handles case-insensitive matching ("John Doe" == "john doe")
    - Uses flush() not commit() (called from within transaction)

    Args:
        db: Database session
        name: Student name (will be normalized)
        class_id: Class UUID

    Returns:
        Existing or newly created Student object

    Raises:
        BadRequestException: If name is empty after normalization
    """
    normalized_name = normalize_name(name)

    if not normalized_name:
        raise BadRequestException("Student name cannot be empty")

    # Try to find existing (case-insensitive)
    result = await db.execute(
        select(Student).where(
            and_(
                func.lower(Student.name) == normalized_name.lower(),
                Student.class_id == class_id,
            )
        )
    )
    student = result.scalar_one_or_none()

    if student:
        return student

    # Create new student
    student = Student(
        name=normalized_name,
        class_id=class_id,
        course_credit_received=False,
    )

    db.add(student)
    await db.flush()  # Flush, don't commit (parent transaction will commit)
    await db.refresh(student)

    return student


async def get_student_by_id(
    db: AsyncSession,
    student_id: UUID,
    teacher: User,
) -> Student:
    """
    Retrieve a student by ID with ownership verification.

    Args:
        db: Database session
        student_id: Student UUID
        teacher: Teacher requesting the data

    Returns:
        Student object

    Raises:
        NotFoundError: If student not found
        ForbiddenException: If user doesn't own the class
    """
    result = await db.execute(
        select(Student).where(Student.id == student_id)
    )
    student = result.scalar_one_or_none()

    if not student:
        raise NotFoundError("Student not found")

    # Verify class ownership
    await class_service.verify_class_ownership(db, student.class_id, teacher)

    # Get total attendance count
    total_count = await count_attendance_for_student(db, student_id)
    setattr(student, "total_attendance", total_count)

    return student


async def list_students_for_class(
    db: AsyncSession,
    class_id: UUID,
    teacher: User,
    skip: int = 0,
    limit: int = 100,
    search: str | None = None,
    credit_filter: bool | None = None,
) -> tuple[list[Student], int]:
    """
    List students for a class with pagination and filters.

    Args:
        db: Database session
        class_id: Class UUID
        teacher: Teacher requesting the data
        skip: Number of records to skip
        limit: Maximum number of records
        search: Filter by student name (case-insensitive, partial match)
        credit_filter: Filter by course credit status (True/False/None)

    Returns:
        Tuple of (list of students, total count)

    Raises:
        NotFoundError: If class not found
        ForbiddenException: If user doesn't own the class
    """
    # Verify class ownership
    await class_service.verify_class_ownership(db, class_id, teacher)

    # Build base query
    base_query = select(Student).where(Student.class_id == class_id)

    # Apply filters
    if search:
        search_pattern = f"%{search.lower()}%"
        base_query = base_query.where(func.lower(Student.name).like(search_pattern))

    if credit_filter is not None:
        base_query = base_query.where(
            Student.course_credit_received == credit_filter
        )

    # Get total count
    count_query = select(func.count()).select_from(base_query.subquery())
    count_result = await db.execute(count_query)
    total = count_result.scalar() or 0

    # Apply pagination and ordering, and count attendance in the same query. Until 2026-09-09
    # this issued a COUNT per student in the page -- 29 statements for a 25-student class, and
    # the number grew with the page size rather than staying flat.
    #
    # Grouping by the primary key is enough for Postgres to allow every other Student column
    # here (functional dependency), which is the same shape get_attendance_summary uses for its
    # attendance_desc sort. The outer join keeps a student with no attendance records in the
    # page, at count 0.
    paginated_query = (
        base_query.add_columns(func.count(AttendanceRecord.id).label("total_attendance"))
        .outerjoin(AttendanceRecord, AttendanceRecord.student_id == Student.id)
        .group_by(Student.id)
        .order_by(Student.name.asc())
        .offset(skip)
        .limit(limit)
    )

    result = await db.execute(paginated_query)
    students = []
    for student, total_attendance in result:
        setattr(student, "total_attendance", total_attendance)
        students.append(student)

    return students, total


async def create_student(
    db: AsyncSession,
    class_id: UUID,
    student_data: StudentCreate,
    teacher: User,
) -> Student:
    """
    Create a new student manually.

    Args:
        db: Database session
        class_id: Class UUID
        student_data: Student creation data
        teacher: Teacher creating the student

    Returns:
        Created student

    Raises:
        NotFoundError: If class not found
        ForbiddenException: If user doesn't own the class
        BadRequestException: If student with same name exists
    """
    # Verify class ownership
    await class_service.verify_class_ownership(db, class_id, teacher)

    # Normalize name
    normalized_name = normalize_name(student_data.name)

    if not normalized_name:
        raise BadRequestException("Student name cannot be empty")

    # Check if student already exists (case-insensitive)
    existing = await db.execute(
        select(Student).where(
            and_(
                func.lower(Student.name) == normalized_name.lower(),
                Student.class_id == class_id,
            )
        )
    )
    if existing.scalar_one_or_none():
        raise BadRequestException(
            f"Student with name '{normalized_name}' already exists in this class"
        )

    # Create student
    student = Student(
        name=normalized_name,
        class_id=class_id,
        course_credit_received=student_data.course_credit_received,
    )

    db.add(student)
    await db.commit()
    await db.refresh(student)

    # Set total attendance to 0 for new student
    setattr(student, "total_attendance", 0)

    return student


async def update_student(
    db: AsyncSession,
    student_id: UUID,
    student_data: StudentUpdate,
    teacher: User,
) -> Student:
    """
    Update a student's name or course credit status.

    Args:
        db: Database session
        student_id: Student UUID
        student_data: Update data
        teacher: Teacher updating the student

    Returns:
        Updated student

    Raises:
        NotFoundError: If student not found
        ForbiddenException: If user doesn't own the class
        BadRequestException: If new name conflicts with existing student
    """
    # Get student
    result = await db.execute(
        select(Student).where(Student.id == student_id)
    )
    student = result.scalar_one_or_none()

    if not student:
        raise NotFoundError("Student not found")

    # Verify class ownership
    await class_service.verify_class_ownership(db, student.class_id, teacher)

    # Update name if provided
    if student_data.name is not None:
        normalized_name = normalize_name(student_data.name)

        if not normalized_name:
            raise BadRequestException("Student name cannot be empty")

        # Check for duplicate (case-insensitive), excluding current student
        existing = await db.execute(
            select(Student).where(
                and_(
                    func.lower(Student.name) == normalized_name.lower(),
                    Student.class_id == student.class_id,
                    Student.id != student_id,
                )
            )
        )
        if existing.scalar_one_or_none():
            raise BadRequestException(
                f"Student with name '{normalized_name}' already exists in this class"
            )

        student.name = normalized_name

    # Update course credit if provided
    if student_data.course_credit_received is not None:
        student.course_credit_received = student_data.course_credit_received

    await db.commit()
    await db.refresh(student)

    # Get total attendance count
    total_count = await count_attendance_for_student(db, student_id)
    setattr(student, "total_attendance", total_count)

    return student


async def delete_student(
    db: AsyncSession,
    student_id: UUID,
    teacher: User,
) -> None:
    """
    Delete a student and all associated attendance records (cascade).

    Irreversible, by decision: `CONTEXT.md` calls this app a tally sheet and the school holds
    the credit. Emits one `INFO` log line after the commit carrying the student and class ids
    and the number of attendance records the cascade destroyed -- ids and counts only, never
    the name (ADR-0007, spec 0005 AC-7).

    Args:
        db: Database session
        student_id: Student UUID
        teacher: Teacher deleting the student

    Raises:
        NotFoundError: If student not found
        ForbiddenException: If user doesn't own the class
    """
    # Get student
    result = await db.execute(
        select(Student).where(Student.id == student_id)
    )
    student = result.scalar_one_or_none()

    if not student:
        raise NotFoundError("Student not found")

    # Verify class ownership
    await class_service.verify_class_ownership(db, student.class_id, teacher)

    # The count and the class id are read HERE, and both have to be. After the commit the
    # cascade has taken the attendance rows, so there is nothing left to count; and `student`
    # is expired by the delete, so reading `student.class_id` afterwards would refresh a row
    # that no longer exists. One extra statement, and it buys the only number that answers
    # "how much did that destroy" (spec 0005, AC-7).
    class_id = student.class_id
    records_destroyed = await count_attendance_for_student(db, student_id)

    # Delete student (cascade will delete attendance records)
    await db.delete(student)
    await db.commit()

    # Logged AFTER the commit, so the line records an act that happened rather than one that
    # was attempted. Ids and a count, never the name: US-6 is the Student's own story --
    # deletion means what `CONTEXT.md` says it means, so the record of the deletion must not
    # become the copy of the name that outlives it (ADR-0007).
    log_event(
        logging.INFO,
        "student_delete",
        student_id=str(student_id),
        class_id=str(class_id),
        records_destroyed=records_destroyed,
    )


async def get_autocomplete_suggestions(
    db: AsyncSession,
    class_id: UUID,
    query: str,
    teacher: User,
    limit: int = 10,
) -> list[dict]:
    """
    Get student name autocomplete suggestions ordered by attendance frequency.

    Args:
        db: Database session
        class_id: Class UUID
        query: Search query (partial name)
        teacher: Teacher requesting suggestions
        limit: Maximum number of suggestions

    Returns:
        List of student suggestions with attendance counts

    Raises:
        NotFoundError: If class not found
        ForbiddenException: If user doesn't own the class
    """
    # Verify class ownership
    await class_service.verify_class_ownership(db, class_id, teacher)

    if not query or len(query) < 2:
        return []

    # Search for students (case-insensitive)
    search_pattern = f"%{query.lower()}%"

    # One grouped query: count, order and slice in the database. Until 2026-09-09 this loaded
    # every matching student, issued a COUNT per one of them, sorted in Python and only then
    # took `limit` -- 28 statements for a 25-student class, on a route that fires on every
    # debounced keystroke (client/src/components/AttendanceTracking.tsx). Two separate faults:
    # the per-match COUNT, and a SELECT with no LIMIT above it.
    #
    # The LIMIT can only move into the database once the count is part of the same query,
    # because the ordering depends on it -- slicing before counting would return the wrong ten
    # students. This is the shape already used by get_attendance_summary's attendance_desc sort
    # (app/services/attendance_service.py). The outer join is what keeps a student with no
    # attendance records in the results, at count 0.
    suggestions_result = await db.execute(
        select(Student.id, Student.name, func.count(AttendanceRecord.id).label("total"))
        .outerjoin(AttendanceRecord, AttendanceRecord.student_id == Student.id)
        .where(
            and_(
                Student.class_id == class_id,
                func.lower(Student.name).like(search_pattern),
            )
        )
        .group_by(Student.id, Student.name)
        .order_by(func.count(AttendanceRecord.id).desc(), Student.name.asc())
        .limit(limit)
    )

    return [
        {
            "id": row.id,
            "name": row.name,
            "total_attendance": row.total,
        }
        for row in suggestions_result
    ]


async def merge_students(
    db: AsyncSession,
    target_student_id: UUID,
    duplicate_student_id: UUID,
    teacher: User,
) -> Student:
    """
    Merge duplicate student into target student.

    Irreversible: the duplicate is destroyed and the attendance moves. Emits one `INFO` log
    line after the commit carrying both student ids, the class id and the number of records
    moved -- ids and counts only, never a name (ADR-0007, spec 0005 AC-7). A merge refused for
    crossing a Class boundary emits a `WARNING` denial line naming `INV-5` instead (AC-21).

    Steps:
    1. Fetch both students, verify ownership and same class
    2. Validate: cannot merge same student, must be same class
    3. Transfer all attendance records: UPDATE attendance_records
       SET student_id = target_student_id
       WHERE student_id = duplicate_student_id,
       keeping the statement's `rowcount` as the number of records moved
    4. Merge course credit: target.course_credit_received =
       target.course_credit_received OR duplicate.course_credit_received
    5. Delete duplicate student: await db.delete(duplicate_student)
    6. Commit transaction, log the act, and return updated target student

    Args:
        db: Database session
        target_student_id: Student to keep (receives all attendance)
        duplicate_student_id: Student to merge from (will be deleted)
        teacher: Teacher performing the merge

    Returns:
        Updated target student with merged data

    Raises:
        BadRequestException: Same student or different classes
        NotFoundError: Student not found
        ForbiddenException: Teacher doesn't own class
    """
    # Validate not the same student
    if target_student_id == duplicate_student_id:
        raise BadRequestException("Cannot merge a student with itself")

    # Fetch target student
    target_result = await db.execute(
        select(Student).where(Student.id == target_student_id)
    )
    target_student = target_result.scalar_one_or_none()

    if not target_student:
        raise NotFoundError("Target student not found")

    # Verify class ownership
    await class_service.verify_class_ownership(db, target_student.class_id, teacher)

    # Fetch duplicate student
    duplicate_result = await db.execute(
        select(Student).where(Student.id == duplicate_student_id)
    )
    duplicate_student = duplicate_result.scalar_one_or_none()

    if not duplicate_student:
        raise NotFoundError("Duplicate student not found")

    # Verify both students are in the same class
    if target_student.class_id != duplicate_student.class_id:
        # INV-5's one enforcement site, and the refusal labels itself so that it reaches the
        # log (spec 0005, AC-21). It was the one silent refusal on the wrong side of US-1's
        # narrowing: an invariant violation going unrecorded while a login typo was recorded.
        # The message names neither Student, and `detail` is never logged from any exception.
        raise BadRequestException(
            "Cannot merge students from different classes",
            rule="INV-5",
            reason="cross_class_merge",
        )

    # Verify ownership of duplicate student's class (should be same, but explicit check)
    await class_service.verify_class_ownership(db, duplicate_student.class_id, teacher)

    # Transfer all attendance records from duplicate to target
    # Use SQLAlchemy update statement for efficient bulk update
    from sqlalchemy import update

    update_stmt = (
        update(AttendanceRecord)
        .where(AttendanceRecord.student_id == duplicate_student_id)
        .values(student_id=target_student_id)
    )
    # The count that matters, and it costs nothing: the bulk UPDATE already reports how many
    # rows it moved. Spec 0005 names this function for exactly that reason -- the number was
    # being discarded, and it is the one that answers "was that the pair I meant". Read before
    # the commit because the result is consumed here; logged after it (below).
    #
    # The cast is a real narrowing, not a silenced error: `AsyncSession.execute` is typed
    # `Result[Any]`, which has no `rowcount`, but a DML statement always returns a
    # `CursorResult` -- so the type is lost by the async wrapper's signature rather than wrong
    # here. A cast rather than a type suppression, because mypy still checks the attribute
    # against the narrowed type, where a suppression would check nothing and would owe a
    # confession of its own.
    update_result = cast("CursorResult[Any]", await db.execute(update_stmt))
    records_moved = update_result.rowcount

    # Merge course credit (OR logic)
    if duplicate_student.course_credit_received:
        target_student.course_credit_received = True

    # Delete duplicate student (cascade will NOT delete attendance records since we transferred them)
    await db.delete(duplicate_student)

    # Commit transaction
    await db.commit()
    await db.refresh(target_student)

    # Logged AFTER the commit: a merge line is a record of an irreversible act, so it must not
    # appear for one that rolled back. Ids and counts only -- both Students are named right up
    # to this moment and neither name goes on the line (ADR-0007). `duplicate_student_id` is
    # the parameter rather than the ORM object's attribute, which is now deleted.
    log_event(
        logging.INFO,
        "merge",
        target_student_id=str(target_student_id),
        duplicate_student_id=str(duplicate_student_id),
        class_id=str(target_student.class_id),
        records_moved=records_moved,
    )

    # Get updated total attendance count
    total_count = await count_attendance_for_student(db, target_student_id)
    setattr(target_student, "total_attendance", total_count)

    return target_student
