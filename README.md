# Deployment Documentation

This directory contains all deployment configurations for the Student Attendance Tracker application.

## Production Deployment Status ✅

The application is currently deployed to production:

- **Frontend**: https://app-attendance.kotoio.fi (Vercel)
- **Backend API**: https://attendance-api.kotoio.fi (Hetzner)
- **Domain**: kotoio.fi (configured at hostingpalvelu.fi)
- **SSL**: Let's Encrypt certificates (auto-renewing)
- **Status**: Fully operational

## Deployment Architecture

The application uses a **split deployment** architecture:

- **Frontend**: Deployed to **Vercel** (free Hobby tier)
  - Automated CI/CD from GitHub
  - Global CDN for fast loading
  - Custom domain with CNAME record
  - See [VERCEL_DEPLOYMENT.md](VERCEL_DEPLOYMENT.md) for setup guide

- **Backend + Database**: Deployed to **Hetzner Cloud VM** (€3.49/month)
  - Docker Compose orchestration
  - Nginx as API gateway with HTTPS
  - PostgreSQL 17 database
  - Supports hosting multiple backends on same VM (cost-efficient)

## Directory Structure

```
deployment/
├── local/                      # Local development environment
│   ├── docker-compose.yml      # Local Docker Compose configuration
│   └── .env.example            # Local environment variables template
├── production/                 # Production deployment
│   ├── docker-compose.yml      # Production Docker Compose configuration
│   ├── nginx.conf              # Nginx reverse proxy configuration
│   ├── .env.example            # Production environment variables template
├── scripts/                    # Deployment scripts
│   ├── start-local.sh          # Start local development
│   ├── stop-local.sh           # Stop local development
│   ├── deploy-prod.sh          # Deploy to production
│   ├── setup-ssl.sh            # Setup Let's Encrypt SSL
│   ├── backup-db.sh            # Backup database
│   ├── restore-db.sh           # Restore database from backup
│   └── logs.sh                 # View container logs
└── README.md                   # This file
```

## Local Development

### Quick Start

```bash
# Make scripts executable (first time only)
chmod +x deployment/scripts/*.sh

# Start local environment
./deployment/scripts/start-local.sh

# View logs
./deployment/scripts/logs.sh local

# View specific service logs
./deployment/scripts/logs.sh local backend

# Stop environment
./deployment/scripts/stop-local.sh
```

### Services

- **Frontend**: http://localhost:5173 (run `npm run dev` in client-app/)
- **Backend API**: http://localhost:8000
- **API Documentation**: http://localhost:8000/docs
- **Database**: localhost:5432

**Note**: For local development, the frontend runs via `npm run dev` and connects to the local backend at `http://localhost:8000`.

### Manual Commands

```bash
cd deployment/local

# Start services
docker-compose up -d

# Stop services
docker-compose down

# Rebuild and start
docker-compose up -d --build

# View logs
docker-compose logs -f

# Stop and remove volumes (WARNING: deletes data)
docker-compose down -v
```

## Production Deployment

### Overview

Production deployment is split across two platforms:

1. **Frontend → Vercel** (see [VERCEL_DEPLOYMENT.md](VERCEL_DEPLOYMENT.md))
2. **Backend + Database → Hetzner Cloud VM** (instructions below)

### Backend Deployment Prerequisites

1. **Server Requirements**:
   - Ubuntu 22.04 LTS (recommended)
   - Docker and Docker Compose installed
   - Ports 80 and 443 open (for API access)
   - Optional: Domain name for SSL (can start with IP address)

2. **Initial Server Setup**:
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose
sudo apt install docker-compose-plugin -y

# Create swap (if needed)
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Setup firewall
sudo ufw allow 22
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

### First-Time Deployment

1. **Clone repository on server**:
```bash
git clone https://github.com/yourusername/student-attendance-tracker.git
cd student-attendance-tracker
chmod +x deployment/scripts/*.sh
```

2. **Configure environment**:
```bash
cd deployment/production
cp .env.example .env
nano .env  # Edit with production values
```

**Important**: Generate secure values and configure CORS:
```bash
# Generate SECRET_KEY
openssl rand -hex 32

# Generate strong password
openssl rand -base64 32

# IMPORTANT: Add your Vercel URL to CORS_ORIGINS
# Production example: CORS_ORIGINS=https://app-attendance.kotoio.fi,http://localhost:5173
```

3. **Update nginx.conf** (optional):
```bash
nano nginx.conf
# Update server_name if using custom domain
# Default configuration uses _ (matches any domain/IP)
```

4. **Deploy backend**:
```bash
./deployment/scripts/deploy-prod.sh
```

The deployment script will:
- Build the backend Docker image
- Apply database migrations
- Start all services (database, backend, nginx as API gateway)

5. **Setup SSL certificates** (optional, recommended for production):
```bash
# Only if using a custom domain
./deployment/scripts/setup-ssl.sh
```

6. **Update Vercel environment variables**:
```bash
# In Vercel dashboard, set:
# VITE_API_URL=http://YOUR_VM_IP
# or with custom domain (recommended):
# VITE_API_URL=https://attendance-api.kotoio.fi
```

### Updating Production

**Frontend (Vercel)**:
- Automatic deployment on Git push
- No manual steps required

**Backend (Hetzner VM)**:
```bash
# SSH into VM
ssh user@your-vm-ip

# Navigate to project
cd student-attendance-tracker

# Pull latest code
git pull origin main

# Rebuild and deploy backend only
./deployment/scripts/deploy-prod.sh
```

## Database Management

### Backup Database

```bash
# Backup production database
./deployment/scripts/backup-db.sh production

# Backup local database
./deployment/scripts/backup-db.sh local
```

Backups are stored in `deployment/<environment>/backups/`

### Restore Database

```bash
# List available backups
ls deployment/production/backups/

# Restore from backup
./deployment/scripts/restore-db.sh production backup_20250126_120000.sql.gz
```

### Automated Backups

Add to crontab on production server:

```bash
# Edit crontab
crontab -e

# Add daily backup at 2 AM
0 2 * * * /path/to/student-attendance-tracker/deployment/scripts/backup-db.sh production
```

## SSL Certificate Management

### Initial Setup

```bash
./deployment/scripts/setup-ssl.sh
```

This is idempotent — it is also the **repair** path if renewal ever breaks.

### Renewal — automatic, nothing to do

`certbot.timer` (installed with the certbot package) runs twice a day and renews
inside the last 30 days of validity. Two pieces make that actually work here:

- **webroot, not standalone.** The challenge file is written to `/var/www/certbot`,
  which nginx already serves at `/.well-known/acme-challenge/`. nginx never stops.
- **a deploy hook.** `/etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh` runs
  after a successful renewal and issues a graceful `nginx -s reload`. nginx
  bind-mounts `/etc/letsencrypt` read-only and reads the live cert directly, so
  there are no copies to keep in sync.

Do **not** add a cron job for this, and do **not** re-copy certs into `production/ssl/`.

Verify at any time:
```bash
./deployment/scripts/check-ssl.sh      # compares cert on disk vs. cert on the wire
sudo certbot renew --dry-run           # simulates a real unattended renewal
```

### Monitoring

`./deployment/scripts/setup-ssl-monitoring.sh` installs local alerting (no external
services):

- **Login banner** — every SSH login prints cert status, red if expiring or stale.
- **Daily check** — `ssl-cert-check.timer` logs to the journal (`journalctl -t ssl-cert-check`).
- **Renewal failure** — `certbot.service` has an `OnFailure` hook that logs CRITICAL
  and refreshes the banner immediately.

> **History:** the certificate expired on 2026-05-28 and stayed expired for 80 days.
> Renewal was configured with `--standalone`, which needs to bind port 80 — but the
> nginx container holds it, so every unattended renewal failed. Nothing alerted,
> because Let's Encrypt [discontinued expiration emails in June 2025](https://letsencrypt.org/2025/06/26/expiration-notification-service-has-ended).
> The webroot switch fixes the renewal; the monitoring above fixes the silence.

## Monitoring

### View Logs

```bash
# All services
./deployment/scripts/logs.sh production

# Specific service
./deployment/scripts/logs.sh production backend
./deployment/scripts/logs.sh production nginx
./deployment/scripts/logs.sh production db
```

### Check Service Status

```bash
cd deployment/production
docker-compose ps
```

### Check Backend Health

```bash
curl http://localhost:8000/health
```

## Troubleshooting

### Backend Not Starting

```bash
# Check backend logs
./deployment/scripts/logs.sh production backend

# Common issues:
# 1. Database connection - check DATABASE_URL in .env
# 2. Migrations failed - run manually:
docker exec -it attendance-backend-prod alembic upgrade head
```

### Database Connection Issues

```bash
# Check database status
cd deployment/production
docker-compose ps db

# Check database logs
docker-compose logs db

# Test database connection
docker exec -it attendance-db-prod psql -U attendance_user -d attendance_tracker
```

### Nginx Not Starting

```bash
# Check nginx logs
./deployment/scripts/logs.sh production nginx

# Test nginx configuration
docker exec attendance-nginx-prod nginx -t

# Common issues:
# 1. SSL certificates missing - run setup-ssl.sh
# 2. Port 80/443 already in use - check for other web servers
```

### Reset Everything (DANGER!)

```bash
# Stop all services and remove volumes
cd deployment/production
docker-compose down -v

# Remove images
docker-compose down --rmi all

# Start fresh
./deployment/scripts/deploy-prod.sh
```

## Security Best Practices

### Production Checklist

- [ ] Strong `SECRET_KEY` in production .env (32+ random characters)
- [ ] Strong database password (16+ characters)
- [ ] SSL certificates properly configured
- [ ] Firewall rules active (UFW)
- [ ] Regular backups scheduled
- [ ] Database not exposed to internet (only localhost)
- [ ] `DEBUG=false` in production
- [ ] CORS configured for your domain only
- [ ] Regular system updates: `sudo apt update && sudo apt upgrade`

### Security Updates

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Update Docker images
cd deployment/production
docker-compose pull
docker-compose up -d
```

## Performance Tuning

### Database Optimization

```bash
# Enter PostgreSQL container
docker exec -it attendance-db-prod psql -U attendance_user -d attendance_tracker

# Check table sizes
SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

# Vacuum and analyze
VACUUM ANALYZE;
```

### Backend Workers

Edit `production/docker-compose.yml`:
```yaml
command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

Adjust workers based on CPU cores (recommended: 2-4 × CPU cores).

## Multi-Backend Hosting (Cost Optimization)

You can host **multiple hobby backend projects** on a single Hetzner VM to save costs.

### Strategy

Each backend project runs on a different port with its own Docker Compose setup:

```
VM Structure:
├── /home/user/project1/  (port 8001, database on 5433)
│   └── deployment/production/docker-compose.yml
├── /home/user/project2/  (port 8002, database on 5434)
│   └── deployment/production/docker-compose.yml
└── /etc/nginx/           (shared Nginx routing all backends)
```

### Setup Steps

1. **Deploy first backend** (this project):
```bash
cd /home/user/student-attendance-tracker
# Deploy as normal (uses port 8000, PostgreSQL on 5432)
./deployment/scripts/deploy-prod.sh
```

2. **Deploy second backend**:
```bash
cd /home/user/another-project

# Update docker-compose.yml to use different ports:
# Backend: internal port 8000 → host port 8001
# Database: 5432 → 5433
# Change container names to avoid conflicts

# Deploy
./deployment/scripts/deploy-prod.sh
```

3. **Configure shared Nginx** to route:
```nginx
# /etc/nginx/sites-available/backends

# Project 1
server {
    listen 80;
    server_name project1.yourdomain.com;
    location /api/ {
        proxy_pass http://localhost:8000;
    }
}

# Project 2
server {
    listen 80;
    server_name project2.yourdomain.com;
    location /api/ {
        proxy_pass http://localhost:8001;
    }
}
```

4. **Each project's frontend** (on Vercel) points to its subdomain:
   - Project 1: `VITE_API_URL=https://project1.yourdomain.com`
   - Project 2: `VITE_API_URL=https://project2.yourdomain.com`

### Cost Savings Example

| Setup | Cost |
|-------|------|
| 3 separate VMs | €10.47/month (3 × €3.49) |
| 1 shared VM | €4.99/month (CX21) |
| **Savings** | **€5.48/month (52%)** |

## Scaling Considerations

### Vertical Scaling (Single Server)

Upgrade server resources on Hetzner:
- Start: CX21 (2 vCPU, 4 GB RAM) - €4.99/month
- Medium: CX31 (2 vCPU, 8 GB RAM) - €9.18/month
- Large: CX41 (4 vCPU, 16 GB RAM) - €17.39/month

### Horizontal Scaling (Future)

If you need more capacity:
1. Add read replicas for PostgreSQL
2. Add Redis for caching
3. Use load balancer with multiple backend instances
4. Consider managed database (Hetzner Cloud Database)

## Cost Estimates

### Current Architecture (Vercel + Hetzner)

| Component | Service | Monthly Cost |
|-----------|---------|--------------|
| Frontend | Vercel Hobby (free tier) | **€0** |
| Backend + DB | Hetzner CX21 (2 vCPU, 4GB) | **€3.49** |
| Signup Credit | €20 credit | **-€3.49/month × 5 months** |
| **Total First 5 Months** | | **€0** |
| **Total After 5 Months** | | **€3.49/month (~$3.80)** |

**Notes:**
- Vercel Hobby tier is free for non-commercial use (100 GB bandwidth/month)
- Hetzner €20 signup credit covers ~5-6 months of CX21 server
- Multi-backend hosting: same €3.49/month for multiple projects

### Production Upgrade Options

| Server | vCPU | RAM | Storage | Monthly Cost |
|--------|------|-----|---------|--------------|
| CX21 | 2 | 4 GB | 40 GB | €3.49 |
| CX31 | 2 | 8 GB | 80 GB | €6.49 |
| CX41 | 4 | 16 GB | 160 GB | €12.49 |

**Recommendation**: CX21 is sufficient for hobby projects with moderate traffic

## Support & Help

### Common Commands Reference

```bash
# Start local development
./deployment/scripts/start-local.sh

# Deploy to production
./deployment/scripts/deploy-prod.sh

# View logs (local)
./deployment/scripts/logs.sh local [service]

# View logs (production)
./deployment/scripts/logs.sh production [service]

# Backup database
./deployment/scripts/backup-db.sh production

# Restore database
./deployment/scripts/restore-db.sh production <backup-file>

# Setup SSL
./deployment/scripts/setup-ssl.sh
```

### Getting Help

Check logs first:
```bash
./deployment/scripts/logs.sh production
```

Common log locations:
- Nginx: `/var/log/nginx/`
- Docker: `docker-compose logs`
- System: `journalctl -u docker`

---

**Last Updated**: 2025-10-26  
**Maintained by**: Development Team

