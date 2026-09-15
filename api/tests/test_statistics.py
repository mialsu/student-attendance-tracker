"""Tests for attendance statistics endpoint."""

import pytest
from datetime import datetime, timedelta
from httpx import AsyncClient
from app.models.class_ import Class


@pytest.mark.asyncio
class TestAttendanceStatistics:
    """Test suite for attendance statistics endpoint."""

    async def test_get_statistics_success(
        self, client: AsyncClient, auth_headers: dict, test_class: Class
    ):
        """Test getting statistics for a class."""
        class_id = test_class.id

        # Create some attendance records
        today = datetime.now()
        yesterday = today - timedelta(days=1)

        # Create attendance for 2 different days
        for date in [today, yesterday]:
            for i in range(3):
                response = await client.post(
                    f"/api/classes/{class_id}/attendance",
                    headers=auth_headers,
                    json={
                        "student_name": f"Student {i}",
                        "timestamp": date.isoformat(),
                    },
                )
                assert response.status_code == 201

        # Get statistics
        response = await client.get(
            f"/api/classes/{class_id}/attendance/statistics",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()

        # Verify structure
        assert "total_records" in data
        assert "total_students" in data
        assert "daily_stats" in data
        assert "monthly_stats" in data

        # Verify data
        assert data["total_records"] == 6  # 3 students × 2 days
        assert data["total_students"] == 3  # 3 unique students
        assert len(data["daily_stats"]) == 2  # 2 different days

    async def test_get_statistics_with_exclude_dates(
        self, client: AsyncClient, auth_headers: dict, test_class: Class
    ):
        """Test excluding specific dates from statistics."""
        class_id = test_class.id

        # Create attendance for 3 different days
        today = datetime.now()
        yesterday = today - timedelta(days=1)
        two_days_ago = today - timedelta(days=2)

        dates = [today, yesterday, two_days_ago]
        for date in dates:
            response = await client.post(
                f"/api/classes/{class_id}/attendance",
                headers=auth_headers,
                json={
                    "student_name": "Test Student",
                    "timestamp": date.isoformat(),
                },
            )
            assert response.status_code == 201

        # Get statistics excluding yesterday
        exclude_date = yesterday.strftime("%Y-%m-%d")
        response = await client.get(
            f"/api/classes/{class_id}/attendance/statistics",
            headers=auth_headers,
            params={"exclude_dates": exclude_date},
        )

        assert response.status_code == 200
        data = response.json()

        # The totals follow the exclusion too, since spec 0008 moved both counts inside the
        # same WHERE clause the aggregations use. This assertion read `== 3` ("Total should
        # still show ALL data") until 2026-09-15, which is precisely the disagreement between
        # the summary cards and the charts that the spec was written to end.
        assert data["total_records"] == 2  # today and two days ago; yesterday excluded
        assert data["total_students"] == 1  # same student either way

        # But daily stats should only show 2 days (yesterday excluded)
        assert len(data["daily_stats"]) == 2
        daily_dates = [stat["date"] for stat in data["daily_stats"]]
        assert exclude_date not in daily_dates

    async def test_get_statistics_exclude_multiple_dates(
        self, client: AsyncClient, auth_headers: dict, test_class: Class
    ):
        """Test excluding multiple dates from statistics."""
        class_id = test_class.id

        # Create attendance for 4 different days with explicit dates
        dates_str = ["2026-03-10", "2026-03-11", "2026-03-12", "2026-03-13"]

        for date_str in dates_str:
            response = await client.post(
                f"/api/classes/{class_id}/attendance",
                headers=auth_headers,
                json={
                    "student_name": "Test Student",
                    "timestamp": f"{date_str}T12:00:00Z",
                },
            )
            assert response.status_code == 201

        # Exclude first and last dates
        exclude_dates = f"{dates_str[0]},{dates_str[3]}"
        response = await client.get(
            f"/api/classes/{class_id}/attendance/statistics",
            headers=auth_headers,
            params={"exclude_dates": exclude_dates},
        )

        assert response.status_code == 200
        data = response.json()

        # Two of the four days are excluded, and since spec 0008 the total says so. This read
        # `== 4` until 2026-09-15; see the note in test_get_statistics_with_exclude_dates.
        assert data["total_records"] == 2

        # Daily stats should only show 2 days (middle two)
        daily_dates = [stat["date"] for stat in data["daily_stats"]]
        assert dates_str[0] not in daily_dates  # March 10 excluded
        assert dates_str[3] not in daily_dates  # March 13 excluded
        assert dates_str[1] in daily_dates      # March 11 included
        assert dates_str[2] in daily_dates      # March 12 included

    async def test_get_statistics_empty_class(
        self, client: AsyncClient, auth_headers: dict, test_class: Class
    ):
        """Test statistics for class with no attendance."""
        class_id = test_class.id

        response = await client.get(
            f"/api/classes/{class_id}/attendance/statistics",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()

        assert data["total_records"] == 0
        assert data["total_students"] == 0
        assert data["daily_stats"] == []
        assert data["monthly_stats"] == []
        assert data["first_date"] is None
        assert data["last_date"] is None

    async def test_get_statistics_unauthorized(
        self, client: AsyncClient, test_class: Class
    ):
        """Test accessing statistics without authentication."""
        class_id = test_class.id

        response = await client.get(
            f"/api/classes/{class_id}/attendance/statistics"
        )

        assert response.status_code == 401

    async def test_get_statistics_wrong_teacher(
        self, client: AsyncClient, db, test_class: Class
    ):
        """Test accessing another teacher's class statistics."""
        from app.models.user import User
        from app.core.security import hash_password

        # Create another teacher
        other_teacher = User(
            email="other_statistics@example.com",
            password_hash=hash_password("password123"),
        )
        db.add(other_teacher)
        await db.commit()

        # Login as other teacher
        login_response = await client.post(
            "/api/auth/login",
            json={"email": "other_statistics@example.com", "password": "password123"},
        )
        assert login_response.status_code == 200
        other_token = login_response.json()["access_token"]
        other_headers = {"Authorization": f"Bearer {other_token}"}

        # Try to access first teacher's class statistics
        response = await client.get(
            f"/api/classes/{test_class.id}/attendance/statistics",
            headers=other_headers,
        )

        assert response.status_code == 403

    async def test_get_statistics_invalid_exclude_dates(
        self, client: AsyncClient, auth_headers: dict, test_class: Class
    ):
        """Test that invalid dates in exclude_dates are silently ignored."""
        class_id = test_class.id

        # Create one attendance record
        response = await client.post(
            f"/api/classes/{class_id}/attendance",
            headers=auth_headers,
            json={"student_name": "Test Student"},
        )
        assert response.status_code == 201

        # Request with invalid date format (should be ignored)
        response = await client.get(
            f"/api/classes/{class_id}/attendance/statistics",
            headers=auth_headers,
            params={"exclude_dates": "invalid-date,2026-13-99"},
        )

        # Should succeed and return data (invalid dates ignored)
        assert response.status_code == 200
        data = response.json()
        assert data["total_records"] == 1


@pytest.mark.asyncio
class TestStatisticsTimeframe:
    """Spec 0008 slice 1 — `date_from` / `date_to` on the statistics endpoint.

    The range is half-open internally (`>= date_from`, `< date_to + 1 day`) so the index on
    `AttendanceRecord.timestamp` is still used, but a teacher reads `date_to` as inclusive of
    that whole day. `test_end_day_is_inclusive_to_its_last_second` is the one that pins the
    difference, and it was watched failing against a `<=` comparison.
    """

    async def _log(self, client, auth_headers, class_id, name: str, instant: str):
        """Log one attendance record at an explicit UTC instant."""
        response = await client.post(
            f"/api/classes/{class_id}/attendance",
            headers=auth_headers,
            json={"student_name": name, "timestamp": instant},
        )
        assert response.status_code == 201

    async def _seed(self, client, auth_headers, class_id):
        """Five records over two months: 4 students, one of whom attends twice.

        Chosen so total_records and total_students cannot be confused for each other, and so
        the monthly aggregation has something to drop.
        """
        await self._log(client, auth_headers, class_id, "Alpha Student", "2026-02-20T12:00:00Z")
        await self._log(client, auth_headers, class_id, "Beta Student", "2026-03-10T12:00:00Z")
        await self._log(client, auth_headers, class_id, "Gamma Student", "2026-03-11T12:00:00Z")
        await self._log(client, auth_headers, class_id, "Delta Student", "2026-03-12T12:00:00Z")
        await self._log(client, auth_headers, class_id, "Beta Student", "2026-03-13T12:00:00Z")

    async def _stats(self, client, auth_headers, class_id, **params):
        response = await client.get(
            f"/api/classes/{class_id}/attendance/statistics",
            headers=auth_headers,
            params=params,
        )
        assert response.status_code == 200, response.text
        return response.json()

    # AC-1 — omitted parameters mean unfiltered, and the response shape is untouched.
    async def test_no_parameters_returns_everything(
        self, client: AsyncClient, auth_headers: dict, test_class: Class
    ):
        await self._seed(client, auth_headers, test_class.id)

        data = await self._stats(client, auth_headers, test_class.id)

        assert data["total_records"] == 5
        assert data["total_students"] == 4
        assert len(data["daily_stats"]) == 5
        assert len(data["monthly_stats"]) == 2
        assert data["first_date"] == "2026-02-20"
        assert data["last_date"] == "2026-03-13"

    # AC-2 — each parameter restricts the aggregations, alone and together.
    async def test_date_from_alone_restricts_the_aggregations(
        self, client: AsyncClient, auth_headers: dict, test_class: Class
    ):
        await self._seed(client, auth_headers, test_class.id)

        data = await self._stats(
            client, auth_headers, test_class.id, date_from="2026-03-12"
        )

        assert [row["date"] for row in data["daily_stats"]] == ["2026-03-12", "2026-03-13"]
        assert [row["year_month"] for row in data["monthly_stats"]] == ["2026-03"]

    async def test_date_to_alone_restricts_the_aggregations(
        self, client: AsyncClient, auth_headers: dict, test_class: Class
    ):
        await self._seed(client, auth_headers, test_class.id)

        data = await self._stats(client, auth_headers, test_class.id, date_to="2026-03-10")

        assert [row["date"] for row in data["daily_stats"]] == ["2026-02-20", "2026-03-10"]
        assert [row["year_month"] for row in data["monthly_stats"]] == ["2026-02", "2026-03"]

    async def test_both_ends_restrict_to_one_month(
        self, client: AsyncClient, auth_headers: dict, test_class: Class
    ):
        await self._seed(client, auth_headers, test_class.id)

        data = await self._stats(
            client,
            auth_headers,
            test_class.id,
            date_from="2026-03-01",
            date_to="2026-03-31",
        )

        assert [row["date"] for row in data["daily_stats"]] == [
            "2026-03-10",
            "2026-03-11",
            "2026-03-12",
            "2026-03-13",
        ]
        assert [row["year_month"] for row in data["monthly_stats"]] == ["2026-03"]

    # AC-3 — the totals follow the range. This is the change the four cards existed to need:
    # before spec 0008 they were computed over all data and disagreed with the charts below them.
    async def test_totals_count_only_the_timeframe(
        self, client: AsyncClient, auth_headers: dict, test_class: Class
    ):
        await self._seed(client, auth_headers, test_class.id)

        data = await self._stats(
            client,
            auth_headers,
            test_class.id,
            date_from="2026-03-11",
            date_to="2026-03-13",
        )

        # Gamma, Delta and Beta attended in that window; Alpha (February) did not.
        assert data["total_records"] == 3
        assert data["total_students"] == 3

    async def test_totals_count_a_returning_student_once(
        self, client: AsyncClient, auth_headers: dict, test_class: Class
    ):
        await self._seed(client, auth_headers, test_class.id)

        data = await self._stats(
            client,
            auth_headers,
            test_class.id,
            date_from="2026-03-10",
            date_to="2026-03-13",
        )

        assert data["total_records"] == 4  # Beta twice, Gamma and Delta once each
        assert data["total_students"] == 3  # Beta counted once

    # AC-4 — first/last describe what the teacher is looking at.
    async def test_first_and_last_date_fall_inside_the_timeframe(
        self, client: AsyncClient, auth_headers: dict, test_class: Class
    ):
        await self._seed(client, auth_headers, test_class.id)

        data = await self._stats(
            client,
            auth_headers,
            test_class.id,
            date_from="2026-03-11",
            date_to="2026-03-12",
        )

        assert data["first_date"] == "2026-03-11"
        assert data["last_date"] == "2026-03-12"

    # AC-5 — the half-open comparison, at the only place it is observable.
    # Watched failing against `timestamp <= date_to`, which coerces to midnight and drops the
    # whole of the end day.
    async def test_end_day_is_inclusive_to_its_last_second(
        self, client: AsyncClient, auth_headers: dict, test_class: Class
    ):
        class_id = test_class.id
        await self._log(
            client, auth_headers, class_id, "Last Second", "2026-04-10T23:59:59Z"
        )
        await self._log(
            client, auth_headers, class_id, "Next Midnight", "2026-04-11T00:00:00Z"
        )

        data = await self._stats(
            client, auth_headers, class_id, date_from="2026-04-10", date_to="2026-04-10"
        )

        assert [row["date"] for row in data["daily_stats"]] == ["2026-04-10"]
        assert data["total_records"] == 1
        assert data["total_students"] == 1

    async def test_start_day_is_inclusive_from_its_first_second(
        self, client: AsyncClient, auth_headers: dict, test_class: Class
    ):
        class_id = test_class.id
        await self._log(
            client, auth_headers, class_id, "First Second", "2026-04-10T00:00:00Z"
        )
        await self._log(
            client, auth_headers, class_id, "Day Before", "2026-04-09T23:59:59Z"
        )

        data = await self._stats(client, auth_headers, class_id, date_from="2026-04-10")

        assert [row["date"] for row in data["daily_stats"]] == ["2026-04-10"]
        assert data["total_records"] == 1

    # AC-6 — an inverted range is refused, as a backstop. The UI cannot express one.
    async def test_inverted_range_is_refused(
        self, client: AsyncClient, auth_headers: dict, test_class: Class
    ):
        response = await client.get(
            f"/api/classes/{test_class.id}/attendance/statistics",
            headers=auth_headers,
            params={"date_from": "2026-03-13", "date_to": "2026-03-10"},
        )

        assert response.status_code == 422

    async def test_equal_ends_are_a_valid_single_day(
        self, client: AsyncClient, auth_headers: dict, test_class: Class
    ):
        await self._seed(client, auth_headers, test_class.id)

        data = await self._stats(
            client,
            auth_headers,
            test_class.id,
            date_from="2026-03-11",
            date_to="2026-03-11",
        )

        assert data["total_records"] == 1
        assert [row["date"] for row in data["daily_stats"]] == ["2026-03-11"]

    async def test_a_range_holding_nothing_is_empty_not_an_error(
        self, client: AsyncClient, auth_headers: dict, test_class: Class
    ):
        await self._seed(client, auth_headers, test_class.id)

        data = await self._stats(
            client,
            auth_headers,
            test_class.id,
            date_from="2026-05-01",
            date_to="2026-05-31",
        )

        assert data["total_records"] == 0
        assert data["total_students"] == 0
        assert data["daily_stats"] == []
        assert data["monthly_stats"] == []
        assert data["first_date"] is None
        assert data["last_date"] is None

    async def test_a_malformed_date_is_refused(
        self, client: AsyncClient, auth_headers: dict, test_class: Class
    ):
        response = await client.get(
            f"/api/classes/{test_class.id}/attendance/statistics",
            headers=auth_headers,
            params={"date_from": "10.3.2026"},
        )

        assert response.status_code == 422
