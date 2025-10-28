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
        assert isinstance(data, list)
        assert len(data) >= 1

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
        assert isinstance(data, list)
        assert len(data) <= 10

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
        assert len(data) >= 1
        assert any("John" in r["student_first_name"] for r in data)

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
        names = [(r["student_first_name"], r["student_last_name"]) for r in data]
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
        names = [(r["student_first_name"], r["student_last_name"]) for r in data]
        assert ("Old", "Student") in names

