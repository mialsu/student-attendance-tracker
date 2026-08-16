# Firewall Configuration Guide - Hetzner VM

## Overview

This guide covers firewall configuration for securing your Student Attendance Tracker application on a Hetzner Cloud VM using **UFW (Uncomplicated Firewall)** - Ubuntu's default firewall.

**Why Configure a Firewall?**
- ✅ **Block unauthorized access** to your server
- ✅ **Only allow necessary ports** (SSH, HTTP, HTTPS)
- ✅ **Prevent brute-force attacks**
- ✅ **Protect database** from external access
- ✅ **Industry best practice**

---

## Firewall Strategy

### Ports Overview

| Port | Service | Access | Why |
|------|---------|--------|-----|
| **22** | SSH | Public | Server management (secure with key-only auth) |
| **80** | HTTP | Public | Web traffic (redirects to HTTPS) |
| **443** | HTTPS | Public | Secure web traffic (your application) |
| **5432** | PostgreSQL | **Blocked** | Database only accessible from localhost |
| **8000** | Backend API | **Blocked** | Only accessible via Nginx proxy |

**Security principle**: Only expose what's absolutely necessary. Database and backend should never be directly accessible from the internet.

---

## Initial Setup with UFW

### Step 1: Check UFW Status

SSH into your Hetzner server:

```bash
ssh root@YOUR_SERVER_IP
```

Check if UFW is installed (should be on Ubuntu 22.04):

```bash
# Check if UFW is installed
which ufw

# Check current status (should be inactive initially)
sudo ufw status
```

If not installed:
```bash
sudo apt update
sudo apt install -y ufw
```

### Step 2: Configure Default Policies

Set default policies (deny all incoming, allow all outgoing):

```bash
# Deny all incoming traffic by default
sudo ufw default deny incoming

# Allow all outgoing traffic by default
sudo ufw default allow outgoing
```

This ensures that only explicitly allowed services can receive connections.

### Step 3: Allow SSH (Critical - Do This First!)

⚠️ **IMPORTANT**: Always allow SSH BEFORE enabling the firewall, or you'll lock yourself out!

```bash
# Allow SSH (port 22)
sudo ufw allow 22/tcp
# or
sudo ufw allow OpenSSH
```

**Verify the rule was added**:
```bash
sudo ufw show added
```

Should show:
```
Added user rules (see 'ufw status' for running firewall):
ufw allow 22/tcp
```

### Step 4: Allow HTTP and HTTPS

```bash
# Allow HTTP (port 80) - for Let's Encrypt and redirect to HTTPS
sudo ufw allow 80/tcp

# Allow HTTPS (port 443) - for your application
sudo ufw allow 443/tcp
```

### Step 5: Enable UFW

Now enable the firewall:

```bash
sudo ufw enable
```

You'll see a warning:
```
Command may disrupt existing ssh connections. Proceed with operation (y|n)?
```

Type `y` and press Enter. (Don't worry, we already allowed SSH)

### Step 6: Verify Configuration

```bash
# Check status (should show active)
sudo ufw status

# Detailed view
sudo ufw status verbose

# Numbered list (useful for deleting rules)
sudo ufw status numbered
```

**Expected output**:
```
Status: active

To                         Action      From
--                         ------      ----
22/tcp                     ALLOW       Anywhere
80/tcp                     ALLOW       Anywhere
443/tcp                    ALLOW       Anywhere
22/tcp (v6)                ALLOW       Anywhere (v6)
80/tcp (v6)                ALLOW       Anywhere (v6)
443/tcp (v6)                ALLOW       Anywhere (v6)
```

✅ **Done!** Your firewall is now configured.

---

## Advanced Configuration

### Limit SSH Connections (Prevent Brute Force)

Instead of just allowing SSH, use `limit` to rate-limit connections:

```bash
# Remove existing SSH rule
sudo ufw delete allow 22/tcp

# Add rate-limited rule (max 6 connections per 30 seconds)
sudo ufw limit 22/tcp
```

This helps prevent brute-force SSH attacks.

**Better output**:
```
To                         Action      From
--                         ------      ----
22/tcp                     LIMIT       Anywhere
```

### Allow SSH from Specific IP Only (Most Secure)

If you have a static IP at home/office:

```bash
# Remove existing SSH rule
sudo ufw delete allow 22/tcp

# Allow SSH only from your IP
sudo ufw allow from YOUR_HOME_IP to any port 22 proto tcp
```

Example:
```bash
sudo ufw allow from 203.0.113.10 to any port 22 proto tcp
```

⚠️ **Warning**: Only do this if you have a static IP, or you might lock yourself out!

### Allow SSH from Multiple IPs

```bash
# Allow from office IP
sudo ufw allow from 203.0.113.10 to any port 22 proto tcp

# Allow from home IP
sudo ufw allow from 198.51.100.20 to any port 22 proto tcp

# Allow from VPN IP range
sudo ufw allow from 192.168.1.0/24 to any port 22 proto tcp
```

### Block Specific IP Address

If you detect suspicious activity:

```bash
# Block specific IP
sudo ufw deny from 123.45.67.89

# Block IP range
sudo ufw deny from 123.45.67.0/24
```

### Allow Ping (ICMP)

By default, UFW allows ping responses. To explicitly configure:

```bash
# Allow ping (useful for monitoring)
sudo ufw allow proto icmp
```

---

## Hetzner Cloud Firewall (Additional Layer)

Hetzner Cloud also provides a **Cloud Firewall** that works at the network level (before traffic reaches your VM). This is an additional security layer.

### Why Use Both?

| Feature | UFW (on VM) | Hetzner Cloud Firewall |
|---------|-------------|------------------------|
| Blocks traffic | At OS level | At network level (before VM) |
| DDoS protection | Limited | Better (network-level) |
| Manage multiple VMs | Per-VM | Centralized |
| Cost | Free | Free |
| Recommendation | ✅ Always use | ✅ Optional but recommended |

### Setup Hetzner Cloud Firewall

1. Go to **Hetzner Cloud Console**: https://console.hetzner.cloud
2. Navigate to **Firewalls** (left sidebar)
3. Click **Create Firewall**

**Inbound Rules** (same as UFW):
```
Protocol: TCP, Port: 22, Source: 0.0.0.0/0 (or your IP)
Protocol: TCP, Port: 80, Source: 0.0.0.0/0
Protocol: TCP, Port: 443, Source: 0.0.0.0/0
```

**Outbound Rules** (allow all):
```
Protocol: Any, Port: Any, Destination: 0.0.0.0/0
```

4. **Apply to Resources** → Select your VM
5. Click **Create Firewall**

✅ Now you have **two layers of protection**!

---

## Docker and Firewall

### Important: Docker and UFW

⚠️ **Docker bypasses UFW by default!** Docker manipulates iptables directly, which can expose services even if UFW blocks them.

**The Solution**: Our docker-compose configuration already handles this by:

1. **Not exposing database port** externally:
   ```yaml
   # In production docker-compose.yml
   db:
     ports:
       - "127.0.0.1:5432:5432"  # Only accessible from localhost
   ```

2. **Not exposing backend port** externally:
   ```yaml
   backend:
     # No ports section - only accessible within Docker network
   ```

3. **Only nginx exposed** (ports 80 and 443):
   ```yaml
   nginx:
     ports:
       - "80:80"
       - "443:443"
   ```

### Verify Docker Port Bindings

After deploying, check what's exposed:

```bash
# Check Docker port mappings
docker ps --format "table {{.Names}}\t{{.Ports}}"
```

**Expected output**:
```
NAMES                          PORTS
attendance-nginx-prod          0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp
attendance-frontend-prod       (none)
attendance-backend-prod        (none)
attendance-db-prod             127.0.0.1:5432->5432/tcp
```

✅ Only nginx should have `0.0.0.0` (public access)
✅ Database should show `127.0.0.1` (localhost only)
✅ Backend and frontend should show no external ports

---

## Testing Your Firewall

### Test Open Ports from Outside

From your **local machine** (not the server):

```bash
# Test SSH (should connect)
ssh root@YOUR_SERVER_IP

# Test HTTP (should connect)
curl -I http://YOUR_SERVER_IP

# Test HTTPS (should connect after SSL setup)
curl -I https://YOUR_SERVER_IP

# Test PostgreSQL (should fail - connection refused)
nc -zv YOUR_SERVER_IP 5432

# Test backend directly (should fail)
curl http://YOUR_SERVER_IP:8000
```

### Use Online Port Scanner

- **Pentest-Tools**: https://pentest-tools.com/network-vulnerability-scanning/tcp-port-scanner-online-nmap
- **YouGetSignal**: https://www.yougetsignal.com/tools/open-ports/

Scan your server IP - only ports 22, 80, and 443 should be open.

### Test from Server (localhost)

SSH into server and test internal access:

```bash
# PostgreSQL should work from localhost
psql -h localhost -U attendance_user -d attendance_tracker

# Backend API should work from localhost
curl http://localhost:8000/health

# Frontend should work from localhost
curl http://localhost/ # If running locally
```

---

## Monitoring and Logging

### View UFW Logs

Enable logging:

```bash
# Enable logging
sudo ufw logging on

# Set log level (low, medium, high, full)
sudo ufw logging medium
```

View logs:

```bash
# View recent UFW logs
sudo tail -f /var/log/ufw.log

# Search for blocked connections
sudo grep 'UFW BLOCK' /var/log/ufw.log

# Count blocked IPs
sudo grep 'UFW BLOCK' /var/log/ufw.log | awk '{print $12}' | sort | uniq -c | sort -nr
```

### Check Failed SSH Attempts

```bash
# View failed SSH login attempts
sudo grep "Failed password" /var/log/auth.log

# Count attempts by IP
sudo grep "Failed password" /var/log/auth.log | awk '{print $(NF-3)}' | sort | uniq -c | sort -nr
```

### Setup Fail2Ban (Advanced)

Install Fail2Ban to automatically block IPs after multiple failed attempts:

```bash
# Install Fail2Ban
sudo apt install -y fail2ban

# Copy default config
sudo cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local

# Edit config
sudo nano /etc/fail2ban/jail.local
```

Configure SSH protection:
```ini
[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
bantime = 3600
findtime = 600
```

Start Fail2Ban:
```bash
sudo systemctl enable fail2ban
sudo systemctl start fail2ban

# Check status
sudo fail2ban-client status
sudo fail2ban-client status sshd
```

---

## Common UFW Commands

### View Rules

```bash
# Basic status
sudo ufw status

# Detailed status
sudo ufw status verbose

# Numbered list (for deletion)
sudo ufw status numbered
```

### Add Rules

```bash
# Allow port
sudo ufw allow 8080/tcp

# Allow service by name
sudo ufw allow http
sudo ufw allow https
sudo ufw allow ssh

# Allow from specific IP
sudo ufw allow from 203.0.113.10

# Allow from IP to specific port
sudo ufw allow from 203.0.113.10 to any port 22

# Rate limit port (anti-brute-force)
sudo ufw limit 22/tcp
```

### Delete Rules

```bash
# Method 1: By number
sudo ufw status numbered
sudo ufw delete 3

# Method 2: By rule specification
sudo ufw delete allow 8080/tcp

# Method 3: By service name
sudo ufw delete allow http
```

### Reset Firewall

⚠️ **Danger**: This removes all rules!

```bash
# Reset to default (all rules deleted)
sudo ufw reset

# Disable firewall
sudo ufw disable
```

---

## Security Checklist

Production server security checklist:

### Firewall
- [ ] UFW enabled and active
- [ ] SSH allowed (port 22)
- [ ] HTTP allowed (port 80)
- [ ] HTTPS allowed (port 443)
- [ ] All other ports blocked by default
- [ ] SSH rate-limited with `ufw limit`
- [ ] Database (5432) NOT exposed to internet
- [ ] Backend API (8000) NOT exposed to internet

### SSH Security
- [ ] SSH key-only authentication (no passwords)
- [ ] Root login disabled (optional but recommended)
- [ ] Fail2Ban installed and configured
- [ ] SSH on non-standard port (optional)

### Docker Security
- [ ] Database bound to 127.0.0.1 only
- [ ] Backend not exposed externally
- [ ] Only nginx publicly accessible
- [ ] Docker socket not exposed

### Monitoring
- [ ] UFW logging enabled
- [ ] Regular log review scheduled
- [ ] Fail2Ban monitoring SSH
- [ ] External port scan performed

### Hetzner Cloud (Optional)
- [ ] Cloud Firewall configured
- [ ] Backup schedule configured
- [ ] Snapshot policy set

---

## Troubleshooting

### Problem: Locked Out of Server (Can't SSH)

**Prevention**: Always test SSH in a separate terminal before logging out!

**Solution if locked out**:
1. Go to Hetzner Cloud Console
2. Select your server
3. Click **Console** (opens VNC console in browser)
4. Login as root
5. Fix firewall:
   ```bash
   sudo ufw allow 22/tcp
   sudo ufw enable
   ```

### Problem: Website Not Accessible After Enabling Firewall

**Cause**: Forgot to allow HTTP/HTTPS

**Solution**:
```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw reload
```

### Problem: Can't Access Database from Localhost

**Cause**: PostgreSQL not listening on correct interface

**Solution**: Check Docker compose configuration
```bash
# Verify database is bound to localhost
docker ps | grep postgres
# Should show: 127.0.0.1:5432->5432/tcp

# If not, update docker-compose.yml
```

### Problem: UFW Rules Not Working

**Cause**: Docker bypassing UFW

**Solution**: Ensure proper Docker port binding
```yaml
# In docker-compose.yml - bind to localhost only
ports:
  - "127.0.0.1:5432:5432"  # Good
  # NOT: "5432:5432"        # Bad - exposes to 0.0.0.0
```

### Problem: Too Many SSH Failed Attempts

**Cause**: Bot/brute-force attacks (normal for internet-facing servers)

**Solution**: Install Fail2Ban (see above) or:
```bash
# Rate limit SSH
sudo ufw delete allow 22/tcp
sudo ufw limit 22/tcp
```

---

## Quick Reference

### Essential Commands

```bash
# Enable firewall
sudo ufw enable

# Disable firewall (temporary troubleshooting)
sudo ufw disable

# Check status
sudo ufw status verbose

# Allow SSH, HTTP, HTTPS
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Rate limit SSH (recommended)
sudo ufw limit 22/tcp

# Block specific IP
sudo ufw deny from 123.45.67.89

# View logs
sudo tail -f /var/log/ufw.log

# Reload rules
sudo ufw reload

# Reset firewall (removes all rules)
sudo ufw reset
```

---

## Production Deployment Integration

Your deployment process should include firewall verification:

```bash
# After initial server setup
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw limit 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable

# Deploy application
cd /opt/student-attendance-tracker
./deployment/scripts/deploy-prod.sh

# Verify only nginx is exposed
docker ps --format "table {{.Names}}\t{{.Ports}}"

# Test ports from outside
# (from your local machine)
nmap -p 22,80,443,5432,8000 YOUR_SERVER_IP
```

Expected nmap results:
```
PORT     STATE
22/tcp   open     ssh
80/tcp   open     http
443/tcp  open     https
5432/tcp filtered postgresql  # or closed
8000/tcp filtered http-alt    # or closed
```

✅ Only 22, 80, and 443 should be "open"
✅ Database and backend should be "filtered" or "closed"

---

## Resources

### Documentation
- **UFW Man Page**: `man ufw`
- **Ubuntu UFW Guide**: https://help.ubuntu.com/community/UFW
- **Digital Ocean UFW Tutorial**: https://www.digitalocean.com/community/tutorials/ufw-essentials-common-firewall-rules-and-commands

### Tools
- **Port Scanner**: https://www.yougetsignal.com/tools/open-ports/
- **Security Scanner**: https://pentest-tools.com/
- **Nmap**: https://nmap.org/

### Related Guides
- `SSL_SETUP.md` - SSL certificate configuration
- `deployment/README.md` - Full deployment guide
- `ARCHITECTURE.md` - System architecture

---

**Last Updated**: 2025-11-03
**Maintained by**: Development Team
**Tested on**: Ubuntu 22.04 LTS, Hetzner Cloud CX21

