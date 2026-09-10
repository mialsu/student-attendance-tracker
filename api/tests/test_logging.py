"""What a reader of the log can conclude, asserted at a real route.

Slices 1 to 3 of `specs/0005-application-logging.md`, each under its own AC heading below:
the formatter, the request context and the generated request id (slice 1); every denial the app
decides (slice 2); and the `ERROR` line that gives an unhandled exception an owner (slice 3).
Serves AC-1, AC-2, AC-3, AC-4, AC-8, AC-9, AC-10, AC-13 and AC-14.

The stance is `tests/test_query_budget.py`'s: attach a handler, exercise the real route, assert on
what came out, detach. Nothing here asserts that a formatter method was called or reaches into the
handler's internals -- every assertion is something a person reading the container log could
conclude. `capture_logs` formats through the REAL formatter, so the JSON shape under test is the
JSON shape production emits.

Why the assertions live on captured records rather than on stdout: the handler writes to stdout in
production, and capturing stdout would also catch uvicorn's two other log shapes, which spec 0005
deliberately leaves alone.
"""

import json
import logging
import traceback
from collections.abc import AsyncGenerator, Awaitable, Callable
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from typing import NoReturn

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.core.logging import (
    DEFAULT_LEVEL,
    LEVEL_VAR,
    LOGGER_NAME,
    JsonLineFormatter,
    resolve_level,
)
from app.main import app
from app.services import attendance_service


@contextmanager
def capture_logs():
    """Capture the FORMATTED lines the app logger emits inside the block.

    Modelled on `count_statements` in tests/test_query_budget.py: attach, yield the accumulator,
    detach in a finally. The real `JsonLineFormatter` is used, so a test asserting on the parsed
    dict is asserting on the bytes production writes.
    """
    logger = logging.getLogger(LOGGER_NAME)
    lines: list[str] = []

    class _Capture(logging.Handler):
        def emit(self, record: logging.LogRecord) -> None:
            lines.append(self.format(record))

    handler = _Capture()
    handler.setFormatter(JsonLineFormatter())

    # The logger's own level gates before any handler sees the record, so a suite running with
    # LOG_LEVEL unset must not silently capture nothing.
    previous_level = logger.level
    logger.setLevel(logging.DEBUG)
    logger.addHandler(handler)
    try:
        yield lines
    finally:
        logger.removeHandler(handler)
        logger.setLevel(previous_level)


def one_object(lines: list[str]) -> dict:
    """Assert the capture holds exactly one line and return it parsed."""
    assert len(lines) == 1, f"expected exactly one line, got {len(lines)}: {lines!r}"
    assert "\n" not in lines[0], f"a single record produced more than one line: {lines[0]!r}"
    return json.loads(lines[0])


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


# --- AC-9: the request id is honoured when supplied and generated when not -------------------


@pytest.mark.asyncio
async def test_supplied_request_id_is_honoured_verbatim(
    client, other_teacher_headers, test_class
):
    """AC-9, first half. nginx's `$request_id` arrives as a header and must survive unchanged."""
    supplied = "0123456789abcdef0123456789abcdef"

    with capture_logs() as lines:
        response = await client.get(
            f"/api/classes/{test_class.id}",
            headers={**other_teacher_headers, "X-Request-ID": supplied},
        )

    assert response.status_code == 403
    assert one_object(lines)["request_id"] == supplied


@pytest.mark.asyncio
async def test_absent_request_id_is_generated_and_differs_per_request(
    client, other_teacher_headers, test_class
):
    """AC-9, second half. With no header the app generates one, and two requests differ.

    Two requests rather than one: a hard-coded constant would satisfy "an id appears".
    """
    ids = []
    for _ in range(2):
        with capture_logs() as lines:
            response = await client.get(
                f"/api/classes/{test_class.id}", headers=other_teacher_headers
            )
        assert response.status_code == 403
        ids.append(one_object(lines)["request_id"])

    assert all(ids), "a generated request id must not be empty"
    assert ids[0] != ids[1], "the generated id is a constant, not per-request"


# --- AC-10: trace_id is absent, not zero-filled, when tracing is off ------------------------


@pytest.mark.asyncio
async def test_trace_id_is_absent_when_tracing_is_off(
    client, other_teacher_headers, test_class
):
    """AC-10. The suite runs with no OTLP endpoint, so no span context is valid.

    The field must be OMITTED rather than zero-filled: an all-zero trace id looks like a trace
    that can be opened in Jaeger and cannot be. This is the testable half of the tracing pair --
    AC-11, the populated case, is `live:` only because OTel's tracer provider is set-once per
    process (the reason test_query_budget.py gives for avoiding OTel entirely).
    """
    with capture_logs() as lines:
        response = await client.get(
            f"/api/classes/{test_class.id}", headers=other_teacher_headers
        )

    assert response.status_code == 403
    line = one_object(lines)
    assert "trace_id" not in line
    assert "00000000000000000000000000000000" not in json.dumps(line)


# --- AC-13: one valid JSON object per line, and no forged second line ------------------------


@pytest.mark.asyncio
async def test_every_emitted_line_is_one_valid_json_object(
    client, other_teacher_headers, test_class
):
    """AC-13, first half, at a real route.

    `one_object` both parses the line and rejects an embedded newline.
    """
    with capture_logs() as lines:
        await client.get(f"/api/classes/{test_class.id}", headers=other_teacher_headers)

    line = one_object(lines)
    assert isinstance(line, dict)


def test_a_newline_in_a_logged_value_cannot_forge_a_second_line():
    """AC-13, second half. `json.dumps` escapes the newline, so the record stays one line.

    Asserted at the formatter because slice 1 logs no attacker-supplied free text: the only
    caller wired here is the INV-1 handler, whose fields are ids and a route. The literal
    criterion -- a login attempt with an embedded newline in the email -- becomes reachable in
    slice 2, when `authenticate_user` gains its call, and AC-13 stays PARTIAL until then.

    An HTTP header cannot transport a raw newline, so `X-Request-ID` is not a route to this
    either. This is the same class of contract test as tests/test_telemetry.py.
    """
    record = logging.LogRecord(
        name=LOGGER_NAME,
        level=logging.WARNING,
        pathname=__file__,
        lineno=1,
        msg="denial",
        args=(),
        exc_info=None,
    )
    record.log_fields = {"attempted_email": "attacker@example.com\n{\"event\": \"forged\"}"}

    formatted = JsonLineFormatter().format(record)

    assert "\n" not in formatted
    assert json.loads(formatted)["attempted_email"].endswith('{"event": "forged"}')


# --- AC-14: LOG_LEVEL is read from the environment, with a default --------------------------


def test_log_level_defaults_when_the_variable_is_unset(monkeypatch):
    """AC-14. Unset is the case every test run and every alembic run exercises.

    `LOG_LEVEL` is read from `os.environ` rather than from `Settings` on purpose: `app/config.py`
    is an import-time singleton that conftest.py constructs, so a new required field would break
    the suite at import. This is telemetry.py's pattern, for ADR-0006's reason.
    """
    monkeypatch.delenv(LEVEL_VAR, raising=False)
    assert resolve_level() == DEFAULT_LEVEL


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("DEBUG", logging.DEBUG),
        ("warning", logging.WARNING),
        ("  ERROR  ", logging.ERROR),
    ],
)
def test_log_level_is_read_from_the_environment(monkeypatch, value, expected):
    """AC-14. Case and surrounding whitespace do not decide whether logging works."""
    monkeypatch.setenv(LEVEL_VAR, value)
    assert resolve_level() == expected


def test_an_unusable_log_level_falls_back_to_the_default(monkeypatch):
    """A typo must not silence the log or crash the app at import."""
    monkeypatch.setenv(LEVEL_VAR, "LOUD")
    assert resolve_level() == DEFAULT_LEVEL


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


def objects(lines: list[str], expected: int) -> list[dict]:
    """Assert the capture holds exactly `expected` lines and return them parsed."""
    assert len(lines) == expected, f"expected {expected} line(s), got {len(lines)}: {lines!r}"
    for line in lines:
        assert "\n" not in line, f"a single record produced more than one line: {line!r}"
    return [json.loads(line) for line in lines]


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


# --- AC-13, second half: attacker-supplied text at a REAL route ------------------------------


@pytest.mark.asyncio
async def test_a_newline_in_a_login_email_produces_no_second_line(client):
    """AC-13's literal criterion, at the route it names.

    It holds by a mechanism the spec did not anticipate: `UserLogin.email` is an `EmailStr`, so
    `email-validator` refuses the address at validation and `authenticate_user` never runs. The
    request is answered 422 and emits NOTHING -- a forged second line is not merely escaped, it
    is unreachable.

    The formatter-level assertion above is still the one that matters, because it is the half
    that survives someone relaxing this schema. Two independent mechanisms, and only one of
    them depends on a decision another file could reverse.
    """
    with capture_logs() as lines:
        response = await client.post(
            "/api/auth/login",
            json={"email": 'attacker@example.com\n{"event": "forged"}', "password": "x"},
        )

    assert response.status_code == 422
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

    captured = json.dumps(objects(lines, 1)[0])
    assert "Ada" not in captured
    assert "Lovelace" not in captured


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


# --- the teacher-id context reset, observable for the first time ------------------------------


@pytest.mark.asyncio
async def test_an_unauthenticated_denial_carries_no_teacher_id_from_an_earlier_request(
    client, auth_headers, test_class, test_user
):
    """The detector `api/REVIEW-DEBT.md` (2026-09-09) said would arrive with slice 2.

    `RequestContextMiddleware` claims and resets `teacher_id_var` even though `get_current_user`
    is what fills it, so that one place owns the reset of every context variable. Slice 1 could
    not observe that: the only event it logged was an `INV-1` denial, which by construction
    always has an authenticated teacher, so removing the reset left the whole suite green.

    Slice 2 logs the first denial with **no** session. A leaked id would name whoever was
    refused before it -- an anonymous line accusing the last teacher to use the app.
    """
    # A real authenticated request first, which sets the variable for its own duration.
    permitted = await client.get(f"/api/classes/{test_class.id}", headers=auth_headers)
    assert permitted.status_code == 200

    # Then a refusal with no session at all. The suite drives the app through httpx's
    # ASGITransport in the TEST's own task, so a value that outlived the first request is
    # still visible here -- which is what makes the leak observable at this seam.
    with capture_logs() as lines:
        response = await client.post(
            "/api/auth/login",
            json={"email": "nobody@example.com", "password": "testpassword123"},
        )

    assert response.status_code == 401
    line = objects(lines, 1)[0]
    assert "teacher_id" not in line, "a teacher id survived into an unauthenticated request"
    assert str(test_user.id) not in json.dumps(line)


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


def _raising(exc: Exception) -> Callable[..., Awaitable[NoReturn]]:
    """A stand-in for a service function that fails, raising the exception given."""

    async def explode(*args: object, **kwargs: object) -> NoReturn:
        raise exc

    return explode


@pytest.fixture
def summary_route(test_class) -> str:
    """The route the AC-8 tests drive.

    An authenticated route whose service call is a plain function to `monkeypatch`, and one that
    is NOT an invariant enforcer -- ownership is verified for real before it is reached, so the
    500 under test is the "authentication and authorization both succeeded, then something
    broke" case US-4 describes.
    """
    return f"/api/classes/{test_class.id}/attendance/summary"


@pytest_asyncio.fixture
async def non_reraising_client(client) -> AsyncGenerator[AsyncClient, None]:
    """The same app, driven so a 500 comes back as a response instead of an exception.

    A SECOND seam, and the spec's *Testing Decisions* names only one -- so it is declared there
    too, as spec delta 8, rather than left as an undeclared extra. It exists because AC-8's two
    halves cannot be observed through one flag: `raise_app_exceptions=True` (the `client`
    fixture, httpx's default) surfaces the exception uvicorn would receive, which is what makes
    the traceback assertion possible and is also what hides the response. This one shows what a
    real caller gets.

    Depends on `client` rather than replacing it, so `app.dependency_overrides[get_db]` is
    already installed and torn down by the fixture that owns it.
    """
    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as caller:
        yield caller


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
