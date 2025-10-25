"""Pytest fixtures and configuration."""

import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app


@pytest.fixture
async def client():
    """
    Create an async test client.

    Usage:
        async def test_endpoint(client):
            response = await client.get("/")
            assert response.status_code == 200
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


# TODO: Add database fixtures
# @pytest.fixture
# async def db():
#     """Create test database session."""
#     pass

# @pytest.fixture
# async def test_user(db):
#     """Create test user."""
#     pass

# @pytest.fixture
# async def test_class(db, test_user):
#     """Create test class."""
#     pass
