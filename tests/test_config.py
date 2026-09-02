"""Tests for Settings — specifically the docs credentials, which had no guard at all.

`admin` / `changeme` were the defaults, and production ran on them for months: the real values
sat correctly in the server's `.env` while `docker-compose.yml` never passed them into the
container, so the fallback won and nothing said a word. These tests exist so that the absence of
a credential is loud instead of silent.
"""

import pytest

from app.config import Settings

# Enough to construct Settings; both are required and have no defaults of their own.
BASE = {
    "database_url": "postgresql+asyncpg://u:p@localhost:5432/db",
    "secret_key": "not-a-real-key",
}


@pytest.fixture(autouse=True)
def isolate_settings_environment(monkeypatch):
    """Strip the settings variables out of the process environment.

    `_env_file=None` skips the .env FILE but pydantic-settings still reads real environment
    variables, and CI's test job sets `ENVIRONMENT`, `DEBUG`, `DOCS_USERNAME` and `DOCS_PASSWORD`
    for real. Without this, the tests that assert a credential is ABSENT quietly inherit CI's
    value: they passed locally and failed in CI, which is how this fixture came to exist.
    """
    for key in (
        "DOCS_USERNAME",
        "DOCS_PASSWORD",
        "ENVIRONMENT",
        "DEBUG",
        "DATABASE_URL",
        "SECRET_KEY",
    ):
        monkeypatch.delenv(key, raising=False)


def settings_for(**overrides) -> Settings:
    """Build Settings from explicit values only — no .env file, no inherited environment."""
    return Settings(_env_file=None, **{**BASE, **overrides})


class TestDocsAuthRequired:
    """`docs_auth_required` is the one owner of "are the docs protected?"."""

    def test_development_with_debug_does_not_protect_the_docs(self):
        s = settings_for(environment="development", debug=True)
        assert s.docs_auth_required is False

    @pytest.mark.parametrize(
        "environment,debug",
        [
            ("production", False),
            ("production", True),
            ("staging", True),
            # Development with debug OFF still takes the Basic-auth branch in main.py, which is
            # exactly the gap a second copy of this condition would have missed.
            ("development", False),
        ],
    )
    def test_everything_else_protects_the_docs(self, environment, debug):
        s = settings_for(
            environment=environment,
            debug=debug,
            docs_username="u",
            docs_password="p",
        )
        assert s.docs_auth_required is True


class TestDocsCredentialsRequired:
    """The boot-time refusal. Watched failing on purpose, which is what makes it a gate."""

    @pytest.mark.parametrize(
        "creds",
        [
            {},
            {"docs_username": "admin"},
            {"docs_password": "s3cret"},
            {"docs_username": "", "docs_password": ""},
        ],
        ids=["neither", "username only", "password only", "both empty"],
    )
    def test_production_refuses_to_start_without_both(self, creds):
        with pytest.raises(ValueError, match="DOCS_USERNAME and DOCS_PASSWORD are required"):
            settings_for(environment="production", debug=False, **creds)

    def test_production_starts_when_both_are_supplied(self):
        s = settings_for(
            environment="production",
            debug=False,
            docs_username="operator",
            docs_password="a-real-password",
        )
        assert s.docs_username == "operator"
        assert s.docs_password == "a-real-password"

    def test_development_needs_no_credentials(self):
        """Nothing is required where the Basic-auth branch is never taken."""
        s = settings_for(environment="development", debug=True)
        assert s.docs_username is None
        assert s.docs_password is None

    def test_there_is_no_built_in_fallback(self):
        """The regression that matters: absent must mean absent, not `admin` / `changeme`."""
        s = settings_for(environment="development", debug=True)
        assert s.docs_username != "admin"
        assert s.docs_password != "changeme"


class TestCookieScope:
    """The refresh cookie must stay host-only.

    /audit, 2026-09-02: production set `COOKIE_DOMAIN: .kotoio.fi`, which sends the 30-day
    refresh token to EVERY kotoio.fi host. That already included app-attendance.kotoio.fi —
    Vercel, a third party with no need for it — and CLAUDE.md documents the VM as
    multi-backend, so more siblings were planned. The API is the only host that needs this
    cookie, and a host-only cookie is what sends it to exactly that host.

    Demonstrated at the time with the same Starlette call the route makes:
        Set-Cookie: refresh_token=...; Domain=.kotoio.fi; HttpOnly; ...; Secure
        -> sent to attendance-api.kotoio.fi, app-attendance.kotoio.fi, anything-else.kotoio.fi
    """

    def test_cookie_domain_defaults_to_host_only(self):
        """No Domain attribute unless someone deliberately sets one."""
        assert Settings(**BASE, _env_file=None).cookie_domain is None

    def test_login_sets_a_host_only_refresh_cookie(self):
        """The header the app actually emits carries no Domain.

        Asserted on the header rather than on the setting, because the setting is only
        interesting through `response.set_cookie(domain=...)` in app/api/auth.py.
        """
        from starlette.responses import Response

        from app.config import settings

        response = Response()
        response.set_cookie(
            key="refresh_token",
            value="irrelevant",
            httponly=True,
            secure=settings.cookie_secure,
            samesite=settings.cookie_samesite,
            domain=settings.cookie_domain,
        )
        header = response.raw_headers[-1][1].decode()
        assert "Domain=" not in header, (
            f"the refresh cookie is scoped to a domain and will be sent to every host "
            f"under it: {header}"
        )
