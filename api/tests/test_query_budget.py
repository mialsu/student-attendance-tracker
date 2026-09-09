"""A ceiling on how many SQL statements each list endpoint may issue.

This exists because of a comment in `app/services/attendance_service.py`: an N+1 loop lived in
`get_attendance_summary` until 2026-09-04, grew quietly, and was found "by measuring rather than
by a gate". Every fixture in this suite uses a handful of students, which is exactly the size at
which an N+1 is invisible -- 441 green tests, the boundary gate, the mypy ratchet and the drift
gate all passed over it, and over the three siblings it turned out to have. This file is the only
thing that fails when one of them comes back.

These are RATCHETS, in the spirit of `.harness-baseline`: the numbers below are what the code
does TODAY, not what it should do. The rule is that a number may go DOWN and may never go up.
Lowering one when you fix the loop behind it is the point of the file, and on 2026-09-09 all
three loops that opened this file at 29, 28 and 79 were fixed and their ceilings lowered to 4,
3 and 4 -- each watched failing against the new ceiling before the fix went in.

Deliberately no OpenTelemetry here. SQLAlchemy already emits `before_cursor_execute`, so counting
statements needs nothing installed, and the gate keeps working whatever happens to the tracing
stack. It also avoids OTel's set-once global tracer provider, which does not survive a
single-process pytest session being asked to configure it twice.
"""

from contextlib import contextmanager
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from sqlalchemy import event

from app.models.attendance import AttendanceRecord
from app.models.student import Student

# Big enough that a per-row query is unmistakable, small enough to stay a fast test.
STUDENT_COUNT = 25
RECORDS_PER_STUDENT = 2

# Measured ceilings, for a 25-student class holding 50 attendance records. Lower one when you fix
# the loop behind it; never raise one. Every one of these is now flat in the row count rather than
# scaling with it, so a number creeping up means a loop has come back.
BUDGET_STUDENTS_LIST = 4  # fixed 2026-09-09: counts folded into the paginated query
BUDGET_AUTOCOMPLETE = 3  # fixed 2026-09-09: one grouped query, flat in the match count
BUDGET_ATTENDANCE_LIST = 4  # fixed 2026-09-09: the student rides the join already paid for
BUDGET_SUMMARY = 6  # what the shape looks like when it is right


@contextmanager
def count_statements(db_engine):
    """Count every statement the engine executes inside the block."""
    seen: list[str] = []

    def before(conn, cursor, statement, parameters, context, executemany):
        seen.append(statement)

    event.listen(db_engine.sync_engine, "before_cursor_execute", before)
    try:
        yield seen
    finally:
        event.remove(db_engine.sync_engine, "before_cursor_execute", before)


@pytest_asyncio.fixture
async def populated_class(db, test_class):
    """A class with STUDENT_COUNT students, each carrying a couple of attendance records."""
    now = datetime.now(timezone.utc)
    for i in range(STUDENT_COUNT):
        student = Student(
            name=f"Budget Student {i:02d}",
            class_id=test_class.id,
            course_credit_received=False,
        )
        db.add(student)
        await db.flush()
        for r in range(RECORDS_PER_STUDENT):
            db.add(
                AttendanceRecord(
                    class_id=test_class.id,
                    student_id=student.id,
                    timestamp=now - timedelta(days=i + r),
                )
            )
    await db.commit()
    return test_class


@pytest.mark.parametrize(
    ("label", "path", "budget"),
    [
        ("students_list", "/api/classes/{cid}/students?limit=100", BUDGET_STUDENTS_LIST),
        (
            "autocomplete",
            "/api/classes/{cid}/students/autocomplete?query=Budget",
            BUDGET_AUTOCOMPLETE,
        ),
        ("attendance_list", "/api/classes/{cid}/attendance?limit=100", BUDGET_ATTENDANCE_LIST),
        ("summary", "/api/classes/{cid}/attendance/summary?limit=25", BUDGET_SUMMARY),
    ],
)
async def test_endpoint_stays_within_its_query_budget(
    client, auth_headers, db_engine, populated_class, label, path, budget
):
    """One request, one statement count, compared against the recorded ceiling."""
    url = path.format(cid=populated_class.id)

    with count_statements(db_engine) as statements:
        response = await client.get(url, headers=auth_headers)

    assert response.status_code == 200
    print(f"\nQUERY BUDGET {label}: {len(statements)} statements for {STUDENT_COUNT} students")
    assert len(statements) <= budget, (
        f"{label} issued {len(statements)} statements against a ceiling of {budget}. "
        f"If you made this worse, fix the loop. If you made it better, lower the ceiling."
    )
