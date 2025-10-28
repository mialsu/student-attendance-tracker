# Testing Quick Start

## Setup

```bash
# Install dependencies (including test packages)
pip install -r requirements.txt

# Verify pytest is installed
pytest --version
```

## Run Tests

```bash
# Run all tests
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

Tests use in-memory SQLite - no PostgreSQL needed!

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

Tests run automatically on:
- Every commit
- Every pull request
- Before deployment

**Requirement**: All tests must pass before merging!

---

For detailed testing guide, see `TESTING_GUIDE.md`

