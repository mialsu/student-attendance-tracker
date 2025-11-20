#!/bin/bash
#
# Create Superadmin User
#
# This script creates a superadmin user for the Student Attendance Tracker API.
# If the user already exists, it updates their role to superadmin.
#
# Usage: ./scripts/create-superadmin.sh
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo -e "${GREEN}Student Attendance Tracker - Create Superadmin${NC}"
echo ""

# Check if virtual environment exists
if [ ! -d "$PROJECT_ROOT/venv" ]; then
    echo -e "${RED}Error: Virtual environment not found${NC}"
    echo "Please create it with: python3 -m venv venv"
    exit 1
fi

# Activate virtual environment
source "$PROJECT_ROOT/venv/bin/activate"

# Check if .env file exists
if [ ! -f "$PROJECT_ROOT/.env" ]; then
    echo -e "${YELLOW}Warning: .env file not found${NC}"
    echo "Using default database configuration from .env.example"
    echo ""
fi

# Run the Python script
python "$SCRIPT_DIR/create_superadmin.py"
