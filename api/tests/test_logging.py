"""The formatter and the request context: what every line carries, whatever the event.

Spec 0005's machinery, as opposed to its events. The three event families -- denials, errors,
irreversible acts -- are in `tests/test_logging_events.py`; this file is what those lines are
made of. Serves **AC-9, AC-10, AC-13 and AC-14**.

Split out of one file on 2026-09-10, before slice 4, at the seam the spec itself names. The
rule the split follows: **each acceptance criterion is proven in exactly one file**, so
"where is AC-13 proven" has one answer. That is why AC-13's route-level half sits here beside
its formatter-level half rather than beside the login tests it drives.

The stance is `tests/test_query_budget.py`'s and has not changed: attach a handler, exercise the
real route, assert on what came out, detach. Nothing here asserts that a formatter method was
called. `capture_logs` formats through the REAL formatter, so the JSON shape under test is the
JSON shape production emits.
"""

import json
import logging

import pytest

from app.core.logging import (
    DEFAULT_LEVEL,
    LEVEL_VAR,
    LOGGER_NAME,
    JsonLineFormatter,
    resolve_level,
)
from tests.logging_helpers import capture_logs, objects, one_object

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


