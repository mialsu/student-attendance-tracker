"""Capture what the app logger emitted, and assert on it.

Shared by `test_logging.py` (the formatter and the request context) and
`test_logging_events.py` (the three event families). It lives in its own module rather than in
`conftest.py` because these are a context manager and two assertion helpers, not fixtures --
and rather than in either test file, because a second copy of `capture_logs` is two
implementations of one behaviour waiting to drift.

`count_statements` in `tests/test_query_budget.py` is the shape being followed: attach, yield an
accumulator, detach in a finally.
"""

import json
import logging
from contextlib import contextmanager

from app.core.logging import LOGGER_NAME, JsonLineFormatter


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


def objects(lines: list[str], expected: int) -> list[dict]:
    """Assert the capture holds exactly `expected` lines and return them parsed."""
    assert len(lines) == expected, f"expected {expected} line(s), got {len(lines)}: {lines!r}"
    for line in lines:
        assert "\n" not in line, f"a single record produced more than one line: {line!r}"
    return [json.loads(line) for line in lines]


def assert_names_absent(line: dict, *fragments: str) -> None:
    """Assert no fragment of a person's name appears anywhere in a line.

    ADR-0007's rule, as an assertion: a log line identifies people by opaque id. Checked
    against the SERIALIZED line rather than field by field, so a name arriving in a field
    nobody thought to look at still fails.

    Args:
        line: One parsed log line, from `one_object` or `objects`.
        *fragments: Name parts that must not appear. Pass both halves of a name -- a line
            carrying only the surname is still a line carrying a name.
    """
    captured = json.dumps(line)
    for fragment in fragments:
        assert fragment not in captured, f"{fragment!r} reached the log line: {captured}"
