# Student Attendance Tracker API - Justfile
# Run 'just --list' to see all available commands

# Default recipe (runs when you just type 'just')
default:
    @just --list

# Install dependencies in virtual environment
install:
    python3 -m venv venv
    ./venv/bin/pip install -r requirements.txt
    @echo "✓ Dependencies installed. Activate venv with: source venv/bin/activate"

# Run development server with auto-reload
run:
    uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Run development server on custom port
run-port port:
    uvicorn app.main:app --reload --host 0.0.0.0 --port {{port}}

# Start a throwaway test database and print the export line. Port 5439, deliberately NOT the 5433
# that deployment/local's db-test is configured for — 5433 is taken by another project's container
# on this machine, so aiming a schema-dropping suite there would hit someone else's data.
test-db-up:
    @./scripts/test-db.sh up

# Destroy the throwaway test database (it holds nothing worth keeping — no volume, --rm).
test-db-down:
    @./scripts/test-db.sh down

# Run all tests. Requires TEST_DATABASE_URL to be set — the fixtures DROP tables, so the target
# database is named explicitly and never guessed from a default port (see tests/conftest.py).
test:
    @if [ -z "${TEST_DATABASE_URL:-}" ]; then \
        echo "TEST_DATABASE_URL is not set. These tests create and DROP tables."; \
        echo "  eval \"$(just test-db-up)\"    # throwaway database on port 5439"; \
        echo "Do NOT point this at port 5433 — that is another project's container."; exit 1; \
    fi
    pytest -v

# Run tests with coverage report
test-cov:
    pytest --cov=app --cov-report=html --cov-report=term
    @echo "✓ Coverage report generated in htmlcov/index.html"

# Run specific test file
test-file file:
    pytest {{file}} -v

# Run fast tests (skip slow ones)
test-fast:
    pytest -v -m "not slow"

# Apply database migrations
migrate:
    alembic upgrade head
    @echo "✓ Migrations applied"

# Create a new migration
migrate-create message:
    alembic revision --autogenerate -m "{{message}}"
    @echo "✓ Migration created"

# Rollback last migration
migrate-down:
    alembic downgrade -1
    @echo "✓ Rolled back one migration"

# Show current migration status
migrate-status:
    alembic current

# Show migration history
migrate-history:
    alembic history

# Create superadmin user interactively
superadmin:
    python scripts/create_superadmin.py

# Seed database with test data
seed:
    python scripts/seed_db.py

# Install the git hooks (one-off per clone — core.hooksPath is local config, not committed)
install-hooks:
    git config core.hooksPath .githooks
    @echo "✓ core.hooksPath -> .githooks  (pre-commit runs \`just check-fast\`)"

# Format code with ruff. NOT a gate: 33 of 51 files would change, so running this is a deliberate
# formatting commit of its own, not something to fold into a feature diff.
fmt:
    ./venv/bin/ruff format app tests
    @echo "✓ Code formatted"

# Lint with ruff (RATCHET against .harness-baseline — fails when the count grows, not when >0)
lint:
    ./scripts/baseline-guard.sh ruff ./venv/bin/ruff check app tests

# Lint, showing every finding rather than just the count
lint-verbose:
    ./venv/bin/ruff check app tests

# Boundary gate: app.api > app.services > app.models, plus the leaf contracts
boundaries:
    ./venv/bin/lint-imports

# Drift gate (devkit) + this repo's extra checks
drift:
    ./scripts/drift-check.sh
    ./scripts/drift-extra.sh

# The FAST gate set — what the pre-commit hook runs. No database, no network, ~3 seconds.
# There is deliberately no typecheck step: no Python type gate is installed. See REVIEW-DEBT.md.
check-fast:
    @echo "▸ boundaries"; just boundaries
    @echo "▸ drift";      just drift
    @echo "▸ lint";       just lint
    @echo "✓ fast gates green"

# THE full umbrella gate set. Needs TEST_DATABASE_URL and a running postgres. The suite takes
# ~3.5 minutes, which is why it is not in the pre-commit hook — run this before pushing.
check:
    just check-fast
    @echo "▸ tests"; just test
    @echo "✓ all gates green"

# Clean up Python cache files
clean:
    find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
    find . -type f -name "*.pyc" -delete
    find . -type d -name "*.egg-info" -exec rm -rf {} + 2>/dev/null || true
    find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true
    rm -rf htmlcov .coverage
    @echo "✓ Cleaned up cache files"

# Open API documentation in browser
docs:
    @echo "Opening API docs at http://localhost:8000/docs"
    python -m webbrowser http://localhost:8000/docs

# Show database connection info
db-info:
    @echo "Database connection info from .env:"
    @grep "DATABASE_URL" .env || echo "No DATABASE_URL found in .env"

# Connect to database with psql (requires DATABASE_URL in .env)
db-shell:
    #!/usr/bin/env bash
    DB_URL=$(grep "DATABASE_URL" .env | cut -d '=' -f2)
    if [[ $DB_URL == *"localhost"* ]]; then
        echo "Connecting to local database..."
        psql $DB_URL
    else
        echo "Error: Only localhost connections supported"
        exit 1
    fi

# Show application logs (if running in background)
logs:
    tail -f logs/app.log 2>/dev/null || echo "No log file found at logs/app.log"

# Check if server is running
status:
    @curl -s http://localhost:8000/health || echo "Server not running"

# Generate a new SECRET_KEY
generate-key:
    @openssl rand -hex 32

# Show environment info
env:
    @echo "Python version:"
    @python3 --version
    @echo ""
    @echo "Virtual environment:"
    @which python 2>/dev/null || echo "Not in virtual environment"
    @echo ""
    @echo "Installed packages:"
    @pip list 2>/dev/null || echo "pip not available"

# Start PostgreSQL in Docker (if not using local)
db-start:
    docker run -d \
        --name attendance-postgres \
        -e POSTGRES_USER=attendance_user \
        -e POSTGRES_PASSWORD=password \
        -e POSTGRES_DB=attendance_tracker \
        -p 5432:5432 \
        postgres:17-alpine
    @echo "✓ PostgreSQL started in Docker"

# Stop PostgreSQL Docker container
db-stop:
    docker stop attendance-postgres
    @echo "✓ PostgreSQL stopped"

# Remove PostgreSQL Docker container
db-remove:
    docker rm attendance-postgres
    @echo "✓ PostgreSQL container removed"

# Full setup from scratch
setup:
    @echo "Setting up Student Attendance Tracker API..."
    just install
    @echo ""
    @echo "Please configure your .env file before continuing."
    @echo "Copy .env.example to .env and update DATABASE_URL and SECRET_KEY"
    @echo ""
    @echo "Then run:"
    @echo "  source venv/bin/activate"
    @echo "  just migrate"
    @echo "  just superadmin"
    @echo "  just run"

# Development workflow: clean, test, and run
dev:
    just clean
    just test-fast
    just run
