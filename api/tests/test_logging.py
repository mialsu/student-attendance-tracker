"""What a reader of the log can conclude, asserted at a real route.

Slice 1 of `specs/0005-application-logging.md`: the formatter, the request context, the generated
request id, and the exception handler wired to `INV-1` only. Serves AC-1, AC-9, AC-10, AC-13 and
AC-14.

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
from contextlib import contextmanager

import pytest

from app.core.logging import (
    DEFAULT_LEVEL,
    LEVEL_VAR,
    LOGGER_NAME,
    JsonLineFormatter,
    resolve_level,
)


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
