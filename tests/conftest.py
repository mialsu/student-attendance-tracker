"""Pytest fixtures and configuration."""

import asyncio
import os
from datetime import datetime, timezone
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
from app.models.registration_code import RegistrationCode
from app.models.student import Student
from app.models.user import User, UserRole
from app.services import registration_code_service


# Test database URL — MUST be provided explicitly. There is deliberately no default.
#
# This used to default to `...@localhost:5433/attendance_tracker_test`. The db_engine fixture below
# calls `Base.metadata.drop_all`, so that default pointed a schema-dropping fixture at whatever
# happens to be listening on port 5433 — on this machine, another project's PostgreSQL container.
# The credentials did not match, so it failed to connect rather than doing damage, but "the wrong
# database refused us" is not a safety mechanism.
#
# Set it explicitly, e.g.:
#   export TEST_DATABASE_URL=postgresql+asyncpg://attendance_user:pw@localhost:5433/attendance_tracker_test
# See .env.test.example. CI sets it in .github/workflows/deploy.yml.
TEST_DATABASE_URL = os.getenv("TEST_DATABASE_URL")

if not TEST_DATABASE_URL:
    raise RuntimeError(
        "TEST_DATABASE_URL is not set.\n"
        "These tests create and DROP tables, so the target database must be named explicitly "
        "rather than guessed from a default port.\n"
        "Example:\n"
        "  export TEST_DATABASE_URL="
        "postgresql+asyncpg://attendance_user:PASSWORD@localhost:5433/attendance_tracker_test\n"
        "See .env.test.example."
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
async def superadmin_for_tests(db: AsyncSession) -> User:
    """Create a superadmin user for tests."""
    user = User(
        email="superadmin@example.com",
        password_hash=hash_password("superadminpass"),
        role=UserRole.SUPERADMIN.value,
        active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest_asyncio.fixture
async def valid_registration_code(db: AsyncSession, superadmin_for_tests: User) -> RegistrationCode:
    """Create a valid registration code for tests."""
    code = RegistrationCode(
        code="testcode1234567",  # exactly 16 characters
        email_restriction=None,
        used=False,
        revoked=False,
        expires_at=datetime.now(timezone.utc) + registration_code_service.CODE_LIFETIME,
    )
    db.add(code)
    await db.commit()
    await db.refresh(code)
    return code


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
async def other_teacher(db: AsyncSession) -> User:
    """A second, fully legitimate teacher who owns nothing in this fixture set.

    Exists for the denied side of INV-1: every authorization test authenticates as this
    user and asserts the API refuses. See tests/test_authorization.py.
    """
    user = User(
        email="other-teacher@example.com",
        password_hash=hash_password("testpassword123"),
        active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest_asyncio.fixture
async def other_teacher_headers(
    client: AsyncClient, other_teacher: User
) -> dict[str, str]:
    """Real bearer token for `other_teacher`, obtained through the login route.

    Deliberately logs in rather than minting a token directly, so the test exercises the
    same authentication path a real second teacher would.
    """
    response = await client.post(
        "/api/auth/login",
        json={
            "email": "other-teacher@example.com",
            "password": "testpassword123",
        },
    )
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


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
async def test_student(db: AsyncSession, test_class: Class) -> Student:
    """Create a test student."""
    student = Student(
        name="John Doe",
        class_id=test_class.id,
        course_credit_received=False,
    )
    db.add(student)
    await db.commit()
    await db.refresh(student)
    return student


@pytest_asyncio.fixture
async def test_student_with_credit(db: AsyncSession, test_class: Class) -> Student:
    """Create a student who received course credit."""
    student = Student(
        name="Jane Smith",
        class_id=test_class.id,
        course_credit_received=True,
    )
    db.add(student)
    await db.commit()
    await db.refresh(student)
    return student


@pytest_asyncio.fixture
async def test_attendance(
    db: AsyncSession, test_class: Class, test_student: Student
) -> AttendanceRecord:
    """Create a test attendance record."""
    from datetime import datetime, timezone

    record = AttendanceRecord(
        class_id=test_class.id,
        student_id=test_student.id,
        timestamp=datetime.now(timezone.utc),
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return record


@pytest.fixture
def sample_user_data(valid_registration_code: RegistrationCode) -> dict:
    """Sample user data for testing."""
    return {
        "email": "newuser@example.com",
        "password": "newpassword123",
        "registration_code": valid_registration_code.code,
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
        "student_name": "Jane Smith",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
