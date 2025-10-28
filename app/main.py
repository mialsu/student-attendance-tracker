"""FastAPI application entry point."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings

# Create FastAPI app
app = FastAPI(
    title="Student Attendance Tracker API",
    description="API for managing student attendance in classes",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

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


# Include routers
from app.api import attendance, auth, classes

app.include_router(auth.router, prefix="/api/auth", tags=["authentication"])
app.include_router(classes.router, prefix="/api/classes", tags=["classes"])
app.include_router(attendance.router, prefix="/api", tags=["attendance"])
