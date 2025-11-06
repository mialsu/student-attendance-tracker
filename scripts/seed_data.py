"""
Seed database with test data for manual testing.

This script creates:
- 2 test users (teachers)
- 3-4 classes per teacher
- 20-30 students per class with varying attendance
- Some legacy students (first attendance > 5 years ago) for filter testing
- Mix of active and inactive classes

Run with: python scripts/seed_data.py
"""

import asyncio
import sys
from pathlib import Path
from datetime import datetime, timedelta, timezone
from uuid import uuid4
import random

# Add parent directory to path to import app modules
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select, delete

from app.config import settings
from app.models.user import User
from app.models.class_ import Class
from app.models.attendance import AttendanceRecord
from app.core.security import hash_password
from app.database import Base


# Finnish first and last names for realistic test data
FIRST_NAMES = [
    "Mikko", "Juhani", "Olavi", "Tapani", "Kalevi",
    "Matti", "Antero", "Jari", "Markku", "Pekka",
    "Marko", "Juha", "Antti", "Sami", "Ville",
    "Tuula", "Ritva", "Liisa", "Eeva", "Anneli",
    "Pirjo", "Kristiina", "Hannele", "Helena", "Tarja",
    "Sari", "Minna", "Kaisa", "Laura", "Anna",
    "Emilia", "Sofia", "Aino", "Ella", "Helmi",
    "Eetu", "Onni", "Leevi", "Väinö", "Eino",
]

LAST_NAMES = [
    "Virtanen", "Korhonen", "Mäkinen", "Nieminen", "Mäkelä",
    "Hämäläinen", "Laine", "Heikkinen", "Koskinen", "Järvinen",
    "Lehtonen", "Lehtinen", "Saarinen", "Salminen", "Heinonen",
    "Niemi", "Heikkilä", "Kinnunen", "Salonen", "Turunen",
    "Salo", "Laitinen", "Tuominen", "Mattila", "Rantanen",
    "Laaksonen", "Ahonen", "Ojala", "Manninen", "Kallio",
]

CLASS_NAMES = [
    "Python-ohjelmointi perusteet",
    "Web-kehitys React:illa",
    "Tietokannat ja SQL",
    "JavaScript-ohjelmointi",
    "Käyttöliittymäsuunnittelu",
    "REST API:en rakentaminen",
    "Docker ja kontitit",
    "Git ja versionhallinta",
    "Ohjelmistotestaus",
    "Agile-projektinhallinta",
    "TypeScript perusteet",
    "Node.js backend-kehitys",
]


async def create_tables(engine):
    """Create all database tables."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("✓ Database tables created")


async def clear_existing_data(session: AsyncSession):
    """Clear all existing data from tables."""
    # Delete in correct order (respecting foreign keys)
    await session.execute(delete(AttendanceRecord))
    await session.execute(delete(Class))
    await session.execute(delete(User))
    await session.commit()
    print("✓ Existing data cleared")


async def create_users(session: AsyncSession) -> list[User]:
    """Create test users (teachers)."""
    users = [
        User(
            id=uuid4(),
            email="teacher1@example.com",
            password_hash=hash_password("password123"),
            active=True,
        ),
        User(
            id=uuid4(),
            email="teacher2@example.com",
            password_hash=hash_password("password123"),
            active=True,
        ),
    ]

    for user in users:
        session.add(user)

    await session.commit()

    for user in users:
        await session.refresh(user)

    print(f"✓ Created {len(users)} users:")
    for user in users:
        print(f"  - {user.email} (password: password123)")

    return users


async def create_classes(session: AsyncSession, users: list[User]) -> list[Class]:
    """Create test classes for each teacher."""
    classes = []

    for user in users:
        num_classes = random.randint(3, 4)
        user_class_names = random.sample(CLASS_NAMES, num_classes)

        for i, class_name in enumerate(user_class_names):
            # Make one class inactive for testing
            is_active = i != 0  # First class is inactive

            class_obj = Class(
                id=uuid4(),
                name=class_name,
                description=f"Testikurssi - {class_name}",
                teacher_id=user.id,
                active=is_active,
            )
            session.add(class_obj)
            classes.append(class_obj)

    await session.commit()

    for class_obj in classes:
        await session.refresh(class_obj)

    print(f"✓ Created {len(classes)} classes")
    return classes


async def create_attendance_records(session: AsyncSession, classes: list[Class]):
    """Create attendance records with varying patterns."""
    total_records = 0

    for class_obj in classes:
        # Generate 20-30 unique students per class
        num_students = random.randint(20, 30)
        students = []

        for _ in range(num_students):
            first_name = random.choice(FIRST_NAMES)
            last_name = random.choice(LAST_NAMES)
            # Ensure unique student per class
            student_key = f"{first_name}|{last_name}"
            if student_key not in students:
                students.append(student_key)

        # Create attendance records
        now = datetime.now(timezone.utc)

        for student_key in students:
            first_name, last_name = student_key.split("|")

            # Decide if this is a legacy student (10% chance)
            is_legacy = random.random() < 0.10

            if is_legacy:
                # Legacy student: first attendance 5-7 years ago
                years_ago = random.randint(5, 7)
                first_attendance = now - timedelta(days=years_ago * 365)
                # They might have stopped coming, so fewer recent records
                num_records = random.randint(3, 8)
            else:
                # Regular student: first attendance within last 6 months
                days_ago = random.randint(1, 180)
                first_attendance = now - timedelta(days=days_ago)
                # More active attendance
                num_records = random.randint(5, 25)

            # Create attendance records spread over time
            for i in range(num_records):
                if is_legacy and i == 0:
                    # First record is the old one
                    timestamp = first_attendance
                else:
                    # Subsequent records spread between first attendance and now
                    time_range = (now - first_attendance).days
                    if time_range > 0:
                        days_offset = random.randint(0, time_range)
                        timestamp = first_attendance + timedelta(days=days_offset)
                    else:
                        timestamp = first_attendance

                # Add some time variation (different times of day)
                hour = random.randint(8, 16)
                minute = random.randint(0, 59)
                timestamp = timestamp.replace(hour=hour, minute=minute, second=0, microsecond=0)

                record = AttendanceRecord(
                    id=uuid4(),
                    class_id=class_obj.id,
                    student_first_name=first_name,
                    student_last_name=last_name,
                    timestamp=timestamp,
                )
                session.add(record)
                total_records += 1

        # Commit per class to avoid huge transactions
        await session.commit()
        print(f"  - Class '{class_obj.name}': {len(students)} students, varying attendance")

    print(f"✓ Created {total_records} attendance records")


async def print_summary(session: AsyncSession):
    """Print summary of seeded data."""
    print("\n" + "="*60)
    print("DATABASE SEEDING COMPLETE")
    print("="*60)

    # Count users
    result = await session.execute(select(User))
    users = result.scalars().all()
    print(f"\n📊 Summary:")
    print(f"  Users: {len(users)}")

    # Count classes
    result = await session.execute(select(Class))
    classes = result.scalars().all()
    active_classes = [c for c in classes if c.active]
    inactive_classes = [c for c in classes if not c.active]
    print(f"  Classes: {len(classes)} ({len(active_classes)} active, {len(inactive_classes)} inactive)")

    # Count attendance
    result = await session.execute(select(AttendanceRecord))
    records = result.scalars().all()
    print(f"  Attendance records: {len(records)}")

    # Count legacy students (first attendance > 5 years ago)
    five_years_ago = datetime.now(timezone.utc) - timedelta(days=5*365)
    legacy_count = 0
    student_first_attendance = {}

    for record in records:
        student_key = f"{record.student_first_name}|{record.student_last_name}"
        if student_key not in student_first_attendance:
            student_first_attendance[student_key] = record.timestamp
        else:
            if record.timestamp < student_first_attendance[student_key]:
                student_first_attendance[student_key] = record.timestamp

    for first_time in student_first_attendance.values():
        if first_time < five_years_ago:
            legacy_count += 1

    print(f"  Legacy students (>5 years): ~{legacy_count}")

    print(f"\n🔐 Login credentials:")
    print(f"  Email: teacher1@example.com")
    print(f"  Email: teacher2@example.com")
    print(f"  Password: password123")

    print(f"\n💡 Test scenarios:")
    print(f"  ✓ Name search: Try searching for 'Virtanen' or 'Matti'")
    print(f"  ✓ Legacy filter: Toggle to see students with old attendance")
    print(f"  ✓ Pagination: Each class has 20-30 students")
    print(f"  ✓ Inactive class: First class per teacher is inactive (can't add attendance)")
    print(f"  ✓ Delete records: Each attendance can be deleted")

    print("\n" + "="*60 + "\n")


async def main():
    """Main seeding function."""
    print("\n🌱 Starting database seeding...\n")

    # Create engine and session
    engine = create_async_engine(
        settings.database_url,
        echo=False,
    )

    async_session = sessionmaker(
        engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    async with async_session() as session:
        try:
            # Create tables if they don't exist
            await create_tables(engine)

            # Clear existing data
            await clear_existing_data(session)

            # Seed data
            users = await create_users(session)
            classes = await create_classes(session, users)
            await create_attendance_records(session, classes)

            # Print summary
            await print_summary(session)

        except Exception as e:
            print(f"\n❌ Error during seeding: {e}")
            await session.rollback()
            raise
        finally:
            await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
