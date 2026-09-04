"""
Tests for the five-year legacy-student cutoff on the attendance summary.

Spec: specs/0002-legacy-student-cutoff.md

A Student is *legacy* when their first attendance — MIN(AttendanceRecord.timestamp),
falling back to Student.created_at when they have no records — is more than five years
old. Legacy students are absent from the summary by default, in every state including an
active search, and the response reports how many were hidden.
"""

from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.attendance import AttendanceRecord
from app.models.class_ import Class
from app.models.student import Student
from app.services import attendance_service


def years_ago(years: float) -> datetime:
    """A timezone-aware instant, using the same 365-day year as the cutoff."""
    return datetime.now(timezone.utc) - timedelta(days=int(years * 365))


async def student_with_attendance(
    db: AsyncSession,
    class_: Class,
    name: str,
    *timestamps: datetime,
) -> Student:
    """
    Create a Student whose attendance falls on the given instants.

    created_at is left at "now" on purpose: it is what the old cutoff read, so a student
    built this way is legacy under first-attendance semantics and not legacy under the
    creation-date semantics this slice replaces.
    """
    student = Student(name=name, class_id=class_.id, course_credit_received=False)
    db.add(student)
    await db.flush()

    for timestamp in timestamps:
        db.add(
            AttendanceRecord(
                class_id=class_.id, student_id=student.id, timestamp=timestamp
            )
        )

    await db.commit()
    await db.refresh(student)
    return student


async def student_without_attendance(
    db: AsyncSession, class_: Class, name: str, created_at: datetime
) -> Student:
    """Create a Student with no attendance records and an explicit creation date."""
    student = Student(
        name=name,
        class_id=class_.id,
        course_credit_received=False,
        created_at=created_at,
    )
    db.add(student)
    await db.commit()
    await db.refresh(student)
    return student


async def summary(
    client: AsyncClient, headers: dict, class_: Class, query: str = ""
) -> dict:
    """GET the summary, asserting it succeeded, and return the payload."""
    url = f"/api/classes/{class_.id}/attendance/summary"
    response = await client.get(f"{url}?{query}" if query else url, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def names(payload: dict) -> list[str]:
    return [item["student_name"] for item in payload["items"]]


@pytest.mark.asyncio
class TestLegacyCutoff:
    """AC-1, AC-2, AC-3: who the cutoff hides, and on which date."""

    async def test_first_attendance_over_five_years_ago_is_hidden(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_class: Class,
        db: AsyncSession,
    ):
        """AC-1: a student whose first attendance is older than five years is absent."""
        await student_with_attendance(db, test_class, "Vanha Opiskelija", years_ago(6))
        await student_with_attendance(db, test_class, "Uusi Opiskelija", years_ago(0.5))

        payload = await summary(client, auth_headers, test_class)

        assert names(payload) == ["Uusi Opiskelija"]
        assert payload["total"] == 1
        assert payload["legacy_hidden"] == 1

    async def test_first_attendance_decides_even_when_still_attending(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_class: Class,
        db: AsyncSession,
    ):
        """
        AC-2: a student who first attended six years ago and attended yesterday is
        still hidden.

        This is the consequence of choosing first attendance over last attendance,
        decided by the Owner on 2026-09-04 and asserted here so it can never arrive as a
        surprise. Reversing that decision starts by watching this test fail.
        """
        await student_with_attendance(
            db,
            test_class,
            "Uskollinen Opiskelija",
            years_ago(6),
            datetime.now(timezone.utc) - timedelta(days=1),
        )

        payload = await summary(client, auth_headers, test_class)

        assert names(payload) == []
        assert payload["legacy_hidden"] == 1

    async def test_recent_first_attendance_is_kept_however_old_the_row_is(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_class: Class,
        db: AsyncSession,
    ):
        """
        AC-1, guarding the date field itself: an old row whose first attendance is
        recent stays visible. Under the replaced created_at cutoff this student
        disappeared.
        """
        student = await student_with_attendance(
            db, test_class, "Vanha Rivi", years_ago(0.25)
        )
        student.created_at = years_ago(6)
        await db.commit()

        payload = await summary(client, auth_headers, test_class)

        assert names(payload) == ["Vanha Rivi"]
        assert payload["legacy_hidden"] == 0

    async def test_student_without_attendance_falls_back_to_created_at(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_class: Class,
        db: AsyncSession,
    ):
        """AC-3: no records means the creation date decides, in both directions."""
        await student_without_attendance(
            db, test_class, "Vanha Kirjaus", years_ago(6)
        )
        await student_without_attendance(
            db, test_class, "Tuore Kirjaus", years_ago(0.1)
        )

        payload = await summary(client, auth_headers, test_class)

        assert names(payload) == ["Tuore Kirjaus"]
        assert payload["legacy_hidden"] == 1


def test_the_window_is_five_years():
    """
    Asserted against a literal, not against LEGACY_WINDOW itself — a test that derives the
    expectation from the constant moves with it and proves nothing.

    Sync, and deliberately outside the class below, which carries the asyncio mark.
    """
    assert attendance_service.LEGACY_WINDOW == timedelta(days=5 * 365)


@pytest.mark.asyncio
class TestTheWindowIsFiveYears:
    """
    The cutoff's own number, which the other tests in this file deliberately do not pin.

    Every other case here sits years away from the line, so the window could be changed to
    anything between a few months and six years without a single failure. These two, with
    the literal above, fix it: one either side of the boundary.
    """

    async def test_a_student_a_day_past_the_line_is_hidden(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_class: Class,
        db: AsyncSession,
    ):
        just_over = datetime.now(timezone.utc) - timedelta(days=5 * 365) - timedelta(days=1)
        await student_with_attendance(db, test_class, "Rajan Takaa", just_over)

        payload = await summary(client, auth_headers, test_class)

        assert names(payload) == []
        assert payload["legacy_hidden"] == 1

    async def test_a_student_a_day_inside_the_line_is_kept(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_class: Class,
        db: AsyncSession,
    ):
        just_under = datetime.now(timezone.utc) - timedelta(days=5 * 365) + timedelta(days=1)
        await student_with_attendance(db, test_class, "Rajan Sisalta", just_under)

        payload = await summary(client, auth_headers, test_class)

        assert names(payload) == ["Rajan Sisalta"]
        assert payload["legacy_hidden"] == 0


@pytest.mark.asyncio
class TestRevealingLegacyStudents:
    """AC-4: legacy=true, and what legacy_hidden counts."""

    async def test_legacy_true_returns_every_student(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_class: Class,
        db: AsyncSession,
    ):
        await student_with_attendance(db, test_class, "Vanha Opiskelija", years_ago(6))
        await student_with_attendance(db, test_class, "Uusi Opiskelija", years_ago(0.5))

        payload = await summary(client, auth_headers, test_class, "legacy=true")

        assert sorted(names(payload)) == ["Uusi Opiskelija", "Vanha Opiskelija"]
        assert payload["total"] == 2
        assert payload["legacy_hidden"] == 0

    async def test_legacy_false_hides_the_same_students_as_the_default(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_class: Class,
        db: AsyncSession,
    ):
        await student_with_attendance(db, test_class, "Vanha Opiskelija", years_ago(6))

        default = await summary(client, auth_headers, test_class)
        explicit = await summary(client, auth_headers, test_class, "legacy=false")

        assert names(default) == names(explicit) == []
        assert default["legacy_hidden"] == explicit["legacy_hidden"] == 1

    async def test_hidden_count_follows_the_active_search(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_class: Class,
        db: AsyncSession,
    ):
        """
        AC-4: searching a legacy student returns an empty page whose hidden count
        explains the emptiness, rather than counting every legacy student in the class.
        """
        await student_with_attendance(db, test_class, "Matti Virtanen", years_ago(6))
        await student_with_attendance(db, test_class, "Liisa Korhonen", years_ago(6))
        await student_with_attendance(db, test_class, "Matti Nieminen", years_ago(0.5))

        hidden_everywhere = await summary(client, auth_headers, test_class)
        assert hidden_everywhere["legacy_hidden"] == 2

        searched = await summary(client, auth_headers, test_class, "search=virtanen")
        assert names(searched) == []
        assert searched["total"] == 0
        assert searched["legacy_hidden"] == 1

        revealed = await summary(
            client, auth_headers, test_class, "search=virtanen&legacy=true"
        )
        assert names(revealed) == ["Matti Virtanen"]
        assert revealed["legacy_hidden"] == 0

    async def test_hidden_students_do_not_consume_a_page(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_class: Class,
        db: AsyncSession,
    ):
        """Pagination counts what is shown, so a hidden student leaves no gap."""
        await student_with_attendance(db, test_class, "Vanha Yksi", years_ago(6))
        await student_with_attendance(db, test_class, "Vanha Kaksi", years_ago(7))
        await student_with_attendance(db, test_class, "Uusi Yksi", years_ago(0.5))
        await student_with_attendance(db, test_class, "Uusi Kaksi", years_ago(0.5))

        payload = await summary(
            client, auth_headers, test_class, "skip=0&limit=2&sort_by=name_asc"
        )

        assert names(payload) == ["Uusi Kaksi", "Uusi Yksi"]
        assert payload["total"] == 2
        assert payload["legacy_hidden"] == 2


@pytest.mark.asyncio
class TestNothingIsHiddenToday:
    """AC-5: against data no older than the app, the cutoff is a no-op."""

    async def test_ordinary_data_hides_nobody(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_class: Class,
        test_attendance: AttendanceRecord,
    ):
        payload = await summary(client, auth_headers, test_class)

        assert payload["legacy_hidden"] == 0
        assert payload["total"] == len(payload["items"]) == 1

    async def test_a_class_with_no_students_reports_nothing_hidden(
        self, client: AsyncClient, auth_headers: dict, test_class: Class
    ):
        payload = await summary(client, auth_headers, test_class)

        assert payload["items"] == []
        assert payload["total"] == 0
        assert payload["legacy_hidden"] == 0


def query_parameters(path: str) -> set[str]:
    """
    The query parameters a route declares, read from the app's own OpenAPI document.

    Taken from the app rather than GET /openapi.json because the docs sit behind HTTP
    Basic auth whenever ENVIRONMENT is not development, and this asserts the contract,
    not the docs' protection.
    """
    from app.main import app

    return {p["name"] for p in app.openapi()["paths"][path]["get"]["parameters"]}


@pytest.mark.asyncio
class TestTheOldCopyOfTheRuleIsGone:
    """AC-8: one endpoint decides who is legacy, and it is the summary."""

    async def test_records_endpoint_declares_no_legacy_parameter(self):
        """
        FastAPI ignores unknown query parameters, so the proof is the contract rather
        than a rejected request: the records route must no longer declare `legacy`.
        """
        assert "legacy" not in query_parameters("/api/classes/{class_id}/attendance")

    async def test_summary_endpoint_declares_the_legacy_parameter(self):
        assert "legacy" in query_parameters(
            "/api/classes/{class_id}/attendance/summary"
        )

    async def test_records_endpoint_lists_every_student(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_class: Class,
        db: AsyncSession,
    ):
        """The records list no longer filters anyone out, whatever their age."""
        await student_with_attendance(db, test_class, "Vanha Opiskelija", years_ago(6))
        await student_with_attendance(db, test_class, "Uusi Opiskelija", years_ago(0.5))

        response = await client.get(
            f"/api/classes/{test_class.id}/attendance", headers=auth_headers
        )

        assert response.status_code == 200
        assert response.json()["total"] == 2
