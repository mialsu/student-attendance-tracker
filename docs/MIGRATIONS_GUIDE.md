# Database Migrations Guide

## Overview

This project uses **Alembic** for database migrations with **PostgreSQL 17**.

## Current Index Strategy

### ✅ Well-Designed Indexes (Not Overkill!)

**Users Table:**
- `email` (unique + indexed) - Fast login lookups

**Classes Table:**
- `teacher_id` (indexed) - Fast teacher's class listing

**Attendance Records Table:**
- `class_id` (indexed) - Fast filtering by class
- `timestamp` (indexed) - Fast date range queries
- `(student_last_name, student_first_name)` (composite) - Fast name searches

### Why These Indexes?

| Query | Index Used | Benefit |
|-------|------------|---------|
| Login | `users.email` | Sub-millisecond lookup |
| List classes | `classes.teacher_id` | Fast teacher filtering |
| List attendance | `attendance.class_id` | Fast class filtering |
| Filter by date | `attendance.timestamp` | Fast range scans |
| Search names | `attendance.(last_name, first_name)` | Fast name lookups |
| Legacy filter | `attendance.timestamp` | Fast MIN() aggregation |

### Index Size Estimate

For a typical teacher with:
- 10 classes
- 30 students per class
- 50 attendance records per student

**Total Records:** ~15,000 attendance records

**Index Overhead:**
- Primary keys: ~150 KB
- Foreign keys: ~50 KB
- Timestamp index: ~30 KB
- Name composite: ~40 KB
- **Total**: ~270 KB (negligible!)

**Verdict:** ✅ Indexes are well-worth it, not overkill at all!

---

## Generating Migrations

### Step 1: Ensure Database is Running

```bash
# Check if PostgreSQL is running
docker ps | grep postgres

# If not, start it
cd deployment/local
docker-compose up -d db

# Or use the quick script
./deployment/scripts/start-local.sh
```

### Step 2: Activate Virtual Environment

```bash
cd student-attendance-tracker-api
source venv/bin/activate  # Linux/Mac
# or
venv\Scripts\activate     # Windows
```

### Step 3: Generate Initial Migration

```bash
# Auto-generate migration from models
alembic revision --autogenerate -m "Initial migration: users, classes, attendance"

# This creates a file like:
# alembic/versions/abc123_initial_migration_users_classes_attendance.py
```

### Step 4: Review Migration File

```bash
# Open the generated file and review it
cat alembic/versions/*_initial_migration*.py

# Check for:
# ✅ All tables created
# ✅ All columns present
# ✅ Indexes created
# ✅ Foreign keys with CASCADE
```

### Step 5: Apply Migration

```bash
# Apply migration to database
alembic upgrade head

# You should see:
# INFO  [alembic.runtime.migration] Running upgrade  -> abc123, Initial migration
```

### Step 6: Verify Tables

```bash
# Connect to database
docker exec -it attendance-db-local psql -U attendance_user -d attendance_tracker

# List tables
\dt

# Should show:
# - alembic_version
# - users
# - classes
# - attendance_records

# Check indexes
\di

# Exit
\q
```

---

## Common Migration Commands

### Check Current Migration State

```bash
# Show current revision
alembic current

# Show migration history
alembic history

# Show pending migrations
alembic heads
```

### Create Migrations

```bash
# Auto-generate from model changes
alembic revision --autogenerate -m "Description of changes"

# Manual migration (advanced)
alembic revision -m "Manual migration description"
```

### Apply Migrations

```bash
# Apply all pending migrations
alembic upgrade head

# Apply specific number of migrations
alembic upgrade +1

# Apply to specific revision
alembic upgrade abc123
```

### Rollback Migrations

```bash
# Rollback one migration
alembic downgrade -1

# Rollback to specific revision
alembic downgrade abc123

# Rollback all migrations (DANGER!)
alembic downgrade base
```

---

## Typical Workflow

### Making Model Changes

1. **Edit model file** (e.g., `app/models/user.py`)
2. **Generate migration**:
   ```bash
   alembic revision --autogenerate -m "Add is_admin field to users"
   ```
3. **Review migration file** in `alembic/versions/`
4. **Apply migration**:
   ```bash
   alembic upgrade head
   ```
5. **Test changes** with your application

### Example: Adding a New Field

```python
# 1. Edit app/models/user.py
class User(Base):
    # ... existing fields ...
    phone_number: Mapped[str | None] = mapped_column(String(20), nullable=True)
```

```bash
# 2. Generate migration
alembic revision --autogenerate -m "Add phone_number to users"

# 3. Review the generated file
cat alembic/versions/*_add_phone_number*.py

# 4. Apply migration
alembic upgrade head
```

---

## Migration File Structure

A typical Alembic migration file:

```python
"""Add phone_number to users

Revision ID: abc123def456
Revises: previous_revision
Create Date: 2025-10-26 14:30:00.123456

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic
revision: str = 'abc123def456'
down_revision: Union[str, None] = 'previous_revision'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    # Commands to apply migration
    op.add_column('users', sa.Column('phone_number', sa.String(20), nullable=True))

def downgrade() -> None:
    # Commands to rollback migration
    op.drop_column('users', 'phone_number')
```

---

## Production Deployment

### Before Deploying New Code

```bash
# 1. SSH to production server
ssh user@your-server

# 2. Navigate to project
cd student-attendance-tracker

# 3. Pull latest code
git pull origin main

# 4. Enter API directory
cd student-attendance-tracker-api

# 5. Activate venv
source venv/bin/activate

# 6. Check pending migrations
alembic current
alembic heads

# 7. Backup database first!
../deployment/scripts/backup-db.sh production

# 8. Apply migrations
alembic upgrade head

# 9. Restart backend
cd ../deployment/production
docker-compose restart backend
```

### Rolling Back in Production

```bash
# If something goes wrong

# 1. Rollback migration
alembic downgrade -1

# 2. Restore from backup if needed
../deployment/scripts/restore-db.sh production backup_20251026_143000.sql.gz

# 3. Rollback code
git checkout previous-tag
docker-compose restart backend
```

---

## Troubleshooting

### Migration Generation Issues

**Problem:** Alembic doesn't detect changes

```bash
# Solution 1: Check models are imported
# Ensure app/models/__init__.py imports all models

# Solution 2: Check database connection
alembic current  # Should show current revision

# Solution 3: Force manual migration
alembic revision -m "Manual migration"
# Edit the file manually
```

**Problem:** Duplicate index errors

```bash
# Solution: Remove duplicate index from model
# Check __table_args__ and column definitions
# Only define each index once
```

### Apply Migration Errors

**Problem:** "Target database is not up to date"

```bash
# Check current state
alembic current

# Stamp database to specific revision
alembic stamp head
```

**Problem:** "Can't connect to database"

```bash
# Check DATABASE_URL in .env
cat .env | grep DATABASE_URL

# Test connection
docker exec -it attendance-db-local psql -U attendance_user -d attendance_tracker
```

---

## Best Practices

### ✅ DO

- Generate migrations for every model change
- Review generated migrations before applying
- Backup database before migrations in production
- Test migrations on development first
- Use descriptive migration messages
- Keep migrations small and focused

### ❌ DON'T

- Modify applied migrations (create new one instead)
- Skip migrations (always apply in order)
- Delete migration files
- Apply migrations without review
- Run migrations without backup (in production)

---

## Quick Reference

```bash
# Create virtual environment (first time)
python3.12 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Generate initial migration
alembic revision --autogenerate -m "Initial migration"

# Apply migrations
alembic upgrade head

# Check status
alembic current

# Rollback one step
alembic downgrade -1

# See history
alembic history
```

---

## Index Performance Tips

### When to Add Indexes

✅ **Add indexes for:**
- Foreign keys (for JOINs)
- Columns in WHERE clauses
- Columns in ORDER BY
- Unique constraints
- Columns in GROUP BY

❌ **Don't index:**
- Small tables (< 1000 rows)
- Columns with low cardinality (few unique values)
- Columns that are rarely queried
- Write-heavy tables with few reads

### Monitoring Index Usage (Production)

```sql
-- Check if indexes are being used
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan,
    idx_tup_read,
    idx_tup_fetch
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC;

-- Find unused indexes
SELECT 
    schemaname,
    tablename,
    indexname
FROM pg_stat_user_indexes
WHERE idx_scan = 0
AND indexname NOT LIKE 'pg_%';
```

---

**Last Updated:** 2025-10-26
**Alembic Version:** 1.12+

