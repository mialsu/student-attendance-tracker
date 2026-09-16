#!/bin/bash
#
# Throwaway PostgreSQL for running the test suite.
#
# Why this exists: the test fixtures call Base.metadata.drop_all, so TEST_DATABASE_URL must point
# at a database that exists ONLY for these tests. Two traps make that harder than it sounds:
#
#   1. deployment/local/docker-compose.yml's `db-test` service is configured for host port 5433,
#      which on this machine is taken by `platform-postgres` — a DIFFERENT project's container.
#      Starting db-test therefore fails to bind, and pointing at 5433 by hand aims a
#      schema-dropping suite at someone else's data.
#   2. tests/conftest.py used to default to exactly that. The default was removed; this script is
#      the safe replacement.
#
# This container is disposable: --rm, no volume, so `down` destroys the data by design.
#
# Usage:
#   eval "$(./scripts/test-db.sh up)"     # start it and export TEST_DATABASE_URL
#   ./scripts/test-db.sh url              # print the export line only
#   ./scripts/test-db.sh down             # stop and destroy it

set -euo pipefail

NAME=attendance-test-db
# Deliberately not 5433 (see trap 1 above). Overridable because 5439 is only free on *this*
# machine: a hardcoded port is the defect trap 1 describes, and picking a different default
# would repeat it rather than fix it. Set TEST_DB_PORT to move it; the in-use guard below still
# refuses to guess.
PORT="${TEST_DB_PORT:-5439}"
USER=attendance_user
PASS=test_password_123
DB=attendance_tracker_test
URL="postgresql+asyncpg://${USER}:${PASS}@127.0.0.1:${PORT}/${DB}"

case "${1:-}" in
  url)
    echo "export TEST_DATABASE_URL=${URL}"
    ;;

  up)
    if docker ps --format '{{.Names}}' | grep -qx "$NAME"; then
      # Report the port it is ACTUALLY published on, not the one just asked for. With PORT
      # overridable these can differ, and printing the requested one hands back a URL that
      # connects to nothing -- or to whatever else holds that port.
      running_port="$(docker port "$NAME" 5432 2>/dev/null | head -n1 | sed 's/.*://')"
      if [ -z "$running_port" ]; then
        echo "${NAME} is running but publishes no port for 5432 -- remove it and retry:" >&2
        echo "  ./scripts/test-db.sh down" >&2
        exit 1
      fi
      if [ "$running_port" != "$PORT" ]; then
        echo "# ${NAME} is already running on ${running_port}, not the requested ${PORT}." >&2
        echo "# Using ${running_port}. ./scripts/test-db.sh down first to move it." >&2
      else
        echo "# ${NAME} already running on ${running_port}" >&2
      fi
      echo "export TEST_DATABASE_URL=postgresql+asyncpg://${USER}:${PASS}@127.0.0.1:${running_port}/${DB}"
      exit 0
    fi

    if ss -lnt 2>/dev/null | grep -q ":${PORT} "; then
      echo "port ${PORT} is already in use by something else — refusing to guess." >&2
      echo "Free it, or pick another port:  TEST_DB_PORT=5445 $0 up" >&2
      exit 1
    fi

    docker run -d --rm --name "$NAME" \
      -e POSTGRES_USER="$USER" \
      -e POSTGRES_PASSWORD="$PASS" \
      -e POSTGRES_DB="$DB" \
      -p "127.0.0.1:${PORT}:5432" \
      postgres:17-alpine >/dev/null

    for _ in $(seq 1 30); do
      if docker exec "$NAME" pg_isready -U "$USER" -d "$DB" >/dev/null 2>&1; then
        echo "export TEST_DATABASE_URL=${URL}"
        echo "# ${NAME} ready on ${PORT}" >&2
        exit 0
      fi
      sleep 1
    done

    echo "${NAME} did not become ready in 30s" >&2
    docker logs --tail 20 "$NAME" >&2 || true
    exit 1
    ;;

  down)
    docker rm -f "$NAME" >/dev/null 2>&1 && echo "${NAME} removed" || echo "${NAME} was not running"
    ;;

  *)
    sed -n '/^# Usage:/,/down /p' "$0" | sed 's/^# \{0,1\}//'
    exit 2
    ;;
esac
