"""FastAPI application entry point."""

import secrets

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_redoc_html, get_swagger_ui_html
from fastapi.openapi.utils import get_openapi
from fastapi.security import HTTPBasic, HTTPBasicCredentials

from app.config import settings

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
    if settings.environment == "development" and settings.debug:
        # Development mode: no authentication required
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
from app.api import admin, attendance, auth, classes, students

app.include_router(auth.router, prefix="/api/auth", tags=["authentication"])
app.include_router(classes.router, prefix="/api/classes", tags=["classes"])
app.include_router(attendance.router, prefix="/api", tags=["attendance"])
app.include_router(students.router, prefix="/api", tags=["students"])
app.include_router(admin.router, prefix="/api/admin", tags=["admin"])
