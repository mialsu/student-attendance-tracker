#!/bin/bash
set -e

ENVIRONMENT=${1:-production}
BACKUP_FILE=$2

if [ -z "$BACKUP_FILE" ]; then
    echo "Usage: $0 <environment> <backup_file>"
    echo "Example: $0 production backup_20250126_120000.sql.gz"
    exit 1
fi

BACKUP_DIR="$(dirname "$0")/../$ENVIRONMENT/backups"

if [ ! -f "$BACKUP_DIR/$BACKUP_FILE" ]; then
    echo "❌ Error: Backup file not found: $BACKUP_DIR/$BACKUP_FILE"
    exit 1
fi

echo "⚠️  WARNING: This will restore the database from backup!"
echo "Environment: $ENVIRONMENT"
echo "Backup file: $BACKUP_FILE"
read -p "Are you sure? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "❌ Restore cancelled"
    exit 1
fi

# Source environment variables
source "$(dirname "$0")/../$ENVIRONMENT/.env"

# Determine container name
if [ "$ENVIRONMENT" = "production" ]; then
    CONTAINER="attendance-db-prod"
else
    CONTAINER="attendance-db-local"
fi

echo "📦 Restoring backup..."
gunzip < "$BACKUP_DIR/$BACKUP_FILE" | \
    docker exec -i "$CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"

echo "✅ Database restored successfully!"

