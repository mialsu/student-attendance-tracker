# Deployment Documentation

This directory contains all deployment configurations for the Student Attendance Tracker application.

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

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:8000
- **API Documentation**: http://localhost:8000/docs
- **Database**: localhost:5432

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

### Prerequisites

1. **Server Requirements**:
   - Ubuntu 22.04 LTS (recommended)
   - Docker and Docker Compose installed
   - Domain name pointing to server IP
   - Ports 80 and 443 open

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

**Important**: Generate secure values:
```bash
# Generate SECRET_KEY
openssl rand -hex 32

# Generate strong password
openssl rand -base64 32
```

3. **Update nginx.conf**:
```bash
nano nginx.conf
# Replace 'yourdomain.com' with your actual domain
```

4. **Build frontend**:
```bash
cd ../../client-app
npm install
npm run build
cd ../deployment/production
```

5. **Setup SSL certificates**:
```bash
./deployment/scripts/setup-ssl.sh
```

6. **Deploy**:
```bash
./deployment/scripts/deploy-prod.sh
```

### Updating Production

```bash
# Pull latest code
git pull origin main

# Rebuild frontend
cd client-app
npm install
npm run build

# Deploy
cd ..
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

### Renewal (every 60 days)

```bash
# Renew certificate
sudo certbot renew

# Update certificate files
./deployment/scripts/setup-ssl.sh
```

Add to crontab for automatic renewal:
```bash
0 3 1 * * sudo certbot renew --quiet && /path/to/deployment/scripts/setup-ssl.sh
```

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

## Scaling Considerations

### Vertical Scaling (Single Server)

Upgrade server resources on Hetzner:
- Start: CX21 (2 vCPU, 4 GB RAM) - €5.83/month
- Medium: CX31 (2 vCPU, 8 GB RAM) - €10.52/month
- Large: CX41 (4 vCPU, 16 GB RAM) - €19.90/month

### Horizontal Scaling (Future)

If you need more capacity:
1. Add read replicas for PostgreSQL
2. Add Redis for caching
3. Use load balancer with multiple backend instances
4. Consider managed database (Hetzner Cloud Database)

## Cost Estimates

### Hetzner Cloud (Europe)

| Component | Type | Monthly Cost |
|-----------|------|--------------|
| Server | CX21 (2 vCPU, 4GB) | €5.83 |
| Volume (optional) | 20GB | €2.40 |
| Snapshot (optional) | Weekly | ~€1.00 |
| **Total** | | **€9-10/month** |

### Alternative: CX31 (Recommended for Production)
- 2 vCPU, 8 GB RAM, 80 GB SSD
- €10.52/month
- Better for database operations

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

