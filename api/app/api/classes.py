"""Classes API endpoints - CRUD operations for classes/courses."""

from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import CurrentUser
from app.models.attendance import AttendanceRecord
from app.schemas.class_ import ClassCreate, ClassResponse, ClassUpdate
from app.services import class_service

router = APIRouter()


@router.get("", response_model=list[ClassResponse])
async def list_classes(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(100, ge=1, le=100, description="Maximum number of records"),
) -> list[ClassResponse]:
    """
    List all classes for the current teacher.

    Args:
        current_user: Current authenticated user
        db: Database session
        skip: Number of records to skip (pagination)
        limit: Maximum records to return (1-100)

    Returns:
        List of classes with attendance counts
    """
    # Get classes for teacher
    classes = await class_service.get_classes_for_teacher(
        db, current_user.id, skip, limit
    )
    
    # Get attendance counts for each class
    class_responses = []
    for class_obj in classes:
        # Count attendance records
        count_result = await db.execute(
            select(func.count(AttendanceRecord.id)).where(
                AttendanceRecord.class_id == class_obj.id
            )
        )
        attendance_count = count_result.scalar_one()
        
        # Create response with attendance count
        response = ClassResponse.model_validate(class_obj)
        response.attendance_count = attendance_count
        class_responses.append(response)
    
    return class_responses


@router.post("", response_model=ClassResponse, status_code=status.HTTP_201_CREATED)
async def create_class(
    class_data: ClassCreate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> ClassResponse:
    """
    Create a new class.

    Args:
        class_data: Class creation data (name, description)
        current_user: Current authenticated user
        db: Database session

    Returns:
        Created class
    """
    class_obj = await class_service.create_class(db, class_data, current_user)
    
    # Return with attendance count of 0
    response = ClassResponse.model_validate(class_obj)
    response.attendance_count = 0
    
    return response


@router.get("/{class_id}", response_model=ClassResponse)
async def get_class(
    class_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> ClassResponse:
    """
    Get a specific class by ID.

    Args:
        class_id: Class UUID
        current_user: Current authenticated user
        db: Database session

    Returns:
        Class details with attendance count

    Raises:
        404: If class not found
        403: If user doesn't own the class
    """
    # Verify ownership
    class_obj = await class_service.verify_class_ownership(
        db, class_id, current_user
    )
    
    # Get attendance count
    count_result = await db.execute(
        select(func.count(AttendanceRecord.id)).where(
            AttendanceRecord.class_id == class_id
        )
    )
    attendance_count = count_result.scalar_one()
    
    # Create response with attendance count
    response = ClassResponse.model_validate(class_obj)
    response.attendance_count = attendance_count
    
    return response


@router.put("/{class_id}", response_model=ClassResponse)
async def update_class(
    class_id: UUID,
    class_data: ClassUpdate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> ClassResponse:
    """
    Update a class.

    Args:
        class_id: Class UUID
        class_data: Update data (name, description, active)
        current_user: Current authenticated user
        db: Database session

    Returns:
        Updated class

    Raises:
        404: If class not found
        403: If user doesn't own the class
    """
    class_obj = await class_service.update_class(
        db, class_id, class_data, current_user
    )
    
    # Get attendance count
    count_result = await db.execute(
        select(func.count(AttendanceRecord.id)).where(
            AttendanceRecord.class_id == class_id
        )
    )
    attendance_count = count_result.scalar_one()
    
    # Create response with attendance count
    response = ClassResponse.model_validate(class_obj)
    response.attendance_count = attendance_count
    
    return response


@router.delete("/{class_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_class(
    class_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> None:
    """
    Delete a class and all its attendance records.

    Args:
        class_id: Class UUID
        current_user: Current authenticated user
        db: Database session

    Returns:
        None: No content

    Raises:
        404: If class not found
        403: If user doesn't own the class
    """
    await class_service.delete_class(db, class_id, current_user)
    return None

