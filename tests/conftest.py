"""Pytest fixtures and configuration."""

import asyncio
import os
from typing import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.security import hash_password
from app.database import Base, get_db
from app.main import app
from app.models.attendance import AttendanceRecord
from app.models.class_ import Class
from app.models.user import User


# Test database URL - PostgreSQL by default
# For local testing with Docker Compose: postgresql+asyncpg://attendance_user:test_password_123@localhost:5433/attendance_tracker_test
# Override with TEST_DATABASE_URL environment variable if needed
TEST_DATABASE_URL = os.getenv(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://attendance_user:test_password_123@localhost:5433/attendance_tracker_test"
)


@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture
async def db_engine():
    """
    Create a test database engine.

    Uses NullPool to ensure connections are properly closed after each test.
    Creates all tables before tests and drops them after.
    """
    engine = create_async_engine(
        TEST_DATABASE_URL,
        poolclass=NullPool,  # Don't pool connections in tests
        echo=False,  # Set to True for SQL debugging
    )

    # Create all tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield engine

    # Drop all tables after tests
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

    await engine.dispose()


@pytest_asyncio.fixture
async def db(db_engine) -> AsyncGenerator[AsyncSession, None]:
    """Create a test database session."""
    async with AsyncSession(db_engine, expire_on_commit=False) as session:
        yield session
        await session.rollback()


@pytest_asyncio.fixture
async def client(db) -> AsyncGenerator[AsyncClient, None]:
    """
    Create an async test client with database override.

    Usage:
        async def test_endpoint(client):
            response = await client.get("/")
            assert response.status_code == 200
    """
    
    async def override_get_db():
        yield db
    
    app.dependency_overrides[get_db] = override_get_db
    
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def test_user(db: AsyncSession) -> User:
    """Create a test user."""
    user = User(
        email="test@example.com",
        password_hash=hash_password("testpassword123"),
        active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest_asyncio.fixture
async def inactive_user(db: AsyncSession) -> User:
    """Create an inactive test user."""
    user = User(
        email="inactive@example.com",
        password_hash=hash_password("testpassword123"),
        active=False,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest_asyncio.fixture
async def auth_headers(client: AsyncClient, test_user: User) -> dict[str, str]:
    """Get authentication headers for test user."""
    # Login with the test_user credentials
    response = await client.post(
        "/api/auth/login",
        json={
            "email": "test@example.com",
            "password": "testpassword123",
        },
    )
    assert response.status_code == 200
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def test_class(db: AsyncSession, test_user: User) -> Class:
    """Create a test class."""
    class_obj = Class(
        name="Test Class",
        description="A test class for testing",
        teacher_id=test_user.id,
        active=True,
    )
    db.add(class_obj)
    await db.commit()
    await db.refresh(class_obj)
    return class_obj


@pytest_asyncio.fixture
async def inactive_class(db: AsyncSession, test_user: User) -> Class:
    """Create an inactive test class."""
    class_obj = Class(
        name="Inactive Class",
        description="An inactive class",
        teacher_id=test_user.id,
        active=False,
    )
    db.add(class_obj)
    await db.commit()
    await db.refresh(class_obj)
    return class_obj


@pytest_asyncio.fixture
async def test_attendance(
    db: AsyncSession, test_class: Class
) -> AttendanceRecord:
    """Create a test attendance record."""
    from datetime import datetime, timezone
    
    record = AttendanceRecord(
        class_id=test_class.id,
        student_first_name="John",
        student_last_name="Doe",
        timestamp=datetime.now(timezone.utc),
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return record


@pytest.fixture
def sample_user_data() -> dict:
    """Sample user data for testing."""
    return {
        "email": "newuser@example.com",
        "password": "newpassword123",
    }


@pytest.fixture
def sample_class_data() -> dict:
    """Sample class data for testing."""
    return {
        "name": "Mathematics 101",
        "description": "Introduction to mathematics",
    }


@pytest.fixture
def sample_attendance_data() -> dict:
    """Sample attendance data for testing."""
    from datetime import datetime, timezone
    
    return {
        "student_first_name": "Jane",
        "student_last_name": "Smith",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
