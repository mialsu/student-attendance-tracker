"""Direct tests for attendance service functions."""

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.attendance import AttendanceRecord
from app.models.class_ import Class
from app.models.user import User
from app.schemas.attendance import AttendanceRecordCreate
from app.services import attendance_service
from app.core.exceptions import NotFoundError, ForbiddenException, BadRequestException


@pytest.mark.asyncio
class TestNormalizeName:
    """Tests for normalize_name function."""

    def test_normalize_uppercase(self):
        """Test normalizing uppercase name."""
        assert attendance_service.normalize_name("JOHN") == "John"

    def test_normalize_lowercase(self):
        """Test normalizing lowercase name."""
        assert attendance_service.normalize_name("mary") == "Mary"

    def test_normalize_mixed_case(self):
        """Test normalizing mixed case."""
        assert attendance_service.normalize_name("mCdOnAlD") == "Mcdonald"

    def test_normalize_with_spaces(self):
        """Test normalizing with leading/trailing spaces."""
        assert attendance_service.normalize_name("  john  ") == "John"

    def test_normalize_apostrophe(self):
        """Test normalizing name with apostrophe."""
        assert attendance_service.normalize_name("O'BRIEN") == "O'brien"

    def test_normalize_hyphen(self):
        """Test normalizing name with hyphen."""
        assert attendance_service.normalize_name("jean-paul") == "Jean-paul"


@pytest.mark.asyncio
class TestGetAttendanceById:
    """Tests for get_attendance_by_id."""

    async def test_get_attendance_by_id_found(
        self, db: AsyncSession, test_attendance: AttendanceRecord
    ):
        """Test getting attendance by ID when it exists."""
        result = await attendance_service.get_attendance_by_id(
            db, test_attendance.id
        )

        assert result is not None
        assert result.id == test_attendance.id

    async def test_get_attendance_by_id_not_found(self, db: AsyncSession):
        """Test getting attendance by ID when it doesn't exist."""
        from uuid import uuid4

        result = await attendance_service.get_attendance_by_id(db, uuid4())

        assert result is None


@pytest.mark.asyncio
class TestGetClassById:
    """Tests for get_class_by_id in attendance service."""

    async def test_get_class_by_id_found(
        self, db: AsyncSession, test_class: Class
    ):
        """Test getting class by ID when it exists."""
        result = await attendance_service.get_class_by_id(db, test_class.id)

        assert result is not None
        assert result.id == test_class.id

    async def test_get_class_by_id_not_found(self, db: AsyncSession):
        """Test getting class by ID when it doesn't exist."""
        from uuid import uuid4

        result = await attendance_service.get_class_by_id(db, uuid4())

        assert result is None


@pytest.mark.asyncio
class TestVerifyClassAccess:
    """Tests for verify_class_access."""

    async def test_verify_class_access_success(
        self, db: AsyncSession, test_class: Class, test_user: User
    ):
        """Test successful class access verification."""
        result = await attendance_service.verify_class_access(
            db, test_class.id, test_user
        )

        assert result.id == test_class.id

    async def test_verify_class_access_not_found(
        self, db: AsyncSession, test_user: User
    ):
        """Test class access when class doesn't exist."""
        from uuid import uuid4

        with pytest.raises(NotFoundError) as exc:
            await attendance_service.verify_class_access(db, uuid4(), test_user)

        assert "not found" in str(exc.value).lower()

    async def test_verify_class_access_forbidden(
        self, db: AsyncSession, test_class: Class
    ):
        """Test class access when user doesn't own the class."""
        from app.core.security import hash_password

        # Create another user
        other_user = User(
            email="other_user@example.com",
            password_hash=hash_password("password123"),
            active=True,
        )
        db.add(other_user)
        await db.commit()
        await db.refresh(other_user)

        with pytest.raises(ForbiddenException) as exc:
            await attendance_service.verify_class_access(
                db, test_class.id, other_user
            )

        assert "permission" in str(exc.value).lower()


@pytest.mark.asyncio
class TestCreateAttendanceRecord:
    """Tests for create_attendance_record."""

    async def test_create_attendance_for_inactive_class(
        self, db: AsyncSession, inactive_class: Class, test_user: User
    ):
        """Test creating attendance for inactive class fails."""
        attendance_data = AttendanceRecordCreate(
            student_first_name="John",
            student_last_name="Doe",
            timestamp=datetime.now(timezone.utc),
        )

        with pytest.raises(BadRequestException) as exc:
            await attendance_service.create_attendance_record(
                db, inactive_class.id, attendance_data, test_user
            )

        assert "inactive" in str(exc.value).lower()

    async def test_create_attendance_normalizes_names(
        self, db: AsyncSession, test_class: Class, test_user: User
    ):
        """Test that names are normalized when creating attendance."""
        attendance_data = AttendanceRecordCreate(
            student_first_name="JOHN",
            student_last_name="doe",
            timestamp=datetime.now(timezone.utc),
        )

        result = await attendance_service.create_attendance_record(
            db, test_class.id, attendance_data, test_user
        )

        assert result.student_first_name == "John"
        assert result.student_last_name == "Doe"

    async def test_create_attendance_adds_total_count(
        self, db: AsyncSession, test_class: Class, test_user: User
    ):
        """Test that total_attendance attribute is added."""
        # Create first attendance
        attendance_data = AttendanceRecordCreate(
            student_first_name="Jane",
            student_last_name="Smith",
            timestamp=datetime.now(timezone.utc),
        )

        result1 = await attendance_service.create_attendance_record(
            db, test_class.id, attendance_data, test_user
        )

        assert hasattr(result1, 'total_attendance')
        assert result1.total_attendance == 1

        # Create second attendance for same student
        result2 = await attendance_service.create_attendance_record(
            db, test_class.id, attendance_data, test_user
        )

        assert result2.total_attendance == 2


@pytest.mark.asyncio
class TestDeleteAttendanceRecord:
    """Tests for delete_attendance_record."""

    async def test_delete_attendance_success(
        self, db: AsyncSession, test_attendance: AttendanceRecord, test_user: User
    ):
        """Test successful attendance deletion."""
        await attendance_service.delete_attendance_record(
            db, test_attendance.id, test_user
        )

        # Verify it's deleted
        result = await attendance_service.get_attendance_by_id(
            db, test_attendance.id
        )
        assert result is None

    async def test_delete_attendance_not_found(
        self, db: AsyncSession, test_user: User
    ):
        """Test deleting non-existent attendance."""
        from uuid import uuid4

        with pytest.raises(NotFoundError) as exc:
            await attendance_service.delete_attendance_record(db, uuid4(), test_user)

        assert "not found" in str(exc.value).lower()

    async def test_delete_attendance_wrong_owner(
        self, db: AsyncSession, test_attendance: AttendanceRecord
    ):
        """Test deleting attendance when class owner is different."""
        from app.core.security import hash_password

        # Create another user (not the owner)
        other_user = User(
            email="other_delete2@example.com",
            password_hash=hash_password("password123"),
            active=True,
        )
        db.add(other_user)
        await db.commit()
        await db.refresh(other_user)

        # Try to delete (should fail - wrong teacher)
        with pytest.raises(ForbiddenException) as exc:
            await attendance_service.delete_attendance_record(
                db, test_attendance.id, other_user
            )

        assert "permission" in str(exc.value).lower()


@pytest.mark.asyncio
class TestListAttendanceForClass:
    """Tests for list_attendance_for_class."""

    async def test_list_attendance_basic(
        self, db: AsyncSession, test_class: Class, test_user: User
    ):
        """Test basic listing of attendance records."""
        # Create some attendance records
        for i in range(5):
            record = AttendanceRecord(
                class_id=test_class.id,
                student_first_name=f"Student{i}",
                student_last_name="Test",
                timestamp=datetime.now(timezone.utc) - timedelta(days=i),
            )
            db.add(record)
        await db.commit()

        result = await attendance_service.list_attendance_for_class(
            db, test_class.id, test_user
        )

        assert len(result) >= 5

    async def test_list_attendance_with_pagination(
        self, db: AsyncSession, test_class: Class, test_user: User
    ):
        """Test pagination of attendance records."""
        # Create 15 records
        for i in range(15):
            record = AttendanceRecord(
                class_id=test_class.id,
                student_first_name=f"Student{i}",
                student_last_name="Test",
                timestamp=datetime.now(timezone.utc) - timedelta(hours=i),
            )
            db.add(record)
        await db.commit()

        # Get first 10
        result = await attendance_service.list_attendance_for_class(
            db, test_class.id, test_user, skip=0, limit=10
        )

        assert len(result) == 10

        # Get next 5
        result2 = await attendance_service.list_attendance_for_class(
            db, test_class.id, test_user, skip=10, limit=10
        )

        assert len(result2) == 5

    async def test_list_attendance_filter_by_student_name(
        self, db: AsyncSession, test_class: Class, test_user: User
    ):
        """Test filtering by student name."""
        # Create records
        records = [
            AttendanceRecord(
                class_id=test_class.id,
                student_first_name="Alice",
                student_last_name="Johnson",
                timestamp=datetime.now(timezone.utc),
            ),
            AttendanceRecord(
                class_id=test_class.id,
                student_first_name="Bob",
                student_last_name="Smith",
                timestamp=datetime.now(timezone.utc),
            ),
        ]
        db.add_all(records)
        await db.commit()

        # Filter for Alice
        result = await attendance_service.list_attendance_for_class(
            db, test_class.id, test_user, student_name="Alice"
        )

        assert len(result) >= 1
        assert all("alice" in r.student_first_name.lower() for r in result)

    async def test_list_attendance_filter_by_date_from(
        self, db: AsyncSession, test_class: Class, test_user: User
    ):
        """Test filtering by start date."""
        # Create old and new records
        old_record = AttendanceRecord(
            class_id=test_class.id,
            student_first_name="Old",
            student_last_name="Record",
            timestamp=datetime.now(timezone.utc) - timedelta(days=10),
        )
        new_record = AttendanceRecord(
            class_id=test_class.id,
            student_first_name="New",
            student_last_name="Record",
            timestamp=datetime.now(timezone.utc),
        )
        db.add_all([old_record, new_record])
        await db.commit()

        # Filter from 5 days ago
        cutoff = datetime.now(timezone.utc) - timedelta(days=5)
        result = await attendance_service.list_attendance_for_class(
            db, test_class.id, test_user, date_from=cutoff
        )

        # Should only have new record
        assert len(result) >= 1
        assert all(r.timestamp >= cutoff for r in result)

    async def test_list_attendance_filter_by_date_to(
        self, db: AsyncSession, test_class: Class, test_user: User
    ):
        """Test filtering by end date."""
        # Create records
        past_record = AttendanceRecord(
            class_id=test_class.id,
            student_first_name="Past",
            student_last_name="Record",
            timestamp=datetime.now(timezone.utc) - timedelta(days=10),
        )
        recent_record = AttendanceRecord(
            class_id=test_class.id,
            student_first_name="Recent",
            student_last_name="Record",
            timestamp=datetime.now(timezone.utc),
        )
        db.add_all([past_record, recent_record])
        await db.commit()

        # Filter up to 5 days ago
        cutoff = datetime.now(timezone.utc) - timedelta(days=5)
        result = await attendance_service.list_attendance_for_class(
            db, test_class.id, test_user, date_to=cutoff
        )

        # Should only have past record
        assert len(result) >= 1
        assert all(r.timestamp <= cutoff for r in result)

    async def test_list_attendance_legacy_filter_excludes_old(
        self, db: AsyncSession, test_class: Class, test_user: User
    ):
        """Test that legacy filter excludes students with first attendance > 5 years ago."""
        # Create old student
        old_date = datetime.now(timezone.utc) - timedelta(days=6 * 365)
        old_record = AttendanceRecord(
            class_id=test_class.id,
            student_first_name="VeryOld",
            student_last_name="Student",
            timestamp=old_date,
        )
        db.add(old_record)
        await db.commit()

        # List with legacy=False (default)
        result = await attendance_service.list_attendance_for_class(
            db, test_class.id, test_user, legacy=False
        )

        # Should not include old student
        assert not any(
            r.student_first_name == "VeryOld" and r.student_last_name == "Student"
            for r in result
        )

    async def test_list_attendance_legacy_filter_includes_when_true(
        self, db: AsyncSession, test_class: Class, test_user: User
    ):
        """Test that legacy=True includes old students."""
        # Create old student
        old_date = datetime.now(timezone.utc) - timedelta(days=6 * 365)
        old_record = AttendanceRecord(
            class_id=test_class.id,
            student_first_name="VeryOld",
            student_last_name="Student",
            timestamp=old_date,
        )
        db.add(old_record)
        await db.commit()

        # List with legacy=True
        result = await attendance_service.list_attendance_for_class(
            db, test_class.id, test_user, legacy=True
        )

        # Should include old student
        assert any(
            r.student_first_name == "VeryOld" and r.student_last_name == "Student"
            for r in result
        )

    async def test_list_attendance_ordered_by_timestamp_desc(
        self, db: AsyncSession, test_class: Class, test_user: User
    ):
        """Test that results are ordered by timestamp descending."""
        # Create records with different timestamps
        timestamps = [
            datetime.now(timezone.utc) - timedelta(hours=i) for i in range(5)
        ]
        for i, ts in enumerate(timestamps):
            record = AttendanceRecord(
                class_id=test_class.id,
                student_first_name=f"Student{i}",
                student_last_name="Test",
                timestamp=ts,
            )
            db.add(record)
        await db.commit()

        result = await attendance_service.list_attendance_for_class(
            db, test_class.id, test_user
        )

        # Should be ordered newest first
        for i in range(len(result) - 1):
            assert result[i].timestamp >= result[i + 1].timestamp


@pytest.mark.asyncio
class TestGetAttendanceSummary:
    """Tests for get_attendance_summary."""

    async def test_summary_groups_by_student(
        self, db: AsyncSession, test_class: Class, test_user: User
    ):
        """Test that summary groups records by student."""
        # Create multiple records for same student
        for i in range(3):
            record = AttendanceRecord(
                class_id=test_class.id,
                student_first_name="Alice",
                student_last_name="Johnson",
                timestamp=datetime.now(timezone.utc) - timedelta(days=i),
            )
            db.add(record)

        await db.commit()

        summary = await attendance_service.get_attendance_summary(
            db, test_class.id, test_user
        )

        # Find Alice in summary
        alice = next(
            (s for s in summary if s["student_first_name"] == "Alice"), None
        )
        assert alice is not None
        assert alice["total_attendance"] == 3
        assert len(alice["records"]) == 3

    async def test_summary_case_insensitive_grouping(
        self, db: AsyncSession, test_class: Class, test_user: User
    ):
        """Test that summary groups case-insensitively."""
        # Create records with different cases
        records = [
            AttendanceRecord(
                class_id=test_class.id,
                student_first_name="Bob",
                student_last_name="Smith",
                timestamp=datetime.now(timezone.utc),
            ),
            AttendanceRecord(
                class_id=test_class.id,
                student_first_name="bob",
                student_last_name="SMITH",
                timestamp=datetime.now(timezone.utc) - timedelta(days=1),
            ),
        ]
        db.add_all(records)
        await db.commit()

        summary = await attendance_service.get_attendance_summary(
            db, test_class.id, test_user
        )

        # Should be grouped as one student
        bobs = [
            s for s in summary
            if s["student_first_name"].lower() == "bob"
            and s["student_last_name"].lower() == "smith"
        ]
        assert len(bobs) == 1
        assert bobs[0]["total_attendance"] == 2

    async def test_summary_sorted_by_name(
        self, db: AsyncSession, test_class: Class, test_user: User
    ):
        """Test that summary is sorted by last name, then first name."""
        # Create records for different students
        students = [
            ("Zoe", "Apple"),
            ("Alice", "Banana"),
            ("Bob", "Banana"),
        ]

        for first, last in students:
            record = AttendanceRecord(
                class_id=test_class.id,
                student_first_name=first,
                student_last_name=last,
                timestamp=datetime.now(timezone.utc),
            )
            db.add(record)

        await db.commit()

        summary = await attendance_service.get_attendance_summary(
            db, test_class.id, test_user
        )

        # Extract names
        names = [
            (s["student_last_name"], s["student_first_name"]) for s in summary
        ]

        # Should be sorted
        assert names == sorted(names)
