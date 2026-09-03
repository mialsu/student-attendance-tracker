# Testing Quick Start

## Setup

### Option 1: Docker Compose (Recommended)

Tests use a real PostgreSQL database via Docker Compose:

```bash
# Start test database and run tests (automatic cleanup)
./scripts/run-tests-docker.sh

# Run with custom pytest arguments
./scripts/run-tests-docker.sh -v tests/test_auth.py

# Run specific test
./scripts/run-tests-docker.sh -k test_signup
```

### Option 2: Manual Setup

If you have PostgreSQL running locally:

```bash
# Install dependencies (including test packages)
pip install -r requirements.txt

# Set test database URL
export TEST_DATABASE_URL="postgresql+asyncpg://attendance_user:test_password_123@localhost:5433/attendance_tracker_test"

# Run tests
pytest
```

## Run Tests

```bash
# RECOMMENDED: Run with Docker Compose
./scripts/run-tests-docker.sh

# Manual testing (requires PostgreSQL running)
pytest

# Run with coverage
pytest --cov=app

# Run specific test file
pytest tests/test_auth.py

# Run in verbose mode
pytest -v

# Run and stop at first failure
pytest -x
```

## Test Files

| File | Tests | Coverage |
|------|-------|----------|
| `test_auth.py` | 20 tests | Authentication endpoints |
| `test_classes.py` | 16 tests | Classes CRUD |
| `test_attendance.py` | 18 tests | Attendance tracking |
| `test_main.py` | 2 tests | Basic endpoints |

**Total: 54+ tests**

## Expected Output

```
tests/test_auth.py ................ (20 tests)
tests/test_classes.py ............ (16 tests)
tests/test_attendance.py .......... (18 tests)
tests/test_main.py .. (2 tests)

=============== 56 passed in 2.34s ===============

Coverage: 92%
```

## Troubleshooting

### Import Errors

```bash
# Make sure you're in the right directory
cd student-attendance-tracker-api

# Activate virtual environment
source venv/bin/activate
```

### Database Errors

Tests use a real PostgreSQL database (via Docker Compose).

```bash
# Check if test database is running
docker ps | grep attendance-db-test

# Manually start test database
cd deployment/local
docker compose --profile test up -d db-test

# Check database logs
docker compose --profile test logs db-test
```

### Slow Tests

```bash
# Run in parallel (requires pytest-xdist)
pip install pytest-xdist
pytest -n auto
```

## TDD Workflow

1. **Write failing test**:
```python
async def test_new_feature(client, auth_headers):
    response = await client.get("/api/new-endpoint", headers=auth_headers)
    assert response.status_code == 200
```

2. **Run test** (should fail):
```bash
pytest tests/test_new.py -x
```

3. **Implement feature** in `app/api/`

4. **Run test again** (should pass):
```bash
pytest tests/test_new.py -v
```

5. **Refactor** and ensure tests still pass

## CI/CD

Tests run automatically via GitHub Actions on:
- Every push to `main` or `develop` branches
- Every pull request
- Uses PostgreSQL 17 service container
- Uploads coverage reports to Codecov
- Generates HTML coverage reports as artifacts

**Requirement**: All tests must pass before merging!

### Local Testing Environment

- **Test Database**: PostgreSQL 17 (Docker container)
- **Port**: 5433 (to avoid conflicts with development database on 5432)
- **Database**: `attendance_tracker_test`
- **User**: `attendance_user`
- **Password**: `test_password_123`

### CI/CD Testing Environment

- **Test Database**: PostgreSQL 17 (GitHub Actions service container)
- **Port**: 5432
- **Database**: `attendance_tracker_test`
- **User**: `attendance_user`
- **Password**: `test_password`

---

For detailed testing guide, see `TESTING_GUIDE.md`

