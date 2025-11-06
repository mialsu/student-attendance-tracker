# Student Attendance Tracker - Backend API

FastAPI backend for the Student Attendance Tracker application.

## Tech Stack

- **Python**: 3.12
- **Framework**: FastAPI 0.104+
- **Database**: PostgreSQL 17
- **ORM**: SQLAlchemy 2.0 (async)
- **Migrations**: Alembic
- **Auth**: JWT (python-jose)
- **Testing**: pytest + httpx

## Setup

### 1. Create Virtual Environment

```bash
python3.12 -m venv venv
source venv/bin/activate  # Linux/Mac
# or
venv\Scripts\activate     # Windows
```

### 2. Install Dependencies

```bash
pip install -r requirements.txt
```

### 3. Configure Environment

```bash
cp .env.example .env
# Edit .env with your settings
```

### 4. Start PostgreSQL (Docker)

```bash
docker run -d \
  --name attendance-postgres \
  -e POSTGRES_USER=attendance_user \
  -e POSTGRES_PASSWORD=your_password \
  -e POSTGRES_DB=attendance_tracker \
  -p 5432:5432 \
  postgres:17-alpine
```

### 5. Run Migrations

```bash
alembic upgrade head
```

### 6. Seed Database (Optional)

For manual testing, populate the database with realistic test data:

```bash
./scripts/seed-db.sh
# or
python scripts/seed_data.py
```

This creates:
- 2 test users (teachers): `teacher1@example.com` / `teacher2@example.com`
- 3-4 classes per teacher
- 20-30 students per class with varying attendance
- Some legacy students (first attendance > 5 years ago) for filter testing
- Mix of active and inactive classes

**Login credentials**: `password123` for all test users

### 7. Start Development Server

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

API will be available at: http://localhost:8000

API Documentation (Swagger UI): http://localhost:8000/docs

## Development

### Run Tests

```bash
# All tests
pytest

# With coverage
pytest --cov=app --cov-report=html

# Specific test file
pytest tests/test_auth.py -v
```

### Create Migration

```bash
# Auto-generate migration from model changes
alembic revision --autogenerate -m "Description of changes"

# Apply migration
alembic upgrade head

# Rollback migration
alembic downgrade -1
```

### Code Quality

```bash
# Format code
black app/

# Sort imports
isort app/

# Type checking (optional)
mypy app/
```

## Project Structure

```
student-attendance-tracker-api/
├── app/
│   ├── main.py              # FastAPI app entry point
│   ├── config.py            # Configuration management
│   ├── database.py          # Database connection & session
│   ├── dependencies.py      # Dependency injection
│   ├── models/              # SQLAlchemy ORM models
│   ├── schemas/             # Pydantic schemas
│   ├── api/                 # API route handlers
│   ├── services/            # Business logic layer
│   ├── core/                # Core utilities
│   └── middleware/          # Custom middleware
├── alembic/                 # Database migrations
├── tests/                   # Test suite
├── requirements.txt         # Python dependencies
├── alembic.ini             # Alembic configuration
└── .env.example            # Environment variables template
```

## API Endpoints

### Authentication
- `POST /api/auth/signup` - Create teacher account
- `POST /api/auth/login` - Login and get tokens
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Get current user
- `PUT /api/auth/email` - Update email
- `PUT /api/auth/password` - Update password

### Classes
- `GET /api/classes` - List teacher's classes
- `POST /api/classes` - Create new class
- `GET /api/classes/{id}` - Get class details
- `PUT /api/classes/{id}` - Update class
- `DELETE /api/classes/{id}` - Delete class

### Attendance
- `GET /api/classes/{id}/attendance` - List attendance records
- `POST /api/classes/{id}/attendance` - Log attendance
- `DELETE /api/attendance/{id}` - Delete attendance record
- `GET /api/classes/{id}/attendance/summary` - Get attendance summary

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | - |
| `SECRET_KEY` | JWT secret key | - |
| `ALGORITHM` | JWT algorithm | HS256 |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Access token expiration | 15 |
| `REFRESH_TOKEN_EXPIRE_DAYS` | Refresh token expiration | 7 |
| `CORS_ORIGINS` | Allowed CORS origins | localhost |
| `ENVIRONMENT` | Environment (development/production) | development |

## Docker

### Build Image

```bash
docker build -t attendance-api .
```

### Run Container

```bash
docker run -d \
  --name attendance-api \
  -p 8000:8000 \
  --env-file .env \
  attendance-api
```

## Testing

Tests use an in-memory SQLite database for speed and isolation.

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=app --cov-report=term-missing

# Run specific test
pytest tests/test_auth.py::test_signup -v
```

## License

MIT
