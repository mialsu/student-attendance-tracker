"""Direct tests for class service functions."""

from datetime import datetime, timezone

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.attendance import AttendanceRecord
from app.models.class_ import Class
from app.models.student import Student
from app.models.user import User
from app.schemas.class_ import ClassCreate, ClassUpdate
from app.services import class_service
from app.core.exceptions import NotFoundError, ForbiddenException


@pytest.mark.asyncio
class TestGetClassById:
    """Tests for get_class_by_id."""

    async def test_get_class_by_id_found(
        self, db: AsyncSession, test_class: Class
    ):
        """Test getting class by ID when it exists."""
        result = await class_service.get_class_by_id(db, test_class.id)

        assert result is not None
        assert result.id == test_class.id
        assert result.name == test_class.name

    async def test_get_class_by_id_not_found(self, db: AsyncSession):
        """Test getting class by ID when it doesn't exist."""
        from uuid import uuid4

        result = await class_service.get_class_by_id(db, uuid4())

        assert result is None


@pytest.mark.asyncio
class TestGetClassesForTeacher:
    """Tests for get_classes_for_teacher."""

    async def test_get_classes_for_teacher(
        self, db: AsyncSession, test_user: User, test_class: Class
    ):
        """Test getting all classes for a teacher."""
        # Create additional classes
        for i in range(3):
            class_obj = Class(
                name=f"Test Class {i}",
                description=f"Description {i}",
                teacher_id=test_user.id,
                active=True,
            )
            db.add(class_obj)
        await db.commit()

        result = await class_service.get_classes_for_teacher(db, test_user.id)

        assert len(result) >= 4  # test_class + 3 new ones
        assert all(c.teacher_id == test_user.id for c in result)

    async def test_get_classes_with_pagination(
        self, db: AsyncSession, test_user: User
    ):
        """Test pagination of classes."""
        # Create 10 classes
        for i in range(10):
            class_obj = Class(
                name=f"Class {i}",
                teacher_id=test_user.id,
                active=True,
            )
            db.add(class_obj)
        await db.commit()

        # Get first 5
        result = await class_service.get_classes_for_teacher(
            db, test_user.id, skip=0, limit=5
        )

        assert len(result) == 5

        # Get next 5
        result2 = await class_service.get_classes_for_teacher(
            db, test_user.id, skip=5, limit=5
        )

        assert len(result2) == 5
        # Should be different classes
        ids1 = {c.id for c in result}
        ids2 = {c.id for c in result2}
        assert ids1.isdisjoint(ids2)


@pytest.mark.asyncio
class TestGetClassWithAttendanceCount:
    """Tests for get_class_with_attendance_count."""

    async def test_get_class_with_attendance_count(
        self, db: AsyncSession, test_class: Class
    ):
        """Test getting class with attendance count."""
        # Add some attendance records
        for i in range(5):
            # Create student first
            student = Student(
                name=f"Student{i} Test",
                class_id=test_class.id,
                course_credit_received=False,
            )
            db.add(student)
            await db.flush()

            # Create attendance with student_id
            record = AttendanceRecord(
                class_id=test_class.id,
                student_id=student.id,
                timestamp=datetime.now(timezone.utc),
            )
            db.add(record)
        await db.commit()

        class_obj, count = await class_service.get_class_with_attendance_count(
            db, test_class.id
        )

        assert class_obj.id == test_class.id
        assert count == 5

    async def test_get_class_with_zero_attendance(
        self, db: AsyncSession, test_class: Class
    ):
        """Test getting class with no attendance records."""
        class_obj, count = await class_service.get_class_with_attendance_count(
            db, test_class.id
        )

        assert class_obj.id == test_class.id
        assert count == 0

    async def test_get_class_with_attendance_count_not_found(
        self, db: AsyncSession
    ):
        """Test getting non-existent class."""
        from uuid import uuid4

        with pytest.raises(NotFoundError) as exc:
            await class_service.get_class_with_attendance_count(db, uuid4())

        assert "not found" in str(exc.value).lower()


@pytest.mark.asyncio
class TestCreateClass:
    """Tests for create_class."""

    async def test_create_class(self, db: AsyncSession, test_user: User):
        """Test creating a new class."""
        class_data = ClassCreate(
            name="New Class",
            description="A new test class",
        )

        result = await class_service.create_class(db, class_data, test_user)

        assert result.name == "New Class"
        assert result.description == "A new test class"
        assert result.teacher_id == test_user.id
        assert result.active is True
        assert result.id is not None

    async def test_create_class_without_description(
        self, db: AsyncSession, test_user: User
    ):
        """Test creating class without description."""
        class_data = ClassCreate(name="Minimal Class")

        result = await class_service.create_class(db, class_data, test_user)

        assert result.name == "Minimal Class"
        assert result.description is None
        assert result.teacher_id == test_user.id


@pytest.mark.asyncio
class TestUpdateClass:
    """Tests for update_class."""

    async def test_update_class_name_only(
        self, db: AsyncSession, test_class: Class, test_user: User
    ):
        """Test updating only the name."""
        update_data = ClassUpdate(name="Updated Name")

        result = await class_service.update_class(
            db, test_class.id, update_data, test_user
        )

        assert result.name == "Updated Name"
        assert result.description == test_class.description
        assert result.active == test_class.active

    async def test_update_class_description_only(
        self, db: AsyncSession, test_class: Class, test_user: User
    ):
        """Test updating only the description."""
        update_data = ClassUpdate(description="New description")

        result = await class_service.update_class(
            db, test_class.id, update_data, test_user
        )

        assert result.description == "New description"
        assert result.name == test_class.name

    async def test_update_class_active_only(
        self, db: AsyncSession, test_class: Class, test_user: User
    ):
        """Test updating only the active status."""
        update_data = ClassUpdate(active=False)

        result = await class_service.update_class(
            db, test_class.id, update_data, test_user
        )

        assert result.active is False
        assert result.name == test_class.name

    async def test_update_class_all_fields(
        self, db: AsyncSession, test_class: Class, test_user: User
    ):
        """Test updating all fields at once."""
        update_data = ClassUpdate(
            name="All Updated",
            description="All new",
            active=False,
        )

        result = await class_service.update_class(
            db, test_class.id, update_data, test_user
        )

        assert result.name == "All Updated"
        assert result.description == "All new"
        assert result.active is False

    async def test_update_class_not_found(
        self, db: AsyncSession, test_user: User
    ):
        """Test updating non-existent class."""
        from uuid import uuid4

        update_data = ClassUpdate(name="Updated")

        with pytest.raises(NotFoundError) as exc:
            await class_service.update_class(db, uuid4(), update_data, test_user)

        assert "not found" in str(exc.value).lower()

    async def test_update_class_forbidden(
        self, db: AsyncSession, test_class: Class
    ):
        """Test updating class owned by another teacher."""
        from app.core.security import hash_password

        # Create another user
        other_user = User(
            email="other_update@example.com",
            password_hash=hash_password("password123"),
            active=True,
        )
        db.add(other_user)
        await db.commit()
        await db.refresh(other_user)

        update_data = ClassUpdate(name="Hacked")

        with pytest.raises(ForbiddenException) as exc:
            await class_service.update_class(
                db, test_class.id, update_data, other_user
            )

        assert "permission" in str(exc.value).lower()


@pytest.mark.asyncio
class TestDeleteClass:
    """Tests for delete_class."""

    async def test_delete_class(
        self, db: AsyncSession, test_user: User
    ):
        """Test deleting a class."""
        # Create a class to delete
        class_obj = Class(
            name="To Delete",
            teacher_id=test_user.id,
            active=True,
        )
        db.add(class_obj)
        await db.commit()
        await db.refresh(class_obj)

        class_id = class_obj.id

        # Delete it
        await class_service.delete_class(db, class_id, test_user)

        # Verify it's gone
        result = await class_service.get_class_by_id(db, class_id)
        assert result is None

    async def test_delete_class_not_found(
        self, db: AsyncSession, test_user: User
    ):
        """Test deleting non-existent class."""
        from uuid import uuid4

        with pytest.raises(NotFoundError) as exc:
            await class_service.delete_class(db, uuid4(), test_user)

        assert "not found" in str(exc.value).lower()

    async def test_delete_class_forbidden(
        self, db: AsyncSession, test_class: Class
    ):
        """Test deleting class owned by another teacher."""
        from app.core.security import hash_password

        # Create another user
        other_user = User(
            email="other_delete_class@example.com",
            password_hash=hash_password("password123"),
            active=True,
        )
        db.add(other_user)
        await db.commit()
        await db.refresh(other_user)

        with pytest.raises(ForbiddenException) as exc:
            await class_service.delete_class(db, test_class.id, other_user)

        assert "permission" in str(exc.value).lower()


@pytest.mark.asyncio
class TestVerifyClassOwnership:
    """Tests for verify_class_ownership."""

    async def test_verify_class_ownership_success(
        self, db: AsyncSession, test_class: Class, test_user: User
    ):
        """Test successful ownership verification."""
        result = await class_service.verify_class_ownership(
            db, test_class.id, test_user
        )

        assert result.id == test_class.id

    async def test_verify_class_ownership_not_found(
        self, db: AsyncSession, test_user: User
    ):
        """Test ownership verification when class doesn't exist."""
        from uuid import uuid4

        with pytest.raises(NotFoundError) as exc:
            await class_service.verify_class_ownership(db, uuid4(), test_user)

        assert "not found" in str(exc.value).lower()

    async def test_verify_class_ownership_forbidden(
        self, db: AsyncSession, test_class: Class
    ):
        """Test ownership verification when user doesn't own the class."""
        from app.core.security import hash_password

        # Create another user
        other_user = User(
            email="other_verify@example.com",
            password_hash=hash_password("password123"),
            active=True,
        )
        db.add(other_user)
        await db.commit()
        await db.refresh(other_user)

        with pytest.raises(ForbiddenException) as exc:
            await class_service.verify_class_ownership(
                db, test_class.id, other_user
            )

        assert "permission" in str(exc.value).lower()


@pytest.mark.asyncio
class TestCheckClassActive:
    """Tests for check_class_active."""

    async def test_check_class_active_true(
        self, db: AsyncSession, test_class: Class
    ):
        """Test checking active class."""
        result = await class_service.check_class_active(db, test_class.id)

        assert result is True

    async def test_check_class_active_false(
        self, db: AsyncSession, inactive_class: Class
    ):
        """Test checking inactive class."""
        result = await class_service.check_class_active(db, inactive_class.id)

        assert result is False

    async def test_check_class_active_not_found(self, db: AsyncSession):
        """Test checking non-existent class."""
        from uuid import uuid4

        with pytest.raises(NotFoundError) as exc:
            await class_service.check_class_active(db, uuid4())

        assert "not found" in str(exc.value).lower()
