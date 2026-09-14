"""Class service - Business logic for class/course management."""

from datetime import datetime, timezone
from typing import NamedTuple
from uuid import UUID

from sqlalchemy import ScalarSelect, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ForbiddenException, NotFoundError
from app.models.attendance import AttendanceRecord
from app.models.class_ import Class
from app.models.student import Student
from app.models.user import User
from app.schemas.class_ import ClassCreate, ClassUpdate


class ClassCounts(NamedTuple):
    """How many attendance records and Students a Class holds.

    One type rather than a bare pair, because the two numbers are the same width and swapping
    them at a call site is silent.
    """

    attendance_count: int
    student_count: int


def _attendance_count_for(class_id: UUID | None = None) -> ScalarSelect[int]:
    """COUNT of a Class's attendance records, as a subquery.

    Pass a `class_id` for one known Class; pass nothing to correlate against `Class` in an
    enclosing SELECT, which is what keeps the list endpoint flat in the number of courses.
    """
    where = AttendanceRecord.class_id == (class_id if class_id else Class.id)
    stmt = select(func.count(AttendanceRecord.id)).where(where)
    return (stmt if class_id else stmt.correlate(Class)).scalar_subquery()


def _student_count_for(class_id: UUID | None = None) -> ScalarSelect[int]:
    """COUNT of a Class's Students, as a subquery. See `_attendance_count_for`."""
    where = Student.class_id == (class_id if class_id else Class.id)
    stmt = select(func.count(Student.id)).where(where)
    return (stmt if class_id else stmt.correlate(Class)).scalar_subquery()


async def count_class_rows(db: AsyncSession, class_id: UUID) -> ClassCounts:
    """Both of a Class's counts, in one statement.

    The single-Class half of the same decision as `get_classes_for_teacher`: before 2026-09-11
    each of `list_classes`, `get_class` and `update_class` inlined its own
    `select(func.count(AttendanceRecord.id))`, so adding a second count meant editing the same
    query in four places. There is one place now.
    """
    result = await db.execute(
        select(_attendance_count_for(class_id), _student_count_for(class_id))
    )
    attendance_count, student_count = result.one()
    return ClassCounts(attendance_count, student_count)


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
        Class object if found, None otherwise
    """
    result = await db.execute(select(Class).where(Class.id == class_id))
    return result.scalar_one_or_none()


async def get_classes_for_teacher(
    db: AsyncSession,
    teacher_id: UUID,
    skip: int = 0,
    limit: int = 100,
) -> list[tuple[Class, ClassCounts]]:
    """
    Get all classes for a specific teacher, each with its two counts.

    Args:
        db: Database session
        teacher_id: Teacher's user ID
        skip: Number of records to skip (pagination)
        limit: Maximum number of records to return

    Returns:
        List of (class, counts) pairs belonging to the teacher, newest first

    The counts ride the class query as correlated subqueries rather than a COUNT per row.
    Until 2026-09-11 `list_classes` looped in Python and issued one COUNT per class -- measured
    at 7 statements for 5 classes, and the fourth N+1 in this codebase after the three found by
    tracing on 2026-09-09. It is 2 statements now, unchanged at 1, 5 and 20 classes;
    `tests/test_query_budget.py` holds that ceiling and was watched failing at 7 against 3 first.
    """
    # INV-1's *filter* site, and the only one. It enforces the same rule as
    # verify_class_ownership over many rows instead of one, so it cannot call it -- there is no
    # single class_id to check. Removing this WHERE leaks every teacher's classes into every
    # other teacher's list, which is what test_class_list_does_not_leak_another_teachers_class
    # exists to catch. See specs/0003-consolidate-inv-1.md, decision 4.
    result = await db.execute(
        select(Class, _attendance_count_for(), _student_count_for())
        .where(Class.teacher_id == teacher_id)
        .order_by(Class.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    return [
        (class_obj, ClassCounts(attendance_count, student_count))
        for class_obj, attendance_count, student_count in result.all()
    ]


async def get_class_with_attendance_count(
    db: AsyncSession,
    class_id: UUID,
) -> tuple[Class, int]:
    """
    Get a class with its attendance record count.

    Args:
        db: Database session
        class_id: Class UUID

    Returns:
        Tuple of (Class, attendance_count)

    Raises:
        NotFoundError: If class not found
    """
    class_obj = await get_class_by_id(db, class_id)
    if not class_obj:
        raise NotFoundError("Class not found")

    return class_obj, (await count_class_rows(db, class_id)).attendance_count


async def create_class(
    db: AsyncSession,
    class_data: ClassCreate,
    teacher: User,
) -> Class:
    """
    Create a new class for a teacher.

    Args:
        db: Database session
        class_data: Class creation data
        teacher: Teacher creating the class

    Returns:
        Created class
    """
    class_obj = Class(
        name=class_data.name,
        description=class_data.description,
        teacher_id=teacher.id,
        active=True,
    )
    
    db.add(class_obj)
    await db.commit()
    await db.refresh(class_obj)
    
    return class_obj


async def update_class(
    db: AsyncSession,
    class_id: UUID,
    class_data: ClassUpdate,
    teacher: User,
) -> Class:
    """
    Update a class.

    Args:
        db: Database session
        class_id: Class UUID
        class_data: Update data
        teacher: Teacher updating the class

    Returns:
        Updated class

    Raises:
        NotFoundError: If class not found
        ForbiddenException: If user is not the class owner
    """
    class_obj = await verify_class_ownership(
        db, class_id, teacher, action="update this class"
    )
    
    # Update fields
    if class_data.name is not None:
        class_obj.name = class_data.name
    
    if class_data.description is not None:
        class_obj.description = class_data.description
    
    if class_data.active is not None:
        class_obj.active = class_data.active
    
    class_obj.updated_at = datetime.now(timezone.utc)
    
    await db.commit()
    await db.refresh(class_obj)
    
    return class_obj


async def delete_class(
    db: AsyncSession,
    class_id: UUID,
    teacher: User,
) -> None:
    """
    Delete a class and all its attendance records (cascade).

    Args:
        db: Database session
        class_id: Class UUID
        teacher: Teacher deleting the class

    Raises:
        NotFoundError: If class not found
        ForbiddenException: If user is not the class owner
    """
    class_obj = await verify_class_ownership(
        db, class_id, teacher, action="delete this class"
    )
    
    # Delete class (cascade will delete attendance records)
    await db.delete(class_obj)
    await db.commit()


async def verify_class_ownership(
    db: AsyncSession,
    class_id: UUID,
    teacher: User,
    *,
    action: str = "access this class",
) -> Class:
    """
    Verify that a teacher owns a specific class.

    The one place in `app/` that decides single-class ownership (INV-1). Every other service
    calls this rather than comparing `teacher_id` itself; `scripts/drift-extra.sh` check 4
    fails a diff that adds such a comparison anywhere else. See
    `specs/0003-consolidate-inv-1.md`.

    The class's absence is reported before its ownership is considered, so a 404 never becomes
    a 403 and no teacher learns that a class id exists.

    Args:
        db: Database session
        class_id: Class UUID
        teacher: Teacher to verify
        action: The phrase after "You don't have permission to" in the refusal, so a caller
            refusing an update says so rather than saying "access". Callers pass what they
            were about to do.

    Returns:
        Class object

    Raises:
        NotFoundError: If class not found
        ForbiddenException: If user is not the class owner
    """
    class_obj = await get_class_by_id(db, class_id)
    if not class_obj:
        raise NotFoundError("Class not found")

    if class_obj.teacher_id != teacher.id:
        raise ForbiddenException(f"You don't have permission to {action}")

    return class_obj


async def check_class_active(
    db: AsyncSession,
    class_id: UUID,
) -> bool:
    """
    Check if a class is active.

    Args:
        db: Database session
        class_id: Class UUID

    Returns:
        True if class is active, False otherwise

    Raises:
        NotFoundError: If class not found
    """
    class_obj = await get_class_by_id(db, class_id)
    if not class_obj:
        raise NotFoundError("Class not found")
    
    return class_obj.active

