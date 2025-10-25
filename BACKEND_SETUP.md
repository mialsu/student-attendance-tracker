# Backend Setup Guide

## Quick Start

### 1. Install Python 3.12

Make sure you have Python 3.12 installed:
```bash
python3.12 --version
```

### 2. Create Virtual Environment

```bash
cd student-attendance-tracker-api
python3.12 -m venv venv
source venv/bin/activate  # Linux/Mac
```

### 3. Install Dependencies

```bash
pip install -r requirements.txt
```

### 4. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` file:
```bash
# Generate a secure secret key
openssl rand -hex 32

# Update .env with:
DATABASE_URL=postgresql+asyncpg://attendance_user:your_password@localhost:5432/attendance_tracker
SECRET_KEY=<generated-key-from-openssl>
CORS_ORIGINS=http://localhost:5173
```

### 5. Start PostgreSQL 17

Using Docker:
```bash
docker run -d \
  --name attendance-postgres \
  -e POSTGRES_USER=attendance_user \
  -e POSTGRES_PASSWORD=your_password \
  -e POSTGRES_DB=attendance_tracker \
  -p 5432:5432 \
  postgres:17-alpine
```

### 6. Run Database Migrations

```bash
# Generate initial migration
alembic revision --autogenerate -m "Initial migration"

# Apply migration
alembic upgrade head
```

### 7. Run Tests

```bash
pytest
```

### 8. Start Development Server

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Visit:
- API: http://localhost:8000
- Docs: http://localhost:8000/docs
- Health: http://localhost:8000/health

## Project Structure Created

```
student-attendance-tracker-api/
├── app/
│   ├── __init__.py
│   ├── main.py                 # FastAPI app ✅
│   ├── config.py               # Settings ✅
│   ├── database.py             # DB connection ✅
│   ├── dependencies.py         # Auth dependency ✅
│   │
│   ├── models/                 # SQLAlchemy models ✅
│   │   ├── __init__.py
│   │   ├── user.py             # User model
│   │   ├── class_.py           # Class model
│   │   └── attendance.py       # AttendanceRecord model
│   │
│   ├── schemas/                # Pydantic schemas ✅
│   │   ├── __init__.py
│   │   ├── user.py
│   │   ├── auth.py
│   │   ├── class_.py
│   │   └── attendance.py
│   │
│   ├── api/                    # API routes (TODO)
│   │   └── __init__.py
│   │
│   ├── services/               # Business logic (TODO)
│   │   └── __init__.py
│   │
│   ├── core/                   # Core utilities ✅
│   │   ├── __init__.py
│   │   ├── security.py         # JWT, password hashing
│   │   └── exceptions.py       # Custom exceptions
│   │
│   └── middleware/             # Middleware
│       └── __init__.py
│
├── alembic/                    # Migrations ✅
│   ├── env.py                  # Alembic config
│   ├── script.py.mako          # Migration template
│   └── versions/               # Migration files
│
├── tests/                      # Test suite ✅
│   ├── __init__.py
│   ├── conftest.py             # Pytest fixtures
│   └── test_main.py            # Basic tests
│
├── .env.example                # Environment template ✅
├── .gitignore                  # Git ignore ✅
├── alembic.ini                 # Alembic config ✅
├── Dockerfile                  # Docker image ✅
├── pytest.ini                  # Pytest config ✅
├── README.md                   # Documentation ✅
└── requirements.txt            # Dependencies ✅
```

## What's Completed

✅ **Project Structure**: Full backend directory structure
✅ **Configuration**: Settings with Pydantic
✅ **Database**: Async SQLAlchemy setup
✅ **Models**: User, Class, AttendanceRecord (with relationships)
✅ **Schemas**: All Pydantic request/response models
✅ **Security**: JWT tokens, password hashing
✅ **Dependencies**: Authentication dependency injection
✅ **Exceptions**: Custom exception classes
✅ **Migrations**: Alembic configuration
✅ **Docker**: Dockerfile for containerization
✅ **Testing**: Pytest setup with async support
✅ **Documentation**: README with setup instructions

## What's Next

🔨 **Implement API Endpoints**:
1. Authentication routes (signup, login, refresh, etc.)
2. Classes routes (CRUD operations)
3. Attendance routes (tracking and summaries)

🔨 **Implement Services**:
1. Auth service (user management logic)
2. Class service (class management logic)
3. Attendance service (attendance tracking logic)

🔨 **Write Tests**:
1. Authentication tests
2. Classes API tests
3. Attendance API tests
4. Service layer tests

🔨 **Docker Compose**:
1. Multi-container orchestration
2. Frontend + Backend + Database
3. Nginx reverse proxy

## Testing the Current Setup

```bash
# Activate virtual environment
source venv/bin/activate

# Run tests
pytest -v

# You should see 2 passing tests:
# ✓ test_root_endpoint
# ✓ test_health_check
```

## Troubleshooting

### Virtual Environment Issues
```bash
# If venv activation fails, recreate it
rm -rf venv
python3.12 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### PostgreSQL Connection Issues
```bash
# Check if PostgreSQL is running
docker ps | grep postgres

# Check logs
docker logs attendance-postgres

# Test connection
docker exec -it attendance-postgres psql -U attendance_user -d attendance_tracker
```

### Migration Issues
```bash
# Reset migrations (DANGER: loses data)
alembic downgrade base
rm alembic/versions/*.py
alembic revision --autogenerate -m "Initial migration"
alembic upgrade head
```

## Key Features Implemented

### 1. Async Everything
All database operations use `async/await` for better performance.

### 2. Type Safety
- Python 3.12 type hints throughout
- Pydantic schemas for validation
- SQLAlchemy 2.0 with Mapped types

### 3. Security First
- JWT with expiration
- bcrypt password hashing
- CORS configuration
- Input validation

### 4. Developer Experience
- Auto-generated API docs (Swagger)
- Hot reload in development
- Comprehensive error messages
- Test suite ready

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | ✅ | - | PostgreSQL connection string |
| `SECRET_KEY` | ✅ | - | JWT secret (generate with openssl) |
| `ALGORITHM` | ❌ | HS256 | JWT algorithm |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | ❌ | 15 | Access token expiration |
| `REFRESH_TOKEN_EXPIRE_DAYS` | ❌ | 7 | Refresh token expiration |
| `CORS_ORIGINS` | ❌ | localhost:5173 | Allowed CORS origins (comma-separated) |
| `ENVIRONMENT` | ❌ | development | Environment (development/production) |
| `DEBUG` | ❌ | True | Debug mode |

---

**Status**: Backend structure complete, ready for API implementation
**Next Step**: Implement authentication routes
**Documentation**: See ARCHITECTURE.md for full system design
