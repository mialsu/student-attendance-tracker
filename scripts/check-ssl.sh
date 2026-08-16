#!/bin/bash
# Check SSL certificate health — both what certbot has on disk and what nginx
# is actually serving on the wire. Those two drifting apart is exactly the
# failure that took this site down for 80 days in 2026.
#
# Exit codes: 0 = healthy, 1 = warning (<21 days), 2 = critical (expired/mismatch)
set -uo pipefail

DOMAIN="${DOMAIN:-attendance-api.kotoio.fi}"
WARN_DAYS="${WARN_DAYS:-21}"
LIVE_CERT="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"

status=0

echo "🔐 SSL health check for ${DOMAIN}"
echo ""

# --- What certbot has on disk (only meaningful when run on the server) ---
if [ -r "$LIVE_CERT" ]; then
    disk_end=$(openssl x509 -in "$LIVE_CERT" -noout -enddate | cut -d= -f2)
    disk_epoch=$(date -d "$disk_end" +%s)
    now_epoch=$(date +%s)
    disk_days=$(( (disk_epoch - now_epoch) / 86400 ))
    disk_serial=$(openssl x509 -in "$LIVE_CERT" -noout -serial | cut -d= -f2)
    echo "  on disk (certbot):  expires ${disk_end} → ${disk_days} days"
else
    echo "  on disk (certbot):  not readable here (run on the server for this check)"
    disk_days=""
    disk_serial=""
fi

# --- What nginx is actually serving ---
served=$(echo | timeout 15 openssl s_client -connect "${DOMAIN}:443" \
    -servername "${DOMAIN}" 2>/dev/null | openssl x509 -noout -enddate -serial 2>/dev/null)

if [ -z "$served" ]; then
    echo "  on the wire:        ❌ could not retrieve certificate from ${DOMAIN}:443"
    exit 2
fi

wire_end=$(echo "$served" | grep notAfter | cut -d= -f2)
wire_serial=$(echo "$served" | grep serial | cut -d= -f2)
wire_epoch=$(date -d "$wire_end" +%s)
now_epoch=$(date +%s)
wire_days=$(( (wire_epoch - now_epoch) / 86400 ))

echo "  on the wire (nginx): expires ${wire_end} → ${wire_days} days"
echo ""

# --- Verdicts ---
if [ "$wire_days" -lt 0 ]; then
    echo "  ❌ CRITICAL: the served certificate EXPIRED $(( -wire_days )) days ago."
    status=2
elif [ "$wire_days" -lt "$WARN_DAYS" ]; then
    echo "  ⚠️  WARNING: the served certificate expires in ${wire_days} days."
    status=1
else
    echo "  ✅ Served certificate is valid for ${wire_days} more days."
fi

# Drift between disk and wire means renewal is working but the reload is not.
if [ -n "$disk_serial" ] && [ "$disk_serial" != "$wire_serial" ]; then
    echo "  ❌ CRITICAL: disk and wire serials differ — nginx is serving a STALE cert."
    echo "     disk=${disk_serial} wire=${wire_serial}"
    echo "     Fix: docker exec attendance-nginx-prod nginx -s reload"
    status=2
fi

# Renewal timer must actually be armed.
if command -v systemctl >/dev/null 2>&1 && [ -d /etc/letsencrypt ]; then
    echo ""
    if systemctl is-active --quiet certbot.timer; then
        next=$(systemctl show certbot.timer -p NextElapseUSecRealtime --value 2>/dev/null)
        echo "  ✅ certbot.timer active (next run: ${next:-unknown})"
    else
        echo "  ❌ CRITICAL: certbot.timer is NOT active — nothing will renew this cert."
        status=2
    fi
    if [ -x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh ]; then
        echo "  ✅ nginx reload deploy-hook installed"
    else
        echo "  ⚠️  WARNING: deploy hook missing — renewals will not reach nginx."
        [ "$status" -lt 1 ] && status=1
    fi
fi

exit $status
