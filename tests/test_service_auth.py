"""Direct tests for auth service functions."""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.schemas.user import UserCreate
from app.schemas.auth import Token
from app.services import auth_service
from app.core.exceptions import AuthenticationError, DuplicateError
from app.core.security import hash_password, verify_password


@pytest.mark.asyncio
class TestGetUserByEmail:
    """Tests for get_user_by_email."""

    async def test_get_user_by_email_found(
        self, db: AsyncSession, test_user: User
    ):
        """Test getting user by email when they exist."""
        result = await auth_service.get_user_by_email(db, test_user.email)

        assert result is not None
        assert result.id == test_user.id
        assert result.email == test_user.email

    async def test_get_user_by_email_not_found(self, db: AsyncSession):
        """Test getting user by email when they don't exist."""
        result = await auth_service.get_user_by_email(
            db, "nonexistent@example.com"
        )

        assert result is None


@pytest.mark.asyncio
class TestGetUserById:
    """Tests for get_user_by_id."""

    async def test_get_user_by_id_found(
        self, db: AsyncSession, test_user: User
    ):
        """Test getting user by ID when they exist."""
        result = await auth_service.get_user_by_id(db, str(test_user.id))

        assert result is not None
        assert result.id == test_user.id
        assert result.email == test_user.email

    async def test_get_user_by_id_not_found(self, db: AsyncSession):
        """Test getting user by ID when they don't exist."""
        from uuid import uuid4

        result = await auth_service.get_user_by_id(db, str(uuid4()))

        assert result is None


@pytest.mark.asyncio
class TestAuthenticateUser:
    """Tests for authenticate_user."""

    async def test_authenticate_user_success(
        self, db: AsyncSession, test_user: User
    ):
        """Test successful user authentication."""
        result = await auth_service.authenticate_user(
            db, test_user.email, "testpassword123"
        )

        assert result.id == test_user.id
        assert result.email == test_user.email

    async def test_authenticate_user_wrong_password(
        self, db: AsyncSession, test_user: User
    ):
        """Test authentication with wrong password."""
        with pytest.raises(AuthenticationError) as exc:
            await auth_service.authenticate_user(
                db, test_user.email, "wrongpassword"
            )

        assert "invalid" in str(exc.value).lower()

    async def test_authenticate_user_nonexistent(self, db: AsyncSession):
        """Test authentication with non-existent user."""
        with pytest.raises(AuthenticationError) as exc:
            await auth_service.authenticate_user(
                db, "nonexistent@example.com", "password123"
            )

        assert "invalid" in str(exc.value).lower()

    async def test_authenticate_inactive_user(
        self, db: AsyncSession, inactive_user: User
    ):
        """Test authentication with inactive user."""
        with pytest.raises(AuthenticationError) as exc:
            await auth_service.authenticate_user(
                db, inactive_user.email, "testpassword123"
            )

        assert "inactive" in str(exc.value).lower()


@pytest.mark.asyncio
class TestCreateUser:
    """Tests for create_user."""

    async def test_create_user_success(self, db: AsyncSession):
        """Test successful user creation."""
        user_data = UserCreate(
            email="newuser@example.com",
            password="password123",
        )

        result = await auth_service.create_user(db, user_data)

        assert result.email == "newuser@example.com"
        assert result.active is True
        assert result.id is not None
        # Verify password was hashed
        assert result.password_hash != "password123"
        assert verify_password("password123", result.password_hash)

    async def test_create_user_duplicate_email(
        self, db: AsyncSession, test_user: User
    ):
        """Test creating user with duplicate email."""
        user_data = UserCreate(
            email=test_user.email,
            password="password123",
        )

        with pytest.raises(DuplicateError) as exc:
            await auth_service.create_user(db, user_data)

        assert "already" in str(exc.value).lower()


@pytest.mark.asyncio
class TestCreateTokensForUser:
    """Tests for create_tokens_for_user."""

    async def test_create_tokens_for_user(self, test_user: User):
        """Test creating tokens for a user."""
        result = await auth_service.create_tokens_for_user(test_user)

        assert isinstance(result, Token)
        assert result.access_token is not None
        assert result.refresh_token is not None
        assert result.token_type == "bearer"
        assert result.user.email == test_user.email
        assert result.user.id == test_user.id


@pytest.mark.asyncio
class TestUpdateUserEmail:
    """Tests for update_user_email."""

    async def test_update_user_email_success(
        self, db: AsyncSession, test_user: User
    ):
        """Test successful email update."""
        new_email = "newemail@example.com"

        result = await auth_service.update_user_email(
            db, test_user, new_email, "testpassword123"
        )

        assert result.email == new_email
        assert result.id == test_user.id

        # Verify in database
        updated_user = await auth_service.get_user_by_id(db, str(test_user.id))
        assert updated_user.email == new_email

    async def test_update_user_email_wrong_password(
        self, db: AsyncSession, test_user: User
    ):
        """Test email update with wrong password."""
        with pytest.raises(AuthenticationError) as exc:
            await auth_service.update_user_email(
                db, test_user, "newemail@example.com", "wrongpassword"
            )

        assert "invalid" in str(exc.value).lower()

    async def test_update_user_email_to_same(
        self, db: AsyncSession, test_user: User
    ):
        """Test updating email to the same email."""
        result = await auth_service.update_user_email(
            db, test_user, test_user.email, "testpassword123"
        )

        assert result.email == test_user.email

    async def test_update_user_email_duplicate(
        self, db: AsyncSession, test_user: User
    ):
        """Test updating email to an existing email."""
        # Create another user
        other_user = User(
            email="existing@example.com",
            password_hash=hash_password("password123"),
            active=True,
        )
        db.add(other_user)
        await db.commit()

        with pytest.raises(DuplicateError) as exc:
            await auth_service.update_user_email(
                db, test_user, "existing@example.com", "testpassword123"
            )

        assert "already" in str(exc.value).lower()


@pytest.mark.asyncio
class TestUpdateUserPassword:
    """Tests for update_user_password."""

    async def test_update_user_password_success(
        self, db: AsyncSession, test_user: User
    ):
        """Test successful password update."""
        new_password = "newpassword456"

        result = await auth_service.update_user_password(
            db, test_user, "testpassword123", new_password
        )

        assert result.id == test_user.id

        # Verify new password works
        assert verify_password(new_password, result.password_hash)

        # Verify old password doesn't work
        assert not verify_password("testpassword123", result.password_hash)

    async def test_update_user_password_wrong_current(
        self, db: AsyncSession, test_user: User
    ):
        """Test password update with wrong current password."""
        with pytest.raises(AuthenticationError) as exc:
            await auth_service.update_user_password(
                db, test_user, "wrongpassword", "newpassword456"
            )

        assert "invalid" in str(exc.value).lower()
