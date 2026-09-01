#!/bin/bash
#
# Registration codes from the command line.
#
# Issuing a code is authorized by having access to this database — there is no HTTP endpoint and
# no role behind it (ADR-0003). Run it where DATABASE_URL points at the database you mean.
#
# Usage:
#   ./scripts/registration-code.sh issue  teacher@example.com
#   ./scripts/registration-code.sh revoke teacher@example.com
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

if [ ! -d "$PROJECT_ROOT/venv" ]; then
    echo -e "${RED}Error: Virtual environment not found${NC}"
    echo "Please create it with: python3 -m venv venv"
    exit 1
fi

source "$PROJECT_ROOT/venv/bin/activate"

if [ ! -f "$PROJECT_ROOT/.env" ]; then
    echo -e "${YELLOW}Warning: .env file not found — using the environment's DATABASE_URL${NC}"
    echo ""
fi

echo -e "${GREEN}Student Attendance Tracker — registration codes${NC}"

python "$SCRIPT_DIR/registration_code.py" "$@"
