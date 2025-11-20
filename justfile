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

# Run all tests
test:
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

# Format code with black
fmt:
    black app tests
    @echo "✓ Code formatted"

# Lint code with flake8
lint:
    flake8 app tests
    @echo "✓ Linting complete"

# Type check with mypy
typecheck:
    mypy app
    @echo "✓ Type checking complete"

# Run all quality checks (format, lint, test)
check:
    @echo "Running code quality checks..."
    just fmt
    just lint
    just test
    @echo "✓ All checks passed!"

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
