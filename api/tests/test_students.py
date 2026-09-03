"""Tests for student management endpoints."""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.student import Student


@pytest.mark.asyncio
class TestListStudents:
    """Tests for GET /classes/{id}/students"""

    async def test_list_students_success(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_class,
        test_student,
        test_student_with_credit,
    ):
        """Test listing students for a class."""
        response = await client.get(
            f"/api/classes/{test_class.id}/students",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert "total" in data
        assert data["total"] >= 2
        assert len(data["items"]) >= 2

        # Check student structure
        student = data["items"][0]
        assert "id" in student
        assert "name" in student
        assert "class_id" in student
        assert "course_credit_received" in student
        assert "total_attendance" in student

    async def test_list_students_with_pagination(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_class,
        test_student,
        test_student_with_credit,
    ):
        """Test pagination works correctly."""
        response = await client.get(
            f"/api/classes/{test_class.id}/students?skip=0&limit=1",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) == 1
        assert data["total"] >= 2
        assert data["skip"] == 0
        assert data["limit"] == 1

    async def test_list_students_with_search(
        self, client: AsyncClient, auth_headers: dict, test_class, test_student
    ):
        """Test searching students by name."""
        response = await client.get(
            f"/api/classes/{test_class.id}/students?search=John",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["total"] >= 1
        assert "john" in data["items"][0]["name"].lower()

    async def test_list_students_with_credit_filter(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_class,
        test_student,
        test_student_with_credit,
    ):
        """Test filtering students by course credit received."""
        # Filter for students WITH course credit
        response = await client.get(
            f"/api/classes/{test_class.id}/students?credit_filter=true",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["total"] >= 1
        assert all(item["course_credit_received"] for item in data["items"])

        # Filter for students WITHOUT course credit
        response = await client.get(
            f"/api/classes/{test_class.id}/students?credit_filter=false",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["total"] >= 1
        assert all(not item["course_credit_received"] for item in data["items"])

    async def test_list_students_unauthorized(
        self, client: AsyncClient, test_class
    ):
        """Test listing students without authentication fails."""
        response = await client.get(f"/api/classes/{test_class.id}/students")

        assert response.status_code == 401

    async def test_list_students_wrong_teacher(
        self, client: AsyncClient, auth_headers: dict, db: AsyncSession, test_user
    ):
        """Test cannot list students from another teacher's class."""
        from app.models.class_ import Class
        from app.models.user import User
        from app.core.security import hash_password

        # Create another teacher and their class
        other_teacher = User(
            email="other@example.com",
            password_hash=hash_password("password"),
            active=True,
        )
        db.add(other_teacher)
        await db.commit()
        await db.refresh(other_teacher)

        other_class = Class(
            name="Other Class",
            teacher_id=other_teacher.id,
            active=True,
        )
        db.add(other_class)
        await db.commit()
        await db.refresh(other_class)

        response = await client.get(
            f"/api/classes/{other_class.id}/students",
            headers=auth_headers,
        )

        assert response.status_code == 403


@pytest.mark.asyncio
class TestCreateStudent:
    """Tests for POST /classes/{id}/students"""

    async def test_create_student_success(
        self, client: AsyncClient, auth_headers: dict, test_class
    ):
        """Test creating a new student."""
        student_data = {
            "name": "Alice Johnson",
            "course_credit_received": False,
        }

        response = await client.post(
            f"/api/classes/{test_class.id}/students",
            json=student_data,
            headers=auth_headers,
        )

        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Alice Johnson"
        assert data["course_credit_received"] is False
        assert data["class_id"] == str(test_class.id)
        assert data["total_attendance"] == 0

    async def test_create_student_normalizes_name(
        self, client: AsyncClient, auth_headers: dict, test_class
    ):
        """Test that student names are normalized."""
        student_data = {
            "name": "alice   JOHNSON",
            "course_credit_received": False,
        }

        response = await client.post(
            f"/api/classes/{test_class.id}/students",
            json=student_data,
            headers=auth_headers,
        )

        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Alice Johnson"

    async def test_create_student_duplicate_name(
        self, client: AsyncClient, auth_headers: dict, test_class, test_student
    ):
        """Test creating student with duplicate name fails."""
        student_data = {
            "name": "john doe",  # Lowercase, should match "John Doe"
            "course_credit_received": False,
        }

        response = await client.post(
            f"/api/classes/{test_class.id}/students",
            json=student_data,
            headers=auth_headers,
        )

        assert response.status_code == 400
        assert "already exists" in response.json()["detail"].lower()

    async def test_create_student_empty_name(
        self, client: AsyncClient, auth_headers: dict, test_class
    ):
        """Test creating student with empty name fails."""
        student_data = {
            "name": "   ",
            "course_credit_received": False,
        }

        response = await client.post(
            f"/api/classes/{test_class.id}/students",
            json=student_data,
            headers=auth_headers,
        )

        assert response.status_code == 400

    async def test_create_student_with_credit(
        self, client: AsyncClient, auth_headers: dict, test_class
    ):
        """Test creating student with course credit received."""
        student_data = {
            "name": "Bob Smith",
            "course_credit_received": True,
        }

        response = await client.post(
            f"/api/classes/{test_class.id}/students",
            json=student_data,
            headers=auth_headers,
        )

        assert response.status_code == 201
        data = response.json()
        assert data["course_credit_received"] is True


@pytest.mark.asyncio
class TestGetStudent:
    """Tests for GET /students/{id}"""

    async def test_get_student_success(
        self, client: AsyncClient, auth_headers: dict, test_student
    ):
        """Test getting a student by ID."""
        response = await client.get(
            f"/api/students/{test_student.id}",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == str(test_student.id)
        assert data["name"] == test_student.name
        assert "total_attendance" in data

    async def test_get_student_not_found(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test getting non-existent student returns 404."""
        import uuid

        fake_id = uuid.uuid4()
        response = await client.get(
            f"/api/students/{fake_id}",
            headers=auth_headers,
        )

        assert response.status_code == 404

    async def test_get_student_unauthorized(self, client: AsyncClient, test_student):
        """Test getting student without auth fails."""
        response = await client.get(f"/api/students/{test_student.id}")

        assert response.status_code == 401


@pytest.mark.asyncio
class TestUpdateStudent:
    """Tests for PUT /students/{id}"""

    async def test_update_student_name(
        self, client: AsyncClient, auth_headers: dict, test_student
    ):
        """Test updating student name."""
        update_data = {"name": "John Updated Doe"}

        response = await client.put(
            f"/api/students/{test_student.id}",
            json=update_data,
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "John Updated Doe"

    async def test_update_student_credit(
        self, client: AsyncClient, auth_headers: dict, test_student
    ):
        """Test updating course credit status."""
        update_data = {"course_credit_received": True}

        response = await client.put(
            f"/api/students/{test_student.id}",
            json=update_data,
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["course_credit_received"] is True
        assert data["name"] == test_student.name  # Name unchanged

    async def test_update_student_both_fields(
        self, client: AsyncClient, auth_headers: dict, test_student
    ):
        """Test updating both name and credit."""
        update_data = {
            "name": "Completely New Name",
            "course_credit_received": True,
        }

        response = await client.put(
            f"/api/students/{test_student.id}",
            json=update_data,
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Completely New Name"
        assert data["course_credit_received"] is True

    async def test_update_student_duplicate_name(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_student,
        test_student_with_credit,
    ):
        """Test updating to a duplicate name fails."""
        update_data = {"name": test_student_with_credit.name}

        response = await client.put(
            f"/api/students/{test_student.id}",
            json=update_data,
            headers=auth_headers,
        )

        assert response.status_code == 400
        assert "already exists" in response.json()["detail"].lower()

    async def test_update_student_not_found(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test updating non-existent student returns 404."""
        import uuid

        fake_id = uuid.uuid4()
        response = await client.put(
            f"/api/students/{fake_id}",
            json={"name": "New Name"},
            headers=auth_headers,
        )

        assert response.status_code == 404


@pytest.mark.asyncio
class TestDeleteStudent:
    """Tests for DELETE /students/{id}"""

    async def test_delete_student_success(
        self, client: AsyncClient, auth_headers: dict, db: AsyncSession, test_class
    ):
        """Test deleting a student."""
        # Create a student to delete
        student = Student(
            name="To Delete",
            class_id=test_class.id,
            course_credit_received=False,
        )
        db.add(student)
        await db.commit()
        await db.refresh(student)

        response = await client.delete(
            f"/api/students/{student.id}",
            headers=auth_headers,
        )

        assert response.status_code == 204

        # Verify deletion
        from sqlalchemy import select

        result = await db.execute(select(Student).where(Student.id == student.id))
        assert result.scalar_one_or_none() is None

    async def test_delete_student_cascades_attendance(
        self,
        client: AsyncClient,
        auth_headers: dict,
        db: AsyncSession,
        test_student,
        test_attendance,
    ):
        """Test deleting student also deletes attendance records."""
        from sqlalchemy import select
        from app.models.attendance import AttendanceRecord

        # Verify attendance exists
        result = await db.execute(
            select(AttendanceRecord).where(
                AttendanceRecord.student_id == test_student.id
            )
        )
        assert result.scalar_one_or_none() is not None

        # Delete student
        response = await client.delete(
            f"/api/students/{test_student.id}",
            headers=auth_headers,
        )

        assert response.status_code == 204

        # Verify attendance was cascaded deleted
        result = await db.execute(
            select(AttendanceRecord).where(
                AttendanceRecord.student_id == test_student.id
            )
        )
        assert result.scalar_one_or_none() is None

    async def test_delete_student_not_found(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test deleting non-existent student returns 404."""
        import uuid

        fake_id = uuid.uuid4()
        response = await client.delete(
            f"/api/students/{fake_id}",
            headers=auth_headers,
        )

        assert response.status_code == 404


@pytest.mark.asyncio
class TestAutocomplete:
    """Tests for GET /classes/{id}/students/autocomplete"""

    async def test_autocomplete_success(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_class,
        test_student,
        test_student_with_credit,
    ):
        """Test autocomplete returns matching students."""
        response = await client.get(
            f"/api/classes/{test_class.id}/students/autocomplete?query=Jo",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data) >= 1
        assert any("john" in item["name"].lower() for item in data)

        # Check structure
        assert "id" in data[0]
        assert "name" in data[0]
        assert "total_attendance" in data[0]

    async def test_autocomplete_min_length(
        self, client: AsyncClient, auth_headers: dict, test_class
    ):
        """Test autocomplete requires min 2 characters."""
        response = await client.get(
            f"/api/classes/{test_class.id}/students/autocomplete?query=J",
            headers=auth_headers,
        )

        assert response.status_code == 422  # Validation error

    async def test_autocomplete_orders_by_frequency(
        self,
        client: AsyncClient,
        auth_headers: dict,
        db: AsyncSession,
        test_class,
        test_student,
    ):
        """Test autocomplete orders by attendance count."""
        from datetime import datetime, timezone
        from app.models.attendance import AttendanceRecord
        from app.models.student import Student

        # Create another student with more attendance
        frequent_student = Student(
            name="John Frequent",
            class_id=test_class.id,
            course_credit_received=False,
        )
        db.add(frequent_student)
        await db.commit()
        await db.refresh(frequent_student)

        # Add multiple attendance records for frequent student
        for _ in range(5):
            record = AttendanceRecord(
                class_id=test_class.id,
                student_id=frequent_student.id,
                timestamp=datetime.now(timezone.utc),
            )
            db.add(record)
        await db.commit()

        response = await client.get(
            f"/api/classes/{test_class.id}/students/autocomplete?query=John",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data) >= 2

        # Student with more attendance should come first
        assert data[0]["total_attendance"] >= data[1]["total_attendance"]

    async def test_autocomplete_case_insensitive(
        self, client: AsyncClient, auth_headers: dict, test_class, test_student
    ):
        """Test autocomplete is case insensitive."""
        response = await client.get(
            f"/api/classes/{test_class.id}/students/autocomplete?query=JOHN",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data) >= 1

    async def test_autocomplete_limit(
        self, client: AsyncClient, auth_headers: dict, db: AsyncSession, test_class
    ):
        """Test autocomplete respects limit parameter."""
        from app.models.student import Student

        # Create 15 students with similar names
        for i in range(15):
            student = Student(
                name=f"Test Student {i}",
                class_id=test_class.id,
                course_credit_received=False,
            )
            db.add(student)
        await db.commit()

        response = await client.get(
            f"/api/classes/{test_class.id}/students/autocomplete?query=Test&limit=5",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 5


@pytest.mark.asyncio
class TestStudentPermissions:
    """Tests for student access permissions."""

    async def test_cannot_create_student_for_other_teacher_class(
        self, client: AsyncClient, auth_headers: dict, db: AsyncSession
    ):
        """Test cannot create student in another teacher's class."""
        from app.models.class_ import Class
        from app.models.user import User
        from app.core.security import hash_password

        # Create another teacher and their class
        other_teacher = User(
            email="other2@example.com",
            password_hash=hash_password("password"),
            active=True,
        )
        db.add(other_teacher)
        await db.commit()
        await db.refresh(other_teacher)

        other_class = Class(
            name="Other Class 2",
            teacher_id=other_teacher.id,
            active=True,
        )
        db.add(other_class)
        await db.commit()
        await db.refresh(other_class)

        student_data = {"name": "Unauthorized Student", "course_credit_received": False}

        response = await client.post(
            f"/api/classes/{other_class.id}/students",
            json=student_data,
            headers=auth_headers,
        )

        assert response.status_code == 403

    async def test_cannot_update_other_teacher_student(
        self, client: AsyncClient, auth_headers: dict, db: AsyncSession
    ):
        """Test cannot update another teacher's student."""
        from app.models.class_ import Class
        from app.models.student import Student
        from app.models.user import User
        from app.core.security import hash_password

        # Create another teacher, class, and student
        other_teacher = User(
            email="other3@example.com",
            password_hash=hash_password("password"),
            active=True,
        )
        db.add(other_teacher)
        await db.commit()
        await db.refresh(other_teacher)

        other_class = Class(
            name="Other Class 3",
            teacher_id=other_teacher.id,
            active=True,
        )
        db.add(other_class)
        await db.commit()
        await db.refresh(other_class)

        other_student = Student(
            name="Other Student",
            class_id=other_class.id,
            course_credit_received=False,
        )
        db.add(other_student)
        await db.commit()
        await db.refresh(other_student)

        response = await client.put(
            f"/api/students/{other_student.id}",
            json={"name": "Hacked Name"},
            headers=auth_headers,
        )

        assert response.status_code == 403


@pytest.mark.asyncio
class TestMergeStudents:
    """Tests for POST /students/{id}/merge"""

    async def test_merge_students_success(
        self,
        client: AsyncClient,
        auth_headers: dict,
        db: AsyncSession,
        test_class,
    ):
        """Test successfully merging two students."""
        from datetime import datetime, timezone
        from sqlalchemy import select
        from app.models.student import Student
        from app.models.attendance import AttendanceRecord

        # Create two students
        student1 = Student(
            name="Merge Target",
            class_id=test_class.id,
            course_credit_received=False,
        )
        student2 = Student(
            name="Merge Duplicate",
            class_id=test_class.id,
            course_credit_received=False,
        )
        db.add_all([student1, student2])
        await db.commit()
        await db.refresh(student1)
        await db.refresh(student2)

        # Add attendance to both students
        for _ in range(3):
            record = AttendanceRecord(
                class_id=test_class.id,
                student_id=student1.id,
                timestamp=datetime.now(timezone.utc),
            )
            db.add(record)
        for _ in range(2):
            record = AttendanceRecord(
                class_id=test_class.id,
                student_id=student2.id,
                timestamp=datetime.now(timezone.utc),
            )
            db.add(record)
        await db.commit()

        # Merge student2 into student1
        response = await client.post(
            f"/api/students/{student1.id}/merge",
            json={"duplicate_student_id": str(student2.id)},
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == str(student1.id)
        assert data["total_attendance"] == 5  # 3 + 2

        # Verify duplicate student is deleted
        result = await db.execute(select(Student).where(Student.id == student2.id))
        assert result.scalar_one_or_none() is None

        # Verify attendance records transferred
        result = await db.execute(
            select(AttendanceRecord).where(AttendanceRecord.student_id == student1.id)
        )
        records = list(result.scalars().all())
        assert len(records) == 5

    async def test_merge_course_credit_or_logic(
        self,
        client: AsyncClient,
        auth_headers: dict,
        db: AsyncSession,
        test_class,
    ):
        """Test course credit uses OR logic during merge."""
        from sqlalchemy import select
        from app.models.student import Student

        # Test 1: Target has credit, duplicate doesn't
        student1 = Student(
            name="Has Credit",
            class_id=test_class.id,
            course_credit_received=True,
        )
        student2 = Student(
            name="No Credit",
            class_id=test_class.id,
            course_credit_received=False,
        )
        db.add_all([student1, student2])
        await db.commit()
        await db.refresh(student1)
        await db.refresh(student2)

        response = await client.post(
            f"/api/students/{student1.id}/merge",
            json={"duplicate_student_id": str(student2.id)},
            headers=auth_headers,
        )

        assert response.status_code == 200
        assert response.json()["course_credit_received"] is True

        # Test 2: Duplicate has credit, target doesn't
        student3 = Student(
            name="No Credit 2",
            class_id=test_class.id,
            course_credit_received=False,
        )
        student4 = Student(
            name="Has Credit 2",
            class_id=test_class.id,
            course_credit_received=True,
        )
        db.add_all([student3, student4])
        await db.commit()
        await db.refresh(student3)
        await db.refresh(student4)

        response = await client.post(
            f"/api/students/{student3.id}/merge",
            json={"duplicate_student_id": str(student4.id)},
            headers=auth_headers,
        )

        assert response.status_code == 200
        assert response.json()["course_credit_received"] is True

        # Test 3: Both have credit
        student5 = Student(
            name="Has Credit 3",
            class_id=test_class.id,
            course_credit_received=True,
        )
        student6 = Student(
            name="Has Credit 4",
            class_id=test_class.id,
            course_credit_received=True,
        )
        db.add_all([student5, student6])
        await db.commit()
        await db.refresh(student5)
        await db.refresh(student6)

        response = await client.post(
            f"/api/students/{student5.id}/merge",
            json={"duplicate_student_id": str(student6.id)},
            headers=auth_headers,
        )

        assert response.status_code == 200
        assert response.json()["course_credit_received"] is True

        # Test 4: Neither has credit
        student7 = Student(
            name="No Credit 5",
            class_id=test_class.id,
            course_credit_received=False,
        )
        student8 = Student(
            name="No Credit 6",
            class_id=test_class.id,
            course_credit_received=False,
        )
        db.add_all([student7, student8])
        await db.commit()
        await db.refresh(student7)
        await db.refresh(student8)

        response = await client.post(
            f"/api/students/{student7.id}/merge",
            json={"duplicate_student_id": str(student8.id)},
            headers=auth_headers,
        )

        assert response.status_code == 200
        assert response.json()["course_credit_received"] is False

    async def test_merge_same_student_error(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_student,
    ):
        """Test cannot merge student with itself."""
        response = await client.post(
            f"/api/students/{test_student.id}/merge",
            json={"duplicate_student_id": str(test_student.id)},
            headers=auth_headers,
        )

        assert response.status_code == 400
        assert "cannot merge a student with itself" in response.json()["detail"].lower()

    async def test_merge_different_classes_error(
        self,
        client: AsyncClient,
        auth_headers: dict,
        db: AsyncSession,
        test_user,
    ):
        """Test cannot merge students from different classes."""
        from app.models.class_ import Class
        from app.models.student import Student

        # Create two classes
        class1 = Class(
            name="Class 1",
            teacher_id=test_user.id,
            active=True,
        )
        class2 = Class(
            name="Class 2",
            teacher_id=test_user.id,
            active=True,
        )
        db.add_all([class1, class2])
        await db.commit()
        await db.refresh(class1)
        await db.refresh(class2)

        # Create student in each class
        student1 = Student(
            name="Student Class 1",
            class_id=class1.id,
            course_credit_received=False,
        )
        student2 = Student(
            name="Student Class 2",
            class_id=class2.id,
            course_credit_received=False,
        )
        db.add_all([student1, student2])
        await db.commit()
        await db.refresh(student1)
        await db.refresh(student2)

        # Attempt merge
        response = await client.post(
            f"/api/students/{student1.id}/merge",
            json={"duplicate_student_id": str(student2.id)},
            headers=auth_headers,
        )

        assert response.status_code == 400
        assert "different classes" in response.json()["detail"].lower()

    async def test_merge_not_found_target(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_student,
    ):
        """Test merge with non-existent target student."""
        import uuid

        fake_id = uuid.uuid4()
        response = await client.post(
            f"/api/students/{fake_id}/merge",
            json={"duplicate_student_id": str(test_student.id)},
            headers=auth_headers,
        )

        assert response.status_code == 404

    async def test_merge_not_found_duplicate(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_student,
    ):
        """Test merge with non-existent duplicate student."""
        import uuid

        fake_id = uuid.uuid4()
        response = await client.post(
            f"/api/students/{test_student.id}/merge",
            json={"duplicate_student_id": str(fake_id)},
            headers=auth_headers,
        )

        assert response.status_code == 404

    async def test_merge_forbidden_error(
        self,
        client: AsyncClient,
        auth_headers: dict,
        db: AsyncSession,
    ):
        """Test cannot merge students from another teacher's class."""
        from app.models.class_ import Class
        from app.models.student import Student
        from app.models.user import User
        from app.core.security import hash_password

        # Create another teacher and their class
        other_teacher = User(
            email="othermerge@example.com",
            password_hash=hash_password("password"),
            active=True,
        )
        db.add(other_teacher)
        await db.commit()
        await db.refresh(other_teacher)

        other_class = Class(
            name="Other Merge Class",
            teacher_id=other_teacher.id,
            active=True,
        )
        db.add(other_class)
        await db.commit()
        await db.refresh(other_class)

        # Create two students in other teacher's class
        student1 = Student(
            name="Other Student 1",
            class_id=other_class.id,
            course_credit_received=False,
        )
        student2 = Student(
            name="Other Student 2",
            class_id=other_class.id,
            course_credit_received=False,
        )
        db.add_all([student1, student2])
        await db.commit()
        await db.refresh(student1)
        await db.refresh(student2)

        # Attempt merge with current user's auth (different teacher)
        response = await client.post(
            f"/api/students/{student1.id}/merge",
            json={"duplicate_student_id": str(student2.id)},
            headers=auth_headers,
        )

        assert response.status_code == 403

    async def test_merge_transaction_atomicity(
        self,
        client: AsyncClient,
        auth_headers: dict,
        db: AsyncSession,
        test_class,
    ):
        """Test merge operation is atomic (all or nothing)."""
        from datetime import datetime, timezone
        from sqlalchemy import select
        from app.models.student import Student
        from app.models.attendance import AttendanceRecord

        # Create two students with attendance
        student1 = Student(
            name="Atomic Target",
            class_id=test_class.id,
            course_credit_received=False,
        )
        student2 = Student(
            name="Atomic Duplicate",
            class_id=test_class.id,
            course_credit_received=True,
        )
        db.add_all([student1, student2])
        await db.commit()
        await db.refresh(student1)
        await db.refresh(student2)

        # Add attendance
        for _ in range(2):
            record = AttendanceRecord(
                class_id=test_class.id,
                student_id=student2.id,
                timestamp=datetime.now(timezone.utc),
            )
            db.add(record)
        await db.commit()

        # Perform merge
        response = await client.post(
            f"/api/students/{student1.id}/merge",
            json={"duplicate_student_id": str(student2.id)},
            headers=auth_headers,
        )

        assert response.status_code == 200

        # Verify all operations completed successfully
        # 1. Duplicate deleted
        result = await db.execute(select(Student).where(Student.id == student2.id))
        assert result.scalar_one_or_none() is None

        # 2. Attendance transferred
        result = await db.execute(
            select(AttendanceRecord).where(AttendanceRecord.student_id == student1.id)
        )
        records = list(result.scalars().all())
        assert len(records) == 2

        # 3. Course credit merged
        result = await db.execute(select(Student).where(Student.id == student1.id))
        updated_student = result.scalar_one()
        assert updated_student.course_credit_received is True

    async def test_update_duplicate_error_unchanged(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_student,
        test_student_with_credit,
    ):
        """Test that update endpoint still returns 400 on duplicate (existing behavior)."""
        # This test ensures we don't break existing behavior
        update_data = {"name": test_student_with_credit.name}

        response = await client.put(
            f"/api/students/{test_student.id}",
            json=update_data,
            headers=auth_headers,
        )

        assert response.status_code == 400
        assert "already exists" in response.json()["detail"].lower()
