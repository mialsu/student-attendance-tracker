"""Token tests that hold across the python-jose -> PyJWT swap (spec 0012, ADR-0012).

Every forged token here is built with the standard library, never with a JWT library, so the same
file runs unchanged against either implementation of app.core.security.
"""

import base64
import hashlib
import hmac
import json
import time
from typing import Any

import pytest

from app.config import settings
from app.core.security import create_access_token, create_refresh_token, decode_token

# CI's SECRET_KEY (.github/workflows/backend.yml). The fixtures below were signed with it, so every
# test in this file pins it rather than reading whatever a developer's .env holds.
FIXTURE_KEY = "test-secret-key-for-ci"

# Minted 2026-10-30 by python-jose 3.5.0, `jwt.encode(claims, FIXTURE_KEY, algorithm="HS256")`,
# before it was uninstalled. Nothing in the repo can mint one now; they stand in for the refresh
# tokens every teacher holds across the deploy (spec 0012, AC-4). exp is 2100-01-01T00:00:00Z.
JOSE_ACCESS_TOKEN = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJzdWIiOiJ0ZWFjaGVyQGV4YW1wbGUuY29tIiwidXNlcl9pZCI6IjExMTExMTExLTExMTEtMTExMS0xMTExLTExMTEx"
    "MTExMTExMSIsImV4cCI6NDEwMjQ0NDgwMCwidHlwZSI6ImFjY2VzcyJ9."
    "B-1FYWCP5fUvuoeX6yfB7BmgtgFLGvE5mH8gmnKxcNg"
)
JOSE_REFRESH_TOKEN = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJzdWIiOiJ0ZWFjaGVyQGV4YW1wbGUuY29tIiwidXNlcl9pZCI6IjExMTExMTExLTExMTEtMTExMS0xMTExLTExMTEx"
    "MTExMTExMSIsImV4cCI6NDEwMjQ0NDgwMCwidHlwZSI6InJlZnJlc2giLCJqdGkiOiIyMjIyMjIyMi0yMjIyLTIyMjIt"
    "MjIyMi0yMjIyMjIyMjIyMjIifQ."
    "i7jdDBZkupF6nDVjS9RCzha0qpj5MPNnTRurjPox2fI"
)
FIXTURE_CLAIMS = {
    "sub": "teacher@example.com",
    "user_id": "11111111-1111-1111-1111-111111111111",
    "exp": 4102444800,
}


@pytest.fixture(autouse=True)
def fixture_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "secret_key", FIXTURE_KEY)
    monkeypatch.setattr(settings, "algorithm", "HS256")


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def _forge(header: dict[str, Any], claims: dict[str, Any], key: str, digest: Any) -> str:
    signing_input = f"{_b64(json.dumps(header).encode())}.{_b64(json.dumps(claims).encode())}"
    signature = hmac.new(key.encode(), signing_input.encode(), digest).digest()
    return f"{signing_input}.{_b64(signature)}"


def _claims(**overrides: Any) -> dict[str, Any]:
    return {**FIXTURE_CLAIMS, "type": "access", "exp": int(time.time()) + 900, **overrides}


class TestTokensMintedByPythonJose:
    """AC-4: a teacher's existing tokens keep working after the swap."""

    def test_access_token_decodes_to_the_same_payload(self):
        assert decode_token(JOSE_ACCESS_TOKEN) == {**FIXTURE_CLAIMS, "type": "access"}

    def test_refresh_token_decodes_to_the_same_payload(self):
        assert decode_token(JOSE_REFRESH_TOKEN) == {
            **FIXTURE_CLAIMS,
            "type": "refresh",
            "jti": "22222222-2222-2222-2222-222222222222",
        }


class TestRefusedTokens:
    """AC-5: each of these returns None, before the swap and after it."""

    def test_the_forger_is_accepted_when_honest(self):
        # Positive control: without it, every refusal below could pass because _forge is broken.
        token = _forge({"alg": "HS256", "typ": "JWT"}, _claims(), FIXTURE_KEY, hashlib.sha256)
        assert decode_token(token) is not None

    def test_alg_none_is_refused(self):
        signing_input = _forge({"alg": "none", "typ": "JWT"}, _claims(), "", hashlib.sha256)
        unsigned = signing_input.rsplit(".", 1)[0] + "."
        assert decode_token(unsigned) is None

    def test_hs512_with_the_right_key_is_refused(self):
        token = _forge({"alg": "HS512", "typ": "JWT"}, _claims(), FIXTURE_KEY, hashlib.sha512)
        assert decode_token(token) is None

    def test_hs256_with_the_wrong_key_is_refused(self):
        token = _forge({"alg": "HS256", "typ": "JWT"}, _claims(), "not-the-key", hashlib.sha256)
        assert decode_token(token) is None

    def test_a_tampered_payload_is_refused(self):
        token = _forge({"alg": "HS256", "typ": "JWT"}, _claims(), FIXTURE_KEY, hashlib.sha256)
        header, _, signature = token.split(".")
        forged = _b64(json.dumps(_claims(sub="someone-else@example.com")).encode())
        assert decode_token(f"{header}.{forged}.{signature}") is None

    def test_an_expired_token_is_refused(self):
        claims = _claims(exp=int(time.time()) - 60)
        token = _forge({"alg": "HS256", "typ": "JWT"}, claims, FIXTURE_KEY, hashlib.sha256)
        assert decode_token(token) is None


class TestRoundTrip:
    """AC-6: what create_* mints, decode_token reads back with every claim intact."""

    def test_access_token(self):
        payload = decode_token(
            create_access_token({"sub": "a@example.com", "user_id": "u-1"})
        )
        assert payload is not None
        assert payload["sub"] == "a@example.com"
        assert payload["user_id"] == "u-1"
        assert payload["type"] == "access"
        assert isinstance(payload["exp"], int) and payload["exp"] > time.time()
        assert "jti" not in payload

    def test_refresh_token(self):
        payload = decode_token(
            create_refresh_token({"sub": "a@example.com", "user_id": "u-1"})
        )
        assert payload is not None
        assert payload["sub"] == "a@example.com"
        assert payload["user_id"] == "u-1"
        assert payload["type"] == "refresh"
        assert isinstance(payload["exp"], int) and payload["exp"] > time.time()
        assert payload["jti"]

    def test_two_refresh_tokens_differ(self):
        data = {"sub": "a@example.com", "user_id": "u-1"}
        assert create_refresh_token(data) != create_refresh_token(data)
