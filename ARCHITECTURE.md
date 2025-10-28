# Student Attendance Tracker - Architecture Documentation

## Overview

This document outlines the architecture decisions and design for the Student Attendance Tracker application.

## System Architecture

### Current State
- **Frontend**: React 18 + TypeScript + Vite (client-app)
- **Data Storage**: localStorage (temporary)
- **Deployment**: Static files

### Target State
- **Frontend**: React 18 + TypeScript + Vite
- **Backend**: Python + FastAPI
- **Database**: PostgreSQL 17
- **ORM**: SQLAlchemy 2.0
- **Migrations**: Alembic
- **Deployment**: Single Hetzner VM with Docker Compose

## Architecture Decision: Monolith vs Microservices

### Decision: Modular Monolith

**Rationale:**
1. **Simplicity**: Single codebase, easier to develop and debug
2. **Team Size**: Small team/solo developer
3. **Deployment**: Single server deployment simplifies operations
4. **Performance**: No network overhead between services
5. **Evolution Path**: Can extract services later if needed
6. **Cost Effective**: Single server on Hetzner

**Modular Monolith Structure:**
```
backend/
├── app/
│   ├── main.py              # FastAPI app entry point
│   ├── config.py            # Configuration management
│   ├── database.py          # Database connection & session
│   ├── dependencies.py      # Dependency injection (auth, db)
│   ├── models/              # SQLAlchemy ORM models
│   │   ├── __init__.py
│   │   ├── user.py          # User/Teacher model
│   │   ├── class.py         # Class/Course model
│   │   └── attendance.py    # AttendanceRecord model
│   ├── schemas/             # Pydantic schemas (request/response)
│   │   ├── __init__.py
│   │   ├── user.py
│   │   ├── class.py
│   │   ├── attendance.py
│   │   └── auth.py
│   ├── api/                 # API route handlers
│   │   ├── __init__.py
│   │   ├── auth.py          # Auth endpoints
│   │   ├── classes.py       # Class management endpoints
│   │   └── attendance.py    # Attendance tracking endpoints
│   ├── services/            # Business logic layer
│   │   ├── __init__.py
│   │   ├── auth_service.py
│   │   ├── class_service.py
│   │   └── attendance_service.py
│   ├── core/                # Core utilities
│   │   ├── __init__.py
│   │   ├── security.py      # Password hashing, JWT
│   │   └── exceptions.py    # Custom exceptions
│   └── middleware/          # Custom middleware
│       ├── __init__.py
│       └── cors.py          # CORS configuration
├── alembic/                 # Database migrations
│   ├── versions/
│   ├── env.py
│   └── script.py.mako
├── tests/
│   ├── __init__.py
│   ├── conftest.py          # Pytest fixtures
│   ├── test_auth.py
│   ├── test_classes.py
│   └── test_attendance.py
├── alembic.ini              # Alembic configuration
├── requirements.txt         # Python dependencies
├── Dockerfile
└── .env.example
```

## Database Architecture

### Technology: PostgreSQL 17

**Why PostgreSQL 17:**
- ✅ Latest stable release with performance improvements
- ✅ ACID compliance - strong consistency guarantees
- ✅ Relational model fits use case perfectly (Teachers → Classes → Attendance)
- ✅ Foreign key constraints ensure data integrity
- ✅ Mature ecosystem and tooling
- ✅ Excellent performance for read/write workloads
- ✅ Enhanced JSONB support for future flexibility
- ✅ Improved query performance and vacuum operations
- ✅ Better handling of bulk operations
- ✅ Easy to containerize with Docker

**PostgreSQL 17 Specific Benefits:**
- Improved incremental backup and restore
- Better performance for heavy write workloads
- Enhanced vacuuming for better table maintenance
- Improved security features

### ORM: SQLAlchemy 2.0

**Why SQLAlchemy:**
- Modern async support with `asyncio`
- Type-safe with Python 3.10+ type hints
- Powerful query builder
- Database agnostic (can switch DBs easily)
- Excellent with FastAPI
- Prevents SQL injection
- Rich relationship handling

**Key Features We'll Use:**
- Async session management
- Declarative models with `DeclarativeBase`
- Relationship loading strategies
- Query filtering and pagination

### Migrations: Alembic

**Why Alembic:**
- Official migration tool for SQLAlchemy
- Version control for database schema
- Auto-generate migrations from model changes
- Rollback support
- Works seamlessly with SQLAlchemy

## Data Model

### Entity Relationship Diagram

```
┌─────────────────────┐
│      User           │
│  (Teacher)          │
├─────────────────────┤
│ id (UUID, PK)       │
│ email (unique)      │
│ password_hash       │
│ acctive             │
│ created_at          │
│ updated_at          │
└──────────┬──────────┘
           │
           │ 1:N
           │
           ▼
┌─────────────────────┐
│      Class          │
│  (Course/Kurssi)    │
├─────────────────────┤
│ id (UUID, PK)       │
│ name                │
│ description         │
│ teacher_id (FK)     │◄───┐
│ created_at          │    │
│ updated_at          │    │
└──────────┬──────────┘    │
           │                │
           │ 1:N            │
           │                │
           ▼                │
┌─────────────────────┐    │
│ AttendanceRecord    │    │
├─────────────────────┤    │
│ id (UUID, PK)       │    │
│ class_id (FK)       │────┘
│ student_first_name  │
│ student_last_name   │
│ timestamp           │
│ created_at          │
└─────────────────────┘
```

### SQLAlchemy Models

#### User (Teacher)
```python
class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    classes = relationship("Class", back_populates="teacher", cascade="all, delete-orphan")
```

#### Class (Course)
```python
class Class(Base):
    __tablename__ = "classes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    teacher_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    teacher = relationship("User", back_populates="classes")
    attendance_records = relationship("AttendanceRecord", back_populates="class_", cascade="all, delete-orphan")
```

#### AttendanceRecord
```python
class AttendanceRecord(Base):
    __tablename__ = "attendance_records"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    class_id = Column(UUID(as_uuid=True), ForeignKey("classes.id", ondelete="CASCADE"), nullable=False)
    student_first_name = Column(String(100), nullable=False)
    student_last_name = Column(String(100), nullable=False)
    timestamp = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    class_ = relationship("Class", back_populates="attendance_records")

    # Indexes for performance
    __table_args__ = (
        Index('ix_attendance_class_id', 'class_id'),
        Index('ix_attendance_timestamp', 'timestamp'),
        Index('ix_attendance_student_name', 'student_last_name', 'student_first_name'),
    )
```

### Database Constraints

1. **Primary Keys**: UUIDs for all entities (better for distributed systems)
2. **Foreign Keys**:
   - `Class.teacher_id` → `User.id` (CASCADE DELETE)
   - `AttendanceRecord.class_id` → `Class.id` (CASCADE DELETE)
3. **Unique Constraints**: `User.email`
4. **Indexes**:
   - `User.email` (for login lookups)
   - `AttendanceRecord.class_id` (for filtering)
   - `AttendanceRecord.timestamp` (for sorting)
   - Composite index on student names (for searching)

## API Architecture

### Framework: FastAPI 0.104+

**Why FastAPI:**
- ⚡ High performance (async/await support)
- 🎯 Automatic API documentation (OpenAPI/Swagger)
- ✅ Request/response validation with Pydantic
- 🔒 Easy dependency injection for auth
- 🧪 Excellent testing support
- 📝 Great Python type hints integration
- 🌍 CORS middleware built-in

### Authentication Strategy: JWT (JSON Web Tokens)

**Implementation:**
- **Access Token**: Short-lived (15 minutes), sent in Authorization header
- **Refresh Token**: Long-lived (7 days), stored in HTTP-only cookie
- **Password Hashing**: bcrypt via `passlib`
- **JWT Library**: `python-jose[cryptography]`

**Token Payload:**
```python
{
    "sub": "user_email@example.com",  # Subject (user identifier)
    "user_id": "uuid",                 # User UUID
    "exp": 1234567890,                 # Expiration timestamp
    "type": "access" | "refresh"       # Token type
}
```

**Authentication Flow:**
```
1. User logs in with email/password
2. Backend validates credentials
3. Generate access token (15 min) + refresh token (7 days)
4. Return both tokens
5. Frontend stores access token in memory
6. Frontend stores refresh token in HTTP-only cookie
7. Include access token in Authorization: Bearer <token>
8. When access token expires, use refresh token to get new one
```

### API Endpoints

#### Authentication (`/api/auth`)
```
POST   /api/auth/signup          - Create teacher account
  Request: { email, password }
  Response: { access_token, refresh_token, user }

POST   /api/auth/login           - Login and get tokens
  Request: { email, password }
  Response: { access_token, refresh_token, user }

POST   /api/auth/refresh         - Refresh access token
  Request: { refresh_token }
  Response: { access_token }

POST   /api/auth/logout          - Logout (invalidate tokens)
  Request: { refresh_token }
  Response: { message }

GET    /api/auth/me              - Get current user
  Headers: Authorization: Bearer <token>
  Response: { id, email, active }

PUT    /api/auth/email           - Update email
  Request: { new_email, current_password }
  Response: { user }

PUT    /api/auth/password        - Update password
  Request: { current_password, new_password }
  Response: { message }
```

#### Classes (`/api/classes`)
```
GET    /api/classes              - List teacher's classes
  Query: ?skip=0&limit=100
  Response: [{ id, name, description, created_at, attendance_count }]

POST   /api/classes              - Create new class
  Request: { name, description? }
  Response: { id, name, description, teacher_id, created_at }

GET    /api/classes/{id}         - Get class details
  Response: { id, name, description, teacher_id, created_at, updated_at }

PUT    /api/classes/{id}         - Update class
  Request: { name?, description? }
  Response: { id, name, description, updated_at }

DELETE /api/classes/{id}         - Delete class (cascade deletes attendance)
  Response: { message }
```

#### Attendance (`/api/attendance`)
```
GET    /api/classes/{id}/attendance        - List attendance records
  Query: ?skip=0&limit=100&student_name=&date_from=&date_to=
  Response: [{ id, student_first_name, student_last_name, timestamp }]

POST   /api/classes/{id}/attendance        - Log attendance
  Request: { student_first_name, student_last_name, timestamp }
  Response: { id, class_id, student_first_name, student_last_name, timestamp }

DELETE /api/attendance/{id}                - Delete attendance record
  Response: { message }

GET    /api/classes/{id}/attendance/summary - Get attendance summary by student
  Response: [
    {
      student_first_name,
      student_last_name,
      total_attendance,
      records: [{ id, timestamp }]
    }
  ]
```

### Error Handling

**HTTP Status Codes:**
- `200 OK` - Success
- `201 Created` - Resource created
- `204 No Content` - Success with no response body
- `400 Bad Request` - Validation error
- `401 Unauthorized` - Missing or invalid token
- `403 Forbidden` - User doesn't have permission
- `404 Not Found` - Resource not found
- `409 Conflict` - Duplicate resource (e.g., email already exists)
- `422 Unprocessable Entity` - Pydantic validation error
- `500 Internal Server Error` - Server error

**Error Response Format:**
```json
{
  "detail": "Error message",
  "error_code": "EMAIL_ALREADY_EXISTS"
}
```

## Docker Architecture

### Services

```yaml
version: '3.8'

services:
  # PostgreSQL Database
  db:
    image: postgres:17-alpine
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      POSTGRES_USER: attendance_user
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: attendance_tracker
    ports:
      - "5432:5432"  # Expose for development
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U attendance_user"]
      interval: 10s
      timeout: 5s
      retries: 5

  # FastAPI Backend
  backend:
    build: ./backend
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000
    volumes:
      - ./backend:/app
    environment:
      DATABASE_URL: postgresql+asyncpg://attendance_user:${DB_PASSWORD}@db:5432/attendance_tracker
      SECRET_KEY: ${SECRET_KEY}
      ACCESS_TOKEN_EXPIRE_MINUTES: 15
      REFRESH_TOKEN_EXPIRE_DAYS: 7
    ports:
      - "8000:8000"
    depends_on:
      db:
        condition: service_healthy

  # React Frontend (Production)
  frontend:
    build: ./client-app
    ports:
      - "80:80"
      - "443:443"
    depends_on:
      - backend
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf

volumes:
  postgres_data:
```

### Dockerfile (Backend)

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY . .

# Run migrations and start server
CMD alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## Security Architecture

### Password Security
- **Hashing Algorithm**: bcrypt (via passlib)
- **Minimum Length**: 8 characters (enforced in Pydantic schema)
- **Salt**: Automatic with bcrypt
- **Never store plain passwords**

### JWT Security
- **Secret Key**: Strong random key (from environment)
- **Algorithm**: HS256
- **Token Expiration**: Always set expiration
- **Refresh Token**: HTTP-only cookie (XSS protection)
- **Access Token**: Memory only (not localStorage)

### API Security
- **CORS**: Configured for frontend domain only
- **Rate Limiting**: Consider adding (slowapi library)
- **Input Validation**: Pydantic schemas validate all input
- **SQL Injection**: Prevented by SQLAlchemy ORM
- **Dependency Injection**: FastAPI dependencies for auth

### Database Security
- **Connection String**: Environment variable only
- **Least Privilege**: Database user has minimal permissions
- **Connection Pooling**: SQLAlchemy manages connections
- **SSL/TLS**: Enable for production

### Deployment Security
- **Environment Variables**: All secrets in `.env` (never commit)
- **HTTPS**: Let's Encrypt SSL certificate
- **Firewall**: UFW configured (allow only 80, 443, 22)
- **SSH**: Key-based auth only, disable password auth
- **Updates**: Regular security updates

## Testing Strategy

### Test Pyramid

```
        /\
       /  \      E2E Tests (Few)
      /────\     - Full user flows
     /      \    - Critical paths
    /────────\   Integration Tests (Some)
   /          \  - API endpoint tests
  /────────────\ - Database operations
 /              \ Unit Tests (Many)
/────────────────\ - Business logic
                   - Utility functions
```

### Testing Stack
- **Framework**: pytest
- **Async**: pytest-asyncio
- **HTTP Client**: httpx (async)
- **Database**: SQLite in-memory for tests
- **Fixtures**: pytest fixtures for test data
- **Coverage**: pytest-cov (aim for 80%+)

### Test Organization
```python
# tests/conftest.py
@pytest.fixture
async def async_client():
    # Test client with in-memory database

@pytest.fixture
async def test_user():
    # Create test user

@pytest.fixture
async def test_class():
    # Create test class
```

## Deployment Architecture

### Single Server Setup (Hetzner Cloud)

**Recommended Server:**
- **Type**: CX21 or CX31
- **CPU**: 2-4 vCPUs
- **RAM**: 4-8 GB
- **Storage**: 40-80 GB SSD
- **OS**: Ubuntu 22.04 LTS
- **Location**: Choose closest to users

### Deployment Process

```bash
# 1. Server Setup
ssh root@your-server-ip
apt update && apt upgrade -y
apt install docker.io docker-compose git ufw

# 2. Firewall
ufw allow 22    # SSH
ufw allow 80    # HTTP
ufw allow 443   # HTTPS
ufw enable

# 3. Clone Repository
git clone https://github.com/your-org/student-attendance-tracker.git
cd student-attendance-tracker

# 4. Configure Environment
cp .env.example .env
nano .env  # Edit secrets

# 5. Start Services
docker-compose up -d

# 6. Setup SSL (Certbot)
# Use Certbot with Nginx for Let's Encrypt SSL
```

### Data Persistence
- **Database**: Docker volume `postgres_data`
- **Backups**:
  - Daily automated backups with `pg_dump`
  - Store in Hetzner Volume or S3-compatible storage
  - Retention: 7 daily, 4 weekly, 12 monthly

### Monitoring
- **Docker Logs**: `docker-compose logs -f`
- **Database Monitoring**: pg_stat_statements
- **Application Metrics**: Optional - Prometheus + Grafana
- **Uptime Monitoring**: External service (UptimeRobot, Healthchecks.io)

## Migration from localStorage to API

### Strategy

**Phase 1: API Development** (Backend Ready)
- ✅ Backend APIs fully functional
- ✅ All tests passing
- ✅ Deployed to server

**Phase 2: Frontend Integration** (Dual Mode)
- Add API client with TanStack Query
- Feature flag: `USE_API` (env variable)
- Keep localStorage code working
- Switch between modes for testing

**Phase 3: Full Migration** (API Only)
- Remove localStorage code
- Remove feature flag
- All operations use API

### API Client (Frontend)

```typescript
// src/lib/api-client.ts
import { QueryClient } from '@tanstack/react-query';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// Auth API
export const authApi = {
  login: (email: string, password: string) =>
    fetch(`${API_BASE}/api/auth/login`, { ... }),

  signup: (email: string, password: string) =>
    fetch(`${API_BASE}/api/auth/signup`, { ... }),

  // ... more methods
};

// Classes API
export const classesApi = {
  getClasses: () =>
    fetch(`${API_BASE}/api/classes`, { ... }),

  createClass: (data) =>
    fetch(`${API_BASE}/api/classes`, { method: 'POST', ... }),

  // ... more methods
};
```

## Performance Considerations

### Database Optimization
- **Indexes**: Added on foreign keys and frequently queried columns
- **Connection Pooling**: SQLAlchemy pool (default 5-20 connections)
- **Query Optimization**: Use `joinedload` to avoid N+1 queries
- **Pagination**: Always paginate list endpoints

### API Optimization
- **Async/Await**: All database operations are async
- **Response Compression**: Gzip middleware
- **Caching**: Consider Redis for frequently accessed data (later)
- **Query Limits**: Enforce maximum page size

### Frontend Optimization
- **TanStack Query**: Automatic caching and deduplication
- **Code Splitting**: React lazy loading
- **Asset Optimization**: Vite build optimization

## Future Enhancements

### Potential Features (Post-MVP)
1. **Student Portal**: Students can view their own attendance
2. **QR Code Check-in**: Students scan QR to mark attendance
3. **Email Notifications**: Weekly attendance summaries
4. **Reports & Analytics**: Attendance trends, charts
5. **Export Data**: CSV, PDF exports
6. **Mobile App**: React Native app
7. **Bulk Operations**: Import students, bulk attendance marking
8. **Class Scheduling**: Time-based classes

### Scalability Options (If Needed)
1. **Read Replicas**: PostgreSQL read replicas
2. **Caching Layer**: Redis for sessions and frequently accessed data
3. **CDN**: Cloudflare for static assets
4. **Load Balancer**: Multiple backend instances
5. **Message Queue**: Celery + RabbitMQ for async tasks

### Microservices Migration (If Needed)
Could split into:
1. **Auth Service**: User management, JWT issuing
2. **Class Service**: Class CRUD operations
3. **Attendance Service**: Attendance tracking and reporting

*Not recommended unless you have specific scaling needs*

## Technology Decisions Summary

| Component | Technology | Rationale |
|-----------|------------|-----------|
| **Backend Framework** | FastAPI | Modern, fast, async, auto-docs |
| **Database** | PostgreSQL 17 | Latest release, relational model, ACID, mature |
| **ORM** | SQLAlchemy 2.0 | Async support, type-safe, powerful |
| **Migrations** | Alembic | Official SQLAlchemy migrations |
| **Auth** | JWT (python-jose) | Stateless, scalable, standard |
| **Password Hashing** | bcrypt (passlib) | Industry standard, secure |
| **Validation** | Pydantic v2 | Type-safe, fast, FastAPI native |
| **Testing** | pytest + httpx | Async support, powerful fixtures |
| **Containerization** | Docker + Compose | Reproducible, easy deployment |
| **Server** | Hetzner Cloud VM | Cost-effective, EU-based, reliable |

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2025-10-26 | FastAPI for backend | Modern, fast, async support, excellent docs |
| 2025-10-26 | Modular Monolith | Simplicity, single server deployment |
| 2025-10-26 | PostgreSQL 17 over MongoDB | Data is relational, need consistency, latest features |
| 2025-10-26 | SQLAlchemy 2.0 | Modern async ORM, type-safe |
| 2025-10-26 | Alembic for migrations | Official migration tool, version control for schema |
| 2025-10-26 | JWT Authentication | Stateless, scalable, industry standard |
| 2025-10-26 | Docker Compose | Simple orchestration for single server |
| 2025-10-26 | UUID Primary Keys | Better for distributed systems, no collisions |

## Next Steps

1. ✅ Document architecture
2. ⏭️ Set up FastAPI project structure
3. ⏭️ Create SQLAlchemy models
4. ⏭️ Configure Alembic migrations
5. ⏭️ Implement authentication (JWT)
6. ⏭️ Create API endpoints
7. ⏭️ Write tests
8. ⏭️ Create Docker setup
9. ⏭️ Deploy to Hetzner
10. ⏭️ Migrate frontend to use API

---

**Document Version**: 1.0
**Last Updated**: 2025-10-26
**Author**: Architecture Team
