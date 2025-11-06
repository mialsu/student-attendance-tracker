#!/bin/bash

ENVIRONMENT=${1:-local}
SERVICE=${2:-}

cd "$(dirname "$0")/../$ENVIRONMENT"

if [ -z "$SERVICE" ]; then
    echo "📊 Showing logs for all services ($ENVIRONMENT)..."
    docker compose logs -f --tail=100
else
    echo "📊 Showing logs for $SERVICE ($ENVIRONMENT)..."
    docker compose logs -f --tail=100 "$SERVICE"
fi

