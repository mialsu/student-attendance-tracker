"""Admin API endpoints - Superadmin-only operations for registration codes."""

from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import SuperadminUser
from app.schemas.registration_code import CodeResponse, CreateCodeRequest
from app.services import registration_code_service

router = APIRouter()


@router.post("/codes", response_model=CodeResponse, status_code=status.HTTP_201_CREATED)
async def create_registration_code(
    request: CreateCodeRequest,
    current_user: SuperadminUser,
    db: AsyncSession = Depends(get_db),
) -> CodeResponse:
    """
    Create a new registration code (superadmin only).

    Args:
        request: Code creation request with optional email restriction
        current_user: Current authenticated superadmin user
        db: Database session

    Returns:
        Created registration code
    """
    code = await registration_code_service.create_registration_code(
        db=db,
        email_restriction=request.email_restriction,
    )
    return CodeResponse.model_validate(code)


@router.get("/codes", response_model=list[CodeResponse])
async def list_registration_codes(
    current_user: SuperadminUser,
    db: AsyncSession = Depends(get_db),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(100, ge=1, le=100, description="Maximum number of records"),
) -> list[CodeResponse]:
    """
    List all registration codes (superadmin only).

    Args:
        current_user: Current authenticated superadmin user
        db: Database session
        skip: Number of records to skip (pagination)
        limit: Maximum records to return (1-100)

    Returns:
        List of registration codes
    """
    codes = await registration_code_service.list_registration_codes(
        db=db,
        skip=skip,
        limit=limit,
    )
    return [CodeResponse.model_validate(code) for code in codes]


@router.delete("/codes/{code_id}", response_model=CodeResponse)
async def revoke_registration_code(
    code_id: UUID,
    current_user: SuperadminUser,
    db: AsyncSession = Depends(get_db),
) -> CodeResponse:
    """
    Revoke a registration code (superadmin only).

    Revoked codes cannot be used for signup but are preserved for audit trail.

    Args:
        code_id: UUID of the code to revoke
        current_user: Current authenticated superadmin user
        db: Database session

    Returns:
        The revoked registration code
    """
    code = await registration_code_service.revoke_code(db=db, code_id=str(code_id))
    return CodeResponse.model_validate(code)
