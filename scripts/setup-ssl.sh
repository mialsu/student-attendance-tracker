#!/bin/bash
set -e

echo "🔐 Setting up SSL with Let's Encrypt..."

# Check if running on production server
if [ ! -f ../production/.env ]; then
    echo "❌ Error: production/.env not found!"
    exit 1
fi

# Source the environment file
source ../production/.env

if [ -z "$DOMAIN" ] || [ -z "$EMAIL" ]; then
    echo "❌ Error: DOMAIN and EMAIL must be set in .env"
    exit 1
fi

echo "📍 Domain: $DOMAIN"
echo "📧 Email: $EMAIL"

# Install certbot if not present
if ! command -v certbot &> /dev/null; then
    echo "📦 Installing certbot..."
    sudo apt-get update
    sudo apt-get install -y certbot
fi

# Stop nginx temporarily
echo "🛑 Stopping nginx..."
cd ../production
docker-compose stop nginx

# Obtain certificate
echo "📜 Obtaining SSL certificate..."
sudo certbot certonly --standalone \
    -d "$DOMAIN" \
    -d "www.$DOMAIN" \
    --email "$EMAIL" \
    --agree-tos \
    --non-interactive

# Create SSL directory
sudo mkdir -p ./ssl

# Copy certificates
echo "📋 Copying certificates..."
sudo cp /etc/letsencrypt/live/"$DOMAIN"/fullchain.pem ./ssl/
sudo cp /etc/letsencrypt/live/"$DOMAIN"/privkey.pem ./ssl/
sudo chmod 644 ./ssl/fullchain.pem
sudo chmod 644 ./ssl/privkey.pem

# Restart nginx
echo "▶️ Starting nginx..."
docker-compose up -d nginx

echo ""
echo "✅ SSL setup complete!"
echo ""
echo "🔄 To renew certificates (run monthly):"
echo "   sudo certbot renew"
echo "   ./deployment/scripts/setup-ssl.sh"

