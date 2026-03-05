"""Tests for bulk attendance logging functionality."""

import pytest
from httpx import AsyncClient
from sqlalchemy import select, func
from app.models.attendance import AttendanceRecord


@pytest.mark.asyncio
class TestBulkAttendanceCreation:
    """Tests for creating multiple attendance records at once."""

    async def test_create_bulk_attendance_default_quantity(
        self, client: AsyncClient, auth_headers: dict, test_class
    ):
        """Test that default quantity=1 works (backward compatibility)."""
        response = await client.post(
            f"/api/classes/{test_class.id}/attendance",
            headers=auth_headers,
            json={
                "student_name": "John Doe",
                "timestamp": "2024-01-01T10:00:00Z",
            },
        )

        assert response.status_code == 201
        data = response.json()
        assert data["student_name"] == "John Doe"
        assert data["quantity_created"] is None  # None for single record

    async def test_create_bulk_attendance_quantity_5(
        self, client: AsyncClient, auth_headers: dict, test_class, db
    ):
        """Test creating 5 attendance records at once."""
        response = await client.post(
            f"/api/classes/{test_class.id}/attendance",
            headers=auth_headers,
            json={
                "student_name": "Jane Smith",
                "timestamp": "2024-01-01T10:00:00Z",
                "quantity": 5,
            },
        )

        assert response.status_code == 201
        data = response.json()
        assert data["student_name"] == "Jane Smith"
        assert data["quantity_created"] == 5
        assert data["total_attendance"] == 5

        # Verify in database
        result = await db.execute(
            select(func.count(AttendanceRecord.id))
            .where(AttendanceRecord.student_id == data["student"]["id"])
        )
        count = result.scalar()
        assert count == 5

    async def test_create_bulk_attendance_max_quantity_50(
        self, client: AsyncClient, auth_headers: dict, test_class
    ):
        """Test creating maximum allowed (50) records."""
        response = await client.post(
            f"/api/classes/{test_class.id}/attendance",
            headers=auth_headers,
            json={
                "student_name": "Max Records",
                "timestamp": "2024-01-01T10:00:00Z",
                "quantity": 50,
            },
        )

        assert response.status_code == 201
        data = response.json()
        assert data["quantity_created"] == 50
        assert data["total_attendance"] == 50

    async def test_create_bulk_attendance_exceeds_max(
        self, client: AsyncClient, auth_headers: dict, test_class
    ):
        """Test that quantity > 50 is rejected."""
        response = await client.post(
            f"/api/classes/{test_class.id}/attendance",
            headers=auth_headers,
            json={
                "student_name": "Too Many",
                "timestamp": "2024-01-01T10:00:00Z",
                "quantity": 51,
            },
        )

        assert response.status_code == 422  # Validation error

    async def test_create_bulk_attendance_zero_quantity(
        self, client: AsyncClient, auth_headers: dict, test_class
    ):
        """Test that quantity=0 is rejected."""
        response = await client.post(
            f"/api/classes/{test_class.id}/attendance",
            headers=auth_headers,
            json={
                "student_name": "Zero Records",
                "timestamp": "2024-01-01T10:00:00Z",
                "quantity": 0,
            },
        )

        assert response.status_code == 422

    async def test_bulk_attendance_updates_total_count(
        self, client: AsyncClient, auth_headers: dict, test_class
    ):
        """Test that bulk creation correctly updates total attendance count."""
        # Create initial records
        await client.post(
            f"/api/classes/{test_class.id}/attendance",
            headers=auth_headers,
            json={
                "student_name": "Repeat Student",
                "timestamp": "2024-01-01T09:00:00Z",
                "quantity": 3,
            },
        )

        # Create more for same student
        response = await client.post(
            f"/api/classes/{test_class.id}/attendance",
            headers=auth_headers,
            json={
                "student_name": "Repeat Student",
                "timestamp": "2024-01-01T10:00:00Z",
                "quantity": 2,
            },
        )

        assert response.status_code == 201
        data = response.json()
        assert data["quantity_created"] == 2
        assert data["total_attendance"] == 5  # 3 + 2

    async def test_bulk_attendance_same_timestamp(
        self, client: AsyncClient, auth_headers: dict, test_class, db
    ):
        """Test that all bulk records have same timestamp."""
        response = await client.post(
            f"/api/classes/{test_class.id}/attendance",
            headers=auth_headers,
            json={
                "student_name": "Timestamp Check",
                "timestamp": "2024-01-01T10:30:00Z",
                "quantity": 10,
            },
        )

        assert response.status_code == 201
        data = response.json()

        # Fetch all records for this student
        result = await db.execute(
            select(AttendanceRecord)
            .where(AttendanceRecord.student_id == data["student"]["id"])
        )
        records = result.scalars().all()

        # All should have same timestamp
        timestamps = [r.timestamp for r in records]
        assert len(set(timestamps)) == 1

    async def test_bulk_attendance_inactive_class_fails(
        self, client: AsyncClient, auth_headers: dict, inactive_class
    ):
        """Test that bulk creation fails for inactive class."""
        response = await client.post(
            f"/api/classes/{inactive_class.id}/attendance",
            headers=auth_headers,
            json={
                "student_name": "John Doe",
                "timestamp": "2024-01-01T10:00:00Z",
                "quantity": 5,
            },
        )

        assert response.status_code == 400
        assert "inactive" in response.text.lower()
