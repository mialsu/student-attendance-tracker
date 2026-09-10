"""INV-9: no log line this application emits carries a Student's name.

Split from `tests/test_logging_events.py` in slice 5, for the reason `f8dc6e6` split that file
five commits earlier: `CODING_STANDARDS.md` keeps a test file under 1000 lines and the sweeps
below pushed it past. The seam is the same one the docstrings there describe -- that file owns
the three EVENT FAMILIES, and INV-9 is not an event. It is a property that has to hold across
every route regardless of which family emitted the line, which is exactly why it gets a file.

**Each acceptance criterion is proven in exactly one file**, so AC-5 lives wholly here.

Shared machinery -- `capture_logs`, `assert_names_absent`, `non_reraising_client`, `_raising` --
comes from `tests/logging_helpers.py`, which is where it lives precisely so a second copy cannot
drift from the first.
"""

import json

import pytest

from app.services import student_service
from tests.logging_helpers import (
    _raising,
    assert_names_absent,
    capture_logs,
    non_reraising_client,  # noqa: F401 -- a fixture, resolved by NAME in this namespace
    one_object,
)

# 
# The rule is scoped to lines THIS APPLICATION EMITS (the Owner's decision, 2026-09-10, and
# ADR-0007's own scoping). What it does not cover is confessed, not hidden by the wording:
# SQLAlchemy renders bound parameters into the exception it raises, so a failing query on one of
# five `LOWER(name) LIKE` sites prints a partial name in the traceback beside these lines.
# `api/REVIEW-DEBT.md`, 2026-09-10, carries that and the `hide_parameters` trade it turns on.
#
# These tests were GREEN the moment they were written, and that is stated rather than glossed:
# slices 1-4 already keep names off every line, by never logging `detail` and by making the
# denial label opt-in at the raise site. So there is no honest red-first cycle here. What proves
# them is the plant -- a name inserted into a logger call at each of these routes, one at a
# time, each watched turning exactly these assertions red. AC-6's gate is the other half: it
# fails the DIFF that would insert one, so the plant becomes unlandable rather than merely
# noticed.
# =============================================================================================

# --- AC-5: every route where a Student's name arrives as free text ---------------------------

# A name no fixture uses, so a hit is proof THIS value travelled in and came back out.
PROBE_NAME = "Kaarina Ylitalo"

# Spec 0005's *Personal data* names four places a name arrives; AC-5 names five routes, which is
# the same list with create and update counted separately. Kept as data so a reader can check it
# against the spec, and so a sixth route is one line rather than a sixth test.
NAME_BEARING_ROUTES = [
    (
        "autocomplete query",
        "GET",
        "/api/classes/{class_id}/students/autocomplete?query={name}",
        None,
    ),
    ("attendance filter", "GET", "/api/classes/{class_id}/attendance?student_name={name}", None),
    (
        "bulk logging body",
        "POST",
        "/api/classes/{class_id}/attendance",
        {"student_name": "{name}", "quantity": 1},
    ),
    ("student create", "POST", "/api/classes/{class_id}/students", {"name": "{name}"}),
    ("student update", "PUT", "/api/students/{student_id}", {"name": "{name}"}),
    # Found missing by slice 5's review, and the spec's own *Personal data* list was short by
    # the same two: both are `Query(None, description="Filter by student name ...")`, so a name
    # arrives as free text here exactly as it does on the autocomplete query. See spec delta 16.
    ("students list search", "GET", "/api/classes/{class_id}/students?search={name}", None),
    (
        "summary search",
        "GET",
        "/api/classes/{class_id}/attendance/summary?search={name}",
        None,
    ),
]


def _fill(value, class_id, student_id):
    """Substitute the probe name and the two ids into a path or a JSON body."""
    if isinstance(value, dict):
        return {k: _fill(v, class_id, student_id) for k, v in value.items()}
    if isinstance(value, str):
        return value.format(name=PROBE_NAME, class_id=class_id, student_id=student_id)
    return value


@pytest.mark.parametrize(
    ("label", "method", "path", "body"),
    NAME_BEARING_ROUTES,
    ids=[row[0].replace(" ", "_") for row in NAME_BEARING_ROUTES],
)
@pytest.mark.asyncio
async def test_no_line_carries_the_student_name_on_the_denied_path(
    client, other_teacher_headers, test_class, test_student, label, method, path, body
):
    """AC-5, refused. The name goes in, a denial line comes out, the name is not in it.

    This is the direction that produces a line: a refusal is logged, so it is where a leak
    would be visible. The two query-string routes are the sharp cases -- the handler is
    explicitly forbidden from echoing a query string, and this is what fails if it starts.
    """
    with capture_logs() as lines:
        response = await client.request(
            method,
            _fill(path, test_class.id, test_student.id),
            json=_fill(body, test_class.id, test_student.id),
            headers=other_teacher_headers,
        )

    assert response.status_code == 403, (
        f"{label} returned {response.status_code}: {response.text[:200]}"
    )
    line = one_object(lines)

    assert line["rule"] == "INV-1"
    assert_names_absent(line, "Kaarina", "Ylitalo")


@pytest.mark.parametrize(
    ("label", "method", "path", "body"),
    NAME_BEARING_ROUTES,
    ids=[row[0].replace(" ", "_") for row in NAME_BEARING_ROUTES],
)
@pytest.mark.asyncio
async def test_no_line_carries_the_student_name_on_the_permitted_path(
    client, auth_headers, test_class, test_student, label, method, path, body
):
    """AC-5, permitted -- and this is the half that catches the leak worth catching.

    The denied sweep above never runs the code that HANDLES the name: `verify_class_ownership`
    raises first, so a service function logging `student_data.name` would never execute and the
    refused request would stay clean while every successful one leaked. This direction runs the
    real work with a real name in it.

    Asserted as "nothing captured carries the name" rather than "nothing was captured", which
    is AC-5's own wording. Today these routes emit no line at all (logging routine successful
    writes is the declined fourth family), so this passes trivially -- but it keeps passing for
    the right reason if a later slice decides one of them should log something, instead of
    failing and being edited into agreement.
    """
    with capture_logs() as lines:
        response = await client.request(
            method,
            _fill(path, test_class.id, test_student.id),
            json=_fill(body, test_class.id, test_student.id),
            headers=auth_headers,
        )

    assert response.status_code < 400, (
        f"{label} returned {response.status_code}: {response.text[:200]}"
    )
    for captured in lines:
        assert_names_absent(json.loads(captured), "Kaarina", "Ylitalo")


@pytest.mark.asyncio
async def test_no_error_line_carries_the_student_name_the_request_supplied(
    non_reraising_client, auth_headers, test_class, monkeypatch
):
    """AC-5, on the other line family. A 500 is where a name would leak by a second mechanism.

    The denial sweep above covers the handler's path. This covers the middleware's `ERROR`
    line, which is written from a different place (spec 0005, delta 8) and carries
    `exception=type(exc).__name__` rather than the message -- so a name reaching it would come
    from the request context rather than from the exception. Autocomplete is the route chosen
    because its name arrives in the QUERY STRING, the one place the handler is explicitly
    forbidden from echoing.
    """
    monkeypatch.setattr(
        student_service, "get_autocomplete_suggestions", _raising(RuntimeError("boom"))
    )

    with capture_logs() as lines:
        response = await non_reraising_client.get(
            f"/api/classes/{test_class.id}/students/autocomplete?query={PROBE_NAME}",
            headers=auth_headers,
        )

    assert response.status_code == 500
    line = one_object(lines)

    assert line["event"] == "error"
    assert line["level"] == "ERROR"
    assert_names_absent(line, "Kaarina", "Ylitalo")
