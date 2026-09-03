#!/bin/bash
set -e

echo "🔄 Generating Database Migration..."

# Check if virtual environment is activated
if [ -z "$VIRTUAL_ENV" ]; then
    echo "⚠️  Virtual environment not activated!"
    echo "Please run: source venv/bin/activate"
    exit 1
fi

# Check if message provided
if [ -z "$1" ]; then
    echo "❌ Error: Migration message required"
    echo "Usage: ./scripts/generate-migration.sh \"Migration message\""
    echo "Example: ./scripts/generate-migration.sh \"Initial migration\""
    exit 1
fi

MESSAGE="$1"

# Navigate to project root
cd "$(dirname "$0")/.."

# Check if database is reachable
echo "🔍 Checking database connection..."
python -c "from app.database import engine; import asyncio; asyncio.run(engine.dispose())" 2>/dev/null || {
    echo "❌ Cannot connect to database!"
    echo "Make sure PostgreSQL is running:"
    echo "  cd deployment/local && docker-compose up -d db"
    exit 1
}

echo "✅ Database connection OK"
echo ""

# Generate migration
echo "📝 Generating migration: $MESSAGE"
alembic revision --autogenerate -m "$MESSAGE"

echo ""
echo "✅ Migration generated!"
echo ""
echo "📂 Check the file in: alembic/versions/"
echo ""
echo "Next steps:"
echo "  1. Review the generated migration file"
echo "  2. Apply it: alembic upgrade head"
echo "  3. Verify: alembic current"

