"""Tests for registration code functionality."""

from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BadRequestException, NotFoundError
from app.models.registration_code import RegistrationCode
from app.models.user import User
from app.services import registration_code_service


async def expire(db: AsyncSession, code: RegistrationCode) -> None:
    """Age a code past its expiry, the way waiting 24 hours would."""
    code.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    db.add(code)
    await db.commit()


async def revoke(db: AsyncSession, code: RegistrationCode) -> None:
    """Mark a code revoked, without caring which caller did it.

    `revoke_code_for_email` has its own test (AC-9). These two are about *redeeming* a revoked
    code, so they set the state rather than exercise a second seam to reach it.
    """
    code.revoked = True
    db.add(code)
    await db.commit()


# TDD: Registration Code Service Tests
class TestRegistrationCodeService:
    """Test registration code service functions."""

    async def test_generate_code_returns_16_char_string(self):
        """Test that generated code is exactly 16 characters."""
        code = registration_code_service.generate_code()
        assert isinstance(code, str)
        assert len(code) == 16

    async def test_generate_code_is_url_safe(self):
        """Test that generated code contains only URL-safe characters."""
        code = registration_code_service.generate_code()
        # URL-safe base64 uses A-Z, a-z, 0-9, -, _
        assert all(c.isalnum() or c in ["-", "_"] for c in code)

    async def test_create_registration_code(self, db: AsyncSession):
        """Test creating a registration code for one address.

        This used to be two tests, one with an address and one without. There is no "without"
        any more (INV-7), so the second asserted a strict subset of this one.
        """
        email = "specific@example.com"
        code = await registration_code_service.create_registration_code(
            db, email_restriction=email
        )

        assert code.id is not None
        assert len(code.code) == 16
        assert code.email_restriction == email
        assert code.used is False
        assert code.revoked is False
        assert code.created_at is not None

    async def test_get_registration_code(self, db: AsyncSession):
        """Test retrieving a registration code by code string."""
        created_code = await registration_code_service.create_registration_code(
            db, email_restriction="lookup@example.com"
        )

        retrieved_code = await registration_code_service.get_registration_code(
            db, created_code.code
        )

        assert retrieved_code is not None
        assert retrieved_code.id == created_code.id
        assert retrieved_code.code == created_code.code

    async def test_get_registration_code_not_found(self, db: AsyncSession):
        """Test retrieving non-existent code returns None."""
        code = await registration_code_service.get_registration_code(db, "nonexistent123")
        assert code is None

    async def test_validate_registration_code_success(
        self, db: AsyncSession
    ):
        """Test validating a valid unused code."""
        email = "holder@example.com"
        created_code = await registration_code_service.create_registration_code(
            db, email_restriction=email
        )

        validated_code = await registration_code_service.validate_registration_code(
            db, created_code.code, email
        )

        assert validated_code.id == created_code.id

    async def test_validate_registration_code_invalid(self, db: AsyncSession):
        """Test validating invalid code raises exception."""
        with pytest.raises(BadRequestException, match="Invalid registration code"):
            await registration_code_service.validate_registration_code(
                db, "invalid-code", "test@example.com"
            )

    async def test_validate_registration_code_already_used(
        self, db: AsyncSession, test_user: User
    ):
        """Test validating already used code raises exception."""
        code = await registration_code_service.create_registration_code(
            db, email_restriction="used-once@example.com"
        )

        # Mark code as used
        await registration_code_service.mark_code_as_used(db, code, test_user)

        # Try to validate again
        with pytest.raises(BadRequestException, match="already used"):
            await registration_code_service.validate_registration_code(
                db, code.code, "another@example.com"
            )

    async def test_validate_registration_code_revoked(
        self, db: AsyncSession
    ):
        """Test validating revoked code raises exception."""
        code = await registration_code_service.create_registration_code(
            db, email_restriction="revoked@example.com"
        )

        await revoke(db, code)

        with pytest.raises(BadRequestException, match="revoked"):
            await registration_code_service.validate_registration_code(
                db, code.code, "test@example.com"
            )

    async def test_validate_registration_code_email_mismatch(
        self, db: AsyncSession
    ):
        """Test validating code with wrong email raises exception."""
        code = await registration_code_service.create_registration_code(
            db, email_restriction="allowed@example.com"
        )

        with pytest.raises(BadRequestException, match="not valid for your email"):
            await registration_code_service.validate_registration_code(
                db, code.code, "wrong@example.com"
            )

    async def test_validate_registration_code_email_match(
        self, db: AsyncSession
    ):
        """Test validating code with correct email succeeds."""
        email = "allowed@example.com"
        code = await registration_code_service.create_registration_code(
            db, email_restriction=email
        )

        validated_code = await registration_code_service.validate_registration_code(
            db, code.code, email
        )

        assert validated_code.id == code.id

    async def test_mark_code_as_used(
        self, db: AsyncSession, test_user: User
    ):
        """Test marking a code as used."""
        code = await registration_code_service.create_registration_code(
            db, email_restriction=test_user.email
        )

        await registration_code_service.mark_code_as_used(db, code, test_user)

        # Refresh to get updated values
        await db.refresh(code)

        assert code.used is True
        assert code.used_by_user_id == test_user.id
        assert code.used_at is not None

    async def test_create_registration_code_expires_in_24_hours(
        self, db: AsyncSession
    ):
        """AC-1: a code issued now stops being redeemable exactly 24 hours later."""
        before = datetime.now(timezone.utc)
        code = await registration_code_service.create_registration_code(
            db, email_restriction="expiry@example.com"
        )
        after = datetime.now(timezone.utc)

        assert before + timedelta(hours=24) <= code.expires_at <= after + timedelta(hours=24)

    async def test_expired_code_does_not_block_a_new_one_for_that_email(
        self, db: AsyncSession
    ):
        """AC-6: a recipient who missed the window can simply be sent another code."""
        email = "missed-the-window@example.com"
        first = await registration_code_service.create_registration_code(
            db, email_restriction=email
        )
        await expire(db, first)

        second = await registration_code_service.create_registration_code(
            db, email_restriction=email
        )

        assert second.id != first.id
        assert second.email_restriction == email

    async def test_live_code_blocks_a_second_one_for_that_email(
        self, db: AsyncSession
    ):
        """AC-7: two valid codes for one address cannot exist at the same time."""
        email = "already-invited@example.com"
        await registration_code_service.create_registration_code(
            db, email_restriction=email
        )

        with pytest.raises(BadRequestException, match="already exists"):
            await registration_code_service.create_registration_code(
                db, email_restriction=email
            )

    async def test_revoke_code_for_email(self, db: AsyncSession):
        """AC-9: revoking by email revokes that address's outstanding code."""
        email = "invited-by-mistake@example.com"
        code = await registration_code_service.create_registration_code(
            db, email_restriction=email
        )

        revoked = await registration_code_service.revoke_code_for_email(db, email)

        assert revoked.id == code.id
        assert revoked.revoked is True

    async def test_revoke_code_for_email_with_nothing_to_revoke(self, db: AsyncSession):
        """AC-10: a mistyped address must not look like success."""
        with pytest.raises(NotFoundError, match="No valid registration code"):
            await registration_code_service.revoke_code_for_email(db, "typo@example.com")

    async def test_revoke_code_for_email_ignores_an_expired_code(self, db: AsyncSession):
        """AC-10: outstanding means live. An expired code is already dead, not revocable."""
        email = "missed-the-window@example.com"
        code = await registration_code_service.create_registration_code(
            db, email_restriction=email
        )
        await expire(db, code)

        with pytest.raises(NotFoundError, match="No valid registration code"):
            await registration_code_service.revoke_code_for_email(db, email)

    async def test_issuing_a_code_requires_an_address(self, db: AsyncSession):
        """AC-8: the default that meant "any address may redeem this" is gone from the signature."""
        with pytest.raises(TypeError):
            await registration_code_service.create_registration_code(db)

    async def test_a_code_cannot_be_stored_without_an_address(self, db: AsyncSession):
        """AC-8 / INV-7: the DATABASE refuses it, not the signature.

        A signature holds for the call sites that exist; a constraint holds for the one written
        next year by someone who has not read this file (CODING_STANDARDS: prefer a database
        constraint to a service-layer check).
        """
        db.add(
            RegistrationCode(
                code="noaddress1234567",
                email_restriction=None,
                expires_at=datetime.now(timezone.utc)
                + registration_code_service.CODE_LIFETIME,
            )
        )

        with pytest.raises(IntegrityError):
            await db.commit()

        await db.rollback()

@pytest.mark.asyncio
class TestAdminSurfaceIsGone:
    """AC-13: the three former /api/admin/codes endpoints do not exist.

    Enumerating handlers rather than screens (CODING_STANDARDS): a deleted page in front of a
    live route is the classic hole, so the assertion is against the route table. 404 and not 403
    is the point — there is nothing left to be forbidden from.
    """

    async def test_creating_a_code_over_http_is_not_a_thing(
        self, client: AsyncClient, auth_headers: dict
    ):
        response = await client.post(
            "/api/admin/codes",
            headers=auth_headers,
            json={"email_restriction": "someone@example.com"},
        )
        assert response.status_code == 404

    async def test_listing_codes_over_http_is_not_a_thing(
        self, client: AsyncClient, auth_headers: dict
    ):
        response = await client.get("/api/admin/codes", headers=auth_headers)
        assert response.status_code == 404

    async def test_revoking_a_code_over_http_is_not_a_thing(
        self, client: AsyncClient, auth_headers: dict
    ):
        import uuid

        response = await client.delete(
            f"/api/admin/codes/{uuid.uuid4()}", headers=auth_headers
        )
        assert response.status_code == 404


# TDD: Signup with Registration Code Tests
@pytest.mark.asyncio
class TestSignupWithRegistrationCode:
    """Test signup endpoint requiring registration code."""

    async def test_signup_with_valid_code(
        self, client: AsyncClient, db: AsyncSession
    ):
        """Can signup with valid registration code."""
        # Create code
        code = await registration_code_service.create_registration_code(
            db, email_restriction="newuser@example.com"
        )

        # Signup with code
        response = await client.post(
            "/api/auth/signup",
            json={
                "email": "newuser@example.com",
                "password": "password123",
                "registration_code": code.code,
            },
        )
        assert response.status_code == 201
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"

    async def test_signup_with_invalid_code(self, client: AsyncClient):
        """Cannot signup with invalid code."""
        response = await client.post(
            "/api/auth/signup",
            json={
                "email": "newuser@example.com",
                "password": "password123",
                "registration_code": "invalid-code-16",
            },
        )
        assert response.status_code == 400
        assert "Invalid" in response.json()["detail"]

    async def test_signup_with_used_code(
        self, client: AsyncClient, db: AsyncSession
    ):
        """Cannot reuse a code.

        The code names user1, so user2 would be refused on the address anyway — but `used` is
        checked first (INV-6), which is what this asserts.
        """
        # Create and use code
        code = await registration_code_service.create_registration_code(
            db, email_restriction="user1@example.com"
        )

        # First signup
        await client.post(
            "/api/auth/signup",
            json={
                "email": "user1@example.com",
                "password": "password123",
                "registration_code": code.code,
            },
        )

        # Try to use again
        response = await client.post(
            "/api/auth/signup",
            json={
                "email": "user2@example.com",
                "password": "password123",
                "registration_code": code.code,
            },
        )
        assert response.status_code == 400
        assert "already used" in response.json()["detail"].lower()

    async def test_signup_with_revoked_code(
        self, client: AsyncClient, db: AsyncSession
    ):
        """Cannot use revoked code."""
        code = await registration_code_service.create_registration_code(
            db, email_restriction="user@example.com"
        )

        await revoke(db, code)

        # Try to signup
        response = await client.post(
            "/api/auth/signup",
            json={
                "email": "user@example.com",
                "password": "password123",
                "registration_code": code.code,
            },
        )
        assert response.status_code == 400
        assert "revoked" in response.json()["detail"].lower()

    async def test_signup_with_email_restricted_code_wrong_email(
        self, client: AsyncClient, db: AsyncSession
    ):
        """Email-restricted codes only work for specific email."""
        # Create code for specific email
        code = await registration_code_service.create_registration_code(
            db, "allowed@example.com"
        )

        # Try with wrong email
        response = await client.post(
            "/api/auth/signup",
            json={
                "email": "wrong@example.com",
                "password": "password123",
                "registration_code": code.code,
            },
        )
        assert response.status_code == 400
        assert "not valid for your email" in response.json()["detail"]

    async def test_signup_with_email_restricted_code_correct_email(
        self, client: AsyncClient, db: AsyncSession
    ):
        """Email-restricted code works with correct email."""
        email = "allowed@example.com"
        code = await registration_code_service.create_registration_code(
            db, email_restriction=email
        )

        # Try with correct email
        response = await client.post(
            "/api/auth/signup",
            json={
                "email": email,
                "password": "password123",
                "registration_code": code.code,
            },
        )
        assert response.status_code == 201
        assert "access_token" in response.json()

    async def test_signup_with_expired_code(
        self, client: AsyncClient, db: AsyncSession
    ):
        """AC-2: an expired code is refused, and the message says so."""
        code = await registration_code_service.create_registration_code(
            db, email_restriction="too-late@example.com"
        )
        await expire(db, code)

        response = await client.post(
            "/api/auth/signup",
            json={
                "email": "too-late@example.com",
                "password": "password123",
                "registration_code": code.code,
            },
        )
        assert response.status_code == 400
        assert "expired" in response.json()["detail"].lower()

    async def test_signup_with_a_code_revoked_by_email(
        self, client: AsyncClient, db: AsyncSession
    ):
        """AC-9: after revoking by email, signup with that code fails."""
        email = "changed-my-mind@example.com"
        code = await registration_code_service.create_registration_code(
            db, email_restriction=email
        )
        await registration_code_service.revoke_code_for_email(db, email)

        response = await client.post(
            "/api/auth/signup",
            json={
                "email": email,
                "password": "password123",
                "registration_code": code.code,
            },
        )
        assert response.status_code == 400
        assert "revoked" in response.json()["detail"].lower()

    async def test_signup_with_a_code_that_names_no_address(
        self, client: AsyncClient, db: AsyncSession
    ):
        """AC-5: an empty address matches nobody — it is not a wildcard.

        This is the shape the mandatory-email migration leaves behind for a legacy code that
        named no address. Those rows are revoked too, so this is the second lock rather than
        the only one, but the comparison must refuse rather than wave the code through.
        """
        code = await registration_code_service.create_registration_code(
            db, email_restriction="someone@example.com"
        )
        code.email_restriction = ""
        db.add(code)
        await db.commit()

        response = await client.post(
            "/api/auth/signup",
            json={
                "email": "anyone@example.com",
                "password": "password123",
                "registration_code": code.code,
            },
        )
        assert response.status_code == 400
        assert "not valid for your email" in response.json()["detail"]

    async def test_signup_without_registration_code_fails(self, client: AsyncClient):
        """Signup without registration code should fail with validation error."""
        response = await client.post(
            "/api/auth/signup",
            json={
                "email": "newuser@example.com",
                "password": "password123",
                # No registration_code field
            },
        )
        # Should be 422 (validation error) because field is missing
        assert response.status_code == 422
