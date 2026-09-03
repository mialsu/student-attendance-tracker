#!/bin/bash
set -e

ENVIRONMENT=${1:-production}
BACKUP_DIR="$(dirname "$0")/../$ENVIRONMENT/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo "💾 Backing up database ($ENVIRONMENT)..."

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Source environment variables
if [ -f "$(dirname "$0")/../$ENVIRONMENT/.env" ]; then
    source "$(dirname "$0")/../$ENVIRONMENT/.env"
else
    echo "❌ Error: .env file not found for $ENVIRONMENT"
    exit 1
fi

# Determine container name
if [ "$ENVIRONMENT" = "production" ]; then
    CONTAINER="attendance-db-prod"
else
    CONTAINER="attendance-db-local"
fi

# Create backup
echo "📦 Creating backup: $TIMESTAMP..."
docker exec "$CONTAINER" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" | \
    gzip > "$BACKUP_DIR/backup_${TIMESTAMP}.sql.gz"

# Keep only last 7 daily backups
echo "🧹 Cleaning old backups (keeping last 7)..."
cd "$BACKUP_DIR"
ls -t backup_*.sql.gz | tail -n +8 | xargs -r rm --

echo "✅ Backup complete: backup_${TIMESTAMP}.sql.gz"
echo "📍 Location: $BACKUP_DIR"

