"""Direct tests for attendance service functions."""

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.attendance import AttendanceRecord
from app.models.class_ import Class
from app.models.student import Student
from app.models.user import User
from app.schemas.attendance import AttendanceRecordCreate
from app.services import attendance_service, student_service
from app.core.exceptions import NotFoundError, ForbiddenException, BadRequestException


@pytest.mark.asyncio
class TestNormalizeName:
    """Tests for normalize_name function."""

    def test_normalize_uppercase(self):
        """Test normalizing uppercase name."""
        assert student_service.normalize_name("JOHN DOE") == "John Doe"

    def test_normalize_lowercase(self):
        """Test normalizing lowercase name."""
        assert student_service.normalize_name("mary smith") == "Mary Smith"

    def test_normalize_mixed_case(self):
        """Test normalizing mixed case."""
        assert student_service.normalize_name("mCdOnAlD jones") == "Mcdonald Jones"

    def test_normalize_with_spaces(self):
        """Test normalizing with leading/trailing spaces."""
        assert student_service.normalize_name("  john doe  ") == "John Doe"

    def test_normalize_apostrophe(self):
        """Test normalizing name with apostrophe."""
        assert student_service.normalize_name("O'BRIEN smith") == "O'brien Smith"

    def test_normalize_hyphen(self):
        """Test normalizing name with hyphen."""
        assert student_service.normalize_name("jean-paul sartre") == "Jean-paul Sartre"


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
class TestCreateAttendanceRecord:
    """Tests for create_attendance_record."""

    async def test_create_attendance_for_inactive_class(
        self, db: AsyncSession, inactive_class: Class, test_user: User
    ):
        """Test creating attendance for inactive class fails."""
        attendance_data = AttendanceRecordCreate(
            student_name="John Doe",
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
            student_name="JOHN doe",
            timestamp=datetime.now(timezone.utc),
        )

        result, quantity = await attendance_service.create_attendance_record(
            db, test_class.id, attendance_data, test_user
        )

        # Student name should be normalized
        assert result.student.name == "John Doe"
        assert quantity == 1

    async def test_create_attendance_adds_total_count(
        self, db: AsyncSession, test_class: Class, test_user: User
    ):
        """Test that total_attendance attribute is added."""
        # Create first attendance
        attendance_data = AttendanceRecordCreate(
            student_name="Jane Smith",
            timestamp=datetime.now(timezone.utc),
        )

        result1, quantity1 = await attendance_service.create_attendance_record(
            db, test_class.id, attendance_data, test_user
        )

        assert hasattr(result1, 'total_attendance')
        assert result1.total_attendance == 1
        assert quantity1 == 1

        # Create second attendance for same student
        result2, quantity2 = await attendance_service.create_attendance_record(
            db, test_class.id, attendance_data, test_user
        )

        assert result2.total_attendance == 2
        assert quantity2 == 1


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

        # The record's own wording, not the helper's generic default. This check folded into
        # class_service.verify_class_ownership on 2026-09-04 and passes `action` to keep it.
        assert "You don't have permission to delete this attendance record" in str(exc.value)


@pytest.mark.asyncio
class TestGetAttendanceStatisticsOwnership:
    """INV-1 at the statistics service seam.

    Until 2026-09-04 `get_attendance_statistics` took no teacher at all: the check lived in
    `app/api/attendance.py`, one line above the call. The route was covered from the denied side
    by tests/test_authorization.py, so the endpoint was safe — but the service function was not,
    and a second caller would have read any teacher's class with nothing failing. These three
    tests are what makes the function, rather than its one caller, the thing that is proven.
    """

    async def test_owner_reads_statistics(
        self, db: AsyncSession, test_class: Class, test_user: User
    ):
        """The owning teacher gets the aggregates."""
        stats = await attendance_service.get_attendance_statistics(
            db, test_class.id, test_user
        )

        assert stats["total_records"] == 0
        assert stats["daily_stats"] == []

    async def test_other_teacher_is_refused(
        self, db: AsyncSession, test_class: Class, other_teacher: User
    ):
        """A second real teacher is refused at the service, not only at the route."""
        with pytest.raises(ForbiddenException) as exc:
            await attendance_service.get_attendance_statistics(
                db, test_class.id, other_teacher
            )

        assert "permission" in str(exc.value).lower()

    async def test_missing_class_is_not_found(
        self, db: AsyncSession, test_user: User
    ):
        """A class that does not exist 404s before ownership is considered."""
        from uuid import uuid4

        with pytest.raises(NotFoundError):
            await attendance_service.get_attendance_statistics(db, uuid4(), test_user)


@pytest.mark.asyncio
class TestListAttendanceForClass:
    """Tests for list_attendance_for_class."""

    async def test_list_attendance_basic(
        self, db: AsyncSession, test_class: Class, test_user: User
    ):
        """Test basic listing of attendance records."""
        # Create some attendance records
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
                timestamp=datetime.now(timezone.utc) - timedelta(days=i),
            )
            db.add(record)
        await db.commit()

        records, total = await attendance_service.list_attendance_for_class(
            db, test_class.id, test_user
        )

        assert len(records) >= 5
        assert total >= 5

    async def test_list_attendance_with_pagination(
        self, db: AsyncSession, test_class: Class, test_user: User
    ):
        """Test pagination of attendance records."""
        # Create 15 records
        for i in range(15):
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
                timestamp=datetime.now(timezone.utc) - timedelta(hours=i),
            )
            db.add(record)
        await db.commit()

        # Get first 10
        records, total = await attendance_service.list_attendance_for_class(
            db, test_class.id, test_user, skip=0, limit=10
        )

        assert len(records) == 10
        assert total == 15

        # Get next 5
        records2, total2 = await attendance_service.list_attendance_for_class(
            db, test_class.id, test_user, skip=10, limit=10
        )

        assert len(records2) == 5
        assert total2 == 15  # Total should be same

    async def test_list_attendance_filter_by_student_name(
        self, db: AsyncSession, test_class: Class, test_user: User
    ):
        """Test filtering by student name."""
        # Create students first
        alice_student = Student(
            name="Alice Johnson",
            class_id=test_class.id,
            course_credit_received=False,
        )
        db.add(alice_student)
        await db.flush()

        bob_student = Student(
            name="Bob Smith",
            class_id=test_class.id,
            course_credit_received=False,
        )
        db.add(bob_student)
        await db.flush()

        # Create attendance records
        records = [
            AttendanceRecord(
                class_id=test_class.id,
                student_id=alice_student.id,
                timestamp=datetime.now(timezone.utc),
            ),
            AttendanceRecord(
                class_id=test_class.id,
                student_id=bob_student.id,
                timestamp=datetime.now(timezone.utc),
            ),
        ]
        db.add_all(records)
        await db.commit()

        # Filter for Alice
        records, total = await attendance_service.list_attendance_for_class(
            db, test_class.id, test_user, student_name="Alice"
        )

        assert len(records) >= 1
        assert total >= 1
        assert all("alice" in r.student.name.lower() for r in records)

    async def test_list_attendance_filter_by_date_from(
        self, db: AsyncSession, test_class: Class, test_user: User
    ):
        """Test filtering by start date."""
        # Create students first
        old_student = Student(
            name="Old Record",
            class_id=test_class.id,
            course_credit_received=False,
        )
        db.add(old_student)
        await db.flush()

        new_student = Student(
            name="New Record",
            class_id=test_class.id,
            course_credit_received=False,
        )
        db.add(new_student)
        await db.flush()

        # Create old and new records
        old_record = AttendanceRecord(
            class_id=test_class.id,
            student_id=old_student.id,
            timestamp=datetime.now(timezone.utc) - timedelta(days=10),
        )
        new_record = AttendanceRecord(
            class_id=test_class.id,
            student_id=new_student.id,
            timestamp=datetime.now(timezone.utc),
        )
        db.add_all([old_record, new_record])
        await db.commit()

        # Filter from 5 days ago
        cutoff = datetime.now(timezone.utc) - timedelta(days=5)
        records, total = await attendance_service.list_attendance_for_class(
            db, test_class.id, test_user, date_from=cutoff
        )

        # Should only have new record
        assert len(records) >= 1
        assert all(r.timestamp >= cutoff for r in records)

    async def test_list_attendance_filter_by_date_to(
        self, db: AsyncSession, test_class: Class, test_user: User
    ):
        """Test filtering by end date."""
        # Create students first
        past_student = Student(
            name="Past Record",
            class_id=test_class.id,
            course_credit_received=False,
        )
        db.add(past_student)
        await db.flush()

        recent_student = Student(
            name="Recent Record",
            class_id=test_class.id,
            course_credit_received=False,
        )
        db.add(recent_student)
        await db.flush()

        # Create records
        past_record = AttendanceRecord(
            class_id=test_class.id,
            student_id=past_student.id,
            timestamp=datetime.now(timezone.utc) - timedelta(days=10),
        )
        recent_record = AttendanceRecord(
            class_id=test_class.id,
            student_id=recent_student.id,
            timestamp=datetime.now(timezone.utc),
        )
        db.add_all([past_record, recent_record])
        await db.commit()

        # Filter up to 5 days ago
        cutoff = datetime.now(timezone.utc) - timedelta(days=5)
        records, total = await attendance_service.list_attendance_for_class(
            db, test_class.id, test_user, date_to=cutoff
        )

        # Should only have past record
        assert len(records) >= 1
        assert all(r.timestamp <= cutoff for r in records)

    async def test_list_attendance_ordered_by_timestamp_desc(
        self, db: AsyncSession, test_class: Class, test_user: User
    ):
        """Test that results are ordered by timestamp descending."""
        # Create records with different timestamps
        timestamps = [
            datetime.now(timezone.utc) - timedelta(hours=i) for i in range(5)
        ]
        for i, ts in enumerate(timestamps):
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
                timestamp=ts,
            )
            db.add(record)
        await db.commit()

        records, total = await attendance_service.list_attendance_for_class(
            db, test_class.id, test_user
        )

        # Should be ordered newest first
        for i in range(len(records) - 1):
            assert records[i].timestamp >= records[i + 1].timestamp


@pytest.mark.asyncio
class TestGetAttendanceSummary:
    """Tests for get_attendance_summary."""

    async def test_summary_groups_by_student(
        self, db: AsyncSession, test_class: Class, test_user: User
    ):
        """Test that summary groups records by student."""
        # Create student first
        alice = Student(
            name="Alice Johnson",
            class_id=test_class.id,
            course_credit_received=False,
        )
        db.add(alice)
        await db.flush()

        # Create multiple records for same student
        for i in range(3):
            record = AttendanceRecord(
                class_id=test_class.id,
                student_id=alice.id,
                timestamp=datetime.now(timezone.utc) - timedelta(days=i),
            )
            db.add(record)

        await db.commit()

        summary, total, legacy_hidden = await attendance_service.get_attendance_summary(
            db, test_class.id, test_user
        )

        # Find Alice in summary
        alice_summary = next(
            (s for s in summary if s["student_name"] == "Alice Johnson"), None
        )
        assert alice_summary is not None
        assert alice_summary["total_attendance"] == 3
        assert len(alice_summary["records"]) == 3

    async def test_summary_case_insensitive_grouping(
        self, db: AsyncSession, test_class: Class, test_user: User
    ):
        """Test that summary groups case-insensitively."""
        # Create student first (names will be normalized)
        bob = Student(
            name="Bob Smith",
            class_id=test_class.id,
            course_credit_received=False,
        )
        db.add(bob)
        await db.flush()

        # Create records for same student
        records = [
            AttendanceRecord(
                class_id=test_class.id,
                student_id=bob.id,
                timestamp=datetime.now(timezone.utc),
            ),
            AttendanceRecord(
                class_id=test_class.id,
                student_id=bob.id,
                timestamp=datetime.now(timezone.utc) - timedelta(days=1),
            ),
        ]
        db.add_all(records)
        await db.commit()

        summary, total, legacy_hidden = await attendance_service.get_attendance_summary(
            db, test_class.id, test_user
        )

        # Should be grouped as one student
        bobs = [s for s in summary if s["student_name"].lower() == "bob smith"]
        assert len(bobs) == 1
        assert bobs[0]["total_attendance"] == 2

    async def test_summary_sorted_by_name(
        self, db: AsyncSession, test_class: Class, test_user: User
    ):
        """Test that summary is sorted by student name."""
        # Create students and records
        students_data = [
            "Zoe Apple",
            "Alice Banana",
            "Bob Banana",
        ]

        for name in students_data:
            # Create student first
            student = Student(
                name=name,
                class_id=test_class.id,
                course_credit_received=False,
            )
            db.add(student)
            await db.flush()

            # Create attendance record
            record = AttendanceRecord(
                class_id=test_class.id,
                student_id=student.id,
                timestamp=datetime.now(timezone.utc),
            )
            db.add(record)

        await db.commit()

        summary, total, legacy_hidden = await attendance_service.get_attendance_summary(
            db, test_class.id, test_user
        )

        # Extract names
        names = [s["student_name"] for s in summary]

        # Should be sorted
        assert names == sorted(names)
