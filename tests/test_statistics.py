"""Tests for attendance statistics endpoint."""

import pytest
from datetime import datetime, timedelta
from httpx import AsyncClient
from app.models.class_ import Class


@pytest.mark.asyncio
class TestAttendanceStatistics:
    """Test suite for attendance statistics endpoint."""

    async def test_get_statistics_success(
        self, client: AsyncClient, auth_headers: dict, test_class: Class
    ):
        """Test getting statistics for a class."""
        class_id = test_class.id

        # Create some attendance records
        today = datetime.now()
        yesterday = today - timedelta(days=1)

        # Create attendance for 2 different days
        for date in [today, yesterday]:
            for i in range(3):
                response = await client.post(
                    f"/api/classes/{class_id}/attendance",
                    headers=auth_headers,
                    json={
                        "student_name": f"Student {i}",
                        "timestamp": date.isoformat(),
                    },
                )
                assert response.status_code == 201

        # Get statistics
        response = await client.get(
            f"/api/classes/{class_id}/attendance/statistics",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()

        # Verify structure
        assert "total_records" in data
        assert "total_students" in data
        assert "daily_stats" in data
        assert "monthly_stats" in data

        # Verify data
        assert data["total_records"] == 6  # 3 students × 2 days
        assert data["total_students"] == 3  # 3 unique students
        assert len(data["daily_stats"]) == 2  # 2 different days

    async def test_get_statistics_with_exclude_dates(
        self, client: AsyncClient, auth_headers: dict, test_class: Class
    ):
        """Test excluding specific dates from statistics."""
        class_id = test_class.id

        # Create attendance for 3 different days
        today = datetime.now()
        yesterday = today - timedelta(days=1)
        two_days_ago = today - timedelta(days=2)

        dates = [today, yesterday, two_days_ago]
        for date in dates:
            response = await client.post(
                f"/api/classes/{class_id}/attendance",
                headers=auth_headers,
                json={
                    "student_name": "Test Student",
                    "timestamp": date.isoformat(),
                },
            )
            assert response.status_code == 201

        # Get statistics excluding yesterday
        exclude_date = yesterday.strftime("%Y-%m-%d")
        response = await client.get(
            f"/api/classes/{class_id}/attendance/statistics",
            headers=auth_headers,
            params={"exclude_dates": exclude_date},
        )

        assert response.status_code == 200
        data = response.json()

        # Total should still show ALL data
        assert data["total_records"] == 3  # All 3 records
        assert data["total_students"] == 1  # Same student

        # But daily stats should only show 2 days (yesterday excluded)
        assert len(data["daily_stats"]) == 2
        daily_dates = [stat["date"] for stat in data["daily_stats"]]
        assert exclude_date not in daily_dates

    async def test_get_statistics_exclude_multiple_dates(
        self, client: AsyncClient, auth_headers: dict, test_class: Class
    ):
        """Test excluding multiple dates from statistics."""
        class_id = test_class.id

        # Create attendance for 4 different days with explicit dates
        dates_str = ["2026-03-10", "2026-03-11", "2026-03-12", "2026-03-13"]

        for date_str in dates_str:
            response = await client.post(
                f"/api/classes/{class_id}/attendance",
                headers=auth_headers,
                json={
                    "student_name": "Test Student",
                    "timestamp": f"{date_str}T12:00:00Z",
                },
            )
            assert response.status_code == 201

        # Exclude first and last dates
        exclude_dates = f"{dates_str[0]},{dates_str[3]}"
        response = await client.get(
            f"/api/classes/{class_id}/attendance/statistics",
            headers=auth_headers,
            params={"exclude_dates": exclude_dates},
        )

        assert response.status_code == 200
        data = response.json()

        # Total should show all 4 records
        assert data["total_records"] == 4

        # Daily stats should only show 2 days (middle two)
        daily_dates = [stat["date"] for stat in data["daily_stats"]]
        assert dates_str[0] not in daily_dates  # March 10 excluded
        assert dates_str[3] not in daily_dates  # March 13 excluded
        assert dates_str[1] in daily_dates      # March 11 included
        assert dates_str[2] in daily_dates      # March 12 included

    async def test_get_statistics_empty_class(
        self, client: AsyncClient, auth_headers: dict, test_class: Class
    ):
        """Test statistics for class with no attendance."""
        class_id = test_class.id

        response = await client.get(
            f"/api/classes/{class_id}/attendance/statistics",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()

        assert data["total_records"] == 0
        assert data["total_students"] == 0
        assert data["daily_stats"] == []
        assert data["monthly_stats"] == []
        assert data["first_date"] is None
        assert data["last_date"] is None

    async def test_get_statistics_unauthorized(
        self, client: AsyncClient, test_class: Class
    ):
        """Test accessing statistics without authentication."""
        class_id = test_class.id

        response = await client.get(
            f"/api/classes/{class_id}/attendance/statistics"
        )

        assert response.status_code == 401

    async def test_get_statistics_wrong_teacher(
        self, client: AsyncClient, db, test_class: Class
    ):
        """Test accessing another teacher's class statistics."""
        from app.models.user import User
        from app.core.security import hash_password

        # Create another teacher
        other_teacher = User(
            email="other_statistics@example.com",
            password_hash=hash_password("password123"),
        )
        db.add(other_teacher)
        await db.commit()

        # Login as other teacher
        login_response = await client.post(
            "/api/auth/login",
            json={"email": "other_statistics@example.com", "password": "password123"},
        )
        assert login_response.status_code == 200
        other_token = login_response.json()["access_token"]
        other_headers = {"Authorization": f"Bearer {other_token}"}

        # Try to access first teacher's class statistics
        response = await client.get(
            f"/api/classes/{test_class.id}/attendance/statistics",
            headers=other_headers,
        )

        assert response.status_code == 403

    async def test_get_statistics_invalid_exclude_dates(
        self, client: AsyncClient, auth_headers: dict, test_class: Class
    ):
        """Test that invalid dates in exclude_dates are silently ignored."""
        class_id = test_class.id

        # Create one attendance record
        response = await client.post(
            f"/api/classes/{class_id}/attendance",
            headers=auth_headers,
            json={"student_name": "Test Student"},
        )
        assert response.status_code == 201

        # Request with invalid date format (should be ignored)
        response = await client.get(
            f"/api/classes/{class_id}/attendance/statistics",
            headers=auth_headers,
            params={"exclude_dates": "invalid-date,2026-13-99"},
        )

        # Should succeed and return data (invalid dates ignored)
        assert response.status_code == 200
        data = response.json()
        assert data["total_records"] == 1
