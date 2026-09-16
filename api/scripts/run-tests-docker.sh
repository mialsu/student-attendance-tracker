#!/bin/bash
#
# Run the test suite against a disposable PostgreSQL started by scripts/test-db.sh.
#
# This script used to start the compose `db-test` service and export its own
# TEST_DATABASE_URL hardcoded to port 5433. That was the footgun /audit logged as finding #6:
# on some machines 5433 belongs to another project's container, and the fixtures call
# Base.metadata.drop_all -- so it aimed a schema-dropping suite at someone else's database.
# Two copies of one connection string is what allowed them to disagree, so this script no
# longer owns one: scripts/test-db.sh is the single place a port and a URL are decided, and
# its port is overridable with TEST_DB_PORT because no port is free on every machine.
#
# Usage:
#   ./scripts/run-tests-docker.sh                      # whole suite, with coverage
#   ./scripts/run-tests-docker.sh -v tests/test_auth.py
#   TEST_DB_PORT=5445 ./scripts/run-tests-docker.sh    # if 5439 is taken here

set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# Refuse to run alongside another session: the fixtures drop tables, so two concurrent runs
# corrupt each other and neither result means anything.
if pgrep -x pytest >/dev/null 2>&1 || pgrep -f "[p]ython.* -m pytest" >/dev/null 2>&1; then
    echo -e "${RED}another pytest session is already running -- refusing to start.${NC}" >&2
    echo "pgrep -af '[p]ytest' to see it." >&2
    exit 1
fi

# Fail by name rather than as a bare "command not found": there is no venv in a fresh clone,
# and CLAUDE.md's Backend Development section is what creates one.
if ! command -v pytest >/dev/null 2>&1; then
    echo -e "${RED}pytest is not on PATH.${NC}" >&2
    echo "Create the venv first: python3.12 -m venv venv && source venv/bin/activate" >&2
    echo "                       pip install -r requirements.txt" >&2
    exit 1
fi

echo -e "${YELLOW}Starting disposable test database...${NC}"
eval "$(./scripts/test-db.sh up)"          # exports TEST_DATABASE_URL
echo -e "${GREEN}Database ready at ${TEST_DATABASE_URL}${NC}"

# app/config.py is an import-time singleton, so conftest.py fails at import without these.
# Aimed at the throwaway database too: nothing here may point at a database worth keeping.
export DATABASE_URL="$TEST_DATABASE_URL"
export SECRET_KEY="${SECRET_KEY:-test-secret-key-not-a-real-one}"
export DOCS_USERNAME="${DOCS_USERNAME:-test}"
export DOCS_PASSWORD="${DOCS_PASSWORD:-test-not-a-real-password}"
export ENVIRONMENT="${ENVIRONMENT:-test}"

# Tracing must be OFF: exactly one test asserts that a log line carries no trace_id, and an
# ambient OTLP endpoint (the local backend container sets one) makes it fail for no good reason.
unset OTEL_EXPORTER_OTLP_ENDPOINT OTEL_EXPORTER_OTLP_PROTOCOL \
      OTEL_SERVICE_NAME OTEL_RESOURCE_ATTRIBUTES

cleanup() {
    echo -e "${YELLOW}Destroying test database...${NC}"
    ./scripts/test-db.sh down || true
}
trap cleanup EXIT

echo -e "${YELLOW}Running tests...${NC}"
if [ "$#" -gt 0 ]; then
    pytest "$@"
else
    pytest -v --cov=app --cov-report=term-missing
fi
