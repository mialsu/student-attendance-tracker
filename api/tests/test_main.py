"""Tests for main application endpoints."""

import pytest


@pytest.mark.asyncio
async def test_root_endpoint(client):
    """Test root endpoint returns correct message."""
    response = await client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["message"] == "Student Attendance Tracker API"
    assert data["version"] == "1.0.0"
    assert "docs" in data


@pytest.mark.asyncio
async def test_health_check(client):
    """Test health check endpoint."""
    response = await client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
