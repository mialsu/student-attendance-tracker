#!/bin/bash
set -e

echo "🚀 Starting Local Development Environment..."

# Navigate to local deployment directory
cd "$(dirname "$0")/../local"

# Check if .env exists, if not copy from example
if [ ! -f .env ]; then
    echo "📝 Creating .env from .env.example..."
    cp .env.example .env
fi

# Build and start containers
echo "🐳 Building and starting Docker containers..."
docker-compose up -d --build

echo ""
echo "✅ Local environment is starting up!"
echo ""
echo "📍 Services:"
echo "   Frontend:  http://localhost:5173"
echo "   Backend:   http://localhost:8000"
echo "   API Docs:  http://localhost:8000/docs"
echo "   Database:  localhost:5432"
echo ""
echo "📊 View logs:"
echo "   docker-compose -f deployment/local/docker-compose.yml logs -f"
echo ""
echo "🛑 Stop services:"
echo "   ./deployment/scripts/stop-local.sh"

