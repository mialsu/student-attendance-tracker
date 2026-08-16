# SSL Certificate Setup Guide - Hetzner VM + Let's Encrypt

## Overview

This guide covers SSL certificate setup for the Student Attendance Tracker using **Let's Encrypt** (free, automated SSL) on a **Hetzner Cloud VM**.

**Why Let's Encrypt?**
- ✅ **FREE** - No cost, unlimited certificates
- ✅ **Automated** - Easy renewal with certbot
- ✅ **Trusted** - Recognized by all browsers
- ✅ **Quick** - Setup in 5-10 minutes
- ✅ **Secure** - Industry-standard encryption

---

## Prerequisites

### 1. Hetzner Cloud Server

You need a Hetzner Cloud server running. Recommended specs:

| Server Type | vCPU | RAM | Disk | Cost/Month | Suitable For |
|-------------|------|-----|------|------------|--------------|
| CX11 | 1 | 2 GB | 20 GB | €4.15 | Testing only |
| **CX21** | 2 | 4 GB | 40 GB | **€5.83** | **Small production** |
| CX31 | 2 | 8 GB | 80 GB | €10.52 | Medium production |

**Recommended**: Start with **CX21** - sufficient for most use cases.

### 2. Domain Name

You need a domain pointing to your Hetzner server.

**Where to buy:**
- **Namecheap** - ~$10-15/year - https://www.namecheap.com
- **Cloudflare Registrar** - ~$10/year - https://www.cloudflare.com/products/registrar/
- **Hetzner DNS** - If using Hetzner services
- **Porkbun** - ~$10/year - https://porkbun.com

### 3. Server Requirements

- **Ubuntu 22.04 LTS** (recommended)
- **Docker & Docker Compose** installed
- **Ports 80 and 443** open in firewall
- **Root or sudo access**

---

## Step-by-Step Setup

### Step 1: Setup Hetzner Cloud Server

#### 1.1 Create Server on Hetzner

1. Go to https://console.hetzner.cloud
2. Create new project (e.g., "attendance-tracker")
3. Add server:
   - **Location**: Choose closest to your users (Falkenstein, Nuremberg, Helsinki)
   - **Image**: Ubuntu 22.04
   - **Type**: CX21 (2 vCPU, 4 GB RAM)
   - **SSH Key**: Add your SSH key (or generate one)
   - **Name**: attendance-tracker-prod

4. Note your server's **IPv4 address** (e.g., `123.45.67.89`)

#### 1.2 Initial Server Setup

SSH into your server:
```bash
ssh root@YOUR_SERVER_IP
```

Update system and setup firewall:
```bash
# Update packages
apt update && apt upgrade -y

# Install essentials
apt install -y curl git ufw

# Setup firewall
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable

# Verify firewall
ufw status
```

#### 1.3 Install Docker

```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Install Docker Compose
apt install -y docker-compose-plugin

# Verify installation
docker --version
docker compose version
```

---

### Step 2: Configure DNS

Point your domain to your Hetzner server IP.

#### 2.1 Get Server IP

```bash
# On your Hetzner server
curl ifconfig.me
```

Note the IP address (e.g., `123.45.67.89`)

#### 2.2 Add DNS Records

Log into your domain registrar's DNS management panel and add:

**A Record for main domain:**
```
Type: A
Name: @ (or leave blank for root domain)
Value: YOUR_SERVER_IP (e.g., 123.45.67.89)
TTL: 3600 (or Auto)
```

**A Record for www subdomain:**
```
Type: A
Name: www
Value: YOUR_SERVER_IP
TTL: 3600 (or Auto)
```

**Example for subdomain:**
If you want `attendance.yourdomain.com`:
```
Type: A
Name: attendance
Value: YOUR_SERVER_IP
TTL: 3600
```

#### 2.3 Verify DNS Propagation

Wait 5-30 minutes, then check:

```bash
# Check DNS resolution
nslookup yourdomain.com

# Or use dig
dig +short yourdomain.com

# Should return your server IP
```

Test from multiple locations:
- https://dnschecker.org
- https://www.whatsmydns.net

**Tip**: DNS can take up to 48 hours, but usually propagates in 15-30 minutes.

---

### Step 3: Deploy Application

Clone and deploy your application on the server:

```bash
# Clone repository
cd /opt
git clone https://github.com/yourusername/student-attendance-tracker.git
cd student-attendance-tracker

# Make scripts executable
chmod +x deployment/scripts/*.sh
```

Configure production environment:

```bash
cd deployment/production
cp .env.example .env
nano .env
```

Edit `.env` with your values:

```bash
# Database
POSTGRES_USER=attendance_user
POSTGRES_PASSWORD=<STRONG_PASSWORD>  # Generate: openssl rand -base64 32
POSTGRES_DB=attendance_tracker

# Backend API
SECRET_KEY=<SECRET_KEY>  # Generate: openssl rand -hex 32
CORS_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# Domain for SSL (IMPORTANT!)
DOMAIN=yourdomain.com
EMAIL=your-email@example.com  # Let's Encrypt renewal reminders
```

**Generate secure values:**
```bash
# Generate database password
openssl rand -base64 32

# Generate secret key
openssl rand -hex 32
```

Update nginx configuration:

```bash
nano deployment/production/nginx.conf
```

Find line ~58 and change:
```nginx
server_name yourdomain.com www.yourdomain.com;
```

Save and deploy (without SSL first):

```bash
cd /root/student-attendance-tracker
./deployment/scripts/deploy-prod.sh
```

Verify application is running:
```bash
# Check services
docker ps

# Should see: db, backend, frontend, nginx containers running
```

---

### Step 4: Setup SSL with Let's Encrypt

Now run the automated SSL setup script:

```bash
cd /root/student-attendance-tracker/deployment/scripts
sudo ./setup-ssl.sh
```

The script is **idempotent** — safe to re-run any time, and it is also the repair
path if renewal ever breaks.

**What the script does:**
1. ✅ Installs certbot (if not present)
2. ✅ Prepares the ACME webroot at `/var/www/certbot`
3. ✅ Brings nginx up with the `/etc/letsencrypt` and webroot mounts
4. ✅ Proves the challenge path is publicly reachable *before* spending a real
   Let's Encrypt request (a failed test file is free; a failed real request
   burns rate limit)
5. ✅ Installs the deploy hook that reloads nginx after every future renewal
6. ✅ Requests the certificate via **webroot** — nginx never stops
7. ✅ Arms `certbot.timer` and reloads nginx onto the live certificate

**Expected output:**
```
🔐 Setting up SSL with Let's Encrypt (webroot + auto-renewal)
📍 Domain: attendance-api.kotoio.fi
📧 Email:  you@example.com
📁 Preparing ACME webroot at /var/www/certbot...
▶️  Bringing nginx up with the certbot mounts...
🧪 Verifying the ACME challenge path is publicly reachable...
   ✅ Challenge path reachable from the public internet.
🪝 Installing the nginx reload deploy-hook...
📜 Obtaining/renewing the certificate via webroot...
Successfully received certificate.
⏰ Ensuring the renewal timer is armed...
🔄 Reloading nginx onto the live certificate...
✅ SSL setup complete — renewal is now fully automatic.
```

---

### Step 5: Verify SSL Setup

#### Test HTTPS

```bash
# Should redirect to HTTPS
curl -I http://yourdomain.com

# Should return 200 OK
curl -I https://yourdomain.com

# Test SSL certificate
echo | openssl s_client -connect yourdomain.com:443 -servername yourdomain.com 2>/dev/null | openssl x509 -noout -dates
```

#### Browser Test

1. Open browser: `https://yourdomain.com`
2. Check for padlock icon 🔒 in address bar
3. Click padlock → Certificate → Should show "Let's Encrypt"

#### SSL Grade Test

Check your SSL configuration:
- https://www.ssllabs.com/ssltest/
- Should get **A or A+** grade

---

## Certificate Renewal

Let's Encrypt certificates are valid for **90 days**. Renewal here is fully
automatic — there is nothing to run on a schedule.

> ⚠️ **Do not add a cron job for renewal, and do not copy certificates into
> `deployment/production/ssl/`.** Earlier versions of this guide told you to do
> both. That advice caused an 80-day outage — see *History* below.

### How automatic renewal works

`certbot.timer` ships with the certbot package and runs twice a day, renewing
inside the last 30 days of validity. Two pieces make it actually work:

| Piece | Why it is required |
|---|---|
| **`--webroot`** (not `--standalone`) | `--standalone` makes certbot bind port 80 itself. The nginx container holds port 80 permanently, so standalone renewals fail forever. Webroot writes the challenge into `/var/www/certbot`, which nginx already serves. |
| **deploy hook** | nginx reads the certificate once at startup. `/etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh` issues a graceful `nginx -s reload` after each renewal. Registered as `renew_hook`, so it survives future renewals. |

nginx bind-mounts `/etc/letsencrypt` **read-only** and reads the live certificate
directly, so there are no copies that can go stale. The whole directory is
mounted, not just `live/`, so the symlinks into `archive/` resolve inside the
container.

### Verifying (do this any time)

```bash
# Compares the cert on disk against the cert actually served on the wire.
# Also checks certbot.timer is armed and the deploy hook is installed.
./deployment/scripts/check-ssl.sh

# Simulates a real unattended renewal without issuing anything
sudo certbot renew --dry-run

# What certbot holds on disk
sudo certbot certificates
```

### Monitoring

`./deployment/scripts/setup-ssl-monitoring.sh` installs local alerting — no
external services or accounts:

- **Login banner** — every SSH login prints certificate status, red when expiring,
  stale, or when the last renewal failed.
- **Daily check** — `ssl-cert-check.timer`; read it with `journalctl -t ssl-cert-check`.
- **Renewal failure** — an `OnFailure` drop-in on `certbot.service` logs CRITICAL
  and refreshes the banner immediately.

The daily check compares the certificate **on disk** against the one **on the
wire**. That drift — renewal succeeding while nginx keeps serving an old copy —
is invisible to `certbot certificates` alone.

### History — why this guide changed

The production certificate expired on **2026-05-28** and stayed expired for **80
days**. `certbot.timer` fired twice a day the whole time and failed every run:

1. Renewal was configured `--standalone`, which cannot bind port 80 while the
   nginx container owns it.
2. nginx served hand-made copies from `production/ssl/`, so even a successful
   renewal would never have reached users.
3. Nothing reloaded nginx, and nothing alerted — Let's Encrypt
   [discontinued expiration emails in June 2025](https://letsencrypt.org/2025/06/26/expiration-notification-service-has-ended),
   so the last external backstop was already gone.

---

## Troubleshooting

### Problem: "Failed to connect to port 80"

**Cause**: Port 80 is blocked or in use.

**Solution**:
```bash
# Check if port 80 is accessible
curl -I http://YOUR_SERVER_IP

# Check what's using port 80
sudo lsof -i :80

# Check firewall
sudo ufw status

# Ensure port 80 is allowed
sudo ufw allow 80/tcp
sudo ufw reload
```

### Problem: "DNS resolution failed"

**Cause**: Domain doesn't point to server yet.

**Solution**:
```bash
# Check DNS
nslookup yourdomain.com

# If it doesn't return your server IP, wait longer
# DNS can take up to 48 hours

# Check from external service
curl https://dns.google/resolve?name=yourdomain.com&type=A
```

### Problem: "Certificate validation failed"

**Cause**: Let's Encrypt can't verify domain ownership.

**Checklist**:
- [ ] Domain DNS points to server IP ✓
- [ ] Port 80 open in firewall ✓
- [ ] Nginx stopped during certificate request ✓
- [ ] No other web server running ✓

```bash
# Stop all web servers
docker stop attendance-nginx-prod

# Check if anything is on port 80
sudo lsof -i :80

# Kill if needed
sudo kill <PID>

# Try again
./deployment/scripts/setup-ssl.sh
```

### Problem: "Too many failed validation attempts"

**Cause**: Let's Encrypt rate limiting (5 failures per domain per hour).

**Solution**:
- Wait 1 hour
- Fix the underlying issue first
- Use `--dry-run` flag to test without hitting rate limits

```bash
# Simulate a renewal without issuing anything
sudo certbot renew --dry-run
```

### Problem: nginx fails to start after SSL setup

**Cause**: Certificate missing, or nginx cannot see `/etc/letsencrypt`.

**Solution**:
```bash
# Check the live certificate exists on the host
sudo ls -la /etc/letsencrypt/live/attendance-api.kotoio.fi/

# Should see symlinks: fullchain.pem, privkey.pem, cert.pem, chain.pem

# Confirm nginx can resolve them INSIDE the container. This must print a path
# under /etc/letsencrypt/archive/ — if it fails, the compose file is mounting
# only live/ instead of the whole /etc/letsencrypt directory.
docker exec attendance-nginx-prod \
  readlink -f /etc/letsencrypt/live/attendance-api.kotoio.fi/fullchain.pem

# Validate config and check logs
docker exec attendance-nginx-prod nginx -t
docker logs attendance-nginx-prod
```

### Problem: "Certificate has expired"

**Cause**: Automatic renewal has been failing silently. Find out *why* before
forcing anything.

**Solution**:
```bash
# 1. Why did the unattended renewal fail?
journalctl -u certbot.service -n 40

# 2. Re-run the setup script — it is the repair path and fixes the
#    authenticator, the mounts, and the deploy hook in one go
cd /root/student-attendance-tracker/deployment/scripts
sudo ./setup-ssl.sh

# 3. Confirm the automated path now works end to end
sudo certbot renew --dry-run
./check-ssl.sh
```

---

## Security Best Practices

### 1. Keep Certbot Updated

```bash
# Update certbot
sudo apt update
sudo apt upgrade certbot
```

### 2. Monitor Certificate Expiry

Setup monitoring:
```bash
# Install monitoring tool
pip3 install ssl-cert-check

# Add to crontab (alerts 30 days before expiry)
0 9 * * * ssl-cert-check -s yourdomain.com -p 443 -n 30
```

Or use external services:
- https://www.ssllabs.com/ssltest/ (monitoring available)
- https://crt.sh/?q=yourdomain.com (certificate transparency log)

### 3. HTTPS Redirect

Ensure HTTP always redirects to HTTPS (already configured in nginx.conf):
```nginx
# HTTP server (port 80)
server {
    listen 80;
    server_name _;

    location / {
        return 301 https://$host$request_uri;
    }
}
```

### 4. Security Headers

Already configured in nginx.conf:
- `Strict-Transport-Security` (HSTS)
- `X-Frame-Options`
- `X-Content-Type-Options`
- `X-XSS-Protection`

Test headers: https://securityheaders.com

---

## Cost Breakdown

### Total Monthly Cost

| Item | Provider | Cost |
|------|----------|------|
| Domain | Namecheap/Cloudflare | ~$0.83/month ($10/year) |
| Server (CX21) | Hetzner Cloud | €5.83/month |
| SSL Certificate | Let's Encrypt | **FREE** |
| **Total** | | **~€7/month** |

**That's less than the price of 2 coffees per month!** ☕☕

### Cost Savings vs Alternatives

| Option | Monthly Cost | Notes |
|--------|-------------|-------|
| Let's Encrypt (chosen) | FREE | Automated, 90-day renewal |
| DigiCert SSL | $200+/year | Paid certificate, no benefit |
| AWS Certificate Manager | FREE | Only for AWS infrastructure |
| Cloudflare SSL | FREE | Requires Cloudflare proxy |

---

## Additional Resources

### Documentation
- **Let's Encrypt**: https://letsencrypt.org
- **Certbot**: https://certbot.eff.org
- **Hetzner Cloud Docs**: https://docs.hetzner.com/cloud/

### Tools
- **SSL Test**: https://www.ssllabs.com/ssltest/
- **Certificate Search**: https://crt.sh
- **DNS Checker**: https://dnschecker.org
- **Security Headers Check**: https://securityheaders.com

### Support
- **Let's Encrypt Community**: https://community.letsencrypt.org
- **Hetzner Support**: https://docs.hetzner.com/general/general/community-tutorials/

---

## Quick Reference

### Essential Commands

```bash
# Check certificate status
sudo certbot certificates

# Test renewal
sudo certbot renew --dry-run

# Force renewal
sudo certbot renew --force-renewal

# Check certificate expiry
echo | openssl s_client -connect yourdomain.com:443 -servername yourdomain.com 2>/dev/null | openssl x509 -noout -dates

# View certificate details
echo | openssl s_client -connect yourdomain.com:443 -servername yourdomain.com 2>/dev/null | openssl x509 -noout -text

# Check nginx config
docker exec attendance-nginx-prod nginx -t

# Restart nginx
cd /root/student-attendance-tracker/deployment/production
docker-compose restart nginx

# View logs
docker logs attendance-nginx-prod
```

---

## Summary Checklist

Setup checklist:

- [ ] Hetzner server created (CX21 or higher)
- [ ] Ubuntu 22.04 installed
- [ ] Docker and Docker Compose installed
- [ ] Firewall configured (ports 22, 80, 443)
- [ ] Domain purchased
- [ ] DNS A records pointing to server IP
- [ ] DNS propagated (verified with nslookup)
- [ ] Application deployed and running
- [ ] `.env` configured with domain and email
- [ ] `nginx.conf` updated with domain name
- [ ] `./deployment/scripts/setup-ssl.sh` executed successfully
- [ ] HTTPS working in browser (🔒 padlock visible)
- [ ] HTTP redirects to HTTPS
- [ ] SSL grade A or A+ on ssllabs.com
- [ ] Automatic renewal configured (cron job)

---

**Last Updated**: 2025-11-03
**Maintained by**: Development Team
**Tested on**: Ubuntu 22.04 LTS, Hetzner Cloud CX21

