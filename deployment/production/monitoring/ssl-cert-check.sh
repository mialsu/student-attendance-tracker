#!/bin/bash
# Daily SSL certificate check. Writes a cached status file that the MOTD banner
# reads on login, and logs loudly to the journal.
#
# The network call lives HERE, in a timer — never in the MOTD script, because
# that would add seconds of latency to every SSH login.
#
# Installed to /usr/local/bin/ssl-cert-check.sh, run by ssl-cert-check.timer.
set -uo pipefail

DOMAIN="${DOMAIN:-attendance-api.kotoio.fi}"
STATE_DIR="/var/lib/ssl-cert-check"
STATE_FILE="${STATE_DIR}/status"
WARN_DAYS=21
CRIT_DAYS=7

mkdir -p "$STATE_DIR"

LIVE_CERT="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"

status="OK"
message=""
days=""

# --- What is actually served on the wire (the only thing users experience) ---
served=$(echo | timeout 15 openssl s_client -connect "${DOMAIN}:443" \
    -servername "${DOMAIN}" 2>/dev/null | openssl x509 -noout -enddate -serial 2>/dev/null)

if [ -z "$served" ]; then
    status="CRIT"
    message="Cannot reach ${DOMAIN}:443 to read its certificate."
else
    wire_end=$(echo "$served" | grep notAfter | cut -d= -f2)
    wire_serial=$(echo "$served" | grep serial | cut -d= -f2)
    days=$(( ( $(date -d "$wire_end" +%s) - $(date +%s) ) / 86400 ))

    if [ "$days" -lt 0 ]; then
        status="CRIT"
        message="Certificate EXPIRED $(( -days )) days ago."
    elif [ "$days" -lt "$CRIT_DAYS" ]; then
        status="CRIT"
        message="Certificate expires in ${days} days and has not renewed."
    elif [ "$days" -lt "$WARN_DAYS" ]; then
        status="WARN"
        message="Certificate expires in ${days} days."
    else
        message="Certificate valid for ${days} days."
    fi

    # Disk-vs-wire drift means renewal works but the nginx reload does not.
    if [ -r "$LIVE_CERT" ]; then
        disk_serial=$(openssl x509 -in "$LIVE_CERT" -noout -serial 2>/dev/null | cut -d= -f2)
        if [ -n "$disk_serial" ] && [ "$disk_serial" != "$wire_serial" ]; then
            status="CRIT"
            message="nginx is serving a STALE certificate (disk and wire differ). Reload nginx."
        fi
    fi
fi

# --- The renewal timer must actually be armed ---
if ! systemctl is-active --quiet certbot.timer; then
    status="CRIT"
    message="${message} certbot.timer is NOT active — nothing will renew this cert."
fi

# --- A host nginx package steals port 80 on boot ---
# Latent by nature: the site keeps working until the next reboot, at which point
# the host service wins the race and the container cannot bind. Surface it now.
if systemctl is-enabled --quiet nginx 2>/dev/null; then
    status="CRIT"
    message="${message} HOST nginx service is enabled — it will break the container on next reboot. Fix: systemctl disable --now nginx"
fi

# Values are quoted: MESSAGE contains spaces, and an unquoted assignment would
# be truncated at the first word by anything reading this file.
{
    echo "STATUS=\"${status}\""
    echo "DAYS=\"${days}\""
    echo "MESSAGE=\"${message}\""
    echo "CHECKED=\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\""
} > "$STATE_FILE"

case "$status" in
    OK)   logger -t ssl-cert-check -p daemon.info    "OK: ${message}" ;;
    WARN) logger -t ssl-cert-check -p daemon.warning "WARNING: ${message}" ;;
    CRIT) logger -t ssl-cert-check -p daemon.err     "CRITICAL: ${message}" ;;
esac

echo "[ssl-cert-check] ${status}: ${message}"
[ "$status" = "OK" ] && exit 0
[ "$status" = "WARN" ] && exit 1
exit 2
