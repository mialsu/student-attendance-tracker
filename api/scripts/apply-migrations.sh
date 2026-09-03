#!/bin/bash
set -e

echo "🚀 Applying Database Migrations..."

# Check if virtual environment is activated
if [ -z "$VIRTUAL_ENV" ]; then
    echo "⚠️  Virtual environment not activated!"
    echo "Please run: source venv/bin/activate"
    exit 1
fi

# Navigate to project root
cd "$(dirname "$0")/.."

# Show current state
echo "📊 Current migration state:"
alembic current

echo ""
echo "📋 Available migrations:"
alembic heads

echo ""
read -p "Apply migrations? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "❌ Migration cancelled"
    exit 0
fi

# Apply migrations
echo ""
echo "⏳ Applying migrations..."
alembic upgrade head

echo ""
echo "✅ Migrations applied successfully!"
echo ""
echo "📊 New state:"
alembic current

