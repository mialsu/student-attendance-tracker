# Scripts Directory

This directory contains utility scripts for managing the Student Attendance Tracker API.

## Available Scripts

### 1. Registration Codes

**Purpose**: Issue and revoke the codes that let someone create a teacher account. Authorization
is having access to the database, not holding a role (ADR-0003) — there is no HTTP endpoint and
no account to create first.

**Usage**:
```bash
just code-issue  teacher@school.com     # prints the code and when it expires
just code-revoke teacher@school.com     # exits 1 if that address has no live code

# Or without just
./scripts/registration-code.sh issue teacher@school.com
```

**On the production server** the image has no virtual environment, so call the Python script
directly rather than the shell wrapper. `DATABASE_URL` is already set in the container:

```bash
cd "$PROJECT_PATH"
docker compose -f deployment/production/docker-compose.yml \
  exec backend python scripts/registration_code.py issue teacher@school.com
```

**What it does**:
- Names the database it is about to write to, on every run, before doing anything
- Issues a code for exactly one address, redeemable for 24 hours (`CODE_LIFETIME`)
- Refuses a second live code for an address that already has one
- Revokes by address, and exits 1 when there is nothing to revoke, so a typo is not silent

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

1. **Issue a registration code** for the first teacher:
   ```bash
   just code-issue teacher@school.com
   ```

2. **Seed test data** (optional, for development):
   ```bash
   ./scripts/seed-db.sh
   ```

### Creating Registration Codes

From the command line, against the database `DATABASE_URL` names. Authorization is having
database access, not holding a role (ADR-0003), so there is no account to create first and no
token to fetch:

```bash
just code-issue  teacher@school.com     # prints the code and when it expires
just code-revoke teacher@school.com     # exits 1 if that address has no live code
```

Every code names exactly one address (INV-7) and is redeemable for 24 hours. There is no
universal code: an address is required, because a code that anybody can redeem is a code that
whoever finds it can redeem.

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

## Security Notes

- **Registration codes**: single-use, expire after 24 hours, and can be revoked before that
- **Issuing a code**: authorized by database access, which the internet cannot reach — the
  database listens on localhost only (ADR-0003)
- **API documentation**: Protected with HTTP Basic Auth in production
- **Database backups**: Use deployment scripts in `/deployment/scripts/`

---

## Development vs Production

### Development
- API docs accessible without password
- Use `ENVIRONMENT=development` and `DEBUG=True`
- Issue codes with `just code-issue`

### Production
- API docs require `DOCS_USERNAME` and `DOCS_PASSWORD`
- Set `ENVIRONMENT=production` and `DEBUG=False`
- Issue codes inside the backend container (see section 1)

---

## Related Documentation

- API Documentation: `/docs` (the running server's OpenAPI UI, not a file in this repository)
- Architecture: `docs/adr/` — the decisions, each with its rejected alternatives
- Invariants: `INVARIANTS.md` — the rules, each naming its enforcer
- Deployment and operations: `../deployment/README.md`
