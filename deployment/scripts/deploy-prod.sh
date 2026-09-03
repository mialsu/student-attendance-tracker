#!/bin/bash
set -e

echo "🚀 Deploying to Production..."

# Check if .env exists
if [ ! -f ../production/.env ]; then
    echo "❌ Error: deployment/production/.env not found!"
    echo "Please create it from .env.example and configure with production values."
    exit 1
fi

# Navigate to production deployment directory
cd "$(dirname "$0")/../production"

# Build frontend first
echo "📦 Building frontend..."
cd ../../client-app
npm run build
cd ../deployment/production

# Pull latest images
echo "🐳 Pulling latest images..."
docker-compose pull

# Build and start containers
echo "🐳 Building and starting production containers..."
docker-compose up -d --build

# Wait for services to be healthy
echo "⏳ Waiting for services to be healthy..."
sleep 10

# Check backend health
echo "🔍 Checking backend health..."
until docker exec attendance-backend-prod curl -f http://localhost:8000/health &> /dev/null; do
    echo "   Backend not ready yet, waiting..."
    sleep 5
done

echo ""
echo "✅ Production deployment complete!"
echo ""
echo "📍 Services:"
echo "   Frontend:  https://yourdomain.com"
echo "   Backend:   https://yourdomain.com/api"
echo "   API Docs:  https://yourdomain.com/docs"
echo ""
echo "📊 View logs:"
echo "   docker-compose -f deployment/production/docker-compose.yml logs -f"
echo ""
echo "💾 Setup automated backups:"
echo "   ./deployment/scripts/setup-backup.sh"

