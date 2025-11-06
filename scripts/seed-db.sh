#!/bin/bash

# Seed database with test data
# Usage: ./scripts/seed-db.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "🌱 Seeding database with test data..."
echo ""

# Check if virtual environment is activated
if [ -z "$VIRTUAL_ENV" ]; then
    echo "⚠️  Warning: Virtual environment not activated"
    echo "   Consider running: source venv/bin/activate"
    echo ""
fi

# Run the seed script
python scripts/seed_data.py

echo ""
echo "✅ Database seeding complete!"
