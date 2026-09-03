#!/bin/bash
# Set up (or repair) Let's Encrypt SSL with fully automatic renewal.
#
# Run this ON THE SERVER, from deployment/scripts/. It is idempotent — safe to
# re-run at any time, and it is also the repair path if renewal ever breaks.
#
# Why webroot and not standalone:
#   `--standalone` makes certbot bind port 80 itself, which is impossible here
#   because the nginx container holds port 80 permanently. That mismatch is what
#   silently failed every renewal for months. `--webroot` drops the challenge file
#   into a directory nginx already serves, so nginx never has to stop.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROD_DIR="$(cd "${SCRIPT_DIR}/../production" && pwd)"
WEBROOT="/var/www/certbot"
CONTAINER="attendance-nginx-prod"

echo "🔐 Setting up SSL with Let's Encrypt (webroot + auto-renewal)"
echo ""

# ---------------------------------------------------------------- preflight --
if [ ! -f "${PROD_DIR}/.env" ]; then
    echo "❌ Error: ${PROD_DIR}/.env not found!"
    exit 1
fi
# shellcheck disable=SC1091
source "${PROD_DIR}/.env"

if [ -z "${DOMAIN:-}" ] || [ -z "${EMAIL:-}" ]; then
    echo "❌ Error: DOMAIN and EMAIL must be set in production/.env"
    exit 1
fi

if [ "$(id -u)" -ne 0 ]; then
    echo "❌ Error: run this as root (it writes to /etc/letsencrypt)."
    exit 1
fi

echo "📍 Domain: ${DOMAIN}"
echo "📧 Email:  ${EMAIL}"
echo ""

# Compose v2 (`docker compose`) with a fallback to v1 (`docker-compose`).
if docker compose version >/dev/null 2>&1; then
    DC="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
    DC="docker-compose"
else
    echo "❌ Error: neither 'docker compose' nor 'docker-compose' found."
    exit 1
fi

if ! command -v certbot >/dev/null 2>&1; then
    echo "📦 Installing certbot..."
    apt-get update -qq
    apt-get install -y certbot
fi

# ------------------------------------------------------------ acme webroot --
echo "📁 Preparing ACME webroot at ${WEBROOT}..."
mkdir -p "${WEBROOT}/.well-known/acme-challenge"
# nginx workers run as an unprivileged user inside the container and must be
# able to read the challenge file; certbot (root) writes it.
chmod -R 755 /var/www/certbot

# --------------------------------------------------- bootstrap certificate --
# nginx cannot start its HTTPS block without *some* cert file. On a fresh server
# there is none, so drop in a temporary self-signed one just to get nginx up;
# the real cert overwrites it moments later.
LIVE_DIR="/etc/letsencrypt/live/${DOMAIN}"
if [ ! -f "${LIVE_DIR}/fullchain.pem" ]; then
    echo "🥾 No certificate yet — generating a temporary self-signed cert so nginx can boot..."
    mkdir -p "${LIVE_DIR}"
    openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
        -keyout "${LIVE_DIR}/privkey.pem" \
        -out "${LIVE_DIR}/fullchain.pem" \
        -subj "/CN=${DOMAIN}" 2>/dev/null
    BOOTSTRAP=1
else
    BOOTSTRAP=0
fi

# ------------------------------------------------------- nginx with mounts --
echo "▶️  Bringing nginx up with the certbot mounts..."
cd "${PROD_DIR}"
$DC up -d nginx

echo "⏳ Waiting for nginx to accept connections..."
for _ in $(seq 1 30); do
    if curl -fsS -o /dev/null "http://localhost/.well-known/acme-challenge/" 2>/dev/null \
       || curl -fsS -o /dev/null -w '%{http_code}' "http://localhost/" 2>/dev/null | grep -qE '.'; then
        break
    fi
    sleep 1
done

# Prove the challenge path is actually reachable BEFORE asking Let's Encrypt to
# use it. A failed real request burns rate limit; a failed test file costs nothing.
echo "🧪 Verifying the ACME challenge path is publicly reachable..."
TOKEN="setup-test-$$"
echo "ok-${TOKEN}" > "${WEBROOT}/.well-known/acme-challenge/${TOKEN}"
if curl -fsS --max-time 15 "http://${DOMAIN}/.well-known/acme-challenge/${TOKEN}" 2>/dev/null | grep -q "ok-${TOKEN}"; then
    echo "   ✅ Challenge path reachable from the public internet."
    rm -f "${WEBROOT}/.well-known/acme-challenge/${TOKEN}"
else
    rm -f "${WEBROOT}/.well-known/acme-challenge/${TOKEN}"
    echo "   ❌ Could not fetch the test file over HTTP."
    echo "      Check: DNS for ${DOMAIN} points here, port 80 open in UFW + Hetzner firewall,"
    echo "      and that nginx.conf serves /.well-known/acme-challenge/ from ${WEBROOT}."
    exit 1
fi

# -------------------------------------------------------------- deploy hook --
# Certbot runs everything in renewal-hooks/deploy/ after a successful renewal.
# Without this, a renewed cert sits on disk while nginx keeps serving the old one.
echo "🪝 Installing the nginx reload deploy-hook..."
mkdir -p /etc/letsencrypt/renewal-hooks/deploy
install -m 0755 "${PROD_DIR}/renewal-hooks/deploy/reload-nginx.sh" \
    /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh

# ------------------------------------------------------- obtain certificate --
echo "📜 Obtaining/renewing the certificate via webroot..."
if [ "$BOOTSTRAP" -eq 1 ]; then
    # Remove the self-signed placeholder so certbot builds a clean lineage.
    rm -rf "${LIVE_DIR}"
fi

certbot certonly \
    --webroot -w "${WEBROOT}" \
    -d "${DOMAIN}" \
    --email "${EMAIL}" \
    --agree-tos \
    --non-interactive \
    --keep-until-expiring \
    --deploy-hook /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh

# ------------------------------------------------------------- auto-renewal --
echo "⏰ Ensuring the renewal timer is armed..."
systemctl enable --now certbot.timer
systemctl restart certbot.timer

# ------------------------------------------------------------------ reload --
echo "🔄 Reloading nginx onto the live certificate..."
docker exec "${CONTAINER}" nginx -t
docker exec "${CONTAINER}" nginx -s reload

echo ""
echo "✅ SSL setup complete — renewal is now fully automatic."
echo ""
"${SCRIPT_DIR}/check-ssl.sh" || true
