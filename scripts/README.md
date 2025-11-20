# Scripts Directory

This directory contains utility scripts for managing the Student Attendance Tracker API.

## Available Scripts

### 1. Create Superadmin User

**Purpose**: Create or update a superadmin user who can manage registration codes.

**Usage**:
```bash
# Using shell wrapper (recommended)
./scripts/create-superadmin.sh

# Or directly with Python
python scripts/create_superadmin.py
```

**What it does**:
- Prompts for email address and password (hidden input)
- Creates a new superadmin user if email doesn't exist
- Updates existing user to superadmin role if email already exists
- Validates password strength (minimum 8 characters)
- Confirms password before creating/updating

**Example**:
```bash
$ ./scripts/create-superadmin.sh
============================================================
Create Superadmin User
============================================================

Enter email address: admin@example.com
Enter password (min 8 characters):
Confirm password:

Creating superadmin user: admin@example.com
✓ Superadmin user created successfully
   User ID: 74030146-edd0-4595-87e5-cbc19fcdfaff

============================================================
Superadmin user is ready!
============================================================

You can now:
  1. Login at /api/auth/login with:
     Email: admin@example.com
     Password: [your password]

  2. Create registration codes at /api/admin/codes

  3. Access API documentation at /docs
     (Use DOCS_USERNAME and DOCS_PASSWORD in production)
```

---

### 2. Seed Database

**Purpose**: Populate database with test data for manual testing.

**Usage**:
```bash
# Using shell wrapper
./scripts/seed-db.sh

# Or directly with Python
python scripts/seed_data.py
```

**What it does**:
- Creates 2 test teachers
- Creates 3-4 classes per teacher
- Creates 20-30 students per class with varying attendance
- Includes legacy students (first attendance > 5 years ago)
- Mix of active and inactive classes

---

### 3. Database Migrations

**Generate Migration**:
```bash
./scripts/generate-migration.sh "migration description"
```

**Apply Migrations**:
```bash
./scripts/apply-migrations.sh
```

---

### 4. Run Tests

**All Tests**:
```bash
./scripts/run-tests.sh
```

**Fast Tests** (skip slow tests):
```bash
./scripts/run-tests.sh fast
```

**With Docker**:
```bash
./scripts/run-tests-docker.sh
```

---

## Prerequisites

### For Shell Scripts
- Virtual environment created: `python3 -m venv venv`
- Dependencies installed: `pip install -r requirements.txt`
- `.env` file configured (or using defaults from `.env.example`)

### For Python Scripts Directly
```bash
# Activate virtual environment
source venv/bin/activate  # Linux/Mac
# or
venv\Scripts\activate     # Windows

# Run script
python scripts/script_name.py
```

---

## Common Tasks

### First Time Setup

1. **Create superadmin user** (required before creating registration codes):
   ```bash
   ./scripts/create-superadmin.sh
   ```

2. **Seed test data** (optional, for development):
   ```bash
   ./scripts/seed-db.sh
   ```

### Creating Registration Codes

Registration codes can only be created by superadmin users via the API:

```bash
# 1. First, create a superadmin
./scripts/create-superadmin.sh

# 2. Login and get access token
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"your-password"}'

# 3. Create registration code
curl -X POST http://localhost:8000/api/admin/codes \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email_restriction":null}'

# Or with email restriction
curl -X POST http://localhost:8000/api/admin/codes \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email_restriction":"teacher@school.com"}'
```

---

## Troubleshooting

### "Virtual environment not found"
```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### "Database connection failed"
- Ensure PostgreSQL is running
- Check `DATABASE_URL` in `.env` file
- For Docker: `docker-compose up -d db`

### "Permission denied" when running shell scripts
```bash
chmod +x scripts/*.sh
```

### Password requirements for superadmin
- Minimum 8 characters
- No maximum length
- All characters allowed
- Best practice: Use a strong, unique password

---

## Security Notes

- **Superadmin credentials**: Store securely, never commit to git
- **Registration codes**: Single-use, can be revoked if compromised
- **API documentation**: Protected with HTTP Basic Auth in production
- **Database backups**: Use deployment scripts in `/deployment/scripts/`

---

## Development vs Production

### Development
- Superadmin creation works the same way
- API docs accessible without password
- Use `ENVIRONMENT=development` and `DEBUG=True`

### Production
- API docs require `DOCS_USERNAME` and `DOCS_PASSWORD`
- Use strong passwords for superadmin accounts
- Keep superadmin count minimal (1-2 users)
- Set `ENVIRONMENT=production` and `DEBUG=False`

---

## Related Documentation

- API Documentation: `/docs` (when server is running)
- Testing Guide: `/docs/TESTING_GUIDE.md`
- Architecture: `/docs/ARCHITECTURE.md`
- Deployment: `/deployment/README.md`
