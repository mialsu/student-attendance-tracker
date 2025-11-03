#!/bin/bash

# Script to run tests with PostgreSQL test database via Docker Compose
# Usage: ./scripts/run-tests-docker.sh [pytest-args]

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Get the script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$PROJECT_ROOT/../deployment/local/docker-compose.yml"

echo -e "${YELLOW}Starting PostgreSQL test database...${NC}"

# Start the test database service
docker compose -f "$COMPOSE_FILE" --profile test up -d db-test

# Wait for database to be healthy
echo -e "${YELLOW}Waiting for database to be ready...${NC}"
timeout=30
counter=0
until docker compose -f "$COMPOSE_FILE" exec -T db-test pg_isready -U attendance_user -d attendance_tracker_test > /dev/null 2>&1; do
    counter=$((counter + 1))
    if [ $counter -gt $timeout ]; then
        echo -e "${RED}Timeout waiting for database to be ready${NC}"
        docker compose -f "$COMPOSE_FILE" --profile test down
        exit 1
    fi
    echo -n "."
    sleep 1
done

echo -e "\n${GREEN}Database is ready!${NC}"

# Set test database URL
export TEST_DATABASE_URL="postgresql+asyncpg://attendance_user:test_password_123@localhost:5433/attendance_tracker_test"

# Run tests
echo -e "${YELLOW}Running tests...${NC}"
cd "$PROJECT_ROOT"

if [ -n "$1" ]; then
    # Run with custom pytest arguments
    pytest "$@"
    TEST_EXIT_CODE=$?
else
    # Run all tests with coverage
    pytest -v --cov=app --cov-report=term-missing --cov-report=html
    TEST_EXIT_CODE=$?
fi

# Cleanup: Stop test database
echo -e "${YELLOW}Stopping test database...${NC}"
docker compose -f "$COMPOSE_FILE" --profile test down

if [ $TEST_EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}Tests completed successfully!${NC}"
else
    echo -e "${RED}Tests failed with exit code $TEST_EXIT_CODE${NC}"
fi

exit $TEST_EXIT_CODE
