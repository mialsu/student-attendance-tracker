"""FastAPI application entry point."""

import secrets

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_redoc_html, get_swagger_ui_html
from fastapi.openapi.utils import get_openapi
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.handlers import http_exception_log_handler
from app.config import settings
from app.core.logging import configure_logging
from app.core.telemetry import setup_telemetry
from app.database import engine
from app.middleware.context import RequestContextMiddleware

# Attach the JSON handler before anything can log. Idempotent, and it reads LOG_LEVEL from the
# environment with a default, so an unset variable is the normal case rather than a failure --
# `tests/conftest.py` imports this module, so this runs in every pytest session too.
configure_logging()

# Create FastAPI app with docs disabled (we'll add them back with auth)
app = FastAPI(
    title="Student Attendance Tracker API",
    description="API for managing student attendance in classes",
    version="1.0.0",
    docs_url=None,  # Disable default docs
    redoc_url=None,  # Disable default redoc
    openapi_url=None,  # Disable default openapi
)

# HTTP Basic Auth security for documentation
security = HTTPBasic()


def get_docs_dependency():
    """
    Get the appropriate dependency for documentation endpoints.

    In development mode, returns a dummy dependency that skips auth.
    In production, returns HTTP Basic Auth dependency.
    """
    if not settings.docs_auth_required:
        # Development mode: no authentication required. The condition lives on Settings, so the
        # boot-time check that credentials EXIST is guaranteed to agree with this branch.
        async def dev_auth() -> str:
            return "dev-user"

        return dev_auth

    # Production mode: require HTTP Basic Auth
    def verify_credentials(credentials: HTTPBasicCredentials = Depends(security)) -> str:
        """Verify HTTP Basic Auth credentials using constant-time comparison."""
        correct_username = secrets.compare_digest(
            credentials.username.encode("utf8"),
            settings.docs_username.encode("utf8"),
        )
        correct_password = secrets.compare_digest(
            credentials.password.encode("utf8"),
            settings.docs_password.encode("utf8"),
        )

        if not (correct_username and correct_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials",
                headers={"WWW-Authenticate": "Basic"},
            )

        return credentials.username

    return verify_credentials

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request context. `add_middleware` INSERTS at the front of the user middleware list, so the
# last one added is the outermost -- this one wraps CORS, and every response therefore carries a
# request id in its context, preflight included.
app.add_middleware(RequestContextMiddleware)

# Denial logging. Registered for Starlette's HTTPException rather than FastAPI's: FastAPI's
# subclasses it, so one registration covers both, and this is the class FastAPI itself registers
# its default handler against. That default is what this one delegates to, which is what keeps
# every refusal's response bytes unchanged.
app.add_exception_handler(StarletteHTTPException, http_exception_log_handler)


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "message": "Student Attendance Tracker API",
        "version": "1.0.0",
        "docs": "/docs",
    }


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}


# Protected documentation endpoints
@app.get("/docs", include_in_schema=False)
async def get_documentation(username: str = Depends(get_docs_dependency())):
    """
    Swagger UI documentation (protected with HTTP Basic Auth).

    In development mode, accessible without authentication.
    In production, requires HTTP Basic Auth credentials.
    """
    return get_swagger_ui_html(openapi_url="/openapi.json", title="API Docs")


@app.get("/redoc", include_in_schema=False)
async def get_redoc_documentation(username: str = Depends(get_docs_dependency())):
    """
    ReDoc documentation (protected with HTTP Basic Auth).

    In development mode, accessible without authentication.
    In production, requires HTTP Basic Auth credentials.
    """
    return get_redoc_html(openapi_url="/openapi.json", title="API Docs")


@app.get("/openapi.json", include_in_schema=False)
async def openapi(username: str = Depends(get_docs_dependency())):
    """
    OpenAPI schema (protected with HTTP Basic Auth).

    In development mode, accessible without authentication.
    In production, requires HTTP Basic Auth credentials.
    """
    return get_openapi(title=app.title, version=app.version, routes=app.routes)


# Include routers
from app.api import attendance, auth, classes, students

app.include_router(auth.router, prefix="/api/auth", tags=["authentication"])
app.include_router(classes.router, prefix="/api/classes", tags=["classes"])
app.include_router(attendance.router, prefix="/api", tags=["attendance"])
app.include_router(students.router, prefix="/api", tags=["students"])

# Tracing. `instrument_app` does NOT call add_middleware -- it replaces
# `app.build_middleware_stack` and injects itself when Starlette assembles the stack, landing
# just inside ServerErrorMiddleware and OUTSIDE every user middleware, CORS included. It also
# wraps the stack in an exception recorder, so a raised exception is attached to the span before
# the span ends. Position in this module therefore has nothing to do with middleware order; the
# call sits here only because `app` and its routers are fully defined by this point, and it must
# run before the first request builds the stack.
#
# This is a no-op unless OTEL_EXPORTER_OTLP_ENDPOINT is set, which is what keeps the test suite
# and a bare `just run` untouched. It also has to live in THIS module and no lower: the deploy
# job runs `alembic upgrade head` in a one-off container, and alembic/env.py imports
# app.database, app.models and app.config but never app.main -- so migrations stay untraced.
setup_telemetry(app, engine)
