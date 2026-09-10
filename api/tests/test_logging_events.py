"""The three event families a log line records: denials, errors, irreversible acts.

Spec 0005's events, as opposed to its machinery (`tests/test_logging.py`) or INV-9's
cross-cutting property (`tests/test_logging_inv9.py`). Serves **AC-1, AC-2, AC-3, AC-4,
AC-7, AC-8 and AC-21**.

Split out of one file on 2026-09-10, before slice 4. **Each acceptance criterion is proven in
exactly one file**, which is why AC-13 is wholly in the other one even though its route-level
half drives the login route these denial tests also use.

Every assertion is something a person reading the container log could conclude.
"""

import json
import traceback
from datetime import datetime, timedelta, timezone

import pytest

from app.services import attendance_service
from tests.logging_helpers import (
    _raising,
    assert_names_absent,
    capture_logs,
    non_reraising_client,  # noqa: F401 -- a fixture, resolved by NAME in this namespace
    objects,
    one_object,
)

# --- AC-1: an INV-1 denial is recorded, with who was refused and what refused them -----------


@pytest.mark.asyncio
async def test_inv1_denial_emits_one_warning_with_teacher_route_and_request_id(
    client, other_teacher, other_teacher_headers, test_class
):
    """AC-1. A second real teacher is refused a class she does not own, and the log says so.

    This is also the assertion that resolves spec 0005's open question 1 in the affirmative
    direction that matters: `teacher_id` is set by `get_current_user`, a DEPENDENCY, and read by
    the exception handler after the service layer raised. Its presence here proves the request
    context survives from a dependency to the handler.
    """
    with capture_logs() as lines:
        response = await client.get(
            f"/api/classes/{test_class.id}", headers=other_teacher_headers
        )

    assert response.status_code == 403
    line = one_object(lines)

    assert line["level"] == "WARNING"
    assert line["event"] == "denial"
    assert line["rule"] == "INV-1"
    assert line["teacher_id"] == str(other_teacher.id)
    assert line["route"] == f"/api/classes/{test_class.id}"
    assert line["status"] == 403
    assert line["request_id"]


@pytest.mark.asyncio
async def test_a_teacher_reaching_her_own_class_is_not_logged_as_a_denial(
    client, auth_headers, test_class
):
    """The positive control. Denials are the event; a permitted request is silence.

    Without this, a handler that logged every request would pass the test above.
    """
    with capture_logs() as lines:
        response = await client.get(f"/api/classes/{test_class.id}", headers=auth_headers)

    assert response.status_code == 200
    assert lines == []


@pytest.mark.asyncio
async def test_the_denial_line_never_carries_the_query_string(
    client, other_teacher_headers, test_class
):
    """Spec 0005: the exception handler must not echo a request's query string.

    The query string is where a Student's name arrives as free text on the autocomplete and
    attendance-filter routes, so `route` carries the path and nothing after the `?`. This is
    INV-9's shape being respected before INV-9's own enforcers land in slice 5.
    """
    with capture_logs() as lines:
        response = await client.get(
            f"/api/classes/{test_class.id}/students/autocomplete?query=Ada",
            headers=other_teacher_headers,
        )

    assert response.status_code == 403
    line = one_object(lines)
    assert "Ada" not in json.dumps(line)
    assert "?" not in line["route"]
    assert line["route"] == f"/api/classes/{test_class.id}/students/autocomplete"



# =============================================================================================
# Slice 2 — the remaining denials: the auth branches, registration codes, an inactive Class.
# Serves AC-2, AC-3, AC-4, and completes AC-13's second half at a real route.
#
# Two mechanisms are under test here and the difference matters to a reader:
#
#   * `authenticate_user` logs EXPLICITLY, because its three branches deliberately return the
#     same response and no handler downstream can tell them apart.
#   * every other refusal LABELS ITSELF on the exception and the one handler logs it. The label
#     is opt-in, which is what keeps a refusal whose message contains a Student's name silent --
#     asserted below, since that is INV-9's shape before INV-9's own enforcers land in slice 5.
# =============================================================================================

# --- AC-2: the three authenticate_user branches, distinguishable in the log only --------------


@pytest.mark.asyncio
async def test_unknown_email_and_wrong_password_are_one_response_and_two_reasons(
    client, test_user
):
    """AC-2, the half that carries the security property.

    The two branches return a byte-identical response ON PURPOSE -- telling a stranger whether
    an address is registered is the enumeration this app declines to answer. That is exactly
    why the distinction has to live in the log: it exists nowhere else.
    """
    with capture_logs() as unknown_lines:
        unknown = await client.post(
            "/api/auth/login",
            json={"email": "nobody@example.com", "password": "testpassword123"},
        )

    with capture_logs() as wrong_lines:
        wrong = await client.post(
            "/api/auth/login",
            json={"email": test_user.email, "password": "not-the-password"},
        )

    # The responses are indistinguishable, down to the bytes.
    assert unknown.status_code == wrong.status_code == 401
    assert unknown.content == wrong.content

    # The log tells them apart.
    assert objects(unknown_lines, 1)[0]["reason"] == "unknown_email"
    assert objects(wrong_lines, 1)[0]["reason"] == "wrong_password"


@pytest.mark.asyncio
async def test_an_inactive_account_is_the_third_distinguishable_branch(client, inactive_user):
    """AC-2, the third branch. Its response is unchanged by this slice, which is the other half
    of "byte-identical": no branch's bytes moved, whatever the log now says about it."""
    with capture_logs() as lines:
        response = await client.post(
            "/api/auth/login",
            json={"email": inactive_user.email, "password": "testpassword123"},
        )

    assert response.status_code == 401
    assert response.json()["detail"] == "Account is inactive. Please contact support."
    assert objects(lines, 1)[0]["reason"] == "inactive_account"


@pytest.mark.asyncio
async def test_the_three_login_branches_carry_the_attempted_address(client, test_user):
    """The attempted email is what makes the line actionable -- who tried, not just that
    someone did. Spec 0005 sanctions it explicitly: an email is a Teacher's own credential
    attempt, never a Student's name."""
    with capture_logs() as lines:
        await client.post(
            "/api/auth/login",
            json={"email": test_user.email, "password": "not-the-password"},
        )

    line = objects(lines, 1)[0]
    assert line["level"] == "WARNING"
    assert line["event"] == "denial"
    assert line["attempted_email"] == test_user.email
    assert line["route"] == "/api/auth/login"
    assert line["request_id"]


@pytest.mark.asyncio
async def test_a_successful_login_is_not_logged_as_a_denial(client, test_user):
    """The positive control. Without it, a call that logged every login attempt would pass
    every assertion above."""
    with capture_logs() as lines:
        response = await client.post(
            "/api/auth/login",
            json={"email": test_user.email, "password": "testpassword123"},
        )

    assert response.status_code == 200
    assert lines == []



# --- AC-3: a refused registration code names the rule that refused it ------------------------


@pytest.mark.asyncio
async def test_a_used_code_is_refused_and_the_line_names_inv_6(
    client, db, registration_code_for
):
    """AC-3. Used, revoked and expired are INV-6's three one-way states."""
    email = "second-comer@example.com"
    code = await registration_code_for(email)
    code.used = True
    await db.commit()

    with capture_logs() as lines:
        response = await client.post(
            "/api/auth/signup",
            json={"email": email, "password": "password123", "registration_code": code.code},
        )

    assert response.status_code == 400
    line = objects(lines, 1)[0]
    assert line["event"] == "denial"
    assert line["rule"] == "INV-6"
    assert line["reason"] == "code_used"
    assert line["status"] == 400


@pytest.mark.asyncio
async def test_a_revoked_code_is_refused_and_the_line_says_which_state(
    client, db, registration_code_for
):
    """AC-3. INV-6 again, and the reason is what tells a reader which of its three states hit."""
    email = "revoked-holder@example.com"
    code = await registration_code_for(email)
    code.revoked = True
    await db.commit()

    with capture_logs() as lines:
        response = await client.post(
            "/api/auth/signup",
            json={"email": email, "password": "password123", "registration_code": code.code},
        )

    assert response.status_code == 400
    line = objects(lines, 1)[0]
    assert line["rule"] == "INV-6"
    assert line["reason"] == "code_revoked"


@pytest.mark.asyncio
async def test_an_expired_code_is_refused_and_the_line_says_expired(
    client, db, registration_code_for
):
    """AC-3. The third INV-6 state, reached by ageing the row rather than waiting a day."""
    email = "too-late@example.com"
    code = await registration_code_for(email)
    code.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    await db.commit()

    with capture_logs() as lines:
        response = await client.post(
            "/api/auth/signup",
            json={"email": email, "password": "password123", "registration_code": code.code},
        )

    assert response.status_code == 400
    line = objects(lines, 1)[0]
    assert line["rule"] == "INV-6"
    assert line["reason"] == "code_expired"


@pytest.mark.asyncio
async def test_a_code_presented_by_the_wrong_address_names_inv_7(
    client, registration_code_for
):
    """AC-3. A different rule, and the line must say so rather than lump it with INV-6: a code
    refused for the wrong address is still live for its rightful holder, which is the opposite
    operational situation from a code that is dead."""
    code = await registration_code_for("rightful@example.com")

    with capture_logs() as lines:
        response = await client.post(
            "/api/auth/signup",
            json={
                "email": "someone-else@example.com",
                "password": "password123",
                "registration_code": code.code,
            },
        )

    assert response.status_code == 400
    line = objects(lines, 1)[0]
    assert line["rule"] == "INV-7"
    assert line["reason"] == "code_wrong_email"


@pytest.mark.asyncio
async def test_an_unknown_code_is_logged_with_no_rule(client):
    """A code that does not exist breaks no invariant -- it is a wrong guess, not a violation.
    The line records the attempt and deliberately carries NO `rule`, so grepping `rule=INV-6`
    counts real INV-6 refusals and nothing else."""
    with capture_logs() as lines:
        response = await client.post(
            "/api/auth/signup",
            json={
                "email": "guesser@example.com",
                "password": "password123",
                "registration_code": "nosuchcodeatall",
            },
        )

    assert response.status_code == 400
    line = objects(lines, 1)[0]
    assert line["reason"] == "code_unknown"
    assert "rule" not in line


@pytest.mark.asyncio
async def test_no_refused_code_line_ever_carries_the_code_itself(
    client, registration_code_for
):
    """A registration code is a live 96-bit credential. On the wrong-address branch it is still
    redeemable by its rightful holder, so writing it to a log whose retention is size-only would
    park a working credential there indefinitely. The rule refused it; the token is not needed
    to know that."""
    code = await registration_code_for("rightful@example.com")

    with capture_logs() as lines:
        await client.post(
            "/api/auth/signup",
            json={
                "email": "someone-else@example.com",
                "password": "password123",
                "registration_code": code.code,
            },
        )

    assert code.code not in json.dumps(objects(lines, 1)[0])


@pytest.mark.asyncio
async def test_a_successful_signup_is_not_logged_as_a_denial(client, registration_code_for):
    """The positive control for AC-3."""
    email = "welcome@example.com"
    code = await registration_code_for(email)

    with capture_logs() as lines:
        response = await client.post(
            "/api/auth/signup",
            json={"email": email, "password": "password123", "registration_code": code.code},
        )

    assert response.status_code == 201
    assert lines == []


# --- AC-4: new attendance refused on an inactive Class ---------------------------------------


@pytest.mark.asyncio
async def test_attendance_refused_on_an_inactive_class_names_inv_3(
    client, auth_headers, inactive_class
):
    """AC-4. INV-3 is the rule: a new Attendance record may only be created against an active
    Class. Its owner is `attendance_service.create_attendance_record`."""
    with capture_logs() as lines:
        response = await client.post(
            f"/api/classes/{inactive_class.id}/attendance",
            json={"student_name": "Ada Lovelace", "quantity": 1},
            headers=auth_headers,
        )

    assert response.status_code == 400
    line = objects(lines, 1)[0]
    assert line["event"] == "denial"
    assert line["rule"] == "INV-3"
    assert line["reason"] == "class_inactive"
    assert line["route"] == f"/api/classes/{inactive_class.id}/attendance"
    assert line["teacher_id"]


@pytest.mark.asyncio
async def test_the_inactive_class_denial_carries_no_student_name(
    client, auth_headers, inactive_class
):
    """INV-9's shape, at the one slice-2 route where a name arrives in the BODY.

    `student_name` on the bulk-logging body is one of the four places a Student's name enters
    this app as free text. The route it is refused on now emits a line, so this is the first
    chance for a name to ride out on one.
    """
    with capture_logs() as lines:
        await client.post(
            f"/api/classes/{inactive_class.id}/attendance",
            json={"student_name": "Ada Lovelace", "quantity": 1},
            headers=auth_headers,
        )

    assert_names_absent(objects(lines, 1)[0], "Ada", "Lovelace")


@pytest.mark.asyncio
async def test_attendance_on_an_active_class_is_not_logged_as_a_denial(
    client, auth_headers, test_class
):
    """The positive control for AC-4."""
    with capture_logs() as lines:
        response = await client.post(
            f"/api/classes/{test_class.id}/attendance",
            json={"student_name": "Ada Lovelace", "quantity": 1},
            headers=auth_headers,
        )

    assert response.status_code == 201
    assert lines == []


# --- the label is opt-in, and that is what keeps a name off a line ---------------------------


@pytest.mark.asyncio
async def test_a_refusal_whose_message_contains_a_student_name_emits_nothing(
    client, auth_headers, test_class, test_student
):
    """The load-bearing test for the whole design.

    `BadRequestException` is raised at fourteen sites in `app/`, and two of them build their
    message by interpolating a Student's name -- a duplicate-name refusal says which name.
    Logging every `BadRequestException`, or logging `exc.detail`, would put that name on a line
    and break ADR-0007 while every other test here stayed green.

    So the line is opt-in at the raise site. This asserts the consequence: a refusal nobody
    labelled is silent, and the silence is structural rather than remembered.
    """
    with capture_logs() as lines:
        response = await client.post(
            f"/api/classes/{test_class.id}/students",
            json={"name": test_student.name},
            headers=auth_headers,
        )

    assert response.status_code == 400
    assert test_student.name.split()[0] in response.json()["detail"]
    assert lines == []



# --- AC-8: an unhandled exception gets an owner, and uvicorn's traceback is left alone --------
#
# Slice 3. The premise this serves is spec 0005's Problem Statement 2: a traceback names a line,
# never which Teacher, which Class or which request, and production runs `uvicorn --workers 4`
# so four processes interleave their output. The traceback itself is already durable and is
# deliberately untouched (US-14) -- what these lines add is attribution.
#
# The seam is the one *Testing Decisions* names: `monkeypatch` a service function to raise. No
# production hook is added to make a 500 reachable, so nothing here can be triggered by a
# request in production.


@pytest.fixture
def summary_route(test_class) -> str:
    """The route the AC-8 tests drive.

    An authenticated route whose service call is a plain function to `monkeypatch`, and one that
    is NOT an invariant enforcer -- ownership is verified for real before it is reached, so the
    500 under test is the "authentication and authorization both succeeded, then something
    broke" case US-4 describes.
    """
    return f"/api/classes/{test_class.id}/attendance/summary"


@pytest.mark.asyncio
async def test_an_unhandled_exception_emits_one_error_line_with_teacher_route_and_request_id(
    client, auth_headers, summary_route, test_user, monkeypatch
):
    """AC-8, first half. The 500 that used to be anonymous now names who hit it.

    `pytest.raises` rather than a status assertion because the suite's `client` fixture uses
    httpx's default `raise_app_exceptions=True`: the exception reaches the caller exactly as it
    reaches uvicorn. The response a real client sees is asserted separately below.
    """
    monkeypatch.setattr(
        attendance_service, "get_attendance_summary", _raising(ValueError("the query failed"))
    )

    with capture_logs() as lines:
        with pytest.raises(ValueError):
            await client.get(summary_route, headers=auth_headers)

    line = one_object(lines)

    assert line["level"] == "ERROR"
    assert line["event"] == "error"
    assert line["exception"] == "ValueError"
    assert line["teacher_id"] == str(test_user.id)
    assert line["route"] == summary_route
    assert line["request_id"]


@pytest.mark.asyncio
async def test_the_error_line_names_the_exception_type_and_never_its_message(
    client, auth_headers, summary_route, test_student, monkeypatch
):
    """ADR-0007 at the error path, and slice 3's load-bearing test.

    An exception message is free text assembled from whatever the failing code had in hand, and
    what a service function has in hand is very often a Student's name. `exc.detail` is already
    banned from a denial line for exactly this reason (slice 2); `str(exc)` is the same hazard
    wearing a different name, and a class name is the one part of an exception that cannot carry
    data. The traceback carries the message, durably, where it belongs.
    """
    monkeypatch.setattr(
        attendance_service,
        "get_attendance_summary",
        _raising(ValueError(f"could not summarise {test_student.name}")),
    )

    with capture_logs() as lines:
        with pytest.raises(ValueError):
            await client.get(summary_route, headers=auth_headers)

    line = one_object(lines)
    rendered = json.dumps(line)

    assert line["exception"] == "ValueError"
    assert test_student.name not in rendered
    assert test_student.name.split()[0] not in rendered
    assert "could not summarise" not in rendered


@pytest.mark.asyncio
async def test_the_exception_reaches_the_server_with_its_traceback_unchanged(
    client, auth_headers, summary_route, monkeypatch
):
    """AC-8, second half, and US-14. Logging must not cost a frame.

    Measured before it was built: a bare `raise` inside an `except` block re-raises the same
    object and leaves the frame attributed to the `await self.app(...)` line, so the rendered
    traceback is byte-identical to the one a try/finally alone produces. `raise exc` is what
    breaks it -- it appends a SECOND frame for the same function, pointing at the re-raise -- and
    wrapping in a new exception breaks it further. Both are what this test exists to catch.
    """
    planted = ValueError("boom")
    monkeypatch.setattr(attendance_service, "get_attendance_summary", _raising(planted))

    with capture_logs():
        with pytest.raises(ValueError) as caught:
            await client.get(summary_route, headers=auth_headers)

    assert caught.value is planted, "the middleware replaced the exception object"
    assert caught.value.__cause__ is None, "the exception was re-raised from another"

    rendered = traceback.format_exception(
        type(caught.value), caught.value, caught.value.__traceback__
    )
    lines = "".join(rendered).splitlines()
    middleware_frames = [
        index for index, line in enumerate(lines) if "app/middleware/context.py" in line
    ]

    assert len(middleware_frames) == 1, (
        "the context middleware appears in the traceback more than once, which is what "
        f"`raise exc` does and a bare `raise` does not:\n{"\n".join(lines)}"
    )
    source_line = lines[middleware_frames[0] + 1].strip()
    assert source_line == "await self.app(scope, receive, send)", (
        f"the middleware's frame no longer points at the call it wraps: {source_line}"
    )


@pytest.mark.asyncio
async def test_the_client_still_receives_starlettes_own_500(
    non_reraising_client, auth_headers, summary_route, monkeypatch
):
    """US-14's other half: the response bytes a real caller sees are untouched.

    Starlette's own 500, unmodified -- the middleware logs and re-raises rather than rendering
    anything, so `ServerErrorMiddleware` still produces the body it produced before slice 3.
    """
    monkeypatch.setattr(
        attendance_service, "get_attendance_summary", _raising(ValueError("boom"))
    )

    with capture_logs() as lines:
        response = await non_reraising_client.get(summary_route, headers=auth_headers)

    assert response.status_code == 500
    assert response.text == "Internal Server Error"
    assert one_object(lines)["event"] == "error"


# --- AC-7 and AC-21: the irreversible acts, and the merge that was refused -------------------
#
# Slice 4. Two INFO lines and one more denial, and the setup below is deliberately done through
# the ROUTES rather than the `db` fixture: a count this slice reads has to be the count the app
# would read serving a real request, and rows inserted behind the app's back are the one way to
# make a passing count meaningless.
#
# Every act here is destructive by decision, not by accident -- `CONTEXT.md` calls this app a
# tally sheet and the school holds the credit -- so the line records THAT it happened and HOW
# MUCH it moved, and cannot reverse it (ADR-0007, and spec 0005's non-goals).


async def _make_student(client, headers, class_id, name: str) -> str:
    """Create one Student through the route and return its id."""
    response = await client.post(
        f"/api/classes/{class_id}/students", json={"name": name}, headers=headers
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


async def _log_attendance(client, headers, class_id, name: str, quantity: int) -> None:
    """Give a Student `quantity` attendance records through the bulk-logging route."""
    response = await client.post(
        f"/api/classes/{class_id}/attendance",
        json={"student_name": name, "quantity": quantity},
        headers=headers,
    )
    assert response.status_code == 201, response.text


async def _make_class(client, headers, name: str) -> str:
    """Create a second Class for the SAME teacher, which is what makes INV-5 reachable."""
    response = await client.post("/api/classes", json={"name": name}, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()["id"]


@pytest.mark.asyncio
async def test_a_merge_records_the_number_of_attendance_records_it_moved(
    client, auth_headers, test_class
):
    """AC-7, the merge half. Four records move; the line says four.

    The number is the whole value of the line: it is what answers "was that the pair I meant"
    without naming anyone. Seven records exist across the two Students and only the duplicate's
    four move, so a line reporting the target's new total (7) rather than the number that
    moved (4) fails here.
    """
    target = await _make_student(client, auth_headers, test_class.id, "Aino Mäkinen")
    duplicate = await _make_student(client, auth_headers, test_class.id, "Eino Nieminen")
    await _log_attendance(client, auth_headers, test_class.id, "Aino Mäkinen", 3)
    await _log_attendance(client, auth_headers, test_class.id, "Eino Nieminen", 4)

    with capture_logs() as lines:
        response = await client.post(
            f"/api/students/{target}/merge",
            json={"duplicate_student_id": duplicate},
            headers=auth_headers,
        )

    assert response.status_code == 200
    line = one_object(lines)

    assert line["level"] == "INFO"
    assert line["event"] == "merge"
    assert line["records_moved"] == 4
    assert line["target_student_id"] == target
    assert line["duplicate_student_id"] == duplicate
    assert line["class_id"] == str(test_class.id)
    assert line["teacher_id"]
    assert line["request_id"]


@pytest.mark.asyncio
async def test_a_merge_that_moves_nothing_still_records_a_zero(
    client, auth_headers, test_class
):
    """AC-7. Zero is a measurement, and it has to survive being falsy.

    A merge of an empty duplicate is the mis-click this line exists to expose -- the Owner
    merged the wrong pair and no history moved. `if count:` at the call site, or a formatter
    that dropped falsy fields, would omit the field precisely when the reader needs it, and
    every other assertion in this section would stay green.
    """
    target = await _make_student(client, auth_headers, test_class.id, "Aino Mäkinen")
    duplicate = await _make_student(client, auth_headers, test_class.id, "Eino Nieminen")
    await _log_attendance(client, auth_headers, test_class.id, "Aino Mäkinen", 2)

    with capture_logs() as lines:
        response = await client.post(
            f"/api/students/{target}/merge",
            json={"duplicate_student_id": duplicate},
            headers=auth_headers,
        )

    assert response.status_code == 200
    line = one_object(lines)
    assert line["event"] == "merge"
    assert "records_moved" in line
    assert line["records_moved"] == 0


@pytest.mark.asyncio
async def test_the_merge_line_names_neither_student(client, auth_headers, test_class):
    """AC-7's second half, and ADR-0007. Ids and counts only.

    Both Students are named right up to the moment of the act -- the target survives the merge
    and the duplicate is destroyed by it -- so this is the line with the most reason to carry a
    name for debuggability, which is exactly the argument ADR-0007 records as rejected.
    """
    target = await _make_student(client, auth_headers, test_class.id, "Sirkka Lehtinen")
    duplicate = await _make_student(client, auth_headers, test_class.id, "Onni Karjalainen")
    await _log_attendance(client, auth_headers, test_class.id, "Onni Karjalainen", 1)

    with capture_logs() as lines:
        await client.post(
            f"/api/students/{target}/merge",
            json={"duplicate_student_id": duplicate},
            headers=auth_headers,
        )

    assert_names_absent(one_object(lines), "Sirkka", "Lehtinen", "Onni", "Karjalainen")


@pytest.mark.asyncio
async def test_a_student_delete_records_how_many_records_it_destroyed(
    client, auth_headers, test_class
):
    """AC-7, the delete half. The count is taken before the cascade takes the rows.

    Two records exist and the cascade destroys both, so the count cannot be read after the
    commit -- there is nothing left to count. A line reporting 0 here means it was.
    """
    student = await _make_student(client, auth_headers, test_class.id, "Väinö Virtanen")
    await _log_attendance(client, auth_headers, test_class.id, "Väinö Virtanen", 2)

    with capture_logs() as lines:
        response = await client.delete(f"/api/students/{student}", headers=auth_headers)

    assert response.status_code == 204
    line = one_object(lines)

    assert line["level"] == "INFO"
    assert line["event"] == "student_delete"
    assert line["records_destroyed"] == 2
    assert line["student_id"] == student
    assert line["class_id"] == str(test_class.id)
    assert line["teacher_id"]
    assert line["request_id"]


@pytest.mark.asyncio
async def test_deleting_a_student_with_no_history_records_a_zero(
    client, auth_headers, test_class
):
    """AC-7. The same falsy-zero trap as the merge, on the other act."""
    student = await _make_student(client, auth_headers, test_class.id, "Väinö Virtanen")

    with capture_logs() as lines:
        response = await client.delete(f"/api/students/{student}", headers=auth_headers)

    assert response.status_code == 204
    line = one_object(lines)
    assert line["event"] == "student_delete"
    assert "records_destroyed" in line
    assert line["records_destroyed"] == 0


@pytest.mark.asyncio
async def test_the_delete_line_names_the_student_by_id_only(
    client, auth_headers, test_class
):
    """AC-7 and US-6: a deleted Student leaves no name behind in the log.

    `CONTEXT.md` treats deletion as complete, and ADR-0007 scopes that honestly -- seven
    `pg_dump` backups still hold the name. What this asserts is the half that is achievable:
    the record of the deletion does not itself become the copy that outlives it.
    """
    student = await _make_student(client, auth_headers, test_class.id, "Sirkka Lehtinen")
    await _log_attendance(client, auth_headers, test_class.id, "Sirkka Lehtinen", 1)

    with capture_logs() as lines:
        await client.delete(f"/api/students/{student}", headers=auth_headers)

    line = one_object(lines)
    assert_names_absent(line, "Sirkka", "Lehtinen")
    assert line["student_id"] == student


@pytest.mark.asyncio
async def test_a_merge_refused_as_self_records_no_act(client, auth_headers, test_class):
    """The control for AC-7: a refusal is not an act, and an unlabelled one is silent.

    Merging a Student with itself is refused before anything moves. It carries no `rule` and no
    `reason` -- it breaks no invariant, it is a mis-click -- so slice 2's opt-in labelling makes
    it silent, and an act line here would be a record of something that never happened.
    """
    student = await _make_student(client, auth_headers, test_class.id, "Aino Mäkinen")
    await _log_attendance(client, auth_headers, test_class.id, "Aino Mäkinen", 2)

    with capture_logs() as lines:
        response = await client.post(
            f"/api/students/{student}/merge",
            json={"duplicate_student_id": student},
            headers=auth_headers,
        )

    assert response.status_code == 400
    assert lines == []


@pytest.mark.asyncio
async def test_a_routine_student_update_is_not_logged(
    client, auth_headers, test_class, test_student
):
    """The control for the fourth event family the Owner DECLINED.

    Spec 0005 puts "logging routine successful writes" out of scope: class and student
    create/update, attendance logged, course credit toggled. This renames a Student -- a
    successful write, carrying a name, on the route most tempting to log -- and asserts silence.
    An implementation that logged every mutation would pass every other test in this section.
    """
    with capture_logs() as lines:
        response = await client.put(
            f"/api/students/{test_student.id}",
            json={"name": "Sirkka Lehtinen"},
            headers=auth_headers,
        )

    assert response.status_code == 200
    assert lines == []


@pytest.mark.asyncio
async def test_a_cross_class_merge_is_refused_and_the_line_names_inv_5(
    client, auth_headers, test_class
):
    """AC-21. `INV-5`: a merge may only combine two Students of the same Class.

    This was the one silent refusal on the wrong side of US-1's narrowing -- an invariant
    violation going unrecorded while a login typo was recorded (spec 0005, scope decision
    2026-09-10). Both Classes belong to the same teacher here, so ownership passes and INV-5
    is genuinely what refuses.

    This label means what the criterion says and nothing wider, which took a fix: the Class
    comparison used to run before the duplicate's ownership check, so a merge reaching into
    another teacher's Class was refused here too and logged as INV-5. The test below is the
    other side of that -- same request shape, `INV-1`, 403.

    `objects(lines, 1)` is also the assertion that no act line was written: the merge did not
    happen, so the denial is the only line the request may produce.
    """
    other_class = await _make_class(client, auth_headers, "Toinen kurssi")
    target = await _make_student(client, auth_headers, test_class.id, "Aino Mäkinen")
    duplicate = await _make_student(client, auth_headers, other_class, "Eino Nieminen")

    with capture_logs() as lines:
        response = await client.post(
            f"/api/students/{target}/merge",
            json={"duplicate_student_id": duplicate},
            headers=auth_headers,
        )

    assert response.status_code == 400
    line = objects(lines, 1)[0]

    assert line["level"] == "WARNING"
    assert line["event"] == "denial"
    assert line["rule"] == "INV-5"
    assert line["reason"] == "cross_class_merge"
    assert line["status"] == 400
    assert line["route"] == f"/api/students/{target}/merge"
    assert line["teacher_id"]
    assert line["request_id"]


@pytest.mark.asyncio
async def test_the_cross_class_refusal_names_neither_student(
    client, auth_headers, test_class
):
    """AC-21's second half. The refusal message names no one, and the line carries no detail.

    `detail` is never logged from any exception (`app/api/handlers.py`), which is what keeps the
    two name-interpolating `BadRequestException` sites silent. This asserts the same property
    from the other direction: the line for a refusal that DOES log is still name-free.
    """
    other_class = await _make_class(client, auth_headers, "Toinen kurssi")
    target = await _make_student(client, auth_headers, test_class.id, "Sirkka Lehtinen")
    duplicate = await _make_student(client, auth_headers, other_class, "Onni Karjalainen")

    with capture_logs() as lines:
        await client.post(
            f"/api/students/{target}/merge",
            json={"duplicate_student_id": duplicate},
            headers=auth_headers,
        )

    assert_names_absent(objects(lines, 1)[0], "Sirkka", "Lehtinen", "Onni", "Karjalainen")


@pytest.mark.asyncio
async def test_another_teachers_student_as_the_duplicate_is_refused_as_inv_1(
    client, auth_headers, other_teacher_headers, test_class
):
    """A merge reaching for another teacher's Student is an INV-1 refusal, and says so.

    Found by slice 4's review and settled by the Owner the same day. `merge_students` used to
    compare the two Classes BEFORE checking ownership of the duplicate's Class, so this request
    was refused with 400 and logged as `rule="INV-5"` -- the refusal held and nothing moved, but
    the record named a rule that was not the one violated, against US-1's "only the app knows
    which *rule* refused an authenticated Teacher".

    The ownership check now runs first. A same-teacher cross-Class merge is still INV-5 (the
    test above); reaching into another teacher's Class is INV-1, at 403, through the one
    enforcement site spec 0003 consolidated.
    """
    her_class = await _make_class(client, other_teacher_headers, "Hänen kurssi")
    her_student = await _make_student(
        client, other_teacher_headers, her_class, "Helena Salo"
    )
    my_target = await _make_student(client, auth_headers, test_class.id, "Aino Mäkinen")

    with capture_logs() as lines:
        response = await client.post(
            f"/api/students/{my_target}/merge",
            json={"duplicate_student_id": her_student},
            headers=auth_headers,
        )

    assert response.status_code == 403
    line = objects(lines, 1)[0]

    assert line["rule"] == "INV-1"
    assert line["status"] == 403
    assert "reason" not in line
    assert_names_absent(line, "Helena", "Salo", "Aino", "Mäkinen")
