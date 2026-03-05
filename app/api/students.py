"""Students API endpoints - Manage students in classes."""

from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import CurrentUser
from app.schemas.student import (
    PaginatedStudentResponse,
    StudentAutocomplete,
    StudentCreate,
    StudentMergeRequest,
    StudentResponse,
    StudentUpdate,
)
from app.services import student_service

router = APIRouter()


@router.get(
    "/classes/{class_id}/students", response_model=PaginatedStudentResponse
)
async def list_students(
    class_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(100, ge=1, le=500, description="Maximum number of records"),
    search: str | None = Query(
        None, description="Filter by student name (partial match)"
    ),
    credit_filter: bool | None = Query(
        None, description="Filter by course credit received (true/false)"
    ),
) -> PaginatedStudentResponse:
    """
    List students for a class with pagination and filters.

    Supports filtering by:
    - Student name (case-insensitive, partial match)
    - Course credit status (true/false/null for all)

    Args:
        class_id: Class UUID
        current_user: Current authenticated user
        db: Database session
        skip: Pagination offset
        limit: Maximum records (1-500)
        search: Optional name filter
        credit_filter: Optional course credit filter

    Returns:
        Paginated response with items, total count, skip, and limit

    Raises:
        404: If class not found
        403: If user doesn't own the class
    """
    students, total = await student_service.list_students_for_class(
        db,
        class_id,
        current_user,
        skip=skip,
        limit=limit,
        search=search,
        credit_filter=credit_filter,
    )

    return PaginatedStudentResponse(
        items=[StudentResponse.model_validate(student) for student in students],
        total=total,
        skip=skip,
        limit=limit,
    )


@router.post(
    "/classes/{class_id}/students",
    response_model=StudentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_student(
    class_id: UUID,
    student_data: StudentCreate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> StudentResponse:
    """
    Create a new student manually.

    Student names are automatically normalized:
    - "john doe" -> "John Doe"
    - "MARY JANE" -> "Mary Jane"

    Args:
        class_id: Class UUID
        student_data: Student name and course credit status
        current_user: Current authenticated user
        db: Database session

    Returns:
        Created student

    Raises:
        400: If student with same name already exists
        404: If class not found
        403: If user doesn't own the class
    """
    student = await student_service.create_student(
        db, class_id, student_data, current_user
    )

    return StudentResponse.model_validate(student)


@router.get("/students/{student_id}", response_model=StudentResponse)
async def get_student(
    student_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> StudentResponse:
    """
    Get a specific student by ID.

    Args:
        student_id: Student UUID
        current_user: Current authenticated user
        db: Database session

    Returns:
        Student details with total attendance count

    Raises:
        404: If student not found
        403: If user doesn't own the class
    """
    student = await student_service.get_student_by_id(
        db, student_id, current_user
    )

    return StudentResponse.model_validate(student)


@router.put("/students/{student_id}", response_model=StudentResponse)
async def update_student(
    student_id: UUID,
    student_data: StudentUpdate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> StudentResponse:
    """
    Update a student's name or course credit status.

    Args:
        student_id: Student UUID
        student_data: Fields to update (name and/or course_credit_received)
        current_user: Current authenticated user
        db: Database session

    Returns:
        Updated student

    Raises:
        400: If new name conflicts with existing student
        404: If student not found
        403: If user doesn't own the class
    """
    student = await student_service.update_student(
        db, student_id, student_data, current_user
    )

    return StudentResponse.model_validate(student)


@router.delete("/students/{student_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_student(
    student_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> None:
    """
    Delete a student and all associated attendance records.

    This is a destructive operation that cannot be undone.
    All attendance records for this student will be permanently deleted.

    Args:
        student_id: Student UUID
        current_user: Current authenticated user
        db: Database session

    Returns:
        None: No content

    Raises:
        404: If student not found
        403: If user doesn't own the class
    """
    await student_service.delete_student(db, student_id, current_user)

    return None


@router.get(
    "/classes/{class_id}/students/autocomplete",
    response_model=list[StudentAutocomplete],
)
async def get_autocomplete(
    class_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    query: str = Query(..., min_length=2, description="Search query (min 2 chars)"),
    limit: int = Query(10, ge=1, le=50, description="Maximum suggestions"),
) -> list[StudentAutocomplete]:
    """
    Get student name autocomplete suggestions.

    Returns students matching the query, ordered by attendance frequency
    (most frequent students appear first).

    Args:
        class_id: Class UUID
        current_user: Current authenticated user
        db: Database session
        query: Search query (minimum 2 characters)
        limit: Maximum number of suggestions (1-50)

    Returns:
        List of student suggestions with attendance counts

    Raises:
        404: If class not found
        403: If user doesn't own the class
    """
    suggestions = await student_service.get_autocomplete_suggestions(
        db, class_id, query, current_user, limit=limit
    )

    return [StudentAutocomplete.model_validate(item) for item in suggestions]


@router.post("/students/{student_id}/merge", response_model=StudentResponse)
async def merge_students(
    student_id: UUID,
    request: StudentMergeRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> StudentResponse:
    """
    Merge duplicate student into target student.

    Transfers all attendance records from the duplicate student to the target student,
    merges course credit status (OR logic), then deletes the duplicate student.

    This operation is irreversible.

    Args:
        student_id: Target student ID (will receive all attendance records)
        request: Contains duplicate_student_id (student to merge from)
        current_user: Current authenticated user
        db: Database session

    Returns:
        Updated target student with merged data

    Raises:
        400: If trying to merge same student or students from different classes
        404: If student not found
        403: If user doesn't own the class
    """
    merged_student = await student_service.merge_students(
        db=db,
        target_student_id=student_id,
        duplicate_student_id=request.duplicate_student_id,
        teacher=current_user,
    )

    return StudentResponse.model_validate(merged_student)
