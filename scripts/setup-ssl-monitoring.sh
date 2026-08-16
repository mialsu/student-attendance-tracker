#!/bin/bash
# Install local SSL monitoring: a daily health check, a login banner, and an
# OnFailure hook on certbot so a failed renewal cannot pass unnoticed.
#
# No external services, no accounts, no outbound mail. The signal surfaces in
# three places: the MOTD on every SSH login, the systemd journal, and the
# check-ssl.sh script you can run by hand.
#
# Run as root on the server. Idempotent.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MON_DIR="$(cd "${SCRIPT_DIR}/../production/monitoring" && pwd)"

if [ "$(id -u)" -ne 0 ]; then
    echo "❌ Error: run this as root."
    exit 1
fi

echo "📡 Installing local SSL monitoring..."

# --- the check itself ---
install -m 0755 "${MON_DIR}/ssl-cert-check.sh" /usr/local/bin/ssl-cert-check.sh
mkdir -p /var/lib/ssl-cert-check

# --- daily timer ---
install -m 0644 "${MON_DIR}/ssl-cert-check.service" /etc/systemd/system/ssl-cert-check.service
install -m 0644 "${MON_DIR}/ssl-cert-check.timer"   /etc/systemd/system/ssl-cert-check.timer
install -m 0644 "${MON_DIR}/certbot-failure-notify.service" \
    /etc/systemd/system/certbot-failure-notify.service

# --- hook certbot's failure path ---
# A drop-in rather than editing certbot.service, so a certbot package upgrade
# cannot silently discard it.
mkdir -p /etc/systemd/system/certbot.service.d
cat > /etc/systemd/system/certbot.service.d/10-onfailure.conf <<'CONF'
[Unit]
OnFailure=certbot-failure-notify.service
CONF

# --- login banner ---
install -m 0755 "${MON_DIR}/99-ssl-cert-status" /etc/update-motd.d/99-ssl-cert-status

systemctl daemon-reload
systemctl enable --now ssl-cert-check.timer

echo "🧪 Running the first check now..."
/usr/local/bin/ssl-cert-check.sh || true

echo ""
echo "✅ Monitoring installed."
echo "   • Login banner:  every SSH login shows cert status"
echo "   • Daily check:   ssl-cert-check.timer"
echo "   • Renewal fails: certbot.service OnFailure → journal + banner"
echo ""
echo "   Inspect: systemctl list-timers ssl-cert-check.timer"
echo "            journalctl -t ssl-cert-check -n 20"
