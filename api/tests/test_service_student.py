"""Direct tests for student service functions.

The missing fourth: `test_service_attendance.py`, `test_service_auth.py` and
`test_service_class.py` already exist, and `student_service.py` is the largest service in `app/`
at 549 lines and nine functions. It sat at 29% coverage on 2026-09-01 — the lowest in the
codebase — while `test_students.py` exercised the routes above it.

Two functions get the most attention here because they are the two that destroy data:

- `delete_student` **cascades**, so deleting a Student destroys their whole attendance history.
  `INVARIANTS.md` records that as a decision rather than a bug: the school holds the credit and
  this app is a tally sheet. A decision that costs history deserves a test that proves the
  cascade actually happens, and that it stops at the Student it was aimed at.
- `merge_students` is **irreversible**. It reassigns every attendance record, ORs the course
  credit, and deletes the duplicate. The test that matters is not that it returns a Student but
  that **no attendance record is lost**, which is asserted by counting before and after.

Every function that reaches a Class is also tested from the denied side as `other_teacher`, since
`class_service.verify_class_ownership` is the single enforcement site for INV-1 and each of these
functions calls it.
"""

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import (
    BadRequestException,
    ForbiddenException,
    NotFoundError,
)
from app.models.attendance import AttendanceRecord
from app.models.class_ import Class
from app.models.student import Student
from app.models.user import User
from app.schemas.student import StudentCreate, StudentUpdate
from app.services import student_service


async def add_attendance(
    db: AsyncSession, student: Student, count: int = 1
) -> list[AttendanceRecord]:
    """Give `student` `count` attendance records, one per day, newest last."""
    base = datetime.now(timezone.utc) - timedelta(days=count)
    records = [
        AttendanceRecord(
            class_id=student.class_id,
            student_id=student.id,
            timestamp=base + timedelta(days=i),
        )
        for i in range(count)
    ]
    db.add_all(records)
    await db.commit()
    return records


async def count_attendance(db: AsyncSession, student_id) -> int:
    """How many attendance records exist for one Student, read straight from the table."""
    result = await db.execute(
        select(func.count(AttendanceRecord.id)).where(
            AttendanceRecord.student_id == student_id
        )
    )
    return result.scalar() or 0


async def make_student(
    db: AsyncSession, class_obj: Class, name: str, credit: bool = False
) -> Student:
    """A Student in `class_obj`, with the name given verbatim — no normalization."""
    student = Student(name=name, class_id=class_obj.id, course_credit_received=credit)
    db.add(student)
    await db.commit()
    await db.refresh(student)
    return student


async def make_class(db: AsyncSession, teacher: User, name: str) -> Class:
    """A Class owned by `teacher`."""
    class_obj = Class(name=name, teacher_id=teacher.id, active=True)
    db.add(class_obj)
    await db.commit()
    await db.refresh(class_obj)
    return class_obj


class TestNormalizeName:
    """Tests for normalize_name — the one pure function here, and no database in sight."""

    @pytest.mark.parametrize(
        ("raw", "expected"),
        [
            ("john doe", "John Doe"),
            ("MARY JANE", "Mary Jane"),
            ("  alice  cooper  ", "Alice Cooper"),
            ("jOhN dOe", "John Doe"),
            ("väinö", "Väinö"),
            ("liisa", "Liisa"),
            ("", ""),
            ("   ", ""),
            ("\t\n", ""),
        ],
    )
    def test_normalizes(self, raw: str, expected: str):
        """Title Case, whitespace collapsed, and empty stays empty."""
        assert student_service.normalize_name(raw) == expected

    def test_case_insensitive_forms_collapse_to_one(self):
        """Every casing of a name normalizes to the same string.

        This is what makes the case-insensitive uniqueness index meaningful: the register cannot
        hold "John Doe" and "john doe" as two Students, and this is why.
        """
        forms = ["John Doe", "john doe", "JOHN DOE", "jOhN DoE", "  john   doe  "]
        assert {student_service.normalize_name(f) for f in forms} == {"John Doe"}

    def test_a_hyphenated_name_keeps_its_second_half_lowercase(self):
        """Documents a DEFECT rather than blessing it. See REVIEW-DEBT.md, 2026-09-07.

        `str.capitalize()` uppercases the first character and lowercases the rest, so it treats a
        hyphenated name as one word: "aino-kaarina" becomes "Aino-kaarina", not "Aino-Kaarina".
        Double-barrelled first names and surnames are common in Finnish, and this register is
        Finnish — the browser walk's own stress fixture is "Aino-Kaarina Mäkeläinen-Virtanen",
        which this function would store as "Aino-kaarina Mäkeläinen-virtanen".

        Asserted as it behaves, not as it should, because the fix changes how names are *stored*
        and leaves every existing row in the old shape. That is the Owner's decision and it may
        want a migration. Display case does not affect matching: the uniqueness index is on
        `LOWER(name)`, so this is a cosmetic defect on a teacher's screen, not a duplicate-Student
        risk.
        """
        assert (
            student_service.normalize_name("aino-kaarina mäkeläinen-virtanen")
            == "Aino-kaarina Mäkeläinen-virtanen"
        )
        assert student_service.normalize_name("o'brien") == "O'brien"


@pytest.mark.asyncio
class TestGetOrCreateStudent:
    """Tests for get_or_create_student — the function attendance logging runs through."""

    async def test_creates_when_absent(self, db: AsyncSession, test_class: Class):
        """A name nobody has logged before becomes a Student."""
        student = await student_service.get_or_create_student(db, "uusi nimi", test_class.id)

        assert student.id is not None
        assert student.name == "Uusi Nimi"
        assert student.class_id == test_class.id
        assert student.course_credit_received is False

    async def test_returns_the_existing_student(
        self, db: AsyncSession, test_class: Class, test_student: Student
    ):
        """An exact match returns the same row rather than a second one."""
        student = await student_service.get_or_create_student(
            db, test_student.name, test_class.id
        )

        assert student.id == test_student.id

    @pytest.mark.parametrize("form", ["john doe", "JOHN DOE", "jOhN dOe", "  john doe  "])
    async def test_matches_case_insensitively(
        self, db: AsyncSession, test_class: Class, test_student: Student, form: str
    ):
        """Any casing of an existing name finds it — the duplicate-Student bug, closed."""
        student = await student_service.get_or_create_student(db, form, test_class.id)

        assert student.id == test_student.id

    async def test_creates_no_second_row_for_a_known_name(
        self, db: AsyncSession, test_class: Class, test_student: Student
    ):
        """Twenty logins under mixed casing leave exactly one Student."""
        for form in ["john doe", "John Doe", "JOHN DOE", "jOhN DoE"]:
            await student_service.get_or_create_student(db, form, test_class.id)

        result = await db.execute(
            select(func.count(Student.id)).where(Student.class_id == test_class.id)
        )
        assert result.scalar() == 1

    async def test_the_same_name_in_another_class_is_another_student(
        self, db: AsyncSession, test_user: User, test_class: Class, test_student: Student
    ):
        """A Student row belongs to one Class.

        CONTEXT.md's per-Class row model: the same person attending two Kurssit is two Student
        rows, and uniqueness is scoped to the Class rather than the school.
        """
        other_class = await make_class(db, test_user, "Toinen kurssi")

        student = await student_service.get_or_create_student(
            db, test_student.name, other_class.id
        )

        assert student.id != test_student.id
        assert student.class_id == other_class.id

    @pytest.mark.parametrize("blank", ["", "   ", "\t"])
    async def test_refuses_a_blank_name(
        self, db: AsyncSession, test_class: Class, blank: str
    ):
        """A name that normalizes to nothing is refused, not stored."""
        with pytest.raises(BadRequestException):
            await student_service.get_or_create_student(db, blank, test_class.id)

    async def test_does_not_commit_its_own_transaction(
        self, db: AsyncSession, test_class: Class
    ):
        """It flushes; the caller commits.

        The docstring says so, and attendance logging depends on it: a Student created for a
        record that then fails validation must not survive. Asserted by rolling back.
        """
        await student_service.get_or_create_student(db, "katoava nimi", test_class.id)
        await db.rollback()

        result = await db.execute(
            select(Student).where(Student.name == "Katoava Nimi")
        )
        assert result.scalar_one_or_none() is None


@pytest.mark.asyncio
class TestGetStudentById:
    """Tests for get_student_by_id."""

    async def test_returns_the_student(
        self, db: AsyncSession, test_user: User, test_student: Student
    ):
        """The happy path, and total_attendance is attached."""
        student = await student_service.get_student_by_id(db, test_student.id, test_user)

        assert student.id == test_student.id
        assert student.total_attendance == 0

    async def test_counts_only_this_student_s_attendance(
        self, db: AsyncSession, test_user: User, test_class: Class, test_student: Student
    ):
        """total_attendance is per Student, not per Class."""
        await add_attendance(db, test_student, 3)
        someone_else = await make_student(db, test_class, "Toinen Opiskelija")
        await add_attendance(db, someone_else, 5)

        student = await student_service.get_student_by_id(db, test_student.id, test_user)

        assert student.total_attendance == 3

    async def test_missing_student_is_not_found(self, db: AsyncSession, test_user: User):
        """An id nobody owns is a 404, not a 403."""
        with pytest.raises(NotFoundError):
            await student_service.get_student_by_id(db, uuid4(), test_user)

    async def test_another_teacher_is_refused(
        self, db: AsyncSession, other_teacher: User, test_student: Student
    ):
        """INV-1 from the denied side: a real second teacher cannot read this Student."""
        with pytest.raises(ForbiddenException):
            await student_service.get_student_by_id(db, test_student.id, other_teacher)


@pytest.mark.asyncio
class TestListStudentsForClass:
    """Tests for list_students_for_class."""

    async def test_lists_them_by_name(
        self, db: AsyncSession, test_user: User, test_class: Class
    ):
        """Ordered by name ascending, with a total that matches."""
        for name in ["Väinö Virtanen", "Aino Aalto", "Liisa Korhonen"]:
            await make_student(db, test_class, name)

        students, total = await student_service.list_students_for_class(
            db, test_class.id, test_user
        )

        assert total == 3
        assert [s.name for s in students] == ["Aino Aalto", "Liisa Korhonen", "Väinö Virtanen"]

    async def test_an_empty_class_is_empty_and_says_zero(
        self, db: AsyncSession, test_user: User, test_class: Class
    ):
        """The empty register, which is a state DESIGN.md §3 lists."""
        students, total = await student_service.list_students_for_class(
            db, test_class.id, test_user
        )

        assert students == []
        assert total == 0

    async def test_paginates_without_lying_about_the_total(
        self, db: AsyncSession, test_user: User, test_class: Class
    ):
        """`total` is the whole register, not the page.

        This is what the client's pagination reads, so a total scoped to the page would silently
        hide Students.
        """
        for i in range(10):
            await make_student(db, test_class, f"Opiskelija {i:02d}")

        page, total = await student_service.list_students_for_class(
            db, test_class.id, test_user, skip=0, limit=4
        )
        assert total == 10
        assert len(page) == 4

        last, total = await student_service.list_students_for_class(
            db, test_class.id, test_user, skip=8, limit=4
        )
        assert total == 10
        assert len(last) == 2

    async def test_search_is_case_insensitive_and_partial(
        self, db: AsyncSession, test_user: User, test_class: Class
    ):
        """A teacher typing half a name in the wrong case still finds it."""
        await make_student(db, test_class, "Liisa Korhonen")
        await make_student(db, test_class, "Väinö Virtanen")

        found, total = await student_service.list_students_for_class(
            db, test_class.id, test_user, search="KORHO"
        )

        assert total == 1
        assert found[0].name == "Liisa Korhonen"

    async def test_search_that_matches_nothing_returns_nothing(
        self, db: AsyncSession, test_user: User, test_class: Class, test_student: Student
    ):
        """"Ei hakutuloksia" is a real state, and this is the data behind it."""
        found, total = await student_service.list_students_for_class(
            db, test_class.id, test_user, search="ei-ketään"
        )

        assert (found, total) == ([], 0)

    @pytest.mark.parametrize(("credit", "expected"), [(True, "Jane Smith"), (False, "John Doe")])
    async def test_credit_filter_selects_one_side(
        self,
        db: AsyncSession,
        test_user: User,
        test_class: Class,
        test_student: Student,
        test_student_with_credit: Student,
        credit: bool,
        expected: str,
    ):
        """The *Suoritus* filter, both ways."""
        found, total = await student_service.list_students_for_class(
            db, test_class.id, test_user, credit_filter=credit
        )

        assert total == 1
        assert found[0].name == expected

    async def test_no_credit_filter_returns_both(
        self,
        db: AsyncSession,
        test_user: User,
        test_class: Class,
        test_student: Student,
        test_student_with_credit: Student,
    ):
        """`None` means unfiltered — not `False`."""
        _, total = await student_service.list_students_for_class(
            db, test_class.id, test_user, credit_filter=None
        )

        assert total == 2

    async def test_attaches_each_student_s_own_count(
        self, db: AsyncSession, test_user: User, test_class: Class
    ):
        """Every row carries its own tally, which is what the register column shows."""
        quiet = await make_student(db, test_class, "Aino Aalto")
        busy = await make_student(db, test_class, "Väinö Virtanen")
        await add_attendance(db, quiet, 1)
        await add_attendance(db, busy, 7)

        students, _ = await student_service.list_students_for_class(
            db, test_class.id, test_user
        )

        assert {s.name: s.total_attendance for s in students} == {
            "Aino Aalto": 1,
            "Väinö Virtanen": 7,
        }

    async def test_another_teacher_is_refused(
        self, db: AsyncSession, other_teacher: User, test_class: Class
    ):
        """INV-1 from the denied side."""
        with pytest.raises(ForbiddenException):
            await student_service.list_students_for_class(db, test_class.id, other_teacher)

    async def test_a_missing_class_is_not_found(self, db: AsyncSession, test_user: User):
        """The class's absence is reported before its ownership is considered."""
        with pytest.raises(NotFoundError):
            await student_service.list_students_for_class(db, uuid4(), test_user)


@pytest.mark.asyncio
class TestCreateStudent:
    """Tests for create_student — the one route no screen calls (DESIGN.md §1)."""

    async def test_creates_and_normalizes(
        self, db: AsyncSession, test_user: User, test_class: Class
    ):
        """The name is stored normalized, and the tally starts at zero."""
        student = await student_service.create_student(
            db, test_class.id, StudentCreate(name="uusi  opiskelija"), test_user
        )

        assert student.name == "Uusi Opiskelija"
        assert student.total_attendance == 0
        assert student.course_credit_received is False

    async def test_honours_the_credit_flag(
        self, db: AsyncSession, test_user: User, test_class: Class
    ):
        """A Student can be created already credited."""
        student = await student_service.create_student(
            db,
            test_class.id,
            StudentCreate(name="Valmis Opiskelija", course_credit_received=True),
            test_user,
        )

        assert student.course_credit_received is True

    @pytest.mark.parametrize("form", ["John Doe", "john doe", "JOHN DOE"])
    async def test_refuses_a_duplicate_in_any_casing(
        self,
        db: AsyncSession,
        test_user: User,
        test_class: Class,
        test_student: Student,
        form: str,
    ):
        """Case-insensitive uniqueness, refused at the service and not only at the index."""
        with pytest.raises(BadRequestException):
            await student_service.create_student(
                db, test_class.id, StudentCreate(name=form), test_user
            )

    async def test_the_same_name_in_another_class_is_allowed(
        self, db: AsyncSession, test_user: User, test_student: Student
    ):
        """Uniqueness is scoped to the Class."""
        other_class = await make_class(db, test_user, "Toinen kurssi")

        student = await student_service.create_student(
            db, other_class.id, StudentCreate(name=test_student.name), test_user
        )

        assert student.id != test_student.id

    async def test_refuses_a_name_that_normalizes_to_nothing(
        self, db: AsyncSession, test_user: User, test_class: Class
    ):
        """The schema's min_length=1 lets a single space through; the service does not.

        `StudentCreate(name=" ")` is valid Pydantic — one character — and normalizes to the
        empty string, so this branch is reachable from the route and not only from here.
        """
        with pytest.raises(BadRequestException):
            await student_service.create_student(
                db, test_class.id, StudentCreate(name="   "), test_user
            )

    async def test_another_teacher_is_refused(
        self, db: AsyncSession, other_teacher: User, test_class: Class
    ):
        """INV-1 from the denied side."""
        with pytest.raises(ForbiddenException):
            await student_service.create_student(
                db, test_class.id, StudentCreate(name="Ei Saa"), other_teacher
            )

    async def test_a_refused_creation_stores_nothing(
        self, db: AsyncSession, other_teacher: User, test_class: Class
    ):
        """The refusal is not cosmetic: no row is left behind."""
        with pytest.raises(ForbiddenException):
            await student_service.create_student(
                db, test_class.id, StudentCreate(name="Ei Saa"), other_teacher
            )

        result = await db.execute(select(Student).where(Student.name == "Ei Saa"))
        assert result.scalar_one_or_none() is None


@pytest.mark.asyncio
class TestUpdateStudent:
    """Tests for update_student — rename and the *Suoritus* tick."""

    async def test_renames(self, db: AsyncSession, test_user: User, test_student: Student):
        """A rename normalizes too."""
        student = await student_service.update_student(
            db, test_student.id, StudentUpdate(name="uusi  nimi"), test_user
        )

        assert student.name == "Uusi Nimi"

    async def test_sets_the_credit(
        self, db: AsyncSession, test_user: User, test_student: Student
    ):
        """The tick the teacher makes by hand."""
        student = await student_service.update_student(
            db, test_student.id, StudentUpdate(course_credit_received=True), test_user
        )

        assert student.course_credit_received is True

    async def test_a_rename_leaves_the_credit_alone(
        self, db: AsyncSession, test_user: User, test_student_with_credit: Student
    ):
        """A partial update touches only what it names."""
        student = await student_service.update_student(
            db, test_student_with_credit.id, StudentUpdate(name="Uusi Nimi"), test_user
        )

        assert student.name == "Uusi Nimi"
        assert student.course_credit_received is True

    async def test_a_credit_change_leaves_the_name_alone(
        self, db: AsyncSession, test_user: User, test_student: Student
    ):
        """The other half of the same rule."""
        original = test_student.name

        student = await student_service.update_student(
            db, test_student.id, StudentUpdate(course_credit_received=True), test_user
        )

        assert student.name == original

    async def test_renaming_to_a_name_already_in_the_class_is_refused(
        self,
        db: AsyncSession,
        test_user: User,
        test_student: Student,
        test_student_with_credit: Student,
    ):
        """The conflict the client answers by offering a merge."""
        with pytest.raises(BadRequestException):
            await student_service.update_student(
                db,
                test_student.id,
                StudentUpdate(name=test_student_with_credit.name.lower()),
                test_user,
            )

    async def test_renaming_a_student_to_its_own_name_is_allowed(
        self, db: AsyncSession, test_user: User, test_student: Student
    ):
        """The duplicate check excludes the row being renamed.

        Without that exclusion, fixing the casing of a name would collide with itself.
        """
        student = await student_service.update_student(
            db, test_student.id, StudentUpdate(name="john doe"), test_user
        )

        assert student.id == test_student.id
        assert student.name == "John Doe"

    async def test_refuses_a_name_that_normalizes_to_nothing(
        self, db: AsyncSession, test_user: User, test_student: Student
    ):
        """Same reachable branch as on create."""
        with pytest.raises(BadRequestException):
            await student_service.update_student(
                db, test_student.id, StudentUpdate(name="   "), test_user
            )

    async def test_carries_the_attendance_count_back(
        self, db: AsyncSession, test_user: User, test_student: Student
    ):
        """The response feeds a register row, so it needs the tally."""
        await add_attendance(db, test_student, 4)

        student = await student_service.update_student(
            db, test_student.id, StudentUpdate(course_credit_received=True), test_user
        )

        assert student.total_attendance == 4

    async def test_a_missing_student_is_not_found(self, db: AsyncSession, test_user: User):
        """A 404 before any ownership question."""
        with pytest.raises(NotFoundError):
            await student_service.update_student(
                db, uuid4(), StudentUpdate(name="Kukaan"), test_user
            )

    async def test_another_teacher_is_refused(
        self, db: AsyncSession, other_teacher: User, test_student: Student
    ):
        """INV-1 from the denied side."""
        with pytest.raises(ForbiddenException):
            await student_service.update_student(
                db, test_student.id, StudentUpdate(name="Ei Saa"), other_teacher
            )

    async def test_a_refused_rename_changes_nothing(
        self, db: AsyncSession, other_teacher: User, test_student: Student
    ):
        """The name on the row is untouched after the refusal.

        The ids are captured before the assertion and the session expired rather than rolled
        back. `verify_class_ownership` raises before any attribute is touched, so there is nothing
        to roll back — and a rollback here expires every loaded instance, after which reading
        `test_student.id` is lazy IO outside a greenlet and raises `MissingGreenlet` instead of
        the assertion failing honestly.
        """
        student_id = test_student.id
        original = test_student.name

        with pytest.raises(ForbiddenException):
            await student_service.update_student(
                db, student_id, StudentUpdate(name="Ei Saa"), other_teacher
            )

        db.expire_all()
        result = await db.execute(select(Student).where(Student.id == student_id))
        assert result.scalar_one().name == original


@pytest.mark.asyncio
class TestDeleteStudent:
    """Tests for delete_student — which destroys attendance history, by decision.

    `INVARIANTS.md`, *Deliberately not invariants*: deleting a Student may destroy their whole
    history, because the school holds the credit and this app is a tally sheet. These tests exist
    so that decision stays a decision rather than becoming a surprise.
    """

    async def test_deletes_the_student(
        self, db: AsyncSession, test_user: User, test_student: Student
    ):
        """The row is gone."""
        await student_service.delete_student(db, test_student.id, test_user)

        result = await db.execute(select(Student).where(Student.id == test_student.id))
        assert result.scalar_one_or_none() is None

    async def test_the_cascade_destroys_their_attendance(
        self, db: AsyncSession, test_user: User, test_student: Student
    ):
        """Twelve records, and after the delete there are none.

        This is the irreversible half. If the cascade ever stops working the records become
        orphans pointing at a Student that no longer exists, which is worse than either outcome.
        """
        await add_attendance(db, test_student, 12)
        assert await count_attendance(db, test_student.id) == 12

        await student_service.delete_student(db, test_student.id, test_user)

        assert await count_attendance(db, test_student.id) == 0

    async def test_the_cascade_stops_at_the_student_it_was_aimed_at(
        self, db: AsyncSession, test_user: User, test_class: Class, test_student: Student
    ):
        """The rest of the register survives, records and all."""
        keeper = await make_student(db, test_class, "Säilyvä Opiskelija")
        await add_attendance(db, test_student, 3)
        await add_attendance(db, keeper, 5)

        await student_service.delete_student(db, test_student.id, test_user)

        assert await count_attendance(db, keeper.id) == 5
        result = await db.execute(select(Student).where(Student.id == keeper.id))
        assert result.scalar_one_or_none() is not None

    async def test_a_missing_student_is_not_found(self, db: AsyncSession, test_user: User):
        """Deleting nothing is a 404, not a silent success."""
        with pytest.raises(NotFoundError):
            await student_service.delete_student(db, uuid4(), test_user)

    async def test_another_teacher_is_refused(
        self, db: AsyncSession, other_teacher: User, test_student: Student
    ):
        """INV-1 from the denied side, on the most destructive call in the service."""
        with pytest.raises(ForbiddenException):
            await student_service.delete_student(db, test_student.id, other_teacher)

    async def test_a_refused_delete_destroys_nothing(
        self, db: AsyncSession, other_teacher: User, test_student: Student
    ):
        """The Student and every record are still there afterwards."""
        await add_attendance(db, test_student, 4)
        student_id = test_student.id

        with pytest.raises(ForbiddenException):
            await student_service.delete_student(db, student_id, other_teacher)

        db.expire_all()
        result = await db.execute(select(Student).where(Student.id == student_id))
        assert result.scalar_one_or_none() is not None
        assert await count_attendance(db, student_id) == 4


@pytest.mark.asyncio
class TestGetAutocompleteSuggestions:
    """Tests for get_autocomplete_suggestions — the core loop's name field."""

    @pytest.mark.parametrize("query", ["", "a", " "])
    async def test_under_two_characters_returns_nothing(
        self,
        db: AsyncSession,
        test_user: User,
        test_class: Class,
        test_student: Student,
        query: str,
    ):
        """The client waits for two characters and so does the server."""
        assert (
            await student_service.get_autocomplete_suggestions(
                db, test_class.id, query, test_user
            )
            == []
        )

    async def test_orders_by_attendance_then_by_name(
        self, db: AsyncSession, test_user: User, test_class: Class
    ):
        """Frequency first, because the teacher's next Student is usually a frequent one.

        DESIGN.md §2 makes this ordering part of the core loop rather than an incidental sort.
        """
        busy = await make_student(db, test_class, "Testi Busy")
        quiet = await make_student(db, test_class, "Testi Quiet")
        never = await make_student(db, test_class, "Testi Aaltonen")
        await add_attendance(db, busy, 9)
        await add_attendance(db, quiet, 2)

        suggestions = await student_service.get_autocomplete_suggestions(
            db, test_class.id, "testi", test_user
        )

        assert [s["name"] for s in suggestions] == [busy.name, quiet.name, never.name]
        assert [s["total_attendance"] for s in suggestions] == [9, 2, 0]

    async def test_ties_break_by_name(
        self, db: AsyncSession, test_user: User, test_class: Class
    ):
        """Two Students with the same tally come out alphabetically, not arbitrarily."""
        await make_student(db, test_class, "Testi Zeta")
        await make_student(db, test_class, "Testi Alfa")

        suggestions = await student_service.get_autocomplete_suggestions(
            db, test_class.id, "testi", test_user
        )

        assert [s["name"] for s in suggestions] == ["Testi Alfa", "Testi Zeta"]

    async def test_matches_case_insensitively_and_partially(
        self, db: AsyncSession, test_user: User, test_class: Class, test_student: Student
    ):
        """"OHN d" finds "John Doe"."""
        suggestions = await student_service.get_autocomplete_suggestions(
            db, test_class.id, "OHN d", test_user
        )

        assert [s["name"] for s in suggestions] == ["John Doe"]

    async def test_respects_the_limit(
        self, db: AsyncSession, test_user: User, test_class: Class
    ):
        """A long register does not return itself to a dropdown."""
        for i in range(8):
            await make_student(db, test_class, f"Testi Numero {i}")

        suggestions = await student_service.get_autocomplete_suggestions(
            db, test_class.id, "testi", test_user, limit=3
        )

        assert len(suggestions) == 3

    async def test_never_suggests_another_class_s_students(
        self, db: AsyncSession, test_user: User, test_class: Class
    ):
        """Scoped to the Kurssi, so one Kurssi's register cannot leak into another's dropdown."""
        other_class = await make_class(db, test_user, "Toinen kurssi")
        await make_student(db, other_class, "Testi Toisesta")
        await make_student(db, test_class, "Testi Tästä")

        suggestions = await student_service.get_autocomplete_suggestions(
            db, test_class.id, "testi", test_user
        )

        assert [s["name"] for s in suggestions] == ["Testi Tästä"]

    async def test_another_teacher_is_refused(
        self, db: AsyncSession, other_teacher: User, test_class: Class
    ):
        """INV-1 from the denied side — a dropdown is a read of the register."""
        with pytest.raises(ForbiddenException):
            await student_service.get_autocomplete_suggestions(
                db, test_class.id, "testi", other_teacher
            )


@pytest.mark.asyncio
class TestMergeStudents:
    """Tests for merge_students — irreversible, so the tests are about what must not be lost."""

    async def test_transfers_every_attendance_record(
        self, db: AsyncSession, test_user: User, test_class: Class
    ):
        """The whole point: the duplicate's records become the target's."""
        target = await make_student(db, test_class, "Liisa Korhonen")
        duplicate = await make_student(db, test_class, "liisa  korhonen ")
        await add_attendance(db, target, 3)
        await add_attendance(db, duplicate, 4)

        merged = await student_service.merge_students(
            db, target.id, duplicate.id, test_user
        )

        assert merged.id == target.id
        assert await count_attendance(db, target.id) == 7
        assert merged.total_attendance == 7

    async def test_loses_no_attendance_record_at_all(
        self, db: AsyncSession, test_user: User, test_class: Class
    ):
        """Counted across the whole table, before and after.

        The per-Student assertion above would still pass if a record were dropped *and* the
        transfer miscounted in the same direction. This one cannot: it counts every record in the
        table, so a merge that destroys history fails here even if both Students look right.
        """
        target = await make_student(db, test_class, "Liisa Korhonen")
        duplicate = await make_student(db, test_class, "Liisa Korhola")
        bystander = await make_student(db, test_class, "Väinö Virtanen")
        await add_attendance(db, target, 2)
        await add_attendance(db, duplicate, 5)
        await add_attendance(db, bystander, 3)

        before = (await db.execute(select(func.count(AttendanceRecord.id)))).scalar()

        await student_service.merge_students(db, target.id, duplicate.id, test_user)

        after = (await db.execute(select(func.count(AttendanceRecord.id)))).scalar()
        assert after == before == 10
        assert await count_attendance(db, bystander.id) == 3

    async def test_deletes_the_duplicate(
        self, db: AsyncSession, test_user: User, test_class: Class
    ):
        """One Student is left where there were two."""
        target = await make_student(db, test_class, "Liisa Korhonen")
        duplicate = await make_student(db, test_class, "Liisa Korhola")

        await student_service.merge_students(db, target.id, duplicate.id, test_user)

        result = await db.execute(select(Student).where(Student.id == duplicate.id))
        assert result.scalar_one_or_none() is None

    @pytest.mark.parametrize(
        ("target_credit", "duplicate_credit", "expected"),
        [
            (False, True, True),
            (True, False, True),
            (True, True, True),
            (False, False, False),
        ],
    )
    async def test_course_credit_is_ored(
        self,
        db: AsyncSession,
        test_user: User,
        test_class: Class,
        target_credit: bool,
        duplicate_credit: bool,
        expected: bool,
    ):
        """A credit earned under either name survives the merge.

        The OR is the safe direction: a teacher who ticked *Suoritus* on the duplicate row did so
        deliberately, and a merge must not quietly take it back.
        """
        target = await make_student(db, test_class, "Liisa Korhonen", credit=target_credit)
        duplicate = await make_student(db, test_class, "Liisa Korhola", credit=duplicate_credit)

        merged = await student_service.merge_students(
            db, target.id, duplicate.id, test_user
        )

        assert merged.course_credit_received is expected

    async def test_merging_a_student_with_itself_is_refused(
        self, db: AsyncSession, test_user: User, test_student: Student
    ):
        """Otherwise the delete at the end would destroy the Student it just merged into."""
        with pytest.raises(BadRequestException):
            await student_service.merge_students(
                db, test_student.id, test_student.id, test_user
            )

    async def test_merging_across_classes_is_refused(
        self, db: AsyncSession, test_user: User, test_class: Class, test_student: Student
    ):
        """A Student row belongs to one Kurssi, so a cross-Kurssi merge has no meaning."""
        other_class = await make_class(db, test_user, "Toinen kurssi")
        elsewhere = await make_student(db, other_class, "John Doe")

        with pytest.raises(BadRequestException):
            await student_service.merge_students(
                db, test_student.id, elsewhere.id, test_user
            )

    async def test_a_refused_cross_class_merge_moves_nothing(
        self, db: AsyncSession, test_user: User, test_class: Class, test_student: Student
    ):
        """Both Students and both histories are intact after the refusal."""
        other_class = await make_class(db, test_user, "Toinen kurssi")
        elsewhere = await make_student(db, other_class, "John Doe")
        await add_attendance(db, test_student, 2)
        await add_attendance(db, elsewhere, 3)
        target_id, elsewhere_id = test_student.id, elsewhere.id

        with pytest.raises(BadRequestException):
            await student_service.merge_students(db, target_id, elsewhere_id, test_user)

        db.expire_all()
        assert await count_attendance(db, target_id) == 2
        assert await count_attendance(db, elsewhere_id) == 3

    async def test_a_missing_target_is_not_found(
        self, db: AsyncSession, test_user: User, test_student: Student
    ):
        """The target is looked up first."""
        with pytest.raises(NotFoundError):
            await student_service.merge_students(db, uuid4(), test_student.id, test_user)

    async def test_a_missing_duplicate_is_not_found(
        self, db: AsyncSession, test_user: User, test_student: Student
    ):
        """And the duplicate second."""
        with pytest.raises(NotFoundError):
            await student_service.merge_students(db, test_student.id, uuid4(), test_user)

    async def test_another_teacher_is_refused(
        self, db: AsyncSession, other_teacher: User, test_class: Class, test_student: Student
    ):
        """INV-1 from the denied side, on the irreversible call."""
        duplicate = await make_student(db, test_class, "John Doh")

        with pytest.raises(ForbiddenException):
            await student_service.merge_students(
                db, test_student.id, duplicate.id, other_teacher
            )

    async def test_a_refused_merge_destroys_nothing(
        self, db: AsyncSession, other_teacher: User, test_class: Class, test_student: Student
    ):
        """Both Students survive a refusal, with their records."""
        duplicate = await make_student(db, test_class, "John Doh")
        await add_attendance(db, test_student, 2)
        await add_attendance(db, duplicate, 3)
        target_id, duplicate_id = test_student.id, duplicate.id

        with pytest.raises(ForbiddenException):
            await student_service.merge_students(db, target_id, duplicate_id, other_teacher)

        db.expire_all()
        result = await db.execute(select(Student).where(Student.id == duplicate_id))
        assert result.scalar_one_or_none() is not None
        assert await count_attendance(db, target_id) == 2
        assert await count_attendance(db, duplicate_id) == 3
