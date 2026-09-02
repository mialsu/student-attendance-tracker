"""Application configuration using Pydantic Settings."""

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Database
    database_url: str

    # Security
    secret_key: str
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 30

    # Cookie configuration
    cookie_secure: bool = True  # False for local dev
    cookie_samesite: str = "lax"
    # Leave this UNSET. A host-only cookie goes to the API and nowhere else.
    # Setting a parent domain (".kotoio.fi") sends the 30-day refresh token to every host
    # under it — that meant app-attendance.kotoio.fi on Vercel, and CLAUDE.md plans more
    # backends on the same VM. Removed from production 2026-09-02 by /audit; guarded by
    # tests/test_config.py::TestCookieScope.
    cookie_domain: str | None = None

    # Documentation Authentication. NO DEFAULT, deliberately.
    #
    # These used to default to `admin` / `changeme`, and production ran on that pair for months:
    # the values were set correctly in the server's .env, but `docker-compose.yml` never passed
    # them into the container, so the fallback won silently. A default is what made that
    # invisible, so there isn't one any more — see `_docs_credentials_are_set` below.
    docs_username: str | None = None
    docs_password: str | None = None

    # CORS
    cors_origins: str = "http://localhost:5173"

    # Environment
    environment: str = "development"
    debug: bool = True

    # API
    api_prefix: str = "/api"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    @property
    def docs_auth_required(self) -> bool:
        """Whether `/docs` sits behind HTTP Basic auth.

        The ONE owner of this rule: `app/main.py` asks this rather than re-deciding it, and the
        validator below requires credentials exactly when it is true. Two copies of the condition
        would be two places to forget.
        """
        return not (self.environment == "development" and self.debug)

    @model_validator(mode="after")
    def _docs_credentials_are_set(self) -> "Settings":
        """Refuse to start when the docs are protected but there is nothing to protect them with.

        Fail at boot, loudly, rather than serve a documented default to the internet. In
        development-with-debug the Basic-auth path is never taken, so nothing is required there.
        """
        if self.docs_auth_required and not (self.docs_username and self.docs_password):
            raise ValueError(
                "DOCS_USERNAME and DOCS_PASSWORD are required when ENVIRONMENT is not "
                "'development' (or DEBUG is off), because /docs, /redoc and /openapi.json are "
                "served behind HTTP Basic auth. There is no default: the old one was "
                "admin/changeme and production ran on it. Set both in the environment."
            )
        return self

    @property
    def cors_origins_list(self) -> list[str]:
        """Parse CORS origins from comma-separated string."""
        return [origin.strip() for origin in self.cors_origins.split(",")]


# Global settings instance
settings = Settings()
