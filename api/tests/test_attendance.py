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
        assert any("john" in r["student"]["name"].lower() for r in data["items"])

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
        # Check new structure
        assert "student" in data
        assert "name" in data["student"]
        assert data["student"]["name"] == "Jane Smith"
        # Backward compatibility fields
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
                "student_name": "john DOE",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
        )

        assert response.status_code == 201
        data = response.json()
        assert data["student"]["name"] == "John Doe"
        # Backward compatibility
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
                "student_name": "",
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

        # Check paginated response structure
        assert isinstance(data, dict)
        assert "items" in data
        assert "total" in data
        assert "skip" in data
        assert "limit" in data
        assert isinstance(data["items"], list)
        assert len(data["items"]) >= 1

        # Check student structure
        student = data["items"][0]
        assert "student_id" in student
        assert "student_name" in student
        assert "course_credit_received" in student
        assert "total_attendance" in student
        assert "records" in student
        assert isinstance(student["records"], list)

    async def test_summary_groups_case_insensitive(
        self, client: AsyncClient, auth_headers: dict, test_class: Class, db
    ):
        """Test that summary groups students case-insensitively."""
        from app.models.attendance import AttendanceRecord
        from app.models.student import Student

        # Create student via API with proper name normalization
        response1 = await client.post(
            f"/api/classes/{test_class.id}/attendance",
            headers=auth_headers,
            json={
                "student_name": "John Doe",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
        )
        assert response1.status_code == 201

        # Create another record for same student (case-insensitive match)
        response2 = await client.post(
            f"/api/classes/{test_class.id}/attendance",
            headers=auth_headers,
            json={
                "student_name": "john doe",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
        )
        assert response2.status_code == 201

        response = await client.get(
            f"/api/classes/{test_class.id}/attendance/summary",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        items = data["items"]

        # Should be grouped as one student
        john_does = [s for s in items if "john doe" in s["student_name"].lower()]
        assert len(john_does) == 1
        assert john_does[0]["total_attendance"] >= 2

    async def test_summary_with_search(
        self, client: AsyncClient, auth_headers: dict, test_class: Class
    ):
        """Test filtering students by name search."""
        # Create multiple students
        await client.post(
            f"/api/classes/{test_class.id}/attendance",
            headers=auth_headers,
            json={
                "student_name": "John Doe",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
        )
        await client.post(
            f"/api/classes/{test_class.id}/attendance",
            headers=auth_headers,
            json={
                "student_name": "Jane Smith",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
        )
        await client.post(
            f"/api/classes/{test_class.id}/attendance",
            headers=auth_headers,
            json={
                "student_name": "Bob Johnson",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
        )

        # Search for "john" - should match both "John Doe" and "Bob Johnson"
        response = await client.get(
            f"/api/classes/{test_class.id}/attendance/summary?search=john",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 2
        assert len(data["items"]) == 2

        names = [s["student_name"].lower() for s in data["items"]]
        assert any("john" in name for name in names)

    async def test_summary_with_pagination(
        self, client: AsyncClient, auth_headers: dict, test_class: Class
    ):
        """Test pagination of summary results."""
        # Create multiple students
        for i in range(5):
            await client.post(
                f"/api/classes/{test_class.id}/attendance",
                headers=auth_headers,
                json={
                    "student_name": f"Student {i}",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                },
            )

        # Get first page (2 items)
        response = await client.get(
            f"/api/classes/{test_class.id}/attendance/summary?skip=0&limit=2",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) == 2
        assert data["total"] == 5
        assert data["skip"] == 0
        assert data["limit"] == 2

        # Get second page
        response = await client.get(
            f"/api/classes/{test_class.id}/attendance/summary?skip=2&limit=2",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) == 2
        assert data["total"] == 5
        assert data["skip"] == 2

    async def test_summary_sorted_by_attendance(
        self, client: AsyncClient, auth_headers: dict, test_class: Class
    ):
        """Test sorting by attendance count descending."""
        # Create students with different attendance counts
        # Student A: 3 attendances
        for _ in range(3):
            await client.post(
                f"/api/classes/{test_class.id}/attendance",
                headers=auth_headers,
                json={
                    "student_name": "Student A",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                },
            )

        # Student B: 1 attendance
        await client.post(
            f"/api/classes/{test_class.id}/attendance",
            headers=auth_headers,
            json={
                "student_name": "Student B",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
        )

        # Student C: 5 attendances
        for _ in range(5):
            await client.post(
                f"/api/classes/{test_class.id}/attendance",
                headers=auth_headers,
                json={
                    "student_name": "Student C",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                },
            )

        # Get summary sorted by attendance (default)
        response = await client.get(
            f"/api/classes/{test_class.id}/attendance/summary?sort_by=attendance_desc",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        items = data["items"]

        # Verify descending order by attendance count
        assert len(items) >= 3
        for i in range(len(items) - 1):
            assert items[i]["total_attendance"] >= items[i + 1]["total_attendance"]

        # Student C should be first (5 attendances)
        assert items[0]["student_name"] == "Student C"
        assert items[0]["total_attendance"] == 5

    async def test_summary_sorted_by_name(
        self, client: AsyncClient, auth_headers: dict, test_class: Class
    ):
        """Test sorting by name alphabetically."""
        # Create students
        for name in ["Zoe", "Alice", "Mike"]:
            await client.post(
                f"/api/classes/{test_class.id}/attendance",
                headers=auth_headers,
                json={
                    "student_name": name,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                },
            )

        # Get summary sorted by name
        response = await client.get(
            f"/api/classes/{test_class.id}/attendance/summary?sort_by=name_asc",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        items = data["items"]

        # Verify alphabetical order
        names = [s["student_name"] for s in items]
        assert names == sorted(names)

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
class TestNameNormalization:
    """Tests for student name normalization."""

    async def test_normalize_various_name_formats(
        self, client: AsyncClient, auth_headers: dict, test_class: Class
    ):
        """Test normalization of various name formats."""
        test_cases = [
            ("JOHN TEST", "John Test"),
            ("mary test", "Mary Test"),
            ("O'BRIEN test", "O'brien Test"),
            ("jean-paul test", "Jean-paul Test"),
            ("  spaced  test  ", "Spaced Test"),
        ]

        for input_name, expected_name in test_cases:
            response = await client.post(
                f"/api/classes/{test_class.id}/attendance",
                headers=auth_headers,
                json={
                    "student_name": input_name,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                },
            )

            assert response.status_code == 201
            data = response.json()
            assert data["student"]["name"] == expected_name

    async def test_name_filtering_case_insensitive(
        self, client: AsyncClient, auth_headers: dict, test_class: Class, db
    ):
        """Test that name filtering is case-insensitive."""
        # Create attendance via API
        await client.post(
            f"/api/classes/{test_class.id}/attendance",
            headers=auth_headers,
            json={
                "student_name": "McDonald Johnson",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
        )

        # Search with lowercase
        response = await client.get(
            f"/api/classes/{test_class.id}/attendance?student_name=mcdonald",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) >= 1
        assert any("mcdonald" in r["student"]["name"].lower() for r in data["items"])

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

        # Create old and new records via API
        old_date = datetime.now(timezone.utc) - timedelta(days=10)
        new_date = datetime.now(timezone.utc)

        await client.post(
            f"/api/classes/{test_class.id}/attendance",
            headers=auth_headers,
            json={
                "student_name": "Old Record",
                "timestamp": old_date.isoformat(),
            },
        )

        await client.post(
            f"/api/classes/{test_class.id}/attendance",
            headers=auth_headers,
            json={
                "student_name": "New Record",
                "timestamp": new_date.isoformat(),
            },
        )

        # Filter from 5 days ago
        cutoff = datetime.now(timezone.utc) - timedelta(days=5)
        response = await client.get(
            f"/api/classes/{test_class.id}/attendance?date_from={quote(cutoff.isoformat())}",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()

        # Should only have new record
        names = [r["student"]["name"] for r in data["items"]]
        assert "New Record" in names
        assert "Old Record" not in names

    async def test_filter_by_date_to(
        self, client: AsyncClient, auth_headers: dict, test_class: Class, db
    ):
        """Test filtering by end date only."""
        from urllib.parse import quote

        # Create records at different times via API
        past_date = datetime.now(timezone.utc) - timedelta(days=10)
        recent_date = datetime.now(timezone.utc) - timedelta(days=3)

        await client.post(
            f"/api/classes/{test_class.id}/attendance",
            headers=auth_headers,
            json={
                "student_name": "Past Record",
                "timestamp": past_date.isoformat(),
            },
        )

        await client.post(
            f"/api/classes/{test_class.id}/attendance",
            headers=auth_headers,
            json={
                "student_name": "Recent Record",
                "timestamp": recent_date.isoformat(),
            },
        )

        # Filter up to 5 days ago
        cutoff = datetime.now(timezone.utc) - timedelta(days=5)
        response = await client.get(
            f"/api/classes/{test_class.id}/attendance?date_to={quote(cutoff.isoformat())}",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()

        # Should only have past record
        names = [r["student"]["name"] for r in data["items"]]
        assert "Past Record" in names
        assert "Recent Record" not in names

    async def test_filter_by_both_dates(
        self, client: AsyncClient, auth_headers: dict, test_class: Class, db
    ):
        """Test filtering with both date_from and date_to."""
        from urllib.parse import quote

        # Create records at different times via API
        base_date = datetime.now(timezone.utc)

        for i in range(15):  # 0 to 14 days ago
            await client.post(
                f"/api/classes/{test_class.id}/attendance",
                headers=auth_headers,
                json={
                    "student_name": f"Student{i} Test",
                    "timestamp": (base_date - timedelta(days=i)).isoformat(),
                },
            )

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
                "student_name": "Test Student",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
        )

        assert response.status_code == 403

