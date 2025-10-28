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

