"""Class service - Business logic for class/course management."""

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ForbiddenException, NotFoundError
from app.models.attendance import AttendanceRecord
from app.models.class_ import Class
from app.models.user import User
from app.schemas.class_ import ClassCreate, ClassUpdate


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
) -> list[Class]:
    """
    Get all classes for a specific teacher.

    Args:
        db: Database session
        teacher_id: Teacher's user ID
        skip: Number of records to skip (pagination)
        limit: Maximum number of records to return

    Returns:
        List of classes belonging to the teacher
    """
    result = await db.execute(
        select(Class)
        .where(Class.teacher_id == teacher_id)
        .order_by(Class.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    return list(result.scalars().all())


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
    
    # Get attendance count
    count_result = await db.execute(
        select(func.count(AttendanceRecord.id)).where(
            AttendanceRecord.class_id == class_id
        )
    )
    attendance_count = count_result.scalar_one()
    
    return class_obj, attendance_count


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
    class_obj = await get_class_by_id(db, class_id)
    if not class_obj:
        raise NotFoundError("Class not found")
    
    # Check ownership
    if class_obj.teacher_id != teacher.id:
        raise ForbiddenException("You don't have permission to update this class")
    
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
    class_obj = await get_class_by_id(db, class_id)
    if not class_obj:
        raise NotFoundError("Class not found")
    
    # Check ownership
    if class_obj.teacher_id != teacher.id:
        raise ForbiddenException("You don't have permission to delete this class")
    
    # Delete class (cascade will delete attendance records)
    await db.delete(class_obj)
    await db.commit()


async def verify_class_ownership(
    db: AsyncSession,
    class_id: UUID,
    teacher: User,
) -> Class:
    """
    Verify that a teacher owns a specific class.

    Args:
        db: Database session
        class_id: Class UUID
        teacher: Teacher to verify

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
        raise ForbiddenException("You don't have permission to access this class")
    
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

