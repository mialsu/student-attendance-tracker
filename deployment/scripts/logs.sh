#!/bin/bash
# Container logs, optionally filtered to the JSON lines the API emits (spec 0005).
#
#   logs.sh <env> [service]                      every line, exactly as docker prints it
#   logs.sh <env> [service] --json [jq-filter]   only the app's JSON lines, pretty-printed
#
# The --json path exists because this log is mixed: the API writes one JSON object per line,
# while uvicorn's access lines, its tracebacks, postgres and nginx all write plain text to the
# same stream. `fromjson?` is what makes that safe -- a line that is not JSON is skipped, where
# a bare `jq .` aborts the whole pipe on the first one.
#
# The documented paths (AC-17):
#   ./logs.sh production backend --json
#   ./logs.sh production backend --json 'select(.level == "WARNING")'
#   ./logs.sh production backend --json 'select(.rule == "INV-1")'
#   ./logs.sh production backend --json 'select(.request_id == "abc123")'
#
# That last one is the join: an nginx access line carries `request_id=<id>` for the same
# request, so grep the id out of nginx's lines and filter the app's by it. Fields are listed in
# specs/0005-application-logging.md under "Line shape".

set -uo pipefail

usage() {
    cat >&2 <<'USAGE'
usage: logs.sh <environment> [service] [--json [jq-filter]]

  <environment>   a directory beside local/ and production/
  [service]       one compose service; omit it for all of them
  --json          keep only the JSON lines the API emits, pretty-printed
  [jq-filter]     a jq expression applied after fromjson

examples:
  logs.sh production backend
  logs.sh production backend --json
  logs.sh production backend --json 'select(.level == "WARNING")'
USAGE
    exit "${1:-2}"
}

# Help before anything else: $1 is consumed as the environment below, so a leading -h would
# otherwise be taken as a directory name and fail at the cd.
case "${1:-}" in
    -h|--help) usage 0 ;;
esac

ENVIRONMENT=${1:-local}
SERVICE=""
JSON_LINES_ONLY=0
FILTER="."

shift || true
while [ $# -gt 0 ]; do
    case "$1" in
        --json)
            JSON_LINES_ONLY=1
            shift
            # Everything after --json is the filter, so a jq expression is free to start with a
            # dash. An earlier version tested the next argument for a leading dash instead, and
            # `--json '-1'` then dropped the filter and also overwrote the service with `-1`.
            if [ $# -gt 0 ]; then
                FILTER="$1"
                shift
            fi
            if [ $# -gt 0 ]; then
                echo "unexpected argument after the jq filter: $1" >&2
                usage
            fi
            ;;
        -h|--help)
            usage 0
            ;;
        -*)
            echo "unknown option: $1" >&2
            usage
            ;;
        *)
            # Refusing the second one matters: silently keeping the last would tail a service
            # the caller did not ask about, which is indistinguishable from a quiet service.
            if [ -n "$SERVICE" ]; then
                echo "only one service at a time (got '$SERVICE' and '$1')" >&2
                usage
            fi
            SERVICE="$1"
            shift
            ;;
    esac
done

# Without the guard a bad env name leaves us in scripts/, where `docker compose logs` finds
# no project and reports nothing -- which reads exactly like a quiet service.
cd "$(dirname "$0")/../$ENVIRONMENT" 2>/dev/null || {
    echo "no such environment: $ENVIRONMENT (expected a directory beside local/ and production/)" >&2
    exit 1
}

if [ "$JSON_LINES_ONLY" -eq 1 ]; then
    if ! command -v jq >/dev/null 2>&1; then
        echo "jq is required for --json. Install it (apt install jq) or drop the flag." >&2
        exit 1
    fi
    echo "📊 JSON lines for ${SERVICE:-all services} ($ENVIRONMENT), filter: $FILTER"
    # --no-log-prefix  the "backend-1  | " docker prepends is not part of the JSON object.
    # -R + fromjson?   read raw lines and drop the ones that are not JSON.
    # --unbuffered     without it jq batches its output and -f stops being a live tail.
    docker compose logs -f --no-log-prefix --tail=100 ${SERVICE:+"$SERVICE"} \
        | jq -R --unbuffered "fromjson? | $FILTER"
elif [ -z "$SERVICE" ]; then
    echo "📊 Showing logs for all services ($ENVIRONMENT)..."
    docker compose logs -f --tail=100
else
    echo "📊 Showing logs for $SERVICE ($ENVIRONMENT)..."
    docker compose logs -f --tail=100 "$SERVICE"
fi
