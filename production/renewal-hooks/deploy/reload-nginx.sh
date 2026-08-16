#!/bin/bash
# Certbot deploy hook — runs ONLY when a certificate was actually renewed.
#
# nginx reads the cert once at startup and holds it in memory, so a renewed
# cert on disk changes nothing until nginx is told to re-read it. `nginx -s reload`
# is a graceful reload: in-flight requests finish on the old workers, new ones
# get the new cert. No dropped connections, no downtime.
#
# Installed to /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh by setup-ssl.sh.
# Anything in that directory runs after every successful renewal, for every cert.
set -euo pipefail

CONTAINER="attendance-nginx-prod"

log() { echo "[reload-nginx] $*"; }

if ! command -v docker >/dev/null 2>&1; then
    log "ERROR: docker not found; cannot reload nginx. Cert was renewed but is NOT being served."
    exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
    log "WARNING: container '$CONTAINER' is not running. Nothing to reload."
    log "The renewed cert will be picked up whenever the container next starts."
    exit 0
fi

# Validate before reloading: a reload with a broken config leaves the old
# workers running, but we want the failure to be loud rather than silent.
if ! docker exec "$CONTAINER" nginx -t 2>&1 | sed 's/^/[reload-nginx] nginx: /'; then
    log "ERROR: nginx config test failed. Refusing to reload."
    exit 1
fi

docker exec "$CONTAINER" nginx -s reload
log "OK: nginx reloaded, now serving the renewed certificate."
