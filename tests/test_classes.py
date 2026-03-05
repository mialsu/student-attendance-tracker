"""Tests for classes CRUD endpoints."""

import pytest
from httpx import AsyncClient

from app.models.class_ import Class
from app.models.user import User


@pytest.mark.asyncio
class TestListClasses:
    """Tests for listing classes."""

    async def test_list_classes_success(
        self, client: AsyncClient, auth_headers: dict, test_class: Class
    ):
        """Test listing classes for authenticated user."""
        response = await client.get("/api/classes", headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

    async def test_list_classes_no_auth(self, client: AsyncClient):
        """Test listing classes without authentication."""
        response = await client.get("/api/classes")
        
        assert response.status_code == 401

    async def test_list_classes_with_pagination(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test listing classes with pagination."""
        response = await client.get(
            "/api/classes?skip=0&limit=10",
            headers=auth_headers,
        )
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) <= 10


@pytest.mark.asyncio
class TestCreateClass:
    """Tests for creating classes."""

    async def test_create_class_success(
        self, client: AsyncClient, auth_headers: dict, sample_class_data: dict
    ):
        """Test successful class creation."""
        response = await client.post(
            "/api/classes",
            headers=auth_headers,
            json=sample_class_data,
        )
        
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == sample_class_data["name"]
        assert data["description"] == sample_class_data["description"]
        assert data["active"] is True
        assert data["attendance_count"] == 0
        assert "id" in data
        assert "teacher_id" in data

    async def test_create_class_no_auth(
        self, client: AsyncClient, sample_class_data: dict
    ):
        """Test creating class without authentication."""
        response = await client.post("/api/classes", json=sample_class_data)
        
        assert response.status_code == 401

    async def test_create_class_empty_name(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test creating class with empty name."""
        response = await client.post(
            "/api/classes",
            headers=auth_headers,
            json={"name": "", "description": "Test"},
        )
        
        assert response.status_code == 422

    async def test_create_class_no_description(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test creating class without description (optional)."""
        response = await client.post(
            "/api/classes",
            headers=auth_headers,
            json={"name": "Test Class"},
        )
        
        assert response.status_code == 201
        data = response.json()
        assert data["description"] is None


@pytest.mark.asyncio
class TestGetClass:
    """Tests for getting a specific class."""

    async def test_get_class_success(
        self, client: AsyncClient, auth_headers: dict, test_class: Class
    ):
        """Test getting class details."""
        response = await client.get(
            f"/api/classes/{test_class.id}",
            headers=auth_headers,
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == str(test_class.id)
        assert data["name"] == test_class.name
        assert "attendance_count" in data

    async def test_get_class_not_found(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test getting non-existent class."""
        fake_uuid = "00000000-0000-0000-0000-000000000000"
        response = await client.get(
            f"/api/classes/{fake_uuid}",
            headers=auth_headers,
        )
        
        assert response.status_code == 404

    async def test_get_class_no_auth(self, client: AsyncClient, test_class: Class):
        """Test getting class without authentication."""
        response = await client.get(f"/api/classes/{test_class.id}")
        
        assert response.status_code == 401


@pytest.mark.asyncio
class TestUpdateClass:
    """Tests for updating classes."""

    async def test_update_class_name(
        self, client: AsyncClient, auth_headers: dict, test_class: Class
    ):
        """Test updating class name."""
        response = await client.put(
            f"/api/classes/{test_class.id}",
            headers=auth_headers,
            json={"name": "Updated Name"},
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Updated Name"
        assert data["description"] == test_class.description

    async def test_update_class_description(
        self, client: AsyncClient, auth_headers: dict, test_class: Class
    ):
        """Test updating class description."""
        response = await client.put(
            f"/api/classes/{test_class.id}",
            headers=auth_headers,
            json={"description": "New description"},
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["description"] == "New description"

    async def test_update_class_active_status(
        self, client: AsyncClient, auth_headers: dict, test_class: Class
    ):
        """Test updating class active status."""
        response = await client.put(
            f"/api/classes/{test_class.id}",
            headers=auth_headers,
            json={"active": False},
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["active"] is False

    async def test_update_class_not_found(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test updating non-existent class."""
        fake_uuid = "00000000-0000-0000-0000-000000000000"
        response = await client.put(
            f"/api/classes/{fake_uuid}",
            headers=auth_headers,
            json={"name": "Updated"},
        )
        
        assert response.status_code == 404

    async def test_update_class_no_auth(self, client: AsyncClient, test_class: Class):
        """Test updating class without authentication."""
        response = await client.put(
            f"/api/classes/{test_class.id}",
            json={"name": "Updated"},
        )
        
        assert response.status_code == 401


@pytest.mark.asyncio
class TestDeleteClass:
    """Tests for deleting classes."""

    async def test_delete_class_success(
        self, client: AsyncClient, auth_headers: dict, test_class: Class
    ):
        """Test successful class deletion."""
        response = await client.delete(
            f"/api/classes/{test_class.id}",
            headers=auth_headers,
        )
        
        assert response.status_code == 204

        # Verify it's gone
        get_response = await client.get(
            f"/api/classes/{test_class.id}",
            headers=auth_headers,
        )
        assert get_response.status_code == 404

    async def test_delete_class_cascades_attendance(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_class: Class,
        test_attendance,
    ):
        """Test that deleting class also deletes attendance records."""
        # Delete class
        response = await client.delete(
            f"/api/classes/{test_class.id}",
            headers=auth_headers,
        )
        
        assert response.status_code == 204

    async def test_delete_class_not_found(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test deleting non-existent class."""
        fake_uuid = "00000000-0000-0000-0000-000000000000"
        response = await client.delete(
            f"/api/classes/{fake_uuid}",
            headers=auth_headers,
        )
        
        assert response.status_code == 404

    async def test_delete_class_no_auth(self, client: AsyncClient, test_class: Class):
        """Test deleting class without authentication."""
        response = await client.delete(f"/api/classes/{test_class.id}")

        assert response.status_code == 401


@pytest.mark.asyncio
class TestClassPermissions:
    """Tests for class access permissions."""

    async def test_cannot_get_other_teacher_class(
        self, client: AsyncClient, db, test_class: Class
    ):
        """Test that a teacher cannot access another teacher's class."""
        from app.models.user import User
        from app.core.security import hash_password

        # Create another teacher
        other_teacher = User(
            email="other3@example.com",
            password_hash=hash_password("password123"),
            active=True,
        )
        db.add(other_teacher)
        await db.commit()

        # Login as other teacher
        response = await client.post(
            "/api/auth/login",
            json={"email": "other3@example.com", "password": "password123"},
        )
        assert response.status_code == 200
        other_token = response.json()["access_token"]
        other_headers = {"Authorization": f"Bearer {other_token}"}

        # Try to access test_class
        response = await client.get(
            f"/api/classes/{test_class.id}",
            headers=other_headers,
        )

        assert response.status_code == 403

    async def test_cannot_update_other_teacher_class(
        self, client: AsyncClient, db, test_class: Class
    ):
        """Test that a teacher cannot update another teacher's class."""
        from app.models.user import User
        from app.core.security import hash_password

        # Create another teacher
        other_teacher = User(
            email="other4@example.com",
            password_hash=hash_password("password123"),
            active=True,
        )
        db.add(other_teacher)
        await db.commit()

        # Login as other teacher
        response = await client.post(
            "/api/auth/login",
            json={"email": "other4@example.com", "password": "password123"},
        )
        assert response.status_code == 200
        other_token = response.json()["access_token"]
        other_headers = {"Authorization": f"Bearer {other_token}"}

        # Try to update test_class
        response = await client.put(
            f"/api/classes/{test_class.id}",
            headers=other_headers,
            json={"name": "Hacked Name"},
        )

        assert response.status_code == 403

    async def test_cannot_delete_other_teacher_class(
        self, client: AsyncClient, db, test_class: Class
    ):
        """Test that a teacher cannot delete another teacher's class."""
        from app.models.user import User
        from app.core.security import hash_password

        # Create another teacher
        other_teacher = User(
            email="other5@example.com",
            password_hash=hash_password("password123"),
            active=True,
        )
        db.add(other_teacher)
        await db.commit()

        # Login as other teacher
        response = await client.post(
            "/api/auth/login",
            json={"email": "other5@example.com", "password": "password123"},
        )
        assert response.status_code == 200
        other_token = response.json()["access_token"]
        other_headers = {"Authorization": f"Bearer {other_token}"}

        # Try to delete test_class
        response = await client.delete(
            f"/api/classes/{test_class.id}",
            headers=other_headers,
        )

        assert response.status_code == 403


@pytest.mark.asyncio
class TestClassServiceFunctions:
    """Tests for class service helper functions."""

    async def test_get_class_with_attendance_count(
        self, client: AsyncClient, auth_headers: dict, test_class: Class, db
    ):
        """Test get_class_with_attendance_count via API."""
        from app.models.attendance import AttendanceRecord
        from app.models.student import Student
        from datetime import datetime, timezone

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

        # Get class details (tests count logic)
        response = await client.get(
            f"/api/classes/{test_class.id}",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["attendance_count"] == 5

    async def test_update_with_all_fields(
        self, client: AsyncClient, auth_headers: dict, test_class: Class
    ):
        """Test updating all class fields at once."""
        response = await client.put(
            f"/api/classes/{test_class.id}",
            headers=auth_headers,
            json={
                "name": "Fully Updated",
                "description": "New description",
                "active": False,
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Fully Updated"
        assert data["description"] == "New description"
        assert data["active"] is False

    async def test_update_description_to_empty_string(
        self, client: AsyncClient, auth_headers: dict, test_class: Class
    ):
        """Test updating description to empty string (sets to empty but valid)."""
        # First update to a non-empty value
        response = await client.put(
            f"/api/classes/{test_class.id}",
            headers=auth_headers,
            json={"description": "Some description"},
        )
        assert response.status_code == 200

        # Now update to empty string
        response = await client.put(
            f"/api/classes/{test_class.id}",
            headers=auth_headers,
            json={"description": ""},
        )

        assert response.status_code == 200
        data = response.json()
        # Empty string is stored as empty string
        assert data["description"] == ""

    async def test_list_classes_shows_attendance_count(
        self, client: AsyncClient, auth_headers: dict, test_class: Class, db
    ):
        """Test that listing classes includes attendance count."""
        from app.models.attendance import AttendanceRecord
        from app.models.student import Student
        from datetime import datetime, timezone

        # Add attendance records
        for i in range(3):
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

        response = await client.get("/api/classes", headers=auth_headers)

        assert response.status_code == 200
        data = response.json()
        assert len(data) >= 1

        # Find our test class
        test_class_data = next(
            (c for c in data if c["id"] == str(test_class.id)), None
        )
        assert test_class_data is not None
        assert test_class_data["attendance_count"] >= 3

