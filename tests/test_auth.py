"""Tests for authentication endpoints."""

import pytest
from httpx import AsyncClient

from app.models.user import User


@pytest.mark.asyncio
class TestSignup:
    """Tests for user signup."""

    async def test_signup_success(self, client: AsyncClient, sample_user_data):
        """Test successful user signup."""
        response = await client.post("/api/auth/signup", json=sample_user_data)
        
        assert response.status_code == 201
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "bearer"
        assert data["user"]["email"] == sample_user_data["email"]
        assert data["user"]["active"] is True

    async def test_signup_duplicate_email(self, client: AsyncClient, test_user: User):
        """Test signup with duplicate email fails."""
        response = await client.post(
            "/api/auth/signup",
            json={"email": test_user.email, "password": "password123"},
        )
        
        assert response.status_code == 409
        assert "already" in response.json()["detail"].lower()

    async def test_signup_invalid_email(self, client: AsyncClient):
        """Test signup with invalid email."""
        response = await client.post(
            "/api/auth/signup",
            json={"email": "not-an-email", "password": "password123"},
        )
        
        assert response.status_code == 422

    async def test_signup_short_password(self, client: AsyncClient):
        """Test signup with password too short."""
        response = await client.post(
            "/api/auth/signup",
            json={"email": "test@example.com", "password": "short"},
        )
        
        assert response.status_code == 422


@pytest.mark.asyncio
class TestLogin:
    """Tests for user login."""

    async def test_login_success(self, client: AsyncClient, test_user: User):
        """Test successful login."""
        response = await client.post(
            "/api/auth/login",
            json={"email": test_user.email, "password": "testpassword123"},
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["user"]["email"] == test_user.email

    async def test_login_wrong_password(self, client: AsyncClient, test_user: User):
        """Test login with wrong password."""
        response = await client.post(
            "/api/auth/login",
            json={"email": test_user.email, "password": "wrongpassword"},
        )
        
        assert response.status_code == 401
        assert "invalid" in response.json()["detail"].lower()

    async def test_login_nonexistent_user(self, client: AsyncClient):
        """Test login with non-existent user."""
        response = await client.post(
            "/api/auth/login",
            json={"email": "nonexistent@example.com", "password": "password123"},
        )
        
        assert response.status_code == 401

    async def test_login_inactive_user(self, client: AsyncClient, inactive_user: User):
        """Test login with inactive user account."""
        response = await client.post(
            "/api/auth/login",
            json={"email": inactive_user.email, "password": "testpassword123"},
        )
        
        assert response.status_code == 401
        assert "inactive" in response.json()["detail"].lower()


@pytest.mark.asyncio
class TestTokenRefresh:
    """Tests for token refresh."""

    async def test_refresh_token_success(self, client: AsyncClient):
        """Test successful token refresh."""
        # First login
        login_response = await client.post(
            "/api/auth/signup",
            json={"email": "refresh@example.com", "password": "password123"},
        )
        refresh_token = login_response.json()["refresh_token"]
        
        # Refresh token
        response = await client.post(
            "/api/auth/refresh",
            json={"refresh_token": refresh_token},
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data

    async def test_refresh_invalid_token(self, client: AsyncClient):
        """Test refresh with invalid token."""
        response = await client.post(
            "/api/auth/refresh",
            json={"refresh_token": "invalid.token.here"},
        )
        
        assert response.status_code == 401


@pytest.mark.asyncio
class TestGetCurrentUser:
    """Tests for getting current user info."""

    async def test_get_current_user_success(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test getting current user info."""
        response = await client.get("/api/auth/me", headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert "email" in data
        assert "id" in data
        assert "active" in data

    async def test_get_current_user_no_token(self, client: AsyncClient):
        """Test getting current user without token."""
        response = await client.get("/api/auth/me")
        
        assert response.status_code == 401

    async def test_get_current_user_invalid_token(self, client: AsyncClient):
        """Test getting current user with invalid token."""
        response = await client.get(
            "/api/auth/me",
            headers={"Authorization": "Bearer invalid.token.here"},
        )
        
        assert response.status_code == 401


@pytest.mark.asyncio
class TestUpdateEmail:
    """Tests for email update."""

    async def test_update_email_success(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test successful email update."""
        response = await client.put(
            "/api/auth/email",
            headers=auth_headers,
            json={
                "new_email": "newemail@example.com",
                "current_password": "testpassword123",
            },
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == "newemail@example.com"

    async def test_update_email_wrong_password(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test email update with wrong password."""
        response = await client.put(
            "/api/auth/email",
            headers=auth_headers,
            json={
                "new_email": "newemail@example.com",
                "current_password": "wrongpassword",
            },
        )
        
        assert response.status_code == 401

    async def test_update_email_duplicate(
        self, client: AsyncClient, auth_headers: dict, test_user: User
    ):
        """Test email update to existing email."""
        # First, create another user with a different email
        await client.post(
            "/api/auth/signup",
            json={
                "email": "another@example.com",
                "password": "testpassword123",
            },
        )
        
        # Now try to update the current user's email to the other user's email
        response = await client.put(
            "/api/auth/email",
            headers=auth_headers,
            json={
                "new_email": "another@example.com",
                "current_password": "testpassword123",
            },
        )
        
        assert response.status_code == 409


@pytest.mark.asyncio
class TestUpdatePassword:
    """Tests for password update."""

    async def test_update_password_success(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test successful password update."""
        response = await client.put(
            "/api/auth/password",
            headers=auth_headers,
            json={
                "current_password": "testpassword123",
                "new_password": "newpassword456",
            },
        )
        
        assert response.status_code == 204

    async def test_update_password_wrong_current(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test password update with wrong current password."""
        response = await client.put(
            "/api/auth/password",
            headers=auth_headers,
            json={
                "current_password": "wrongpassword",
                "new_password": "newpassword456",
            },
        )
        
        assert response.status_code == 401

    async def test_update_password_too_short(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test password update with too short password."""
        response = await client.put(
            "/api/auth/password",
            headers=auth_headers,
            json={
                "current_password": "testpassword123",
                "new_password": "short",
            },
        )
        
        assert response.status_code == 422


@pytest.mark.asyncio
class TestLogout:
    """Tests for logout."""

    async def test_logout_success(self, client: AsyncClient, auth_headers: dict):
        """Test successful logout."""
        response = await client.post("/api/auth/logout", headers=auth_headers)
        
        assert response.status_code == 204

    async def test_logout_no_token(self, client: AsyncClient):
        """Test logout without token."""
        response = await client.post("/api/auth/logout")
        
        assert response.status_code == 401

