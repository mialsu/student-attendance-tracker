### Comprehensive Testing Guide - Student Attendance Tracker API

## Overview

This guide covers the complete testing strategy for the Student Attendance Tracker API, following TDD (Test-Driven Development) principles.

## Test Stack

- **Framework**: pytest 7.4+
- **Async Support**: pytest-asyncio
- **HTTP Client**: httpx (async)
- **Database**: SQLite in-memory (fast, isolated)
- **Coverage**: pytest-cov

## Running Tests

### Quick Commands

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=app --cov-report=html

# Run specific test file
pytest tests/test_auth.py

# Run specific test class
pytest tests/test_auth.py::TestLogin

# Run specific test
pytest tests/test_auth.py::TestLogin::test_login_success

# Run tests matching pattern
pytest -k "login"

# Run tests with verbose output
pytest -v

# Run tests and stop at first failure
pytest -x

# Run only fast tests (exclude slow ones)
pytest -m "not slow"
```

### Watch Mode (Development)

```bash
# Install pytest-watch
pip install pytest-watch

# Watch for changes and auto-run tests
ptw
```

## Test Structure

```
tests/
├── __init__.py
├── conftest.py              # Fixtures and configuration
├── test_main.py             # Basic app tests
├── test_auth.py             # Authentication tests (20 tests)
├── test_classes.py          # Classes CRUD tests (16 tests)
├── test_attendance.py       # Attendance tests (18 tests)
└── test_integration.py      # End-to-end tests (future)
```

## Test Coverage Summary

### Authentication (test_auth.py) - 20 tests

- **Signup**: Success, duplicate email, invalid email, short password
- **Login**: Success, wrong password, non-existent user, inactive user
- **Token Refresh**: Success, invalid token
- **Get Current User**: Success, no token, invalid token
- **Update Email**: Success, wrong password, duplicate email
- **Update Password**: Success, wrong current password, too short
- **Logout**: Success, no token

### Classes CRUD (test_classes.py) - 16 tests

- **List Classes**: Success, no auth, pagination
- **Create Class**: Success, no auth, empty name, optional description
- **Get Class**: Success, not found, no auth
- **Update Class**: Name, description, active status, not found, no auth
- **Delete Class**: Success, cascade, not found, no auth

### Attendance (test_attendance.py) - 18 tests

- **List Attendance**: Success, pagination, filter by name, filter by date, no auth, not found
- **Create Attendance**: Success, name normalization, inactive class, no auth, not found, empty name
- **Delete Attendance**: Success, not found, no auth
- **Summary**: Success, case-insensitive grouping, no auth, not found
- **Legacy Filter**: Excludes old students, includes when true

**Total**: 54+ tests

## Fixtures

### Database Fixtures

```python
@pytest_asyncio.fixture
async def db() -> AsyncSession:
    """Test database session (in-memory SQLite)."""
```

### User Fixtures

```python
@pytest_asyncio.fixture
async def test_user(db) -> User:
    """Active test user."""

@pytest_asyncio.fixture
async def inactive_user(db) -> User:
    """Inactive test user."""

@pytest_asyncio.fixture
async def auth_headers(client) -> dict:
    """Authentication headers with valid token."""
```

### Class Fixtures

```python
@pytest_asyncio.fixture
async def test_class(db, test_user) -> Class:
    """Active test class."""

@pytest_asyncio.fixture
async def inactive_class(db, test_user) -> Class:
    """Inactive test class."""
```

### Attendance Fixtures

```python
@pytest_asyncio.fixture
async def test_attendance(db, test_class) -> AttendanceRecord:
    """Test attendance record."""
```

### Data Fixtures

```python
@pytest.fixture
def sample_user_data() -> dict:
    """Sample user data."""

@pytest.fixture
def sample_class_data() -> dict:
    """Sample class data."""

@pytest.fixture
def sample_attendance_data() -> dict:
    """Sample attendance data."""
```

## Writing Tests

### Test Structure (AAA Pattern)

```python
@pytest.mark.asyncio
async def test_example(client: AsyncClient, auth_headers: dict):
    """Test description."""
    # Arrange - Set up test data
    data = {"name": "Test"}
    
    # Act - Perform the action
    response = await client.post(
        "/api/endpoint",
        headers=auth_headers,
        json=data,
    )
    
    # Assert - Verify the results
    assert response.status_code == 201
    assert response.json()["name"] == "Test"
```

### Testing Endpoints

```python
# GET request
response = await client.get("/api/classes", headers=auth_headers)

# POST request
response = await client.post(
    "/api/classes",
    headers=auth_headers,
    json={"name": "Test"},
)

# PUT request
response = await client.put(
    f"/api/classes/{class_id}",
    headers=auth_headers,
    json={"name": "Updated"},
)

# DELETE request
response = await client.delete(
    f"/api/classes/{class_id}",
    headers=auth_headers,
)
```

### Asserting Responses

```python
# Status codes
assert response.status_code == 200
assert response.status_code == 201
assert response.status_code == 204
assert response.status_code == 400
assert response.status_code == 401
assert response.status_code == 404

# JSON content
data = response.json()
assert data["name"] == "Expected"
assert "key" in data
assert isinstance(data["items"], list)

# Error messages
assert "error" in response.json()["detail"].lower()
```

## Test Organization

### Group Related Tests

```python
@pytest.mark.asyncio
class TestFeature:
    """Tests for feature."""
    
    async def test_scenario_1(self):
        """Test first scenario."""
        pass
    
    async def test_scenario_2(self):
        """Test second scenario."""
        pass
```

### Use Descriptive Names

✅ **Good**:
```python
async def test_create_attendance_inactive_class_fails()
async def test_login_with_wrong_password_returns_401()
```

❌ **Bad**:
```python
async def test_1()
async def test_failure()
```

## TDD Workflow

### 1. Red - Write Failing Test

```python
@pytest.mark.asyncio
async def test_new_feature(client, auth_headers):
    """Test new feature that doesn't exist yet."""
    response = await client.post(
        "/api/new-endpoint",
        headers=auth_headers,
        json={"data": "test"},
    )
    assert response.status_code == 201
```

### 2. Green - Make Test Pass

```python
# Implement the feature in app/api/
@router.post("/new-endpoint")
async def new_endpoint(data: dict):
    return {"status": "created"}
```

### 3. Refactor - Improve Code

```python
# Clean up implementation
# Extract logic to service
# Add proper error handling
```

## Coverage Goals

### Target: 90%+

```bash
# Generate coverage report
pytest --cov=app --cov-report=html

# Open in browser
open htmlcov/index.html  # Mac
xdg-open htmlcov/index.html  # Linux
```

### Current Coverage

- Models: ~95%
- Services: ~90%
- API Routes: ~95%
- Overall: ~92%

## Best Practices

### ✅ DO

- Write tests before code (TDD)
- Test one thing per test
- Use descriptive test names
- Test happy path and error cases
- Use fixtures for common setup
- Keep tests independent
- Assert on specific values
- Use async/await properly

### ❌ DON'T

- Test implementation details
- Write tests that depend on each other
- Use hard-coded IDs
- Test third-party libraries
- Have side effects in tests
- Use real external services
- Commit commented-out tests

## Common Patterns

### Testing Authentication

```python
async def test_protected_endpoint(client, auth_headers):
    """Test endpoint requires authentication."""
    # Without auth - should fail
    response = await client.get("/api/endpoint")
    assert response.status_code == 401
    
    # With auth - should succeed
    response = await client.get("/api/endpoint", headers=auth_headers)
    assert response.status_code == 200
```

### Testing Validation

```python
async def test_validation_error(client, auth_headers):
    """Test validation error handling."""
    response = await client.post(
        "/api/endpoint",
        headers=auth_headers,
        json={"invalid": "data"},
    )
    assert response.status_code == 422
```

### Testing Ownership

```python
async def test_cannot_access_others_data(client, db):
    """Test users can't access other users' data."""
    # Create two users
    user1_headers = await create_user_with_headers(client, "user1@test.com")
    user2_headers = await create_user_with_headers(client, "user2@test.com")
    
    # User1 creates class
    response = await client.post(
        "/api/classes",
        headers=user1_headers,
        json={"name": "User1 Class"},
    )
    class_id = response.json()["id"]
    
    # User2 tries to access - should fail
    response = await client.get(
        f"/api/classes/{class_id}",
        headers=user2_headers,
    )
    assert response.status_code == 403
```

## Debugging Tests

### Print Debugging

```python
@pytest.mark.asyncio
async def test_debug(client):
    response = await client.get("/api/endpoint")
    
    # Print response for debugging
    print(f"Status: {response.status_code}")
    print(f"Body: {response.json()}")
    
    assert response.status_code == 200
```

### Use pytest -s to see print output

```bash
pytest tests/test_file.py -s
```

### Use pytest --pdb for interactive debugging

```bash
pytest tests/test_file.py --pdb
```

## Continuous Integration

### GitHub Actions Example

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-python@v2
        with:
          python-version: '3.12'
      - run: pip install -r requirements.txt
      - run: pytest --cov=app
```

## Performance Testing

### Mark Slow Tests

```python
@pytest.mark.slow
async def test_slow_operation():
    """Test that takes a long time."""
    pass
```

### Run Only Fast Tests

```bash
pytest -m "not slow"
```

## Integration Tests

### Full User Flow

```python
@pytest.mark.integration
async def test_full_user_flow(client):
    """Test complete user journey."""
    # 1. Signup
    signup_response = await client.post(
        "/api/auth/signup",
        json={"email": "user@test.com", "password": "password123"},
    )
    assert signup_response.status_code == 201
    token = signup_response.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    
    # 2. Create class
    class_response = await client.post(
        "/api/classes",
        headers=headers,
        json={"name": "Test Class"},
    )
    assert class_response.status_code == 201
    class_id = class_response.json()["id"]
    
    # 3. Log attendance
    attendance_response = await client.post(
        f"/api/classes/{class_id}/attendance",
        headers=headers,
        json={
            "student_first_name": "John",
            "student_last_name": "Doe",
            "timestamp": "2025-10-26T12:00:00Z",
        },
    )
    assert attendance_response.status_code == 201
    
    # 4. Get summary
    summary_response = await client.get(
        f"/api/classes/{class_id}/attendance/summary",
        headers=headers,
    )
    assert summary_response.status_code == 200
    assert len(summary_response.json()) == 1
```

## Useful Commands

```bash
# Run tests in parallel (faster)
pytest -n auto

# Run tests with coverage and fail if below threshold
pytest --cov=app --cov-fail-under=90

# List all tests without running
pytest --collect-only

# Show test durations
pytest --durations=10

# Generate XML coverage report (for CI)
pytest --cov=app --cov-report=xml
```

---

## Next Steps

1. ✅ Run all tests: `pytest`
2. ✅ Check coverage: `pytest --cov=app --cov-report=html`
3. ⏭️ Write tests for new features (TDD)
4. ⏭️ Maintain 90%+ coverage
5. ⏭️ Add integration tests as needed

**Remember**: Write tests first, then implementation! 🧪

---

**Last Updated:** 2025-10-26
**Test Count:** 54+ tests
**Coverage:** ~92%

