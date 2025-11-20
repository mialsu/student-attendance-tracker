"""Tests for registration code functionality."""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BadRequestException, NotFoundError
from app.core.security import hash_password
from app.models.registration_code import RegistrationCode
from app.models.user import User, UserRole
from app.services import registration_code_service


# Fixtures for superadmin user
@pytest.fixture
async def superadmin_user(db: AsyncSession) -> User:
    """Create a superadmin user."""
    user = User(
        email="admin@example.com",
        password_hash=hash_password("adminpass123"),
        role=UserRole.SUPERADMIN.value,
        active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest.fixture
async def superadmin_headers(client: AsyncClient, superadmin_user: User) -> dict[str, str]:
    """Get auth headers for superadmin."""
    response = await client.post(
        "/api/auth/login",
        json={"email": "admin@example.com", "password": "adminpass123"},
    )
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


# TDD: Registration Code Service Tests
class TestRegistrationCodeService:
    """Test registration code service functions."""

    async def test_generate_code_returns_16_char_string(self):
        """Test that generated code is exactly 16 characters."""
        code = registration_code_service.generate_code()
        assert isinstance(code, str)
        assert len(code) == 16

    async def test_generate_code_is_url_safe(self):
        """Test that generated code contains only URL-safe characters."""
        code = registration_code_service.generate_code()
        # URL-safe base64 uses A-Z, a-z, 0-9, -, _
        assert all(c.isalnum() or c in ["-", "_"] for c in code)

    async def test_create_registration_code(self, db: AsyncSession, superadmin_user: User):
        """Test creating a registration code."""
        code = await registration_code_service.create_registration_code(db, superadmin_user)

        assert code.id is not None
        assert len(code.code) == 16
        assert code.email_restriction is None
        assert code.used is False
        assert code.revoked is False
        assert code.created_by_user_id == superadmin_user.id
        assert code.created_at is not None

    async def test_create_registration_code_with_email_restriction(
        self, db: AsyncSession, superadmin_user: User
    ):
        """Test creating code with email restriction."""
        email = "specific@example.com"
        code = await registration_code_service.create_registration_code(
            db, superadmin_user, email_restriction=email
        )

        assert code.email_restriction == email

    async def test_get_registration_code(self, db: AsyncSession, superadmin_user: User):
        """Test retrieving a registration code by code string."""
        created_code = await registration_code_service.create_registration_code(
            db, superadmin_user
        )

        retrieved_code = await registration_code_service.get_registration_code(
            db, created_code.code
        )

        assert retrieved_code is not None
        assert retrieved_code.id == created_code.id
        assert retrieved_code.code == created_code.code

    async def test_get_registration_code_not_found(self, db: AsyncSession):
        """Test retrieving non-existent code returns None."""
        code = await registration_code_service.get_registration_code(db, "nonexistent123")
        assert code is None

    async def test_validate_registration_code_success(
        self, db: AsyncSession, superadmin_user: User
    ):
        """Test validating a valid unused code."""
        created_code = await registration_code_service.create_registration_code(
            db, superadmin_user
        )

        validated_code = await registration_code_service.validate_registration_code(
            db, created_code.code, "any@example.com"
        )

        assert validated_code.id == created_code.id

    async def test_validate_registration_code_invalid(self, db: AsyncSession):
        """Test validating invalid code raises exception."""
        with pytest.raises(BadRequestException, match="Invalid registration code"):
            await registration_code_service.validate_registration_code(
                db, "invalid-code", "test@example.com"
            )

    async def test_validate_registration_code_already_used(
        self, db: AsyncSession, superadmin_user: User, test_user: User
    ):
        """Test validating already used code raises exception."""
        code = await registration_code_service.create_registration_code(db, superadmin_user)

        # Mark code as used
        await registration_code_service.mark_code_as_used(db, code, test_user)

        # Try to validate again
        with pytest.raises(BadRequestException, match="already used"):
            await registration_code_service.validate_registration_code(
                db, code.code, "another@example.com"
            )

    async def test_validate_registration_code_revoked(
        self, db: AsyncSession, superadmin_user: User
    ):
        """Test validating revoked code raises exception."""
        code = await registration_code_service.create_registration_code(db, superadmin_user)

        # Revoke the code
        code.revoked = True
        db.add(code)
        await db.commit()

        with pytest.raises(BadRequestException, match="revoked"):
            await registration_code_service.validate_registration_code(
                db, code.code, "test@example.com"
            )

    async def test_validate_registration_code_email_mismatch(
        self, db: AsyncSession, superadmin_user: User
    ):
        """Test validating code with wrong email raises exception."""
        code = await registration_code_service.create_registration_code(
            db, superadmin_user, email_restriction="allowed@example.com"
        )

        with pytest.raises(BadRequestException, match="not valid for your email"):
            await registration_code_service.validate_registration_code(
                db, code.code, "wrong@example.com"
            )

    async def test_validate_registration_code_email_match(
        self, db: AsyncSession, superadmin_user: User
    ):
        """Test validating code with correct email succeeds."""
        email = "allowed@example.com"
        code = await registration_code_service.create_registration_code(
            db, superadmin_user, email_restriction=email
        )

        validated_code = await registration_code_service.validate_registration_code(
            db, code.code, email
        )

        assert validated_code.id == code.id

    async def test_mark_code_as_used(
        self, db: AsyncSession, superadmin_user: User, test_user: User
    ):
        """Test marking a code as used."""
        code = await registration_code_service.create_registration_code(db, superadmin_user)

        await registration_code_service.mark_code_as_used(db, code, test_user)

        # Refresh to get updated values
        await db.refresh(code)

        assert code.used is True
        assert code.used_by_user_id == test_user.id
        assert code.used_at is not None

    async def test_revoke_code(self, db: AsyncSession, superadmin_user: User):
        """Test revoking a registration code."""
        code = await registration_code_service.create_registration_code(db, superadmin_user)

        revoked_code = await registration_code_service.revoke_code(db, str(code.id))

        assert revoked_code.revoked is True

    async def test_revoke_code_not_found(self, db: AsyncSession):
        """Test revoking non-existent code raises exception."""
        import uuid

        fake_id = str(uuid.uuid4())
        with pytest.raises(NotFoundError, match="not found"):
            await registration_code_service.revoke_code(db, fake_id)

    async def test_list_registration_codes(self, db: AsyncSession, superadmin_user: User):
        """Test listing all registration codes."""
        # Create multiple codes
        code1 = await registration_code_service.create_registration_code(db, superadmin_user)
        code2 = await registration_code_service.create_registration_code(db, superadmin_user)

        codes = await registration_code_service.list_registration_codes(db)

        assert len(codes) >= 2
        code_ids = [c.id for c in codes]
        assert code1.id in code_ids
        assert code2.id in code_ids

    async def test_list_registration_codes_with_pagination(
        self, db: AsyncSession, superadmin_user: User
    ):
        """Test listing codes with pagination."""
        # Create 5 codes
        for _ in range(5):
            await registration_code_service.create_registration_code(db, superadmin_user)

        # Get first 3
        codes_page1 = await registration_code_service.list_registration_codes(
            db, skip=0, limit=3
        )
        assert len(codes_page1) == 3

        # Get next 2
        codes_page2 = await registration_code_service.list_registration_codes(
            db, skip=3, limit=3
        )
        assert len(codes_page2) >= 2


# TDD: Admin API Endpoint Tests
@pytest.mark.asyncio
class TestAdminAPI:
    """Test admin API endpoints (TDD - write tests first)."""

    async def test_create_code_as_superadmin(
        self, client: AsyncClient, superadmin_headers: dict
    ):
        """Superadmin can create registration codes."""
        response = await client.post(
            "/api/admin/codes",
            headers=superadmin_headers,
            json={"email_restriction": None},
        )
        assert response.status_code == 201
        data = response.json()
        assert "code" in data
        assert len(data["code"]) == 16
        assert data["used"] is False
        assert data["revoked"] is False

    async def test_create_code_with_email_restriction(
        self, client: AsyncClient, superadmin_headers: dict
    ):
        """Superadmin can create code with email restriction."""
        email = "restricted@example.com"
        response = await client.post(
            "/api/admin/codes",
            headers=superadmin_headers,
            json={"email_restriction": email},
        )
        assert response.status_code == 201
        data = response.json()
        assert data["email_restriction"] == email

    async def test_create_code_as_regular_user_fails(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Regular users cannot create codes (403)."""
        response = await client.post(
            "/api/admin/codes",
            headers=auth_headers,
            json={},
        )
        assert response.status_code == 403
        assert "Superadmin" in response.json()["detail"]

    async def test_create_code_without_auth_fails(self, client: AsyncClient):
        """Unauthenticated requests fail (401)."""
        response = await client.post(
            "/api/admin/codes",
            json={},
        )
        assert response.status_code == 401

    async def test_list_codes_as_superadmin(
        self, client: AsyncClient, superadmin_headers: dict
    ):
        """Superadmin can list all codes."""
        # Create a few codes first
        await client.post(
            "/api/admin/codes",
            headers=superadmin_headers,
            json={},
        )
        await client.post(
            "/api/admin/codes",
            headers=superadmin_headers,
            json={},
        )

        response = await client.get(
            "/api/admin/codes",
            headers=superadmin_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 2

    async def test_list_codes_as_regular_user_fails(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Regular users cannot list codes (403)."""
        response = await client.get(
            "/api/admin/codes",
            headers=auth_headers,
        )
        assert response.status_code == 403

    async def test_revoke_code_as_superadmin(
        self, client: AsyncClient, superadmin_headers: dict
    ):
        """Superadmin can revoke codes."""
        # Create a code
        create_response = await client.post(
            "/api/admin/codes",
            headers=superadmin_headers,
            json={},
        )
        code_id = create_response.json()["id"]

        # Revoke it
        revoke_response = await client.delete(
            f"/api/admin/codes/{code_id}",
            headers=superadmin_headers,
        )
        assert revoke_response.status_code == 200
        data = revoke_response.json()
        assert data["revoked"] is True

    async def test_revoke_code_as_regular_user_fails(
        self, client: AsyncClient, superadmin_headers: dict, auth_headers: dict
    ):
        """Regular users cannot revoke codes (403)."""
        # Create a code as superadmin
        create_response = await client.post(
            "/api/admin/codes",
            headers=superadmin_headers,
            json={},
        )
        code_id = create_response.json()["id"]

        # Try to revoke as regular user
        revoke_response = await client.delete(
            f"/api/admin/codes/{code_id}",
            headers=auth_headers,
        )
        assert revoke_response.status_code == 403

    async def test_revoke_nonexistent_code_fails(
        self, client: AsyncClient, superadmin_headers: dict
    ):
        """Revoking non-existent code returns 404."""
        import uuid

        fake_id = str(uuid.uuid4())
        response = await client.delete(
            f"/api/admin/codes/{fake_id}",
            headers=superadmin_headers,
        )
        assert response.status_code == 404


# TDD: Signup with Registration Code Tests
@pytest.mark.asyncio
class TestSignupWithRegistrationCode:
    """Test signup endpoint requiring registration code."""

    async def test_signup_with_valid_code(
        self, client: AsyncClient, db: AsyncSession, superadmin_user: User
    ):
        """Can signup with valid registration code."""
        # Create code
        code = await registration_code_service.create_registration_code(db, superadmin_user)

        # Signup with code
        response = await client.post(
            "/api/auth/signup",
            json={
                "email": "newuser@example.com",
                "password": "password123",
                "registration_code": code.code,
            },
        )
        assert response.status_code == 201
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"

    async def test_signup_with_invalid_code(self, client: AsyncClient):
        """Cannot signup with invalid code."""
        response = await client.post(
            "/api/auth/signup",
            json={
                "email": "newuser@example.com",
                "password": "password123",
                "registration_code": "invalid-code-16",
            },
        )
        assert response.status_code == 400
        assert "Invalid" in response.json()["detail"]

    async def test_signup_with_used_code(
        self, client: AsyncClient, db: AsyncSession, superadmin_user: User
    ):
        """Cannot reuse a code."""
        # Create and use code
        code = await registration_code_service.create_registration_code(db, superadmin_user)

        # First signup
        await client.post(
            "/api/auth/signup",
            json={
                "email": "user1@example.com",
                "password": "password123",
                "registration_code": code.code,
            },
        )

        # Try to use again
        response = await client.post(
            "/api/auth/signup",
            json={
                "email": "user2@example.com",
                "password": "password123",
                "registration_code": code.code,
            },
        )
        assert response.status_code == 400
        assert "already used" in response.json()["detail"].lower()

    async def test_signup_with_revoked_code(
        self, client: AsyncClient, db: AsyncSession, superadmin_user: User
    ):
        """Cannot use revoked code."""
        code = await registration_code_service.create_registration_code(db, superadmin_user)

        # Revoke the code
        await registration_code_service.revoke_code(db, str(code.id))

        # Try to signup
        response = await client.post(
            "/api/auth/signup",
            json={
                "email": "user@example.com",
                "password": "password123",
                "registration_code": code.code,
            },
        )
        assert response.status_code == 400
        assert "revoked" in response.json()["detail"].lower()

    async def test_signup_with_email_restricted_code_wrong_email(
        self, client: AsyncClient, db: AsyncSession, superadmin_user: User
    ):
        """Email-restricted codes only work for specific email."""
        # Create code for specific email
        code = await registration_code_service.create_registration_code(
            db, superadmin_user, "allowed@example.com"
        )

        # Try with wrong email
        response = await client.post(
            "/api/auth/signup",
            json={
                "email": "wrong@example.com",
                "password": "password123",
                "registration_code": code.code,
            },
        )
        assert response.status_code == 400
        assert "not valid for your email" in response.json()["detail"]

    async def test_signup_with_email_restricted_code_correct_email(
        self, client: AsyncClient, db: AsyncSession, superadmin_user: User
    ):
        """Email-restricted code works with correct email."""
        email = "allowed@example.com"
        code = await registration_code_service.create_registration_code(
            db, superadmin_user, email_restriction=email
        )

        # Try with correct email
        response = await client.post(
            "/api/auth/signup",
            json={
                "email": email,
                "password": "password123",
                "registration_code": code.code,
            },
        )
        assert response.status_code == 201
        assert "access_token" in response.json()

    async def test_signup_without_registration_code_fails(self, client: AsyncClient):
        """Signup without registration code should fail with validation error."""
        response = await client.post(
            "/api/auth/signup",
            json={
                "email": "newuser@example.com",
                "password": "password123",
                # No registration_code field
            },
        )
        # Should be 422 (validation error) because field is missing
        assert response.status_code == 422
