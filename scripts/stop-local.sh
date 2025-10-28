#!/bin/bash
set -e

echo "🛑 Stopping Local Development Environment..."

cd "$(dirname "$0")/../local"

docker-compose down

echo "✅ Local environment stopped!"
echo ""
echo "💡 To remove volumes (database data), run:"
echo "   docker-compose -f deployment/local/docker-compose.yml down -v"

