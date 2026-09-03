"""Tests for database session management."""

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.core.security import hash_password


@pytest.mark.asyncio
class TestDatabaseSession:
    """Tests for database session behavior using test fixtures."""

    async def test_db_fixture_is_async_session(self, db: AsyncSession):
        """Test that db fixture provides a valid AsyncSession."""
        assert isinstance(db, AsyncSession)
        assert db is not None
        assert hasattr(db, 'execute')
        assert hasattr(db, 'commit')
        assert hasattr(db, 'rollback')

    async def test_session_commit_persists_data(self, db: AsyncSession):
        """Test that committing the session persists data."""
        # Create a user
        user = User(
            email="commit_test@example.com",
            password_hash=hash_password("password123"),
            active=True,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

        # Verify the user has an ID (was persisted)
        assert user.id is not None

        # Query to verify it's in the database
        result = await db.execute(
            select(User).where(User.email == "commit_test@example.com")
        )
        found_user = result.scalar_one_or_none()
        assert found_user is not None
        assert found_user.id == user.id

        # Cleanup
        await db.delete(user)
        await db.commit()

    async def test_session_rollback_discards_changes(self, db: AsyncSession):
        """Test that rolling back the session discards changes."""
        # Create a user
        user = User(
            email="rollback_test@example.com",
            password_hash=hash_password("password123"),
            active=True,
        )
        db.add(user)
        await db.flush()  # Get ID but don't commit

        user_id = user.id
        assert user_id is not None

        # Rollback
        await db.rollback()

        # Try to find the user (should not exist)
        result = await db.execute(
            select(User).where(User.id == user_id)
        )
        found_user = result.scalar_one_or_none()
        assert found_user is None

    async def test_session_flush_without_commit(self, db: AsyncSession):
        """Test that flush assigns IDs but doesn't persist without commit."""
        # Create a user
        user = User(
            email="flush_test@example.com",
            password_hash=hash_password("password123"),
            active=True,
        )
        db.add(user)
        await db.flush()

        # User should have an ID after flush
        assert user.id is not None
        user_id = user.id

        # Rollback to discard
        await db.rollback()

        # User should not be in database
        result = await db.execute(
            select(User).where(User.id == user_id)
        )
        found_user = result.scalar_one_or_none()
        assert found_user is None

    async def test_session_multiple_operations(self, db: AsyncSession):
        """Test multiple database operations in one session."""
        # Create multiple users
        users = [
            User(
                email=f"multi_test_{i}@example.com",
                password_hash=hash_password("password123"),
                active=True,
            )
            for i in range(3)
        ]

        for user in users:
            db.add(user)

        await db.commit()

        # Verify they all have IDs
        for user in users:
            await db.refresh(user)
            assert user.id is not None

        # Verify in database
        for user in users:
            result = await db.execute(
                select(User).where(User.email == user.email)
            )
            found_user = result.scalar_one_or_none()
            assert found_user is not None

        # Cleanup
        for user in users:
            await db.delete(user)
        await db.commit()

    async def test_session_handles_constraint_violations(self, db: AsyncSession):
        """Test that session handles database constraint violations."""
        # Create a user
        user1 = User(
            email="unique_test@example.com",
            password_hash=hash_password("password123"),
            active=True,
        )
        db.add(user1)
        await db.commit()

        # Try to create another user with same email (should fail)
        user2 = User(
            email="unique_test@example.com",  # Duplicate
            password_hash=hash_password("password123"),
            active=True,
        )
        db.add(user2)

        with pytest.raises(Exception):  # Will raise IntegrityError
            await db.commit()

        # Rollback to recover
        await db.rollback()

        # Cleanup original user
        result = await db.execute(
            select(User).where(User.email == "unique_test@example.com")
        )
        found_user = result.scalar_one_or_none()
        if found_user:
            await db.delete(found_user)
            await db.commit()

    async def test_session_expire_on_commit_false(self, db: AsyncSession):
        """Test that session is configured with expire_on_commit=False."""
        # Create and commit a user
        user = User(
            email="expire_test@example.com",
            password_hash=hash_password("password123"),
            active=True,
        )
        db.add(user)
        await db.commit()

        # After commit, object should still be accessible
        # (because expire_on_commit=False)
        assert user.email == "expire_test@example.com"
        assert user.active is True

        # Cleanup
        await db.delete(user)
        await db.commit()
