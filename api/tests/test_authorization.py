"""Authorization tests — the denied side of INV-1.

INV-1: only a teacher associated with a Class may read or change that Class, its Students,
or its Attendance records.

Every test here authenticates as `other_teacher` — a second, real, active teacher who owns
nothing — and asserts the API refuses. That direction was untested before this file existed:
on 2026-09-01 the ownership filter was removed from `class_service.py:54` and all 262 tests
stayed green with byte-identical coverage. Coverage counted those lines as covered because the
happy path runs them; nothing asserted what happens when the check says no.

So the rule for this file: if a test here passes while an ownership check is deleted, the test
is wrong, not the code.
"""

import pytest
from httpx import AsyncClient

from app.models.attendance import AttendanceRecord
from app.models.class_ import Class
from app.models.student import Student

# Routes keyed by the Class they reach through. `{class_id}` is filled with a Class owned by
# `test_user`, never by `other_teacher`.
CLASS_SCOPED_ROUTES = [
    ("GET", "/api/classes/{class_id}", None),
    ("PUT", "/api/classes/{class_id}", {"name": "Renamed By An Intruder"}),
    ("DELETE", "/api/classes/{class_id}", None),
    ("GET", "/api/classes/{class_id}/attendance", None),
    ("GET", "/api/classes/{class_id}/attendance/summary", None),
    # Revealing legacy students is the same read as the summary itself, so it is refused
    # the same way. Without this row, the parameter added by
    # specs/0002-legacy-student-cutoff.md would be the one summary call nobody attacks.
    ("GET", "/api/classes/{class_id}/attendance/summary?legacy=true", None),
    ("GET", "/api/classes/{class_id}/attendance/statistics", None),
    (
        "POST",
        "/api/classes/{class_id}/attendance",
        {"student_name": "Intruder Entry", "timestamp": "2026-01-15T10:00:00Z", "quantity": 1},
    ),
    ("GET", "/api/classes/{class_id}/students", None),
    ("POST", "/api/classes/{class_id}/students", {"name": "Intruder Student"}),
    ("GET", "/api/classes/{class_id}/students/autocomplete?query=jo", None),
]

CLASS_SCOPED_IDS = [f"{m} {p}" for m, p, _ in CLASS_SCOPED_ROUTES]


@pytest.mark.asyncio
@pytest.mark.parametrize("method,path,body", CLASS_SCOPED_ROUTES, ids=CLASS_SCOPED_IDS)
async def test_other_teacher_denied_on_class_scoped_route(
    method: str,
    path: str,
    body: dict | None,
    client: AsyncClient,
    other_teacher_headers: dict,
    test_class: Class,
    test_student: Student,
) -> None:
    """A teacher who does not own the Class is refused on every route that reaches it."""
    response = await client.request(
        method,
        path.format(class_id=test_class.id),
        headers=other_teacher_headers,
        json=body,
    )
    assert response.status_code == 403, (
        f"{method} {path} returned {response.status_code} to a non-owning teacher; "
        f"expected 403. Body: {response.text[:300]}"
    )


STUDENT_SCOPED_ROUTES = [
    ("GET", "/api/students/{student_id}", None),
    ("PUT", "/api/students/{student_id}", {"name": "Renamed By An Intruder"}),
    ("PUT", "/api/students/{student_id}", {"course_credit_received": True}),
    ("DELETE", "/api/students/{student_id}", None),
]

STUDENT_SCOPED_IDS = [
    "GET student",
    "PUT student name",
    "PUT student course credit",
    "DELETE student",
]


@pytest.mark.asyncio
@pytest.mark.parametrize("method,path,body", STUDENT_SCOPED_ROUTES, ids=STUDENT_SCOPED_IDS)
async def test_other_teacher_denied_on_student_scoped_route(
    method: str,
    path: str,
    body: dict | None,
    client: AsyncClient,
    other_teacher_headers: dict,
    test_student: Student,
) -> None:
    """A Student is reached only through its Class, so a non-owner is refused."""
    response = await client.request(
        method,
        path.format(student_id=test_student.id),
        headers=other_teacher_headers,
        json=body,
    )
    assert response.status_code == 403, (
        f"{method} {path} returned {response.status_code} to a non-owning teacher; "
        f"expected 403. Body: {response.text[:300]}"
    )


@pytest.mark.asyncio
async def test_other_teacher_cannot_delete_attendance_record(
    client: AsyncClient,
    other_teacher_headers: dict,
    test_attendance: AttendanceRecord,
) -> None:
    """Attendance is deleted by id, so the check cannot lean on a class_id in the path."""
    response = await client.delete(
        f"/api/attendance/{test_attendance.id}", headers=other_teacher_headers
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_other_teacher_cannot_merge_another_teachers_students(
    client: AsyncClient,
    other_teacher_headers: dict,
    test_student: Student,
    test_student_with_credit: Student,
) -> None:
    """Merge destroys one Student and moves attendance, so it must refuse a non-owner.

    Both students belong to `test_user`'s Class, so nothing but ownership can refuse this.
    """
    response = await client.post(
        f"/api/students/{test_student.id}/merge",
        headers=other_teacher_headers,
        json={"duplicate_student_id": str(test_student_with_credit.id)},
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_class_list_does_not_leak_another_teachers_class(
    client: AsyncClient,
    other_teacher_headers: dict,
    test_class: Class,
) -> None:
    """The list route filters instead of raising, so 403 is the wrong thing to assert here.

    A leak looks like a 200 that contains someone else's Class.
    """
    response = await client.get("/api/classes", headers=other_teacher_headers)
    assert response.status_code == 200
    returned_ids = [item["id"] for item in response.json()]
    assert str(test_class.id) not in returned_ids, (
        "GET /api/classes leaked another teacher's class to a teacher who does not own it"
    )


# --- positive controls ------------------------------------------------------------------
# Without these, every assertion above would still pass if the routes were simply broken for
# everyone. These prove the same requests succeed for the teacher who does own the Class, so a
# 403 above means "refused", not "unreachable".

POSITIVE_CONTROL_ROUTES = [
    "/api/classes/{class_id}",
    "/api/classes/{class_id}/attendance",
    "/api/classes/{class_id}/attendance/summary",
    "/api/classes/{class_id}/attendance/summary?legacy=true",
    "/api/classes/{class_id}/attendance/statistics",
    "/api/classes/{class_id}/students",
    "/api/classes/{class_id}/students/autocomplete?query=jo",
]


@pytest.mark.asyncio
@pytest.mark.parametrize("path", POSITIVE_CONTROL_ROUTES)
async def test_owning_teacher_is_allowed_on_the_same_routes(
    path: str,
    client: AsyncClient,
    auth_headers: dict,
    test_class: Class,
    test_student: Student,
) -> None:
    """The owner gets through, which is what makes the 403s above meaningful."""
    response = await client.get(
        path.format(class_id=test_class.id), headers=auth_headers
    )
    assert response.status_code == 200, (
        f"GET {path} returned {response.status_code} to the OWNING teacher; the denial tests "
        f"above would pass for the wrong reason. Body: {response.text[:300]}"
    )


@pytest.mark.asyncio
async def test_owning_teacher_can_read_own_student(
    client: AsyncClient, auth_headers: dict, test_student: Student
) -> None:
    """Positive control for the student-scoped denials."""
    response = await client.get(
        f"/api/students/{test_student.id}", headers=auth_headers
    )
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_other_teacher_cannot_supply_her_own_student_as_a_merge_duplicate(
    client: AsyncClient,
    auth_headers: dict,
    other_teacher_headers: dict,
    test_class: Class,
) -> None:
    """The merge's SECOND surface: the duplicate, which is not in the path.

    The test above denies through the target — the id in the URL. This one runs as the owner of
    the target and reaches for a Student in a Class she does not own, which is the same INV-1
    violation arriving through the request BODY. It was refused before this test existed, but
    by the same-Class comparison rather than by an ownership check, so a 403 became a 400 and
    the log named INV-5. Deleting either `verify_class_ownership` call in `merge_students` now
    turns this red.

    Added 2026-09-10 with spec 0005 slice 4's ordering fix; the log-side assertion lives in
    `tests/test_logging_events.py`, this one is about the response.
    """
    her_class = await client.post(
        "/api/classes", json={"name": "Hänen kurssi"}, headers=other_teacher_headers
    )
    her_student = await client.post(
        f"/api/classes/{her_class.json()['id']}/students",
        json={"name": "Helena Salo"},
        headers=other_teacher_headers,
    )
    my_student = await client.post(
        f"/api/classes/{test_class.id}/students",
        json={"name": "Aino Mäkinen"},
        headers=auth_headers,
    )

    response = await client.post(
        f"/api/students/{my_student.json()['id']}/merge",
        headers=auth_headers,
        json={"duplicate_student_id": her_student.json()["id"]},
    )

    assert response.status_code == 403, (
        f"a merge whose DUPLICATE belongs to another teacher returned "
        f"{response.status_code}; expected 403. Body: {response.text[:300]}"
    )
