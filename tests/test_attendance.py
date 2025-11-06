"""Tests for attendance tracking endpoints."""

from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient

from app.models.attendance import AttendanceRecord
from app.models.class_ import Class


@pytest.mark.asyncio
class TestListAttendance:
    """Tests for listing attendance records."""

    async def test_list_attendance_success(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_class: Class,
        test_attendance: AttendanceRecord,
    ):
        """Test listing attendance records."""
        response = await client.get(
            f"/api/classes/{test_class.id}/attendance",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)
        assert "items" in data
        assert "total" in data
        assert "skip" in data
        assert "limit" in data
        assert isinstance(data["items"], list)
        assert len(data["items"]) >= 1
        assert data["total"] >= 1

    async def test_list_attendance_with_pagination(
        self, client: AsyncClient, auth_headers: dict, test_class: Class
    ):
        """Test listing attendance with pagination."""
        response = await client.get(
            f"/api/classes/{test_class.id}/attendance?skip=0&limit=10",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)
        assert "items" in data
        assert "total" in data
        assert "skip" in data
        assert "limit" in data
        assert len(data["items"]) <= 10
        assert data["skip"] == 0
        assert data["limit"] == 10

    async def test_list_attendance_filter_by_name(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_class: Class,
        test_attendance: AttendanceRecord,
    ):
        """Test filtering attendance by student name."""
        response = await client.get(
            f"/api/classes/{test_class.id}/attendance?student_name=John",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)
        assert "items" in data
        assert len(data["items"]) >= 1
        assert any("John" in r["student_first_name"] for r in data["items"])

    async def test_list_attendance_filter_by_date(
        self, client: AsyncClient, auth_headers: dict, test_class: Class
    ):
        """Test filtering attendance by date range."""
        from urllib.parse import quote
        
        today = datetime.now(timezone.utc)
        yesterday = today - timedelta(days=1)
        tomorrow = today + timedelta(days=1)
        
        response = await client.get(
            f"/api/classes/{test_class.id}/attendance"
            f"?date_from={quote(yesterday.isoformat())}&date_to={quote(tomorrow.isoformat())}",
            headers=auth_headers,
        )
        
        assert response.status_code == 200

    async def test_list_attendance_no_auth(
        self, client: AsyncClient, test_class: Class
    ):
        """Test listing attendance without authentication."""
        response = await client.get(f"/api/classes/{test_class.id}/attendance")
        
        assert response.status_code == 401

    async def test_list_attendance_class_not_found(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test listing attendance for non-existent class."""
        fake_uuid = "00000000-0000-0000-0000-000000000000"
        response = await client.get(
            f"/api/classes/{fake_uuid}/attendance",
            headers=auth_headers,
        )
        
        assert response.status_code == 404


@pytest.mark.asyncio
class TestCreateAttendance:
    """Tests for creating attendance records."""

    async def test_create_attendance_success(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_class: Class,
        sample_attendance_data: dict,
    ):
        """Test successful attendance creation."""
        response = await client.post(
            f"/api/classes/{test_class.id}/attendance",
            headers=auth_headers,
            json=sample_attendance_data,
        )
        
        assert response.status_code == 201
        data = response.json()
        assert "id" in data
        assert data["class_id"] == str(test_class.id)
        assert "student_first_name" in data
        assert "student_last_name" in data

    async def test_create_attendance_name_normalization(
        self, client: AsyncClient, auth_headers: dict, test_class: Class
    ):
        """Test that student names are normalized (capitalized)."""
        response = await client.post(
            f"/api/classes/{test_class.id}/attendance",
            headers=auth_headers,
            json={
                "student_first_name": "john",
                "student_last_name": "DOE",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
        )
        
        assert response.status_code == 201
        data = response.json()
        assert data["student_first_name"] == "John"
        assert data["student_last_name"] == "Doe"

    async def test_create_attendance_inactive_class(
        self,
        client: AsyncClient,
        auth_headers: dict,
        inactive_class: Class,
        sample_attendance_data: dict,
    ):
        """Test creating attendance for inactive class fails."""
        response = await client.post(
            f"/api/classes/{inactive_class.id}/attendance",
            headers=auth_headers,
            json=sample_attendance_data,
        )
        
        assert response.status_code == 400
        assert "inactive" in response.json()["detail"].lower()

    async def test_create_attendance_no_auth(
        self, client: AsyncClient, test_class: Class, sample_attendance_data: dict
    ):
        """Test creating attendance without authentication."""
        response = await client.post(
            f"/api/classes/{test_class.id}/attendance",
            json=sample_attendance_data,
        )
        
        assert response.status_code == 401

    async def test_create_attendance_class_not_found(
        self, client: AsyncClient, auth_headers: dict, sample_attendance_data: dict
    ):
        """Test creating attendance for non-existent class."""
        fake_uuid = "00000000-0000-0000-0000-000000000000"
        response = await client.post(
            f"/api/classes/{fake_uuid}/attendance",
            headers=auth_headers,
            json=sample_attendance_data,
        )
        
        assert response.status_code == 404

    async def test_create_attendance_empty_name(
        self, client: AsyncClient, auth_headers: dict, test_class: Class
    ):
        """Test creating attendance with empty name."""
        response = await client.post(
            f"/api/classes/{test_class.id}/attendance",
            headers=auth_headers,
            json={
                "student_first_name": "",
                "student_last_name": "Doe",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
        )
        
        assert response.status_code == 422


@pytest.mark.asyncio
class TestDeleteAttendance:
    """Tests for deleting attendance records."""

    async def test_delete_attendance_success(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_attendance: AttendanceRecord,
    ):
        """Test successful attendance deletion."""
        response = await client.delete(
            f"/api/attendance/{test_attendance.id}",
            headers=auth_headers,
        )
        
        assert response.status_code == 204

    async def test_delete_attendance_not_found(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test deleting non-existent attendance."""
        fake_uuid = "00000000-0000-0000-0000-000000000000"
        response = await client.delete(
            f"/api/attendance/{fake_uuid}",
            headers=auth_headers,
        )
        
        assert response.status_code == 404

    async def test_delete_attendance_no_auth(
        self, client: AsyncClient, test_attendance: AttendanceRecord
    ):
        """Test deleting attendance without authentication."""
        response = await client.delete(f"/api/attendance/{test_attendance.id}")
        
        assert response.status_code == 401


@pytest.mark.asyncio
class TestAttendanceSummary:
    """Tests for attendance summary endpoint."""

    async def test_summary_success(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_class: Class,
        test_attendance: AttendanceRecord,
    ):
        """Test getting attendance summary."""
        response = await client.get(
            f"/api/classes/{test_class.id}/attendance/summary",
            headers=auth_headers,
        )
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 1
        
        # Check structure
        student = data[0]
        assert "student_first_name" in student
        assert "student_last_name" in student
        assert "total_attendance" in student
        assert "records" in student
        assert isinstance(student["records"], list)

    async def test_summary_groups_case_insensitive(
        self, client: AsyncClient, auth_headers: dict, test_class: Class, db
    ):
        """Test that summary groups students case-insensitively."""
        from app.models.attendance import AttendanceRecord
        
        # Create records with different capitalizations
        record1 = AttendanceRecord(
            class_id=test_class.id,
            student_first_name="John",
            student_last_name="Doe",
            timestamp=datetime.now(timezone.utc),
        )
        record2 = AttendanceRecord(
            class_id=test_class.id,
            student_first_name="john",
            student_last_name="doe",
            timestamp=datetime.now(timezone.utc),
        )
        db.add_all([record1, record2])
        await db.commit()
        
        response = await client.get(
            f"/api/classes/{test_class.id}/attendance/summary",
            headers=auth_headers,
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Should be grouped as one student
        john_does = [
            s for s in data
            if s["student_first_name"].lower() == "john"
            and s["student_last_name"].lower() == "doe"
        ]
        assert len(john_does) == 1
        assert john_does[0]["total_attendance"] >= 2

    async def test_summary_no_auth(self, client: AsyncClient, test_class: Class):
        """Test getting summary without authentication."""
        response = await client.get(
            f"/api/classes/{test_class.id}/attendance/summary"
        )
        
        assert response.status_code == 401

    async def test_summary_class_not_found(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test summary for non-existent class."""
        fake_uuid = "00000000-0000-0000-0000-000000000000"
        response = await client.get(
            f"/api/classes/{fake_uuid}/attendance/summary",
            headers=auth_headers,
        )
        
        assert response.status_code == 404


@pytest.mark.asyncio
class TestLegacyFilter:
    """Tests for legacy student filtering."""

    async def test_legacy_filter_excludes_old_students(
        self, client: AsyncClient, auth_headers: dict, test_class: Class, db
    ):
        """Test that legacy filter excludes students with first attendance > 5 years ago."""
        from app.models.attendance import AttendanceRecord
        
        # Create old record (> 5 years)
        old_date = datetime.now(timezone.utc) - timedelta(days=6*365)
        old_record = AttendanceRecord(
            class_id=test_class.id,
            student_first_name="Old",
            student_last_name="Student",
            timestamp=old_date,
        )
        
        # Create recent record for same student
        recent_record = AttendanceRecord(
            class_id=test_class.id,
            student_first_name="Old",
            student_last_name="Student",
            timestamp=datetime.now(timezone.utc),
        )
        
        # Create record for current student
        current_record = AttendanceRecord(
            class_id=test_class.id,
            student_first_name="Current",
            student_last_name="Student",
            timestamp=datetime.now(timezone.utc),
        )
        
        db.add_all([old_record, recent_record, current_record])
        await db.commit()
        
        # Default (legacy=None) should exclude old student
        response = await client.get(
            f"/api/classes/{test_class.id}/attendance",
            headers=auth_headers,
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Should only have current student, not old student
        names = [(r["student_first_name"], r["student_last_name"]) for r in data["items"]]
        assert ("Current", "Student") in names
        assert ("Old", "Student") not in names

    async def test_legacy_filter_includes_when_true(
        self, client: AsyncClient, auth_headers: dict, test_class: Class, db
    ):
        """Test that legacy=true includes all students."""
        from app.models.attendance import AttendanceRecord
        
        # Create old record
        old_date = datetime.now(timezone.utc) - timedelta(days=6*365)
        old_record = AttendanceRecord(
            class_id=test_class.id,
            student_first_name="Old",
            student_last_name="Student",
            timestamp=old_date,
        )
        db.add(old_record)
        await db.commit()
        
        # With legacy=true
        response = await client.get(
            f"/api/classes/{test_class.id}/attendance?legacy=true",
            headers=auth_headers,
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Should include old student
        names = [(r["student_first_name"], r["student_last_name"]) for r in data["items"]]
        assert ("Old", "Student") in names


@pytest.mark.asyncio
class TestNameNormalization:
    """Tests for student name normalization."""

    async def test_normalize_various_name_formats(
        self, client: AsyncClient, auth_headers: dict, test_class: Class
    ):
        """Test normalization of various name formats."""
        test_cases = [
            ("JOHN", "John"),
            ("mary", "Mary"),
            ("O'BRIEN", "O'brien"),
            ("jean-paul", "Jean-paul"),
            ("  spaced  ", "Spaced"),
        ]

        for input_name, expected_name in test_cases:
            response = await client.post(
                f"/api/classes/{test_class.id}/attendance",
                headers=auth_headers,
                json={
                    "student_first_name": input_name,
                    "student_last_name": "Test",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                },
            )

            assert response.status_code == 201
            data = response.json()
            assert data["student_first_name"] == expected_name

    async def test_name_filtering_case_insensitive(
        self, client: AsyncClient, auth_headers: dict, test_class: Class, db
    ):
        """Test that name filtering is case-insensitive."""
        from app.models.attendance import AttendanceRecord

        # Create record with mixed case
        record = AttendanceRecord(
            class_id=test_class.id,
            student_first_name="McDonald",
            student_last_name="Johnson",
            timestamp=datetime.now(timezone.utc),
        )
        db.add(record)
        await db.commit()

        # Search with lowercase
        response = await client.get(
            f"/api/classes/{test_class.id}/attendance?student_name=mcdonald",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) >= 1
        assert any("McDonald" in r["student_first_name"] for r in data["items"])

        # Search with partial name
        response = await client.get(
            f"/api/classes/{test_class.id}/attendance?student_name=john",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) >= 1


@pytest.mark.asyncio
class TestDateFiltering:
    """Tests for date range filtering."""

    async def test_filter_by_date_from(
        self, client: AsyncClient, auth_headers: dict, test_class: Class, db
    ):
        """Test filtering by start date only."""
        from urllib.parse import quote
        from app.models.attendance import AttendanceRecord

        # Create old and new records
        old_date = datetime.now(timezone.utc) - timedelta(days=10)
        new_date = datetime.now(timezone.utc)

        old_record = AttendanceRecord(
            class_id=test_class.id,
            student_first_name="Old",
            student_last_name="Record",
            timestamp=old_date,
        )
        new_record = AttendanceRecord(
            class_id=test_class.id,
            student_first_name="New",
            student_last_name="Record",
            timestamp=new_date,
        )

        db.add_all([old_record, new_record])
        await db.commit()

        # Filter from 5 days ago
        cutoff = datetime.now(timezone.utc) - timedelta(days=5)
        response = await client.get(
            f"/api/classes/{test_class.id}/attendance?date_from={quote(cutoff.isoformat())}",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()

        # Should only have new record
        names = [(r["student_first_name"], r["student_last_name"]) for r in data["items"]]
        assert ("New", "Record") in names
        assert ("Old", "Record") not in names

    async def test_filter_by_date_to(
        self, client: AsyncClient, auth_headers: dict, test_class: Class, db
    ):
        """Test filtering by end date only."""
        from urllib.parse import quote
        from app.models.attendance import AttendanceRecord

        # Create records at different times
        past_date = datetime.now(timezone.utc) - timedelta(days=10)
        recent_date = datetime.now(timezone.utc) - timedelta(days=3)

        past_record = AttendanceRecord(
            class_id=test_class.id,
            student_first_name="Past",
            student_last_name="Record",
            timestamp=past_date,
        )
        recent_record = AttendanceRecord(
            class_id=test_class.id,
            student_first_name="Recent",
            student_last_name="Record",
            timestamp=recent_date,
        )

        db.add_all([past_record, recent_record])
        await db.commit()

        # Filter up to 5 days ago
        cutoff = datetime.now(timezone.utc) - timedelta(days=5)
        response = await client.get(
            f"/api/classes/{test_class.id}/attendance?date_to={quote(cutoff.isoformat())}",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()

        # Should only have past record
        names = [(r["student_first_name"], r["student_last_name"]) for r in data["items"]]
        assert ("Past", "Record") in names
        assert ("Recent", "Record") not in names

    async def test_filter_by_both_dates(
        self, client: AsyncClient, auth_headers: dict, test_class: Class, db
    ):
        """Test filtering with both date_from and date_to."""
        from urllib.parse import quote
        from app.models.attendance import AttendanceRecord

        # Create records at different times
        base_date = datetime.now(timezone.utc)

        records = [
            AttendanceRecord(
                class_id=test_class.id,
                student_first_name=f"Student{i}",
                student_last_name="Test",
                timestamp=base_date - timedelta(days=i),
            )
            for i in range(15)  # 0 to 14 days ago
        ]

        db.add_all(records)
        await db.commit()

        # Filter for days 5-10
        date_from = base_date - timedelta(days=10)
        date_to = base_date - timedelta(days=5)

        response = await client.get(
            f"/api/classes/{test_class.id}/attendance"
            f"?date_from={quote(date_from.isoformat())}"
            f"&date_to={quote(date_to.isoformat())}",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()

        # Should have 6 records (days 5, 6, 7, 8, 9, 10)
        assert len(data["items"]) == 6
        assert data["total"] == 6


@pytest.mark.asyncio
class TestAttendancePermissions:
    """Tests for attendance access permissions."""

    async def test_cannot_access_other_teacher_class(
        self, client: AsyncClient, db, test_class: Class
    ):
        """Test that a teacher cannot access another teacher's class attendance."""
        from app.models.user import User
        from app.core.security import hash_password

        # Create another teacher
        other_teacher = User(
            email="other@example.com",
            password_hash=hash_password("password123"),
            active=True,
        )
        db.add(other_teacher)
        await db.commit()

        # Login as other teacher
        response = await client.post(
            "/api/auth/login",
            json={"email": "other@example.com", "password": "password123"},
        )
        assert response.status_code == 200
        other_token = response.json()["access_token"]
        other_headers = {"Authorization": f"Bearer {other_token}"}

        # Try to access test_class attendance
        response = await client.get(
            f"/api/classes/{test_class.id}/attendance",
            headers=other_headers,
        )

        assert response.status_code == 403

    async def test_cannot_create_attendance_for_other_teacher_class(
        self, client: AsyncClient, db, test_class: Class
    ):
        """Test that a teacher cannot create attendance for another teacher's class."""
        from app.models.user import User
        from app.core.security import hash_password

        # Create another teacher
        other_teacher = User(
            email="other2@example.com",
            password_hash=hash_password("password123"),
            active=True,
        )
        db.add(other_teacher)
        await db.commit()

        # Login as other teacher
        response = await client.post(
            "/api/auth/login",
            json={"email": "other2@example.com", "password": "password123"},
        )
        assert response.status_code == 200
        other_token = response.json()["access_token"]
        other_headers = {"Authorization": f"Bearer {other_token}"}

        # Try to create attendance for test_class
        response = await client.post(
            f"/api/classes/{test_class.id}/attendance",
            headers=other_headers,
            json={
                "student_first_name": "Test",
                "student_last_name": "Student",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
        )

        assert response.status_code == 403

